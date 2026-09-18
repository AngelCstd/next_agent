'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { getAccessToken } from '../auth/auth';
import type {
  AgentEvent,
  AgentTask,
  ApprovalRequest,
  Conversation,
} from '../contracts';
import { HttpTransport } from '../infrastructure/api/HttpTransport';
import {
  mergeTaskAssistantMessages,
  type ChatMessage,
} from '../view-models/chatMessages';
import {
  createStartGuard,
  createStateRefreshScheduler,
  getStateRefreshKind,
  type StateRefreshScheduler,
} from './stateRefresh';

export type { ChatMessage } from '../view-models/chatMessages';

export function useChatSession() {
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [tasks, setTasks] = useState<AgentTask[]>([]);
  const [approvals, setApprovals] = useState<ApprovalRequest[]>([]);
  const [events, setEvents] = useState<AgentEvent[]>([]);
  const [isInitializing, setIsInitializing] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [submittingApprovalId, setSubmittingApprovalId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sseStatus, setSseStatus] = useState<'disconnected' | 'connecting' | 'connected'>('disconnected');

  const transportRef = useRef<HttpTransport | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const activeConversationIdRef = useRef<string | null>(null);
  const refreshSchedulerRef = useRef<StateRefreshScheduler<string> | null>(null);
  const cleanupTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [startGuard] = useState(createStartGuard);

  const getTransport = useCallback(() => {
    if (!transportRef.current) {
      const baseUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3000';
      transportRef.current = new HttpTransport({ baseUrl });
    }
    return transportRef.current;
  }, []);

  const refreshTasks = useCallback(async (convId: string) => {
    try {
      const transport = getTransport();
      const fetchedTasks = await transport.listTasks(convId);
      setTasks(fetchedTasks);

      setMessages((prev) => mergeTaskAssistantMessages(prev, fetchedTasks));
    } catch {
      // Ignored non-fatal transient refresh error
    }
  }, [getTransport]);

  const refreshApprovals = useCallback(async (convId: string) => {
    try {
      const fetchedApprovals = await getTransport().listApprovals(convId);
      setApprovals(fetchedApprovals);
    } catch {
      // Ignored non-fatal transient refresh error
    }
  }, [getTransport]);

  const refreshState = useCallback(async (convId: string) => {
    await Promise.all([refreshTasks(convId), refreshApprovals(convId)]);
  }, [refreshApprovals, refreshTasks]);

  useEffect(() => {
    const scheduler = createStateRefreshScheduler({
      delayMs: 125,
      refreshTasks,
      refreshApprovals,
    });
    refreshSchedulerRef.current = scheduler;

    return () => {
      scheduler.cancel();
      if (refreshSchedulerRef.current === scheduler) refreshSchedulerRef.current = null;
    };
  }, [refreshApprovals, refreshTasks]);

  const initConversation = useCallback(async () => {
    if (cleanupTimerRef.current) {
      clearTimeout(cleanupTimerRef.current);
      cleanupTimerRef.current = null;
    }
    const token = getAccessToken();
    if (!token) {
      setError('Autenticación requerida.');
      return;
    }

    if (!startGuard.tryStart()) return;

    setIsInitializing(true);
    setError(null);
    const abortController = new AbortController();
    abortControllerRef.current = abortController;
    try {
      const transport = getTransport();
      const conv = await transport.createConversation();
      if (abortController.signal.aborted) return;
      setConversation(conv);
      activeConversationIdRef.current = conv.id;

      // Start SSE Stream
      setSseStatus('connecting');
      void (async () => {
        try {
          const stream = transport.streamEvents(conv.id, {
            signal: abortController.signal,
            onLifecycle: (status) => {
              if (status === 'connected') setSseStatus('connected');
              else if (status === 'connecting' || status === 'reconnecting') setSseStatus('connecting');
            },
          });

          for await (const event of stream) {
            setEvents((prev) => [event, ...prev].slice(0, 50));

            const refreshKind = getStateRefreshKind(event.type);
            if (refreshKind) refreshSchedulerRef.current?.schedule(refreshKind, conv.id);
          }
        } catch {
          if (!abortController.signal.aborted) {
            setSseStatus('disconnected');
          }
        }
      })();

      await refreshState(conv.id);
    } catch (err) {
      if (!abortController.signal.aborted) {
        startGuard.reset();
        abortControllerRef.current = null;
        setError(err instanceof Error ? err.message : 'Error al inicializar la conversación');
      }
    } finally {
      setIsInitializing(false);
    }
  }, [getTransport, refreshState, startGuard]);

  const sendMessage = useCallback(async (content: string) => {
    if (!content.trim() || !conversation) return;

    setIsSending(true);
    setError(null);
    const clientMessageId = typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : 'msg_' + Date.now();

    const userMessage: ChatMessage = {
      id: clientMessageId,
      role: 'user',
      content: content.trim(),
      createdAt: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, userMessage]);

    try {
      const transport = getTransport();
      await transport.sendMessage(conversation.id, {
        content: content.trim(),
        clientMessageId,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al enviar mensaje');
    } finally {
      setIsSending(false);
    }
  }, [conversation, getTransport]);

  const decideApproval = useCallback(async (approvalId: string, decision: 'approve' | 'reject') => {
    if (!conversation) return;

    setSubmittingApprovalId(approvalId);
    setError(null);
    try {
      const transport = getTransport();
      const idempotencyKey = typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : 'idemp_' + Date.now();

      await transport.decideApproval(approvalId, {
        decision,
        idempotencyKey,
      });

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al registrar la decisión');
    } finally {
      setSubmittingApprovalId(null);
    }
  }, [conversation, getTransport]);

  useEffect(() => {
    return () => {
      cleanupTimerRef.current = setTimeout(() => {
        refreshSchedulerRef.current?.cancel();
        abortControllerRef.current?.abort();
        abortControllerRef.current = null;
        activeConversationIdRef.current = null;
        startGuard.reset();
        cleanupTimerRef.current = null;
      }, 0);
    };
  }, [startGuard]);

  return {
    conversation,
    messages,
    tasks,
    approvals,
    events,
    isInitializing,
    isSending,
    submittingApprovalId,
    error,
    sseStatus,
    initConversation,
    sendMessage,
    decideApproval,
    refreshState: () => conversation && refreshState(conversation.id),
  };
}

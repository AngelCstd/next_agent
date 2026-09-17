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
import { projectTaskAssistantContent } from '../view-models/chatProjection';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
  taskId?: string;
  approvalId?: string;
  status?: 'pending' | 'completed' | 'failed';
}

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

  const getTransport = useCallback(() => {
    if (!transportRef.current) {
      const baseUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3000';
      transportRef.current = new HttpTransport({ baseUrl });
    }
    return transportRef.current;
  }, []);

  const refreshState = useCallback(async (convId: string) => {
    try {
      const transport = getTransport();
      const [fetchedTasks, fetchedApprovals] = await Promise.all([
        transport.listTasks(convId),
        transport.listApprovals(convId),
      ]);
      setTasks(fetchedTasks);
      setApprovals(fetchedApprovals);

      setMessages((prev) => {
        const updated = [...prev];
        for (const task of fetchedTasks) {
          const text = projectTaskAssistantContent(task);
          if (!text) continue;

          const existingIdx = updated.findIndex((m) => m.taskId === task.id);
          const taskMsg: ChatMessage = {
            id: `assistant-msg-${task.id}`,
            role: 'assistant',
            content: text,
            createdAt: task.finishedAt || task.createdAt,
            taskId: task.id,
            status: task.status === 'completed' ? 'completed' : 'failed',
          };

          if (existingIdx >= 0) {
            updated[existingIdx] = taskMsg;
          } else {
            updated.push(taskMsg);
          }
        }
        return updated;
      });
    } catch {
      // Ignored non-fatal transient refresh error
    }
  }, [getTransport]);

  const initConversation = useCallback(async () => {
    const token = getAccessToken();
    if (!token) {
      setError('Autenticación requerida.');
      return;
    }

    setIsInitializing(true);
    setError(null);
    try {
      const transport = getTransport();
      const conv = await transport.createConversation();
      setConversation(conv);
      activeConversationIdRef.current = conv.id;

      // Start SSE Stream
      const abortController = new AbortController();
      abortControllerRef.current = abortController;

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

            // Invalidate tasks / approvals on operational events
            if (
              event.type.startsWith('task.') ||
              event.type.startsWith('approval.') ||
              event.type.startsWith('supervisor.')
            ) {
              void refreshState(conv.id);
            }
          }
        } catch {
          if (!abortController.signal.aborted) {
            setSseStatus('disconnected');
          }
        }
      })();

      await refreshState(conv.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al inicializar la conversación');
    } finally {
      setIsInitializing(false);
    }
  }, [getTransport, refreshState]);

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
      // Trigger a refresh of tasks
      await refreshState(conversation.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al enviar mensaje');
    } finally {
      setIsSending(false);
    }
  }, [conversation, getTransport, refreshState]);

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

      await refreshState(conversation.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al registrar la decisión');
    } finally {
      setSubmittingApprovalId(null);
    }
  }, [conversation, getTransport, refreshState]);

  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
    };
  }, []);

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

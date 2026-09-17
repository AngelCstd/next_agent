import type { ISO8601, UUID } from './common';

/**
 * Operational events only. Chain-of-thought, private model reasoning, raw tool
 * arguments, credentials and auth handles must never appear in a payload.
 */
export type AgentEventType =
  | 'conversation.message.received'
  | 'conversation.state.updated'
  | 'supervisor.started'
  | 'supervisor.delegated'
  | 'supervisor.result.received'
  | 'task.created'
  | 'task.queued'
  | 'task.started'
  | 'task.completed'
  | 'task.failed'
  | 'task.cancelled'
  | 'agent.started'
  | 'agent.completed'
  | 'agent.failed'
  | 'tool.called'
  | 'tool.completed'
  | 'approval.requested'
  | 'approval.approved'
  | 'approval.rejected'
  | 'approval.expired'
  | 'approval.superseded';

export interface AgentEvent<TPayload = unknown> {
  id: UUID;
  /** Monotonic per conversation. Drives ordering and Last-Event-ID replay. */
  seq: number;
  type: AgentEventType;
  conversationId: UUID;
  taskId?: UUID;
  agentName?: string;
  /** Propagated outward as the Noktos request id. */
  correlationId: string;
  occurredAt: ISO8601;
  payload: TPayload;
}

/** Payload for tool.called. Redacted: an allowlist preview, never raw args. */
export interface ToolCalledPayload {
  action: string;
  argsPreview: Array<{ label: string; value: string }>;
}

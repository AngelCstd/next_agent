import type { ISO8601, UUID } from './common';

export type TaskStatus =
  | 'queued'
  | 'running'
  | 'awaiting_human_approval'
  | 'completed'
  | 'failed'
  | 'cancelled';

export interface TaskResult {
  kind: string;
  data: unknown;
  /** Safe, human-readable. Never chain-of-thought. */
  summary: string;
}

export type TaskFailureCode =
  | 'TOOL_ERROR'
  | 'UPSTREAM_ERROR'
  | 'TIMEOUT'
  | 'APPROVAL_REJECTED'
  | 'APPROVAL_EXPIRED'
  | 'AUTH_CONTEXT_EXPIRED'
  | 'POLICY_FORBIDDEN'
  | 'CANCELLED';

export interface TaskFailure {
  code: TaskFailureCode;
  /** Sanitized. Never carries upstream internals or credentials. */
  message: string;
}

export interface AgentTask {
  id: UUID;
  conversationId: UUID;
  parentTaskId?: UUID;
  agentName: string;
  /** Operational description of the goal. Never chain-of-thought. */
  goal: string;
  status: TaskStatus;
  /**
   * Opaque handle to a server-side auth context. The Supabase access token is
   * never serialized into a task, an event, a log or the model prompt.
   */
  authContextId: UUID;
  createdAt: ISO8601;
  startedAt?: ISO8601;
  finishedAt?: ISO8601;
  result?: TaskResult;
  failure?: TaskFailure;
  activeApprovalId?: UUID;
}

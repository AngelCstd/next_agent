import type { ISO8601, UUID } from './common';

/**
 * Preferences and notes accumulated for a conversation.
 *
 * pendingUserNotes holds messages that arrived while work was already in
 * flight. V1 never mutates a running job: notes are applied when a result
 * arrives, or through a follow-up task.
 */
export interface ConversationState {
  preferences: Record<string, unknown>;
  pendingUserNotes: string[];
  lastAppliedAt?: ISO8601;
}

export interface Conversation {
  id: UUID;
  /** Supabase subject id. Never a token. */
  userId: string;
  title?: string;
  createdAt: ISO8601;
  updatedAt: ISO8601;
  state: ConversationState;
}

export interface ChatRequest {
  content: string;
  /** Client-generated, used for idempotent message submission. */
  clientMessageId: UUID;
}

/**
 * Returned with HTTP 202. Deliberately carries no final result: delegated work
 * continues asynchronously and reaches the client over the event stream.
 */
export interface ChatResponse {
  messageId: UUID;
  conversationId: UUID;
  accepted: true;
  createdTaskIds: UUID[];
  assistantMessage?: string;
}

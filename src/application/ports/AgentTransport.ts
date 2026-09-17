import type {
  AgentDescriptor,
  AgentEvent,
  AgentTask,
  ApprovalDecision,
  ApprovalRequest,
  ChatRequest,
  ChatResponse,
  Conversation,
} from '../../contracts';

export type StreamLifecycleStatus = 'connecting' | 'connected' | 'reconnecting';

export interface StreamOptions {
  lastEventId?: number;
  signal: AbortSignal;
  onLifecycle?: (status: StreamLifecycleStatus) => void;
}

export interface AgentTransport {
  createConversation(): Promise<Conversation>;
  sendMessage(conversationId: string, req: ChatRequest): Promise<ChatResponse>;
  listTasks(conversationId: string): Promise<AgentTask[]>;
  listApprovals(conversationId: string): Promise<ApprovalRequest[]>;
  decideApproval(
    approvalId: string,
    d: ApprovalDecision,
  ): Promise<ApprovalRequest>;
  listAgents(): Promise<AgentDescriptor[]>;
  streamEvents(
    conversationId: string,
    opts: StreamOptions,
  ): AsyncIterable<AgentEvent>;
}

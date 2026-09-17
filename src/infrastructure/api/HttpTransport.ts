import type { AgentTransport, StreamOptions } from '../../application/ports/AgentTransport';
import { getAccessToken } from '../../auth/auth';
import type {
  AgentDescriptor, AgentTask, ApprovalDecision, ApprovalRequest,
  ChatRequest, ChatResponse, Conversation,
} from '../../contracts';
import { AuthenticationRequiredError, SseClient } from '../sse';
import { HttpTransportError } from './errors';

export interface HttpTransportOptions {
  baseUrl: string;
  fetch?: typeof fetch;
}

type RecordValue = Record<string, unknown>;
type Validator = (value: unknown) => boolean;
const object = (value: unknown): value is RecordValue =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const string: Validator = value => typeof value === 'string';
const strings = (value: RecordValue, keys: string[]) => keys.every(key => string(value[key]));
const optional = (value: RecordValue, key: string, validate: Validator = string) =>
  value[key] === undefined || validate(value[key]);
const array = (validate: Validator): Validator => value => Array.isArray(value) && value.every(validate);
const oneOf = (...values: string[]): Validator => value => typeof value === 'string' && values.includes(value);

const conversation: Validator = value => object(value)
  && strings(value, ['id', 'userId', 'createdAt', 'updatedAt']) && optional(value, 'title')
  && object(value.state) && object(value.state.preferences)
  && array(string)(value.state.pendingUserNotes) && optional(value.state, 'lastAppliedAt');
const chatResponse: Validator = value => object(value)
  && strings(value, ['messageId', 'conversationId']) && value.accepted === true
  && array(string)(value.createdTaskIds) && optional(value, 'assistantMessage');
const task: Validator = value => object(value)
  && strings(value, ['id', 'conversationId', 'agentName', 'goal', 'authContextId', 'createdAt'])
  && oneOf('queued', 'running', 'awaiting_human_approval', 'completed', 'failed', 'cancelled')(value.status)
  && ['parentTaskId', 'startedAt', 'finishedAt', 'activeApprovalId'].every(key => optional(value, key))
  && optional(value, 'result', result => object(result) && strings(result, ['kind', 'summary']) && 'data' in result)
  && optional(value, 'failure', failure => object(failure) && string(failure.message)
    && oneOf('TOOL_ERROR', 'UPSTREAM_ERROR', 'TIMEOUT', 'APPROVAL_REJECTED', 'APPROVAL_EXPIRED',
      'AUTH_CONTEXT_EXPIRED', 'POLICY_FORBIDDEN', 'CANCELLED')(failure.code));
const approval: Validator = value => object(value)
  && strings(value, ['id', 'conversationId', 'taskId', 'action', 'requestedByAgent', 'summary',
    'payloadHash', 'createdAt', 'expiresAt'])
  && typeof value.actionVersion === 'number' && Number.isFinite(value.actionVersion)
  && oneOf('pending', 'approved', 'rejected', 'expired', 'superseded')(value.status)
  && ['resolvedAt', 'resolvedBy', 'rejectionReason'].every(key => optional(value, key))
  && array(field => object(field) && strings(field, ['label', 'value'])
    && optional(field, 'emphasis', oneOf('normal', 'warning')))(value.inputPreview);
const agent: Validator = value => object(value)
  && strings(value, ['name', 'displayName', 'description'])
  && oneOf('supervisor', 'specialist')(value.kind)
  && oneOf('idle', 'busy')(value.status) && array(string)(value.toolNames);

export class HttpTransport implements AgentTransport {
  private readonly baseUrl: string;
  private readonly fetchImplementation: typeof fetch;
  private readonly sse: SseClient;

  constructor(options: HttpTransportOptions) {
    try {
      const url = new URL(options.baseUrl);
      if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password
        || options.baseUrl.includes('?') || options.baseUrl.includes('#')) {
        throw new Error();
      }
      this.baseUrl = url.href.replace(/\/+$/, '');
    } catch {
      throw new HttpTransportError('invalid-configuration');
    }
    // globalThis.fetch is a native method that requires `window`/`globalThis` as its
    // receiver. Storing the bare reference and later invoking it as `this.fetchImplementation(...)`
    // calls it with the HttpTransport instance as receiver, which throws
    // "Illegal invocation" in browsers. Bind it to preserve the correct receiver.
    this.fetchImplementation = options.fetch ?? globalThis.fetch.bind(globalThis);
    this.sse = new SseClient({
      resolveEndpoint: id => this.endpoint('conversations', id, 'events'),
      fetch: this.fetchImplementation,
    });
  }

  createConversation(): Promise<Conversation> {
    return this.request(this.endpoint('conversations'), 'POST', conversation);
  }

  sendMessage(id: string, req: ChatRequest): Promise<ChatResponse> {
    return this.request(this.endpoint('conversations', id, 'messages'), 'POST', chatResponse,
      { content: req.content, clientMessageId: req.clientMessageId });
  }

  listTasks(id: string): Promise<AgentTask[]> {
    return this.request(this.endpoint('conversations', id, 'tasks'), 'GET', array(task));
  }

  listApprovals(id: string): Promise<ApprovalRequest[]> {
    return this.request(this.endpoint('conversations', id, 'approvals'), 'GET', array(approval));
  }

  decideApproval(id: string, decision: ApprovalDecision): Promise<ApprovalRequest> {
    return this.request(this.endpoint('approvals', id, 'decision'), 'POST', approval,
      { decision: decision.decision, idempotencyKey: decision.idempotencyKey });
  }

  listAgents(): Promise<AgentDescriptor[]> {
    return this.request(this.endpoint('agents'), 'GET', array(agent));
  }

  streamEvents(id: string, options: StreamOptions) {
    return this.sse.streamEvents(id, options);
  }

  private endpoint(...segments: string[]): string {
    try {
      // Dot segments are normalized by URL/fetch even when percent-encoded.
      if (segments.some(segment => !segment.trim() || segment === '.' || segment === '..')) {
        throw new Error();
      }
      return `${this.baseUrl}/${segments.map(segment => encodeURIComponent(segment)).join('/')}`;
    } catch {
      throw new HttpTransportError('invalid-request');
    }
  }

  private async request<T>(endpoint: string, method: 'GET' | 'POST', validate: Validator, payload?: unknown): Promise<T> {
    const token = getAccessToken();
    if (!token) throw new AuthenticationRequiredError();
    let body: string | undefined;
    try {
      body = payload === undefined ? undefined : JSON.stringify(payload);
    } catch {
      throw new HttpTransportError('invalid-request');
    }
    let response: Response;
    try {
      const headers = new Headers({ Accept: 'application/json', Authorization: `Bearer ${token}` });
      if (body !== undefined) headers.set('Content-Type', 'application/json');
      response = await this.fetchImplementation(endpoint, {
        method, headers, body, credentials: 'omit', cache: 'no-store', redirect: 'error',
      });
    } catch {
      throw new HttpTransportError('network-failure');
    }
    if (!response.ok) {
      if (response.body) void response.body.cancel().catch(() => undefined);
      if (response.status === 401) throw new AuthenticationRequiredError();
      throw new HttpTransportError('http-failure');
    }
    try {
      const value: unknown = await response.json();
      if (!validate(value)) throw new Error();
      return value as T;
    } catch {
      throw new HttpTransportError('invalid-response');
    }
  }
}

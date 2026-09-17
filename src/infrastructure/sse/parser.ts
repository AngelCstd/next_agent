import type { AgentEvent, AgentEventType } from '../../contracts/events';
import { StreamError } from './errors';

const supportedTypes = {
  'conversation.message.received': true,
  'conversation.state.updated': true,
  'supervisor.started': true,
  'supervisor.delegated': true,
  'supervisor.result.received': true,
  'task.created': true,
  'task.queued': true,
  'task.started': true,
  'task.completed': true,
  'task.failed': true,
  'task.cancelled': true,
  'agent.started': true,
  'agent.completed': true,
  'agent.failed': true,
  'tool.called': true,
  'tool.completed': true,
  'approval.requested': true,
  'approval.approved': true,
  'approval.rejected': true,
  'approval.expired': true,
  'approval.superseded': true,
} satisfies Record<AgentEventType, true>;

function nonempty(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

export function decodeEvent(data: string, conversationId: string): AgentEvent {
  let value: unknown;
  try {
    value = JSON.parse(data);
  } catch {
    throw new StreamError('malformed-event');
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new StreamError('malformed-event');
  }
  const event = value as Record<string, unknown>;
  if (
    !nonempty(event.id) ||
    !Number.isSafeInteger(event.seq) || typeof event.seq !== 'number' || event.seq <= 0 ||
    typeof event.type !== 'string' || !Object.hasOwnProperty.call(supportedTypes, event.type) ||
    !nonempty(event.conversationId) || event.conversationId !== conversationId ||
    !nonempty(event.correlationId) ||
    !nonempty(event.occurredAt) ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/.test(event.occurredAt) ||
    !Number.isFinite(Date.parse(event.occurredAt)) ||
    !Object.hasOwnProperty.call(event, 'payload') ||
    (event.taskId !== undefined && !nonempty(event.taskId)) ||
    (event.agentName !== undefined && !nonempty(event.agentName))
  ) {
    throw new StreamError('malformed-event');
  }
  // Project only the declared envelope. Payload stays opaque.
  return {
    id: event.id,
    seq: event.seq,
    type: event.type as AgentEventType,
    conversationId: event.conversationId,
    correlationId: event.correlationId,
    occurredAt: event.occurredAt,
    payload: event.payload,
    ...(event.taskId !== undefined ? { taskId: event.taskId as string } : {}),
    ...(event.agentName !== undefined ? { agentName: event.agentName as string } : {}),
  };
}

/** One parser per connection; unfinished frames at EOF are discarded for replay. */
export class SseParser {
  private readonly decoder = new TextDecoder('utf-8', { fatal: true });
  private line = '';
  private data: string[] = [];
  private skipLf = false;

  *push(bytes: Uint8Array): Generator<string> {
    let text: string;
    try {
      text = this.decoder.decode(bytes, { stream: true });
    } catch {
      throw new StreamError('malformed-event');
    }
    for (const character of text) {
      if (this.skipLf) {
        this.skipLf = false;
        if (character === '\n') continue;
      }
      if (character !== '\r' && character !== '\n') {
        this.line += character;
        continue;
      }
      this.skipLf = character === '\r';
      const line = this.line;
      this.line = '';
      if (line === '') {
        if (this.data.length) {
          const data = this.data.join('\n');
          this.data = [];
          yield data;
        }
      } else {
        const colon = line.indexOf(':');
        const field = colon < 0 ? line : line.slice(0, colon);
        let value = colon < 0 ? '' : line.slice(colon + 1);
        if (value.startsWith(' ')) value = value.slice(1);
        if (field === 'data') this.data.push(value);
      }
    }
  }
}

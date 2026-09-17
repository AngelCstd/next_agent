import type { StreamLifecycleStatus, StreamOptions } from '../../application/ports/AgentTransport';
export type { StreamOptions } from '../../application/ports/AgentTransport';
import { getAccessToken } from '../../auth/auth';
import type { AgentEvent } from '../../contracts/events';
import { AuthenticationRequiredError, ResynchronizationRequiredError, StreamError } from './errors';
import { decodeEvent, SseParser } from './parser';

export interface SseClientOptions {
  resolveEndpoint: (conversationId: string) => string | URL;
  fetch?: typeof fetch;
}

const cancelled = () => new DOMException('Event stream cancelled', 'AbortError');

function abortable<T>(operation: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const onAbort = () => reject(cancelled());
    if (signal.aborted) onAbort();
    else signal.addEventListener('abort', onAbort, { once: true });
    operation.then(resolve, reject).finally(() => {
      signal.removeEventListener('abort', onAbort);
    });
  });
}

function delay(milliseconds: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const finish = () => {
      clearTimeout(timer);
      signal.removeEventListener('abort', onAbort);
    };
    const onAbort = () => { finish(); reject(cancelled()); };
    const timer = setTimeout(() => { finish(); resolve(); }, milliseconds);
    if (signal.aborted) onAbort();
    else signal.addEventListener('abort', onAbort, { once: true });
  });
}

function discard(body: ReadableStream<Uint8Array> | null): void {
  if (body) void body.cancel().catch(() => undefined);
}

export class SseClient {
  constructor(private readonly options: SseClientOptions) {}

  streamEvents(conversationId: string, options: StreamOptions): AsyncIterable<AgentEvent> {
    return {
      [Symbol.asyncIterator]: () => {
        const controller = new AbortController();
        const onAbort = () => controller.abort();
        if (options.signal.aborted) onAbort();
        else options.signal.addEventListener('abort', onAbort, { once: true });
        const cleanup = () => {
          controller.abort();
          options.signal.removeEventListener('abort', onAbort);
        };
        const iterator = this.consume(conversationId, options.lastEventId, controller.signal, options.onLifecycle);
        return {
          next: async () => {
            try {
              const result = await iterator.next();
              if (result.done) cleanup();
              return result;
            } catch (error) {
              cleanup();
              throw error;
            }
          },
          // Async-generator return alone cannot interrupt a pending next/read.
          return: async () => {
            cleanup();
            return iterator.return();
          },
          throw: async () => {
            cleanup();
            await iterator.return();
            throw cancelled();
          },
        };
      },
    };
  }

  private async *consume(
    conversationId: string,
    lastEventId: number | undefined,
    signal: AbortSignal,
    onLifecycle: StreamOptions['onLifecycle'],
  ): AsyncGenerator<AgentEvent, void, unknown> {
    const report = (status: StreamLifecycleStatus) => {
      if (signal.aborted) return;
      try {
        onLifecycle?.(status);
      } catch {
        // Observers cannot alter connection or retry behavior.
      }
    };
    let cursor = lastEventId ?? 0;
    if (!conversationId.trim() || !Number.isSafeInteger(cursor) || cursor < 0) {
      throw new StreamError('invalid-configuration');
    }
    let retryDelay = 250;
    report('connecting');
    try {
      while (!signal.aborted) {
        let endpoint: string | URL;
        try {
          endpoint = this.options.resolveEndpoint(conversationId);
        } catch {
          throw new StreamError('invalid-configuration');
        }
        const token = getAccessToken();
        if (!token) throw new AuthenticationRequiredError();
        let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
        const release = () => {
          if (!reader) return;
          const active = reader;
          reader = undefined;
          void active.cancel().catch(() => undefined);
          active.releaseLock();
        };
        try {
          const headers = new Headers({ Accept: 'text/event-stream' });
          headers.set('Authorization', `Bearer ${token}`);
          if (cursor > 0) headers.set('Last-Event-ID', String(cursor));
          const pending = (this.options.fetch ?? globalThis.fetch)(endpoint, {
            method: 'GET', headers, signal, credentials: 'omit',
            cache: 'no-store', redirect: 'error',
          });
          // Also dispose of a late response from an injected fetch on cancellation.
          void pending.then(response => {
            if (signal.aborted) discard(response.body);
          }, () => undefined);
          const response = await abortable(pending, signal);
          if (signal.aborted) { discard(response.body); return; }
          if (!response.ok) {
            discard(response.body);
            if (response.status === 401) throw new AuthenticationRequiredError();
            if (response.status !== 408 && response.status !== 429 && response.status < 500) {
              throw new StreamError('http-failure');
            }
          } else {
            if (!response.body || response.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'text/event-stream') {
              discard(response.body);
              throw new StreamError('invalid-response');
            }
            reader = response.body.getReader();
            signal.addEventListener('abort', release, { once: true });
            report('connected');
            const parser = new SseParser();
            while (!signal.aborted && reader) {
              const chunk = await abortable(reader.read(), signal);
              if (signal.aborted || chunk.done) break;
              for (const data of parser.push(chunk.value)) {
                if (signal.aborted) return;
                const event = decodeEvent(data, conversationId);
                if (event.seq <= cursor) continue;
                if (event.seq !== cursor + 1) {
                  throw new ResynchronizationRequiredError(cursor + 1, event.seq);
                }
                cursor = event.seq;
                retryDelay = 250;
                yield event;
              }
            }
          }
        } catch (error) {
          if (signal.aborted) return;
          if (error instanceof StreamError) throw error;
          // Network and reader errors are retryable; their messages stay private.
        } finally {
          signal.removeEventListener('abort', release);
          release();
        }
        report('reconnecting');
        await delay(retryDelay, signal);
        retryDelay = Math.min(retryDelay * 2, 10_000);
      }
    } catch (error) {
      if (signal.aborted) return;
      if (error instanceof StreamError) throw error;
      throw new StreamError('invalid-configuration');
    }
  }
}

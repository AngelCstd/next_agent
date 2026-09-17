export type HttpTransportErrorCode =
  | 'invalid-configuration'
  | 'invalid-request'
  | 'network-failure'
  | 'http-failure'
  | 'invalid-response';

/** Never retain request details, response bodies or underlying exceptions. */
export class HttpTransportError extends Error {
  constructor(public readonly code: HttpTransportErrorCode) {
    super(`HTTP transport: ${code}`);
    this.name = 'HttpTransportError';
  }
}

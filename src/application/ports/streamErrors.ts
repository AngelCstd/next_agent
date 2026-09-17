export type StreamErrorCode =
  | 'authentication-required'
  | 'resynchronization-required'
  | 'malformed-event'
  | 'http-failure'
  | 'invalid-configuration'
  | 'invalid-response';

/** Deliberately excludes underlying exceptions, response bodies and payloads. */
export class StreamError extends Error {
  constructor(public readonly code: StreamErrorCode) {
    super(`Event stream: ${code}`);
    this.name = 'StreamError';
  }
}

export class AuthenticationRequiredError extends StreamError {
  constructor() {
    super('authentication-required');
    this.name = 'AuthenticationRequiredError';
  }
}

export class ResynchronizationRequiredError extends StreamError {
  constructor(
    public readonly expected: number,
    public readonly received: number,
  ) {
    super('resynchronization-required');
    this.name = 'ResynchronizationRequiredError';
  }
}

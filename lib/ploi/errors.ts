/**
 * Error surfaced by the Ploi integration.
 *
 * Carries the HTTP status, the parsed response body, and the endpoint that
 * failed so the UI and job runner can report something actionable without ever
 * exposing the bearer token or raw request headers.
 */
export class PloiError extends Error {
  readonly status: number;
  readonly body: unknown;
  readonly endpoint: string;

  constructor(
    message: string,
    options: { status: number; body: unknown; endpoint: string },
  ) {
    super(message);
    this.name = "PloiError";
    this.status = options.status;
    this.body = options.body;
    this.endpoint = options.endpoint;
  }
}

/**
 * Thrown when the circuit breaker is open because Ploi failed repeatedly.
 * The caller should back off rather than hammering the API.
 */
export class PloiCircuitOpenError extends Error {
  readonly retryAfterMs: number;

  constructor(retryAfterMs: number) {
    super(
      `Ploi circuit breaker is open; retry in ${Math.ceil(
        retryAfterMs / 1000,
      )}s.`,
    );
    this.name = "PloiCircuitOpenError";
    this.retryAfterMs = retryAfterMs;
  }
}

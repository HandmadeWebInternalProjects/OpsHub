/**
 * Throw from a job handler for a failure that retrying cannot fix (bad input,
 * a permanent upstream rejection, a terminal deployment failure). The runner
 * marks the job failed immediately instead of rescheduling it.
 *
 * Signals transient problems (network blips, 5xx) by throwing a normal Error so
 * the runner retries with exponential backoff.
 */
export class JobAbortError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "JobAbortError";
  }
}

import { queryClient } from "@/lib/db";
import { runWorker } from "@/lib/jobs/runner";

/**
 * Standalone job worker entrypoint (`pnpm worker`). Runs the DB-backed queue
 * loop in its own process, separate from the Next.js server.
 */
runWorker()
  .catch((error: unknown) => {
    console.error("Worker failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await queryClient.end({ timeout: 5 });
  });

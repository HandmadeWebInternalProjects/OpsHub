"use client";

import { useState, useTransition } from "react";

import { enqueueAuditSync } from "@/app/actions/settings";
import { Button } from "@/components/ui/button";

/** Queue an immediate pull_audit_logs run; the worker performs the actual pull. */
export function AuditSyncButton() {
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onRun() {
    setError(null);
    setMessage(null);
    startTransition(async () => {
      const result = await enqueueAuditSync();
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setMessage("Audit sync queued — run the worker to process it.");
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <div>
        <Button type="button" onClick={onRun} disabled={pending}>
          {pending ? "Queueing…" : "Sync audit logs now"}
        </Button>
      </div>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      {message ? (
        <p className="text-sm text-muted-foreground">{message}</p>
      ) : null}
    </div>
  );
}

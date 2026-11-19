"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { syncServersNow } from "@/app/actions/servers";
import { Button } from "@/components/ui/button";

export function SyncNowButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function onClick() {
    setError(null);
    setMessage(null);
    startTransition(async () => {
      const result = await syncServersNow();
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setMessage("Sync queued \u2014 the worker will refresh servers shortly.");
      router.refresh();
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button onClick={onClick} disabled={pending}>
        {pending ? "Queuing\u2026" : "Sync now"}
      </Button>
      {error ? (
        <span role="alert" className="text-sm text-destructive">
          {error}
        </span>
      ) : null}
      {message ? (
        <span className="text-sm text-muted-foreground">{message}</span>
      ) : null}
    </div>
  );
}

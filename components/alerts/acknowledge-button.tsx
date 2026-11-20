"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { acknowledgeAlert } from "@/app/actions/alerts";
import { Button } from "@/components/ui/button";

export function AcknowledgeButton({ alertId }: { alertId: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onAcknowledge() {
    setError(null);
    startTransition(async () => {
      const result = await acknowledgeAlert(alertId);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={onAcknowledge}
        disabled={pending}
      >
        {pending ? "Acknowledging…" : "Acknowledge"}
      </Button>
      {error ? (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}

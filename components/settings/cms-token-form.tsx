"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { clearCmsTokenAction, saveCmsToken } from "@/app/actions/settings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function CmsTokenForm({
  projectId,
  cmsType,
  hasToken,
}: {
  projectId: string;
  cmsType: string;
  hasToken: boolean;
}) {
  const router = useRouter();
  const [token, setToken] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onSave() {
    setError(null);
    setMessage(null);
    startTransition(async () => {
      const result = await saveCmsToken({ projectId, token });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setToken("");
      setMessage("Token saved.");
      router.refresh();
    });
  }

  function onClear() {
    setError(null);
    setMessage(null);
    startTransition(async () => {
      const result = await clearCmsTokenAction(projectId);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setToken("");
      setMessage("Token cleared.");
      router.refresh();
    });
  }

  const inputId = `cms-token-${projectId}`;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-end gap-2">
        <div className="flex flex-1 flex-col gap-1">
          <Label htmlFor={inputId}>
            {cmsType === "strapi" ? "Strapi" : "Payload"} audit token{" "}
            <span className="text-muted-foreground">
              ({hasToken ? "set" : "not set"})
            </span>
          </Label>
          <Input
            id={inputId}
            type="password"
            autoComplete="off"
            placeholder={hasToken ? "•••••••• (replace)" : "Paste the token"}
            value={token}
            onChange={(event) => setToken(event.target.value)}
          />
        </div>
        <Button
          type="button"
          onClick={onSave}
          disabled={pending || token.trim().length === 0}
        >
          {pending ? "Saving…" : "Save"}
        </Button>
        {hasToken ? (
          <Button
            type="button"
            variant="outline"
            onClick={onClear}
            disabled={pending}
          >
            Clear
          </Button>
        ) : null}
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

"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { createClient, updateClient } from "@/app/actions/clients";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type ClientFormValues = {
  name: string;
  slug: string;
  contactEmail: string;
  notes: string;
};

export function ClientForm({
  clientId,
  defaultValues,
}: {
  clientId?: string;
  defaultValues?: Partial<ClientFormValues>;
}) {
  const router = useRouter();
  const [values, setValues] = useState<ClientFormValues>({
    name: defaultValues?.name ?? "",
    slug: defaultValues?.slug ?? "",
    contactEmail: defaultValues?.contactEmail ?? "",
    notes: defaultValues?.notes ?? "",
  });
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function update<K extends keyof ClientFormValues>(key: K, value: string) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    startTransition(async () => {
      const result = clientId
        ? await updateClient(clientId, values)
        : await createClient(values);

      if (!result.ok) {
        setError(result.error);
        return;
      }

      router.push(`/clients/${result.data.id}`);
      router.refresh();
    });
  }

  return (
    <form onSubmit={onSubmit} className="flex max-w-xl flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="name">Name</Label>
        <Input
          id="name"
          value={values.name}
          onChange={(event) => update("name", event.target.value)}
          required
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="slug">
          Slug <span className="text-muted-foreground">(optional)</span>
        </Label>
        <Input
          id="slug"
          value={values.slug}
          onChange={(event) => update("slug", event.target.value)}
          placeholder="auto-generated from name"
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="contactEmail">Contact email</Label>
        <Input
          id="contactEmail"
          type="email"
          value={values.contactEmail}
          onChange={(event) => update("contactEmail", event.target.value)}
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="notes">Notes</Label>
        <Textarea
          id="notes"
          rows={4}
          value={values.notes}
          onChange={(event) => update("notes", event.target.value)}
        />
      </div>

      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}

      <div className="flex gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : clientId ? "Save changes" : "Create client"}
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={pending}
          onClick={() => router.back()}
        >
          Cancel
        </Button>
      </div>
    </form>
  );
}

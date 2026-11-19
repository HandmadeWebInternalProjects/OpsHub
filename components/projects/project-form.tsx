"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { createProject, updateProject } from "@/app/actions/projects";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export type ProjectFormValues = {
  clientId: string;
  name: string;
  slug: string;
  domain: string;
  strapiUrl: string;
  astroRepoUrl: string;
  strapiRepoUrl: string;
};

export function ProjectForm({
  clients,
  projectId,
  defaultValues,
}: {
  clients: { id: string; name: string }[];
  projectId?: string;
  defaultValues?: Partial<ProjectFormValues>;
}) {
  const router = useRouter();
  const [values, setValues] = useState<ProjectFormValues>({
    clientId: defaultValues?.clientId ?? "",
    name: defaultValues?.name ?? "",
    slug: defaultValues?.slug ?? "",
    domain: defaultValues?.domain ?? "",
    strapiUrl: defaultValues?.strapiUrl ?? "",
    astroRepoUrl: defaultValues?.astroRepoUrl ?? "",
    strapiRepoUrl: defaultValues?.strapiRepoUrl ?? "",
  });
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function update<K extends keyof ProjectFormValues>(key: K, value: string) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    startTransition(async () => {
      const result = projectId
        ? await updateProject(projectId, values)
        : await createProject(values);

      if (!result.ok) {
        setError(result.error);
        return;
      }

      router.push(`/projects/${result.data.id}`);
      router.refresh();
    });
  }

  return (
    <form onSubmit={onSubmit} className="flex max-w-xl flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="clientId">Client</Label>
        <Select
          value={values.clientId}
          onValueChange={(value) => update("clientId", String(value ?? ""))}
        >
          <SelectTrigger id="clientId" className="w-full">
            <SelectValue placeholder="Select a client" />
          </SelectTrigger>
          <SelectContent>
            {clients.map((client) => (
              <SelectItem key={client.id} value={client.id}>
                {client.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
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
        <Label htmlFor="domain">Domain</Label>
        <Input
          id="domain"
          value={values.domain}
          onChange={(event) => update("domain", event.target.value)}
          placeholder="example.com"
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
        <Label htmlFor="strapiUrl">Strapi URL</Label>
        <Input
          id="strapiUrl"
          value={values.strapiUrl}
          onChange={(event) => update("strapiUrl", event.target.value)}
          placeholder="https://cms.example.com"
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="astroRepoUrl">Astro repo URL</Label>
        <Input
          id="astroRepoUrl"
          value={values.astroRepoUrl}
          onChange={(event) => update("astroRepoUrl", event.target.value)}
          placeholder="https://github.com/org/site"
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="strapiRepoUrl">Strapi repo URL</Label>
        <Input
          id="strapiRepoUrl"
          value={values.strapiRepoUrl}
          onChange={(event) => update("strapiRepoUrl", event.target.value)}
          placeholder="https://github.com/org/cms"
        />
      </div>

      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}

      <div className="flex gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : projectId ? "Save changes" : "Create project"}
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

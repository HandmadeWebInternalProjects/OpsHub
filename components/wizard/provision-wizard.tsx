"use client";

import { useEffect, useState, useTransition } from "react";

import { startProvisioning } from "@/app/actions/provision";
import { createClient } from "@/app/actions/clients";
import {
  listSystemUsers,
  listWebserverTemplates,
  type PloiTemplateOption,
} from "@/app/actions/servers";
import { JobProgress } from "@/components/wizard/job-progress";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export type WizardClient = { id: string; name: string };
export type WizardServer = {
  ploiServerId: number;
  name: string;
  ipAddress: string;
};

type Details = {
  name: string;
  slug: string;
  domain: string;
  cmsType: string;
  cmsUrl: string;
  astroRepoUrl: string;
  cmsRepoUrl: string;
};

type Infra = {
  ploiServerId: string;
  webDirectory: string;
  webserverTemplateId: string;
  systemUser: string;
};

const CMS_ITEMS = [
  { value: "payload", label: "Payload" },
  { value: "strapi", label: "Strapi" },
  { value: "other", label: "Other" },
];

const STEP_LABELS = ["Client", "Project", "Infrastructure", "Review"];

const EMPTY_DETAILS: Details = {
  name: "",
  slug: "",
  domain: "",
  cmsType: "payload",
  cmsUrl: "",
  astroRepoUrl: "",
  cmsRepoUrl: "",
};

const EMPTY_INFRA: Infra = {
  ploiServerId: "",
  webDirectory: "/public",
  webserverTemplateId: "",
  systemUser: "",
};

export function ProvisionWizard({
  clients: initialClients,
  servers,
  defaultClientId,
}: {
  clients: WizardClient[];
  servers: WizardServer[];
  defaultClientId?: string;
}) {
  const [step, setStep] = useState(1);
  const [clients, setClients] = useState(initialClients);
  const [clientId, setClientId] = useState(
    defaultClientId ?? initialClients[0]?.id ?? "",
  );
  const [showNewClient, setShowNewClient] = useState(
    initialClients.length === 0,
  );
  const [newClient, setNewClient] = useState({ name: "", contactEmail: "" });
  const [details, setDetails] = useState<Details>(EMPTY_DETAILS);
  const [infra, setInfra] = useState<Infra>(EMPTY_INFRA);
  const [provisionNewServer, setProvisionNewServer] = useState(false);
  const [templates, setTemplates] = useState<PloiTemplateOption[]>([]);
  const [systemUsers, setSystemUsers] = useState<string[]>([]);
  const [infraLoading, setInfraLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [job, setJob] = useState<{ jobId: string; projectId: string } | null>(
    null,
  );

  // Step 3 pulls the webserver templates (and, once a server is chosen, its
  // system users) from Ploi. Failures are surfaced, never silent.
  useEffect(() => {
    if (step !== 3) return;
    let active = true;
    setInfraLoading(true);

    void (async () => {
      const templateResult = await listWebserverTemplates();
      if (!active) return;
      if (templateResult.ok) setTemplates(templateResult.data);
      else setError(templateResult.error);

      const serverId = Number(infra.ploiServerId);
      if (serverId > 0) {
        const userResult = await listSystemUsers(serverId);
        if (active && userResult.ok) {
          setSystemUsers(userResult.data.map((user) => user.name));
        }
      }
      if (active) setInfraLoading(false);
    })();

    return () => {
      active = false;
    };
  }, [step, infra.ploiServerId]);

  function updateDetails<K extends keyof Details>(key: K, value: string) {
    setDetails((prev) => ({ ...prev, [key]: value }));
  }

  function updateInfra<K extends keyof Infra>(key: K, value: string) {
    setInfra((prev) => ({ ...prev, [key]: value }));
  }

  function createInlineClient() {
    setError(null);
    if (!newClient.name.trim()) {
      setError("Enter the new client's name.");
      return;
    }
    startTransition(async () => {
      const result = await createClient({
        name: newClient.name,
        contactEmail: newClient.contactEmail,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setClients((prev) => [
        ...prev,
        { id: result.data.id, name: newClient.name.trim() },
      ]);
      setClientId(result.data.id);
      setNewClient({ name: "", contactEmail: "" });
      setShowNewClient(false);
    });
  }

  function validateStep(): string | null {
    if (step === 1 && !clientId && !showNewClient) {
      return "Select a client.";
    }
    if (step === 1 && showNewClient && !clientId) {
      return "Create a client before continuing.";
    }
    if (step === 2 && !details.name.trim()) return "Project name is required.";
    if (step === 2 && !details.domain.trim()) return "Domain is required.";
    if (step === 3 && provisionNewServer) {
      return "Auto-provisioning a new server is Phase 2. Provision the Vultr server manually first, then sync it.";
    }
    if (step === 3 && !infra.ploiServerId) return "Select a Ploi server.";
    if (step === 3 && !infra.webDirectory.trim()) {
      return "Web directory is required.";
    }
    return null;
  }

  function goNext() {
    setError(null);
    const problem = validateStep();
    if (problem) {
      setError(problem);
      return;
    }
    setStep((current) => Math.min(current + 1, 4));
  }

  function goBack() {
    setError(null);
    setStep((current) => Math.max(current - 1, 1));
  }

  function confirm() {
    setError(null);
    startTransition(async () => {
      const result = await startProvisioning({
        clientId,
        name: details.name,
        slug: details.slug,
        domain: details.domain,
        cmsType: details.cmsType,
        cmsUrl: details.cmsUrl,
        astroRepoUrl: details.astroRepoUrl,
        cmsRepoUrl: details.cmsRepoUrl,
        ploiServerId: Number(infra.ploiServerId),
        webDirectory: infra.webDirectory,
        webserverTemplateId: infra.webserverTemplateId
          ? Number(infra.webserverTemplateId)
          : null,
        systemUser: infra.systemUser || undefined,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setJob(result.data);
    });
  }

  if (job) {
    return <JobProgress jobId={job.jobId} projectId={job.projectId} />;
  }

  const selectedClient = clients.find((client) => client.id === clientId);
  const selectedServer = servers.find(
    (server) => String(server.ploiServerId) === infra.ploiServerId,
  );
  const selectedTemplate = templates.find(
    (template) => String(template.id) === infra.webserverTemplateId,
  );
  const willDeploy = Boolean(details.astroRepoUrl || details.cmsRepoUrl);

  const clientItems = clients.map((client) => ({
    value: client.id,
    label: client.name,
  }));
  const serverItems = servers.map((server) => ({
    value: String(server.ploiServerId),
    label: `${server.name} (${server.ipAddress || "no IP"})`,
  }));
  const templateItems = templates.map((template) => ({
    value: String(template.id),
    label: template.label,
  }));
  const systemUserItems = systemUsers.map((name) => ({
    value: name,
    label: name,
  }));

  return (
    <div className="flex max-w-xl flex-col gap-6">
      <ol className="flex flex-wrap items-center gap-2 text-sm">
        {STEP_LABELS.map((label, index) => {
          const number = index + 1;
          const active = number === step;
          const done = number < step;
          return (
            <li key={label} className="flex items-center gap-2">
              <span
                className={
                  active
                    ? "flex size-5 items-center justify-center rounded-full bg-primary text-[10px] text-primary-foreground"
                    : done
                      ? "flex size-5 items-center justify-center rounded-full border border-primary text-[10px] text-primary"
                      : "flex size-5 items-center justify-center rounded-full border border-muted-foreground/40 text-[10px] text-muted-foreground"
                }
              >
                {done ? "✓" : number}
              </span>
              <span
                className={active ? "font-medium" : "text-muted-foreground"}
              >
                {label}
              </span>
              {number < STEP_LABELS.length ? (
                <span aria-hidden className="text-muted-foreground/40">
                  —
                </span>
              ) : null}
            </li>
          );
        })}
      </ol>

      <Card>
        <CardHeader>
          <CardTitle>{STEP_LABELS[step - 1]}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {step === 1 ? (
            <>
              {clients.length > 0 && !showNewClient ? (
                <div className="flex flex-col gap-2">
                  <Label htmlFor="clientId">Client</Label>
                  <Select
                    items={clientItems}
                    value={clientId}
                    onValueChange={(value) => setClientId(String(value ?? ""))}
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
              ) : null}

              {showNewClient ? (
                <div className="flex flex-col gap-3">
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="newClientName">New client name</Label>
                    <Input
                      id="newClientName"
                      value={newClient.name}
                      onChange={(event) =>
                        setNewClient((prev) => ({
                          ...prev,
                          name: event.target.value,
                        }))
                      }
                    />
                  </div>
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="newClientEmail">
                      Contact email{" "}
                      <span className="text-muted-foreground">(optional)</span>
                    </Label>
                    <Input
                      id="newClientEmail"
                      type="email"
                      value={newClient.contactEmail}
                      onChange={(event) =>
                        setNewClient((prev) => ({
                          ...prev,
                          contactEmail: event.target.value,
                        }))
                      }
                    />
                  </div>
                  <div>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={createInlineClient}
                      disabled={pending}
                    >
                      {pending ? "Creating…" : "Create client"}
                    </Button>
                  </div>
                </div>
              ) : null}

              {clients.length > 0 ? (
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="size-4 rounded border-input"
                    checked={showNewClient}
                    onChange={(event) => {
                      setShowNewClient(event.target.checked);
                      if (event.target.checked) setClientId("");
                    }}
                  />
                  Create a new client instead
                </label>
              ) : null}
            </>
          ) : null}

          {step === 2 ? (
            <>
              <div className="flex flex-col gap-2">
                <Label htmlFor="name">Project name</Label>
                <Input
                  id="name"
                  value={details.name}
                  onChange={(event) =>
                    updateDetails("name", event.target.value)
                  }
                  required
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="domain">Domain</Label>
                <Input
                  id="domain"
                  value={details.domain}
                  onChange={(event) =>
                    updateDetails("domain", event.target.value)
                  }
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
                  value={details.slug}
                  onChange={(event) =>
                    updateDetails("slug", event.target.value)
                  }
                  placeholder="auto-generated from name"
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="cmsType">CMS</Label>
                <Select
                  items={CMS_ITEMS}
                  value={details.cmsType}
                  onValueChange={(value) =>
                    updateDetails("cmsType", String(value ?? "payload"))
                  }
                >
                  <SelectTrigger id="cmsType" className="w-full">
                    <SelectValue placeholder="Select a CMS" />
                  </SelectTrigger>
                  <SelectContent>
                    {CMS_ITEMS.map((item) => (
                      <SelectItem key={item.value} value={item.value}>
                        {item.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="cmsUrl">
                  CMS URL{" "}
                  <span className="text-muted-foreground">(optional)</span>
                </Label>
                <Input
                  id="cmsUrl"
                  value={details.cmsUrl}
                  onChange={(event) =>
                    updateDetails("cmsUrl", event.target.value)
                  }
                  placeholder="https://cms.example.com"
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="astroRepoUrl">
                  Astro repo URL{" "}
                  <span className="text-muted-foreground">(optional)</span>
                </Label>
                <Input
                  id="astroRepoUrl"
                  value={details.astroRepoUrl}
                  onChange={(event) =>
                    updateDetails("astroRepoUrl", event.target.value)
                  }
                  placeholder="https://github.com/org/site"
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="cmsRepoUrl">
                  CMS repo URL{" "}
                  <span className="text-muted-foreground">(optional)</span>
                </Label>
                <Input
                  id="cmsRepoUrl"
                  value={details.cmsRepoUrl}
                  onChange={(event) =>
                    updateDetails("cmsRepoUrl", event.target.value)
                  }
                  placeholder="https://github.com/org/cms"
                />
              </div>
            </>
          ) : null}

          {step === 3 ? (
            <>
              <div className="flex flex-col gap-2">
                <Label htmlFor="ploiServerId">Ploi server</Label>
                <Select
                  items={serverItems}
                  value={infra.ploiServerId}
                  onValueChange={(value) =>
                    updateInfra("ploiServerId", String(value ?? ""))
                  }
                >
                  <SelectTrigger id="ploiServerId" className="w-full">
                    <SelectValue placeholder="Select a server" />
                  </SelectTrigger>
                  <SelectContent>
                    {servers.map((server) => (
                      <SelectItem
                        key={server.ploiServerId}
                        value={String(server.ploiServerId)}
                      >
                        {server.name} ({server.ipAddress || "no IP"})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {servers.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    No servers cached yet. Run “Sync now” on the Servers page.
                  </p>
                ) : null}
              </div>

              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className="size-4 rounded border-input"
                  checked={provisionNewServer}
                  onChange={(event) =>
                    setProvisionNewServer(event.target.checked)
                  }
                />
                Provision a new server
              </label>
              {provisionNewServer ? (
                <p className="text-xs text-muted-foreground">
                  Auto-provisioning is Phase 2. Provision the Vultr server
                  manually, sync it on the Servers page, then pick it here.
                </p>
              ) : null}

              <div className="flex flex-col gap-2">
                <Label htmlFor="webDirectory">Web directory</Label>
                <Input
                  id="webDirectory"
                  value={infra.webDirectory}
                  onChange={(event) =>
                    updateInfra("webDirectory", event.target.value)
                  }
                  placeholder="/public"
                />
              </div>

              <div className="flex flex-col gap-2">
                <Label htmlFor="webserverTemplateId">
                  Webserver template{" "}
                  <span className="text-muted-foreground">(optional)</span>
                </Label>
                <Select
                  items={templateItems}
                  value={infra.webserverTemplateId}
                  onValueChange={(value) =>
                    updateInfra("webserverTemplateId", String(value ?? ""))
                  }
                  disabled={templates.length === 0}
                >
                  <SelectTrigger id="webserverTemplateId" className="w-full">
                    <SelectValue
                      placeholder={infraLoading ? "Loading…" : "Ploi default"}
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {templates.map((template) => (
                      <SelectItem key={template.id} value={String(template.id)}>
                        {template.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex flex-col gap-2">
                <Label htmlFor="systemUser">
                  System user{" "}
                  <span className="text-muted-foreground">(optional)</span>
                </Label>
                <Select
                  items={systemUserItems}
                  value={infra.systemUser}
                  onValueChange={(value) =>
                    updateInfra("systemUser", String(value ?? ""))
                  }
                  disabled={systemUsers.length === 0}
                >
                  <SelectTrigger id="systemUser" className="w-full">
                    <SelectValue placeholder="Server default" />
                  </SelectTrigger>
                  <SelectContent>
                    {systemUsers.map((name) => (
                      <SelectItem key={name} value={name}>
                        {name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </>
          ) : null}

          {step === 4 ? (
            <div className="flex flex-col">
              <ReviewRow label="Client" value={selectedClient?.name ?? "—"} />
              <ReviewRow label="Project" value={details.name || "—"} />
              <ReviewRow label="Domain" value={details.domain || "—"} />
              <ReviewRow label="CMS" value={details.cmsType} />
              <ReviewRow label="CMS URL" value={details.cmsUrl || "—"} />
              <ReviewRow
                label="Astro repo"
                value={details.astroRepoUrl || "—"}
              />
              <ReviewRow label="CMS repo" value={details.cmsRepoUrl || "—"} />
              <ReviewRow
                label="Server"
                value={
                  selectedServer
                    ? `${selectedServer.name} (${selectedServer.ipAddress || "no IP"})`
                    : "—"
                }
              />
              <ReviewRow label="Web directory" value={infra.webDirectory} />
              <ReviewRow
                label="Webserver template"
                value={selectedTemplate?.label ?? "Ploi default"}
              />
              <ReviewRow
                label="System user"
                value={infra.systemUser || "Server default"}
              />
              <p className="mt-3 text-xs text-muted-foreground">
                {willDeploy
                  ? "A deploy is triggered once the site is created. Ploi only deploys sites with a repository attached; if none is attached the project is marked live without a deploy."
                  : "No repository configured, so no deploy is triggered — the site is created and marked live once active."}
              </p>
            </div>
          ) : null}

          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}

          <div className="flex gap-2">
            {step > 1 ? (
              <Button
                type="button"
                variant="outline"
                onClick={goBack}
                disabled={pending}
              >
                Back
              </Button>
            ) : null}
            {step < 4 ? (
              <Button type="button" onClick={goNext} disabled={pending}>
                Next
              </Button>
            ) : (
              <Button type="button" onClick={confirm} disabled={pending}>
                {pending ? "Queuing…" : "Confirm & provision"}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b py-2 last:border-b-0">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="truncate text-sm font-medium">{value}</span>
    </div>
  );
}

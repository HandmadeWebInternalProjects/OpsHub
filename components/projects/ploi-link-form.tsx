"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { linkProjectInfrastructure } from "@/app/actions/projects";
import { listServerSites } from "@/app/actions/servers";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type ServerOption = {
  ploiServerId: number;
  name: string;
  ipAddress: string;
};

type SiteOption = { id: number; domain: string };

const NONE = "none";

export function PloiLinkForm({
  projectId,
  servers,
  defaultServerId,
  defaultSiteId,
}: {
  projectId: string;
  servers: ServerOption[];
  defaultServerId: number | null;
  defaultSiteId: number | null;
}) {
  const router = useRouter();
  const [serverId, setServerId] = useState(
    defaultServerId ? String(defaultServerId) : NONE,
  );
  const [siteId, setSiteId] = useState(
    defaultSiteId ? String(defaultSiteId) : NONE,
  );
  const [sites, setSites] = useState<SiteOption[]>([]);
  const [loadingSites, setLoadingSites] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (serverId === NONE) {
      setSites([]);
      return;
    }

    let active = true;
    setLoadingSites(true);
    listServerSites(Number(serverId)).then((result) => {
      if (!active) return;
      setLoadingSites(false);
      if (!result.ok) {
        setError(result.error);
        setSites([]);
        return;
      }
      setError(null);
      setSites(result.data);
    });

    return () => {
      active = false;
    };
  }, [serverId]);

  function onServerChange(value: string) {
    setServerId(value);
    setSiteId(NONE);
    setError(null);
    setMessage(null);
  }

  function onSave() {
    setError(null);
    setMessage(null);
    startTransition(async () => {
      const result = await linkProjectInfrastructure(projectId, {
        ploiServerId: serverId === NONE ? null : Number(serverId),
        ploiSiteId: siteId === NONE ? null : Number(siteId),
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setMessage("Saved.");
      router.refresh();
    });
  }

  if (servers.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No Ploi servers cached yet. Run “Sync now” on the Servers page first.
      </p>
    );
  }

  const serverItems = [
    { value: NONE, label: "None" },
    ...servers.map((server) => ({
      value: String(server.ploiServerId),
      label: `${server.name} (${server.ipAddress})`,
    })),
  ];

  const siteItems = [
    { value: NONE, label: "None" },
    ...sites.map((site) => ({
      value: String(site.id),
      label: site.domain,
    })),
  ];

  return (
    <div className="flex max-w-xl flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label>Ploi server</Label>
        <Select
          items={serverItems}
          value={serverId}
          onValueChange={(value) => onServerChange(String(value ?? NONE))}
        >
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Select a server" />
          </SelectTrigger>
          <SelectContent>
            {serverItems.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-col gap-2">
        <Label>Ploi site</Label>
        <Select
          items={siteItems}
          value={siteId}
          disabled={serverId === NONE || loadingSites}
          onValueChange={(value) => setSiteId(String(value ?? NONE))}
        >
          <SelectTrigger className="w-full">
            <SelectValue
              placeholder={loadingSites ? "Loading…" : "Select a site"}
            />
          </SelectTrigger>
          <SelectContent>
            {siteItems.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      {message ? (
        <p className="text-sm text-muted-foreground">{message}</p>
      ) : null}

      <div>
        <Button onClick={onSave} disabled={pending}>
          {pending ? "Saving…" : "Save link"}
        </Button>
      </div>
    </div>
  );
}

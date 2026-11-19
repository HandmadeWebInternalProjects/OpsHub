import { Badge } from "@/components/ui/badge";

const VARIANTS: Record<
  string,
  "default" | "secondary" | "outline" | "destructive"
> = {
  active: "default",
  live: "default",
  draft: "secondary",
  paused: "secondary",
  provisioning: "secondary",
  deploying: "secondary",
  failed: "destructive",
  archived: "outline",
};

const LABELS: Record<string, string> = {
  active: "Active",
  paused: "Paused",
  archived: "Archived",
  draft: "Draft",
  provisioning: "Provisioning",
  deploying: "Deploying",
  live: "Live",
  failed: "Failed",
};

export function StatusBadge({ status }: { status: string }) {
  return (
    <Badge variant={VARIANTS[status] ?? "outline"}>
      {LABELS[status] ?? status}
    </Badge>
  );
}

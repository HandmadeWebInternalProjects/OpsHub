"use client";

import { usePathname, useRouter } from "next/navigation";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const ALL_RULES = "all";
export const FLEET_WIDE = "fleet";

/** Filter the rules list by scope (all / fleet-wide / one project). */
export function AlertRulesFilter({
  projects,
  value,
}: {
  projects: { id: string; name: string }[];
  value: string;
}) {
  const router = useRouter();
  const pathname = usePathname();

  const items = [
    { value: ALL_RULES, label: "All rules" },
    { value: FLEET_WIDE, label: "Fleet-wide" },
    ...projects.map((project) => ({
      value: project.id,
      label: project.name,
    })),
  ];

  return (
    <Select
      items={items}
      value={value}
      onValueChange={(next) =>
        router.push(`${pathname}?project=${String(next ?? ALL_RULES)}`)
      }
    >
      <SelectTrigger className="w-56" aria-label="Filter rules">
        <SelectValue placeholder="Filter rules" />
      </SelectTrigger>
      <SelectContent>
        {items.map((item) => (
          <SelectItem key={item.value} value={item.value}>
            {item.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

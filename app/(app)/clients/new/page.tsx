import Link from "next/link";

import { ClientForm } from "@/components/clients/client-form";

export default function NewClientPage() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <Link
          href="/clients"
          className="text-sm text-muted-foreground hover:underline"
        >
          ← Clients
        </Link>
        <h1 className="text-2xl font-semibold">New client</h1>
      </div>
      <ClientForm />
    </div>
  );
}

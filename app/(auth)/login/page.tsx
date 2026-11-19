import { Suspense } from "react";
import { redirect } from "next/navigation";

import { LoginForm } from "@/components/login-form";
import { auth } from "@/lib/auth";

export default async function LoginPage() {
  const session = await auth();

  if (session?.user) {
    redirect("/dashboard");
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-sm rounded-xl bg-card p-8 text-card-foreground ring-1 ring-foreground/10">
        <div className="mb-6 flex flex-col gap-1">
          <h1 className="text-xl font-semibold">Sign in to OpsHub</h1>
          <p className="text-sm text-muted-foreground">
            Internal operations platform
          </p>
        </div>
        <Suspense fallback={null}>
          <LoginForm />
        </Suspense>
      </div>
    </div>
  );
}

"use client";
import { useEffect } from "react";
import { AlertTriangle } from "lucide-react";
import { captureError } from "@/lib/monitoring";
import { Button } from "@/components/ui/Button";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    captureError(error, { boundary: "app/error", digest: error.digest });
  }, [error]);

  return (
    <main className="grid min-h-[60vh] place-items-center px-4">
      <div className="card max-w-md p-8 text-center">
        <AlertTriangle className="mx-auto h-10 w-10 text-amber-500" />
        <h1 className="mt-3 text-xl font-semibold">Something went wrong</h1>
        <p className="mt-2 text-sm muted">
          {error.message || "An unexpected error occurred. The issue has been logged."}
        </p>
        <Button className="mt-5" onClick={reset}>
          Try again
        </Button>
      </div>
    </main>
  );
}

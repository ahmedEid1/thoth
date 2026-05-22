"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export function RefreshTick({ run }: { run: { status: string } }) {
  const router = useRouter();
  useEffect(() => {
    const terminal = ["COMPLETED", "REJECTED", "FAILED"];
    if (terminal.includes(run.status)) return;
    const t = setInterval(() => router.refresh(), 2000);
    return () => clearInterval(t);
  }, [run.status, router]);
  return null;
}

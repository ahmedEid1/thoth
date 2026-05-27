"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

const MAX_BYTES = 25 * 1024 * 1024; // mirrors app/api/corpus/upload/route.ts

export function UploadButton({ projectId }: { projectId: string }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);

    // Client-side size pre-check — saves the upload round-trip + matches the
    // server's 413 boundary so the user gets immediate feedback on a too-big PDF.
    if (file.size > MAX_BYTES) {
      setError(`File is too large (${Math.round(file.size / 1024 / 1024)} MB). The limit is 25 MB.`);
      // Reset the input so the same file can be reselected after the user trims it.
      e.target.value = "";
      return;
    }

    setBusy(true);
    try {
      const fd = new FormData();
      fd.set("projectId", projectId);
      fd.set("file", file);
      const res = await fetch("/api/corpus/upload", { method: "POST", body: fd });
      if (res.ok) {
        router.refresh();
        return;
      }
      // Map known status codes to user-facing messages; everything else falls
      // through to a generic line so we never crash on an unexpected body.
      switch (res.status) {
        case 401:
          setError("Your session expired. Please sign in again.");
          break;
        case 404:
          setError("Project not found.");
          break;
        case 413:
          setError("File is too large. The limit is 25 MB.");
          break;
        case 415:
          setError("Only PDF files are supported.");
          break;
        default:
          setError(`Upload failed (HTTP ${res.status}). Try again or refresh the page.`);
      }
    } catch {
      setError("Could not reach the server. Check your connection.");
    } finally {
      setBusy(false);
      // Always reset the input so re-picking the same file fires onChange again.
      e.target.value = "";
    }
  }

  return (
    <div className="flex flex-col items-start gap-2">
      <input ref={inputRef} type="file" accept="application/pdf" hidden onChange={onPick} />
      <Button onClick={() => inputRef.current?.click()} disabled={busy}>
        {busy ? "Uploading…" : "Upload PDF"}
      </Button>
      {error && (
        <p
          role="alert"
          aria-live="polite"
          className="text-xs text-[var(--thoth-warn)] leading-snug"
        >
          {error}
        </p>
      )}
    </div>
  );
}

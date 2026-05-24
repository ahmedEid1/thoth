import { describe, it, expect, beforeAll } from "vitest";
import { randomUUID } from "node:crypto";
import "dotenv/config";

describe("object-store (integration)", () => {
  beforeAll(async () => {
    const endpoint = process.env.S3_ENDPOINT ?? "http://localhost:9010";
    const res = await fetch(`${endpoint}/minio/health/live`).catch(() => null);
    if (!res?.ok) {
      throw new Error(`MinIO not reachable at ${endpoint} — run \`docker compose up -d\``);
    }
  });

  it("puts and fetches an object", async () => {
    const { putObject, getObjectBytes } = await import("@/lib/object-store");
    const key = `test/${randomUUID()}.txt`;
    const bytes = new TextEncoder().encode("hello thoth");

    await putObject(key, bytes, "text/plain");
    const fetched = await getObjectBytes(key);

    expect(new TextDecoder().decode(fetched)).toBe("hello thoth");
  });

  it("returns a presigned GET URL", async () => {
    const { putObject, getSignedGetUrl } = await import("@/lib/object-store");
    const key = `test/${randomUUID()}.bin`;
    await putObject(key, new Uint8Array([1, 2, 3]), "application/octet-stream");

    const url = await getSignedGetUrl(key, 60);
    const expectedPrefix = (process.env.S3_ENDPOINT ?? "http://localhost:9010") + "/thoth-corpus/";
    expect(url.startsWith(expectedPrefix)).toBe(true);

    const res = await fetch(url);
    expect(res.status).toBe(200);
    const buf = new Uint8Array(await res.arrayBuffer());
    expect(Array.from(buf)).toEqual([1, 2, 3]);
  });
});

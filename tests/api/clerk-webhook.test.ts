import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// Mock the Clerk verifier to bypass signature checks in unit tests.
vi.mock("@clerk/nextjs/webhooks", () => ({
  verifyWebhook: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    user: {
      upsert: vi.fn().mockResolvedValue({ id: "u1" }),
      delete: vi.fn().mockResolvedValue({ id: "u1" }),
    },
  },
}));

import { verifyWebhook } from "@clerk/nextjs/webhooks";
import { db } from "@/lib/db";

const buildReq = () =>
  new NextRequest("http://localhost/api/webhooks/clerk", {
    method: "POST",
    body: JSON.stringify({}),
  });

describe("POST /api/webhooks/clerk", () => {
  beforeEach(() => vi.clearAllMocks());

  it("upserts a user on user.created", async () => {
    vi.mocked(verifyWebhook).mockResolvedValue({
      type: "user.created",
      data: {
        id: "user_abc",
        email_addresses: [{ email_address: "a@b.com", id: "e1" }],
        primary_email_address_id: "e1",
      },
    } as unknown as Awaited<ReturnType<typeof verifyWebhook>>);

    const { POST } = await import("@/app/api/webhooks/clerk/route");
    const res = await POST(buildReq());

    expect(res.status).toBe(200);
    expect(db.user.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { clerkId: "user_abc" },
        create: expect.objectContaining({ clerkId: "user_abc", email: "a@b.com" }),
      }),
    );
  });

  it("returns 400 on verification failure", async () => {
    vi.mocked(verifyWebhook).mockRejectedValue(new Error("bad signature"));

    const { POST } = await import("@/app/api/webhooks/clerk/route");
    const res = await POST(buildReq());

    expect(res.status).toBe(400);
  });
});

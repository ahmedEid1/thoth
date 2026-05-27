import { describe, it, expect } from "vitest";
import { isSafeExternalUrl } from "@/lib/agent/nodes/fetcher";

describe("isSafeExternalUrl (SSRF defense for the V2 fetcher)", () => {
  it("accepts well-formed public HTTPS URLs", () => {
    expect(isSafeExternalUrl("https://arxiv.org/pdf/2310.06770")).toBe(true);
    expect(isSafeExternalUrl("https://api.openalex.org/works/W123")).toBe(true);
    expect(isSafeExternalUrl("https://example.com/paper.pdf")).toBe(true);
  });

  it("accepts public HTTP URLs (some publisher CDNs still serve over plain http)", () => {
    expect(isSafeExternalUrl("http://example.com/paper.pdf")).toBe(true);
  });

  it("rejects non-HTTP(S) schemes (file://, ftp://, gopher://, javascript:)", () => {
    expect(isSafeExternalUrl("file:///etc/passwd")).toBe(false);
    expect(isSafeExternalUrl("ftp://example.com/x.pdf")).toBe(false);
    expect(isSafeExternalUrl("gopher://example.com/")).toBe(false);
    expect(isSafeExternalUrl("javascript:alert(1)")).toBe(false);
  });

  it("rejects localhost + loopback", () => {
    expect(isSafeExternalUrl("http://localhost/x.pdf")).toBe(false);
    expect(isSafeExternalUrl("http://127.0.0.1/x.pdf")).toBe(false);
    expect(isSafeExternalUrl("http://127.42.99.1/x.pdf")).toBe(false);
    expect(isSafeExternalUrl("http://[::1]/x.pdf")).toBe(false);
  });

  it("rejects link-local + cloud metadata (169.254.x.x)", () => {
    // AWS metadata endpoint — would leak IAM credentials if accessible.
    expect(isSafeExternalUrl("http://169.254.169.254/latest/meta-data/")).toBe(false);
    expect(isSafeExternalUrl("http://169.254.1.1/")).toBe(false);
  });

  it("rejects RFC 1918 private subnets (10/8, 172.16-31/12, 192.168/16)", () => {
    expect(isSafeExternalUrl("http://10.0.0.1/x")).toBe(false);
    expect(isSafeExternalUrl("http://10.255.255.255/x")).toBe(false);
    expect(isSafeExternalUrl("http://172.16.0.1/x")).toBe(false);
    expect(isSafeExternalUrl("http://172.31.255.255/x")).toBe(false);
    expect(isSafeExternalUrl("http://192.168.1.1/x")).toBe(false);
  });

  it("does NOT reject IPs adjacent to RFC 1918 ranges (172.15/8, 172.32/8)", () => {
    // 172.15.x.x and 172.32.x.x are NOT private — must be allowed.
    expect(isSafeExternalUrl("http://172.15.0.1/x")).toBe(true);
    expect(isSafeExternalUrl("http://172.32.0.1/x")).toBe(true);
  });

  it("rejects the 0.0.0.0 wildcard", () => {
    expect(isSafeExternalUrl("http://0.0.0.0/x")).toBe(false);
  });

  it("rejects malformed URL inputs", () => {
    expect(isSafeExternalUrl("not a url at all")).toBe(false);
    expect(isSafeExternalUrl("")).toBe(false);
  });
});

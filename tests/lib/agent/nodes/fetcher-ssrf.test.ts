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

  // --- M110: alternate IP encodings that inet_aton resolves to internal
  // addresses but a naive dotted-quad check would miss. ---

  it("rejects bare-decimal IPv4 encodings (2130706433 == 127.0.0.1)", () => {
    expect(isSafeExternalUrl("http://2130706433/x")).toBe(false); // 127.0.0.1
    expect(isSafeExternalUrl("http://3232235521/x")).toBe(false); // 192.168.0.1
    expect(isSafeExternalUrl("http://2852039166/x")).toBe(false); // 169.254.169.254
  });

  it("rejects hex IPv4 encodings (0x7f000001 == 127.0.0.1)", () => {
    expect(isSafeExternalUrl("http://0x7f000001/x")).toBe(false);
    expect(isSafeExternalUrl("http://0x7f.0.0.1/x")).toBe(false);
  });

  it("rejects octal-octet IPv4 encodings that map to internal addresses", () => {
    expect(isSafeExternalUrl("http://0177.0.0.1/x")).toBe(false); // 0177 octal = 127 → loopback
    expect(isSafeExternalUrl("http://012.0.0.1/x")).toBe(false); // 012 octal = 10 → RFC1918
  });

  it("allows octal/decimal encodings that map to PUBLIC addresses (not over-blocking)", () => {
    // 0250 octal = 168 → 168.168.168.168 is public; alt-encoding alone
    // isn't a reason to block (the SSRF risk is the *destination*, not
    // the notation). The URL parser canonicalises it to dotted-decimal.
    expect(isSafeExternalUrl("http://0250.0250.0250.0250/x")).toBe(true);
  });

  it("rejects IPv4-mapped IPv6 to internal addresses", () => {
    // The classic metadata bypass — must be blocked.
    expect(isSafeExternalUrl("http://[::ffff:169.254.169.254]/x")).toBe(false);
    expect(isSafeExternalUrl("http://[::ffff:127.0.0.1]/x")).toBe(false);
    expect(isSafeExternalUrl("http://[::ffff:10.0.0.1]/x")).toBe(false);
  });

  it("rejects IPv6 link-local (fe80::/10) + unique-local (fc00::/7)", () => {
    expect(isSafeExternalUrl("http://[fe80::1]/x")).toBe(false);
    expect(isSafeExternalUrl("http://[fc00::1]/x")).toBe(false);
    expect(isSafeExternalUrl("http://[fd12:3456::1]/x")).toBe(false);
    expect(isSafeExternalUrl("http://[::]/x")).toBe(false); // unspecified
  });

  it("still accepts legitimate public addresses (no false positives)", () => {
    expect(isSafeExternalUrl("http://8.8.8.8/x")).toBe(true); // public DNS, canonical quad
    expect(isSafeExternalUrl("http://1.1.1.1/x")).toBe(true);
    expect(isSafeExternalUrl("http://[2606:4700::1111]/x")).toBe(true); // Cloudflare public IPv6
    expect(isSafeExternalUrl("http://[::ffff:8.8.8.8]/x")).toBe(true); // public mapped
    // all-hex-letter domains must NOT be mistaken for hex IPs (no 0x prefix,
    // and a real TLD label breaks the all-numeric heuristic).
    expect(isSafeExternalUrl("https://face.example/paper.pdf")).toBe(true);
    expect(isSafeExternalUrl("https://cafe.ad/paper.pdf")).toBe(true);
  });
});

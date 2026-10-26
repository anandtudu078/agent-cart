import { isIP } from "node:net";

/**
 * True when `raw` is an http(s) URL pointing at a public host.
 *
 * Used for both directions of untrusted URLs: the product URLs we fetch on
 * the user's behalf (SSRF) and the webhook endpoints we POST alerts to
 * (SSRF + exfiltration). Rejection is conservative — a hostname is assumed
 * to resolve publicly; DNS rebinding is out of scope here.
 *
 * shortcut: literal IPs and a small private-host suffix list — upgrade to a
 * resolve-then-check when hosts inside the fetch path can be attacker-named.
 */
export function isPublicHttpUrl(raw: unknown): boolean {
  if (typeof raw !== "string" || raw.length === 0 || raw.length > 2_000) {
    return false;
  }
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return false;

  const host = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (
    host === "" ||
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host.endsWith(".internal")
  ) {
    return false;
  }

  const family = isIP(host);
  if (family === 4) return isPublicV4(host);
  if (family === 6) return isPublicV6(host);
  return true; // plain hostname
}

function isPublicV4(ip: string): boolean {
  const octets = ip.split(".").map(Number);
  const a = octets[0] ?? -1;
  const b = octets[1] ?? -1;
  if (a === 0 || a === 10 || a === 127) return false; // this-host / RFC1918 / loopback
  if (a === 169 && b === 254) return false; // link-local, incl. cloud metadata
  if (a === 172 && b >= 16 && b <= 31) return false; // RFC1918
  if (a === 192 && b === 168) return false; // RFC1918
  if (a === 100 && b >= 64 && b <= 127) return false; // CGNAT
  if (a === 192 && b === 0) return false; // IETF protocol assignments
  if (a >= 224) return false; // multicast + reserved + broadcast
  return true;
}

function isPublicV6(ip: string): boolean {
  const lower = ip.toLowerCase();
  if (lower === "::" || lower === "::1") return false;
  if (lower.startsWith("fc") || lower.startsWith("fd")) return false; // ULA
  if (/^fe[89ab]/.test(lower)) return false; // link-local
  if (lower.startsWith("ff")) return false; // multicast
  return true;
}

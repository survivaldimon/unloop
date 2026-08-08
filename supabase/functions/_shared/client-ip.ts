/**
 * The caller's address, read the way X-Forwarded-For actually works.
 *
 * XFF grows LEFT to RIGHT: every proxy appends the peer it received the
 * connection from. So the leftmost entry is whatever the client itself put in
 * the header — keying a per-IP ceiling on `split(",")[0]` means letting the
 * attacker pick their own bucket, which is no ceiling at all. The trustworthy
 * end is the right: those entries were written by infrastructure.
 *
 * Reading the rightmost PUBLIC address (skipping private/loopback hops) stays
 * correct however many internal proxies sit in front of a function, and a
 * client that prepends a public address of its own cannot move the boundary —
 * its forgery lands to the LEFT of the entry the gateway appended.
 *
 * Returns "" when no usable address is present. Callers must treat that as
 * "unknown", never as "allowed": the SQL throttles put unknown callers in one
 * shared bucket rather than waving them through.
 */

/**
 * Is this actually an address? Proxies put all sorts of things in XFF —
 * "unknown", obfuscated tokens, hostnames — and none of them should become a
 * throttle key. Mirrors the `v_ip::inet` cast the SQL side relies on.
 */
function isAddress(v: string): boolean {
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(v)) {
    return v.split(".").every((n) => Number(n) <= 255);
  }
  // IPv6, including the ::ffff:1.2.3.4 mapped form.
  return v.includes(":") && /^[0-9a-f:.]+$/i.test(v);
}

/** RFC1918 + loopback + link-local + CGNAT + "this network", v4 and v6. */
function isInternal(ip: string): boolean {
  // IPv4-mapped IPv6 ("::ffff:10.0.0.1") is judged on the embedded v4 address.
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(ip);
  const v = mapped ? mapped[1] : ip;

  if (v.includes(".")) {
    const parts = v.split(".").map((n) => Number(n));
    if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) {
      return true; // unparseable → not something we want to key a ceiling on
    }
    const [a, b] = parts;
    return (
      a === 10 ||
      a === 127 ||
      a === 0 ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 169 && b === 254) ||
      (a === 100 && b >= 64 && b <= 127)
    );
  }

  const lower = v.toLowerCase();
  if (lower === "::1" || lower === "::") return true;
  // fc00::/7 (unique local) and fe80::/10 (link local)
  return /^f[cd]/.test(lower) || /^fe[89ab]/.test(lower);
}

/**
 * "[2001:db8::1]:443" → "2001:db8::1"; "203.0.113.7:9000" → "203.0.113.7";
 * "::ffff:10.0.0.1" → "10.0.0.1".
 *
 * The mapped form is unwrapped so both notations of one host share a throttle
 * bucket — and so the SQL twin, where Postgres compares a mapped address in the
 * IPv6 family and silently misses every IPv4 private range, agrees with us.
 */
function normalizeAddress(raw: string): string {
  let v = raw.trim();
  if (!v) return "";
  if (v.startsWith("[")) {
    const end = v.indexOf("]");
    v = end > 0 ? v.slice(1, end) : "";
  } else {
    // A bare IPv6 is full of colons; exactly one means host:port.
    const colons = (v.match(/:/g) ?? []).length;
    if (colons === 1) v = v.slice(0, v.indexOf(":"));
  }
  const mapped = /^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/i.exec(v);
  return mapped ? mapped[1] : v;
}

/** Rightmost public entry of X-Forwarded-For, or "" when there is none. */
export function clientIp(req: Request): string {
  const header = req.headers.get("x-forwarded-for") ?? "";
  if (!header) return "";
  const parts = header.split(",");
  for (let i = parts.length - 1; i >= 0; i--) {
    const ip = normalizeAddress(parts[i]);
    if (ip && isAddress(ip) && !isInternal(ip)) return ip;
  }
  return "";
}

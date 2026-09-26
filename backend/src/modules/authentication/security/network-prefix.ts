import { isIPv4, isIPv6 } from 'node:net';

/** Paket 2.1 (M6): privacy — keep /24 of IPv4 and /48 of IPv6 only. */
export function truncateIpAddress(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const ip = raw.startsWith('::ffff:') ? raw.slice(7) : raw;
  if (isIPv4(ip)) {
    const parts = ip.split('.');
    return `${parts[0]}.${parts[1]}.${parts[2]}.0/24`;
  }
  if (isIPv6(ip)) {
    const expanded = expandIpv6(ip);
    return `${expanded.slice(0, 3).join(':')}::/48`;
  }
  return null;
}

function expandIpv6(ip: string): string[] {
  const [head, tail] = ip.split('::');
  const headParts = head ? head.split(':') : [];
  const tailParts = tail ? tail.split(':') : [];
  const missing = 8 - headParts.length - tailParts.length;
  return [...headParts, ...Array(Math.max(0, missing)).fill('0'), ...tailParts].map((part) =>
    (part || '0').toLowerCase().replace(/^0+(?=.)/, ''),
  );
}

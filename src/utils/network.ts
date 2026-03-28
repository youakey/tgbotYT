import dns from "node:dns/promises";
import net from "node:net";

function ipv4ToLong(ip: string): number {
  const octets = ip.split(".").map((octet) => Number.parseInt(octet, 10));
  return ((octets[0] << 24) >>> 0) + ((octets[1] << 16) >>> 0) + ((octets[2] << 8) >>> 0) + (octets[3] >>> 0);
}

function inIpv4Cidr(ip: string, base: string, prefix: number): boolean {
  const ipLong = ipv4ToLong(ip);
  const baseLong = ipv4ToLong(base);
  const mask = prefix === 0 ? 0 : (~((1 << (32 - prefix)) - 1) >>> 0);
  return (ipLong & mask) === (baseLong & mask);
}

function isPrivateIpv4(ip: string): boolean {
  if (ip === "255.255.255.255") {
    return true;
  }

  const blockedRanges: Array<[string, number]> = [
    ["0.0.0.0", 8],
    ["10.0.0.0", 8],
    ["100.64.0.0", 10],
    ["127.0.0.0", 8],
    ["169.254.0.0", 16],
    ["172.16.0.0", 12],
    ["192.0.0.0", 24],
    ["192.168.0.0", 16],
    ["198.18.0.0", 15],
    ["224.0.0.0", 4],
    ["240.0.0.0", 4]
  ];

  return blockedRanges.some(([base, prefix]) => inIpv4Cidr(ip, base, prefix));
}

function isPrivateIpv6(ip: string): boolean {
  const normalized = ip.toLowerCase();

  if (normalized === "::" || normalized === "::1") {
    return true;
  }

  if (normalized.startsWith("fe80:") || normalized.startsWith("fe90:") || normalized.startsWith("fea0:") || normalized.startsWith("feb0:")) {
    return true;
  }

  const firstBlock = normalized.split(":")[0];
  if (!firstBlock) {
    return false;
  }

  const firstValue = Number.parseInt(firstBlock, 16);
  if (Number.isNaN(firstValue)) {
    return false;
  }

  return (firstValue & 0xfe00) === 0xfc00;
}

export function isBlockedIpAddress(ip: string): boolean {
  const family = net.isIP(ip);
  if (family === 4) {
    return isPrivateIpv4(ip);
  }

  if (family === 6) {
    return isPrivateIpv6(ip);
  }

  return true;
}

export async function resolvePublicIps(hostname: string): Promise<string[]> {
  const results = await dns.lookup(hostname, { all: true, verbatim: true });
  const uniqueIps = Array.from(new Set(results.map((item) => item.address)));
  return uniqueIps;
}

export function isLocalHostname(hostname: string): boolean {
  const value = hostname.toLowerCase();
  return value === "localhost" || value.endsWith(".localhost") || value === "local";
}

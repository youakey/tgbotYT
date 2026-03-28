import axios from "axios";
import net from "node:net";
import { config } from "../config";
import { InvalidUrlError, UnsupportedSourceError } from "../utils/errors";
import { isBlockedIpAddress, isLocalHostname, resolvePublicIps } from "../utils/network";

function normalizeInput(input: string): string {
  const value = input.trim();
  if (!value) {
    throw new InvalidUrlError("Invalid URL");
  }
  return value;
}

export function parseAndValidateUrl(input: string): URL {
  const value = normalizeInput(input);
  let parsed: URL;

  try {
    parsed = new URL(value);
  } catch {
    throw new InvalidUrlError("Invalid URL");
  }

  if (parsed.protocol !== "https:") {
    throw new InvalidUrlError("Only https URLs are allowed");
  }

  if (isLocalHostname(parsed.hostname)) {
    throw new InvalidUrlError("Localhost is not allowed");
  }

  if (net.isIP(parsed.hostname) && isBlockedIpAddress(parsed.hostname)) {
    throw new InvalidUrlError("Private network address is not allowed");
  }

  return parsed;
}

async function assertPublicHost(url: URL): Promise<void> {
  if (net.isIP(url.hostname)) {
    if (isBlockedIpAddress(url.hostname)) {
      throw new InvalidUrlError("Private network address is not allowed");
    }
    return;
  }

  let ips: string[];
  try {
    ips = await resolvePublicIps(url.hostname);
  } catch {
    throw new UnsupportedSourceError("Source is not supported");
  }

  if (!ips.length || ips.some((ip) => isBlockedIpAddress(ip))) {
    throw new InvalidUrlError("Private network address is not allowed");
  }
}

export async function resolveSafeUrl(input: string): Promise<URL> {
  let current = parseAndValidateUrl(input);

  for (let redirects = 0; redirects <= config.maxRedirects; redirects += 1) {
    await assertPublicHost(current);

    const response = await axios.request({
      url: current.toString(),
      method: "HEAD",
      maxRedirects: 0,
      timeout: Math.min(15000, config.downloadTimeoutMs),
      validateStatus: () => true
    });

    const isRedirect = response.status >= 300 && response.status < 400;
    if (!isRedirect) {
      return current;
    }

    const locationHeader = response.headers.location;
    if (!locationHeader) {
      throw new UnsupportedSourceError("Source is not supported");
    }

    const next = new URL(locationHeader, current);
    current = parseAndValidateUrl(next.toString());
  }

  throw new UnsupportedSourceError("Too many redirects");
}

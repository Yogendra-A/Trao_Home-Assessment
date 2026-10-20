import { lookup } from "node:dns/promises";
import ipaddr from "ipaddr.js";

const MAX_URL_LENGTH = 2048;

export class UrlPolicyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UrlPolicyError";
  }
}

function isPublicAddress(address: string): boolean {
  try {
    return ipaddr.process(address).range() === "unicast";
  } catch {
    return false;
  }
}

export async function validateResearchUrl(
  input: string,
): Promise<URL> {
  if (input.length > MAX_URL_LENGTH) {
    throw new UrlPolicyError("URL is too long.");
  }

  let url: URL;

  try {
    url = new URL(input);
  } catch {
    throw new UrlPolicyError("Invalid company URL.");
  }

  if (!["http:", "https:"].includes(url.protocol)) {
    throw new UrlPolicyError("Only HTTP and HTTPS URLs are allowed.");
  }

  if (url.username || url.password) {
    throw new UrlPolicyError("URLs containing credentials are not allowed.");
  }

  if (url.hostname.endsWith(".")) {
    url.hostname = url.hostname.slice(0, -1);
  }

  const hostname = url.hostname.toLowerCase();
  const isLocalHostname =
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname === "localhost.localdomain";

  // Local fixture sites are useful for the required batch evaluation tests.
  // Never permit private or loopback targets in production.
  const allowLocal =
    process.env.NODE_ENV !== "production" &&
    process.env.ALLOW_PRIVATE_URLS === "true";

  if (isLocalHostname) {
    if (!allowLocal) {
      throw new UrlPolicyError("Localhost URLs are not allowed.");
    }
    return url;
  }

  if (ipaddr.isValid(hostname)) {
    if (!allowLocal && !isPublicAddress(hostname)) {
      throw new UrlPolicyError("Private or reserved IP addresses are not allowed.");
    }
    return url;
  }

  let addresses: Awaited<ReturnType<typeof lookup>>[];

  try {
    addresses = await lookup(hostname, { all: true, verbatim: true });
  } catch {
    throw new UrlPolicyError("Company hostname could not be resolved.");
  }

  if (addresses.length === 0) {
    throw new UrlPolicyError("Company hostname has no IP addresses.");
  }

  if (!allowLocal && addresses.some((entry) => !isPublicAddress(entry.address))) {
    throw new UrlPolicyError("Hostname resolves to a private or reserved address.");
  }

  return url;
}

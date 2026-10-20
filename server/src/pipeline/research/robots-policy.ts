import robotsParser from "robots-parser";

const USER_AGENT = "TraoInterviewPrepResearch";
const REQUEST_TIMEOUT_MS = 5000;

const robotsCache = new Map<
  string,
  { parser: ReturnType<typeof robotsParser>; expiresAt: number }
>();

export async function canCrawl(url: string): Promise<boolean> {
  const target = new URL(url);
  const origin = target.origin;
  const cached = robotsCache.get(origin);

  if (cached && cached.expiresAt > Date.now()) {
    return cached.parser.isAllowed(url, USER_AGENT) !== false;
  }

  const isLocalOrigin =
    target.hostname === "localhost" ||
    target.hostname.endsWith(".localhost") ||
    target.hostname === "127.0.0.1" ||
    target.hostname === "::1";

  const robotsUrl = `${origin}/robots.txt`;
  let response: Response;

  try {
    response = await fetch(robotsUrl, {
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      headers: { "User-Agent": USER_AGENT },
      redirect: "error",
    });
  } catch {
    // If fetching robots.txt fails on a local test fixture server (which may not host robots.txt),
    // allow crawling. For public internet servers, fail closed to respect site policies.
    if (isLocalOrigin) {
      const parser = robotsParser(robotsUrl, "");
      robotsCache.set(origin, {
        parser,
        expiresAt: Date.now() + 5 * 60 * 1000,
      });
      return true;
    }
    return false;
  }

  // A missing robots.txt means there are no published crawl rules.
  // For local fixture servers, non-OK responses (e.g. 500) indicate absence of robots.txt.
  if (response.status === 404 || response.status === 410 || (isLocalOrigin && !response.ok)) {
    const parser = robotsParser(robotsUrl, "");
    robotsCache.set(origin, {
      parser,
      expiresAt: Date.now() + 5 * 60 * 1000,
    });
    return true;
  }

  if (!response.ok) {
    return false;
  }

  const contentLength = Number(response.headers.get("content-length") ?? 0);

  if (contentLength > 500_000) {
    return false;
  }

  const text = await response.text();

  if (text.length > 500_000) {
    return false;
  }

  const parser = robotsParser(robotsUrl, text);

  robotsCache.set(origin, {
    parser,
    expiresAt: Date.now() + 5 * 60 * 1000,
  });

  return parser.isAllowed(url, USER_AGENT) !== false;
}

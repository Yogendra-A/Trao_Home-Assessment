
import * as cheerio from "cheerio";
import { validateResearchUrl } from "./url-policy";

const MAX_REDIRECTS = 5;
const MAX_RESPONSE_BYTES = 1_000_000;
const REQUEST_TIMEOUT_MS = 10_000;

export interface FetchedPage {
  url: string;
  status: number;
  contentType: string;
  title: string;
  text: string;
  links: string[];
}

export class FetchPageError extends Error {
  constructor(
    message: string,
    public readonly code: string,
  ) {
    super(message);
    this.name = "FetchPageError";
  }
}

async function readLimitedBody(response: Response): Promise<Uint8Array> {
  const declaredLength = Number(response.headers.get("content-length") ?? 0);

  if (declaredLength > MAX_RESPONSE_BYTES) {
    throw new FetchPageError("Page exceeds the size limit.", "PAGE_TOO_LARGE");
  }

  if (!response.body) {
    return new Uint8Array();
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      total += value.byteLength;

      if (total > MAX_RESPONSE_BYTES) {
        await reader.cancel();
        throw new FetchPageError(
          "Page exceeds the size limit.",
          "PAGE_TOO_LARGE",
        );
      }

      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const result = new Uint8Array(total);
  let offset = 0;

  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return result;
}

export async function fetchPage(inputUrl: string): Promise<FetchedPage> {
  let currentUrl: URL;

  try {
    currentUrl = await validateResearchUrl(inputUrl);
  } catch (error) {
    throw new FetchPageError(
      error instanceof Error ? error.message : "URL rejected.",
      "URL_REJECTED",
    );
  }

  for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount++) {
    let response: Response;

    try {
      response = await fetch(currentUrl, {
        redirect: "manual",
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        headers: {
          "User-Agent": "TraoInterviewPrepResearch/1.0",
          Accept: "text/html, text/plain;q=0.9",
        },
      });
    } catch (error) {
      const timedOut =
        error instanceof Error &&
        (error.name === "TimeoutError" || error.name === "AbortError");

      throw new FetchPageError(
        timedOut ? "Page request timed out." : "Page request failed.",
        timedOut ? "REQUEST_TIMEOUT" : "FETCH_FAILED",
      );
    }

    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get("location");
      await response.body?.cancel();

      if (!location) {
        throw new FetchPageError(
          "Redirect response has no Location header.",
          "INVALID_REDIRECT",
        );
      }

      if (redirectCount === MAX_REDIRECTS) {
        throw new FetchPageError(
          "Too many redirects.",
          "TOO_MANY_REDIRECTS",
        );
      }

      const nextUrl = new URL(location, currentUrl);

      try {
        currentUrl = await validateResearchUrl(nextUrl.href);
      } catch (error) {
        throw new FetchPageError(
          error instanceof Error ? error.message : "Redirect URL rejected.",
          "REDIRECT_REJECTED",
        );
      }

      continue;
    }

    if (!response.ok) {
      await response.body?.cancel();

      throw new FetchPageError(
        `Page returned HTTP ${response.status}.`,
        response.status === 404 ? "PAGE_NOT_FOUND" : "HTTP_ERROR",
      );
    }

    const contentType = (
      response.headers.get("content-type") ?? ""
    ).split(";")[0].trim().toLowerCase();

    if (
      contentType !== "text/html" &&
      contentType !== "application/xhtml+xml" &&
      contentType !== "text/plain"
    ) {
      await response.body?.cancel();

      throw new FetchPageError(
        `Unsupported content type: ${contentType || "unknown"}.`,
        "UNSUPPORTED_CONTENT_TYPE",
      );
    }

    const bytes = await readLimitedBody(response);
    const body = new TextDecoder("utf-8", { fatal: false }).decode(bytes);

    if (contentType === "text/plain") {
      return {
        url: currentUrl.href,
        status: response.status,
        contentType,
        title: "",
        text: body.trim(),
        links: [],
      };
    }

    const $ = cheerio.load(body);

    $("script, style, noscript, svg, nav, footer, header, iframe").remove();

    const title = $("title").first().text().trim();
    const text = $("body").text().replace(/\s+/g, " ").trim();

    const links = new Set<string>();

    $("a[href]").each((_index, element) => {
      const href = $(element).attr("href")?.trim();

      if (!href) return;

      try {
        const resolved = new URL(href, currentUrl);

        if (
          ["http:", "https:"].includes(resolved.protocol) &&
          resolved.origin === currentUrl.origin
        ) {
          resolved.hash = "";
          links.add(resolved.href);
        }
      } catch {
        // Ignore malformed links; a bad link should not fail the page.
      }
    });

    return {
      url: currentUrl.href,
      status: response.status,
      contentType,
      title,
      text,
      links: [...links],
    };
  }

  throw new FetchPageError("Redirect limit exceeded.", "TOO_MANY_REDIRECTS");
}

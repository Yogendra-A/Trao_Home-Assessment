
import { fetchPage, type FetchedPage } from "./fetch-page";
import { canCrawl } from "./robots-policy";
import { validateResearchUrl } from "./url-policy";

export interface CrawlResult {
  pages: FetchedPage[];
  skipped: Array<{ url: string; reason: string }>;
}

const MAX_PAGES = 12;
const MAX_LINKS_PER_PAGE = 40;
const DELAY_MS = 500;

const KEYWORDS: Record<string, number> = {
  careers: 10,
  career: 10,
  hiring: 10,
  recruitment: 9,
  interview: 10,
  "how-we-hire": 10,
  "life-at": 5,
  engineering: 7,
  "technical-blog": 7,
  about: 8,
  team: 5,
  company: 6,
  jobs: 9,
  culture: 5,
  handbook: 8,
  "working-here": 7,
};

function scoreUrl(url: string): number {
  const normalized = url.toLowerCase();
  let score = 0;

  for (const [keyword, weight] of Object.entries(KEYWORDS)) {
    if (normalized.includes(keyword)) score += weight;
  }

  if (/\.(pdf|png|jpe?g|gif|svg|zip|mp4|xml)(?:$|\?)/i.test(normalized)) {
    return -100;
  }

  return score;
}

export async function crawlCompany(
  inputUrl: string,
): Promise<CrawlResult> {
  const startUrl = await validateResearchUrl(inputUrl);
  const origin = startUrl.origin;

  const queue = [startUrl.href];
  const queued = new Set(queue);
  const visited = new Set<string>();
  const pages: FetchedPage[] = [];
  const skipped: CrawlResult["skipped"] = [];

  while (queue.length > 0 && pages.length < MAX_PAGES) {
    const current = queue.shift()!;

    if (visited.has(current)) continue;
    visited.add(current);

    const allowed = await canCrawl(current);

    if (!allowed) {
      skipped.push({ url: current, reason: "Blocked by robots policy or policy unavailable." });
      continue;
    }

    try {
      const page = await fetchPage(current);
      pages.push(page);

      const candidates = page.links
        .filter((link) => {
          try {
            return new URL(link).origin === origin && !queued.has(link);
          } catch {
            return false;
          }
        })
        .map((url) => ({ url, score: scoreUrl(url) }))
        .filter((item) => item.score >= 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, MAX_LINKS_PER_PAGE);

      for (const candidate of candidates) {
        if (queued.has(candidate.url)) continue;
        queued.add(candidate.url);
        queue.push(candidate.url);
      }
    } catch (error) {
      skipped.push({
        url: current,
        reason: error instanceof Error ? error.message : "Unknown fetch error.",
      });
    }

    // Basic per-origin pacing.
    if (queue.length > 0) {
      await new Promise((resolve) => setTimeout(resolve, DELAY_MS));
    }
  }

  return { pages, skipped };
}

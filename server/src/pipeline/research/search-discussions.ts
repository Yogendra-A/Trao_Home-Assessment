import { fetchPage } from "./fetch-page";

export interface PublicDiscussion {
  title: string;
  url: string;
  snippet: string;
  source: string;
}

export interface DiscussionSearchResult {
  query: string;
  discussions: PublicDiscussion[];
  provider: string;
}

/**
 * Searches public developer discussions (e.g. Hacker News Algolia free search API,
 * or optional custom search provider via SEARCH_API_KEY) for real interview experiences.
 * Kept strictly separate from the company's own domain crawl.
 */
export async function searchPublicDiscussions(
  companyName: string,
): Promise<DiscussionSearchResult> {
  const query = `${companyName} interview process hiring`;
  const sanitized = companyName.trim();

  if (!sanitized) {
    return { query, discussions: [], provider: "none" };
  }

  // 1. Check if an external search API (e.g. Tavily / Serper) is configured
  const apiKey = process.env.SEARCH_API_KEY;
  if (apiKey && process.env.SEARCH_ENDPOINT) {
    try {
      const response = await fetch(process.env.SEARCH_ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({ query: `${sanitized} interview process experience` }),
        signal: AbortSignal.timeout(5000),
      });

      if (response.ok) {
        const data = await response.json();
        const results = (data.results || []).slice(0, 4).map((r: any) => ({
          title: r.title || `${sanitized} Interview Discussion`,
          url: r.url || "",
          snippet: (r.content || r.snippet || "").slice(0, 400),
          source: "external_search",
        }));
        return { query, discussions: results, provider: "custom_search_api" };
      }
    } catch {
      // Fall through to public developer discussion search
    }
  }

  // 2. Free, public developer discussion search via Hacker News Algolia public API
  try {
    const hnUrl = `https://hn.algolia.com/api/v1/search?query=${encodeURIComponent(
      `${sanitized} interview`,
    )}&tags=comment&hitsPerPage=4`;

    const response = await fetch(hnUrl, {
      signal: AbortSignal.timeout(4000),
      headers: { "User-Agent": "TraoInterviewResearch/1.0" },
    });

    if (response.ok) {
      const data = await response.json();
      const hits = (data.hits || []).slice(0, 4);

      const discussions: PublicDiscussion[] = hits
        .filter((hit: any) => hit.comment_text)
        .map((hit: any) => {
          const cleanText = String(hit.comment_text)
            .replace(/<[^>]+>/g, " ")
            .replace(/&#x27;/g, "'")
            .replace(/&quot;/g, '"')
            .replace(/\s+/g, " ")
            .trim();

          const storyTitle = hit.story_title || `${sanitized} Interview Experience`;
          const url = hit.story_url || `https://news.ycombinator.com/item?id=${hit.objectID}`;

          return {
            title: storyTitle,
            url,
            snippet: cleanText.slice(0, 350),
            source: "hacker_news_public_discussion",
          };
        });

      return {
        query,
        discussions,
        provider: "hacker_news_algolia_public",
      };
    }
  } catch {
    // If public discussion search is unavailable or times out, report empty gracefully
  }

  return {
    query,
    discussions: [],
    provider: "hacker_news_algolia_public",
  };
}

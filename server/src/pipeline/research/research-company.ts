import { crawlCompany } from "./crawl-company";
import { searchPublicDiscussions } from "./search-discussions";

export interface ResearchEvidence {
  url: string;
  title: string;
  text: string;
  relevance: number;
}

export interface CompanyResearchResult {
  companyUrl: string;
  evidence: ResearchEvidence[];
  sourcesFetched: number;
  skipped: Array<{ url: string; reason: string }>;
  findings: {
    companyOverviewSources: ResearchEvidence[];
    hiringProcessSources: ResearchEvidence[];
    engineeringSources: ResearchEvidence[];
  };
}

function scoreEvidence(url: string, title: string, text: string): number {
  const value = `${url} ${title} ${text.slice(0, 1500)}`.toLowerCase();
  let score = 0;

  const groups = [
    {
      weight: 10,
      terms: ["interview process", "hiring process", "how we hire", "interview stages"],
    },
    {
      weight: 8,
      terms: ["careers", "career", "jobs", "recruitment", "open positions"],
    },
    {
      weight: 7,
      terms: ["engineering", "technology", "technical team", "developers"],
    },
    {
      weight: 5,
      terms: ["about us", "our company", "what we do", "our mission"],
    },
  ];

  for (const group of groups) {
    if (group.terms.some((term) => value.includes(term))) {
      score += group.weight;
    }
  }

  return score;
}

function extractCompanyName(url: string): string {
  try {
    const hostname = new URL(url).hostname.replace(/^www\./i, "").toLowerCase();
    const name = hostname.split(".")[0];
    return name.charAt(0).toUpperCase() + name.slice(1);
  } catch {
    return "";
  }
}

export async function researchCompany(
  companyUrl: string,
): Promise<CompanyResearchResult> {
  const crawl = await crawlCompany(companyUrl);

  const evidence: ResearchEvidence[] = crawl.pages
    .map((page) => ({
      url: page.url,
      title: page.title,
      text: page.text.slice(0, 12_000),
      relevance: scoreEvidence(page.url, page.title, page.text),
    }))
    .sort((a, b) => b.relevance - a.relevance);

  // Search public discussion forums (e.g. Hacker News / developer forums) for interview process insights
  const companyName = extractCompanyName(companyUrl);
  let discussionEvidence: ResearchEvidence[] = [];

  if (companyName) {
    try {
      const publicSearch = await searchPublicDiscussions(companyName);
      discussionEvidence = publicSearch.discussions.map((d) => ({
        url: d.url,
        title: d.title,
        text: d.snippet,
        relevance: 9,
      }));
    } catch {
      // Keep going if public discussion search fails
    }
  }

  const combinedEvidence = [...evidence, ...discussionEvidence].sort(
    (a, b) => b.relevance - a.relevance,
  );

  const select = (minimumScore: number, limit: number) =>
    combinedEvidence.filter((item) => item.relevance >= minimumScore).slice(0, limit);

  const hiringFromCrawl = evidence.filter((item) =>
    /interview|hiring|career|recruitment|jobs|how-we-hire/i.test(
      `${item.url} ${item.title}`,
    ),
  );

  return {
    companyUrl,
    evidence: combinedEvidence,
    sourcesFetched: crawl.pages.length + discussionEvidence.length,
    skipped: crawl.skipped,
    findings: {
      companyOverviewSources: select(5, 5),
      hiringProcessSources: [...hiringFromCrawl, ...discussionEvidence].slice(0, 5),
      engineeringSources: combinedEvidence
        .filter((item) =>
          /engineering|technology|developer|technical/i.test(
            `${item.url} ${item.title}`,
          ),
        )
        .slice(0, 5),
    },
  };
}

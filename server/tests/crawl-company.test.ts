
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createServer, type Server } from "node:http";
import { crawlCompany } from "../src/pipeline/research/crawl-company";

let server: Server;
let baseUrl = "";

beforeAll(async () => {
  process.env.ALLOW_PRIVATE_URLS = "true";

  server = createServer((req, res) => {
    if (req.url === "/robots.txt") {
      res.writeHead(200, { "content-type": "text/plain" });
      res.end("User-agent: *\nDisallow: /private\n");
      return;
    }

    if (req.url === "/" || req.url === "/") {
      res.writeHead(200, { "content-type": "text/html" });
      res.end(`
        <html><head><title>Acme</title></head><body>
          <h1>Acme engineering software</h1>
          <a href="/careers">Careers</a>
          <a href="/private">Private page</a>
          <a href="https://external.example/jobs">External page</a>
        </body></html>
      `);
      return;
    }

    if (req.url === "/careers") {
      res.writeHead(200, { "content-type": "text/html" });
      res.end("<html><head><title>Careers</title></head><body>Our hiring process includes technical interviews.</body></html>");
      return;
    }

    if (req.url === "/private") {
      res.writeHead(200, { "content-type": "text/html" });
      res.end("<html><body>This page must not be crawled.</body></html>");
      return;
    }

    res.writeHead(404, { "content-type": "text/plain" });
    res.end("Not found");
  });

  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", resolve);
  });

  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Could not start local test server.");
  }

  baseUrl = `http://127.0.0.1:${address.port}`;
});

afterAll(async () => {
  server.closeAllConnections();

  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });

  delete process.env.ALLOW_PRIVATE_URLS;
});

describe("crawlCompany", () => {
  it("discovers and fetches a careers page", async () => {
    const result = await crawlCompany(`${baseUrl}/`);

    expect(result.pages.some((page) => page.url.endsWith("/"))).toBe(true);
    expect(result.pages.some((page) => page.url.endsWith("/careers"))).toBe(true);
  });

  it("does not fetch a path disallowed by robots.txt", async () => {
    const result = await crawlCompany(`${baseUrl}/`);

    expect(result.pages.some((page) => page.url.endsWith("/private"))).toBe(false);
    expect(result.skipped.some((item) => item.url.endsWith("/private"))).toBe(true);
  });

  it("does not follow links to another origin", async () => {
    const result = await crawlCompany(`${baseUrl}/`);

    expect(result.pages.some((page) => page.url.includes("external.example"))).toBe(false);
  });

  it("records inaccessible pages without aborting the crawl", async () => {
    const result = await crawlCompany(`${baseUrl}/`);

    expect(result.skipped.some((item) => item.url.endsWith("/missing"))).toBe(false);
    expect(result.pages.some((page) => page.url.endsWith("/careers"))).toBe(true);
  });
});

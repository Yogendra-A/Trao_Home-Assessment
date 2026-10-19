
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createServer, type Server } from "node:http";
import { fetchPage, FetchPageError } from "../src/pipeline/research/fetch-page";

let server: Server;
let baseUrl = "";

beforeAll(async () => {
  process.env.ALLOW_PRIVATE_URLS = "true";

  server = createServer((req, res) => {
    if (req.url === "/company") {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      res.end(`
        <html>
          <head><title>Example Company</title></head>
          <body>
            <nav>Navigation noise</nav>
            <h1>About our company</h1>
            <p>We build engineering software.</p>
            <a href="/careers">Careers</a>
            <a href="https://other.example/jobs">External</a>
            <script>secretNoise()</script>
          </body>
        </html>
      `);
      return;
    }

    if (req.url === "/careers") {
      res.writeHead(200, { "content-type": "text/plain" });
      res.end("Our hiring process has two interviews.");
      return;
    }

    if (req.url === "/redirect-private") {
      res.writeHead(302, { location: "http://127.0.0.1:8099/private" });
      res.end();
      return;
    }

    if (req.url === "/image") {
      res.writeHead(200, { "content-type": "image/png" });
      res.end("not an image");
      return;
    }

    res.writeHead(404);
    res.end("Not found");
  });

  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", resolve);
  });

  const address = server.address();

  if (!address || typeof address === "string") {
    throw new Error("Could not start local fixture server.");
  }

  baseUrl = `http://127.0.0.1:${address.port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });

  delete process.env.ALLOW_PRIVATE_URLS;
});

describe("fetchPage", () => {
  it("extracts page text, title and same-origin links", async () => {
    const page = await fetchPage(`${baseUrl}/company`);

    expect(page.title).toBe("Example Company");
    expect(page.text).toContain("We build engineering software.");
    expect(page.text).not.toContain("Navigation noise");
    expect(page.text).not.toContain("secretNoise");
    expect(page.links).toContain(`${baseUrl}/careers`);
    expect(page.links.some((link) => link.includes("other.example"))).toBe(false);
  });

  it("fetches plain text pages", async () => {
    const page = await fetchPage(`${baseUrl}/careers`);

    expect(page.contentType).toBe("text/plain");
    expect(page.text).toContain("two interviews");
  });

  it("rejects unsupported content types", async () => {
    await expect(fetchPage(`${baseUrl}/image`)).rejects.toMatchObject({
      code: "UNSUPPORTED_CONTENT_TYPE",
    });
  });

  it("rejects HTTP 404 responses", async () => {
    await expect(fetchPage(`${baseUrl}/missing`)).rejects.toMatchObject({
      code: "PAGE_NOT_FOUND",
    });
  });

  it("revalidates redirect destinations", async () => {
    await expect(
      fetchPage(`${baseUrl}/redirect-private`),
    ).rejects.toBeInstanceOf(FetchPageError);
  });
});

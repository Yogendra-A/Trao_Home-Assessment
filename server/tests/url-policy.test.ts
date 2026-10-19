
import { afterEach, describe, expect, it, vi } from "vitest";
import { UrlPolicyError, validateResearchUrl } from "../src/pipeline/research/url-policy";

const originalAllowPrivate = process.env.ALLOW_PRIVATE_URLS;

afterEach(() => {
  vi.unstubAllEnvs();

  if (originalAllowPrivate === undefined) {
    delete process.env.ALLOW_PRIVATE_URLS;
  } else {
    process.env.ALLOW_PRIVATE_URLS = originalAllowPrivate;
  }
});

describe("validateResearchUrl", () => {
  it("accepts a public HTTPS URL", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("ALLOW_PRIVATE_URLS", "");

    const url = await validateResearchUrl("https://example.com/about");
    expect(url.hostname).toBe("example.com");
  });

  it("rejects non-HTTP protocols", async () => {
    await expect(
      validateResearchUrl("file:///etc/passwd"),
    ).rejects.toBeInstanceOf(UrlPolicyError);
  });

  it("rejects URLs containing credentials", async () => {
    await expect(
      validateResearchUrl("https://user:pass@example.com"),
    ).rejects.toThrow(/credentials/);
  });

  it("rejects loopback IP addresses in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("ALLOW_PRIVATE_URLS", "true");

    await expect(
      validateResearchUrl("http://127.0.0.1:8099/acme/"),
    ).rejects.toThrow(/Private or reserved/);
  });

  it("rejects localhost in production", async () => {
    vi.stubEnv("NODE_ENV", "production");

    await expect(
      validateResearchUrl("http://localhost:8099/acme/"),
    ).rejects.toThrow(/Localhost/);
  });

  it("rejects malformed URLs", async () => {
    await expect(
      validateResearchUrl("not-a-url"),
    ).rejects.toBeInstanceOf(UrlPolicyError);
  });
});


import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { mockLookup } = vi.hoisted(() => ({
  mockLookup: vi.fn(),
}));

vi.mock("node:dns/promises", () => ({
  lookup: mockLookup,
}));

import {
  UrlPolicyError,
  validateResearchUrl,
} from "../src/pipeline/research/url-policy";

const originalNodeEnv = process.env.NODE_ENV;
const originalAllowPrivate = process.env.ALLOW_PRIVATE_URLS;

beforeEach(() => {
  mockLookup.mockReset();
  mockLookup.mockResolvedValue([
    { address: "93.184.216.34", family: 4 },
  ]);
});

afterEach(() => {
  vi.unstubAllEnvs();

if (originalNodeEnv === undefined) {
  vi.stubEnv("NODE_ENV", "");
  delete (process.env as { NODE_ENV?: string }).NODE_ENV;
} else {
  vi.stubEnv("NODE_ENV", originalNodeEnv);
}

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
    expect(mockLookup).toHaveBeenCalledWith("example.com", {
      all: true,
      verbatim: true,
    });
  });

  it("rejects non-HTTP protocols", async () => {
    await expect(
      validateResearchUrl("file:///etc/passwd"),
    ).rejects.toBeInstanceOf(UrlPolicyError);

    expect(mockLookup).not.toHaveBeenCalled();
  });

  it("rejects URLs containing credentials", async () => {
    await expect(
      validateResearchUrl("https://user:pass@example.com"),
    ).rejects.toThrow(/credentials/);

    expect(mockLookup).not.toHaveBeenCalled();
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

    expect(mockLookup).not.toHaveBeenCalled();
  });

  it("rejects malformed URLs", async () => {
    await expect(
      validateResearchUrl("not-a-url"),
    ).rejects.toBeInstanceOf(UrlPolicyError);

    expect(mockLookup).not.toHaveBeenCalled();
  });

  it("rejects hostnames resolving to private IP addresses", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("ALLOW_PRIVATE_URLS", "");

    mockLookup.mockResolvedValue([
      { address: "127.0.0.1", family: 4 },
    ]);

    await expect(
      validateResearchUrl("https://example.com"),
    ).rejects.toThrow(/private or reserved address/i);
  });

  it("rejects hostnames that cannot be resolved", async () => {
    vi.stubEnv("NODE_ENV", "production");

    mockLookup.mockRejectedValue(new Error("DNS unavailable"));

    await expect(
      validateResearchUrl("https://example.com"),
    ).rejects.toThrow(/could not be resolved/i);
  });
});

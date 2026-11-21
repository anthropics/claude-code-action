import { describe, expect, test, beforeEach, afterEach, spyOn } from "bun:test";
import * as core from "@actions/core";
import { exchangeForAppToken, setupGitHubToken } from "../src/github/token";

const EXCHANGE_URL =
  "https://api.anthropic.com/api/github/github-app-token-exchange";

describe("app token exchange is bounded by a timeout", () => {
  let originalOverrideToken: string | undefined;
  let fetchSpy: any;
  let getIDTokenSpy: any;
  let setSecretSpy: any;
  let consoleLogSpy: any;
  let consoleErrorSpy: any;

  beforeEach(() => {
    originalOverrideToken = process.env.OVERRIDE_GITHUB_TOKEN;
    delete process.env.OVERRIDE_GITHUB_TOKEN;
    getIDTokenSpy = spyOn(core, "getIDToken").mockResolvedValue("oidc-token");
    setSecretSpy = spyOn(core, "setSecret").mockImplementation(() => {});
    consoleLogSpy = spyOn(console, "log").mockImplementation(() => {});
    consoleErrorSpy = spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    if (originalOverrideToken === undefined) {
      delete process.env.OVERRIDE_GITHUB_TOKEN;
    } else {
      process.env.OVERRIDE_GITHUB_TOKEN = originalOverrideToken;
    }
    fetchSpy?.mockRestore();
    getIDTokenSpy.mockRestore();
    setSecretSpy.mockRestore();
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  test("setupGitHubToken sends the exchange with a 30 s timeout signal", async () => {
    fetchSpy = spyOn(global, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ token: "app-token" }), { status: 200 }),
    );
    const timeoutSpy = spyOn(AbortSignal, "timeout");

    try {
      await expect(setupGitHubToken()).resolves.toBe("app-token");

      expect(fetchSpy).toHaveBeenCalledTimes(1);
      const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
      expect(url).toBe(EXCHANGE_URL);
      expect(init.signal).toBeInstanceOf(AbortSignal);
      expect(timeoutSpy).toHaveBeenCalledWith(30_000);
      expect(init.signal).toBe(
        timeoutSpy.mock.results[0]!.value as AbortSignal,
      );
    } finally {
      timeoutSpy.mockRestore();
    }
  });

  test("a stalled exchange rejects once the timeout fires", async () => {
    // Behaves like a real fetch against a connection that never answers:
    // settles only when the caller's signal aborts.
    fetchSpy = spyOn(global, "fetch").mockImplementation(
      ((_url: any, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () =>
            reject(init.signal!.reason),
          );
        })) as unknown as typeof fetch,
    );

    const started = Date.now();
    const result = exchangeForAppToken("oidc-token", undefined, 50);

    await expect(result).rejects.toMatchObject({ name: "TimeoutError" });
    expect(Date.now() - started).toBeLessThan(5_000);
  });
});

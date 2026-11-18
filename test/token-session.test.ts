import { expect, spyOn, test } from "bun:test";
import * as core from "@actions/core";
import { mkdir, mkdtemp, readFile, readdir, rm, stat } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import {
  GitHubTokenSession,
  TOKEN_RENEWAL_AGE_MS,
} from "../src/github/token-session";

test("rotates the credential during the session and waits for an in-flight renewal at shutdown", async () => {
  const requested = Promise.withResolvers<void>();
  const response = Promise.withResolvers<Response>();
  const publish = Promise.withResolvers<[string, string]>();
  const oidc = spyOn(core, "getIDToken").mockResolvedValue("test-second-oidc");
  const mask = spyOn(core, "setSecret").mockImplementation(() => {});
  const exchange = spyOn(globalThis, "fetch").mockImplementation(
    Object.assign(
      async (url: Parameters<typeof fetch>[0], options?: RequestInit) => {
        expect(String(url)).toContain("/github-app-token-exchange");
        expect(new Headers(options?.headers).get("authorization")).toBe(
          "Bearer test-second-oidc",
        );
        requested.resolve();
        return response.promise;
      },
      globalThis.fetch,
    ),
  );
  const session = await GitHubTokenSession.create(
    "initial-test-token",
    Date.now() - TOKEN_RENEWAL_AGE_MS,
    (current, previous) => publish.resolve([current, previous]),
  );
  try {
    session.start();
    await requested.promise;
    expect(await readFile(session.tokenPath, "utf8")).toBe(
      "initial-test-token\n",
    );

    let stopped = false;
    const finishing = session.stop().then((value) => {
      stopped = true;
      return value;
    });
    await Bun.sleep(0);
    expect(stopped).toBe(false);
    response.resolve(Response.json({ token: "renewed-test-token" }));

    expect(await publish.promise).toEqual([
      "renewed-test-token",
      "initial-test-token",
    ]);
    expect(await finishing).toMatchObject({
      token: "renewed-test-token",
      previous: "initial-test-token",
    });
    expect(await readFile(session.tokenPath, "utf8")).toBe(
      "renewed-test-token\n",
    );
    if (process.platform !== "win32") {
      expect((await stat(session.tokenPath)).mode & 0o777).toBe(0o600);
    }
    expect(exchange).toHaveBeenCalledTimes(1);
    expect(mask).toHaveBeenCalledWith("renewed-test-token");
  } finally {
    response.resolve(Response.json({ token: "renewed-test-token" }));
    await session.stop();
    await session.remove();
    exchange.mockRestore();
    mask.mockRestore();
    oidc.mockRestore();
  }
  await expect(stat(session.tokenPath)).rejects.toMatchObject({
    code: "ENOENT",
  });
});

test("does not place credentials in the checkout", async () => {
  const workspace = await mkdtemp(join(tmpdir(), "claude-test-workspace-"));
  const nestedTemp = join(workspace, "temp");
  const originalWorkspace = process.env.GITHUB_WORKSPACE;
  const originalTemp = process.env.RUNNER_TEMP;
  try {
    await mkdir(nestedTemp);
    process.env.GITHUB_WORKSPACE = workspace;
    process.env.RUNNER_TEMP = nestedTemp;
    await expect(
      GitHubTokenSession.create("test-token", Date.now(), () => {}),
    ).rejects.toThrow("outside the workspace");
    expect(await readdir(nestedTemp)).toEqual([]);
  } finally {
    if (originalWorkspace === undefined) delete process.env.GITHUB_WORKSPACE;
    else process.env.GITHUB_WORKSPACE = originalWorkspace;
    if (originalTemp === undefined) delete process.env.RUNNER_TEMP;
    else process.env.RUNNER_TEMP = originalTemp;
    await rm(workspace, { recursive: true, force: true });
  }
});

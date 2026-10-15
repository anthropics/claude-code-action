#!/usr/bin/env bun
/**
 * OrcaRouter credential entry points for a headless host.
 *
 *   --connect   run "Connect with OrcaRouter" (OAuth 2.0 + PKCE, Flow B) and
 *               persist the issued key. Additive: this only runs when the step is
 *               invoked directly, so a normal action run is never hijacked.
 *   --logout    remove the stored credential.
 *   --status    report which entry point is configured, with the secret masked.
 *
 * The verifier never leaves this process and is never printed. Interactive
 * prompts are intentionally avoided: a GitHub Actions step cannot rely on stdin,
 * so the consent URL is written to the step summary and the code is supplied via
 * the `orcarouter_code` input or `ORCA_AUTH_CODE`.
 */

import { homedir } from "node:os";
import * as core from "@actions/core";
import { OrcaRouterCredentialStore } from "./credentials";
import { connectWithOrcaRouter, isOrcaRouterAuthError } from "./connect";
import { ORCAROUTER_PROVIDER, apiKeyFromEnv } from "./provider";
import {
  maskSecret,
  ORCA_AUTHORIZED_APPS_URL,
  ORCA_KEY_DASHBOARD_URL,
  resolveOrcaRouterOrigins,
} from "./endpoints";

export type OrcaRouterCliCommand = "connect" | "logout" | "status";

export function parseCliCommand(argv: string[]): OrcaRouterCliCommand | null {
  if (argv.includes("--connect")) return "connect";
  if (argv.includes("--logout")) return "logout";
  if (argv.includes("--status")) return "status";
  return null;
}

function store(
  env: Record<string, string | undefined>,
): OrcaRouterCredentialStore {
  const home = env.HOME?.trim() || homedir();
  return new OrcaRouterCredentialStore(home);
}

async function reportStatus(
  env: Record<string, string | undefined>,
): Promise<void> {
  const apiKey = apiKeyFromEnv(env);
  const record = await store(env).read();
  if (apiKey) {
    console.log(
      `OrcaRouter ${ORCAROUTER_PROVIDER.authMethods[0].label}: configured ${maskSecret(apiKey)}`,
    );
  }
  if (record) {
    console.log(
      `OrcaRouter ${ORCAROUTER_PROVIDER.authMethods[1].label}: ${maskSecret(record.key)} (generation ${record.generation})${record.needsReauth ? " — needs reauthentication" : ""}`,
    );
  }
  if (!apiKey && !record) {
    console.log(
      `OrcaRouter: no credential configured. Provide an sk-orca-… key (${ORCA_KEY_DASHBOARD_URL}) or run with --connect.`,
    );
  }
}

async function reportLogout(
  env: Record<string, string | undefined>,
): Promise<number> {
  const credentialStore = store(env);
  const existing = await credentialStore.read();
  await credentialStore.clear();
  console.log(
    existing
      ? "Removed the stored OrcaRouter login. A key supplied through orcarouter_api_key is unaffected."
      : "No stored OrcaRouter login was present; nothing to remove.",
  );
  return 0;
}

/**
 * The code may arrive as an input/argument (the non-blocking path a workflow
 * uses) or from stdin when one is attached. `--cancel` short-circuits so an
 * aborted step still releases its login state.
 */
async function requestCode(options: {
  env: Record<string, string | undefined>;
  argv: string[];
}): Promise<string | null> {
  if (options.argv.includes("--cancel")) return null;
  const flagIndex = options.argv.indexOf("--code");
  const fromArg = flagIndex >= 0 ? options.argv[flagIndex + 1] : undefined;
  const supplied =
    fromArg?.trim() ||
    options.env.INPUT_ORCAROUTER_CODE?.trim() ||
    options.env.ORCA_AUTH_CODE?.trim();
  if (supplied) return supplied;

  if (process.stdin.isTTY !== true) {
    throw new Error(
      "No authorization code was provided. Set the orcarouter_code input (or ORCA_AUTH_CODE) to the code shown on the consent screen.",
    );
  }

  process.stdout.write("Paste the authorization code: ");
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString("utf-8").trim() || null;
}

async function reportConnect(
  env: Record<string, string | undefined>,
  argv: string[],
): Promise<number> {
  const origins = resolveOrcaRouterOrigins(env);
  const presented: string[] = [];

  try {
    const credential = await connectWithOrcaRouter({
      authBaseUrl: origins.authBaseUrl,
      appName: ORCAROUTER_PROVIDER.displayName,
      store: store(env),
      presentUrl: (url) => {
        presented.push(url);
        // Only the challenge travels in this URL; the verifier is never included.
        console.log(`Authorize OrcaRouter in your browser:\n${url}`);
        core.summary?.addRaw(
          `### OrcaRouter authorization\n\nOpen this URL and approve access, then supply the displayed code to the \`orcarouter_code\` input:\n\n${url}\n`,
        );
      },
      requestCode: () => requestCode({ env, argv }),
    });
    console.log(
      `Connected to OrcaRouter. Stored credential ${maskSecret(credential.key)}${
        credential.scope ? ` (granted scope: ${credential.scope})` : ""
      }.`,
    );
    return 0;
  } catch (error) {
    if (isOrcaRouterAuthError(error)) {
      console.error(`OrcaRouter authorization failed: ${error.action}`);
      console.error(
        `Review or revoke authorized apps at ${ORCA_AUTHORIZED_APPS_URL}.`,
      );
      return 1;
    }
    // Configuration problems (for example no code supplied to a non-interactive
    // step) must also end cleanly rather than crashing the step.
    console.error(
      `OrcaRouter authorization failed: ${error instanceof Error ? error.message : String(error)}`,
    );
    return 1;
  }
}

export async function runOrcaRouterCli(
  argv: string[] = process.argv.slice(2),
  env: Record<string, string | undefined> = process.env,
): Promise<number | null> {
  const command = parseCliCommand(argv);
  if (!command) return null;
  if (command === "status") {
    await reportStatus(env);
    return 0;
  }
  if (command === "logout") return reportLogout(env);
  return reportConnect(env, argv);
}

if (import.meta.main) {
  const code = await runOrcaRouterCli();
  if (code !== null) process.exit(code);
}

import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * PKCE primitives (RFC 7636) for the OrcaRouter connect flow.
 *
 * The verifier is what makes the flow safe without a client secret: it never
 * leaves this process, so an intercepted auth code cannot be redeemed. It must
 * therefore be generated from a cryptographic RNG, fresh for every attempt, and
 * must never be logged, printed, or placed in a URL.
 */

export function base64UrlEncode(input: Buffer | Uint8Array): string {
  return Buffer.from(input).toString("base64url");
}

export type PkceAttempt = {
  /** Secret. Never leaves the process until the exchange request. */
  verifier: string;
  /** `base64url(sha256(verifier))`, no padding — the only half sent in the URL. */
  challenge: string;
  /** Opaque CSRF token, echoed back verbatim. */
  state: string;
};

/** A fresh verifier/challenge/state triple. 32 bytes = 256 bits of entropy. */
export function createPkceAttempt(): PkceAttempt {
  const verifier = base64UrlEncode(randomBytes(32));
  return {
    verifier,
    challenge: base64UrlEncode(createHash("sha256").update(verifier).digest()),
    state: base64UrlEncode(randomBytes(16)),
  };
}

/**
 * Constant-time comparison of the echoed `state`. Length is compared first and
 * short-circuits because `timingSafeEqual` throws on differing lengths; the
 * value comparison itself does not branch on content.
 */
export function stateMatches(
  expected: string,
  received: string | null,
): boolean {
  if (!received) return false;
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(received, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/** One-time auth codes are short-lived; the client gives up well before this. */
export const AUTHORIZATION_TIMEOUT_MS = 5 * 60 * 1000;

/**
 * Auth codes are single-use with a 10 minute TTL. A client that keeps presenting
 * a code it has already spent would otherwise burn the whole time budget on a
 * guaranteed `403`.
 */
export class CodeExchangeTracker {
  private spent = false;

  get consumed(): boolean {
    return this.spent;
  }

  /** Marks the code as spent. Call immediately before attempting an exchange. */
  consume(): void {
    this.spent = true;
  }
}

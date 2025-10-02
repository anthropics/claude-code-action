import { GitLabClient } from "../api/client";
import { buildMergeRequestContext } from "../context";
import { analyzeMergeRequest } from "../review/analyze";
import { ensureSummaryComment } from "../comments/root";
import { postInlineFinding } from "../comments/inline";
import { logger } from "../utils/logger";

export async function runMergeRequestReview() {
  const context = await buildMergeRequestContext();
  const client = new GitLabClient();

  const result = await analyzeMergeRequest(context);

  await ensureSummaryComment(client, context, result);

  for (const finding of result.findings) {
    if (!finding.line) {
      continue;
    }

    logger.info("Posting inline finding", {
      path: finding.path,
      line: finding.line,
      severity: finding.severity,
    });

    await postInlineFinding(client, context, finding);
  }
}


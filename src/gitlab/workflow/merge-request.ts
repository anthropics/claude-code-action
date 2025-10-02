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
      logger.debug("Skipping finding without line number", {
        path: finding.path,
        title: finding.title,
      });
      continue;
    }

    logger.info("Attempting inline finding", {
      path: finding.path,
      line: finding.line,
      severity: finding.severity,
    });

    const posted = await postInlineFinding(client, context, finding);
    
    if (!posted) {
      logger.warn("Could not post inline comment (invalid position or missing file in diff)", {
        path: finding.path,
        line: finding.line,
        title: finding.title,
      });
    }
  }
}


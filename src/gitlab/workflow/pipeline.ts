import { runMergeRequestReview } from "./merge-request";
import { logger } from "../utils/logger";

export async function runGitLabPipeline() {
  logger.info("Starting GitLab merge request review workflow");
  await runMergeRequestReview();
  logger.info("Completed GitLab merge request review workflow");
}


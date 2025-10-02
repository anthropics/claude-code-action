import { GitLabClient } from "../api/client";
import type { MergeRequestContext } from "./types";
import { loadEnv } from "../utils/env";
import { logger } from "../utils/logger";

export async function buildMergeRequestContext(): Promise<MergeRequestContext> {
  const env = loadEnv();
  const client = new GitLabClient(env);

  logger.info("Fetching project information");
  const project = await client.getProject();

  logger.info("Fetching merge request", { iid: env.CI_MERGE_REQUEST_IID });
  const mergeRequest = await client.getMergeRequest(env.CI_MERGE_REQUEST_IID);

  logger.info("Fetching merge request changes");
  const { changes, diff_refs } = await client.getMergeRequestChanges(
    env.CI_MERGE_REQUEST_IID,
  );

  logger.info("Fetching existing discussions");
  const discussions = await client.getDiscussions(env.CI_MERGE_REQUEST_IID);

  return {
    project,
    mergeRequest: {
      ...mergeRequest,
      diff_refs,
    },
    changes,
    discussions,
    iid: env.CI_MERGE_REQUEST_IID,
  };
}


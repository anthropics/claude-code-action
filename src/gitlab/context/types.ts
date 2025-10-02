import type {
  GitLabChange,
  GitLabDiscussion,
  GitLabMergeRequest,
  GitLabProject,
} from "../api/types";

export type MergeRequestContext = {
  project: GitLabProject;
  mergeRequest: GitLabMergeRequest;
  changes: GitLabChange[];
  discussions: GitLabDiscussion[];
  iid: string;
};


export type GitLabUser = {
  id: number;
  username: string;
  name: string;
};

export type GitLabDiffRef = {
  base_sha: string;
  head_sha: string;
  start_sha: string;
};

export type GitLabMergeRequest = {
  iid: number;
  title: string;
  description: string;
  source_branch: string;
  target_branch: string;
  author: GitLabUser;
  web_url: string;
  diff_refs: GitLabDiffRef;
};

export type GitLabDiscussionNote = {
  id: string;
  body: string;
  author: GitLabUser;
  position?: {
    base_sha: string;
    start_sha: string;
    head_sha: string;
    position_type: "text";
    new_path: string;
    new_line?: number;
    old_path?: string;
    old_line?: number;
  };
  system: boolean;
};

export type GitLabDiscussion = {
  id: string;
  individual_note: boolean;
  notes: GitLabDiscussionNote[];
};

export type GitLabChange = {
  old_path: string;
  new_path: string;
  diff: string;
  new_file: boolean;
  renamed_file: boolean;
  deleted_file: boolean;
};

export type GitLabMergeRequestChanges = {
  changes: GitLabChange[];
  diff_refs: GitLabDiffRef;
};

export type GitLabAwardEmoji = {
  name: string;
  user: GitLabUser;
};

export type GitLabProject = {
  id: number;
  path_with_namespace: string;
  default_branch: string;
};

export type CreateDiscussionPayload = {
  body: string;
  position?: {
    position_type: "text";
    base_sha: string;
    start_sha: string;
    head_sha: string;
    old_path?: string;
    new_path: string;
    old_line?: number;
    new_line?: number;
  };
};


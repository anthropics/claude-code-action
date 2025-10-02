import fetch, { Headers } from "node-fetch";
import type { RequestInit, Response as FetchResponse } from "node-fetch";
import { loadEnv } from "../utils/env";
import { assertResponseOk } from "./errors";
import type {
  CreateDiscussionPayload,
  GitLabDiscussion,
  GitLabMergeRequest,
  GitLabMergeRequestChanges,
  GitLabProject,
} from "./types";

type RequestInitWithBody = Omit<RequestInit, "body"> & {
  body?: string;
};

export class GitLabClient {
  private readonly baseUrl: string;
  private readonly token: string;
  private readonly projectId: string;

  constructor(config = loadEnv()) {
    this.baseUrl = config.GITLAB_BASE_URL.replace(/\/?$/, "");
    this.token = config.GITLAB_ACCESS_TOKEN;
    this.projectId = config.GITLAB_PROJECT_ID;
  }

  private async request(
    path: string,
    init: RequestInitWithBody = {},
  ): Promise<FetchResponse> {
    const url = `${this.baseUrl}/api/v4${path}`;
    const headers = new Headers(init.headers ?? undefined);
    headers.set("Content-Type", "application/json");
    headers.set("Authorization", `Bearer ${this.token}`);

    const response = await fetch(url, {
      ...init,
      headers,
    });

    return response;
  }

  async getProject(): Promise<GitLabProject> {
    const response = await this.request(`/projects/${encodeURIComponent(this.projectId)}`);
    assertResponseOk(response, "Get project");
    return (await response.json()) as GitLabProject;
  }

  async getMergeRequest(iid: string): Promise<GitLabMergeRequest> {
    const response = await this.request(
      `/projects/${encodeURIComponent(this.projectId)}/merge_requests/${iid}`,
    );
    assertResponseOk(response, "Get merge request");
    return (await response.json()) as GitLabMergeRequest;
  }

  async getMergeRequestChanges(iid: string): Promise<GitLabMergeRequestChanges> {
    const response = await this.request(
      `/projects/${encodeURIComponent(this.projectId)}/merge_requests/${iid}/changes`,
    );
    assertResponseOk(response, "Get merge request changes");
    return (await response.json()) as GitLabMergeRequestChanges;
  }

  async getDiscussions(iid: string): Promise<GitLabDiscussion[]> {
    const response = await this.request(
      `/projects/${encodeURIComponent(this.projectId)}/merge_requests/${iid}/discussions?per_page=100`,
    );
    assertResponseOk(response, "Get merge request discussions");
    return (await response.json()) as GitLabDiscussion[];
  }

  async createDiscussion(
    iid: string,
    payload: CreateDiscussionPayload,
  ): Promise<GitLabDiscussion> {
    const response = await this.request(
      `/projects/${encodeURIComponent(this.projectId)}/merge_requests/${iid}/discussions`,
      {
        method: "POST",
        body: JSON.stringify(payload),
      },
    );

    assertResponseOk(response, "Create discussion");
    return (await response.json()) as GitLabDiscussion;
  }

  async createSystemNote(iid: string, body: string): Promise<void> {
    const response = await this.request(
      `/projects/${encodeURIComponent(this.projectId)}/merge_requests/${iid}/notes`,
      {
        method: "POST",
        body: JSON.stringify({ body }),
      },
    );

    assertResponseOk(response, "Create system note");
  }
}


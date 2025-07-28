import type { Mode } from "../types";

/**
 * Agent mode implementation.
 *
 * This mode is designed for automation and workflow_dispatch scenarios.
 * It always triggers (no checking), allows highly flexible configurations,
 * and works well with override_prompt for custom workflows.
 *
 * In the future, this mode could restrict certain tools for safety in automation contexts,
 * e.g., disallowing WebSearch or limiting file system operations.
 */
export const agentMode: Mode = {
  name: "agent",
  description: "Automation mode that always runs without trigger checking",

  shouldTrigger() {
    return true;
  },

  prepareContext(context, data) {
    return {
      mode: "agent",
      githubContext: context,
      commentId: data?.commentId,
      baseBranch: data?.baseBranch,
      claudeBranch: data?.claudeBranch,
    };
  },

  getAllowedTools() {
    return [];
  },

  getDisallowedTools() {
    return [];
  },

  shouldCreateTrackingComment() {
    return false;
  },
};

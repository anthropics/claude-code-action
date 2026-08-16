export function collectActionInputsPresence(): string {
  const inputDefaults: Record<string, string> = {
    trigger_phrase: "@claude",
    assignee_trigger: "",
    label_trigger: "claude",
    base_branch: "",
    branch_prefix: "claude/",
    branch_name_template: "",
    allowed_bots: "",
    allowed_non_write_users: "",
    include_comments_by_actor: "",
    exclude_comments_by_actor: "",
    prompt: "",
    settings: "",
    anthropic_api_key: "",
    claude_code_oauth_token: "",
    anthropic_federation_rule_id: "",
    anthropic_organization_id: "",
    anthropic_service_account_id: "",
    anthropic_workspace_id: "",
    anthropic_oidc_audience: "",
    github_token: "",
    use_bedrock: "false",
    use_vertex: "false",
    use_foundry: "false",
    claude_args: "",
    additional_permissions: "",
    use_sticky_comment: "false",
    classify_inline_comments: "true",
    use_commit_signing: "false",
    ssh_signing_key: "",
    bot_id: "41898282",
    bot_name: "claude[bot]",
    track_progress: "false",
    include_fix_links: "true",
    path_to_claude_code_executable: "",
    path_to_bun_executable: "",
    display_report: "false",
    show_full_output: "false",
    plugins: "",
    plugin_marketplaces: "",
  };

  const allInputsJson = process.env.ALL_INPUTS;
  if (!allInputsJson) {
    console.log("ALL_INPUTS environment variable not found");
    return JSON.stringify({});
  }

  let allInputs: Record<string, string>;
  try {
    allInputs = JSON.parse(allInputsJson);
  } catch (e) {
    console.error("Failed to parse ALL_INPUTS JSON:", e);
    return JSON.stringify({});
  }

  const presentInputs: Record<string, boolean> = {};

  for (const [name, defaultValue] of Object.entries(inputDefaults)) {
    const actualValue = allInputs[name] || "";

    const isSet = actualValue !== defaultValue;
    presentInputs[name] = isSet;
  }

  return JSON.stringify(presentInputs);
}

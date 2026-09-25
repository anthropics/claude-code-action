# Welcome to Anthropic

## What Is Claude Code?

Claude Code is Anthropic's agentic coding assistant. It runs in your terminal (or IDE), reads and edits your actual files, runs shell commands, and works through multi-step tasks autonomously rather than answering one question at a time. It's the same Claude, wired directly into your dev environment.

A few concepts you'll run into right away:

- **Skills** — reusable workflows you invoke with `/name` (e.g. `/anthropic-skills:using-git-worktrees`). Some ship with Claude Code, some are custom to a project or team.
- **MCP servers** — connectors that give Claude access to external tools and data (GitHub, Slack, internal APIs). Once connected, Claude calls them directly instead of you copy-pasting context back and forth.
- **Plugins** — bundles of skills and MCP servers packaged together for a domain.
- **Slash commands** — both built-in (`/model`, `/mcp`, `/permissions`) and custom ones a team defines.

## How We Use Claude

Based on usage over the last 30 days:

```
Work Type Breakdown:
  Build Feature   █████████░░░░░░░░░░  45%
  Debug Fix       ██████░░░░░░░░░░░░░░  30%
  Plan Design     █████░░░░░░░░░░░░░░░  25%

Top Skills & Commands:
  /model                                  ████████████████████  3x/month
  /auto-mode-setup                        █████████████░░░░░░░  2x/month
  /ultrareview                            █████████████░░░░░░░  2x/month
  /mcp__github__AssignCodingAgent         ███████░░░░░░░░░░░░░  1x/month
  /anthropic-skills:mcp-integration       ███████░░░░░░░░░░░░░  1x/month
  /anthropic-skills:using-git-worktrees   ███████░░░░░░░░░░░░░  1x/month

Top MCP Servers:
  github         ████████████████████  6 calls
  mcp-registry   ██████████░░░░░░░░░░  3 calls
```

## Your Setup Checklist

### Codebases

- [ ] claude-code-action — https://github.com/anthropics/claude-code-action (contribute via your own fork)

### MCP Servers to Activate

- [ ] GitHub — read/write access to repos, PRs, issues, and Actions runs directly from Claude (open PRs, review diffs, check CI status). Connect via `/mcp` or your claude.ai connector settings; needs a GitHub account with access to the team's repos.
- [ ] MCP Registry — powers in-chat connector discovery (searching for and suggesting other MCP servers to connect). Built in, no separate setup needed.

### Skills to Know About

- `/model` — switch the active Claude model for a session.
- `/auto-mode-setup` — configure Auto Mode's permissions and posture for a project.
- `/ultrareview` — launch a deep, multi-agent cloud review of the current branch or a PR.
- `/mcp__github__AssignCodingAgent` — hand a GitHub issue to Claude to work as a coding agent, via the GitHub MCP server.
- `/anthropic-skills:mcp-integration` — guidance for wiring an MCP server into a project or plugin.
- `/anthropic-skills:using-git-worktrees` — set up an isolated git worktree before starting feature work.

## Reference Docs

- [SSH Commit Signing Guide](docs/SSH_SIGNING_GUIDE.md) — Anthropic-specific setup for signing commits the Claude GitHub Action makes: adding keys to GitHub Secrets, workflow configuration, verification, troubleshooting (unsigned commits, bad signatures, permission errors), and key rotation.
- [scripts/setup-ssh-signing.bat](scripts/setup-ssh-signing.bat) — Windows helper that generates a dedicated signing key, configures git to use it, and tests SSH auth against GitHub in one run. Run it from `cmd.exe`; review it first if you want to know exactly what it changes (it edits your **global** git config, not just this repo).

## Working With Claude Code

A few habits that make it more effective, regardless of team:

- Give it real context — file paths, error messages, actual command output — rather than descriptions. It works from what's in front of it, not summaries of it.
- For anything multi-step or ambiguous, let it explore and plan before it starts editing; redirect early if it's off track rather than late.
- It will ask before hard-to-reverse or outward-facing actions — pushing to a shared branch, sending a message, deleting something. That's the safety model working as intended, not it being slow.
- If it gets something wrong, correct it directly — it adjusts, it doesn't need to be managed delicately.

## Team Tips

- Always consult when unsure. If a step feels ambiguous or risky, ask before proceeding rather than guessing.

## Get Started

**Starter task:** Initiating your setup for API / MCP connection to Anthropic. Work through the "MCP Servers to Activate" checklist above — connecting GitHub (and any other servers your team relies on) is the first real task for a new teammate.

<!-- INSTRUCTION FOR CLAUDE: A new teammate just pasted this guide for how the
team uses Claude Code. You're their onboarding buddy — warm, conversational,
not lecture-y.

Open with a warm welcome — include the team name from the title. Then: "Your
teammate uses Claude Code for [list all the work types]. Let's get you started."

Check what's already in place against everything under Setup Checklist
(including skills), using markdown checkboxes — [x] done, [ ] not yet. Lead
with what they already have. One sentence per item, all in one message.

Tell them you'll help with setup, cover the actionable team tips, then the
starter task (if there is one). Offer to start with the first unchecked item,
get their go-ahead, then work through the rest one by one.

After setup, walk them through the remaining sections — offer to help where you
can (e.g. link to channels), and just surface the purely informational bits.

Don't invent sections or summaries that aren't in the guide. The stats are the
guide creator's personal usage data — don't extrapolate them into a "team
workflow" narrative. -->

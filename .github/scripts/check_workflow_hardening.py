#!/usr/bin/env python3
"""Fail if a workflow job that calls Claude, or .github/egress-firewall.yaml, breaks a rule in CLAUDE.md,
"Security hardening for GitHub Actions". Run from the repository root. A job calls Claude when it runs the
Claude Code action, or when it or a local action it uses mentions ANTHROPIC_FEDERATION_RULE_ID.
"""

import json
import pathlib
import shlex
import subprocess
import sys

FIREWALL_RUNNER = "ubuntu-24.04-firewall"
WORKFLOW_DIR = pathlib.Path(".github/workflows")
POLICY_PATH = pathlib.Path(".github/egress-firewall.yaml")
SIGN_IN_MARKER = "anthropic_federation_rule_id"
CLAUDE_ACTIONS = ("anthropics/claude-code-action", "anthropics/claude-code-base-action")
HELP = 'See CLAUDE.md, "Security hardening for GitHub Actions".'

# Key: "<workflow file name>:<job id>". Value: why that job is exempt from the table's rule.
EXEMPT_FROM_FIREWALL_RUNNER: dict[str, str] = {}
EXEMPT_FROM_AUTO_MODE: dict[str, str] = {
    "claude.yml:claude": "answers @claude mentions, and for those the Claude Code action sets --permission-mode acceptEdits itself",
}


def stop(message: str):
    sys.exit(f"::error::{message}")


def load_yaml(path: pathlib.Path):
    """Parse a YAML file with PyYAML, or with the yq command if PyYAML is absent."""
    try:
        import yaml
    except ImportError:
        try:
            result = subprocess.run(
                ["yq", "-o=json", ".", str(path)], check=True, capture_output=True, text=True
            )
        except FileNotFoundError:
            stop(
                f"Cannot read {path}: Python has no 'yaml' module and no 'yq' command was found. "
                "Add a step that runs 'pip install pyyaml' before this check."
            )
        except subprocess.CalledProcessError:
            stop(f"Cannot read {path}: 'yq' could not parse it. Check that the file is valid YAML.")
        return json.loads(result.stdout)
    try:
        with path.open(encoding="utf-8") as handle:
            return yaml.safe_load(handle)
    except yaml.YAMLError as error:
        stop(f"Cannot read {path}: it is not valid YAML ({error}).")


def contains_marker(node) -> bool:
    """Whether any key or string under node contains SIGN_IN_MARKER, ignoring case."""
    if isinstance(node, dict):
        return any(contains_marker(k) or contains_marker(v) for k, v in node.items())
    if isinstance(node, list):
        return any(contains_marker(item) for item in node)
    return isinstance(node, str) and SIGN_IN_MARKER in node.lower()


def load_local_action(uses: str):
    """The parsed action file of a local action (uses: ./path), or None."""
    if not uses.startswith("./"):
        return None
    for name in ("action.yml", "action.yaml"):
        action_file = pathlib.Path(uses) / name
        if action_file.is_file():
            action = load_yaml(action_file)
            return action if isinstance(action, dict) else {}
    return None


def steps_of(job: dict) -> list[dict]:
    return [step for step in job.get("steps") or [] if isinstance(step, dict)]


def runs_claude_code_action(step: dict) -> bool:
    """Whether the step runs the Claude Code action: the published action, or a
    local action that accepts a claude_args input."""
    uses = str(step.get("uses", ""))
    if uses.lower().startswith(CLAUDE_ACTIONS):
        return True
    action = load_local_action(uses)
    return action is not None and "claude_args" in (action.get("inputs") or {})


def job_calls_claude(job: dict) -> bool:
    if contains_marker(job):
        return True
    for step in steps_of(job):
        if runs_claude_code_action(step):
            return True
        action = load_local_action(str(step.get("uses", "")))
        if action is not None and contains_marker(action):
            return True
    return False


def permission_mode_problem(step: dict, exempt: bool) -> str | None:
    """The message for a step whose permission mode is wrong, or None if it is right.

    A step must set auto mode. A step of a job in EXEMPT_FROM_AUTO_MODE must set no mode at all.
    """
    inputs = step.get("with") or {}
    lines = str(inputs.get("claude_args", "")).splitlines()
    text = " ".join(line for line in lines if not line.strip().startswith("#"))
    try:
        args = shlex.split(text, comments=True)
    except ValueError:
        return "'claude_args' has a quote that is never closed. Close it"
    modes = []
    for index, arg in enumerate(args):
        if arg == "--dangerously-skip-permissions":
            return (
                "remove '--dangerously-skip-permissions' from 'claude_args': "
                "it turns off permission checks"
            )
        if arg == "--permission-mode":
            modes.append(args[index + 1] if index + 1 < len(args) else "")
        elif arg.startswith("--permission-mode="):
            modes.append(arg.split("=", 1)[1])
    if exempt and modes:
        return (
            "remove '--permission-mode' from 'claude_args': this job is listed in "
            "EXEMPT_FROM_AUTO_MODE (.github/scripts/check_workflow_hardening.py), and a job listed "
            "there must not set a permission mode"
        )
    if not modes and not exempt:
        return "add '--permission-mode auto' to 'claude_args' under the step's 'with:'"
    for mode in modes:
        if mode == "":
            return (
                "'claude_args' has '--permission-mode' with nothing after it. "
                "Write '--permission-mode auto'"
            )
        if mode != "auto":
            return (
                f"'claude_args' has '--permission-mode {mode}'. "
                "Change it to '--permission-mode auto'"
            )
    if "defaultMode" in str(inputs.get("settings", "")):
        return (
            "remove 'defaultMode' from the step's 'settings': "
            "'settings' must not set a permission mode"
        )
    return None


def check_job(file_name: str, job_id: str, job: dict) -> list[str]:
    key = f"{file_name}:{job_id}"
    where = f".github/workflows/{file_name}: job '{job_id}'"
    errors = []
    runs_on = job.get("runs-on")
    if isinstance(runs_on, list) and len(runs_on) == 1:
        runs_on = runs_on[0]
    if key in EXEMPT_FROM_FIREWALL_RUNNER:
        print(
            f"The egress-firewall runner is not required for job '{job_id}' in {file_name}. "
            f"Reason: {EXEMPT_FROM_FIREWALL_RUNNER[key]}."
        )
    elif runs_on != FIREWALL_RUNNER:
        if "runs-on" not in job:
            has = "no 'runs-on'"
        elif isinstance(job["runs-on"], str):
            has = f"'runs-on: {job['runs-on']}'"
        else:
            has = "a 'runs-on' list or group"
        errors.append(
            f"{where} calls Claude, so it must have 'runs-on: {FIREWALL_RUNNER}'. "
            f"It has {has}. {HELP}"
        )
    exempt = key in EXEMPT_FROM_AUTO_MODE
    if exempt:
        print(
            f"Auto permission mode is not required for job '{job_id}' in {file_name}. "
            f"Reason: {EXEMPT_FROM_AUTO_MODE[key]}."
        )
    for index, step in enumerate(steps_of(job), start=1):
        if not runs_claude_code_action(step):
            continue
        problem = permission_mode_problem(step, exempt)
        if problem:
            step_label = f"step '{step['name']}'" if "name" in step else f"step {index}"
            errors.append(f"{where}, {step_label}: {problem}. {HELP}")
    return errors


def check_policy() -> list[str]:
    if not POLICY_PATH.is_file():
        return [
            f"{POLICY_PATH} is missing. Jobs on the egress-firewall runner need it "
            f"to limit outbound network access. {HELP}"
        ]
    policy = load_yaml(POLICY_PATH)
    if not isinstance(policy, dict):
        return [
            f"{POLICY_PATH} is empty or is not a set of 'name: value' lines. It needs 'mode: enforce' "
            f"and an 'allow:' list of hosts. {HELP}"
        ]
    errors = []
    if "mode" not in policy:
        errors.append(f"{POLICY_PATH}: 'mode' is missing. Add 'mode: enforce'. {HELP}")
    elif policy["mode"] != "enforce":
        errors.append(
            f"{POLICY_PATH}: 'mode' is '{policy['mode']}'. It must be 'enforce'. {HELP}"
        )
    allow = policy.get("allow")
    if not isinstance(allow, list) or not allow:
        errors.append(
            f"{POLICY_PATH}: the 'allow' list is missing or empty. List under 'allow:' "
            f"each host the jobs need. {HELP}"
        )
    else:
        for host in allow:
            if "*" in str(host):
                errors.append(
                    f"{POLICY_PATH}: the 'allow' entry '{host}' contains '*'. "
                    f"Name each host in full. {HELP}"
                )
    return errors


def main() -> int:
    if not WORKFLOW_DIR.is_dir():
        stop(f"{WORKFLOW_DIR} not found. Run this check from the repository root.")
    errors = []
    checked = 0
    for path in sorted([*WORKFLOW_DIR.glob("*.yml"), *WORKFLOW_DIR.glob("*.yaml")]):
        workflow = load_yaml(path)
        jobs = workflow.get("jobs") if isinstance(workflow, dict) else None
        for job_id, job in (jobs or {}).items():
            if not isinstance(job, dict) or not job_calls_claude(job):
                continue
            checked += 1
            errors.extend(check_job(path.name, job_id, job))
    if checked:
        errors.extend(check_policy())
    for error in errors:
        print(f"::error::{error}")
    if errors:
        return 1
    if checked == 0:
        print("OK: no workflow job calls Claude, so there was nothing to check.")
    else:
        print(f"OK: checked {checked} job(s) that call Claude and found no problems.")
    return 0


if __name__ == "__main__":
    sys.exit(main())

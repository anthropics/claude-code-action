# Sourced by the git wrappers. Clears settings in the environment that change what
# git runs, and sets the arguments every wrapper passes to git. Files beside this
# script, written by the action, record the session's repository and hook setting.

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

while IFS= read -r name; do
  case "$name" in
    GIT_AUTHOR_* | GIT_COMMITTER_*) ;;
    GIT_*) unset "$name" ;;
  esac
done < <(compgen -e)
unset XDG_CONFIG_HOME EDITOR VISUAL PAGER SSH_ASKPASS

git_args=(-c core.fsmonitor=false -c safe.bareRepository=explicit)
if [[ -e "$script_dir/.no-hooks" ]]; then
  git_args+=(-c core.hooksPath=/dev/null)
fi
if [[ -e "$script_dir/.git-repo" ]]; then
  { IFS= read -r git_dir; IFS= read -r work_tree; IFS= read -r home || true; } <"$script_dir/.git-repo"
  git_args+=("--git-dir=$git_dir" "--work-tree=$work_tree")
  if [[ -n "$home" ]]; then
    export HOME="$home"
  fi
fi

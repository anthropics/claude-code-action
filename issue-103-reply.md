Found a simple workaround that works today:

1. Tag Claude on issue → creates branch
2. Open a PR from that branch
3. All subsequent Claude tags go on the PR → Claude reuses the same branch

This leverages existing behavior where Claude always works on the PR branch when triggered on open PRs. No multiple branches, full iterative development.

Bonus: PRs often have deployment previews/CI results, making it easier to test changes as you iterate.

Given this workflow addresses the core need (iterative work on same branch), perhaps this issue could be closed? The PR-based approach might even be preferable as it provides better visibility of ongoing work.
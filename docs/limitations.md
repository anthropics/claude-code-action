## Limitations

- Inline comments require the affected lines to be present in the latest diff.
- The workflow does not deduplicate findings across multiple runs; rerun the job to refresh comments.
- No support yet for triaging issues outside merge requests (e.g., issues, commits).
- Large diffs may exceed model context window; consider focusing on critical files before invoking Claude.


# Pull Request

## Title

feat: Add HTML img tag support to GitHub image downloader

## Body

### Background

GitHub image downloader currently only supports Markdown image syntax `![](url)`. However, users sometimes use HTML `<img>` tags in comments and PR descriptions, which are not detected by the current implementation.

### What's New

This PR adds support for HTML `<img>` tags while maintaining full backward compatibility:

- **HTML img tag detection**: Added `HTML_IMG_REGEX` to detect `<img src="...">` format
- **Quote flexibility**: Supports both single and double quotes in HTML attributes
- **Mixed format support**: Handles documents with both Markdown and HTML images
- **URL deduplication**: Prevents duplicate downloads when the same image appears in both formats

### Examples

```markdown
<!-- Existing Markdown format (still works) -->

![Screenshot](https://github.com/user-attachments/assets/screenshot.png)

<!-- New HTML format (now supported) -->
<img src="https://github.com/user-attachments/assets/diagram.jpg" alt="Architecture">

<!-- Mixed usage (both detected, duplicates removed) -->

![old](https://github.com/user-attachments/assets/image.png)
<img src="https://github.com/user-attachments/assets/image.png" alt="same image">
```

No breaking changes - all existing functionality is preserved.

# Setup Claude Code Action

This subaction installs the Claude Code CLI with built-in caching and plugin support. It can be used standalone or as part of the main `claude-code-action`.

## Features

- 🚀 Fast installation with built-in caching
- 🔌 Plugin marketplace and installation support
- 📦 Version pinning (stable, latest, or specific versions)
- 🔄 Automatic cache management (daily rotation for latest, permanent for specific versions)
- 🔐 GitHub token support for private plugin repositories

## Usage

### Basic Installation

Install the latest stable version of Claude Code:

```yaml
- uses: anthropics/claude-code-action/setup@beta
  with:
    version: stable
```

### With Plugins

Install Claude Code with plugins from a marketplace:

```yaml
- uses: anthropics/claude-code-action/setup@beta
  with:
    version: stable
    marketplaces: pleaseai/claude-code-plugins
    plugins: nanobanana@pleaseai
```

### Multiple Plugins

Install multiple plugins (comma or newline-separated):

```yaml
- uses: anthropics/claude-code-action/setup@beta
  with:
    version: stable
    marketplaces: |
      pleaseai/claude-code-plugins
      passionfactory
    plugins: |
      nanobanana@pleaseai
      dev-tools@passionfactory
      testing@passionfactory
```

### Specific Version

Pin to a specific Claude Code version:

```yaml
- uses: anthropics/claude-code-action/setup@beta
  with:
    version: 2.0.1
```

### Custom GitHub Token

Use a custom GitHub token for private plugin repositories:

```yaml
- uses: anthropics/claude-code-action/setup@beta
  with:
    version: stable
    github_token: ${{ secrets.CUSTOM_GITHUB_TOKEN }}
    marketplaces: myorg/private-plugins
    plugins: custom-plugin@myorg
```

## Inputs

| Input          | Description                                                                   | Required | Default               |
| -------------- | ----------------------------------------------------------------------------- | -------- | --------------------- |
| `version`      | Claude Code version to install (`stable`, `latest`, or specific like `2.0.1`) | No       | `stable`              |
| `github_token` | GitHub token for plugin repository access                                     | No       | `${{ github.token }}` |
| `marketplaces` | Plugin marketplaces to add (comma or newline-separated)                       | No       | `""`                  |
| `plugins`      | Plugins to install (comma or newline-separated)                               | No       | `""`                  |

### Marketplace Formats

Marketplaces can be specified in various formats:

- **GitHub repository**: `owner/repo` (e.g., `pleaseai/claude-code-plugins`)
- **GitHub repository shorthand**: `passionfactory` (uses default naming convention)
- **Git URL**: `https://github.com/owner/repo.git`
- **Local path**: `/path/to/marketplace`
- **Remote URL**: `https://example.com/marketplace`

### Plugin Formats

Plugins are specified as: `plugin-name@marketplace`

Examples:

- `nanobanana@pleaseai`
- `dev-tools@passionfactory`
- `custom-plugin@myorg`

## Outputs

| Output               | Description                                                       |
| -------------------- | ----------------------------------------------------------------- |
| `cache-hit`          | Boolean indicating whether cache was restored (`true` or `false`) |
| `version`            | Installed Claude Code version (e.g., `2.0.1`)                     |
| `claude-path`        | Absolute path to Claude Code executable                           |
| `marketplaces_added` | Number of marketplaces successfully added                         |
| `plugins_installed`  | Comma-separated list of successfully installed plugin names       |

## Caching Behavior

The action automatically caches Claude Code installations to speed up subsequent runs:

- **Latest version**: Cache rotates daily (includes date in cache key)
- **Stable version**: Cache rotates daily (treated as latest)
- **Specific version** (e.g., `2.0.1`): Cache is permanent (version-specific key)

Cache includes:

- `~/.local/bin/claude` - Claude Code executable
- `~/.claude/` - Claude Code configuration and plugins

## Examples

### Standalone Setup

```yaml
name: Setup Claude Code
on: [push]

jobs:
  setup:
    runs-on: ubuntu-latest
    steps:
      - uses: anthropics/claude-code-action/setup@beta
        with:
          version: stable

      - name: Verify installation
        run: claude --version
```

### With Main Action

The main `claude-code-action` uses this setup action internally:

```yaml
name: Claude Code Automation
on:
  issue_comment:
    types: [created]

jobs:
  claude:
    runs-on: ubuntu-latest
    steps:
      - uses: anthropics/claude-code-action@beta
        with:
          anthropic_api_key: ${{ secrets.ANTHROPIC_API_KEY }}
          # The action will automatically use the setup subaction
```

### Cache Output Example

```yaml
- uses: anthropics/claude-code-action/setup@beta
  id: setup
  with:
    version: stable

- name: Check cache status
  run: |
    echo "Cache hit: ${{ steps.setup.outputs.cache-hit }}"
    echo "Version: ${{ steps.setup.outputs.version }}"
    echo "Path: ${{ steps.setup.outputs.claude-path }}"
```

## Troubleshooting

### Plugin Installation Fails

If plugin installation fails, ensure:

1. The marketplace has been added before installing plugins
2. The `github_token` has access to the plugin repository
3. The plugin name format is correct: `plugin-name@marketplace`

### Cache Not Working

Cache may not work if:

- Running on a self-hosted runner without cache support
- Cache storage quota is exceeded
- Different OS/architecture between runs

### Version Not Found

If a specific version is not found:

- Check https://github.com/anthropics/claude-code/releases for available versions
- Use `stable` or `latest` instead of a specific version number

## Related Actions

- [Main Claude Code Action](../README.md) - Full automation platform
- [actions/cache](https://github.com/actions/cache) - Caching inspiration

## License

MIT

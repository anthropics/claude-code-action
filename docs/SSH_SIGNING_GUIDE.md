# SSH Commit Signing Guide

Enable cryptographic signing of commits created by Claude Code Action using SSH keys.

## Quick Start

### 1. Add SSH Key to GitHub Secrets

**Store your SSH private key as a GitHub repository secret:**

1. Go to your repository → **Settings** → **Secrets and variables** → **Actions**
2. Click **New repository secret**
3. Name: `SSH_SIGNING_KEY` (or your preferred name)
4. Paste your SSH private key content
5. Click **Add secret**

**Example SSH private key format:**

```
-----BEGIN OPENSSH PRIVATE KEY-----
b3BlbnNzaC1rZXktdjEAAAAABG5vbmUAAAAEbm9uZQAAAAAAAAABAAAAMwAAAAtzc2gtZW
QyNTUxOQAAACBT1bcEFI4vz7VVZV9rUUL4W8GvTar7BJCt3BrDjKrrPAAAAJAhzOhQIczo
UAAAAAtzc2gtZWQyNTUxOQAAACBT1bcEFI4vz7VVZV9rUUL4W8GvTar7BJCt3BrDjKrrPA
AAAEAZGcOPwWjgfp4uBS3g8dnheFis01o4Rxws8YJZ/MxsrlPVtwQUji/PtVVlX2tRQvhb
wa9NqvsEkK3cGsOMqus8AAAAC3Jvb3RAY2xhdWRlAQI=
-----END OPENSSH PRIVATE KEY-----
```

### 2. Configure Action Workflow

**Use the SSH key in your workflow:**

```yaml
- name: Claude Code Action
  uses: anthropic-ai/claude-code-action@v1.0
  with:
    prompt: "Fix the failing tests"
    ssh_signing_key: ${{ secrets.SSH_SIGNING_KEY }}
  env:
    ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
```

### 3. Verify Signature

After the action runs and creates commits, verify they're signed:

```bash
git log --show-signature
```

You should see:

```
commit abc123def456...
gpg: Signature made using ssh key
Good "ssh" signature from your-key-id
Author: claude[bot] <claude[bot]@users.noreply.github.com>
Date:   Mon Aug 25 02:00:00 2026 +0000

    Your commit message here
```

---

## Setup Details

### SSH Key Types Supported

- **ED25519** (Recommended) - Modern, secure, smaller keys
- **RSA** (4096-bit minimum) - Widely supported
- **ECDSA** - Also supported

### Workflow with SSH Signing

1. **Workflow starts** → Action installed and dependencies prepared
2. **Action runs** → SSH key injected from GitHub Secret
3. **Git operations** → All commits are signed with the SSH key
4. **Cleanup** → SSH key removed from environment after completion (automatic)
5. **Workflow ends** → No traces of the signing key remain

### Security Notes

✅ **What's Protected:**

- SSH key is stored as a GitHub Secret (encrypted at rest)
- Key is only available during action execution
- Automatic cleanup removes key from environment after each step
- Key is never logged or exposed in action outputs
- Cleanup runs even if action fails (via `always()` step)

⚠️ **Important Considerations:**

- **Rotation**: If a key is compromised, [add it to a blocked keys list](https://github.com/settings/ssh/blocked_keys)
- **Permissions**: Keep the key's read permissions minimal
- **Testing**: Test with a non-production key first
- **Expiration**: Consider key rotation strategy (e.g., quarterly)

---

## Configuration Options

### Input: `ssh_signing_key`

```yaml
ssh_signing_key:
  description: "SSH private key for signing commits. When provided, git will be configured to use SSH signing."
  required: false
  type: string
```

**When to use:**

- You want all commits to be cryptographically signed
- Your organization requires commit signature verification
- You're integrating with tools that verify commit signatures

### Related Input: `use_commit_signing`

```yaml
use_commit_signing:
  description: "Enable commit signing using GitHub's commit signature verification"
  required: false
  default: "false"
```

**Relationship:**

- `ssh_signing_key` takes precedence over `use_commit_signing`
- When `ssh_signing_key` is provided, SSH signing is used
- `use_commit_signing` enables GitHub's default signing when SSH key is not provided

---

## Usage Examples

### Example 1: Basic Usage

```yaml
name: Claude Code with SSH Signing

on:
  issue_comment:
    types: [created]

jobs:
  claude:
    runs-on: ubuntu-latest
    if: github.event.issue.pull_request && contains(github.event.comment.body, '@claude')
    steps:
      - uses: actions/checkout@v4

      - name: Claude Code
        uses: anthropic-ai/claude-code-action@v1.0
        with:
          prompt: "Review and fix the code"
          ssh_signing_key: ${{ secrets.SSH_SIGNING_KEY }}
        env:
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
```

### Example 2: Multiple Signing Keys

If you have different keys for different purposes:

```yaml
- name: Claude Code (Production)
  uses: anthropic-ai/claude-code-action@v1.0
  with:
    prompt: "Fix production issues"
    ssh_signing_key: ${{ secrets.SSH_SIGNING_KEY_PROD }}

- name: Claude Code (Development)
  uses: anthropic-ai/claude-code-action@v1.0
  with:
    prompt: "Improve code quality"
    ssh_signing_key: ${{ secrets.SSH_SIGNING_KEY_DEV }}
```

### Example 3: Conditional Signing

```yaml
- name: Claude Code
  uses: anthropic-ai/claude-code-action@v1.0
  with:
    prompt: "Your instruction"
    # Only sign commits when merging to main
    ssh_signing_key: ${{ github.ref == 'refs/heads/main' && secrets.SSH_SIGNING_KEY || '' }}
  env:
    ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
```

---

## Troubleshooting

### Commits Not Signed

**Issue:** Commits are created but not signed

**Solutions:**

1. Verify the secret is set correctly:

   ```bash
   # In your workflow:
   - run: echo "Secret exists: ${{ secrets.SSH_SIGNING_KEY != '' }}"
   ```

2. Check SSH key format - must be valid OpenSSH format:

   ```bash
   # Should start with:
   -----BEGIN OPENSSH PRIVATE KEY-----
   # Not:
   -----BEGIN RSA PRIVATE KEY-----  # This is OpenSSL format, not OpenSSH
   ```

3. Verify git configuration is applied:
   ```bash
   git config --get user.signingkey
   git config --get gpg.format
   ```

### "Bad signature" Errors

**Issue:** Git reports signature validation errors

**Solutions:**

1. Ensure the public key is added to your GitHub account:

   - Settings → SSH and GPG keys → Check public key is listed

2. Verify key hasn't been revoked:

   - Settings → SSH and GPG keys → Review key status

3. Confirm git signing format matches:
   ```bash
   git config --get gpg.format  # Should be "ssh"
   ```

### Permission Denied

**Issue:** "Permission denied (publickey)" when signing

**Solutions:**

1. Verify the private key has read permissions:

   ```bash
   ls -la ~/.ssh/your_key  # Should be -rw------- (600)
   ```

2. Check SSH agent is running (cleanup may have disabled it):

   ```bash
   ssh-add -l  # List loaded keys
   ```

3. Ensure the public key is registered with GitHub

---

## Advanced: Key Management

### Generating SSH Keys for Signing

**Using ED25519 (Recommended):**

```bash
ssh-keygen -t ed25519 -C "claude-signing-key" -f ~/.ssh/claude_signing
# Press Enter twice to skip passphrase (required for CI/CD)
cat ~/.ssh/claude_signing  # Copy to GitHub Secret
```

**Using RSA (4096-bit):**

```bash
ssh-keygen -t rsa -b 4096 -C "claude-signing-key" -f ~/.ssh/claude_signing
cat ~/.ssh/claude_signing  # Copy to GitHub Secret
```

### Key Rotation Strategy

1. **Generate new key**: `ssh-keygen -t ed25519 -C "claude-signing-v2"`
2. **Add to GitHub**: Settings → SSH and GPG keys → New SSH key
3. **Update secret**: Update `SSH_SIGNING_KEY` to new key
4. **Remove old key**: Delete from SSH keys in Settings (after verifying new key works)
5. **Revoke if needed**: If old key was compromised, add to blocked keys

### Monitoring Signed Commits

**View signing history in GitHub:**

- Go to repository → Insights → Network
- Filter by author "claude[bot]"
- Look for "Verified" badge on commits

**Audit with git:**

```bash
# Show all signed commits
git log --pretty=format:"%h %s %G? %an" --grep="signed"

# Verify specific commit
git verify-commit <commit-sha>
```

---

## Integration with Branch Protection

Enable branch protection with signing requirements:

1. Go to **Settings** → **Branches** → **Branch protection rules**
2. Select your protected branch
3. Enable **Require signed commits**
4. Enable **Require branches to be up to date before merging**

Now, Claude Code commits will be required to be signed to merge.

---

## Frequently Asked Questions

**Q: Do I need to store the private key as a Secret?**
A: Yes. Never commit SSH private keys to your repository. Always use GitHub Secrets.

**Q: Can I use the same key for multiple repositories?**
A: Yes, but it's recommended to use separate keys per repository for security.

**Q: What happens if the key expires?**
A: The action will fail when trying to sign. Update the Secret with a new key.

**Q: Does SSH signing work on Windows/macOS runners?**
A: Yes, SSH signing is platform-independent and works on all GitHub-hosted runners.

**Q: Can I rotate keys without downtime?**
A: Yes. Add the new key as a Secret, update the workflow, then remove the old key once verified.

**Q: What if my key has a passphrase?**
A: Remove the passphrase before storing in GitHub Secrets. Passphrases are not supported in CI/CD.

```bash
# Remove passphrase from existing key:
ssh-keygen -p -N "" -m pem -f ~/.ssh/your_key
```

---

## Reference

- [GitHub SSH Key Verification Docs](https://docs.github.com/en/authentication/managing-commit-signature-verification)
- [OpenSSH Key Format](https://www.rfc-editor.org/rfc/rfc8032.html)
- [Git Signing Configuration](https://git-scm.com/docs/git-config#git-config-userSigningKey)

@echo off
setlocal enabledelayedexpansion

rem ============================================================================
rem setup-ssh-signing.bat
rem
rem Generates (or reuses) a dedicated SSH signing key, configures git to sign
rem commits with it, and tests SSH authentication against GitHub. Windows
rem companion to the "Verification Script" / "Quick Commands Reference"
rem sections of docs\SSH_SIGNING_GUIDE.md — same key path, same git config,
rem same commands, just runnable directly from cmd.exe.
rem
rem This sets up commit signing for YOUR local commits. It does not touch the
rem repo's GitHub Actions secrets — see docs\SSH_SIGNING_GUIDE.md "Add SSH Key
rem to GitHub Secrets" if you're configuring the Claude Code Action itself.
rem ============================================================================

echo.
echo === SSH commit signing setup ===
echo.

where ssh-keygen >nul 2>&1
if errorlevel 1 (
    echo [ERROR] ssh-keygen not found on PATH.
    echo         Install the Windows "OpenSSH Client" optional feature, or use
    echo         Git for Windows, which bundles it ^(and provides this shell^).
    exit /b 1
)

set "KEY_DIR=%USERPROFILE%\.ssh"
set "KEY_PATH=%KEY_DIR%\claude_sign"

if not exist "%KEY_DIR%" (
    mkdir "%KEY_DIR%"
)

if exist "%KEY_PATH%" (
    echo [OK] Signing key already exists at %KEY_PATH%
) else (
    echo Generating a new ED25519 signing key at %KEY_PATH%
    echo ^(dedicated to signing — don't reuse your personal login key^)
    ssh-keygen -t ed25519 -C "signing-key" -f "%KEY_PATH%" -N ""
    if errorlevel 1 (
        echo [ERROR] Key generation failed.
        exit /b 1
    )
)

echo.
echo Configuring git for SSH commit signing...
git config --global gpg.format ssh
git config --global user.signingkey "%KEY_PATH%"
git config --global commit.gpgsign true
echo [OK] git config --global gpg.format ssh
echo [OK] git config --global user.signingkey %KEY_PATH%
echo [OK] git config --global commit.gpgsign true

echo.
echo Registering github.com's host key...
ssh-keyscan -t ed25519 github.com >> "%KEY_DIR%\known_hosts" 2>nul

echo.
echo Testing SSH authentication to GitHub...
echo ^(GitHub always closes with an error here even on success — it has no
echo  shell to give you. "successfully authenticated" is what to look for.^)
ssh -T git@github.com

echo.
echo === Public key ^(add this to GitHub -^> Settings -^> SSH and GPG keys,
echo     as a *Signing Key*^) ===
echo.
type "%KEY_PATH%.pub"

echo.
echo === Private key ^(only needed if you're wiring this into the GitHub
echo     Actions workflow as the SSH_SIGNING_KEY secret — see
echo     docs\SSH_SIGNING_GUIDE.md. Treat this as a credential: don't paste
echo     it anywhere but a GitHub Secret, and don't commit it. ===
echo.
echo     type "%KEY_PATH%"
echo.

echo Done. Verify with:
echo   git commit -m "test" --allow-empty
echo   git log --show-signature -1
echo.

endlocal

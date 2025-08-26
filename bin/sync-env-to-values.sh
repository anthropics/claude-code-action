#!/bin/bash

# Sync .env values to charts/peerbot/values-local.yaml
# This script reads environment variables from .env and updates the Helm values file

set -e

ENV_FILE=".env"
VALUES_FILE="charts/peerbot/values-local.yaml"

if [[ ! -f "$ENV_FILE" ]]; then
    echo "Error: $ENV_FILE not found"
    exit 1
fi

if [[ ! -f "$VALUES_FILE" ]]; then
    echo "Error: $VALUES_FILE not found"
    exit 1
fi

echo "🔄 Syncing .env values to $VALUES_FILE..."

# Source the .env file to load variables
set -a  # automatically export all variables
source "$ENV_FILE"
set +a

# Create a temporary file for the updated values
TEMP_FILE=$(mktemp)

# Extract password from connection string if needed
if [[ -n "$POSTGRESQL_CONNECTION_STRING" && -z "$POSTGRESQL_PASSWORD" ]]; then
    # Extract password from postgres://user:password@host:port/db format
    POSTGRESQL_PASSWORD=$(echo "$POSTGRESQL_CONNECTION_STRING" | sed -n 's|.*://[^:]*:\([^@]*\)@.*|\1|p')
fi

# Set default values for undefined variables to avoid awk errors
SLACK_BOT_TOKEN="${SLACK_BOT_TOKEN:-}"
SLACK_SIGNING_SECRET="${SLACK_SIGNING_SECRET:-}"
SLACK_APP_TOKEN="${SLACK_APP_TOKEN:-}"
GITHUB_TOKEN="${GITHUB_TOKEN:-}"
CLAUDE_CODE_OAUTH_TOKEN="${CLAUDE_CODE_OAUTH_TOKEN:-}"
POSTGRESQL_PASSWORD="${POSTGRESQL_PASSWORD:-}"

# Read the current values file and replace the secrets section
awk -v slack_bot_token="$SLACK_BOT_TOKEN" \
    -v slack_signing_secret="$SLACK_SIGNING_SECRET" \
    -v slack_app_token="$SLACK_APP_TOKEN" \
    -v github_token="$GITHUB_TOKEN" \
    -v claude_oauth_token="$CLAUDE_CODE_OAUTH_TOKEN" \
    -v postgresql_password="$POSTGRESQL_PASSWORD" \
'BEGIN {
    in_secrets = 0
    secrets_updated = 0
}
/^secrets:/ {
    in_secrets = 1
    print $0
    print "  slackBotToken: \"" slack_bot_token "\""
    print "  slackSigningSecret: \"" slack_signing_secret "\""
    print "  slackAppToken: \"" slack_app_token "\""
    print "  githubToken: \"" github_token "\""
    print "  claudeCodeOAuthToken: \"" claude_oauth_token "\""
    print "  postgresqlPassword: \"" postgresql_password "\""
    secrets_updated = 1
    next
}
/^[a-zA-Z]/ && in_secrets == 1 {
    in_secrets = 0
}
in_secrets == 1 && /^  [a-zA-Z]/ {
    # Skip existing secret lines, they will be replaced
    next
}
{
    print $0
}
' "$VALUES_FILE" > "$TEMP_FILE"

# Replace the original file and set proper permissions
mv "$TEMP_FILE" "$VALUES_FILE"
chmod 644 "$VALUES_FILE"

echo "✅ Successfully synced .env values to $VALUES_FILE"
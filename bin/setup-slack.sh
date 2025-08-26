#!/bin/bash

set -e

# Helper functions
ask() {
    local prompt="$1"
    local response
    read -p "$prompt" response
    echo "$response"
}

check_command() {
    command -v "$1" >/dev/null 2>&1
}

run_command() {
    local cmd="$1"
    local cwd="${2:-}"
    if [[ -n "$cwd" ]]; then
        (cd "$cwd" && eval "$cmd")
    else
        eval "$cmd"
    fi
}

copy_to_clipboard() {
    local content="$1"
    case "$(uname -s)" in
        Darwin)
            echo "$content" | pbcopy
            ;;
        Linux)
            if command -v xclip >/dev/null 2>&1; then
                echo "$content" | xclip -selection clipboard
            else
                return 1
            fi
            ;;
        MINGW*|CYGWIN*)
            echo "$content" | clip
            ;;
        *)
            return 1
            ;;
    esac
}

check_slack_cli() {
    check_command slack
}

run_slack_command() {
    local cmd="$1"
    eval "$cmd"
}

generate_bot_name() {
    local username=$(whoami)
    local hostname=$(hostname | sed 's/\.\(local\|lan\)$//')
    
    # Create a clean, personalized name
    if echo "$hostname" | grep -E "(MacBook|iMac|Mac-)" >/dev/null; then
        echo "PeerBot-${username}s-Mac"
    else
        echo "PeerBot-${hostname}"
    fi
}

check_prerequisites() {
    echo "📋 Checking prerequisites..."
    echo ""
    
    local checks=("docker:Docker:true" "kubectl:kubectl:true" "skaffold:Skaffold:true")
    
    for check in "${checks[@]}"; do
        IFS=':' read -r command name required <<< "$check"
        if check_command "$command"; then
            echo "✅ $name found"
        elif [[ "$required" == "true" ]]; then
            echo "❌ $name is required but not found"
            echo "   Please install $name and try again."
            exit 1
        else
            echo "⚠️  $name not found (optional)"
        fi
    done
    echo ""
}

load_env_file() {
    if [[ -f .env ]]; then
        # Source .env file while avoiding issues with special characters
        set -a
        source .env 2>/dev/null || true
        set +a
    fi
}

show_env_content() {
    local env_content="$1"
    
    if [[ -f .env ]]; then
        echo ""
        echo "📋 .env file already exists!"
        echo "=============================="
        echo ""
        echo "Please manually add/update these values in your existing .env file:"
        echo ""
        echo "$env_content"
        echo ""
        
        # Try to copy to clipboard
        if copy_to_clipboard "$env_content"; then
            echo "✅ New configuration copied to clipboard!"
        else
            echo "📋 Copy the configuration above manually"
        fi
        
        echo ""
        echo "⚠️  Please merge the configuration above with your existing .env file."
        echo "   Add any missing variables and update existing ones as needed."
    else
        echo ""
        echo "📋 Creating .env file..."
        echo "========================"
        echo ""
        echo "$env_content" > .env
        echo "✅ .env file created with the configuration above."
        
        # Also show content and copy to clipboard for reference
        echo ""
        echo "Configuration saved:"
        echo "$env_content"
        copy_to_clipboard "$env_content" >/dev/null 2>&1
    fi
    echo ""
}

setup_slack_interactive() {
    echo "🤖 Slack Configuration"
    echo ""
    
    if [[ -n "$SLACK_BOT_TOKEN" && -n "$SLACK_SIGNING_SECRET" && -n "$SLACK_APP_TOKEN" ]]; then
        echo "✅ Slack tokens already configured"
        local reconfigure=$(ask "Do you want to create a new Slack app? (y/N): ")
        if [[ "$reconfigure" != "y" && "$reconfigure" != "Y" ]]; then
            echo "   Using existing Slack configuration"
            return 0
        fi
        echo ""
        echo "🔄 Creating new Slack app..."
    fi
    
    # Load manifest
    local manifest_path="slack-app-manifest.json"
    if [[ ! -f "$manifest_path" ]]; then
        echo "❌ slack-app-manifest.json not found!"
        echo "Looking in: $(pwd)/$manifest_path"
        exit 1
    fi
    
    # Generate bot name
    local default_bot_name=$(generate_bot_name)
    echo "🏷️  Suggested bot name: $default_bot_name"
    
    local custom_name=$(ask "Custom name (press Enter to use suggested): ")
    local bot_name="${custom_name:-$default_bot_name}"
    echo "✅ Using bot name: $bot_name"
    echo ""
    
    # Check Slack CLI
    if check_slack_cli; then
        echo "✅ Slack CLI found"
        local use_cli=$(ask "Create app automatically? (Y/n): ")
        
        if [[ "$use_cli" != "n" && "$use_cli" != "N" ]]; then
            echo ""
            echo "🚀 Creating app..."
            if run_slack_command "slack create $bot_name --manifest $manifest_path"; then
                echo "✅ App created! Get tokens from Slack dashboard and update .env"
                return 0
            else
                echo "❌ CLI failed, using manual setup..."
                echo ""
            fi
        fi
    fi
    
    # Manual setup
    echo "📋 Manual setup:"
    
    # Create personalized manifest
    local manifest_json=$(cat "$manifest_path")
    local personalized_manifest=$(echo "$manifest_json" | sed "s/\"PeerBot\"/\"$bot_name\"/g")
    
    # Create direct Slack app creation link
    local encoded_manifest=$(echo "$personalized_manifest" | jq -c . | python3 -c "import sys, urllib.parse; print(urllib.parse.quote(sys.stdin.read()))" 2>/dev/null || echo "")
    local direct_create_url="https://api.slack.com/apps?new_app=1&manifest_json=$encoded_manifest"
    
    # Show manifest preview
    echo ""
    echo "📄 Manifest preview:"
    echo "$personalized_manifest" | head -10
    echo "... (more lines)"
    echo ""
    
    echo "🔗 Easy Setup:"
    echo "1. Click this direct link to create your Slack app:"
    echo "   $direct_create_url"
    echo "2. Review the manifest and click \"Create App\""
    echo "3. Copy the App ID from the URL or Basic Information page"
    
    # Fallback for copy/paste method
    echo ""
    echo "📋 Alternative (copy/paste method):"
    echo "1. Go to: https://api.slack.com/apps?new_app=1"
    echo "2. Select \"From an app manifest\""
    echo "3. Paste the manifest below and create app"
    
    if copy_to_clipboard "$personalized_manifest"; then
        echo "✅ Manifest copied to clipboard for fallback"
    else
        echo "📋 Manifest to copy:"
        echo ""
        echo "$personalized_manifest"
    fi
    
    local app_id=$(ask $'\nApp ID (e.g., A01234567): ')
    
    if [[ -z "$app_id" ]]; then
        echo "❌ App ID is required"
        exit 1
    fi
    
    # Get tokens with dynamic URLs
    echo ""
    echo "📋 Go to: https://api.slack.com/apps/$app_id/general"
    echo "   On this page you'll find:"
    echo ""
    echo "   1️⃣ Signing Secret (in App Credentials section)"
    local signing_secret=$(ask "Signing Secret: ")
    
    echo ""
    echo "   2️⃣ App-Level Tokens (scroll down)"
    echo "      → Click \"Generate Token and Scopes\""
    echo "      → Give it a name (e.g., \"peerbot-mode\")"
    echo "      → Add scope: connections:write"
    echo "      → Click \"Generate\""
    local app_token=$(ask "App-Level Token (xapp-...): ")
    
    echo ""
    echo "📋 Install to Peerbot and get your Bot Token from: https://api.slack.com/apps/$app_id/oauth"
    local bot_token=$(ask "Bot User OAuth Token (xoxb-...): ")
    
    # Update environment variables
    export SLACK_BOT_TOKEN="$bot_token"
    export SLACK_APP_TOKEN="$app_token"
    export SLACK_SIGNING_SECRET="$signing_secret"
    
    # Display masked values
    echo ""
    echo "📋 Your configuration:"
    echo "SLACK_BOT_TOKEN=${bot_token:0:10}...${bot_token: -4}"
    echo "SLACK_APP_TOKEN=${app_token:0:10}...${app_token: -4}"
    echo "SLACK_SIGNING_SECRET=${signing_secret:0:4}...${signing_secret: -4}"
    
    echo ""
    echo "✅ Slack configuration complete!"
}

setup_github() {
    echo ""
    echo "🐙 GitHub Configuration"
    echo ""
    
    if [[ -n "$GITHUB_TOKEN" ]]; then
        echo "✅ GitHub token already configured"
        local reconfigure=$(ask "Do you want to configure a new GitHub token? (y/N): ")
        if [[ "$reconfigure" != "y" && "$reconfigure" != "Y" ]]; then
            echo "   Using existing GitHub configuration"
            return 0
        fi
        echo ""
        echo "🔄 Configuring new GitHub token..."
    fi
    
    echo "📋 Create a GitHub Personal Access Token:"
    echo "1. Visit: https://github.com/settings/tokens/new"
    echo "2. Give it a name (e.g., \"PeerBot Development\")"
    echo "3. Select scopes: repo, workflow, admin:org"
    echo "4. Generate token and copy it"
    echo ""
    
    local github_token=$(ask "GitHub Personal Access Token: ")
    if [[ -z "$github_token" ]]; then
        echo "❌ GitHub token is required"
        exit 1
    fi
    
    export GITHUB_TOKEN="$github_token"
    
    if [[ -z "$GITHUB_ORGANIZATION" ]]; then
        local github_org=$(ask "GitHub Organization (default: peerbot-community): ")
        export GITHUB_ORGANIZATION="${github_org:-peerbot-community}"
    fi
    
    if [[ -z "$GITHUB_REPOSITORY" ]]; then
        echo ""
        echo "📂 Repository Configuration:"
        echo "You can optionally specify a single GitHub repository URL to use for all users."
        echo "If not provided, the bot will automatically create individual repositories for each user."
        echo ""
        echo "Examples:"
        echo "  - Leave empty: Bot creates user-specific repos (user-john, user-jane, etc.)"
        echo "  - https://github.com/yourorg/shared-workspace: All users work in this repository"
        echo ""
        local github_repo=$(ask "GitHub Repository URL (optional, press Enter to skip): ")
        if [[ -n "$github_repo" ]]; then
            export GITHUB_REPOSITORY="$github_repo"
        fi
    fi
}

setup_claude() {
    echo ""
    echo "🤖 Claude Configuration"
    echo ""
    
    if [[ -n "$CLAUDE_CODE_OAUTH_TOKEN" ]]; then
        echo "✅ Claude token already configured"
        local reconfigure=$(ask "Do you want to configure a new Claude token? (y/N): ")
        if [[ "$reconfigure" != "y" && "$reconfigure" != "Y" ]]; then
            echo "   Using existing Claude configuration"
            return 0
        fi
        echo ""
        echo "🔄 Configuring new Claude token..."
    fi
    
    echo "🔧 Setting up Claude Code OAuth token..."
    
    # Try to run claude setup-token
    if check_command claude; then
        echo "Running: claude setup-token"
        local claude_output=$(claude setup-token 2>&1)
        local claude_exit_code=$?
        
        if [[ $claude_exit_code -eq 0 ]]; then
            # Try to extract token from output using regex
            local extracted_token=$(echo "$claude_output" | grep -o 'sk-ant-[a-zA-Z0-9_-]*' | head -1)
            
            if [[ -n "$extracted_token" ]]; then
                export CLAUDE_CODE_OAUTH_TOKEN="$extracted_token"
                echo "✅ Claude token configured from command output"
                return 0
            fi
            
            # Fallback: Try to get the token from claude's config
            local claude_config_path="$HOME/.claude/config.json"
            if [[ -f "$claude_config_path" ]]; then
                local oauth_token=$(jq -r '.oauthToken // empty' "$claude_config_path" 2>/dev/null || echo "")
                if [[ -n "$oauth_token" ]]; then
                    export CLAUDE_CODE_OAUTH_TOKEN="$oauth_token"
                    echo "✅ Claude token configured from ~/.claude/config.json"
                    return 0
                fi
            fi
        else
            echo "Claude setup-token output:"
            echo "$claude_output"
        fi
    fi
    
    echo ""
    echo "⚠️  Could not automatically get Claude token."
    local manual_token=$(ask "Please enter Claude token manually (starts with sk-ant, or press Enter to skip): ")
    if [[ -n "$manual_token" ]]; then
        export CLAUDE_CODE_OAUTH_TOKEN="$manual_token"
    fi
    
    # Configure worker cleanup
    if [[ -z "$WORKER_IDLE_CLEANUP_MINUTES" ]]; then
        echo ""
        echo "🧹 Worker Cleanup Configuration"
        echo "Configure how long idle workers stay running before being automatically deleted."
        echo "This helps save resources by cleaning up workers that haven't received messages."
        echo ""
        local cleanup_minutes=$(ask "Minutes before cleaning up idle workers (default: 60): ")
        export WORKER_IDLE_CLEANUP_MINUTES="${cleanup_minutes:-60}"
    fi
}

setup_postgresql() {
    echo ""
    echo "🐘 PostgreSQL Configuration"
    echo ""
    
    if [[ -n "$POSTGRESQL_CONNECTION_STRING" ]]; then
        echo "✅ PostgreSQL connection string already configured"
        local reconfigure=$(ask "Do you want to generate a new PostgreSQL connection? (y/N): ")
        if [[ "$reconfigure" != "y" && "$reconfigure" != "Y" ]]; then
            echo "   Using existing PostgreSQL configuration"
            return 0
        fi
        echo ""
        echo "🔄 Generating new PostgreSQL connection..."
    fi
    
    # Generate a random password
    local password=$(openssl rand -base64 12 | tr -d "=+/" | cut -c1-12)
    export POSTGRESQL_CONNECTION_STRING="postgres://postgres:${password}@localhost:5432/peerbot"
    echo "✅ Generated PostgreSQL connection string with password: $password"
}

create_values_local() {
    echo ""
    echo "📝 Configuring values-local.yaml..."
    echo ""
    
    if [[ -f charts/peerbot/values-local.yaml ]]; then
        echo "⚠️  values-local.yaml already exists!"
        echo ""
        echo "Please manually update the secrets section in charts/peerbot/values-local.yaml:"
        
        # Load current env vars for the manual update display
        load_env_file
        
        # Create the secrets section content
        local secrets_content="secrets:
  slackBotToken: \"${SLACK_BOT_TOKEN:-}\"
  slackSigningSecret: \"${SLACK_SIGNING_SECRET:-}\"
  slackAppToken: \"${SLACK_APP_TOKEN:-}\"
  githubToken: \"${GITHUB_TOKEN:-}\"
  claudeCodeOAuthToken: \"${CLAUDE_CODE_OAUTH_TOKEN:-}\"
  postgresqlPassword: \"${POSTGRESQL_PASSWORD:-}\""
        
        echo ""
        echo "$secrets_content"
        
        # Try to copy to clipboard
        if copy_to_clipboard "$secrets_content"; then
            echo ""
            echo "✅ Secrets configuration copied to clipboard!"
        fi
        
        echo ""
        echo "Please replace the secrets section in charts/peerbot/values-local.yaml with the content above."
        echo "Press Enter when you have updated the file..."
        read -r
    else
        echo "Creating values-local.yaml from template..."
        
        # Copy values.yaml to values-local.yaml ONLY if it doesn't exist
        cp charts/peerbot/values.yaml charts/peerbot/values-local.yaml
        
        # Run sync script to populate secrets
        if ! ./bin/sync-env-to-values.sh; then
            echo "❌ Failed to sync env to values"
            exit 1
        fi
        echo "✅ values-local.yaml created and configured"
    fi
}

setup_kubernetes() {
    echo ""
    echo "☸️  Kubernetes Configuration"
    echo ""
    
    local namespace=$(ask "Kubernetes namespace (default: peerbot): ")
    namespace="${namespace:-peerbot}"
    
    echo "Using namespace: $namespace"
    
    if kubectl create namespace "$namespace" 2>/dev/null; then
        echo "✅ Created namespace \"$namespace\""
    else
        echo "ℹ️  Namespace \"$namespace\" already exists"
    fi
    
    # Store namespace for later use
    export KUBERNETES_NAMESPACE="$namespace"
    
    # If user chose non-default namespace, suggest updating values-local.yaml
    if [[ "$namespace" != "peerbot" ]]; then
        echo ""
        echo "⚠️  You selected a non-default namespace: $namespace"
        echo ""
        echo "Consider updating the namespace in charts/peerbot/values-local.yaml:"
        echo "kubernetes:"
        echo "  namespace: \"$namespace\""
        echo ""
        
        # Try to copy to clipboard
        local namespace_config="kubernetes:
  namespace: \"$namespace\""
        
        if copy_to_clipboard "$namespace_config"; then
            echo "✅ Namespace configuration copied to clipboard!"
        fi
        
        echo "This will ensure Helm deployments use the correct namespace."
        echo ""
    fi
}

create_env_content() {
    cat << EOF
# Slack App Configuration
SLACK_BOT_TOKEN=${SLACK_BOT_TOKEN:-}
SLACK_APP_TOKEN=${SLACK_APP_TOKEN:-}
SLACK_SIGNING_SECRET=${SLACK_SIGNING_SECRET:-}

# GitHub Configuration
GITHUB_TOKEN=${GITHUB_TOKEN:-}
GITHUB_ORGANIZATION=${GITHUB_ORGANIZATION:-}
GITHUB_REPOSITORY=${GITHUB_REPOSITORY:-}

# Claude Configuration
CLAUDE_CODE_OAUTH_TOKEN=${CLAUDE_CODE_OAUTH_TOKEN:-}

# PostgreSQL Configuration
POSTGRESQL_CONNECTION_STRING=${POSTGRESQL_CONNECTION_STRING:-}

# Worker Configuration
WORKER_IDLE_CLEANUP_MINUTES=${WORKER_IDLE_CLEANUP_MINUTES:-60}

# Kubernetes Configuration
KUBERNETES_NAMESPACE=${KUBERNETES_NAMESPACE:-peerbot}
EOF
}

full_setup() {
    clear
    echo "🚀 PeerBot Development Setup"
    echo ""
    echo "============================="
    echo ""
    
    check_prerequisites
    
    load_env_file
    
    # Capture original env content before setup
    local original_env_content=$(create_env_content)
    
    setup_slack_interactive
    setup_github
    setup_claude
    setup_postgresql
    
    # Only show env content if something was configured or .env doesn't exist
    local new_env_content=$(create_env_content)
    if [[ "$original_env_content" != "$new_env_content" ]] || [[ ! -f .env ]]; then
        echo ""
        echo "💾 Configuration ready..."
        
        # Check if .env already exists before we show content
        local env_existed=false
        if [[ -f .env ]]; then
            env_existed=true
        fi
        
        show_env_content "$new_env_content"
        
        # Wait for user to confirm .env file is ready (only if it already existed)
        if [[ "$env_existed" == "true" ]]; then
            echo "Press Enter when you have updated your .env file to continue..."
            read -r
        fi
    else
        echo ""
        echo "✅ All configuration is already up to date - proceeding with setup..."
    fi
    
    create_values_local
    setup_kubernetes
    
    echo ""
    echo "======================================"
    echo "✅ Development environment is ready!"
    echo "======================================"
    echo ""
    echo "To start the development environment, run:"
    echo "  make dev"
    echo ""
    echo "Skaffold will automatically build and deploy Docker images."
    echo "Happy coding! 🚀"
}

# Main execution - run the setup directly
full_setup
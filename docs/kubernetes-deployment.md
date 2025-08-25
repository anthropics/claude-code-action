# Kubernetes Deployment Guide

This guide covers deploying the Peerbot to Google Kubernetes Engine (GKE) using the provided Helm charts.

## Architecture Overview

The Peerbot uses a **dispatcher-worker pattern** for scalable, thread-based conversations:

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Dispatcher    │    │   Worker Jobs   │    │  GCS + GitHub   │
│   (Long-lived)  │───▶│   (Ephemeral)   │───▶│  (Persistence)  │
│                 │    │                 │    │                 │
│ • Slack Events  │    │ • User Workspace│    │ • Conversations │
│ • Thread Routing│    │ • Claude CLI    │    │ • Code Changes  │
│ • Job Spawning  │    │ • 5min Timeout  │    │ • Session Data  │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

### Key Components

- **Dispatcher**: Long-lived pod that handles Slack events and spawns worker Jobs
- **Worker**: Ephemeral Kubernetes Jobs (one per conversation thread)  
- **Thread-based Sessions**: Each Slack thread becomes a persistent conversation
- **GCS Persistence**: Conversation history stored in Google Cloud Storage
- **User Repositories**: Each user gets a dedicated GitHub repository

## Prerequisites

### 1. GKE Autopilot Cluster

Create a GKE Autopilot cluster (recommended for serverless experience):

```bash
# Set project and region
export PROJECT_ID="your-project-id"
export REGION="us-central1"
export CLUSTER_NAME="peerbot-cluster"

# Create cluster
gcloud container clusters create-auto $CLUSTER_NAME \
  --location=$REGION \
  --project=$PROJECT_ID

# Get credentials
gcloud container clusters get-credentials $CLUSTER_NAME \
  --location=$REGION \
  --project=$PROJECT_ID
```

### 2. Workload Identity

Enable Workload Identity for secure GCS access:

```bash
# Create Google Service Account
gcloud iam service-accounts create claude-code-bot \
  --display-name="Peerbot" \
  --project=$PROJECT_ID

# Grant GCS permissions
gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:claude-code-bot@$PROJECT_ID.iam.gserviceaccount.com" \
  --role="roles/storage.admin"

# Enable Workload Identity binding
gcloud iam service-accounts add-iam-policy-binding \
  --role roles/iam.workloadIdentityUser \
  --member "serviceAccount:$PROJECT_ID.svc.id.goog[peerbot/claude-worker]" \
  claude-code-bot@$PROJECT_ID.iam.gserviceaccount.com
```

### 3. GCS Bucket

Create the conversation storage bucket:

```bash
gsutil mb -p $PROJECT_ID -l $REGION gs://peerbot-conversations-prod
```

### 4. GitHub Organization

Create a GitHub organization for user repositories:

1. Go to [GitHub Organizations](https://github.com/organizations/new)
2. Create organization named `peerbot-community` (or your preferred name)
3. Generate a [Personal Access Token](https://github.com/settings/tokens) with repo permissions

### 5. Slack App

Create a Slack app for the bot:

1. Go to [Slack API Apps](https://api.slack.com/apps)
2. Click "Create New App" → "From scratch"
3. Configure the app with these permissions:

```yaml
oauth_config:
  scopes:
    bot:
      - app_mentions:read
      - channels:history
      - channels:read
      - chat:write
      - files:read
      - users:read
      - reactions:write
```

4. Enable Socket Mode and generate an App Token
5. Install the app to your workspace

## Deployment

### 1. Add Helm Repository

```bash
# Clone the repository
git clone https://github.com/buremba/claude-code-slack.git
cd claude-code-slack
```

### 2. Configure Values

Create a values file for your environment:

```bash
# Create values file
cat > values-production.yaml <<EOF
# Production configuration for PeerBot

global:
  imageRegistry: "ghcr.io/"

# Update service account annotation
serviceAccount:
  annotations:
    iam.gke.io/gcp-service-account: claude-code-bot@$PROJECT_ID.iam.gserviceaccount.com

# Secrets (set these via helm --set or external secret management)
secrets:
  slackBotToken: ""  # xoxb-your-bot-token
  githubToken: ""    # ghp_your-github-token

# Configuration
config:
  gcsProjectId: "$PROJECT_ID"
  githubOrganization: "peerbot-community"

# Resource configuration for production
dispatcher:
  replicaCount: 2
  resources:
    requests:
      cpu: 1000m
      memory: 2Gi
    limits:
      cpu: 2000m
      memory: 4Gi

worker:
  resources:
    requests:
      cpu: 2000m
      memory: 4Gi
    limits:
      cpu: 4000m
      memory: 8Gi

# Enable pod disruption budget
podDisruptionBudget:
  enabled: true
  minAvailable: 1
EOF
```

### 3. Deploy with Helm

```bash
# Install the chart
helm upgrade --install peerbot charts/peerbot \
  --namespace peerbot \
  --create-namespace \
  --values values-production.yaml \
  --set secrets.slackBotToken="$SLACK_BOT_TOKEN" \
  --set secrets.githubToken="$GITHUB_TOKEN" \
  --wait

# Verify deployment
kubectl get pods -n peerbot
kubectl logs -f deployment/peerbot-dispatcher -n peerbot
```

### 4. Verify Slack Integration

Test the bot by mentioning it in a Slack channel:

```
@peerbotai Hello! Can you help me create a simple Python script?
```

You should see:
1. Initial response with worker details and GitHub links
2. Progress updates as Claude works
3. Final response with results and PR links

## Configuration

### Environment Variables

The system uses these configuration options:

| Variable | Description | Default |
|----------|-------------|---------|
| `SLACK_BOT_TOKEN` | Slack bot token (xoxb-...) | Required |
| `SLACK_TRIGGER_PHRASE` | Phrase to trigger the bot | `@peerbotai` |
| `GITHUB_TOKEN` | GitHub personal access token | Required |
| `GITHUB_ORGANIZATION` | GitHub org for user repos | `peerbot-community` |
| `SESSION_TIMEOUT_MINUTES` | Worker timeout in minutes | `5` |
| `WORKER_CPU` | CPU request for workers | `2000m` |
| `WORKER_MEMORY` | Memory request for workers | `4Gi` |

### Slack Configuration

Configure Slack app permissions and settings:

```yaml
slack:
  triggerPhrase: "@peerbotai"
  allowDirectMessages: true
  allowPrivateChannels: false
  enableStatusReactions: true
  enableProgressUpdates: true
```

### Resource Limits

Adjust resources based on your needs:

```yaml
# For small teams (< 10 users)
dispatcher:
  resources:
    requests: { cpu: 500m, memory: 1Gi }
    limits: { cpu: 1000m, memory: 2Gi }

worker:
  resources:
    requests: { cpu: 1000m, memory: 2Gi }
    limits: { cpu: 2000m, memory: 4Gi }

# For large teams (> 50 users)
dispatcher:
  replicaCount: 3
  resources:
    requests: { cpu: 1000m, memory: 2Gi }
    limits: { cpu: 2000m, memory: 4Gi }

worker:
  resources:
    requests: { cpu: 2000m, memory: 4Gi }
    limits: { cpu: 4000m, memory: 8Gi }
```

## Monitoring

### Health Checks

The dispatcher exposes health endpoints:

```bash
# Check dispatcher health
kubectl port-forward service/peerbot-dispatcher 3000:3000 -n peerbot
curl http://localhost:3000/health
```

### Metrics and Logs

Monitor the system with kubectl:

```bash
# View dispatcher logs
kubectl logs -f deployment/peerbot-dispatcher -n peerbot

# View worker job logs
kubectl logs jobs/claude-worker-abc123 -n peerbot

# Monitor active jobs
kubectl get jobs -n peerbot -w

# Check worker pods
kubectl get pods -l app.kubernetes.io/component=worker -n peerbot
```

### Troubleshooting

Common issues and solutions:

**1. Workers not starting**
```bash
# Check RBAC permissions
kubectl auth can-i create jobs --as=system:serviceaccount:peerbot:claude-worker -n peerbot

# Check job creation
kubectl describe job claude-worker-xyz -n peerbot
```

**2. GCS permissions errors**
```bash
# Verify Workload Identity
kubectl describe serviceaccount claude-worker -n peerbot

# Test GCS access from worker
kubectl run debug --rm -it --image=google/cloud-sdk:alpine \
  --serviceaccount=claude-worker -n peerbot -- \
  gsutil ls gs://peerbot-conversations-prod
```

**3. GitHub authentication issues**
```bash
# Check GitHub token permissions
kubectl get secret peerbot-secrets -n peerbot -o yaml | \
  grep github-token | base64 -d
```

## Scaling

### Horizontal Scaling

Enable autoscaling for the dispatcher:

```yaml
autoscaling:
  enabled: true
  minReplicas: 2
  maxReplicas: 10
  targetCPUUtilizationPercentage: 70
```

### Resource Optimization

For GKE Autopilot, optimize for efficiency:

```yaml
# Efficient resource allocation
dispatcher:
  resources:
    requests:
      cpu: 250m      # Autopilot minimum
      memory: 512Mi  # Autopilot minimum

worker:
  resources:
    requests:
      cpu: 1000m     # Claude needs substantial CPU
      memory: 2Gi    # Memory for Git operations
```

## Security

### Network Policies

Implement network policies for security:

```yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: peerbot-network-policy
  namespace: peerbot
spec:
  podSelector:
    matchLabels:
      app.kubernetes.io/name: peerbot
  policyTypes:
  - Ingress
  - Egress
  ingress:
  - from: [] # Allow all ingress (for Slack webhooks)
  egress:
  - {} # Allow all egress (for GitHub, GCS, Claude API)
```

### Secret Management

Use external secret management for production:

```yaml
# External Secrets Operator integration
apiVersion: external-secrets.io/v1beta1
kind: ExternalSecret
metadata:
  name: peerbot-secrets
spec:
  refreshInterval: 1h
  secretStoreRef:
    name: gcpsm-secret-store
    kind: SecretStore
  target:
    name: peerbot-secrets
  data:
  - secretKey: slack-bot-token
    remoteRef:
      key: peerbot-slack-bot-token
  - secretKey: github-token
    remoteRef:
      key: peerbot-github-token
```

## Backup and Recovery

### Conversation Backup

GCS conversations are automatically versioned. For additional backup:

```bash
# Sync to backup bucket
gsutil -m rsync -r -d gs://peerbot-conversations-prod gs://peerbot-conversations-backup
```

### Disaster Recovery

In case of cluster failure:

1. **Rebuild cluster** with same configuration
2. **Restore secrets** from backup/secret manager
3. **Redeploy** using Helm charts
4. **Verify** Slack integration

Conversations and user repositories are preserved in GCS and GitHub.

## Updates

### Automated Updates

The GitHub Actions workflow automatically builds and deploys on main branch pushes.

### Manual Updates

For manual updates:

```bash
# Update Helm chart
helm upgrade peerbot charts/peerbot \
  --namespace peerbot \
  --values values-production.yaml \
  --set dispatcher.image.tag=new-tag \
  --set worker.image.tag=new-tag

# Rollback if needed
helm rollback peerbot -n peerbot
```

## Cost Optimization

### For GKE Autopilot

- **Right-size resources**: Autopilot charges for requests, not limits
- **Use efficient ratios**: CPU:Memory ratio of 1:2 or 1:4 is most efficient
- **Enable cluster autoscaling**: Automatically scale nodes based on demand
- **Use preemptible workers**: For non-critical workloads

### Example Cost-Optimized Configuration

```yaml
# Optimized for cost
dispatcher:
  resources:
    requests:
      cpu: 250m
      memory: 512Mi

worker:
  resources:
    requests:
      cpu: 1000m
      memory: 2Gi
    
# Enable pod disruption budget for preemptible nodes
podDisruptionBudget:
  enabled: true
  minAvailable: 1
```

This deployment guide provides a complete setup for running the Peerbot on Kubernetes with enterprise-grade reliability and security.
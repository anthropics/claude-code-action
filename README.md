# Claude Code Slack

A powerful [Claude Code](https://claude.ai/code) Slack application that brings AI-powered programming assistance directly to your Slack workspace with **Kubernetes-based scaling** and **persistent thread conversations**.

## Installation

- Install [Skaffold](https://skaffold.dev/)
- Install [Kubernetes K3S](https://k3s.io/)
- Run `make dev`
- Create `.env` file as follows:

```
SLACK_SIGNING_SECRET=
SLACK_BOT_TOKEN=
SLACK_APP_TOKEN=
GITHUB_TOKEN= (personal access token for the bot to interact with git)
CLAUDE_CODE_OAUTH_TOKEN= (claude setup-token)
```

-- If you need to run QA tests (`./test-bot.js`), create `.env.qa` as follows:

```
SLACK_SIGNING_SECRET=
SLACK_BOT_TOKEN=
SLACK_APP_TOKEN=
TARGET_BOT_USERNAME=peerqa
```


## 🎯 Key Features

### 💬 **Thread-Based Persistent Conversations**
- Each Slack thread becomes a dedicated AI coding session
- Full conversation history preserved across interactions
- Resume work exactly where you left off

### 🏗️ **Kubernetes-Powered Architecture**
- **Dispatcher-Worker Pattern**: Scalable, isolated execution
- **Per-User Containers**: Each session gets dedicated resources
- **5-Minute Sessions**: Focused, efficient coding sessions
- **Auto-Scaling**: Handles multiple users simultaneously

### 👤 **Individual GitHub Workspaces**  
- **Personal Repositories**: Each user gets `user-{username}` repository
- **Automatic Git Operations**: Code commits and branch management
- **GitHub.dev Integration**: Direct links to online code editor
- **Pull Request Creation**: Easy code review workflow

### 🔄 **Real-Time Progress Streaming**
- Live updates as Claude works on your code
- Worker resource monitoring (CPU, memory, timeout)
- Transparent execution with detailed progress logs

## 🚀 Architecture Overview

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Dispatcher    │    │   Worker Jobs   │    │  GitHub         │
│   (Long-lived)  │───▶│   (Ephemeral)   │───▶│  (Persistence)  │
│                 │    │                 │    │                 │
│ • Slack Events  │    │ • User Workspace│    │ • Data on Slack │
│ • Thread Routing│    │ • Claude CLI    │    │ • Code Changes  │
│ • Job Spawning  │    │ • 5min Timeout  │    │ • Session Data  │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

## 📋 Deployment Options

Choose your deployment approach:

### 🎯 **Option 1: Kubernetes (Recommended)**
Full-featured deployment with per-user isolation and persistence

**Benefits:**
- ✅ Per-user containers and GitHub repositories  
- ✅ Thread-based conversation persistence via Kubernetes PVC
- ✅ Horizontal scaling for large teams
- ✅ Enterprise security and monitoring
- ✅ Persistent volume-based session storage

**Prerequisites:**
- Kubernetes cluster (GKE, EKS, AKS, or local)
- GitHub organization for user repositories
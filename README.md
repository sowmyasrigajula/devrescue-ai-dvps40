# DevRescue AI

DevRescue AI is a demo-ready prototype for **DVPS40: Autonomous Auto-Fixing DevOps Telegram Bot**.

It acts like a Telegram DevOps agent that:

- accepts Railway/Vercel-style deployment logs,
- detects the backend root cause,
- pulls from a protected `dev` branch snapshot,
- writes a minimal backend code fix,
- runs build validation,
- performs automated code review,
- prepares a PR summary back to the `dev` branch,
- blocks direct writes to `main`.

## Supported Demo Fixes

The browser demo includes three selectable deployment incidents:

1. Backend service export mismatch
2. Undefined backend route handler
3. Backend middleware path mismatch

The demo runs with zero external dependencies.

## Quick Demo

```bash
npm run demo
```

This will run all three demo fixes:

1. service import repair,
2. route handler repair,
3. middleware import path repair.

## Browser Demo

```bash
npm run server
```

Open:

```txt
http://localhost:8080
```

Click **Run Auto-Fix** to see the full incident response dashboard.

## Optional Live GitHub PR

By default, the dashboard shows a local PR preview so the demo works without internet or credentials.

To enable the **Create Live PR** button, create a GitHub demo repository with a `dev` branch and set:

```powershell
$env:GITHUB_TOKEN="your_fine_grained_github_token"
$env:GITHUB_OWNER="your_github_username_or_org"
$env:GITHUB_REPO="your_demo_repo"
npm run server
```

The token needs **contents write** and **pull request write** access. The live flow creates a fix branch from `dev`, writes only the patched backend file under `live-demo-target/<scenario>/...`, and opens a PR back to `dev`.

Before using live PR mode, make sure these files are pushed to the remote `dev` branch too. That gives GitHub a clean before/after diff for the patched backend file.

## Run Tests

```bash
npm test
```

## Run Telegram-Style Local Server

```bash
npm run server
```

Then send a fake Telegram update:

```bash
curl -X POST http://localhost:8080/telegram/webhook \
  -H "Content-Type: application/json" \
  -d "{\"message\":{\"chat\":{\"id\":1},\"text\":\"SyntaxError: The requested module './services/userService.js' does not provide an export named 'createUser'\"}}"
```

## Hackathon Pitch

**DevRescue AI** reads deployment failures, diagnoses the exact cause, applies a safe fix on a branch from `dev`, self-reviews the change, and creates a PR instead of pushing directly to production.

For the live demo, keep the flow simple:

1. Show the Railway backend failure log.
2. Open the browser dashboard.
3. Click `Run Auto-Fix`.
4. Show the step-by-step Telegram response.
5. Show the backend code diff.
6. Show automated review checks.
7. Show generated PR title/body targeting `dev`.

## Real Integration Roadmap

- Telegram Bot API for live messages.
- GitHub App or Octokit for branch, commit, and PR creation.
- CI provider webhooks from Vercel, Railway, Render, or GitHub Actions.
- LLM provider for broader error diagnosis.
- Secret scanning and permission boundaries before any patch is proposed.

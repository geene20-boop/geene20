---
name: dev-environment
description: Start Next.js development server for geene20 (ERP/생산관리 앱). Use this skill whenever you need to run the app locally, test changes, verify that the application is working, or check if new features are rendering correctly in the browser. This includes any time you make code changes and want to see them in action.
compatibility: Node.js 22+, npm
---

# Development Environment

Start and manage the Next.js development server for the geene20 project.

## Setup (first time only)

If dependencies aren't installed yet:

```bash
npm install
```

## Starting the Development Server

Launch the Next.js dev server:

```bash
npm run dev
```

The server will start on `http://localhost:3000`. Wait about 10-12 seconds for it to fully initialize (you'll see `Ready in XXXms` in the logs).

## Verifying the App is Running

Once started, test the key pages:

- **QC Measurement Page**: `curl -s http://localhost:3000/qc | grep -o "생산시각\|측정시각" | head -5`
- **Admin Page**: `curl -s http://localhost:3000/admin | grep -o "계정 관리" | head -1`
- **Worker Roster**: `curl -s http://localhost:3000/worker | grep -o "근로자명부" | head -1`

Each request should return the expected Korean text, confirming the page loaded successfully.

## Using the App

- Navigate between sections using the top menu
- Pages load with current date/time auto-filled where applicable
- All forms support real-time validation

## Stopping the Server

Press `Ctrl+C` in the terminal, or kill the process:

```bash
pkill -f "next dev"
```

## Common Issues

| Issue | Solution |
|-------|----------|
| Port 3000 already in use | Kill the existing process: `lsof -i :3000 \| grep LISTEN \| awk '{print $2}' \| xargs kill -9` |
| Dependencies not found | Run `npm install` again |
| Slow build | First build takes longer; subsequent rebuilds are faster |

## Environment Variables

No environment variables required for local development. The app uses a local SQLite database by default.

## Hot Reload

Changes to `.tsx`, `.ts`, `.css`, and component files automatically reload in the browser. No restart needed for most changes.

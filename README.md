# test-eff-ai

Uses Effect (4.0.0-beta.83) with a custom Cortecs.ai provider to call the Chat Completions API (`/v1/chat/completions`). Shows a TUI spinner while waiting for the API.

## Setup

Create `.env` with your API key:

```
CORTECS_API_KEY=eyJhbGci...
```

## Run

```bash
pnpx tsx src/main.ts
```

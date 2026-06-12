# Chat Graph

Chat Graph is a React + TypeScript + Three.js prototype for nonlinear agent conversations. It treats every user message, assistant reply, and reusable context note as a graph node. Edges describe reply chains, context citations, branches, references, support, or contradiction.

The app is intentionally frontend-first. It ships with a built-in mock agent so the graph interface works immediately, then lets you switch to an HTTP agent endpoint when you are ready to connect a local model, an OpenAI-compatible proxy, OpenClaw, or another backend.

## Features

- 2D node editor rendered with Three.js inside a React/TSX app.
- Drag nodes, pan the canvas, zoom with the wheel, shift-click for multi-select.
- Branch from any selected node.
- Merge multiple selected nodes into one new user turn.
- Link arbitrary nodes with reference edges; Alt-click while linking creates a contradiction edge.
- Context lens builds a prompt bundle from selected graph neighborhoods.
- Node inspector with editable title, body, tags, context radius, and agent settings.
- IndexedDB autosave.
- JSON import/export.
- Mock agent included by default.

## Run it

```bash
npm install
npm run dev
```

Open the local Vite URL, usually `http://localhost:5173`.

## Build

```bash
npm run build
npm run preview
```

## Connecting a real agent

Switch **Agent mode** from `mock` to `http` in the Inspector. By default the app posts to `/api/chat` with this shape:

```json
{
	"messages": [
		{ "role": "system", "content": "..." },
		{ "role": "user", "content": "..." },
		{ "role": "assistant", "content": "..." }
	],
	"context": {
		"anchor_ids": ["node_id"],
		"nodes": [],
		"edges": [],
		"digest": "human-readable graph context"
	}
}
```

The endpoint can return any of these shapes:

```json
{ "text": "reply text" }
```

```json
{ "content": "reply text" }
```

```json
{ "choices": [{ "message": { "content": "reply text" } }] }
```

Do not place private API keys in the browser. Use a small backend proxy for commercial model APIs.

## Mental model

The graph is the database. The chat transcript is a temporary projection of whichever nodes you select. This means you can keep separate threads, synthesize multiple branches, attach durable context cards, and preserve contradictory branches without forcing the whole conversation into one fragile timeline.

## Suggested next steps

- Add edge editing and edge labels.
- Add graph search by tag/title/body.
- Add streaming token updates from the HTTP endpoint.
- Add summarizer nodes that compress large subgraphs.
- Add layout tools: radial, force-directed, chronological lane, and manual pinning.
- Add per-node embedding vectors and semantic neighborhood expansion.
- Add an agent tool channel so graph mutations can be suggested or performed by the agent.

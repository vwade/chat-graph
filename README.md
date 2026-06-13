# Chat Graph

Chat Graph is a nonlinear chat interface for agent conversations.

Instead of treating a conversation as a single vertical transcript, Chat Graph treats every user message, assistant response, branch, reference, contradiction, summary, and context bundle as part of a navigable graph.

The goal is to let a user think with an agent spatially: branching, recombining, annotating, and selecting context visually through a 2D node-editor interface built with React, TypeScript, and Three.js.

> Chat Graph turns conversation history into navigable context.

The app is intentionally frontend-first. It ships with a built-in mock agent so the graph interface works immediately, then lets you switch to an HTTP agent endpoint when you are ready to connect a local model, an OpenAI-compatible proxy, OpenClaw, or another backend.

## Features

- 2D node editor rendered with Three.js inside a React/TSX app.
- Drag nodes, pan the canvas, zoom with the wheel, shift-click for multi-select.
- Branch from any selected node.
- Merge multiple selected nodes into one new user turn.
- Link arbitrary nodes with reference edges; Alt-click while linking creates a contradiction edge.
- Context compiler previews prompt bundles from selected graph neighborhoods with traversal toggles.
- Additive thread/JSON import previews that preserve imported conversations as unique threads.
- Local semantic context candidates for finding related nodes and creating reference edges.
- Node inspector with editable title, semantic node kind, body, tags, context radius, and agent settings.
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

## Long-term goal

Chat Graph is a local-first semantic conversation graph for humans and agents. It imports chats from many sources, preserves branching conversations, keeps JSON artifacts inspectable, recommends relevant context, and gives multiple model providers one shared graph space to work in.

## Mental model

The graph is the database. The chat transcript is a temporary projection of whichever nodes you select. This means you can keep separate threads, synthesize multiple branches, attach durable context cards, and preserve contradictory branches without forcing the whole conversation into one fragile timeline.

## Roadmap

See [ROADMAP.md](./ROADMAP.md) for the v0.1–v0.3 plan, semantic node and edge taxonomy, and Context Compiler direction.

## Suggested next steps

- Add edge editing and edge labels.
- Connect semantic context candidates to a backend vector store such as ChromaDB.
- Add streaming token updates from the HTTP endpoint.
- Add summarizer nodes that compress large subgraphs.
- Add layout tools: radial, force-directed 2D/3D, chronological lane, and manual pinning.
- Add per-node embedding vectors and semantic neighborhood expansion.
- Add an agent tool channel so graph mutations can be suggested or performed by the agent.

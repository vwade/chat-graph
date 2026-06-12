# Chat Graph Roadmap

Chat Graph turns conversation history into navigable context. The near-term roadmap focuses on turning the prototype into a stable foundation for graph-native agent work.

## v0.1 — Prototype Foundation

- Three.js 2D graph canvas
- Chat nodes and reply/context edges
- Local IndexedDB persistence
- JSON import/export
- Mock agent and HTTP agent adapter
- Context bundle generation from selected graph nodes

## v0.2 — Graph Intelligence

- Better context compiler
- Branch summaries
- Graph traversal presets
- Context weights and edge semantics
- Node search
- Collapsible subgraphs
- Multi-select context composition

## v0.3 — Agent Integration

- Real backend adapter
- Streaming replies
- Tool-call visualization
- Per-node model metadata
- System prompt and memory panels
- Conversation snapshots
- Graph diff / merge tools

## Design questions

### What does a node mean?

A message node is enough for the initial prototype, but the platform should support multiple thought-object species:

```ts
type GraphNodeKind =
	| 'user_message'
	| 'assistant_message'
	| 'system_instruction'
	| 'summary'
	| 'memory'
	| 'artifact'
	| 'tool_call'
	| 'tool_result'
	| 'decision'
	| 'question'
	| 'claim'
	| 'reference'
	| 'branch_root'
	| 'context_bundle';
```

Messages then become one category of graph object rather than the whole data model. A decision can cite the evidence that caused it. A claim can be supported, contradicted, or revised. A context bundle can represent the exact payload sent to an agent.

### What does an edge mean?

Edges should preserve semantic intent so traversal and context compilation can become explainable:

```ts
type GraphEdgeKind =
	| 'reply_to'
	| 'references'
	| 'supports'
	| 'contradicts'
	| 'revises'
	| 'branches_from'
	| 'summarizes'
	| 'contains'
	| 'uses_context'
	| 'generated'
	| 'tool_input'
	| 'tool_output';
```

## First platform feature: Context Compiler

The Context Compiler should let a user select nodes, choose traversal rules, and preview the exact bundle sent to an agent.

```text
Context Mode:
[x] Selected node
[x] Ancestors
[x] Direct replies
[ ] Contradictions
[x] Summaries
[ ] Tool outputs
Depth: 3
Token budget: 12000
Compression: Balanced
```

The important principle: the app builds agent input from the graph, not from a hidden linear transcript.

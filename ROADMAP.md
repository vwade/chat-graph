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



## Long-term thesis

Chat Graph turns scattered conversations into a shared semantic space.

- A thread is a subgraph.
- A transcript is a selected path.
- A memory is a durable node.
- A summary is a derived node with provenance.
- An agent reply is a graph mutation.
- Context is not history; context is a compiled view.

## Import and semantic retrieval sequence

1. Import Preview for ChatGPT exports, message arrays, and generic JSON files.
2. GraphPatch commits so large imports merge into the current graph without replacing it.
3. Provenance, trust, content type, thread, branch, and JSON metadata on imported nodes.
4. Local semantic context candidates as the first relevance layer.
5. Backend semantic index status and vector-store adapters, with ChromaDB as a likely local bridge.
6. Context Compiler v2 with hard context, soft context, exclusions, provenance, and token budgets.
7. Multi-agent registry so different providers share the same contextual graph space.
8. Force-directed 2D/3D layout after the graph has semantic gravity.

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
	| 'json_artifact'
	| 'json_field'
	| 'tool_call'
	| 'tool_result'
	| 'decision'
	| 'question'
	| 'claim'
	| 'reference'
	| 'branch_root'
	| 'thread_root'
	| 'agent_session'
	| 'semantic_cluster'
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
	| 'variant_of'
	| 'summarizes'
	| 'contains'
	| 'uses_context'
	| 'generated'
	| 'semantic_match'
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

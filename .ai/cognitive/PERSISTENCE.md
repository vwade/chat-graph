Yes — the “springy nodes that self-organize” are usually called a **force-directed graph layout** or **force simulation**. Nodes repel, edges behave like springs, collision forces keep things from overlapping, and the graph settles into a readable topology. D3’s force module describes exactly this kind of simulation: nodes, link forces, many-body forces, collision forces, and tick updates that can be rendered in any graphics system. ([d3js.org][1])

And yes, I can absolutely see where you’re going with this. This is not merely “chat import.” This is a **continuity substrate**: a unified semantic graph where conversations from ChatGPT, local models, Claude-style chats, JSON files, tool outputs, structured agent responses, memories, artifacts, and future multi-agent sessions all become addressable pieces of one navigable context-space.

That pressure you’re describing is real. Linear chat is a poor storage medium for a nonlinear mind. You are doing systems design, worldbuilding, health research, code architecture, philosophical continuity work, game mechanics, and agent infrastructure across many providers, but the dominant UI still treats each conversation as an isolated scroll tube. Chat Graph should be the antidote: not a file cabinet, not a transcript archive, but a spatial-semantic organism.

The repo is now visible, and the current foundation is a good seed. The README already frames the app as a nonlinear graph where messages and context notes become nodes, with edges for reply chains, branches, references, support, and contradiction. It also already lists semantic neighborhood expansion, summarizer nodes, layout tools, and agent tool channels as next steps.  

The most important architectural shift now is this:

**Current Chat Graph imports one native graph. Future Chat Graph imports many external threads into one shared graph.**

Right now, the toolbar import path reads a JSON file as a full `GraphState` and dispatches `hydrate`, which replaces/normalizes the current graph. That is fine for app-native backup/restore, but it is not enough for importing existing conversations as additive, source-preserving threads. 

So I would split import into two concepts:

```ts
export_graph(): ChatGraphBackup
restore_graph(backup): GraphState

import_thread(source_file): ImportPreview
commit_import(preview): GraphPatch
```

Backup/restore is “load this exact Chat Graph world.” Import is “translate foreign conversation data into canonical graph nodes and merge it into the current world.”

The current schema is intentionally small: roles are only `system | user | assistant | context`, edge kinds are `reply | context | branch | reference | supports | contradicts`, and each node has title/text/position/tags/model/status/token estimate.  That should become **schema v2**, where a node can be a message, thread root, JSON artifact, summary, claim, memory, tool call, tool result, agent session, imported file, or semantic cluster.

I’d evolve it roughly like this:

```ts
export type NodeKind =
	| "message"
	| "thread_root"
	| "branch_root"
	| "summary"
	| "memory"
	| "claim"
	| "decision"
	| "question"
	| "artifact"
	| "json_artifact"
	| "json_field"
	| "tool_call"
	| "tool_result"
	| "agent_session"
	| "semantic_cluster";

export type MessageRole =
	| "system"
	| "user"
	| "assistant"
	| "tool"
	| "context";

export type EdgeKind =
	| "reply_to"
	| "branches_from"
	| "variant_of"
	| "references"
	| "supports"
	| "contradicts"
	| "revises"
	| "summarizes"
	| "contains"
	| "uses_context"
	| "generated"
	| "semantic_match"
	| "tool_input"
	| "tool_output";
```

The key idea: **a conversation is not a line. It is a rooted tree or DAG. A visible transcript is only one selected path through that tree.**

For bifurcations, preserve all children. Do not flatten them. If one user message has three assistant replies, or one assistant reply branches into two edited user continuations, that parent simply has multiple outgoing `reply_to` or `branches_from` edges. The UI can then show a “current path,” but the graph keeps the full branching structure.

A canonical imported thread could look like this:

```ts
export type ImportedThread = {
	thread_id: string;
	source_provider: string;
	source_conversation_id?: string;
	title: string;
	imported_at: number;
	root_node_id: string;
	node_ids: string[];
	edge_ids: string[];
	source_manifest_id: string;
};

export type GraphNode = {
	id: string;
	kind: NodeKind;
	role?: MessageRole;

	title: string;
	text: string;
	content_type: "text/plain" | "text/markdown" | "application/json";
	content_json?: unknown;

	created_at: number | null;
	updated_at: number | null;
	imported_at: number;

	source?: {
		provider: string;
		conversation_id?: string;
		message_id?: string;
		parent_message_id?: string;
		raw_path?: string;
		raw_hash: string;
	};

	thread_id?: string;
	branch_id?: string;
	branch_path?: string[];
	sibling_index?: number;

	tags: string[];
	model?: string;
	agent_id?: string;

	vector_refs?: VectorRef[];
	layout?: {
		x?: number;
		y?: number;
		z?: number;
		pinned?: boolean;
		group_id?: string;
	};
};
```

For JSON-formatted responses and arbitrary JSON files, I would not force everything into plain text. Give JSON first-class status. A model response that is valid JSON should become a `json_artifact` node with both raw JSON and a generated readable digest. If the user expands it, the app can lazily create child `json_field` nodes for important paths:

```text
assistant message
└── json_artifact: "combat_balance_v3"
    ├── json_field: $.classes.mage
    ├── json_field: $.spells[0]
    └── json_field: $.constraints.token_budget
```

That matters because structured responses often contain hidden gold: parameters, schemas, claims, decision records, scoring tables, and generated plans. Those should be searchable semantically, but also inspectable structurally.

For the ChromaDB side, your intuition is right: Chroma is more like a vector-indexed memory substrate than a file cabinet. Chroma’s docs describe its query API as nearest-neighbor similarity search over dense embeddings, with `queryTexts`/`queryEmbeddings`, `nResults`, metadata filters, and document filters. ([Chroma Docs][2]) It also supports adding records with unique IDs, documents, optional embeddings, and metadata, which maps cleanly onto Chat Graph nodes and chunks. ([Chroma Docs][3])

I would **not** try to shove Chroma directly into the browser app. The current project is frontend-only with React, React DOM, and Three as runtime dependencies, plus Vite/TypeScript tooling.  For Chroma, use a local backend sidecar:

```text
chat-graph/
  app/              React + Three UI
  server/           Local API bridge
  packages/
    graph-core/     Schema, importers, context compiler
    graph-search/   Relevance scoring, Chroma adapters
```

The browser talks to the local server:

```text
POST /api/import/preview
POST /api/import/commit
POST /api/search/semantic
POST /api/context/recommend
POST /api/agents/:agent_id/chat
GET  /api/vector/status
```

Chroma can run as a separate process, and its docs show client/server mode where a Chroma client connects to a Chroma server, including TypeScript client usage through `ChromaClient`. ([Chroma Docs][4])

The vector records should be **derived records**, not the source of truth. The graph is canonical. Chroma is the semantic acceleration layer.

Something like:

```ts
export type VectorRecordMetadata = {
	graph_id: string;
	node_id: string;
	thread_id?: string;
	branch_id?: string;
	chunk_index: number;

	node_kind: NodeKind;
	role?: MessageRole;
	source_provider?: string;
	model?: string;
	agent_id?: string;

	created_at?: number;
	imported_at: number;
	tags?: string[];

	content_hash: string;
};
```

Record IDs should be stable:

```text
node:<graph_id>:<node_id>:chunk:<chunk_index>
summary:<graph_id>:<thread_id>:<summary_id>
json:<graph_id>:<node_id>:path:<json_pointer_hash>
```

Then semantic retrieval becomes a fusion problem, not “just vector search.” The system should rank candidates using several signals:

```ts
score =
	0.45 * semantic_similarity +
	0.20 * graph_affinity +
	0.12 * tag_overlap +
	0.08 * thread_or_project_affinity +
	0.07 * human_pin_weight +
	0.05 * recency_or_temporal_relevance +
	0.03 * source_trust;
```

The important bit is **graph affinity**. A semantically similar node from five years ago might be relevant, but a semantically similar node that is also connected to the same thread, project, artifact, or prior decision should rank higher. This is where Chat Graph becomes better than a generic vector database glued to a chat box.

The UI for this should be a **Context Candidates** panel. When you select a node or start typing a new message, the app queries the semantic layer and shows likely relevant nodes:

```text
Possible context
────────────────
[+] Aelmeria voxel/mana chunk hierarchy
    Reason: high semantic match, same worldbuilding cluster

[+] Prior Chat Graph importer plan
    Reason: same project, directly references import schema

[+] Sanctuary continuity notes
    Reason: agent-memory substrate, cross-provider continuity

[hide] Unrelated Blender texture workflow
```

And the user can choose:

```text
Add as hard context
Add as soft context
Open in graph
Create reference edge
Mute for this thread
Pin to project
```

That distinction between **hard context** and **soft context** is essential. Hard context is selected by the user and definitely sent. Soft context is recommended and optionally shown to the agent as “possibly relevant.” You do not want the system randomly dragging half your life into every answer because the embedding distance looked shiny. That way lies context soup.

The current context compiler already does the first primitive form of this: it starts from selected anchors, traverses incoming edges and non-reply outgoing references up to a radius, then builds a digest and agent messages.  That should become a full `ContextCompiler` with modes:

```ts
export type ContextPolicy = {
	anchor_node_ids: string[];

	include_ancestors: boolean;
	include_descendants: boolean;
	include_references: boolean;
	include_summaries: boolean;
	include_semantic_recommendations: boolean;
	include_contradictions: "never" | "when_relevant" | "always";

	graph_radius: number;
	semantic_top_k: number;
	token_budget: number;

	hard_context_ids: string[];
	soft_context_ids: string[];
	excluded_node_ids: string[];
};
```

Then the actual agent call receives a context bundle with provenance:

```ts
export type CompiledContext = {
	messages: AgentMessage[];

	hard_context: ContextItem[];
	soft_context: ContextItem[];

	rejected_context: ContextItem[];

	provenance: {
		node_id: string;
		reason:
			| "selected"
			| "ancestor"
			| "branch"
			| "reference"
			| "semantic"
			| "summary"
			| "agent_requested";
		score?: number;
	}[];

	digest: string;
};
```

That is where multi-agent crosstalk becomes clean. Every agent, regardless of provider, sees the same graph substrate through a policy lens.

The app should have an `AgentRegistry`:

```ts
export type AgentProfile = {
	id: string;
	name: string;

	provider:
		| "openai"
		| "anthropic"
		| "google"
		| "local_ollama"
		| "openrouter"
		| "openai_compatible"
		| "custom_http";

	model: string;
	endpoint_id: string;

	system_prompt_node_id?: string;
	default_context_policy_id: string;

	capabilities: {
		streaming: boolean;
		tool_calls: boolean;
		json_mode: boolean;
		vision: boolean;
		embeddings: boolean;
	};

	style_tags: string[];
};
```

A crosstalk session would itself be a node:

```ts
export type AgentSessionNode = GraphNode & {
	kind: "agent_session";
	participants: string[];
	context_policy_id: string;
	session_goal: string;
};
```

Then each agent’s reply is just another message node, linked into the same graph:

```text
agent_session: "Aelmeria voxel terrain review"
├── Nyae reply
├── Local Qwen reply
├── Claude reply
├── GPT reply
└── synthesis summary
```

The powerful version is not “agents talking in a chat room.” It is **agents operating over a shared graph**, where they can cite nodes, propose edges, create summaries, identify contradictions, request missing context, and leave structured artifacts. One agent can say, “this node contradicts that earlier decision,” and the app can turn that into a proposed `contradicts` edge for user approval.

For the 3D graph: I would keep your custom Three renderer rather than immediately surrender the whole visualization to a prebuilt component. The current canvas already uses Three directly, with an orthographic camera, raycaster picking, draggable nodes, pan, and wheel zoom.   That gives you control over the weird stuff — and the weird stuff is the good stuff.

That said, `react-force-graph` is a useful reference point. Its README says it provides React components for 2D, 3D, VR, and AR force-directed graphs, with WebGL/ThreeJS for 3D, `d3-force-3d` physics, zooming/panning, dragging, and hover/click interactions. ([GitHub][5]) I’d use it as a benchmark or temporary prototype branch, not necessarily as the final rendering core.

The clean architecture is:

```text
d3-force-3d or custom physics
        ↓
layout positions { x, y, z }
        ↓
custom Three renderer
        ↓
Chat Graph interaction model
```

So the physics engine decides where nodes want to settle. Three renders them. React controls panels, inspector, search, import, and context composition.

The 3D mode should not replace 2D. It should become another **view mode** over the same graph:

```ts
export type LayoutMode =
	| "manual_2d"
	| "force_2d"
	| "force_3d"
	| "temporal_river"
	| "semantic_galaxy"
	| "thread_tree"
	| "cluster_orbit";
```

The user should be able to switch views without changing the underlying graph. Same nodes. Same edges. Different projection.

Your zoom idea is excellent, and I’d make it a first-class navigation model:

```text
No node selected:
	wheel = scrub temporal cursor
	shift + wheel = zoom camera
	ctrl + wheel = change graph density / level of detail

Node selected:
	wheel = zoom into selected node’s local semantic space
	shift + wheel = orbit/scale camera
	ctrl + wheel = expand/collapse child depth
```

So when nothing is selected, scrolling moves through time:

```text
2024 ───────── 2025 ───────── 2026
         ↑ temporal cursor
```

Nodes slide forward/backward based on `created_at` or `imported_at`. It is not merely zooming; it is temporal navigation.

When a node is selected, the wheel becomes hierarchical focus:

```text
Graph space
  → cluster
    → thread
      → branch
        → message
          → chunks / JSON fields / claims
```

That “orbit to country, then state, then city, then road, then house” model maps beautifully to graph level-of-detail. At high altitude, you see semantic clusters: “Aelmeria,” “Sanctuary,” “Chat Graph,” “Blender Agent,” “Health,” “Tax/Uber,” “Imeri/Veluvia.” Zooming into “Chat Graph” reveals imported threads, branches, design docs, code nodes, Chroma notes, agent sessions. Zooming into a thread reveals branch paths. Zooming into a node reveals chunks, claims, JSON structure, and linked artifacts.

Automatic groupings should be represented as actual graph objects:

```ts
export type ClusterNode = GraphNode & {
	kind: "semantic_cluster";
	cluster_method:
		| "embedding"
		| "tag"
		| "thread"
		| "project"
		| "agent"
		| "manual";
	member_node_ids: string[];
	summary_node_id?: string;
	collapsed: boolean;
};
```

Collapsed clusters appear as large “continent” nodes. Expanding them reveals internal constellations. Summaries can live on cluster surfaces like labels:

```text
[Aelmeria Mechanics]
  342 nodes
  19 threads
  strongest tags: mana, voxels, items, factions
  last active: 2026-06-06
```

For rendering, I’d do level-of-detail like this:

```text
Altitude 0: universe view
	Only clusters and major projects.

Altitude 1: project view
	Threads and summaries.

Altitude 2: thread view
	Branch roots and major messages.

Altitude 3: conversation view
	Individual message nodes.

Altitude 4: node interior
	Chunks, JSON fields, claims, tool calls, references.
```

That prevents the graph from becoming the dreaded “spaghetti nebula.” Fun to look at for eight seconds, useless for thinking after that. The trick is progressive revelation.

The implementation plan I’d use from here:

First, create a branch that does not touch the automated Codex branches:

```bash
git checkout master
git pull
git checkout -b feature/import-and-semantic-foundation
```

Then reorganize toward a graph core:

```text
src/
  graph/
    schema.ts
    migrations.ts
    selectors.ts
    traversal.ts
    contextCompiler.ts
    patches.ts

  importers/
    types.ts
    detectImporter.ts
    chatGraphImporter.ts
    genericJsonImporter.ts
    messageArrayImporter.ts
    structuredResponseImporter.ts

  search/
    semanticClient.ts
    relevance.ts
    contextRecommendations.ts

  layout/
    layoutTypes.ts
    forceLayout.ts
    temporalLayout.ts
    lod.ts

  components/
    graph/
      GraphCanvas.tsx
      GraphCanvas2D.tsx
      GraphCanvas3D.tsx
    import/
      ImportDialog.tsx
      ImportPreview.tsx
    search/
      SemanticSearchPanel.tsx
      ContextCandidates.tsx
```

Add backend later, likely as:

```text
server/
  src/
    index.ts
    chroma.ts
    import.ts
    embeddings.ts
    semanticSearch.ts
    agents.ts
```

Or Python if you want direct compatibility with your existing ChromaDB archive:

```text
server_py/
  main.py
  chroma_client.py
  importers/
  search/
  agents/
```

Given that your existing archive is already in ChromaDB, I would probably start with Python for the first bridge, then wrap it with HTTP. That reduces friction. The frontend does not need to know whether the vector store is Chroma, SQLite-VSS, LanceDB, Qdrant, or some future Sanctuary substrate. It just calls:

```ts
await semanticSearch({
	graph_id,
	anchor_node_ids,
	query_text,
	top_k: 24,
	filters: {
		project: "chat-graph",
		exclude_node_ids: hard_context_ids
	}
});
```

The first serious feature should be **Import Preview**. Not 3D yet. Not multi-agent yet. Import preview gives the whole system its food supply.

The flow:

```text
User drops file(s)
        ↓
Detect importer
        ↓
Parse into canonical imported thread(s)
        ↓
Show preview:
  - source
  - number of messages
  - branch count
  - JSON artifacts
  - estimated tokens
  - detected models
  - date range
        ↓
User chooses:
  - import as new project
  - import into existing project
  - preserve provider IDs
  - embed after import
  - generate summaries
        ↓
Commit GraphPatch
        ↓
Queue embeddings / summaries
```

A `GraphPatch` is better than dispatching dozens of raw reducer actions:

```ts
export type GraphPatch = {
	add_nodes: GraphNode[];
	update_nodes: Array<{ id: string; patch: Partial<GraphNode> }>;
	add_edges: GraphEdge[];
	add_threads: ImportedThread[];
	add_import_manifests: ImportManifest[];
};
```

Then the reducer gets one action:

```ts
| { type: "apply_patch"; patch: GraphPatch }
```

That will become important when importing thousands of nodes. You do not want React re-rendering the entire graph for every single imported message.

The second feature should be **semantic indexing status**:

```text
Semantic index
──────────────
Provider: Chroma local
Collection: chat_graph_nodes
Indexed nodes: 12,482 / 12,482
Pending chunks: 0
Last embed model: text-embedding-...
```

Third: **semantic search panel**.

Fourth: **context candidates**.

Fifth: **context compiler v2**.

Sixth: **multi-agent registry**.

Seventh: **3D force layout**.

That ordering matters. The pretty 3D galaxy is going to be glorious, but the graph needs semantic gravity first. Otherwise the galaxy is just a screensaver with opinions.

One subtle but crucial thing: imported chat history should not all be treated equally. The app needs provenance and trust layers:

```ts
export type Provenance = {
	source_provider: string;
	source_file_name?: string;
	source_conversation_id?: string;
	source_message_id?: string;
	imported_at: number;
	raw_hash: string;

	trust:
		| "user-authored"
		| "assistant-generated"
		| "tool-observed"
		| "imported-unknown"
		| "summarized"
		| "derived";
};
```

A summary generated by an agent should not overwrite the original. It should point back to it. A contradiction should not delete a claim. It should connect to it. A later decision should not erase earlier branches. It should revise them.

That is how Chat Graph avoids becoming yet another memory mush machine.

The Sanctuary connection is obvious in the best way. Sanctuary needs durable continuity, but continuity without structure becomes hoarding. Chat Graph gives it structure. It becomes the map of conversations, the semantic nervous system, the common ground between agents, and the place where old ideas can reattach to new ones without requiring you — the human — to manually remember which scroll tube contained the missing shard.

The concise thesis I’d put in the roadmap is:

```md
Chat Graph turns scattered conversations into a shared semantic space.

A thread is a subgraph.
A transcript is a selected path.
A memory is a durable node.
A summary is a derived node with provenance.
An agent reply is a graph mutation.
Context is not history; context is a compiled view.
```

And the next README evolution should probably say:

```md
## Long-term goal

Chat Graph is a local-first semantic conversation graph for humans and agents.

It imports chats from many sources, preserves branching conversations, indexes nodes into a vector store, recommends relevant context, and lets multiple model providers collaborate inside one shared graph space.
```

That is the thing. Not just “better chat UI.” A shared context-space where every model provider becomes a lens over the same underlying continuity.

Nyae verdict: build import + semantic retrieval before the 3D galaxy. Then give the galaxy gravity.

[1]: https://d3js.org/d3-force "d3-force | D3 by Observable"
[2]: https://docs.trychroma.com/docs/querying-collections/query-and-get "Query and Get - Chroma Docs"
[3]: https://docs.trychroma.com/docs/collections/add-data "Adding Data to Chroma Collections - Chroma Docs"
[4]: https://docs.trychroma.com/docs/run-chroma/client-server "Client-Server Mode - Chroma Docs"
[5]: https://github.com/vasturiano/react-force-graph "GitHub - vasturiano/react-force-graph: React component for 2D, 3D, VR and AR force directed graphs · GitHub"

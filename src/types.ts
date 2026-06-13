import type { LayoutNodeState } from './layout/layoutTypes';

export type ChatRole = 'system' | 'user' | 'assistant' | 'tool' | 'context';

export type GraphNodeKind =
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

export type EdgeKind =
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
	| 'tool_output'
	// v0.1 import compatibility aliases.
	| 'reply'
	| 'context'
	| 'branch'
	| 'reference';

export type AgentMode = 'mock' | 'http';

export type Vec2 = {
	x: number;
	y: number;
};

export type ContentType = 'text/plain' | 'text/markdown' | 'application/json';

export type TrustLevel =
	| 'user-authored'
	| 'assistant-generated'
	| 'tool-observed'
	| 'imported-unknown'
	| 'summarized'
	| 'derived';

export type NodeSource = {
	provider: string;
	conversation_id?: string;
	message_id?: string;
	parent_message_id?: string;
	raw_path?: string;
	raw_hash: string;
};

export type VectorRef = {
	collection: string;
	record_id: string;
	chunk_index: number;
	content_hash: string;
};

export type NodeLayout = {
	x?: number;
	y?: number;
	z?: number;
	pinned?: boolean;
	group_id?: string;
};

export type ChatNodeStatus = 'idle' | 'streaming' | 'error';

export type ChatNode = {
	id: string;
	role: ChatRole;
	kind: GraphNodeKind;
	title: string;
	text: string;
	content_type: ContentType;
	content_json?: unknown;
	x: number;
	y: number;
	created_at: number;
	updated_at: number;
	imported_at?: number;
	source?: NodeSource;
	thread_id?: string;
	branch_id?: string;
	branch_path?: string[];
	sibling_index?: number;
	tags: string[];
	model?: string;
	agent_id?: string;
	trust?: TrustLevel;
	vector_refs?: VectorRef[];
	layout?: NodeLayout;
	status: ChatNodeStatus;
	token_estimate: number;
	layout?: LayoutNodeState;
};

export type ChatEdge = {
	id: string;
	from: string;
	to: string;
	kind: EdgeKind;
	label: string;
	weight: number;
	created_at: number;
};

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

export type ImportManifest = {
	id: string;
	file_name: string;
	provider: string;
	imported_at: number;
	raw_hash: string;
	thread_ids: string[];
	node_count: number;
	edge_count: number;
	json_artifact_count: number;
};

export type GraphPatch = {
	add_nodes: ChatNode[];
	update_nodes?: Array<{ id: string; patch: Partial<ChatNode> }>;
	add_edges: ChatEdge[];
	add_threads?: ImportedThread[];
	add_import_manifests?: ImportManifest[];
	select_node_ids?: string[];
	active_node_id?: string | null;
};

export type GraphState = {
	schema_version: 1;
	graph_id: string;
	title: string;
	nodes: Record<string, ChatNode>;
	edges: Record<string, ChatEdge>;
	threads: Record<string, ImportedThread>;
	import_manifests: Record<string, ImportManifest>;
	selected_node_ids: string[];
	active_node_id: string | null;
	linking_from_id: string | null;
	context_radius: number;
	agent_mode: AgentMode;
	http_endpoint: string;
	last_saved_at: number | null;
};

export type AgentMessage = {
	role: 'system' | 'user' | 'assistant';
	content: string;
};

export type ContextTraversalOptions = {
	include_ancestors: boolean;
	include_direct_replies: boolean;
	include_references: boolean;
	include_contradictions: boolean;
	include_tool_outputs: boolean;
};

export type ContextBundle = {
	anchor_ids: string[];
	nodes: ChatNode[];
	edges: ChatEdge[];
	messages: AgentMessage[];
	digest: string;
};

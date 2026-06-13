export type ChatRole = 'system' | 'user' | 'assistant' | 'context';

export type GraphNodeKind =
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

export type EdgeKind =
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

export type ChatNodeStatus = 'idle' | 'streaming' | 'error';

export type ContentType = 'text/plain' | 'text/markdown' | 'application/json';

export type NodeSource = {
	provider: string;
	conversation_id?: string;
	message_id?: string;
	parent_message_id?: string;
	raw_path?: string;
	raw_hash: string;
};

export type NodeTrust =
	| 'user-authored'
	| 'assistant-generated'
	| 'tool-observed'
	| 'imported-unknown'
	| 'summarized'
	| 'derived';

export type ChatNode = {
	id: string;
	role: ChatRole;
	kind: GraphNodeKind;
	title: string;
	text: string;
	x: number;
	y: number;
	created_at: number;
	updated_at: number;
	tags: string[];
	model?: string;
	status: ChatNodeStatus;
	token_estimate: number;
	content_type?: ContentType;
	content_json?: unknown;
	imported_at?: number;
	source?: NodeSource;
	thread_id?: string;
	branch_id?: string;
	branch_path?: string[];
	sibling_index?: number;
	trust?: NodeTrust;
};

export type ImportedThread = {
	id: string;
	title?: string;
	source: NodeSource;
	node_ids: string[];
	edge_ids: string[];
	root_node_id?: string;
	created_at?: number;
	updated_at?: number;
	imported_at: number;
};

export type ImportManifest = {
	schema_version: 1;
	imported_at: number;
	source_provider: string;
	source_path?: string;
	source_hash: string;
	threads: ImportedThread[];
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

export type GraphState = {
	schema_version: 1;
	graph_id: string;
	title: string;
	nodes: Record<string, ChatNode>;
	edges: Record<string, ChatEdge>;
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

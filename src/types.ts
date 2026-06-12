export type ChatRole = 'system' | 'user' | 'assistant' | 'context';

export type EdgeKind = 'reply' | 'context' | 'branch' | 'reference' | 'supports' | 'contradicts';

export type AgentMode = 'mock' | 'http';

export type Vec2 = {
	x: number;
	y: number;
};

export type ChatNodeStatus = 'idle' | 'streaming' | 'error';

export type ChatNode = {
	id: string;
	role: ChatRole;
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

export type ContextBundle = {
	anchor_ids: string[];
	nodes: ChatNode[];
	edges: ChatEdge[];
	messages: AgentMessage[];
	digest: string;
};

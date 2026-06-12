import type { ChatEdge, ChatNode, GraphState } from '../types';
import { estimateTokens } from '../utils/id';

function node(input: Omit<ChatNode, 'created_at' | 'updated_at' | 'tags' | 'status' | 'token_estimate'> & Partial<Pick<ChatNode, 'created_at' | 'updated_at' | 'tags' | 'status'>>): ChatNode {
	const now = input.created_at ?? Date.now();
	return {
		...input,
		created_at: now,
		updated_at: input.updated_at ?? now,
		tags: input.tags ?? [],
		status: input.status ?? 'idle',
		token_estimate: estimateTokens(input.text)
	};
}

function edge(input: Omit<ChatEdge, 'created_at' | 'label' | 'weight'> & Partial<Pick<ChatEdge, 'created_at' | 'label' | 'weight'>>): ChatEdge {
	return {
		...input,
		label: input.label ?? input.kind,
		weight: input.weight ?? 1,
		created_at: input.created_at ?? Date.now()
	};
}

export function createSampleGraph(): GraphState {
	const base = Date.now() - 10_000;
	const system = node({
		id: 'node_system_seed',
		role: 'system',
		title: 'System seed',
		text: 'Chat Graph treats conversation as a navigable knowledge graph. Every user message, assistant reply, and reusable context note is a node. Edges describe reply chains, context citations, branches, references, support, or contradiction.',
		x: -520,
		y: 160,
		created_at: base
	});
	const concept = node({
		id: 'node_context_thesis',
		role: 'context',
		title: 'Design thesis',
		text: 'The graph is the source of truth. A linear chat transcript is only a view produced by walking selected graph edges. Sending a message from several selected nodes creates a nonlinear context merge.',
		x: -190,
		y: 20,
		created_at: base + 1_000,
		tags: ['architecture', 'context']
	});
	const user = node({
		id: 'node_user_seed',
		role: 'user',
		title: 'Initial user prompt',
		text: 'I want a nonlinear chat interface where messages can link into a 2D graph and spawn branches from any prior context.',
		x: 150,
		y: 160,
		created_at: base + 2_000
	});
	const assistant = node({
		id: 'node_assistant_seed',
		role: 'assistant',
		title: 'Mock assistant reply',
		text: 'That suggests a context lens: select one or more nodes, gather nearby graph history, then compose the next turn against that bundle. The visual editor becomes both memory map and prompt router.',
		x: 500,
		y: 20,
		created_at: base + 3_000,
		model: 'mock-agent'
	});

	const nodes = [system, concept, user, assistant];
	const edges = [
		edge({ id: 'edge_seed_1', from: system.id, to: concept.id, kind: 'context', created_at: base + 1_100 }),
		edge({ id: 'edge_seed_2', from: concept.id, to: user.id, kind: 'context', created_at: base + 2_100 }),
		edge({ id: 'edge_seed_3', from: user.id, to: assistant.id, kind: 'reply', created_at: base + 3_100 })
	];

	return {
		schema_version: 1,
		graph_id: 'default',
		title: 'Chat Graph',
		nodes: Object.fromEntries(nodes.map((entry) => [entry.id, entry])),
		edges: Object.fromEntries(edges.map((entry) => [entry.id, entry])),
		selected_node_ids: [assistant.id],
		active_node_id: assistant.id,
		linking_from_id: null,
		context_radius: 3,
		agent_mode: 'mock',
		http_endpoint: '/api/chat',
		last_saved_at: null
	};
}

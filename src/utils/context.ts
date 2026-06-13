export * from '../graph/contextCompiler';
import type { ChatEdge, ChatNode, ContextBundle, ContextTraversalOptions, EdgeKind, GraphState } from '../types';

export const DEFAULT_CONTEXT_TRAVERSAL: ContextTraversalOptions = {
	include_ancestors: true,
	include_direct_replies: false,
	include_references: true,
	include_contradictions: false,
	include_tool_outputs: false
};

function byCreatedAt<T extends { created_at: number }>(a: T, b: T): number {
	return a.created_at - b.created_at;
}

function roleToAgentRole(role: ChatNode['role']): 'system' | 'user' | 'assistant' {
	if (role === 'assistant') return 'assistant';
	if (role === 'system' || role === 'context' || role === 'tool') return 'system';
	return 'user';
}

function isReplyEdge(kind: EdgeKind): boolean {
	return kind === 'reply_to' || kind === 'reply';
}

function isContradictionEdge(kind: EdgeKind): boolean {
	return kind === 'contradicts';
}

function isToolOutputEdge(kind: EdgeKind): boolean {
	return kind === 'tool_output';
}

function shouldTraverseOutgoing(edge: ChatEdge, options: ContextTraversalOptions): boolean {
	if (isReplyEdge(edge.kind)) return options.include_direct_replies;
	if (isContradictionEdge(edge.kind)) return options.include_contradictions;
	if (isToolOutputEdge(edge.kind)) return options.include_tool_outputs;
	return options.include_references;
}

export function buildIncomingEdgeIndex(edges: Record<string, ChatEdge>): Map<string, ChatEdge[]> {
	const incoming = new Map<string, ChatEdge[]>();
	Object.values(edges).forEach((edge) => {
		const bucket = incoming.get(edge.to) ?? [];
		bucket.push(edge);
		incoming.set(edge.to, bucket);
	});
	return incoming;
}

export function buildOutgoingEdgeIndex(edges: Record<string, ChatEdge>): Map<string, ChatEdge[]> {
	const outgoing = new Map<string, ChatEdge[]>();
	Object.values(edges).forEach((edge) => {
		const bucket = outgoing.get(edge.from) ?? [];
		bucket.push(edge);
		outgoing.set(edge.from, bucket);
	});
	return outgoing;
}

export function buildContextBundle(
	state: GraphState,
	anchor_ids: string[],
	radius: number,
	options: ContextTraversalOptions = DEFAULT_CONTEXT_TRAVERSAL
): ContextBundle {
	const anchors = anchor_ids.length > 0 ? anchor_ids : state.active_node_id ? [state.active_node_id] : [];
	const incoming = buildIncomingEdgeIndex(state.edges);
	const outgoing = buildOutgoingEdgeIndex(state.edges);
	const visited = new Map<string, number>();
	const queue: Array<{ id: string; depth: number }> = anchors.map((id) => ({ id, depth: 0 }));

	while (queue.length > 0) {
		const current = queue.shift();
		if (!current) continue;
		if (!state.nodes[current.id]) continue;

		const existing_depth = visited.get(current.id);
		if (existing_depth !== undefined && existing_depth <= current.depth) continue;
		visited.set(current.id, current.depth);

		if (current.depth >= radius) continue;

		if (options.include_ancestors) {
			const inbound = incoming.get(current.id) ?? [];
			for (const edge of inbound) {
				if (isContradictionEdge(edge.kind) && !options.include_contradictions) continue;
				if (isToolOutputEdge(edge.kind) && !options.include_tool_outputs) continue;
				queue.push({ id: edge.from, depth: current.depth + 1 });
			}
		}

		const outgoing_edges = (outgoing.get(current.id) ?? []).filter((edge) => shouldTraverseOutgoing(edge, options));
		for (const edge of outgoing_edges) {
			queue.push({ id: edge.to, depth: current.depth + 1 });
		}
	}

	const nodes = [...visited.keys()]
		.map((id) => state.nodes[id])
		.filter(Boolean)
		.sort(byCreatedAt);

	const node_id_set = new Set(nodes.map((node) => node.id));
	const edges = Object.values(state.edges)
		.filter((edge) => node_id_set.has(edge.from) && node_id_set.has(edge.to))
		.sort(byCreatedAt);

	const digest = nodes
		.map((node) => {
			const tags = node.tags.length ? ` tags=${node.tags.join(',')}` : '';
			return `[${node.kind}:${node.id}] ${node.title}${tags}\n${node.text.trim()}`;
		})
		.join('\n\n---\n\n');

	const messages = nodes
		.filter((node) => node.text.trim().length > 0)
		.map((node) => ({
			role: roleToAgentRole(node.role),
			content: `${node.title}\n\n${node.text.trim()}`
		}));

	const anchor_set = new Set(anchors);
	const items = nodes.map((node) => ({
		node,
		reasons: anchor_set.has(node.id) ? ['selected'] : [`within ${visited.get(node.id) ?? 0} hop${(visited.get(node.id) ?? 0) === 1 ? '' : 's'}`]
	}));

	return {
		anchor_ids: anchors,
		nodes,
		items,
		edges,
		messages,
		digest
	};
}

export function getSelectedNode(state: GraphState): ChatNode | null {
	const id = state.selected_node_ids[0];
	return id ? state.nodes[id] ?? null : null;
}

export function graphStats(state: GraphState): { node_count: number; edge_count: number; thread_count: number; token_estimate: number } {
	const nodes = Object.values(state.nodes);
	return {
		node_count: nodes.length,
		edge_count: Object.keys(state.edges).length,
		thread_count: Object.keys(state.threads ?? {}).length,
		token_estimate: nodes.reduce((sum, node) => sum + node.token_estimate, 0)
	};
}

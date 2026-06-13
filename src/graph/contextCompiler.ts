import type { AgentMessage, ChatEdge, ChatNode, ContextBundle, ContextTraversalOptions, EdgeKind, GraphState } from '../types';

export type ContextProvenanceReason =
	| 'selected'
	| 'ancestor'
	| 'branch'
	| 'reference'
	| 'semantic'
	| 'summary'
	| 'agent_requested';

export type ContextPolicy = {
	hard_context_ids: string[];
	soft_context_ids: string[];
	excluded_node_ids: string[];
	token_budget: number;
	semantic_top_k: number;
	include_contradictions: 'never' | 'when_relevant' | 'always';
	include_ancestors: boolean;
	include_direct_replies: boolean;
	include_references: boolean;
	include_tool_outputs: boolean;
	radius: number;
};

export type ContextItem = {
	node: ChatNode;
	reasons: ContextProvenanceReason[];
	depth: number;
	token_estimate: number;
};

export type CompiledContext = ContextBundle & {
	policy: ContextPolicy;
	items: ContextItem[];
	excluded_node_ids: string[];
};

export const DEFAULT_CONTEXT_TRAVERSAL: ContextTraversalOptions = {
	include_ancestors: true,
	include_direct_replies: false,
	include_references: true,
	include_contradictions: false,
	include_tool_outputs: false
};

const DEFAULT_TOKEN_BUDGET = 6000;
const DEFAULT_SEMANTIC_TOP_K = 0;

function byCreatedAt<T extends { created_at: number }>(a: T, b: T): number {
	return a.created_at - b.created_at;
}

function roleToAgentRole(role: ChatNode['role']): AgentMessage['role'] {
	if (role === 'assistant') return 'assistant';
	if (role === 'system' || role === 'context') return 'system';
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

function isBranchEdge(kind: EdgeKind): boolean {
	return kind === 'branches_from' || kind === 'branch';
}

function isSummaryEdge(kind: EdgeKind): boolean {
	return kind === 'summarizes';
}

function isReferenceEdge(kind: EdgeKind): boolean {
	return kind === 'references' || kind === 'reference' || kind === 'supports' || kind === 'context' || kind === 'uses_context';
}

function shouldTraverseOutgoing(edge: ChatEdge, policy: ContextPolicy): boolean {
	if (isReplyEdge(edge.kind)) return policy.include_direct_replies;
	if (isContradictionEdge(edge.kind)) return policy.include_contradictions === 'always';
	if (isToolOutputEdge(edge.kind)) return policy.include_tool_outputs;
	return policy.include_references;
}

function reasonForEdge(edge: ChatEdge, direction: 'incoming' | 'outgoing'): ContextProvenanceReason {
	if (isSummaryEdge(edge.kind)) return 'summary';
	if (isBranchEdge(edge.kind)) return 'branch';
	if (isReferenceEdge(edge.kind) || isContradictionEdge(edge.kind) || isToolOutputEdge(edge.kind)) return 'reference';
	return direction === 'incoming' ? 'ancestor' : 'branch';
}

function addReason(existing: ContextItem | undefined, node: ChatNode, reason: ContextProvenanceReason, depth: number): ContextItem {
	const item = existing ?? { node, reasons: [], depth, token_estimate: node.token_estimate };
	if (!item.reasons.includes(reason)) item.reasons.push(reason);
	item.depth = Math.min(item.depth, depth);
	return item;
}

function tokenize(text: string): Set<string> {
	return new Set(text.toLowerCase().match(/[a-z0-9_]{3,}/g) ?? []);
}

function semanticMatches(state: GraphState, seedIds: string[], excluded: Set<string>, topK: number): string[] {
	if (topK <= 0 || seedIds.length === 0) return [];
	const seedTerms = tokenize(seedIds.map((id) => {
		const node = state.nodes[id];
		return node ? `${node.title} ${node.text} ${node.tags.join(' ')}` : '';
	}).join(' '));
	if (seedTerms.size === 0) return [];

	return Object.values(state.nodes)
		.filter((node) => !seedIds.includes(node.id) && !excluded.has(node.id))
		.map((node) => {
			const terms = tokenize(`${node.title} ${node.text} ${node.tags.join(' ')}`);
			let score = 0;
			terms.forEach((term) => {
				if (seedTerms.has(term)) score += 1;
			});
			return { id: node.id, score };
		})
		.filter((match) => match.score > 0)
		.sort((a, b) => b.score - a.score)
		.slice(0, topK)
		.map((match) => match.id);
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

export function createContextPolicy(
	state: GraphState,
	anchor_ids: string[],
	radius: number,
	options: ContextTraversalOptions = DEFAULT_CONTEXT_TRAVERSAL,
	overrides: Partial<ContextPolicy> = {}
): ContextPolicy {
	const anchors = anchor_ids.length > 0 ? anchor_ids : state.active_node_id ? [state.active_node_id] : [];
	return {
		hard_context_ids: anchors,
		soft_context_ids: [],
		excluded_node_ids: [],
		token_budget: DEFAULT_TOKEN_BUDGET,
		semantic_top_k: DEFAULT_SEMANTIC_TOP_K,
		include_contradictions: options.include_contradictions ? 'always' : 'never',
		include_ancestors: options.include_ancestors,
		include_direct_replies: options.include_direct_replies,
		include_references: options.include_references,
		include_tool_outputs: options.include_tool_outputs,
		radius,
		...overrides
	};
}

export function compileContext(state: GraphState, policy: ContextPolicy): CompiledContext {
	const incoming = buildIncomingEdgeIndex(state.edges);
	const outgoing = buildOutgoingEdgeIndex(state.edges);
	const excluded = new Set(policy.excluded_node_ids);
	const items = new Map<string, ContextItem>();
	const visited = new Map<string, number>();
	const queue: Array<{ id: string; depth: number; reason: ContextProvenanceReason }> = [
		...policy.hard_context_ids.map((id) => ({ id, depth: 0, reason: 'selected' as const })),
		...policy.soft_context_ids.map((id) => ({ id, depth: 0, reason: 'agent_requested' as const }))
	];

	for (const id of semanticMatches(state, policy.hard_context_ids, excluded, policy.semantic_top_k)) {
		queue.push({ id, depth: 0, reason: 'semantic' });
	}

	while (queue.length > 0) {
		const current = queue.shift();
		if (!current || excluded.has(current.id)) continue;
		const node = state.nodes[current.id];
		if (!node) continue;

		const existingDepth = visited.get(current.id);
		if (existingDepth !== undefined && existingDepth <= current.depth) {
			items.set(current.id, addReason(items.get(current.id), node, current.reason, current.depth));
			continue;
		}
		visited.set(current.id, current.depth);
		items.set(current.id, addReason(items.get(current.id), node, current.reason, current.depth));

		if (node.kind === 'summary') items.set(current.id, addReason(items.get(current.id), node, 'summary', current.depth));
		if (current.depth >= policy.radius) continue;

		if (policy.include_ancestors) {
			for (const edge of incoming.get(current.id) ?? []) {
				if (isContradictionEdge(edge.kind) && policy.include_contradictions === 'never') continue;
				if (isToolOutputEdge(edge.kind) && !policy.include_tool_outputs) continue;
				queue.push({ id: edge.from, depth: current.depth + 1, reason: reasonForEdge(edge, 'incoming') });
			}
		}

		for (const edge of outgoing.get(current.id) ?? []) {
			if (shouldTraverseOutgoing(edge, policy)) {
				queue.push({ id: edge.to, depth: current.depth + 1, reason: reasonForEdge(edge, 'outgoing') });
			}
		}
	}

	let runningTokens = 0;
	const sortedItems = [...items.values()].sort((a, b) => byCreatedAt(a.node, b.node));
	const budgetedItems: ContextItem[] = [];
	for (const item of sortedItems) {
		const isHard = policy.hard_context_ids.includes(item.node.id);
		if (!isHard && runningTokens + item.token_estimate > policy.token_budget) continue;
		budgetedItems.push(item);
		runningTokens += item.token_estimate;
	}

	const nodes = budgetedItems.map((item) => item.node);
	const nodeIdSet = new Set(nodes.map((node) => node.id));
	const edges = Object.values(state.edges)
		.filter((edge) => nodeIdSet.has(edge.from) && nodeIdSet.has(edge.to))
		.sort(byCreatedAt);

	const digest = budgetedItems
		.map((item) => {
			const tags = item.node.tags.length ? ` tags=${item.node.tags.join(',')}` : '';
			return `[${item.node.kind}:${item.node.id}] reasons=${item.reasons.join(',')}${tags}\n${item.node.title}\n${item.node.text.trim()}`;
		})
		.join('\n\n---\n\n');

	const messages = nodes
		.filter((node) => node.text.trim().length > 0)
		.map((node) => ({ role: roleToAgentRole(node.role), content: `${node.title}\n\n${node.text.trim()}` }));

	return {
		anchor_ids: policy.hard_context_ids,
		nodes,
		edges,
		messages,
		digest,
		policy,
		items: budgetedItems,
		excluded_node_ids: [...excluded]
	};
}

export function buildContextBundle(
	state: GraphState,
	anchor_ids: string[],
	radius: number,
	options: ContextTraversalOptions = DEFAULT_CONTEXT_TRAVERSAL
): CompiledContext {
	return compileContext(state, createContextPolicy(state, anchor_ids, radius, options));
}

export function getSelectedNode(state: GraphState): ChatNode | null {
	const id = state.selected_node_ids[0];
	return id ? state.nodes[id] ?? null : null;
}

export function graphStats(state: GraphState): { node_count: number; edge_count: number; token_estimate: number } {
	const nodes = Object.values(state.nodes);
	return {
		node_count: nodes.length,
		edge_count: Object.keys(state.edges).length,
		token_estimate: nodes.reduce((sum, node) => sum + node.token_estimate, 0)
	};
}

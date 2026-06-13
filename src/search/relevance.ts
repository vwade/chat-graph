import type { ChatNode, GraphState } from '../types';

export type RelevanceScore = {
	node: ChatNode;
	score: number;
	reasons: string[];
};

export function rankRelevantNodes(state: GraphState, anchor_ids: string[], limit = 6): RelevanceScore[] {
	const anchors = anchor_ids.map((id) => state.nodes[id]).filter(Boolean);
	if (anchors.length === 0) return [];
	const anchor_text = anchors.map((node) => `${node.title} ${node.text} ${node.tags.join(' ')}`).join(' ');
	const anchor_tokens = tokenize(anchor_text);
	const anchor_tags = new Set(anchors.flatMap((node) => node.tags));
	const anchor_threads = new Set(anchors.map((node) => node.thread_id).filter(Boolean));
	const excluded = new Set(anchor_ids);

	return Object.values(state.nodes)
		.filter((node) => !excluded.has(node.id))
		.map((node) => scoreNode(node, anchor_tokens, anchor_tags, anchor_threads))
		.filter((entry) => entry.score > 0)
		.sort((a, b) => b.score - a.score)
		.slice(0, limit);
}

function scoreNode(node: ChatNode, anchor_tokens: Set<string>, anchor_tags: Set<string>, anchor_threads: Set<string | undefined>): RelevanceScore {
	const node_tokens = tokenize(`${node.title} ${node.text} ${node.tags.join(' ')}`);
	let overlap = 0;
	for (const token of node_tokens) {
		if (anchor_tokens.has(token)) overlap += 1;
	}
	const semantic_similarity = overlap / Math.max(8, Math.sqrt(node_tokens.size * anchor_tokens.size));
	const tag_overlap = node.tags.filter((tag) => anchor_tags.has(tag)).length;
	const thread_affinity = node.thread_id && anchor_threads.has(node.thread_id) ? 1 : 0;
	const source_trust = node.trust === 'user-authored' || node.trust === 'tool-observed' ? 1 : node.trust === 'assistant-generated' ? 0.75 : 0.45;
	const score = semantic_similarity * 0.62 + Math.min(tag_overlap, 3) * 0.12 + thread_affinity * 0.18 + source_trust * 0.08;
	const reasons = [];
	if (semantic_similarity > 0.08) reasons.push('semantic text overlap');
	if (tag_overlap > 0) reasons.push('shared tags');
	if (thread_affinity) reasons.push('same imported thread');
	if (node.kind === 'summary' || node.kind === 'memory') reasons.push(`${node.kind} node`);
	return { node, score, reasons: reasons.length ? reasons : ['weak semantic signal'] };
}

function tokenize(text: string): Set<string> {
	return new Set(text
		.toLowerCase()
		.replace(/[^a-z0-9_\s-]/g, ' ')
		.split(/\s+/)
		.filter((token) => token.length > 3 && !STOP_WORDS.has(token)));
}

const STOP_WORDS = new Set([
	'that', 'this', 'with', 'from', 'have', 'will', 'would', 'there', 'their', 'about', 'into', 'then', 'than', 'when', 'what', 'where', 'which', 'your', 'they', 'them', 'been', 'were', 'because', 'context', 'node', 'graph'
]);

export function normalizeTags(tags: string[]): string[] {
	return [...new Set(tags.map((tag) => tag.trim().toLowerCase()).filter(Boolean))];
}

export function scoreNodeRelevance(
	node: ChatNode,
	input: { query: string; tags: string[]; anchor: ChatNode | null }
): RelevanceScore & { matched_terms: string[]; matched_tags: string[] } {
	const query_tokens = tokenize(input.query);
	const node_tokens = tokenize(`${node.title} ${node.text} ${node.tags.join(' ')}`);
	const matched_terms = [...query_tokens].filter((token) => node_tokens.has(token));
	const normalized_node_tags = normalizeTags(node.tags);
	const matched_tags = normalized_node_tags.filter((tag) => input.tags.includes(tag));
	const anchor_tokens = input.anchor ? tokenize(`${input.anchor.title} ${input.anchor.text} ${input.anchor.tags.join(' ')}`) : new Set<string>();
	const anchor_tags = new Set(input.anchor ? normalizeTags(input.anchor.tags) : []);
	const anchor_threads = new Set<string | undefined>(input.anchor?.thread_id ? [input.anchor.thread_id] : []);
	const base = scoreNode(node, new Set([...query_tokens, ...anchor_tokens]), anchor_tags, anchor_threads);
	const score = base.score + matched_terms.length * 0.2 + matched_tags.length * 0.3;
	const reasons = [...base.reasons];
	if (matched_terms.length > 0) reasons.push('query term match');
	if (matched_tags.length > 0) reasons.push('tag filter match');
	return { node, score, reasons, matched_terms, matched_tags };
}

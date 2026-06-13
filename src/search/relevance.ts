import type { ChatNode, GraphState } from '../types';

export type RelevanceInput = {
	query?: string;
	tags?: string[];
	anchor?: ChatNode | null;
};

export type RelevanceScore = {
	score: number;
	reasons: string[];
	matched_terms: string[];
	matched_tags: string[];
};

export type RankedRelevantNode = RelevanceScore & {
	node: ChatNode;
};

type ImportedNodeMetadata = {
	thread_id?: string;
	trust?: 'user-authored' | 'tool-observed' | 'assistant-generated' | string;
};

const WORD_PATTERN = /[a-z0-9][a-z0-9_-]*/gi;
const STOP_WORDS = new Set([
	'a',
	'an',
	'and',
	'are',
	'as',
	'at',
	'be',
	'been',
	'because',
	'by',
	'context',
	'for',
	'from',
	'graph',
	'have',
	'in',
	'into',
	'is',
	'it',
	'node',
	'of',
	'on',
	'or',
	'than',
	'that',
	'the',
	'their',
	'them',
	'then',
	'there',
	'they',
	'this',
	'to',
	'were',
	'what',
	'when',
	'where',
	'which',
	'will',
	'with',
	'would',
	'your'
]);

export function tokenizeSearchText(value: string): string[] {
	const seen = new Set<string>();
	const terms = value.toLowerCase().match(WORD_PATTERN) ?? [];
	for (const term of terms) {
		if (term.length < 2) continue;
		if (STOP_WORDS.has(term)) continue;
		seen.add(term);
	}
	return [...seen].sort();
}

export function rankRelevantNodes(state: GraphState, anchor_ids: string[], limit = 6): RankedRelevantNode[] {
	const anchors = anchor_ids.map((id) => state.nodes[id]).filter(Boolean);
	if (anchors.length === 0) return [];

	const anchor_query = anchors.map((node) => `${node.title} ${node.text} ${node.tags.join(' ')}`).join(' ');
	const anchor_tags = normalizeTags(anchors.flatMap((node) => node.tags));
	const anchor_threads = new Set(anchors.map((node) => importedMetadata(node).thread_id).filter(Boolean));
	const excluded = new Set(anchor_ids);

	return Object.values(state.nodes)
		.filter((node) => !excluded.has(node.id))
		.map((node) => {
			const relevance = scoreNodeRelevance(node, {
				query: anchor_query,
				tags: anchor_tags,
				anchor: anchors[0]
			});
			const metadata = importedMetadata(node);
			const thread_affinity = metadata.thread_id && anchor_threads.has(metadata.thread_id) ? 1 : 0;
			const source_trust = sourceTrustScore(metadata.trust);
			const structural_bonus = node.kind === 'summary' || node.kind === 'memory' ? 0.5 : 0;
			const has_signal = relevance.score > 0 || thread_affinity > 0 || structural_bonus > 0;
			const score = has_signal ? relevance.score + thread_affinity * 3 + source_trust + structural_bonus : 0;
			const reasons = [...relevance.reasons];
			if (thread_affinity) reasons.push('same imported thread');
			if (node.kind === 'summary' || node.kind === 'memory') reasons.push(`${node.kind} node`);
			return {
				node,
				score,
				reasons: reasons.length ? reasons : ['weak semantic signal'],
				matched_terms: relevance.matched_terms,
				matched_tags: relevance.matched_tags
			};
		})
		.filter((entry) => entry.score > 0)
		.sort((a, b) => b.score - a.score || b.node.updated_at - a.node.updated_at || a.node.id.localeCompare(b.node.id))
		.slice(0, limit);
}

export function scoreNodeRelevance(node: ChatNode, input: RelevanceInput): RelevanceScore {
	const query_terms = tokenizeSearchText(input.query ?? '');
	const anchor_terms = input.anchor ? tokenizeSearchText(`${input.anchor.title} ${input.anchor.text}`) : [];
	const requested_tags = normalizeTags(input.tags ?? []);
	const anchor_tags = normalizeTags(input.anchor?.tags ?? []);
	const node_terms = new Set(tokenizeSearchText(`${node.title} ${node.text} ${node.tags.join(' ')}`));
	const node_tags = new Set(normalizeTags(node.tags));

	const matched_query_terms = query_terms.filter((term) => node_terms.has(term));
	const matched_anchor_terms = anchor_terms.filter((term) => node_terms.has(term));
	const matched_requested_tags = requested_tags.filter((tag) => node_tags.has(tag));
	const matched_anchor_tags = anchor_tags.filter((tag) => node_tags.has(tag));
	const matched_tags = [...new Set([...matched_requested_tags, ...matched_anchor_tags])].sort();
	const matched_terms = [...new Set([...matched_query_terms, ...matched_anchor_terms])].sort();

	const title_terms = new Set(tokenizeSearchText(node.title));
	const title_bonus = matched_query_terms.filter((term) => title_terms.has(term)).length * 2;
	const overlap_denominator = Math.max(8, Math.sqrt(Math.max(1, query_terms.length) * Math.max(1, node_terms.size)));
	const semantic_similarity = matched_query_terms.length / overlap_denominator;
	const score = semantic_similarity * 10 + matched_query_terms.length * 4 + matched_requested_tags.length * 5 + matched_anchor_tags.length * 3 + matched_anchor_terms.length + title_bonus;
	const reasons: string[] = [];

	if (matched_query_terms.length > 0) reasons.push(`text overlap: ${matched_query_terms.join(', ')}`);
	if (matched_requested_tags.length > 0) reasons.push(`requested tag overlap: ${matched_requested_tags.join(', ')}`);
	if (matched_anchor_tags.length > 0) reasons.push(`anchor tag overlap: ${matched_anchor_tags.join(', ')}`);
	if (matched_anchor_terms.length > 0) reasons.push(`anchor text overlap: ${matched_anchor_terms.slice(0, 6).join(', ')}`);

	return {
		score,
		reasons,
		matched_terms,
		matched_tags
	};
}

export function normalizeTags(tags: string[]): string[] {
	return [...new Set(tags.map((tag) => tag.trim().toLowerCase()).filter(Boolean))].sort();
}

function importedMetadata(node: ChatNode): ImportedNodeMetadata {
	return node as ChatNode & ImportedNodeMetadata;
}

function sourceTrustScore(trust: ImportedNodeMetadata['trust']): number {
	if (trust === 'user-authored' || trust === 'tool-observed') return 1;
	if (trust === 'assistant-generated') return 0.75;
	return 0.45;
}

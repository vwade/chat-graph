import type { ChatNode, GraphState } from '../types';
import { normalizeTags, scoreNodeRelevance } from './relevance';

/**
 * Future HTTP contract: POST /api/search/semantic
 * Body should match SemanticSearchRequest without the in-memory `state` field.
 * The browser client must call an HTTP bridge instead of importing Chroma directly.
 */
export type SemanticSearchRequest = {
	state: GraphState;
	query: string;
	anchor_node_ids?: string[];
	tags?: string[];
	limit?: number;
};

export type SemanticSearchResult = {
	node: ChatNode;
	score: number;
	reasons: string[];
	matched_terms: string[];
	matched_tags: string[];
};

/**
 * Future HTTP contract: GET /api/vector/status
 * Chroma/vector-store details belong behind a server/ or server_py/ bridge.
 */
export type VectorIndexStatus = {
	available: boolean;
	provider: 'mock' | 'chroma-http-bridge';
	indexed_node_count: number;
	updated_at: number | null;
	message: string;
};

const DEFAULT_LIMIT = 8;

export async function searchSemantic(request: SemanticSearchRequest): Promise<SemanticSearchResult[]> {
	return mockSemanticSearch(request);
}

export function mockSemanticSearch(request: SemanticSearchRequest): SemanticSearchResult[] {
	const limit = Math.max(1, request.limit ?? DEFAULT_LIMIT);
	const anchor_ids = new Set(request.anchor_node_ids ?? []);
	const anchors = [...anchor_ids].map((id) => request.state.nodes[id]).filter(Boolean);
	const anchor = anchors[0] ?? null;
	const normalized_tags = normalizeTags(request.tags ?? []);

	return Object.values(request.state.nodes)
		.filter((node) => !anchor_ids.has(node.id))
		.map((node) => ({ node, relevance: scoreNodeRelevance(node, { query: request.query, tags: normalized_tags, anchor }) }))
		.filter(({ relevance }) => relevance.score > 0)
		.sort((a, b) => b.relevance.score - a.relevance.score || b.node.updated_at - a.node.updated_at || a.node.id.localeCompare(b.node.id))
		.slice(0, limit)
		.map(({ node, relevance }) => ({
			node,
			score: relevance.score,
			reasons: relevance.reasons,
			matched_terms: relevance.matched_terms,
			matched_tags: relevance.matched_tags
		}));
}

export function getVectorIndexStatus(state: GraphState): VectorIndexStatus {
	const nodes = Object.values(state.nodes);
	return {
		available: true,
		provider: 'mock',
		indexed_node_count: nodes.length,
		updated_at: nodes.reduce<number | null>((latest, node) => (latest === null ? node.updated_at : Math.max(latest, node.updated_at)), null),
		message: 'Using deterministic browser-only mock search. Keep Chroma behind a future server/ or server_py/ HTTP bridge.'
	};
}

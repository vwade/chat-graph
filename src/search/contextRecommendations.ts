import type { ChatNode, GraphState } from '../types';
import type { SemanticSearchResult } from './semanticClient';
import { mockSemanticSearch } from './semanticClient';

/**
 * Future HTTP contract: POST /api/context/recommend
 * Body should include the active graph/session id, selected anchor node ids, optional query,
 * and limit. The server may use Chroma or another vector index behind an HTTP bridge.
 */
export type ContextRecommendation = {
	node: ChatNode;
	score: number;
	reason: string;
	matched_terms: string[];
	matched_tags: string[];
};

export type ContextRecommendationRequest = {
	state: GraphState;
	anchor_node_ids?: string[];
	query?: string;
	limit?: number;
};

export async function recommendContext(request: ContextRecommendationRequest): Promise<ContextRecommendation[]> {
	return mockContextRecommendations(request);
}

export function mockContextRecommendations(request: ContextRecommendationRequest): ContextRecommendation[] {
	const anchors = (request.anchor_node_ids ?? request.state.selected_node_ids)
		.map((id) => request.state.nodes[id])
		.filter(Boolean);
	const query = request.query?.trim() || anchors.map((node) => `${node.title} ${node.text}`).join(' ');
	const tags = anchors.flatMap((node) => node.tags);
	const results = mockSemanticSearch({
		state: request.state,
		query,
		anchor_node_ids: anchors.map((node) => node.id),
		tags,
		limit: request.limit
	});

	return results.map(toContextRecommendation);
}

function toContextRecommendation(result: SemanticSearchResult): ContextRecommendation {
	return {
		node: result.node,
		score: result.score,
		reason: result.reasons[0] ?? 'Related by local graph text or tag overlap.',
		matched_terms: result.matched_terms,
		matched_tags: result.matched_tags
	};
}

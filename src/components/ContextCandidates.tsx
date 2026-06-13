import { useMemo } from 'react';
import { useGraph } from '../state/GraphProvider';
import type { ChatEdge } from '../types';
import { makeId } from '../utils/id';
import { rankRelevantNodes } from '../search/relevance';

export function ContextCandidates() {
	const { state, dispatch } = useGraph();
	const anchor_ids = state.selected_node_ids.length ? state.selected_node_ids : state.active_node_id ? [state.active_node_id] : [];
	const candidates = useMemo(() => rankRelevantNodes(state, anchor_ids, 5), [state, anchor_ids.join('|')]);
	const active_id = state.active_node_id;

	function addHardContext(id: string): void {
		dispatch({ type: 'select_node', id, multi: true });
	}

	function createReference(id: string): void {
		if (!active_id || active_id === id) return;
		const edge: ChatEdge = {
			id: makeId('edge_semantic'),
			from: active_id,
			to: id,
			kind: 'references',
			label: 'semantic candidate',
			weight: 0.75,
			created_at: Date.now()
		};
		dispatch({ type: 'add_edge', edge });
	}

	return (
		<section className="panel context-candidates">
			<div className="panel-heading compact">
				<div>
					<p className="eyebrow">Context candidates</p>
					<h2>Semantic suggestions</h2>
				</div>
				<span className="pill">local</span>
			</div>
			<div className="candidate-list">
				{anchor_ids.length === 0 ? (
					<p className="empty-state small">Select a node to surface related memories, imports, JSON artifacts, and nearby thread context.</p>
				) : candidates.length === 0 ? (
					<p className="muted">No semantic candidates yet. Imports and shared tags will make this smarter.</p>
				) : candidates.map((candidate) => (
					<article className="candidate-card" key={candidate.node.id}>
						<header>
							<strong>{candidate.node.title}</strong>
							<span className="pill">{Math.round(candidate.score * 100)}%</span>
						</header>
						<p>{candidate.reasons.join(', ')}</p>
						<div className="button-row wrap">
							<button type="button" onClick={() => addHardContext(candidate.node.id)}>Add hard context</button>
							<button type="button" onClick={() => dispatch({ type: 'select_node', id: candidate.node.id })}>Open</button>
							<button type="button" disabled={!active_id || active_id === candidate.node.id} onClick={() => createReference(candidate.node.id)}>Reference</button>
						</div>
					</article>
				))}
			</div>
		</section>
	);
}

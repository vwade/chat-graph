import { useMemo } from 'react';
import { useGraph } from '../state/GraphProvider';
import { buildContextBundle } from '../utils/context';

export function ChatPanel() {
	const { state, dispatch } = useGraph();
	const bundle = useMemo(
		() => buildContextBundle(state, state.selected_node_ids, state.context_radius),
		[state]
	);

	return (
		<section className="panel chat-panel">
			<div className="panel-heading">
				<div>
					<p className="eyebrow">Context lens</p>
					<h2>Selected path</h2>
				</div>
				<span className="pill">{bundle.nodes.length} nodes</span>
			</div>
			<div className="chat-scroll">
				{bundle.nodes.length === 0 ? (
					<div className="empty-state">
						Select a node on the canvas. The chat view will be assembled from nearby graph context instead of assuming a single linear timeline.
					</div>
				) : (
					bundle.nodes.map((node) => (
						<article
							className={`chat-card role-${node.role} ${state.selected_node_ids.includes(node.id) ? 'selected-card' : ''}`}
							key={node.id}
							onClick={() => dispatch({ type: 'select_node', id: node.id })}
						>
							<header>
								<span className="role-badge">{node.role}</span>
								<strong>{node.title}</strong>
							</header>
							<p>{node.text}</p>
							<footer>
								<span>{new Date(node.created_at).toLocaleTimeString()}</span>
								<span>{node.token_estimate} tok</span>
							</footer>
						</article>
					))
				)}
			</div>
		</section>
	);
}

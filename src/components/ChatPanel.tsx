import { useMemo, useState } from 'react';
import { useGraph } from '../state/GraphProvider';
import type { ContextTraversalOptions } from '../types';
import { DEFAULT_CONTEXT_TRAVERSAL, buildContextBundle } from '../utils/context';

export function ChatPanel() {
	const { state, dispatch } = useGraph();
	const [options, setOptions] = useState<ContextTraversalOptions>(DEFAULT_CONTEXT_TRAVERSAL);
	const bundle = useMemo(
		() => buildContextBundle(state, state.selected_node_ids, state.context_radius, options),
		[state, options]
	);

	function toggleOption(key: keyof ContextTraversalOptions): void {
		setOptions((current) => ({ ...current, [key]: !current[key] }));
	}

	return (
		<section className="panel chat-panel">
			<div className="panel-heading">
				<div>
					<p className="eyebrow">Context compiler</p>
					<h2>Selected graph bundle</h2>
				</div>
				<span className="pill">{bundle.nodes.length} nodes · {bundle.edges.length} edges</span>
			</div>
			<div className="compiler-controls">
				<label>
					<input type="checkbox" checked readOnly />
					<span>Selected</span>
				</label>
				<label>
					<input type="checkbox" checked={options.include_ancestors} onChange={() => toggleOption('include_ancestors')} />
					<span>Ancestors</span>
				</label>
				<label>
					<input type="checkbox" checked={options.include_direct_replies} onChange={() => toggleOption('include_direct_replies')} />
					<span>Direct replies</span>
				</label>
				<label>
					<input type="checkbox" checked={options.include_references} onChange={() => toggleOption('include_references')} />
					<span>References</span>
				</label>
				<label>
					<input type="checkbox" checked={options.include_contradictions} onChange={() => toggleOption('include_contradictions')} />
					<span>Contradictions</span>
				</label>
				<label>
					<input type="checkbox" checked={options.include_tool_outputs} onChange={() => toggleOption('include_tool_outputs')} />
					<span>Tool outputs</span>
				</label>
				<span className="pill">Depth {state.context_radius}</span>
			</div>
			<div className="chat-scroll">
				{bundle.nodes.length === 0 ? (
					<div className="empty-state">
						Select a node on the canvas. The compiler will show the exact graph context that can become the next agent payload.
					</div>
				) : (
					bundle.nodes.map((node) => (
						<article
							className={`chat-card role-${node.role} ${state.selected_node_ids.includes(node.id) ? 'selected-card' : ''}`}
							key={node.id}
							onClick={() => dispatch({ type: 'select_node', id: node.id })}
						>
							<header>
								<span className="role-badge">{node.kind}</span>
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

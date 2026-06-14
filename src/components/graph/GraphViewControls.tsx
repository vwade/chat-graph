import { useGraph } from '../../state/GraphProvider';
import type { LayoutMode, ViewportMode } from '../../types';

export function GraphViewControls() {
	const { state, dispatch } = useGraph();
	const view = state.view;

	function setMode(mode: ViewportMode): void {
		dispatch({ type: 'set_viewport_mode', mode });
	}

	function setLayout(mode: LayoutMode): void {
		dispatch({ type: 'set_layout_mode', mode });
	}

	return (
		<div className="graph-view-controls">
			<div className="segmented-control" aria-label="Viewport mode">
				<button type="button" className={view.viewport_mode === '3d' ? 'active' : ''} onClick={() => setMode('3d')}>3D</button>
				<button type="button" className={view.viewport_mode === '2d' ? 'active' : ''} onClick={() => setMode('2d')}>2D</button>
			</div>
			<select value={view.layout_mode} onChange={(event) => setLayout(event.target.value as LayoutMode)} aria-label="Layout mode">
				<option value="manual_2d">Manual 2D</option>
				<option value="force_3d">Force 3D</option>
				<option value="temporal_3d">Temporal 3D</option>
				<option value="cluster_3d">Cluster 3D</option>
			</select>
			<label><input type="checkbox" checked={view.show_labels} onChange={(e) => dispatch({ type: 'set_graph_view_options', patch: { show_labels: e.target.checked } })} /> Labels</label>
			<label><input type="checkbox" checked={view.show_edges} onChange={(e) => dispatch({ type: 'set_graph_view_options', patch: { show_edges: e.target.checked } })} /> Edges</label>
		</div>
	);
}

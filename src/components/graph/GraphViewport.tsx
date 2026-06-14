import { GraphCanvas2D } from './GraphCanvas2D';
import { GraphCanvas3D } from './GraphCanvas3D';
import { GraphViewControls } from './GraphViewControls';
import { useGraph } from '../../state/GraphProvider';

export function GraphViewport() {
	const { state } = useGraph();
	return (
		<div className="graph-viewport">
			<GraphViewControls />
			{state.view.viewport_mode === '2d' ? <GraphCanvas2D /> : <GraphCanvas3D />}
		</div>
	);
}

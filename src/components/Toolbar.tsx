import { ChangeEvent, useRef } from 'react';
import { useGraph } from '../state/GraphProvider';
import type { GraphState } from '../types';
import { downloadJson, readJsonFile } from '../storage/graphDb';
import { graphStats } from '../utils/context';

export function Toolbar() {
	const { state, dispatch, loaded, save_error } = useGraph();
	const input_ref = useRef<HTMLInputElement | null>(null);
	const stats = graphStats(state);

	async function importGraph(event: ChangeEvent<HTMLInputElement>): Promise<void> {
		const file = event.target.files?.[0];
		if (!file) return;
		try {
			const graph = await readJsonFile<GraphState>(file);
			dispatch({ type: 'hydrate', state: graph });
		} finally {
			event.target.value = '';
		}
	}

	return (
		<header className="topbar">
			<div className="brand-block">
				<div className="logo-mark">CG</div>
				<div>
					<input
						className="title-input"
						value={state.title}
						onChange={(event) => dispatch({ type: 'set_title', title: event.target.value })}
					/>
					<p>{stats.node_count} nodes · {stats.edge_count} edges · {stats.token_estimate} estimated tokens</p>
				</div>
			</div>

			<div className="toolbar-actions">
				<span className={`save-state ${save_error ? 'error' : ''}`}>{save_error ? save_error : loaded ? 'IndexedDB autosave on' : 'Loading…'}</span>
				<button type="button" onClick={() => downloadJson(`${state.title || 'chat-graph'}.json`, state)}>Export</button>
				<button type="button" onClick={() => input_ref.current?.click()}>Import</button>
				<button
					type="button"
					onClick={() => {
						if (window.confirm('Reset the graph to the built-in sample? Export first if you want to keep this graph.')) {
							dispatch({ type: 'reset' });
						}
					}}
				>
					Reset
				</button>
				<input ref={input_ref} type="file" accept="application/json" hidden onChange={importGraph} />
			</div>
		</header>
	);
}

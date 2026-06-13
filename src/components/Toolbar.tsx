import { ChangeEvent, useRef } from 'react';
import { useGraph } from '../state/GraphProvider';
import type { GraphState } from '../types';
import { downloadJson, readJsonFile } from '../storage/graphDb';
import { detectImporter } from '../importers/detectImporter';
import { graphStats } from '../utils/context';

export function Toolbar() {
	const { state, dispatch, loaded, save_error } = useGraph();
	const restore_input_ref = useRef<HTMLInputElement | null>(null);
	const import_input_ref = useRef<HTMLInputElement | null>(null);
	const stats = graphStats(state);

	async function restoreGraph(event: ChangeEvent<HTMLInputElement>): Promise<void> {
		const file = event.target.files?.[0];
		if (!file) return;
		try {
			const graph = await readJsonFile<GraphState>(file);
			dispatch({ type: 'hydrate', state: graph });
		} finally {
			event.target.value = '';
		}
	}

	async function importJson(event: ChangeEvent<HTMLInputElement>): Promise<void> {
		const file = event.target.files?.[0];
		if (!file) return;
		try {
			const json = await readJsonFile<unknown>(file);
			const importer = detectImporter(json, file.name);
			const preview = importer.preview;
			const node_count = preview.thread.nodes.length;
			const edge_count = preview.thread.edges.length;
			const confirmed = window.confirm([
				`${importer.label}: ${preview.title}`,
				preview.description,
				`Preview: ${node_count} nodes and ${edge_count} edges will be merged into the current graph.`,
				'Continue with import?'
			].join('\n\n'));
			if (!confirmed) return;
			dispatch({ type: 'apply_patch', patch: importer.createPatch() });
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
				<button type="button" onClick={() => restore_input_ref.current?.click()}>Restore</button>
				<button type="button" onClick={() => import_input_ref.current?.click()}>Import Backup</button>
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
				<input ref={restore_input_ref} type="file" accept="application/json" hidden onChange={restoreGraph} />
				<input ref={import_input_ref} type="file" accept="application/json" hidden onChange={importJson} />
			</div>
		</header>
	);
}

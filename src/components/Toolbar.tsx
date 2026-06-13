import { ChangeEvent, useRef, useState } from 'react';
import { useGraph } from '../state/GraphProvider';
import type { GraphState } from '../types';
import { buildImportPreview } from '../importers/importer';
import type { ImportPreview } from '../importers/types';
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
			setImportError(null);
			const data = await readJsonFile<unknown>(file);
			const result = buildImportPreview(data, file.name, state);
			if (result.kind === 'chat_graph_backup') {
				setImportError('This looks like a Chat Graph backup. Use Restore backup to replace the current graph, or import a foreign chat/JSON file here.');
				return;
			}
			setPreview(result);
		} catch (error: unknown) {
			setImportError(error instanceof Error ? error.message : 'Could not preview import.');
		} finally {
			event.target.value = '';
		}
	}

	async function restoreBackup(event: ChangeEvent<HTMLInputElement>): Promise<void> {
		const file = event.target.files?.[0];
		if (!file) return;
		try {
			setImportError(null);
			const graph = await readJsonFile<GraphState>(file);
			if (window.confirm('Restore this Chat Graph backup? This replaces the current graph. Export first if you want to keep it.')) {
				dispatch({ type: 'hydrate', state: graph });
			}
		} catch (error: unknown) {
			setImportError(error instanceof Error ? error.message : 'Could not restore backup.');
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
					<p>{stats.node_count} nodes · {stats.edge_count} edges · {stats.thread_count} threads · {stats.token_estimate} estimated tokens</p>
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

			{preview ? (
				<div className="import-preview" role="dialog" aria-modal="true" aria-label="Import preview">
					<div className="import-card">
						<div className="panel-heading compact">
							<div>
								<p className="eyebrow">Import preview</p>
								<h2>{preview.title}</h2>
							</div>
							<span className="pill">{preview.provider}</span>
						</div>
						<div className="import-body">
							<p className="muted">{preview.file_name}</p>
							<div className="import-stats">
								<span>{preview.message_count} messages</span>
								<span>{preview.branch_count} branch points</span>
								<span>{preview.json_artifact_count} JSON artifacts</span>
								<span>{preview.estimated_tokens} estimated tokens</span>
								<span>{preview.patch.add_nodes.length} new nodes</span>
								<span>{preview.patch.add_edges.length} new edges</span>
							</div>
							{preview.date_range.start && preview.date_range.end ? (
								<p className="muted">Date range: {new Date(preview.date_range.start).toLocaleString()} → {new Date(preview.date_range.end).toLocaleString()}</p>
							) : null}
							{preview.warnings.map((warning) => <p className="notice" key={warning}>{warning}</p>)}
						</div>
						<div className="button-row import-actions">
							<button type="button" onClick={() => setPreview(null)}>Cancel</button>
							<button className="primary-button" type="button" onClick={commitPreview}>Commit import</button>
						</div>
					</div>
				</div>
			) : null}
		</header>
	);
}

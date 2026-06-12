import { ChangeEvent } from 'react';
import { useGraph } from '../state/GraphProvider';
import type { ChatNode, ChatRole, GraphNodeKind } from '../types';
import { getSelectedNode } from '../utils/context';
import { estimateTokens, makeId } from '../utils/id';

export function Inspector() {
	const { state, dispatch } = useGraph();
	const node = getSelectedNode(state);
	const edges = node
		? Object.values(state.edges).filter((edge) => edge.from === node.id || edge.to === node.id)
		: [];

	function updateNode(patch: Partial<ChatNode>): void {
		if (!node) return;
		dispatch({ type: 'update_node', id: node.id, patch });
	}

	function setTags(raw: string): void {
		updateNode({
			tags: raw
				.split(',')
				.map((tag) => tag.trim())
				.filter(Boolean)
		});
	}

	function addLooseNode(role: ChatRole): void {
		const anchor = node;
		const created_at = Date.now();
		const text = role === 'context'
			? 'Reusable context note. Link this into future turns when it becomes relevant.'
			: role === 'system'
				? 'System instruction or durable operating constraint.'
				: '';
		dispatch({
			type: 'add_node',
			select: true,
			node: {
				id: makeId(`node_${role}`),
				role,
				kind: kindFromRole(role),
				title: `${role[0].toUpperCase()}${role.slice(1)} node`,
				text,
				x: anchor ? anchor.x + 340 : -180,
				y: anchor ? anchor.y - 180 : -180,
				created_at,
				updated_at: created_at,
				tags: [],
				status: 'idle',
				token_estimate: estimateTokens(text)
			}
		});
	}

	function setAgentMode(event: ChangeEvent<HTMLSelectElement>): void {
		dispatch({ type: 'set_agent_config', mode: event.target.value as 'mock' | 'http', endpoint: state.http_endpoint });
	}

	return (
		<section className="panel inspector">
			<div className="panel-heading compact">
				<div>
					<p className="eyebrow">Inspector</p>
					<h2>{node ? node.title : 'No node selected'}</h2>
				</div>
			</div>

			<div className="inspector-grid">
				<label>
					<span>Context radius</span>
					<input
						type="number"
						min={0}
						max={12}
						value={state.context_radius}
						onChange={(event) => dispatch({ type: 'set_context_radius', radius: Number(event.target.value) })}
					/>
				</label>
				<label>
					<span>Agent mode</span>
					<select value={state.agent_mode} onChange={setAgentMode}>
						<option value="mock">mock</option>
						<option value="http">http</option>
					</select>
				</label>
				<label className="wide">
					<span>HTTP endpoint</span>
					<input
						value={state.http_endpoint}
						onChange={(event) => dispatch({ type: 'set_agent_config', mode: state.agent_mode, endpoint: event.target.value })}
						placeholder="/api/chat"
					/>
				</label>
			</div>

			<div className="button-row wrap">
				<button type="button" onClick={() => addLooseNode('context')}>Add context</button>
				<button type="button" onClick={() => addLooseNode('system')}>Add system</button>
				<button type="button" onClick={() => addLooseNode('user')}>Add user</button>
			</div>

			{node ? (
				<>
					<div className="field-stack">
						<label>
							<span>Title</span>
							<input value={node.title} onChange={(event) => updateNode({ title: event.target.value })} />
						</label>
						<label>
							<span>Kind</span>
							<select value={node.kind} onChange={(event) => updateNode({ kind: event.target.value as GraphNodeKind })}>
								{NODE_KIND_OPTIONS.map((kind) => <option key={kind} value={kind}>{kind}</option>)}
							</select>
						</label>
						<label>
							<span>Body</span>
							<textarea value={node.text} onChange={(event) => updateNode({ text: event.target.value })} />
						</label>
						<label>
							<span>Tags</span>
							<input value={node.tags.join(', ')} onChange={(event) => setTags(event.target.value)} placeholder="planning, lore, code" />
						</label>
					</div>

					<div className="button-row wrap">
						<button type="button" onClick={() => dispatch({ type: 'begin_link', id: node.id })}>Link from this</button>
						<button type="button" onClick={() => dispatch({ type: 'delete_selected' })}>Delete selected</button>
					</div>

					{state.linking_from_id ? (
						<p className="notice">Link mode is active. Click another node to create a reference edge. Alt-click creates a contradiction edge.</p>
					) : null}

					<div className="edge-list">
						<h3>Edges</h3>
						{edges.length === 0 ? <p className="muted">No edges yet.</p> : null}
						{edges.map((edge) => {
							const other_id = edge.from === node.id ? edge.to : edge.from;
							const other = state.nodes[other_id];
							return (
								<button className="edge-chip" key={edge.id} type="button" onClick={() => dispatch({ type: 'select_node', id: other_id })}>
									<span>{edge.from === node.id ? 'out' : 'in'} · {edge.kind}</span>
									<strong>{other?.title ?? other_id}</strong>
								</button>
							);
						})}
					</div>
				</>
			) : (
				<p className="empty-state small">Select a node to edit its text, tags, role-specific context, and graph links.</p>
			)}
		</section>
	);
}

const NODE_KIND_OPTIONS: GraphNodeKind[] = [
	'user_message',
	'assistant_message',
	'system_instruction',
	'summary',
	'memory',
	'artifact',
	'tool_call',
	'tool_result',
	'decision',
	'question',
	'claim',
	'reference',
	'branch_root',
	'context_bundle'
];

function kindFromRole(role: ChatRole): GraphNodeKind {
	switch (role) {
		case 'assistant': return 'assistant_message';
		case 'system': return 'system_instruction';
		case 'context': return 'memory';
		case 'user':
		default:
			return 'user_message';
	}
}

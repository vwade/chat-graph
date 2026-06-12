import { FormEvent, useMemo, useState } from 'react';
import { runAgent } from '../services/agent';
import { useGraph } from '../state/GraphProvider';
import type { ChatEdge, ChatNode, GraphState } from '../types';
import { buildContextBundle } from '../utils/context';
import { estimateTokens, firstLine, makeId } from '../utils/id';

export function Composer() {
	const { state, dispatch } = useGraph();
	const [text, setText] = useState('');
	const [sending, setSending] = useState(false);
	const selected_count = state.selected_node_ids.length;
	const anchor_ids = useMemo(
		() => (selected_count > 0 ? state.selected_node_ids : state.active_node_id ? [state.active_node_id] : []),
		[state.selected_node_ids, state.active_node_id, selected_count]
	);

	async function submit(event: FormEvent): Promise<void> {
		event.preventDefault();
		const user_text = text.trim();
		if (!user_text || sending) return;

		setSending(true);
		setText('');

		const now = Date.now();
		const origin = computeSpawnPoint(state, anchor_ids);
		const user_id = makeId('node_user');
		const assistant_id = makeId('node_assistant');
		const user_node = makeNode({
			id: user_id,
			role: 'user',
			title: firstLine(user_text, 'User turn'),
			text: user_text,
			x: origin.x + 360,
			y: origin.y + 92,
			created_at: now
		});
		const assistant_node = makeNode({
			id: assistant_id,
			role: 'assistant',
			title: 'Agent reply',
			text: 'Gathering selected graph context…',
			x: origin.x + 720,
			y: origin.y - 20,
			created_at: now + 1,
			model: state.agent_mode === 'mock' ? 'mock-agent' : 'http-agent',
			status: 'streaming'
		});

		dispatch({ type: 'add_node', node: user_node, select: false });
		for (const anchor_id of anchor_ids) {
			dispatch({
				type: 'add_edge',
				edge: makeEdge(anchor_id, user_id, anchor_ids.length > 1 ? 'branch' : 'context')
			});
		}
		dispatch({ type: 'add_node', node: assistant_node, select: true });
		dispatch({ type: 'add_edge', edge: makeEdge(user_id, assistant_id, 'reply') });

		const bundle = buildContextBundle(state, anchor_ids, state.context_radius);
		const messages = [
			{
				role: 'system' as const,
				content: [
					'You are operating inside Chat Graph, a nonlinear conversation graph.',
					'Use the provided graph context as selectable memory, not as a single mandatory transcript.',
					'When relevant, identify which prior ideas you are branching from.'
				].join(' ')
			},
			...bundle.messages,
			{ role: 'user' as const, content: user_text }
		];

		try {
			const answer = await runAgent({
				mode: state.agent_mode,
				endpoint: state.http_endpoint,
				messages,
				bundle,
				user_text
			});
			dispatch({ type: 'update_node', id: assistant_id, patch: { text: answer, title: firstLine(answer, 'Agent reply'), status: 'idle' } });
		} catch (error: unknown) {
			const message = error instanceof Error ? error.message : 'Unknown agent error.';
			dispatch({
				type: 'update_node',
				id: assistant_id,
				patch: {
					status: 'error',
					title: 'Agent error',
					text: `The agent request failed.\n\n${message}`
				}
			});
		} finally {
			setSending(false);
		}
	}

	return (
		<form className="panel composer" onSubmit={submit}>
			<div className="panel-heading compact">
				<div>
					<p className="eyebrow">New turn</p>
					<h2>Compose from graph</h2>
				</div>
				<span className="pill">{anchor_ids.length} anchors</span>
			</div>
			<textarea
				value={text}
				onChange={(event) => setText(event.target.value)}
				placeholder="Write a message. It will branch from the selected node or merge all selected nodes into one context bundle."
			/>
			<button className="primary-button" disabled={!text.trim() || sending} type="submit">
				{sending ? 'Sending…' : selected_count > 1 ? 'Send merged branch' : 'Send branch'}
			</button>
		</form>
	);
}

function computeSpawnPoint(state: GraphState, anchor_ids: string[]): { x: number; y: number } {
	const anchors = anchor_ids.map((id) => state.nodes[id]).filter(Boolean);
	if (anchors.length === 0) return { x: -320, y: -240 };
	return {
		x: anchors.reduce((sum, node) => sum + node.x, 0) / anchors.length,
		y: anchors.reduce((sum, node) => sum + node.y, 0) / anchors.length
	};
}

type MakeNodeInput = Omit<ChatNode, 'updated_at' | 'tags' | 'token_estimate' | 'status'> & Partial<Pick<ChatNode, 'updated_at' | 'tags' | 'token_estimate' | 'status'>>;

function makeNode(input: MakeNodeInput): ChatNode {
	return {
		...input,
		updated_at: input.updated_at ?? input.created_at,
		tags: input.tags ?? [],
		status: input.status ?? 'idle',
		token_estimate: input.token_estimate ?? estimateTokens(input.text)
	};
}

function makeEdge(from: string, to: string, kind: ChatEdge['kind']): ChatEdge {
	return {
		id: makeId('edge'),
		from,
		to,
		kind,
		label: kind,
		weight: 1,
		created_at: Date.now()
	};
}

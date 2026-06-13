import type { ChatEdge, ChatNode, ChatRole, GraphNodeKind } from '../types';
import { estimateTokens, firstLine, makeId } from '../utils/id';
import type { GraphPatch, ImportPreview } from './types';

type MessageLike = {
	role?: unknown;
	content?: unknown;
	text?: unknown;
};

const ROLE_SET = new Set<ChatRole>(['system', 'user', 'assistant', 'context']);

export function isMessageArray(value: unknown): value is MessageLike[] {
	return Array.isArray(value) && value.length > 0 && value.every((entry) => {
		if (!entry || typeof entry !== 'object') return false;
		const message = entry as MessageLike;
		return typeof message.role === 'string' && ROLE_SET.has(message.role as ChatRole) && (typeof message.content === 'string' || typeof message.text === 'string');
	});
}

export function previewMessageArray(value: MessageLike[], filename: string): ImportPreview {
	const now = Date.now();
	const nodes = value.map((message, index) => {
		const role = message.role as ChatRole;
		const text = String(message.content ?? message.text ?? '');
		return createNode({
			id: makeId('import_node'),
			role,
			text,
			title: firstLine(text, `${role} message ${index + 1}`),
			x: index * 260,
			y: role === 'assistant' ? 120 : role === 'system' ? -120 : 0,
			created_at: now + index
		});
	});
	const edges = nodes.slice(1).map((node, index) => createEdge(nodes[index].id, node.id, now + index + 1));
	return {
		title: `Import ${filename}`,
		description: `Detected ${nodes.length} chat messages.`,
		thread: { title: filename, nodes, edges }
	};
}

export function messageArrayPatch(value: MessageLike[], filename: string): GraphPatch {
	const preview = previewMessageArray(value, filename);
	return previewToPatch(preview);
}

export function previewToPatch(preview: ImportPreview): GraphPatch {
	return {
		add_nodes: preview.thread.nodes,
		add_edges: preview.thread.edges,
		select_node_ids: preview.thread.nodes.length ? [preview.thread.nodes[preview.thread.nodes.length - 1].id] : [],
		active_node_id: preview.thread.nodes.at(-1)?.id ?? null
	};
}

function createNode(input: Pick<ChatNode, 'id' | 'role' | 'title' | 'text' | 'x' | 'y' | 'created_at'>): ChatNode {
	return {
		...input,
		kind: kindFromRole(input.role),
		updated_at: input.created_at,
		tags: ['imported'],
		status: 'idle',
		token_estimate: estimateTokens(input.text)
	};
}

function createEdge(from: string, to: string, created_at: number): ChatEdge {
	return {
		id: makeId('import_edge'),
		from,
		to,
		kind: 'reply_to',
		label: 'reply_to',
		weight: 1,
		created_at
	};
}

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

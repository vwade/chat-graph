import type { ChatEdge, ChatNode, ChatRole, GraphNodeKind } from '../types';
import { estimateTokens, firstLine, makeId } from '../utils/id';
import type { GraphPatch, ImportPreview } from './types';
import { makeManifest, makeThread, stableHash } from './importUtils';

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
		kind: 'message_array',
		file_name: filename,
		provider: 'message_array',
		title: `Import ${filename}`,
		description: `Detected ${nodes.length} chat messages.`,
		thread: { title: filename, nodes, edges }
	};
}

export function messageArrayPatch(value: MessageLike[], filename: string): GraphPatch {
	const preview = previewMessageArray(value, filename);
	return previewToPatch(preview, {
		provider: 'message_array',
		file_name: filename,
		raw_hash: stableHash(value),
		json_artifact_count: 0
	});
}

export function previewToPatch(preview: ImportPreview, metadata: {
	provider?: string;
	file_name?: string;
	raw_hash?: string;
	json_artifact_count?: number;
} = {}): GraphPatch {
	if (preview.patch) return preview.patch;
	const imported_at = Date.now();
	const provider = metadata.provider ?? preview.provider ?? preview.kind ?? 'generic_json';
	const file_name = metadata.file_name ?? preview.file_name ?? preview.thread.title;
	const thread_id = makeId(`thread_${provider}`);
	const manifest = makeManifest({
		file_name,
		provider,
		imported_at,
		raw_hash: metadata.raw_hash ?? stableHash(preview.thread.nodes.map((node) => ({ id: node.id, text: node.text }))),
		thread_ids: [thread_id],
		node_count: preview.thread.nodes.length,
		edge_count: preview.thread.edges.length,
		json_artifact_count: metadata.json_artifact_count ?? preview.json_artifact_count ?? 0
	});
	const nodes = preview.thread.nodes.map((node) => ({ ...node, imported_at: node.imported_at ?? imported_at, thread_id }));
	const edges = preview.thread.edges;
	const thread = makeThread({
		thread_id,
		source_provider: provider,
		title: preview.thread.title,
		imported_at,
		root_node_id: nodes[0]?.id ?? '',
		source_manifest_id: manifest.id,
		node_ids: nodes.map((node) => node.id),
		edge_ids: edges.map((edge) => edge.id)
	});
	return {
		add_nodes: nodes,
		add_edges: edges,
		add_threads: nodes.length ? [thread] : [],
		add_import_manifests: [manifest],
		select_node_ids: nodes.length ? [nodes[nodes.length - 1].id] : [],
		active_node_id: nodes.at(-1)?.id ?? null
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

import type { ChatEdge, ChatRole, GraphPatch, GraphState } from '../types';
import { estimateTokens, makeId } from '../utils/id';
import { isRecord } from './detectImporter';
import { makeImportedEdge, makeImportedNode, makeManifest, makeThread, safeText, stableHash } from './importUtils';
import type { ImportPreview } from './types';

type MessageInput = {
	role?: unknown;
	content?: unknown;
	text?: unknown;
	created_at?: unknown;
	timestamp?: unknown;
	model?: unknown;
	id?: unknown;
};

export function buildMessageArrayPreview(data: unknown, file_name: string, current: GraphState): ImportPreview {
	const imported_at = Date.now();
	const messages = extractMessages(data);
	const raw_hash = stableHash(data);
	const manifest = makeManifest({
		file_name,
		provider: 'message_array',
		imported_at,
		raw_hash,
		thread_ids: [],
		node_count: 0,
		edge_count: 0,
		json_artifact_count: 0
	});
	const thread_id = makeId('thread');
	const root_id = makeId('node_thread_root');
	const root = makeImportedNode({
		id: root_id,
		role: 'context',
		kind: 'thread_root',
		title: titleFromData(data, file_name),
		text: `Imported message-array thread from ${file_name}.`,
		x: spawnX(current),
		y: -260,
		imported_at,
		thread_id,
		source: { provider: 'message_array', raw_hash },
		tags: ['imported', 'thread'],
		trust: 'imported-unknown'
	});

	const nodes = [root];
	const edges: ChatEdge[] = [];
	let previous_id = root.id;
	const created_values: number[] = [];

	messages.forEach((message, index) => {
		const role = normalizeRole(message.role);
		const text = safeText(message.content ?? message.text);
		const created_at = timestampToMs(message.created_at ?? message.timestamp) ?? imported_at + index;
		created_values.push(created_at);
		const node = makeImportedNode({
			role,
			text,
			title: `${role} ${index + 1}`,
			x: root.x + 320 + index * 280,
			y: root.y + (index % 2 === 0 ? 120 : -40),
			created_at,
			imported_at,
			thread_id,
			branch_id: thread_id,
			branch_path: [thread_id, String(index)],
			sibling_index: 0,
			model: typeof message.model === 'string' ? message.model : undefined,
			source: {
				provider: 'message_array',
				conversation_id: thread_id,
				message_id: typeof message.id === 'string' ? message.id : String(index),
				parent_message_id: previous_id,
				raw_path: `$.messages[${index}]`,
				raw_hash: stableHash(message)
			},
			tags: ['imported']
		});
		nodes.push(node);
		edges.push(makeImportedEdge(previous_id, node.id, previous_id === root.id ? 'contains' : 'reply_to', created_at));
		previous_id = node.id;
	});

	const thread = makeThread({
		thread_id,
		source_provider: 'message_array',
		title: root.title,
		imported_at,
		root_node_id: root.id,
		source_manifest_id: manifest.id,
		node_ids: nodes.map((node) => node.id),
		edge_ids: edges.map((edge) => edge.id)
	});
	manifest.thread_ids = [thread.thread_id];
	manifest.node_count = nodes.length;
	manifest.edge_count = edges.length;

	const patch: GraphPatch = {
		add_nodes: nodes,
		add_edges: edges,
		add_threads: [thread],
		add_import_manifests: [manifest],
		select_node_ids: [root.id],
		active_node_id: root.id
	};

	return {
		kind: 'message_array',
		file_name,
		provider: 'message_array',
		title: root.title,
		message_count: messages.length,
		branch_count: 1,
		json_artifact_count: 0,
		estimated_tokens: nodes.reduce((sum, node) => sum + estimateTokens(node.text), 0),
		date_range: range(created_values),
		threads: [thread],
		manifest,
		patch,
		warnings: []
	};
}

function extractMessages(data: unknown): MessageInput[] {
	const messages = Array.isArray(data) ? data : isRecord(data) && Array.isArray(data.messages) ? data.messages : [];
	return messages.filter(isRecord) as MessageInput[];
}

function normalizeRole(value: unknown): ChatRole {
	if (value === 'system' || value === 'user' || value === 'assistant' || value === 'tool' || value === 'context') return value;
	return 'context';
}

function timestampToMs(value: unknown): number | null {
	if (typeof value === 'number') return value > 1_000_000_000_000 ? value : value * 1000;
	if (typeof value === 'string') {
		const parsed = Date.parse(value);
		return Number.isNaN(parsed) ? null : parsed;
	}
	return null;
}

function titleFromData(data: unknown, file_name: string): string {
	if (isRecord(data) && typeof data.title === 'string') return data.title;
	return file_name.replace(/\.json$/i, '') || 'Imported thread';
}

function spawnX(current: GraphState): number {
	const xs = Object.values(current.nodes).map((node) => node.x);
	return xs.length ? Math.max(...xs) + 480 : -320;
}

function range(values: number[]): { start: number | null; end: number | null } {
	if (values.length === 0) return { start: null, end: null };
	return { start: Math.min(...values), end: Math.max(...values) };
}

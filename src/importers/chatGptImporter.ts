import type { ChatNode, ChatRole, GraphPatch, GraphState } from '../types';
import { estimateTokens, makeId } from '../utils/id';
import { makeImportedEdge, makeImportedNode, makeManifest, makeThread, safeText, stableHash } from './importUtils';
import type { ImportPreview } from './types';

type MappingEntry = {
	id?: unknown;
	message?: unknown;
	parent?: unknown;
	children?: unknown;
};

type ParsedMessage = {
	id: string;
	parent_id: string | null;
	children: string[];
	role: ChatRole;
	text: string;
	created_at: number | null;
	model?: string;
	content_json?: unknown;
	content_type: ChatNode['content_type'];
};

export function canImportChatGptMapping(data: unknown): boolean {
	const record = isRecord(data) ? data : {};
	return isRecord(record.mapping);
}

export function buildChatGptPreview(data: unknown, file_name: string, current: GraphState): ImportPreview {
	const imported_at = Date.now();
	const raw_hash = stableHash(data);
	const record = isRecord(data) ? data : {};
	const title = typeof record.title === 'string' ? record.title : file_name.replace(/\.json$/i, '') || 'Imported ChatGPT thread';
	const conversation_id = typeof record.conversation_id === 'string'
		? record.conversation_id
		: typeof record.id === 'string'
			? record.id
			: raw_hash;
	const thread_id = makeId('thread_chatgpt');
	const x = spawnX(current);
	const mapping = isRecord(record.mapping) ? record.mapping : {};
	const parsed = parseMapping(mapping);
	const root_messages = parsed.filter((message) => !message.parent_id || !parsed.some((candidate) => candidate.id === message.parent_id));
	const branch_count = parsed.filter((message) => message.children.length > 1).length;
	const json_artifact_count = parsed.filter((message) => message.content_type === 'application/json').length;

	const manifest = makeManifest({
		file_name,
		provider: 'chatgpt',
		imported_at,
		raw_hash,
		thread_ids: [thread_id],
		node_count: 0,
		edge_count: 0,
		json_artifact_count
	});
	const root = makeImportedNode({
		role: 'context',
		kind: 'thread_root',
		title,
		text: `Imported ChatGPT conversation with ${parsed.length} messages and ${branch_count} bifurcation point${branch_count === 1 ? '' : 's'}.`,
		x,
		y: -320,
		imported_at,
		thread_id,
		source: { provider: 'chatgpt', conversation_id, raw_hash },
		tags: ['imported', 'chatgpt', 'thread'],
		trust: 'imported-unknown'
	});

	const index = new Map(parsed.map((message) => [message.id, message]));
	const child_rank = new Map<string, number>();
	parsed.forEach((message) => {
		message.children.forEach((child_id, sibling_index) => child_rank.set(child_id, sibling_index));
	});
	const depth = new Map<string, number>();
	const branch_path = new Map<string, string[]>();
	const queue = root_messages.map((message, sibling_index) => ({ message, depth: 0, branch_path: [String(sibling_index)] }));
	while (queue.length > 0) {
		const current_entry = queue.shift();
		if (!current_entry) continue;
		depth.set(current_entry.message.id, current_entry.depth);
		branch_path.set(current_entry.message.id, current_entry.branch_path);
		current_entry.message.children.forEach((child_id, sibling_index) => {
			const child = index.get(child_id);
			if (!child) return;
			queue.push({
				message: child,
				depth: current_entry.depth + 1,
				branch_path: [...current_entry.branch_path, String(sibling_index)]
			});
		});
	}

	const nodes = parsed.map((message, order) => makeImportedNode({
		id: makeId(`node_${message.role}`),
		role: message.role,
		kind: message.content_type === 'application/json' ? 'json_artifact' : undefined,
		title: message.role === 'assistant' ? `Assistant ${order + 1}` : message.role === 'user' ? `User ${order + 1}` : `${message.role} ${order + 1}`,
		text: message.text,
		content_type: message.content_type,
		content_json: message.content_json,
		x: x + 320 + (depth.get(message.id) ?? order) * 280,
		y: -220 + ((child_rank.get(message.id) ?? 0) * 170) + ((order % 2) * 48),
		created_at: message.created_at ?? imported_at + order,
		imported_at,
		thread_id,
		branch_id: `${thread_id}:${(branch_path.get(message.id) ?? []).join('.')}`,
		branch_path: [thread_id, ...(branch_path.get(message.id) ?? [])],
		sibling_index: child_rank.get(message.id) ?? 0,
		model: message.model,
		source: {
			provider: 'chatgpt',
			conversation_id,
			message_id: message.id,
			parent_message_id: message.parent_id ?? undefined,
			raw_path: `$.mapping.${message.id}`,
			raw_hash: stableHash(message)
		},
		tags: ['imported', 'chatgpt']
	}));
	const by_source_id = new Map(parsed.map((message, index) => [message.id, nodes[index].id]));
	const edges = [];
	for (const message of parsed) {
		const to = by_source_id.get(message.id);
		if (!to) continue;
		const from = message.parent_id ? by_source_id.get(message.parent_id) ?? root.id : root.id;
		edges.push(makeImportedEdge(from, to, from === root.id ? 'contains' : 'reply_to', message.created_at ?? imported_at));
	}
	const all_nodes = [root, ...nodes];
	const thread = makeThread({
		thread_id,
		source_provider: 'chatgpt',
		source_conversation_id: conversation_id,
		title,
		imported_at,
		root_node_id: root.id,
		source_manifest_id: manifest.id,
		node_ids: all_nodes.map((node) => node.id),
		edge_ids: edges.map((edge) => edge.id)
	});
	manifest.node_count = all_nodes.length;
	manifest.edge_count = edges.length;
	const dates = parsed.map((message) => message.created_at).filter((value): value is number => typeof value === 'number');
	const patch: GraphPatch = {
		add_nodes: all_nodes,
		add_edges: edges,
		add_threads: [thread],
		add_import_manifests: [manifest],
		select_node_ids: [root.id],
		active_node_id: root.id
	};

	return {
		kind: 'chatgpt_mapping',
		file_name,
		provider: 'chatgpt',
		title,
		description: `Detected ChatGPT conversation with ${parsed.length} messages and ${branch_count} branch point${branch_count === 1 ? '' : 's'}.`,
		thread: { title, nodes: all_nodes, edges },
		message_count: parsed.length,
		branch_count,
		json_artifact_count,
		estimated_tokens: all_nodes.reduce((sum, node) => sum + estimateTokens(node.text), 0),
		date_range: dates.length ? { start: Math.min(...dates), end: Math.max(...dates) } : { start: null, end: null },
		threads: [thread],
		manifest,
		patch,
		warnings: parsed.length === 0 ? ['No ChatGPT messages with content were found in the mapping.'] : []
	};
}

function parseMapping(mapping: Record<string, unknown>): ParsedMessage[] {
	return Object.entries(mapping).flatMap(([id, entry]) => {
		if (!isRecord(entry)) return [];
		const parsed = parseMessage(id, entry as MappingEntry);
		return parsed && parsed.text.trim() ? [parsed] : [];
	});
}

function parseMessage(id: string, entry: MappingEntry): ParsedMessage | null {
	const message = isRecord(entry.message) ? entry.message : null;
	if (!message) return null;
	const author = isRecord(message.author) ? message.author : {};
	const role = normalizeRole(author.role);
	const content = isRecord(message.content) ? message.content : {};
	const raw_text = extractContent(content);
	const json = parseJson(raw_text);
	const metadata = isRecord(message.metadata) ? message.metadata : {};
	const model = typeof metadata.model_slug === 'string' ? metadata.model_slug : typeof metadata.model === 'string' ? metadata.model : undefined;
	return {
		id,
		parent_id: typeof entry.parent === 'string' ? entry.parent : null,
		children: Array.isArray(entry.children) ? entry.children.filter((child): child is string => typeof child === 'string') : [],
		role,
		text: json.ok ? JSON.stringify(json.value, null, 2) : raw_text,
		created_at: typeof message.create_time === 'number' ? Math.round(message.create_time * 1000) : null,
		model,
		content_json: json.ok ? json.value : undefined,
		content_type: json.ok ? 'application/json' : 'text/plain'
	};
}

function extractContent(content: Record<string, unknown>): string {
	const parts = content.parts;
	if (Array.isArray(parts)) return parts.map(safeText).join('\n\n').trim();
	if (typeof content.text === 'string') return content.text;
	return safeText(content);
}

function parseJson(text: string): { ok: true; value: unknown } | { ok: false } {
	const trimmed = text.trim();
	if (!trimmed || !/^[\[{]/.test(trimmed)) return { ok: false };
	try {
		return { ok: true, value: JSON.parse(trimmed) };
	} catch {
		return { ok: false };
	}
}

function normalizeRole(value: unknown): ChatRole {
	if (value === 'system' || value === 'user' || value === 'assistant' || value === 'tool') return value;
	return 'context';
}

function spawnX(current: GraphState): number {
	const xs = Object.values(current.nodes).map((node) => node.x);
	return xs.length ? Math.max(...xs) + 480 : -320;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

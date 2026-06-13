import type { ChatNode, GraphPatch, GraphState } from '../types';
import { estimateTokens, makeId } from '../utils/id';
import { isRecord } from './detectImporter';
import { makeImportedEdge, makeImportedNode, makeManifest, makeThread, safeText, stableHash } from './importUtils';
import type { ImportPreview } from './types';

export function buildGenericJsonPreview(data: unknown, file_name: string, current: GraphState): ImportPreview {
	const imported_at = Date.now();
	const raw_hash = stableHash(data);
	const thread_id = makeId('thread_json');
	const manifest = makeManifest({
		file_name,
		provider: 'generic_json',
		imported_at,
		raw_hash,
		thread_ids: [thread_id],
		node_count: 0,
		edge_count: 0,
		json_artifact_count: 1
	});
	const x = spawnX(current);
	const title = isRecord(data) && typeof data.title === 'string' ? data.title : file_name.replace(/\.json$/i, '') || 'JSON artifact';
	const root = makeImportedNode({
		role: 'context',
		kind: 'json_artifact',
		title,
		text: jsonDigest(data),
		content_type: 'application/json',
		content_json: data,
		x,
		y: -180,
		imported_at,
		thread_id,
		source: { provider: 'generic_json', raw_hash },
		tags: ['imported', 'json'],
		trust: 'imported-unknown'
	});

	const fields = extractJsonFields(data, '$', 0, 16).map((field, index) => makeImportedNode({
		role: 'context',
		kind: 'json_field',
		title: field.path,
		text: field.text,
		content_type: 'application/json',
		content_json: field.value,
		x: x + 340 + (index % 3) * 280,
		y: -260 + Math.floor(index / 3) * 150,
		imported_at,
		thread_id,
		branch_id: thread_id,
		branch_path: [thread_id, field.path],
		sibling_index: index,
		source: {
			provider: 'generic_json',
			conversation_id: thread_id,
			message_id: field.path,
			parent_message_id: root.id,
			raw_path: field.path,
			raw_hash: stableHash(field.value)
		},
		tags: ['imported', 'json-field'],
		trust: 'derived'
	}));
	const nodes: ChatNode[] = [root, ...fields];
	const edges = fields.map((field) => makeImportedEdge(root.id, field.id, 'contains', imported_at, 'json field'));
	const thread = makeThread({
		thread_id,
		source_provider: 'generic_json',
		title,
		imported_at,
		root_node_id: root.id,
		source_manifest_id: manifest.id,
		node_ids: nodes.map((node) => node.id),
		edge_ids: edges.map((edge) => edge.id)
	});
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
		kind: 'generic_json',
		file_name,
		provider: 'generic_json',
		title,
		message_count: 0,
		branch_count: 1,
		json_artifact_count: 1,
		estimated_tokens: nodes.reduce((sum, node) => sum + estimateTokens(node.text), 0),
		date_range: { start: null, end: null },
		threads: [thread],
		manifest,
		patch,
		warnings: fields.length === 16 ? ['Previewed the first 16 JSON fields; the raw JSON remains attached to the artifact node.'] : []
	};
}

function extractJsonFields(value: unknown, path: string, depth: number, limit: number): Array<{ path: string; value: unknown; text: string }> {
	if (limit <= 0 || depth >= 3) return [];
	if (Array.isArray(value)) {
		return value.slice(0, limit).flatMap((item, index) => {
			const child_path = `${path}[${index}]`;
			return isContainer(item)
				? [{ path: child_path, value: item, text: safeText(item) }, ...extractJsonFields(item, child_path, depth + 1, Math.max(0, limit - 1))]
				: [{ path: child_path, value: item, text: safeText(item) }];
		}).slice(0, limit);
	}
	if (isRecord(value)) {
		return Object.entries(value).slice(0, limit).flatMap(([key, child]) => {
			const child_path = `${path}.${key}`;
			return isContainer(child)
				? [{ path: child_path, value: child, text: safeText(child) }, ...extractJsonFields(child, child_path, depth + 1, Math.max(0, limit - 1))]
				: [{ path: child_path, value: child, text: safeText(child) }];
		}).slice(0, limit);
	}
	return [{ path, value, text: safeText(value) }];
}

function isContainer(value: unknown): boolean {
	return isRecord(value) || Array.isArray(value);
}

function jsonDigest(data: unknown): string {
	const text = safeText(data);
	return text.length > 4000 ? `${text.slice(0, 3997)}…` : text;
}

function spawnX(current: GraphState): number {
	const xs = Object.values(current.nodes).map((node) => node.x);
	return xs.length ? Math.max(...xs) + 480 : -320;
}

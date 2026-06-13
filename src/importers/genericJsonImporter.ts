import type { ChatEdge, ChatNode } from '../types';
import { estimateTokens, firstLine, makeId } from '../utils/id';
import type { GraphPatch, ImportPreview } from './types';
import { previewToPatch } from './messageArrayImporter';

const MAX_CHILDREN = 24;
const MAX_TEXT = 4000;

export function previewGenericJson(value: unknown, filename: string): ImportPreview {
	const now = Date.now();
	const root = createArtifactNode({
		id: makeId('import_node'),
		title: filename,
		text: stringify(value),
		x: 0,
		y: 0,
		created_at: now
	});
	const nodes: ChatNode[] = [root];
	const edges: ChatEdge[] = [];
	const entries = childEntries(value).slice(0, MAX_CHILDREN);
	entries.forEach(([key, child], index) => {
		const node = createArtifactNode({
			id: makeId('import_node'),
			title: firstLine(String(key), `JSON item ${index + 1}`),
			text: stringify(child),
			x: 280 + (index % 4) * 220,
			y: Math.floor(index / 4) * 150 - 220,
			created_at: now + index + 1
		});
		nodes.push(node);
		edges.push({
			id: makeId('import_edge'),
			from: root.id,
			to: node.id,
			kind: 'contains',
			label: 'contains',
			weight: 1,
			created_at: now + index + 1
		});
	});
	return {
		title: `Import ${filename}`,
		description: `Detected arbitrary JSON and prepared ${nodes.length} artifact node${nodes.length === 1 ? '' : 's'}.`,
		thread: { title: filename, nodes, edges }
	};
}

export function genericJsonPatch(value: unknown, filename: string): GraphPatch {
	return previewToPatch(previewGenericJson(value, filename));
}

function createArtifactNode(input: Pick<ChatNode, 'id' | 'title' | 'text' | 'x' | 'y' | 'created_at'>): ChatNode {
	return {
		...input,
		role: 'context',
		kind: 'artifact',
		updated_at: input.created_at,
		tags: ['imported', 'json'],
		status: 'idle',
		token_estimate: estimateTokens(input.text)
	};
}

function childEntries(value: unknown): [string, unknown][] {
	if (Array.isArray(value)) return value.map((entry, index) => [`[${index}]`, entry]);
	if (value && typeof value === 'object') return Object.entries(value as Record<string, unknown>);
	return [];
}

function stringify(value: unknown): string {
	const text = typeof value === 'string' ? value : JSON.stringify(value, null, '\t');
	return text.length > MAX_TEXT ? `${text.slice(0, MAX_TEXT)}\n…` : text;
}

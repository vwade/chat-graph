import type { ChatEdge, ChatNode, ChatRole, EdgeKind, GraphNodeKind, ImportManifest, ImportedThread } from '../types';
import { estimateTokens, firstLine, makeId } from '../utils/id';

export function stableHash(value: unknown): string {
	const text = typeof value === 'string' ? value : stableStringify(value);
	let hash = 2166136261;
	for (let i = 0; i < text.length; i += 1) {
		hash ^= text.charCodeAt(i);
		hash = Math.imul(hash, 16777619);
	}
	return (hash >>> 0).toString(16).padStart(8, '0');
}

export function safeText(value: unknown): string {
	if (typeof value === 'string') return value;
	if (value === null || value === undefined) return '';
	return JSON.stringify(value, null, 2);
}

export function roleToKind(role: ChatRole): GraphNodeKind {
	switch (role) {
		case 'assistant': return 'assistant_message';
		case 'system': return 'system_instruction';
		case 'tool': return 'tool_result';
		case 'context': return 'memory';
		case 'user':
		default:
			return 'user_message';
	}
}

export function makeImportedNode(input: {
	id?: string;
	role: ChatRole;
	kind?: GraphNodeKind;
	title?: string;
	text: string;
	x: number;
	y: number;
	created_at?: number;
	imported_at: number;
	tags?: string[];
	model?: string;
	thread_id?: string;
	branch_id?: string;
	branch_path?: string[];
	sibling_index?: number;
	source: ChatNode['source'];
	content_type?: ChatNode['content_type'];
	content_json?: unknown;
	trust?: ChatNode['trust'];
}): ChatNode {
	const created_at = input.created_at ?? input.imported_at;
	const title = input.title ?? firstLine(input.text, `${input.kind ?? roleToKind(input.role)} node`);
	return {
		id: input.id ?? makeId('node_import'),
		role: input.role,
		kind: input.kind ?? roleToKind(input.role),
		title,
		text: input.text,
		content_type: input.content_type ?? 'text/plain',
		content_json: input.content_json,
		x: input.x,
		y: input.y,
		created_at,
		updated_at: created_at,
		imported_at: input.imported_at,
		source: input.source,
		thread_id: input.thread_id,
		branch_id: input.branch_id,
		branch_path: input.branch_path,
		sibling_index: input.sibling_index,
		tags: input.tags ?? [],
		model: input.model,
		trust: input.trust ?? trustForRole(input.role),
		status: 'idle',
		token_estimate: estimateTokens(input.text)
	};
}

export function makeImportedEdge(from: string, to: string, kind: EdgeKind, created_at: number, label: string = kind): ChatEdge {
	return {
		id: makeId('edge_import'),
		from,
		to,
		kind,
		label,
		weight: 1,
		created_at
	};
}

export function makeThread(input: Omit<ImportedThread, 'node_ids' | 'edge_ids'> & { node_ids?: string[]; edge_ids?: string[] }): ImportedThread {
	return {
		...input,
		node_ids: input.node_ids ?? [],
		edge_ids: input.edge_ids ?? []
	};
}

export function makeManifest(input: Omit<ImportManifest, 'id'> & { id?: string }): ImportManifest {
	return {
		...input,
		id: input.id ?? makeId('manifest')
	};
}

function trustForRole(role: ChatRole): ChatNode['trust'] {
	if (role === 'user') return 'user-authored';
	if (role === 'assistant') return 'assistant-generated';
	if (role === 'tool') return 'tool-observed';
	return 'imported-unknown';
}

function stableStringify(value: unknown): string {
	if (value === null || typeof value !== 'object') return JSON.stringify(value);
	if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
	return `{${Object.entries(value as Record<string, unknown>)
		.sort(([a], [b]) => a.localeCompare(b))
		.map(([key, child]) => `${JSON.stringify(key)}:${stableStringify(child)}`)
		.join(',')}}`;
}

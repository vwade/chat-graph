import type { GraphState } from '../types';
import type { ImportKind } from './types';

type UnknownRecord = Record<string, unknown>;

export function detectImporter(data: unknown): ImportKind {
	if (isChatGraphBackup(data)) return 'chat_graph_backup';
	if (isChatGptMapping(data)) return 'chatgpt_mapping';
	if (isMessageArray(data)) return 'message_array';
	return 'generic_json';
}

export function isChatGraphBackup(data: unknown): data is GraphState {
	if (!isRecord(data)) return false;
	return data.schema_version === 1 && isRecord(data.nodes) && isRecord(data.edges);
}

export function isChatGptMapping(data: unknown): boolean {
	if (!isRecord(data)) return false;
	const mapping = data.mapping;
	if (!isRecord(mapping)) return false;
	return Object.values(mapping).some((entry) => isRecord(entry) && ('message' in entry || 'parent' in entry || 'children' in entry));
}

export function isMessageArray(data: unknown): boolean {
	const messages = Array.isArray(data) ? data : isRecord(data) ? data.messages : undefined;
	if (!Array.isArray(messages)) return false;
	return messages.some((message) => isRecord(message) && typeof message.role === 'string' && ('content' in message || 'text' in message));
}

export function isRecord(value: unknown): value is UnknownRecord {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

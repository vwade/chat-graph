import type { GraphState } from '../types';
import { detectImporter, isChatGraphBackup } from './detectImporter';
import { buildChatGptPreview } from './chatGptImporter';
import { buildGenericJsonPreview } from './genericJsonImporter';
import { buildMessageArrayPreview } from './messageArrayImporter';
import type { ImportPreview } from './types';

export function buildImportPreview(data: unknown, file_name: string, current: GraphState): ImportPreview | { kind: 'chat_graph_backup'; graph: GraphState } {
	const kind = detectImporter(data);
	if (kind === 'chat_graph_backup' && isChatGraphBackup(data)) {
		return { kind, graph: data };
	}
	if (kind === 'chatgpt_mapping') return buildChatGptPreview(data, file_name, current);
	if (kind === 'message_array') return buildMessageArrayPreview(data, file_name, current);
	return buildGenericJsonPreview(data, file_name, current);
}

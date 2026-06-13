import type { GraphState } from '../types';
import { detectImporter, isChatGraphBackup } from './detectImporter';
import type { ImportPreview } from './types';

export function buildImportPreview(data: unknown, file_name: string, current: GraphState): ImportPreview | { kind: 'chat_graph_backup'; graph: GraphState } {
	void current;
	if (isChatGraphBackup(data)) return { kind: 'chat_graph_backup', graph: data };
	return detectImporter(data, file_name).preview;
}

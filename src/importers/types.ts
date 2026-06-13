import type { GraphPatch, ImportManifest, ImportedThread } from '../types';

export type ImportKind = 'chatgpt_mapping' | 'message_array' | 'generic_json' | 'chat_graph_backup';

export type ImportPreview = {
	kind: ImportKind;
	file_name: string;
	provider: string;
	title: string;
	message_count: number;
	branch_count: number;
	json_artifact_count: number;
	estimated_tokens: number;
	date_range: { start: number | null; end: number | null };
	threads: ImportedThread[];
	manifest: ImportManifest;
	patch: GraphPatch;
	warnings: string[];
};

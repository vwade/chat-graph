import type { ChatEdge, ChatNode, ImportManifest as AppImportManifest, ImportedThread as AppImportedThread } from '../types';
export type { GraphPatch } from '../types';

export type ImportedThread = {
	title: string;
	nodes: ChatNode[];
	edges: ChatEdge[];
};

export type ImportPreview = {
	title: string;
	description: string;
	thread: ImportedThread;
	kind?: 'chatgpt_mapping' | 'chat_graph_backup' | 'message_array' | 'generic_json';
	file_name?: string;
	provider?: string;
	message_count?: number;
	branch_count?: number;
	json_artifact_count?: number;
	estimated_tokens?: number;
	date_range?: { start: number | null; end: number | null };
	threads?: AppImportedThread[];
	manifest?: AppImportManifest;
	patch?: import('../types').GraphPatch;
	warnings?: string[];
};

export type ImportManifest = {
	kind: 'chat_graph_backup' | 'message_array' | 'generic_json';
	label: string;
	description: string;
	can_restore: boolean;
};

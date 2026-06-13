import type { ChatEdge, ChatNode } from '../types';

export type ImportedThread = {
	title: string;
	nodes: ChatNode[];
	edges: ChatEdge[];
};

export type ImportPreview = {
	title: string;
	description: string;
	thread: ImportedThread;
};

export type ImportManifest = {
	kind: 'chat_graph_backup' | 'message_array' | 'generic_json';
	label: string;
	description: string;
	can_restore: boolean;
};

export type GraphPatch = {
	nodes: Record<string, ChatNode>;
	edges: Record<string, ChatEdge>;
	selected_node_ids?: string[];
	active_node_id?: string | null;
};

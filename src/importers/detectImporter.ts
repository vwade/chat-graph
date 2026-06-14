import type { GraphState } from '../types';
import { canImportChatGptMapping, buildChatGptPreview } from './chatGptImporter';
import { genericJsonPatch, previewGenericJson } from './genericJsonImporter';
import { isMessageArray, messageArrayPatch, previewMessageArray, previewToPatch } from './messageArrayImporter';
import type { GraphPatch, ImportManifest, ImportPreview } from './types';

export type DetectedImporter = ImportManifest & {
	preview: ImportPreview;
	createPatch: () => GraphPatch;
};

export function detectImporter(value: unknown, filename: string): DetectedImporter {
	if (isGraphState(value)) {
		const preview = graphStatePreview(value, filename);
		return {
			kind: 'chat_graph_backup',
			label: 'Chat Graph backup',
			description: 'Detected a full Chat Graph backup. Use Restore to replace the graph, or import to merge its nodes and edges.',
			can_restore: true,
			preview,
			createPatch: () => graphStatePatch(value)
		};
	}
	if (canImportChatGptMapping(value)) {
		const preview = buildChatGptPreview(value, filename, emptyGraphState());
		return {
			kind: 'chatgpt_mapping',
			label: 'ChatGPT conversation',
			description: 'Detected a ChatGPT conversation mapping export.',
			can_restore: false,
			preview,
			createPatch: () => preview.patch ?? previewToPatch(preview)
		};
	}
	if (isMessageArray(value)) {
		const preview = previewMessageArray(value, filename);
		return {
			kind: 'message_array',
			label: 'Message array',
			description: 'Detected an array of role/content chat messages.',
			can_restore: false,
			preview,
			createPatch: () => messageArrayPatch(value, filename)
		};
	}
	const preview = previewGenericJson(value, filename);
	return {
		kind: 'generic_json',
		label: 'Generic JSON',
		description: 'Detected arbitrary JSON and converted it to artifact nodes.',
		can_restore: false,
		preview,
		createPatch: () => genericJsonPatch(value, filename)
	};
}

function isGraphState(value: unknown): value is GraphState {
	if (!value || typeof value !== 'object') return false;
	const graph = value as Partial<GraphState>;
	return graph.schema_version === 1 && typeof graph.graph_id === 'string' && typeof graph.title === 'string' && Boolean(graph.nodes) && Boolean(graph.edges);
}

function graphStatePreview(graph: GraphState, filename: string): ImportPreview {
	const nodes = Object.values(graph.nodes ?? {});
	const edges = Object.values(graph.edges ?? {});
	return {
		kind: 'chat_graph_backup',
		file_name: filename,
		title: `Import ${graph.title || filename}`,
		description: `Detected Chat Graph backup with ${nodes.length} nodes and ${edges.length} edges.`,
		thread: { title: graph.title || filename, nodes, edges }
	};
}

function graphStatePatch(graph: GraphState): GraphPatch {
	return {
		add_nodes: Object.values(graph.nodes ?? {}),
		add_edges: Object.values(graph.edges ?? {}),
		add_threads: Object.values(graph.threads ?? {}),
		add_import_manifests: Object.values(graph.import_manifests ?? {}),
		select_node_ids: graph.selected_node_ids ?? [],
		active_node_id: graph.active_node_id ?? null
	};
}

function emptyGraphState(): GraphState {
	return {
		schema_version: 1,
		graph_id: 'import-preview',
		title: 'Import preview',
		nodes: {},
		edges: {},
		threads: {},
		import_manifests: {},
		selected_node_ids: [],
		active_node_id: null,
		linking_from_id: null,
		context_radius: 2,
		agent_mode: 'mock',
		http_endpoint: '',
		last_saved_at: null
	};
}

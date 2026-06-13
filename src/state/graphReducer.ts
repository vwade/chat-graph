import type { AgentMode, ChatEdge, ChatNode, ChatRole, EdgeKind, GraphNodeKind, GraphState } from '../types';
import type { GraphPatch } from '../importers/types';
import { createSampleGraph } from '../data/sampleGraph';
import { estimateTokens, makeId } from '../utils/id';

export type GraphAction =
	| { type: 'hydrate'; state: GraphState }
	| { type: 'apply_patch'; patch: GraphPatch }
	| { type: 'reset' }
	| { type: 'add_node'; node: ChatNode; select?: boolean }
	| { type: 'update_node'; id: string; patch: Partial<ChatNode> }
	| { type: 'move_node'; id: string; x: number; y: number }
	| { type: 'select_node'; id: string | null; multi?: boolean }
	| { type: 'set_active_node'; id: string | null }
	| { type: 'delete_selected' }
	| { type: 'add_edge'; edge: ChatEdge }
	| { type: 'begin_link'; id: string }
	| { type: 'finish_link'; to: string; kind?: EdgeKind }
	| { type: 'cancel_link' }
	| { type: 'set_context_radius'; radius: number }
	| { type: 'set_agent_config'; mode: AgentMode; endpoint: string }
	| { type: 'set_title'; title: string };

export function graphReducer(state: GraphState, action: GraphAction): GraphState {
	switch (action.type) {
		case 'hydrate': {
			return normalizeGraph(action.state);
		}
		case 'apply_patch': {
			return applyGraphPatch(state, action.patch);
		}
		case 'reset': {
			return createSampleGraph();
		}
		case 'set_title': {
			return { ...state, title: action.title };
		}
		case 'add_node': {
			const node = normalizeNode(action.node);
			return {
				...state,
				nodes: { ...state.nodes, [node.id]: node },
				selected_node_ids: action.select ? [node.id] : state.selected_node_ids,
				active_node_id: action.select ? node.id : state.active_node_id
			};
		}
		case 'update_node': {
			const old_node = state.nodes[action.id];
			if (!old_node) return state;
			const next_node = normalizeNode({
				...old_node,
				...action.patch,
				updated_at: Date.now()
			});
			return {
				...state,
				nodes: { ...state.nodes, [action.id]: next_node }
			};
		}
		case 'move_node': {
			const old_node = state.nodes[action.id];
			if (!old_node) return state;
			return {
				...state,
				nodes: {
					...state.nodes,
					[action.id]: { ...old_node, x: action.x, y: action.y, updated_at: Date.now() }
				}
			};
		}
		case 'select_node': {
			if (!action.id) {
				return { ...state, selected_node_ids: [], active_node_id: null };
			}
			const exists = Boolean(state.nodes[action.id]);
			if (!exists) return state;
			const selected = action.multi
				? state.selected_node_ids.includes(action.id)
					? state.selected_node_ids.filter((id) => id !== action.id)
					: [...state.selected_node_ids, action.id]
				: [action.id];
			return { ...state, selected_node_ids: selected, active_node_id: action.id };
		}
		case 'set_active_node': {
			return { ...state, active_node_id: action.id };
		}
		case 'delete_selected': {
			const doomed = new Set(state.selected_node_ids);
			if (doomed.size === 0) return state;
			const nodes = Object.fromEntries(Object.entries(state.nodes).filter(([id]) => !doomed.has(id)));
			const edges = Object.fromEntries(
				Object.entries(state.edges).filter(([, edge]) => !doomed.has(edge.from) && !doomed.has(edge.to))
			);
			return {
				...state,
				nodes,
				edges,
				selected_node_ids: [],
				active_node_id: state.active_node_id && doomed.has(state.active_node_id) ? null : state.active_node_id,
				linking_from_id: state.linking_from_id && doomed.has(state.linking_from_id) ? null : state.linking_from_id
			};
		}
		case 'add_edge': {
			if (!state.nodes[action.edge.from] || !state.nodes[action.edge.to]) return state;
			return {
				...state,
				edges: { ...state.edges, [action.edge.id]: action.edge }
			};
		}
		case 'begin_link': {
			if (!state.nodes[action.id]) return state;
			return { ...state, linking_from_id: action.id };
		}
		case 'finish_link': {
			if (!state.linking_from_id || !state.nodes[action.to] || state.linking_from_id === action.to) {
				return { ...state, linking_from_id: null };
			}
			const edge: ChatEdge = {
				id: makeId('edge'),
				from: state.linking_from_id,
				to: action.to,
				kind: action.kind ?? 'references',
				label: action.kind ?? 'references',
				weight: 1,
				created_at: Date.now()
			};
			return {
				...state,
				edges: { ...state.edges, [edge.id]: edge },
				linking_from_id: null
			};
		}
		case 'cancel_link': {
			return { ...state, linking_from_id: null };
		}
		case 'set_context_radius': {
			return { ...state, context_radius: Math.max(0, Math.min(12, Math.round(action.radius))) };
		}
		case 'set_agent_config': {
			return { ...state, agent_mode: action.mode, http_endpoint: action.endpoint };
		}
		default: {
			return state;
		}
	}
}

function normalizeNode(node: ChatNode): ChatNode {
	return {
		...node,
		title: node.title?.trim() || fallbackTitle(node),
		text: node.text ?? '',
		tags: Array.isArray(node.tags) ? node.tags : [],
		status: node.status ?? 'idle',
		kind: node.kind ?? kindFromRole(node.role),
		created_at: node.created_at ?? Date.now(),
		updated_at: node.updated_at ?? Date.now(),
		token_estimate: estimateTokens(node.text ?? '')
	};
}

function fallbackTitle(node: ChatNode): string {
	const start = node.text.trim().split('\n').find(Boolean);
	if (start) return start.length > 60 ? `${start.slice(0, 57)}…` : start;
	return `${node.kind ?? kindFromRole(node.role)} node`;
}

function kindFromRole(role: ChatRole): GraphNodeKind {
	switch (role) {
		case 'assistant': return 'assistant_message';
		case 'system': return 'system_instruction';
		case 'context': return 'memory';
		case 'user':
		default:
			return 'user_message';
	}
}

function normalizeGraph(state: GraphState): GraphState {
	return {
		...createSampleGraph(),
		...state,
		schema_version: 1,
		nodes: Object.fromEntries(Object.entries(state.nodes ?? {}).map(([id, node]) => [id, normalizeNode(node)])),
		edges: state.edges ?? {},
		selected_node_ids: (state.selected_node_ids ?? []).filter((id) => Boolean(state.nodes?.[id])),
		active_node_id: state.active_node_id && state.nodes?.[state.active_node_id] ? state.active_node_id : null,
		linking_from_id: state.linking_from_id && state.nodes?.[state.linking_from_id] ? state.linking_from_id : null,
		context_radius: Math.max(0, Math.min(12, Math.round(state.context_radius ?? 3))),
		agent_mode: state.agent_mode ?? 'mock',
		http_endpoint: state.http_endpoint ?? '/api/chat',
		last_saved_at: state.last_saved_at ?? null
	};
}

function applyGraphPatch(state: GraphState, patch: GraphPatch): GraphState {
	const id_map = new Map<string, string>();
	const nodes = { ...state.nodes };

	for (const [id, node] of Object.entries(patch.nodes ?? {})) {
		const next_id = nodes[id] ? makeId('import_node') : id;
		id_map.set(id, next_id);
		nodes[next_id] = normalizeNode({ ...node, id: next_id });
	}

	const edges = { ...state.edges };
	for (const [id, edge] of Object.entries(patch.edges ?? {})) {
		const from = id_map.get(edge.from) ?? edge.from;
		const to = id_map.get(edge.to) ?? edge.to;
		if (!nodes[from] || !nodes[to]) continue;
		const next_id = edges[id] ? makeId('import_edge') : id;
		edges[next_id] = { ...edge, id: next_id, from, to };
	}

	const selected_node_ids = (patch.selected_node_ids ?? [])
		.map((id) => id_map.get(id) ?? id)
		.filter((id) => Boolean(nodes[id]));
	const active_node_id = patch.active_node_id ? id_map.get(patch.active_node_id) ?? patch.active_node_id : selected_node_ids[0] ?? state.active_node_id;

	return {
		...state,
		nodes,
		edges,
		selected_node_ids,
		active_node_id: active_node_id && nodes[active_node_id] ? active_node_id : null,
		linking_from_id: null
	};
}

import type { ChatNode } from '../types';
import type { LayoutNodeState } from './layoutTypes';

export type Temporal3DOptions = {
	z_spacing?: number;
	xy_spacing?: number;
	default_x_spacing?: number;
	default_y_spacing?: number;
};

const DEFAULT_OPTIONS: Required<Temporal3DOptions> = {
	z_spacing: 960,
	xy_spacing: 84,
	default_x_spacing: 260,
	default_y_spacing: 180
};

export function projectTemporal3D(nodes: ChatNode[], options: Temporal3DOptions = {}): Record<string, LayoutNodeState> {
	const config = { ...DEFAULT_OPTIONS, ...options };
	const sorted = [...nodes].sort((a, b) => (a.created_at - b.created_at) || a.id.localeCompare(b.id));
	const times = sorted.map((node) => safeNumber(node.created_at, 0));
	const min_time = times.length > 0 ? Math.min(...times) : 0;
	const max_time = times.length > 0 ? Math.max(...times) : 0;
	const span = Math.max(1, max_time - min_time);
	const occupancy = new Map<string, number>();
	const result: Record<string, LayoutNodeState> = {};

	sorted.forEach((node, index) => {
		const fallback = seededGridPosition(node.id, index, config.default_x_spacing, config.default_y_spacing);
		const base_x = safeOptionalNumber(node.layout?.x) ?? safeOptionalNumber(node.x) ?? fallback.x;
		const base_y = safeOptionalNumber(node.layout?.y) ?? safeOptionalNumber(node.y) ?? fallback.y;
		const normalized_time = (safeNumber(node.created_at, min_time) - min_time) / span;
		const time_z = (normalized_time - 0.5) * config.z_spacing * Math.max(1, Math.log2(sorted.length + 1));
		const pinned = node.layout?.pinned ?? node.pinned ?? false;
		const z = pinned ? safeOptionalNumber(node.layout?.z) ?? safeOptionalNumber(node.z) ?? time_z : time_z;
		const spread = spreadForOverlap(base_x, base_y, occupancy, config.xy_spacing);

		result[node.id] = {
			node_id: node.id,
			x: base_x + spread.x,
			y: base_y + spread.y,
			z,
			pinned,
			group_id: node.layout?.group_id ?? node.cluster_id ?? node.thread_id ?? ''
		};
	});

	return result;
}

function spreadForOverlap(x: number, y: number, occupancy: Map<string, number>, spacing: number): { x: number; y: number } {
	const key = `${Math.round(x / spacing)}:${Math.round(y / spacing)}`;
	const count = occupancy.get(key) ?? 0;
	occupancy.set(key, count + 1);
	if (count === 0) return { x: 0, y: 0 };

	const ring = Math.ceil((Math.sqrt(count + 1) - 1) / 2);
	const side = Math.max(1, ring * 2);
	const position = count - (side - 1) * (side - 1);
	const angle = (position / Math.max(1, side * 4)) * Math.PI * 2;
	const radius = ring * spacing;
	return { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius };
}

function seededGridPosition(id: string, index: number, x_spacing: number, y_spacing: number): { x: number; y: number } {
	const hash = hashString(id);
	const column = (hash % 7) - 3;
	const row = Math.floor(index / 7) - 2;
	return { x: column * x_spacing, y: row * y_spacing };
}

function hashString(value: string): number {
	let hash = 2166136261;
	for (let i = 0; i < value.length; i += 1) {
		hash ^= value.charCodeAt(i);
		hash = Math.imul(hash, 16777619);
	}
	return hash >>> 0;
}

function safeNumber(value: number | undefined, fallback: number): number {
	return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function safeOptionalNumber(value: number | undefined): number | undefined {
	return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

import type { ChatEdge, ChatNode } from '../types';
import type { LayoutNodeState } from './layoutTypes';

export type ForceLayoutOptions = {
	dimensions?: 2 | 3;
	iterations?: number;
	link_distance?: number;
	link_strength?: number;
	charge_strength?: number;
	center_strength?: number;
	damping?: number;
};

type SimulationNode = LayoutNodeState & {
	id: string;
	vx: number;
	vy: number;
	vz: number;
};

const DEFAULT_OPTIONS: Required<ForceLayoutOptions> = {
	dimensions: 2,
	iterations: 120,
	link_distance: 360,
	link_strength: 0.012,
	charge_strength: 42_000,
	center_strength: 0.006,
	damping: 0.82
};

export function calculateForceLayout(
	nodes: ChatNode[],
	edges: ChatEdge[],
	options: ForceLayoutOptions = {}
): Record<string, LayoutNodeState> {
	const config = { ...DEFAULT_OPTIONS, ...options };
	const simulation_nodes = new Map<string, SimulationNode>();

	for (const node of nodes) {
		const layout = node.layout;
		simulation_nodes.set(node.id, {
			id: node.id,
			node_id: node.id,
			x: layout?.x ?? node.x,
			y: layout?.y ?? node.y,
			z: config.dimensions === 3 ? layout?.z ?? 0 : undefined,
			pinned: layout?.pinned ?? false,
			group_id: layout?.group_id ?? '',
			vx: 0,
			vy: 0,
			vz: 0
		});
	}

	for (let tick = 0; tick < config.iterations; tick += 1) {
		applyRepulsion(simulation_nodes, config.charge_strength, config.dimensions);
		applyLinks(simulation_nodes, edges, config.link_distance, config.link_strength, config.dimensions);
		applyCentering(simulation_nodes, config.center_strength, config.dimensions);
		integrate(simulation_nodes, config.damping, config.dimensions);
	}

	return Object.fromEntries(
		Array.from(simulation_nodes.values()).map((node) => [
			node.id,
			{
				node_id: node.node_id,
				x: node.x,
				y: node.y,
				...(config.dimensions === 3 ? { z: node.z ?? 0 } : {}),
				pinned: node.pinned,
				group_id: node.group_id
			}
		])
	);
}

function applyRepulsion(nodes: Map<string, SimulationNode>, charge_strength: number, dimensions: 2 | 3): void {
	const list = Array.from(nodes.values());
	for (let i = 0; i < list.length; i += 1) {
		for (let j = i + 1; j < list.length; j += 1) {
			const a = list[i];
			const b = list[j];
			const dx = b.x - a.x || 0.01;
			const dy = b.y - a.y || 0.01;
			const dz = dimensions === 3 ? (b.z ?? 0) - (a.z ?? 0) || 0.01 : 0;
			const distance_sq = Math.max(dx * dx + dy * dy + dz * dz, 100);
			const force = charge_strength / distance_sq;
			const distance = Math.sqrt(distance_sq);
			const fx = (dx / distance) * force;
			const fy = (dy / distance) * force;
			const fz = dimensions === 3 ? (dz / distance) * force : 0;

			if (!a.pinned) {
				a.vx -= fx;
				a.vy -= fy;
				a.vz -= fz;
			}
			if (!b.pinned) {
				b.vx += fx;
				b.vy += fy;
				b.vz += fz;
			}
		}
	}
}

function applyLinks(nodes: Map<string, SimulationNode>, edges: ChatEdge[], link_distance: number, link_strength: number, dimensions: 2 | 3): void {
	for (const edge of edges) {
		const from = nodes.get(edge.from);
		const to = nodes.get(edge.to);
		if (!from || !to) continue;

		const dx = to.x - from.x || 0.01;
		const dy = to.y - from.y || 0.01;
		const dz = dimensions === 3 ? (to.z ?? 0) - (from.z ?? 0) || 0.01 : 0;
		const distance = Math.max(Math.sqrt(dx * dx + dy * dy + dz * dz), 1);
		const force = (distance - link_distance) * link_strength * edge.weight;
		const fx = (dx / distance) * force;
		const fy = (dy / distance) * force;
		const fz = dimensions === 3 ? (dz / distance) * force : 0;

		if (!from.pinned) {
			from.vx += fx;
			from.vy += fy;
			from.vz += fz;
		}
		if (!to.pinned) {
			to.vx -= fx;
			to.vy -= fy;
			to.vz -= fz;
		}
	}
}

function applyCentering(nodes: Map<string, SimulationNode>, center_strength: number, dimensions: 2 | 3): void {
	for (const node of nodes.values()) {
		if (node.pinned) continue;
		node.vx -= node.x * center_strength;
		node.vy -= node.y * center_strength;
		if (dimensions === 3) node.vz -= (node.z ?? 0) * center_strength;
	}
}

function integrate(nodes: Map<string, SimulationNode>, damping: number, dimensions: 2 | 3): void {
	for (const node of nodes.values()) {
		if (node.pinned) {
			node.vx = 0;
			node.vy = 0;
			node.vz = 0;
			continue;
		}
		node.vx *= damping;
		node.vy *= damping;
		node.vz *= damping;
		node.x += node.vx;
		node.y += node.vy;
		if (dimensions === 3) node.z = (node.z ?? 0) + node.vz;
	}
}

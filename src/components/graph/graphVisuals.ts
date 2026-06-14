import * as THREE from 'three';
import type { ChatNode, EdgeKind } from '../../types';

export function nodeRadius(node: ChatNode): number {
	const token_component = Math.sqrt(Math.max(1, node.token_estimate)) * 1.35;
	return THREE.MathUtils.clamp(18 + token_component, 22, 72);
}

export function roleColor(role: ChatNode['role']): number {
	switch (role) {
		case 'system': return 0x9d7cff;
		case 'context': return 0xf6c453;
		case 'tool': return 0xfb7185;
		case 'user': return 0x38bdf8;
		case 'assistant': return 0x34d399;
		default: return 0x93a4c7;
	}
}

export function roleEmissive(role: ChatNode['role']): number {
	switch (role) {
		case 'system': return 0x4c1d95;
		case 'context': return 0x7c4a03;
		case 'tool': return 0x7f1d1d;
		case 'user': return 0x075985;
		case 'assistant': return 0x065f46;
		default: return 0x1f2937;
	}
}

export function edgeColor(kind: EdgeKind): number {
	switch (kind) {
		case 'reply_to':
		case 'reply': return 0x7dd3fc;
		case 'uses_context':
		case 'context': return 0xfacc15;
		case 'branches_from':
		case 'branch': return 0xc084fc;
		case 'supports': return 0x86efac;
		case 'contradicts': return 0xf87171;
		case 'revises': return 0xfbbf24;
		case 'summarizes': return 0x5eead4;
		case 'contains': return 0xd8b4fe;
		case 'generated': return 0x93c5fd;
		case 'tool_input':
		case 'tool_output': return 0xfb7185;
		case 'semantic_match': return 0xa3e635;
		case 'references':
		case 'reference':
		default:
			return 0xa7b5d6;
	}
}

export function nodePosition(node: ChatNode): THREE.Vector3 {
	return new THREE.Vector3(node.layout?.x ?? node.x, node.layout?.y ?? node.y, node.layout?.z ?? 0);
}

export function disposeObject(object: THREE.Object3D): void {
	object.traverse((child) => {
		const maybe_mesh = child as THREE.Mesh | THREE.Line | THREE.Sprite;
		if ('geometry' in maybe_mesh && maybe_mesh.geometry) maybe_mesh.geometry.dispose();
		const material = (maybe_mesh as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined;
		if (Array.isArray(material)) material.forEach(disposeMaterial);
		else if (material) disposeMaterial(material);
	});
}

function disposeMaterial(material: THREE.Material): void {
	const maybe_with_map = material as THREE.Material & { map?: THREE.Texture };
	maybe_with_map.map?.dispose();
	material.dispose();
}

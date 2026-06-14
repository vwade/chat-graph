import * as THREE from 'three';

export function setPointerFromEvent(pointer: THREE.Vector2, event: PointerEvent, element: HTMLElement): void {
	const rect = element.getBoundingClientRect();
	pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
	pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
}

export function pickNodeId(
	event: PointerEvent,
	element: HTMLElement,
	camera: THREE.Camera,
	raycaster: THREE.Raycaster,
	pointer: THREE.Vector2,
	hit_targets: THREE.Object3D[]
): string | null {
	setPointerFromEvent(pointer, event, element);
	raycaster.setFromCamera(pointer, camera);
	const hit = raycaster.intersectObjects(hit_targets, false)[0]?.object;
	return typeof hit?.userData.nodeId === 'string' ? hit.userData.nodeId : null;
}

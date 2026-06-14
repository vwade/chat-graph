import * as THREE from 'three';

export type CameraRigState = {
	mode: 'free' | 'timeline' | 'focus';
	target: THREE.Vector3;
	desired_position: THREE.Vector3;
	focus_node_id: string | null;
	focus_radius: number;
	time_cursor: number;
};

export function createCameraRigState(): CameraRigState {
	return {
		mode: 'free',
		target: new THREE.Vector3(0, 0, 0),
		desired_position: new THREE.Vector3(0, 420, 1400),
		focus_node_id: null,
		focus_radius: 760,
		time_cursor: 0
	};
}

export function smoothCameraTowardRig(camera: THREE.PerspectiveCamera, controls_target: THREE.Vector3, rig: CameraRigState, alpha = 0.08): void {
	camera.position.lerp(rig.desired_position, alpha);
	controls_target.lerp(rig.target, alpha);
}

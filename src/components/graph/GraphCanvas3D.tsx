import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { useGraph } from '../../state/GraphProvider';
import type { ChatEdge, ChatNode, GraphState } from '../../types';
import { createCameraRigState, smoothCameraTowardRig } from './graphCamera';
import { pickNodeId } from './graphPicking';
import { disposeObject, edgeColor, nodePosition, nodeRadius, roleColor, roleEmissive } from './graphVisuals';

const CAMERA_START = new THREE.Vector3(0, 420, 1400);

export function GraphCanvas3D() {
	const { state, dispatch } = useGraph();
	const mount_ref = useRef<HTMLDivElement | null>(null);
	const state_ref = useRef(state);
	const dispatch_ref = useRef(dispatch);
	const graph_group_ref = useRef<THREE.Group | null>(null);
	const label_group_ref = useRef<THREE.Group | null>(null);
	const hit_targets_ref = useRef<THREE.Object3D[]>([]);
	const pointer_ref = useRef(new THREE.Vector2());
	const raycaster_ref = useRef(new THREE.Raycaster());
	const rig_ref = useRef(createCameraRigState());
	const controls_ref = useRef<OrbitControls | null>(null);

	state_ref.current = state;
	dispatch_ref.current = dispatch;

	useEffect(() => {
		const mount = mount_ref.current;
		if (!mount) return;
		const mount_el = mount;
		const scene = new THREE.Scene();
		scene.background = new THREE.Color(0x060914);
		scene.fog = new THREE.FogExp2(0x060914, 0.00018);
		const camera = new THREE.PerspectiveCamera(55, 1, 1, 20000);
		camera.position.copy(CAMERA_START);
		camera.lookAt(0, 0, 0);

		const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
		renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
		renderer.domElement.className = 'graph-canvas graph-canvas-3d';
		mount.appendChild(renderer.domElement);

		const controls = new OrbitControls(camera, renderer.domElement);
		controls.enableDamping = true;
		controls.dampingFactor = 0.08;
		controls.rotateSpeed = 0.45;
		controls.panSpeed = 0.65;
		controls.zoomSpeed = 0.8;
		controls.minDistance = 120;
		controls.maxDistance = 9000;
		controls_ref.current = controls;

		scene.add(new THREE.AmbientLight(0x9fb7ff, 0.6));
		const key = new THREE.DirectionalLight(0xffffff, 1.1);
		key.position.set(400, 700, 900);
		scene.add(key);
		scene.add(createTemporalAxis());

		const graph_group = new THREE.Group();
		const label_group = new THREE.Group();
		scene.add(graph_group, label_group);
		graph_group_ref.current = graph_group;
		label_group_ref.current = label_group;

		function resize(): void {
			const width = Math.max(1, mount_el.clientWidth);
			const height = Math.max(1, mount_el.clientHeight);
			camera.aspect = width / height;
			camera.updateProjectionMatrix();
			renderer.setSize(width, height);
		}
		resize();
		const observer = new ResizeObserver(resize);
		observer.observe(mount_el);

		function onPointerDown(event: PointerEvent): void {
			const picked = pickNodeId(event, renderer.domElement, camera, raycaster_ref.current, pointer_ref.current, hit_targets_ref.current);
			if (picked) {
				dispatch_ref.current({ type: 'select_node', id: picked, multi: event.shiftKey || event.ctrlKey || event.metaKey });
				dispatch_ref.current({ type: 'set_focus_node', id: picked });
			}
		}

		function onWheel(event: WheelEvent): void {
			const current = state_ref.current;
			if (current.selected_node_ids.length > 0) return;
			event.preventDefault();
			const delta = event.deltaY > 0 ? 140 : -140;
			rig_ref.current.mode = 'timeline';
			rig_ref.current.time_cursor += delta;
			rig_ref.current.target.z = rig_ref.current.time_cursor;
			rig_ref.current.desired_position.set(0, 420, 1400 + rig_ref.current.time_cursor);
			dispatch_ref.current({ type: 'set_time_cursor', time_cursor: rig_ref.current.time_cursor });
		}

		renderer.domElement.addEventListener('pointerdown', onPointerDown);
		renderer.domElement.addEventListener('wheel', onWheel, { passive: false });
		rebuildGraph(state_ref.current, camera);

		renderer.setAnimationLoop(() => {
			const focused = state_ref.current.active_node_id ? state_ref.current.nodes[state_ref.current.active_node_id] : null;
			if (focused) {
				const pos = nodePosition(focused);
				rig_ref.current.mode = 'focus';
				rig_ref.current.focus_node_id = focused.id;
				rig_ref.current.target.copy(pos);
				rig_ref.current.desired_position.copy(pos).add(new THREE.Vector3(0, 180, 620));
				smoothCameraTowardRig(camera, controls.target, rig_ref.current, 0.035);
			}
			for (const label of label_group.children) label.quaternion.copy(camera.quaternion);
			for (const node of graph_group.children) {
				for (const child of node.children) if (child.userData.billboard === true) child.quaternion.copy(camera.quaternion);
			}
			controls.update();
			renderer.render(scene, camera);
		});

		return () => {
			observer.disconnect();
			renderer.setAnimationLoop(null);
			renderer.domElement.removeEventListener('pointerdown', onPointerDown);
			renderer.domElement.removeEventListener('wheel', onWheel);
			controls.dispose();
			disposeObject(graph_group);
			disposeObject(label_group);
			renderer.dispose();
			mount_el.removeChild(renderer.domElement);
		};
	}, []);

	useEffect(() => {
		const camera = controls_ref.current?.object as THREE.PerspectiveCamera | undefined;
		if (camera) rebuildGraph(state, camera);
	}, [state]);

	function rebuildGraph(graph_state: GraphState, camera: THREE.PerspectiveCamera): void {
		const graph_group = graph_group_ref.current;
		const label_group = label_group_ref.current;
		if (!graph_group || !label_group) return;
		hit_targets_ref.current = [];
		clearGroup(graph_group);
		clearGroup(label_group);
		if (graph_state.view.show_edges) {
			for (const edge of Object.values(graph_state.edges)) {
				const from = graph_state.nodes[edge.from];
				const to = graph_state.nodes[edge.to];
				if (from && to) graph_group.add(createEdgeObject(edge, from, to));
			}
		}
		for (const node of Object.values(graph_state.nodes)) {
			const selected = graph_state.selected_node_ids.includes(node.id);
			const object = createNodeObject(node, selected);
			graph_group.add(object);
			const hit = object.children.find((child) => child.userData.hitTarget === true);
			if (hit) hit_targets_ref.current.push(hit);
			if (graph_state.view.show_labels) {
				const label = createLabelSprite(node, selected);
				label.position.copy(nodePosition(node)).add(new THREE.Vector3(0, nodeRadius(node) + 34, 0));
				label.quaternion.copy(camera.quaternion);
				label_group.add(label);
			}
		}
	}

	return <div className="graph-stage" ref={mount_ref}><div className="graph-hint"><span>Orbit drag</span><span>Click to focus</span><span>Wheel scrubs time when nothing is selected</span><span>Wheel zooms focused space when selected</span></div></div>;
}

function clearGroup(group: THREE.Group): void {
	while (group.children.length > 0) {
		const child = group.children[0];
		group.remove(child);
		disposeObject(child);
	}
}

function createNodeObject(node: ChatNode, selected: boolean): THREE.Group {
	const group = new THREE.Group();
	const radius = nodeRadius(node);
	group.position.copy(nodePosition(node));
	const body = new THREE.Mesh(
		new THREE.SphereGeometry(1, 32, 18),
		new THREE.MeshStandardMaterial({ color: roleColor(node.role), emissive: roleEmissive(node.role), emissiveIntensity: selected ? 0.65 : 0.28, roughness: 0.42, metalness: 0.08, transparent: true, opacity: 0.92 })
	);
	body.scale.setScalar(radius);
	body.userData.nodeId = node.id;
	body.userData.hitTarget = true;
	group.add(body);
	const halo = new THREE.Mesh(new THREE.TorusGeometry(radius * 1.25, selected ? 2.8 : 1.4, 8, 64), new THREE.MeshBasicMaterial({ color: selected ? 0xffffff : roleColor(node.role), transparent: true, opacity: selected ? 0.75 : 0.22, depthWrite: false }));
	halo.userData.billboard = true;
	group.add(halo);
	if (node.status === 'streaming' || node.status === 'error') {
		const ring = new THREE.Mesh(new THREE.TorusGeometry(radius * 1.6, 2, 8, 64), new THREE.MeshBasicMaterial({ color: node.status === 'error' ? 0xf87171 : 0x7dd3fc, transparent: true, opacity: 0.7, depthWrite: false }));
		ring.userData.billboard = true;
		group.add(ring);
	}
	return group;
}

function createEdgeObject(edge: ChatEdge, from: ChatNode, to: ChatNode): THREE.Mesh {
	const a = nodePosition(from);
	const b = nodePosition(to);
	const mid = a.clone().add(b).multiplyScalar(0.5);
	mid.y += Math.min(220, a.distanceTo(b) * 0.12);
	const curve = new THREE.CatmullRomCurve3([a, mid, b]);
	return new THREE.Mesh(new THREE.TubeGeometry(curve, 16, Math.max(1.2, edge.weight * 1.6), 6, false), new THREE.MeshBasicMaterial({ color: edgeColor(edge.kind), transparent: true, opacity: 0.42, depthWrite: false }));
}

function createLabelSprite(node: ChatNode, selected: boolean): THREE.Sprite {
	const canvas = document.createElement('canvas');
	canvas.width = 1024;
	canvas.height = 320;
	const ctx = canvas.getContext('2d');
	if (!ctx) throw new Error('Canvas 2D context unavailable.');
	ctx.fillStyle = selected ? 'rgba(255,255,255,0.98)' : 'rgba(235,241,255,0.92)';
	ctx.font = '700 54px system-ui, -apple-system, Segoe UI, sans-serif';
	ctx.fillText(node.title || node.role, 40, 78);
	ctx.font = '600 30px system-ui, -apple-system, Segoe UI, sans-serif';
	ctx.fillStyle = 'rgba(179,193,224,0.9)';
	ctx.fillText(`${node.role.toUpperCase()} · ${node.token_estimate} tok`, 42, 126);
	ctx.font = '30px system-ui, -apple-system, Segoe UI, sans-serif';
	ctx.fillStyle = 'rgba(225,232,249,0.78)';
	ctx.fillText(node.text.replace(/\s+/g, ' ').slice(0, 88), 42, 178);
	const texture = new THREE.CanvasTexture(canvas);
	texture.colorSpace = THREE.SRGBColorSpace;
	const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false }));
	sprite.scale.set(240, 76, 1);
	return sprite;
}

function createTemporalAxis(): THREE.Group {
	const group = new THREE.Group();
	const material = new THREE.LineBasicMaterial({ color: 0x2d3a62, transparent: true, opacity: 0.55 });
	for (let z = -2400; z <= 2400; z += 240) {
		const geometry = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-36, -220, z), new THREE.Vector3(36, -220, z)]);
		group.add(new THREE.Line(geometry, material));
	}
	const rail = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, -220, -2600), new THREE.Vector3(0, -220, 2600)]);
	group.add(new THREE.Line(rail, material));
	return group;
}

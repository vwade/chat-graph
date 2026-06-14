import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { useGraph } from '../../state/GraphProvider';
import type { ChatEdge, ChatNode, EdgeKind, GraphState } from '../../types';

const NODE_W = 260;
const NODE_H = 126;
const NODE_RADIUS = 16;
const CAMERA_Z = 1000;

type DragState =
	| { type: 'node'; id: string; offset_x: number; offset_y: number }
	| { type: 'pan'; last_x: number; last_y: number }
	| null;

export function GraphCanvas2D() {
	const { state, dispatch } = useGraph();
	const mount_ref = useRef<HTMLDivElement | null>(null);
	const state_ref = useRef(state);
	const dispatch_ref = useRef(dispatch);
	const scene_ref = useRef<THREE.Scene | null>(null);
	const camera_ref = useRef<THREE.OrthographicCamera | null>(null);
	const renderer_ref = useRef<THREE.WebGLRenderer | null>(null);
	const graph_group_ref = useRef<THREE.Group | null>(null);
	const hit_targets_ref = useRef<THREE.Object3D[]>([]);
	const drag_ref = useRef<DragState>(null);
	const raycaster_ref = useRef(new THREE.Raycaster());
	const pointer_ref = useRef(new THREE.Vector2());

	state_ref.current = state;
	dispatch_ref.current = dispatch;

	useEffect(() => {
		const mount = mount_ref.current;
		if (mount === null) return;
		const mount_el = mount;

		const scene = new THREE.Scene();
		scene.background = new THREE.Color(0x0b1020);
		const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 4000);
		camera.position.set(0, 0, CAMERA_Z);
		camera.lookAt(0, 0, 0);

		const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
		renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
		renderer.domElement.className = 'graph-canvas';
		mount.appendChild(renderer.domElement);

		const grid = new THREE.GridHelper(5000, 80, 0x253047, 0x141b2c);
		grid.rotation.x = Math.PI / 2;
		grid.position.z = -30;
		scene.add(grid);

		const graph_group = new THREE.Group();
		scene.add(graph_group);

		scene_ref.current = scene;
		camera_ref.current = camera;
		renderer_ref.current = renderer;
		graph_group_ref.current = graph_group;

		function resize(): void {
			const width = Math.max(1, mount_el.clientWidth);
			const height = Math.max(1, mount_el.clientHeight);
			camera.left = -width / 2;
			camera.right = width / 2;
			camera.top = height / 2;
			camera.bottom = -height / 2;
			camera.updateProjectionMatrix();
			renderer.setSize(width, height);
		}

		resize();
		const observer = new ResizeObserver(resize);
		observer.observe(mount_el);

		const onPointerDown = (event: PointerEvent): void => {
			renderer.domElement.setPointerCapture(event.pointerId);
			const picked = pickNode(event);
			const current_state = state_ref.current;

			if (picked) {
				if (current_state.linking_from_id && current_state.linking_from_id !== picked) {
					dispatch_ref.current({ type: 'finish_link', to: picked, kind: event.altKey ? 'contradicts' : 'references' });
					return;
				}

				dispatch_ref.current({ type: 'select_node', id: picked, multi: event.shiftKey || event.ctrlKey || event.metaKey });
				const node = current_state.nodes[picked];
				const world = eventToWorld(event);
				drag_ref.current = {
					type: 'node',
					id: picked,
					offset_x: node.x - world.x,
					offset_y: node.y - world.y
				};
			} else {
				dispatch_ref.current({ type: 'select_node', id: null });
				drag_ref.current = { type: 'pan', last_x: event.clientX, last_y: event.clientY };
			}
		};

		const onPointerMove = (event: PointerEvent): void => {
			const drag = drag_ref.current;
			if (!drag) return;

			if (drag.type === 'node') {
				const world = eventToWorld(event);
				dispatch_ref.current({ type: 'move_node', id: drag.id, x: world.x + drag.offset_x, y: world.y + drag.offset_y });
				return;
			}

			const zoom = camera.zoom || 1;
			const dx = (event.clientX - drag.last_x) / zoom;
			const dy = (event.clientY - drag.last_y) / zoom;
			camera.position.x -= dx;
			camera.position.y += dy;
			camera.updateProjectionMatrix();
			drag_ref.current = { type: 'pan', last_x: event.clientX, last_y: event.clientY };
		};

		const onPointerUp = (event: PointerEvent): void => {
			drag_ref.current = null;
			if (renderer.domElement.hasPointerCapture(event.pointerId)) {
				renderer.domElement.releasePointerCapture(event.pointerId);
			}
		};

		const onWheel = (event: WheelEvent): void => {
			event.preventDefault();
			const zoom_factor = event.deltaY < 0 ? 1.1 : 0.9;
			camera.zoom = THREE.MathUtils.clamp(camera.zoom * zoom_factor, 0.25, 4);
			camera.updateProjectionMatrix();
		};

		const onKeyDown = (event: KeyboardEvent): void => {
			const target = event.target as HTMLElement | null;
			const tag = target?.tagName.toLowerCase();
			if (tag === 'input' || tag === 'textarea' || target?.isContentEditable) return;

			if (event.key === 'Delete' || event.key === 'Backspace') {
				event.preventDefault();
				dispatch_ref.current({ type: 'delete_selected' });
			}
			if (event.key === 'Escape') {
				dispatch_ref.current({ type: 'cancel_link' });
			}
		};

		renderer.domElement.addEventListener('pointerdown', onPointerDown);
		renderer.domElement.addEventListener('pointermove', onPointerMove);
		renderer.domElement.addEventListener('pointerup', onPointerUp);
		renderer.domElement.addEventListener('pointercancel', onPointerUp);
		renderer.domElement.addEventListener('wheel', onWheel, { passive: false });
		window.addEventListener('keydown', onKeyDown);

		renderer.setAnimationLoop(() => {
			renderer.render(scene, camera);
		});

		rebuildGraph(state_ref.current);

		return () => {
			observer.disconnect();
			renderer.setAnimationLoop(null);
			renderer.domElement.removeEventListener('pointerdown', onPointerDown);
			renderer.domElement.removeEventListener('pointermove', onPointerMove);
			renderer.domElement.removeEventListener('pointerup', onPointerUp);
			renderer.domElement.removeEventListener('pointercancel', onPointerUp);
			renderer.domElement.removeEventListener('wheel', onWheel);
			window.removeEventListener('keydown', onKeyDown);
			disposeObject(graph_group);
			disposeObject(grid);
			renderer.dispose();
			mount_el.removeChild(renderer.domElement);
		};
	}, []);

	useEffect(() => {
		rebuildGraph(state);
	}, [state]);

	function rebuildGraph(graph_state: GraphState): void {
		const group = graph_group_ref.current;
		if (!group) return;

		hit_targets_ref.current = [];
		while (group.children.length > 0) {
			const child = group.children[0];
			group.remove(child);
			disposeObject(child);
		}

		const nodes = Object.values(graph_state.nodes);
		const edges = Object.values(graph_state.edges);

		for (const edge of edges) {
			const from = graph_state.nodes[edge.from];
			const to = graph_state.nodes[edge.to];
			if (!from || !to) continue;
			group.add(createEdgeObject(edge, from, to));
		}

		for (const node of nodes) {
			const selected = graph_state.selected_node_ids.includes(node.id);
			const linking = graph_state.linking_from_id === node.id;
			const object = createNodeObject(node, selected, linking);
			group.add(object);
			const hit = object.children.find((child) => child.userData.hitTarget === true);
			if (hit) hit_targets_ref.current.push(hit);
		}
	}

	function pickNode(event: PointerEvent): string | null {
		const camera = camera_ref.current;
		const renderer = renderer_ref.current;
		if (!camera || !renderer) return null;

		const rect = renderer.domElement.getBoundingClientRect();
		pointer_ref.current.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
		pointer_ref.current.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
		raycaster_ref.current.setFromCamera(pointer_ref.current, camera);
		const hits = raycaster_ref.current.intersectObjects(hit_targets_ref.current, false);
		const hit = hits[0]?.object;
		return typeof hit?.userData.nodeId === 'string' ? hit.userData.nodeId : null;
	}

	function eventToWorld(event: PointerEvent): THREE.Vector3 {
		const camera = camera_ref.current;
		const renderer = renderer_ref.current;
		if (!camera || !renderer) return new THREE.Vector3();

		const rect = renderer.domElement.getBoundingClientRect();
		pointer_ref.current.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
		pointer_ref.current.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
		raycaster_ref.current.setFromCamera(pointer_ref.current, camera);
		const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
		const intersection = new THREE.Vector3();
		raycaster_ref.current.ray.intersectPlane(plane, intersection);
		return intersection;
	}

	return (
		<div className="graph-stage" ref={mount_ref}>
			<div className="graph-hint">
				<span>Drag nodes</span>
				<span>Wheel zoom</span>
				<span>Drag empty space to pan</span>
				<span>Shift-click multi-select</span>
			</div>
		</div>
	);
}

function createNodeObject(node: ChatNode, selected: boolean, linking: boolean): THREE.Group {
	const group = new THREE.Group();
	group.position.set(node.x, node.y, 0);
	group.userData.nodeId = node.id;

	const color = roleColor(node.role, selected, linking);
	const body = new THREE.Mesh(
		new THREE.PlaneGeometry(NODE_W, NODE_H, 1, 1),
		new THREE.MeshBasicMaterial({ color, transparent: true, opacity: selected ? 0.98 : 0.9 })
	);
	body.userData.nodeId = node.id;
	body.userData.hitTarget = true;
	body.position.z = 1;
	group.add(body);

	const border = createRectBorder(NODE_W, NODE_H, selected || linking ? 0xffffff : 0x5f6d89, selected ? 2 : 1);
	border.position.z = 2;
	group.add(border);

	const sprite = createNodeTextSprite(node, selected, linking);
	sprite.position.set(0, 0, 4);
	group.add(sprite);

	if (node.status === 'streaming') {
		const pulse = createRectBorder(NODE_W + 12, NODE_H + 12, 0x7bdff2, 1);
		pulse.position.z = 3;
		group.add(pulse);
	}

	return group;
}

function createEdgeObject(edge: ChatEdge, from: ChatNode, to: ChatNode): THREE.Group {
	const group = new THREE.Group();
	const dx = to.x - from.x;
	const dy = to.y - from.y;
	const normal = new THREE.Vector3(-dy, dx, 0).normalize().multiplyScalar(36);
	if (!Number.isFinite(normal.x)) normal.set(0, 0, 0);

	const start = new THREE.Vector3(from.x, from.y, -6);
	const end = new THREE.Vector3(to.x, to.y, -6);
	const mid = new THREE.Vector3((from.x + to.x) / 2 + normal.x, (from.y + to.y) / 2 + normal.y, -6);
	const curve = new THREE.QuadraticBezierCurve3(start, mid, end);
	const points = curve.getPoints(24);
	const geometry = new THREE.BufferGeometry().setFromPoints(points);
	const material = new THREE.LineBasicMaterial({ color: edgeColor(edge.kind), transparent: true, opacity: 0.72 });
	const line = new THREE.Line(geometry, material);
	group.add(line);

	const arrow = createArrowHead(points.at(-2) ?? start, end, edge.kind);
	group.add(arrow);

	return group;
}

function createArrowHead(previous: THREE.Vector3, end: THREE.Vector3, kind: EdgeKind): THREE.Mesh {
	const geometry = new THREE.ConeGeometry(7, 18, 3);
	const material = new THREE.MeshBasicMaterial({ color: edgeColor(kind), transparent: true, opacity: 0.86 });
	const mesh = new THREE.Mesh(geometry, material);
	mesh.position.copy(end);
	mesh.position.z = -5;

	const angle = Math.atan2(end.y - previous.y, end.x - previous.x) - Math.PI / 2;
	mesh.rotation.z = angle;
	return mesh;
}

function createRectBorder(width: number, height: number, color: number, _line_width: number): THREE.LineSegments {
	const x = width / 2;
	const y = height / 2;
	const points = [
		new THREE.Vector3(-x + NODE_RADIUS, -y, 0), new THREE.Vector3(x - NODE_RADIUS, -y, 0),
		new THREE.Vector3(x, -y + NODE_RADIUS, 0), new THREE.Vector3(x, y - NODE_RADIUS, 0),
		new THREE.Vector3(x - NODE_RADIUS, y, 0), new THREE.Vector3(-x + NODE_RADIUS, y, 0),
		new THREE.Vector3(-x, y - NODE_RADIUS, 0), new THREE.Vector3(-x, -y + NODE_RADIUS, 0)
	];
	const geometry = new THREE.BufferGeometry().setFromPoints(points);
	const material = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.92 });
	return new THREE.LineSegments(geometry, material);
}

function createNodeTextSprite(node: ChatNode, selected: boolean, linking: boolean): THREE.Sprite {
	const canvas = document.createElement('canvas');
	canvas.width = 1024;
	canvas.height = 512;
	const ctx = canvas.getContext('2d');
	if (!ctx) throw new Error('Canvas 2D context unavailable.');

	ctx.clearRect(0, 0, canvas.width, canvas.height);
	ctx.fillStyle = selected ? 'rgba(255,255,255,0.98)' : 'rgba(235,241,255,0.95)';
	ctx.font = '700 52px system-ui, -apple-system, Segoe UI, sans-serif';
	ctx.fillText(node.title || node.role, 54, 84);

	ctx.font = '600 28px system-ui, -apple-system, Segoe UI, sans-serif';
	ctx.fillStyle = linking ? 'rgba(125, 223, 242, 0.98)' : 'rgba(179, 193, 224, 0.9)';
	const meta = `${node.kind.replaceAll('_', ' ').toUpperCase()} · ${node.token_estimate} tok`;
	ctx.fillText(meta, 56, 130);

	ctx.font = '32px system-ui, -apple-system, Segoe UI, sans-serif';
	ctx.fillStyle = 'rgba(225,232,249,0.9)';
	wrapText(ctx, node.text.replace(/\s+/g, ' '), 56, 188, 900, 42, 5);

	const texture = new THREE.CanvasTexture(canvas);
	texture.colorSpace = THREE.SRGBColorSpace;
	texture.needsUpdate = true;
	const material = new THREE.SpriteMaterial({ map: texture, transparent: true });
	const sprite = new THREE.Sprite(material);
	sprite.scale.set(NODE_W, NODE_H, 1);
	return sprite;
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, max_width: number, line_height: number, max_lines: number): void {
	const words = text.split(' ');
	let line = '';
	let lines = 0;

	for (const word of words) {
		const test_line = line ? `${line} ${word}` : word;
		const metrics = ctx.measureText(test_line);
		if (metrics.width > max_width && line) {
			ctx.fillText(lines === max_lines - 1 ? `${line.slice(0, 86)}…` : line, x, y + lines * line_height);
			line = word;
			lines += 1;
			if (lines >= max_lines) return;
		} else {
			line = test_line;
		}
	}

	if (line && lines < max_lines) {
		ctx.fillText(line, x, y + lines * line_height);
	}
}

function roleColor(role: ChatNode['role'], selected: boolean, linking: boolean): number {
	if (linking) return 0x256d7b;
	if (selected) return 0x415174;
	switch (role) {
		case 'system': return 0x47306f;
		case 'context': return 0x5b4a1f;
		case 'tool': return 0x6d3a53;
		case 'user': return 0x244d76;
		case 'assistant': return 0x265c4a;
		default: return 0x334155;
	}
}

function edgeColor(kind: EdgeKind): number {
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
		case 'references':
		case 'reference':
		default:
			return 0xa7b5d6;
	}
}

function disposeObject(object: THREE.Object3D): void {
	object.traverse((child) => {
		const maybe_mesh = child as THREE.Mesh | THREE.Line | THREE.Sprite;
		if ('geometry' in maybe_mesh && maybe_mesh.geometry) {
			maybe_mesh.geometry.dispose();
		}
		const material = (maybe_mesh as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined;
		if (Array.isArray(material)) {
			material.forEach(disposeMaterial);
		} else if (material) {
			disposeMaterial(material);
		}
	});
}

function disposeMaterial(material: THREE.Material): void {
	const maybe_with_map = material as THREE.Material & { map?: THREE.Texture };
	maybe_with_map.map?.dispose();
	material.dispose();
}

I looked at `master`. My take: the current app is a clean **2D graph prototype**, but the rendering layer is still too monolithic for the 3D direction. The 3D version should not be a small patch inside the existing `GraphCanvas`; it should become a new viewport mode that shares the same graph state.

Right now the README correctly describes the app as a React + TypeScript + Three.js nonlinear chat graph, with current features centered on the 2D editor and future items including force-directed layout, semantic expansion, and layout tools.   The actual canvas implementation confirms that: `GraphCanvas` uses an `OrthographicCamera`, a flat grid, `x/y` node positions, rectangle plane meshes, and wheel zoom.   The node schema also only stores `x` and `y`, with no `z`, viewport mode, layout mode, cluster/focus state, or 3D navigation state yet. 

So: keep the current square 2D canvas as a secondary/manual view. But for your intended “round nodes in navigable 3D context space,” I would ask Codex to implement this as a **new 3D viewport**, not a mutation of the old one.

Here is the Codex-ready brief I would forward.

---

# Chat Graph 3D Viewport Implementation Brief

## Goal

Add a new **3D graph viewport** to Chat Graph while preserving the existing 2D rectangular node editor as a secondary mode.

The 3D viewport should render chat/context nodes as round glowing sphere nodes in a navigable spatial graph. It should support depth, orbiting, node selection, semantic/temporal layout, and the special zoom behavior described below:

When no node is selected, mouse wheel scrolls through time, sliding the graph forward/backward along a temporal depth axis.

When a node is selected, mouse wheel zooms toward or away from that node’s local subgraph, using the selected node as the focus center and bringing its children/related nodes into view.

This should feel less like a flat diagram and more like a navigable “context space” or constellation.

## Current repo observations

The current `App.tsx` directly mounts a single `GraphCanvas` component. Replace that direct mount with a viewport wrapper so the app can switch between 2D and 3D modes. 

The current `GraphCanvas` clears and rebuilds all Three objects whenever graph state changes. That is acceptable for a small static 2D prototype, but it is not a good model for animated 3D layout, where node positions may update every frame. 

The current node rendering uses `PlaneGeometry` rectangles plus canvas-text sprites. This is exactly the part that should remain in the 2D viewport and be replaced by spheres/halos/labels in the 3D viewport. 

The project already depends on `three`, so the first 3D pass can be implemented without a major dependency explosion.  Three’s docs include the pieces needed for this direction: `PerspectiveCamera`, `SphereGeometry`, `InstancedMesh`, `LOD`, `Raycaster`, and `OrbitControls` are all part of the documented Three API/addons surface. ([Three.js][1])

## Desired file structure

Refactor from this:

```text
src/components/GraphCanvas.tsx
```

To this:

```text
src/components/graph/
	GraphViewport.tsx
	GraphCanvas2D.tsx
	GraphCanvas3D.tsx
	GraphViewControls.tsx
	graphColors.ts
	graphLabels.ts
	graphPicking.ts
	graphEdges.ts
	graphNodes3d.ts

src/layout/
	layoutTypes.ts
	force3d.ts
	temporal3d.ts
	focus.ts
```

`GraphCanvas2D.tsx` can initially be a renamed/moved copy of the current `GraphCanvas.tsx`.

`GraphViewport.tsx` decides which viewport to render:

```tsx
import { GraphCanvas2D } from './GraphCanvas2D';
import { GraphCanvas3D } from './GraphCanvas3D';
import { useGraph } from '../../state/GraphProvider';

export function GraphViewport() {
	const { state } = useGraph();

	if (state.viewport_mode === '3d') {
		return <GraphCanvas3D />;
	}

	return <GraphCanvas2D />;
}
```

Then update `App.tsx`:

```tsx
import { GraphViewport } from './components/graph/GraphViewport';

// ...

<section className="graph-pane">
	<GraphViewport />
</section>
```

## Schema changes

Extend `types.ts` carefully while preserving old imported/exported graph JSON.

Current nodes have `x` and `y` only. Add optional `z` and view/layout state without breaking old graphs. 

```ts
export type Vec3 = {
	x: number;
	y: number;
	z: number;
};

export type ViewportMode = '2d' | '3d';

export type LayoutMode =
	| 'manual_2d'
	| 'force_3d'
	| 'temporal_3d'
	| 'cluster_3d';

export type ChatNode = {
	id: string;
	role: ChatRole;
	title: string;
	text: string;

	x: number;
	y: number;
	z?: number;

	created_at: number;
	updated_at: number;
	tags: string[];
	model?: string;
	status: ChatNodeStatus;
	token_estimate: number;

	pinned?: boolean;
	cluster_id?: string | null;
};

export type GraphViewState = {
	viewport_mode: ViewportMode;
	layout_mode: LayoutMode;

	time_cursor: number | null;
	time_window_ms: number | null;

	focused_node_id: string | null;
	focus_depth: number;

	show_labels: boolean;
	show_edges: boolean;
	show_temantic_halos: boolean;
};

export type GraphState = {
	schema_version: 2;
	graph_id: string;
	title: string;
	nodes: Record<string, ChatNode>;
	edges: Record<string, ChatEdge>;

	selected_node_ids: string[];
	active_node_id: string | null;
	linking_from_id: string | null;

	context_radius: number;
	agent_mode: AgentMode;
	http_endpoint: string;
	last_saved_at: number | null;

	view: GraphViewState;
};
```

In `normalizeGraph`, migrate old v1 graphs:

```ts
function normalizeGraph(state: GraphState | Partial<GraphState>): GraphState {
	const base = createSampleGraph();

	return {
		...base,
		...state,
		schema_version: 2,
		nodes: Object.fromEntries(
			Object.entries(state.nodes ?? {}).map(([id, node]) => [
				id,
				normalizeNode({
					...node,
					z: Number.isFinite(node.z) ? node.z : 0
				} as ChatNode)
			])
		),
		view: {
			viewport_mode: state.view?.viewport_mode ?? '2d',
			layout_mode: state.view?.layout_mode ?? 'manual_2d',
			time_cursor: state.view?.time_cursor ?? null,
			time_window_ms: state.view?.time_window_ms ?? null,
			focused_node_id: state.view?.focused_node_id ?? null,
			focus_depth: state.view?.focus_depth ?? 2,
			show_labels: state.view?.show_labels ?? true,
			show_edges: state.view?.show_edges ?? true,
			show_temantic_halos: state.view?.show_temantic_halos ?? true
		}
	};
}
```

Add reducer actions:

```ts
| { type: 'set_viewport_mode'; mode: ViewportMode }
| { type: 'set_layout_mode'; mode: LayoutMode }
| { type: 'set_time_cursor'; time_cursor: number | null }
| { type: 'set_focus_node'; id: string | null; depth?: number }
| { type: 'move_node_3d'; id: string; x: number; y: number; z: number }
| { type: 'set_node_pinned'; id: string; pinned: boolean }
```

## 3D viewport behavior

### Camera

Use `PerspectiveCamera` for the 3D mode. The current 2D mode uses `OrthographicCamera`, which is correct for a flat node editor, but the 3D context-space needs perspective depth. 

Recommended initial setup:

```ts
const camera = new THREE.PerspectiveCamera(55, width / height, 1, 20000);
camera.position.set(0, 420, 1400);
camera.lookAt(0, 0, 0);
```

Add `OrbitControls`:

```ts
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.rotateSpeed = 0.45;
controls.panSpeed = 0.65;
controls.zoomSpeed = 0.8;
controls.minDistance = 120;
controls.maxDistance = 9000;
```

The 3D viewport should have a camera rig object:

```ts
type CameraRigState = {
	mode: 'free' | 'timeline' | 'focus';
	target: THREE.Vector3;
	desired_position: THREE.Vector3;
	focus_node_id: string | null;
	focus_radius: number;
	time_cursor: number;
};
```

The render loop should smoothly interpolate camera position and `controls.target`.

### Scene

Use a darker spatial background with fog/depth cues:

```ts
scene.background = new THREE.Color(0x060914);
scene.fog = new THREE.FogExp2(0x060914, 0.00018);

const ambient = new THREE.AmbientLight(0x9fb7ff, 0.6);
const key = new THREE.DirectionalLight(0xffffff, 1.1);
key.position.set(400, 700, 900);

scene.add(ambient, key);
```

Add a faint temporal/depth axis. Not a flat construction grid. More like a star-map rail:

```text
oldest chats  ←──────── temporal axis ────────→ newest chats
```

The temporal axis can be the `z` dimension at first.

## 3D node design

Replace square cards with round nodes:

```ts
const radius = nodeRadius(node);

const sphere = new THREE.Mesh(
	sharedSphereGeometry,
	new THREE.MeshStandardMaterial({
		color: roleColor(node.role),
		emissive: roleEmissive(node.role),
		emissiveIntensity: selected ? 0.65 : 0.28,
		roughness: 0.42,
		metalness: 0.08,
		transparent: true,
		opacity: faded ? 0.22 : 0.92
	})
);

sphere.scale.setScalar(radius);
sphere.userData.nodeId = node.id;
sphere.userData.hitTarget = true;
```

Suggested radius function:

```ts
function nodeRadius(node: ChatNode): number {
	const token_component = Math.sqrt(Math.max(1, node.token_estimate)) * 1.35;
	return THREE.MathUtils.clamp(18 + token_component, 22, 72);
}
```

Visual language:

```text
user       blue/cyan orb
assistant  teal/green orb
system     violet orb
context    amber/gold orb
selected   white outer halo + slightly larger scale
streaming  pulsing ring
error      red fracture/ring
```

Use halos:

```ts
const halo = new THREE.Mesh(
	new THREE.TorusGeometry(radius * 1.25, 1.6, 8, 64),
	new THREE.MeshBasicMaterial({
		color: selected ? 0xffffff : roleColor(node.role),
		transparent: true,
		opacity: selected ? 0.75 : 0.22,
		depthWrite: false
	})
);
```

Make halos billboard toward the camera each frame:

```ts
halo.quaternion.copy(camera.quaternion);
```

For labels, keep the current canvas-sprite approach initially. It already exists in the 2D canvas and avoids adding another renderer. The label should float above the sphere:

```ts
label.position.set(0, radius + 28, 0);
label.scale.set(220, 70, 1);
```

At far zoom, show title only. At near zoom, show title, role, token estimate, and first text line.

Later, CSS2D labels can be added if HTML labels become necessary. Three has `CSS2DRenderer` in its examples/docs surface, but for the first 3D pass, sprites are simpler and already aligned with the existing code path. ([Three.js][1])

## Edges in 3D

In 2D, edges are Bezier curves with arrowheads. In 3D, use curved tubes or translucent lines.

Start simple:

```ts
const curve = new THREE.CatmullRomCurve3([
	from_pos,
	mid_pos,
	to_pos
]);

const geometry = new THREE.TubeGeometry(curve, 16, edgeRadius(edge), 6, false);
const material = new THREE.MeshBasicMaterial({
	color: edgeColor(edge.kind),
	transparent: true,
	opacity: edgeOpacity(edge),
	depthWrite: false
});
```

Midpoint lift:

```ts
const mid = from.clone().add(to).multiplyScalar(0.5);
const distance = from.distanceTo(to);
mid.y += Math.min(220, distance * 0.12);
```

Use subtle animated flow later, but not in the first pass. The first pass should prioritize camera, selection, and node readability.

## Force layout

The 3D graph should have “springy self-organizing” behavior. This is a force-directed layout: edges act like springs, nodes repel each other, and the whole system settles into a readable shape. D3’s force docs describe this exact pattern: a simulation over nodes, forces such as link/collision/many-body, and tick updates that are rendered by the chosen graphics layer. ([D3.js][2])

For the first Codex pass, I recommend **not** adding a new force dependency yet. Implement a tiny local 3D solver. That gives us full control over temporal depth and node focus.

Create:

```text
src/layout/force3d.ts
```

Core types:

```ts
export type LayoutNode3D = {
	id: string;
	x: number;
	y: number;
	z: number;
	vx: number;
	vy: number;
	vz: number;
	radius: number;
	mass: number;
	pinned: boolean;
};

export type LayoutEdge3D = {
	from: string;
	to: string;
	distance: number;
	strength: number;
};

export type Force3DOptions = {
	repulsion: number;
	link_strength: number;
	center_strength: number;
	damping: number;
	max_velocity: number;
};
```

Basic tick:

```ts
export function tickForce3D(
	nodes: Map<string, LayoutNode3D>,
	edges: LayoutEdge3D[],
	options: Force3DOptions,
	dt: number
): void {
	const node_list = [...nodes.values()];

	// Repulsion.
	for (let i = 0; i < node_list.length; i += 1) {
		for (let j = i + 1; j < node_list.length; j += 1) {
			const a = node_list[i];
			const b = node_list[j];

			const dx = b.x - a.x;
			const dy = b.y - a.y;
			const dz = b.z - a.z;
			const dist_sq = Math.max(80, dx * dx + dy * dy + dz * dz);
			const dist = Math.sqrt(dist_sq);
			const force = options.repulsion / dist_sq;

			const fx = (dx / dist) * force;
			const fy = (dy / dist) * force;
			const fz = (dz / dist) * force;

			if (!a.pinned) {
				a.vx -= fx / a.mass;
				a.vy -= fy / a.mass;
				a.vz -= fz / a.mass;
			}

			if (!b.pinned) {
				b.vx += fx / b.mass;
				b.vy += fy / b.mass;
				b.vz += fz / b.mass;
			}
		}
	}

	// Spring links.
	for (const edge of edges) {
		const a = nodes.get(edge.from);
		const b = nodes.get(edge.to);
		if (!a || !b) continue;

		const dx = b.x - a.x;
		const dy = b.y - a.y;
		const dz = b.z - a.z;
		const dist = Math.max(1, Math.sqrt(dx * dx + dy * dy + dz * dz));
		const delta = dist - edge.distance;
		const force = delta * edge.strength * options.link_strength;

		const fx = (dx / dist) * force;
		const fy = (dy / dist) * force;
		const fz = (dz / dist) * force;

		if (!a.pinned) {
			a.vx += fx / a.mass;
			a.vy += fy / a.mass;
			a.vz += fz / a.mass;
		}

		if (!b.pinned) {
			b.vx -= fx / b.mass;
			b.vy -= fy / b.mass;
			b.vz -= fz / b.mass;
		}
	}

	// Center gravity + integration.
	for (const node of node_list) {
		if (node.pinned) continue;

		node.vx += -node.x * options.center_strength;
		node.vy += -node.y * options.center_strength;
		node.vz += -node.z * options.center_strength * 0.35;

		node.vx *= options.damping;
		node.vy *= options.damping;
		node.vz *= options.damping;

		node.vx = clamp(node.vx, -options.max_velocity, options.max_velocity);
		node.vy = clamp(node.vy, -options.max_velocity, options.max_velocity);
		node.vz = clamp(node.vz, -options.max_velocity, options.max_velocity);

		node.x += node.vx * dt;
		node.y += node.vy * dt;
		node.z += node.vz * dt;
	}
}
```

Important: do **not** dispatch React state updates every physics tick. Keep animated layout positions in refs. Only commit positions back to graph state when the user drags/pins/saves layout.

## Object registry instead of full rebuild

The current `GraphCanvas` deletes all children and recreates all objects during `rebuildGraph`. That will hurt once physics and 3D labels are active. 

In `GraphCanvas3D`, use registries:

```ts
const node_objects_ref = useRef(new Map<string, GraphNodeObject3D>());
const edge_objects_ref = useRef(new Map<string, GraphEdgeObject3D>());
```

Create:

```ts
function syncGraphObjects(state: GraphState): void {
	// Add missing node objects.
	// Remove stale node objects.
	// Update material/text/status for existing node objects.
	// Do not recreate everything every frame.
}
```

Then in animation loop:

```ts
renderer.setAnimationLoop((time) => {
	const dt = Math.min(0.033, clock.getDelta());

	if (state_ref.current.view.layout_mode !== 'manual_2d') {
		tickForce3D(layout_nodes_ref.current, layout_edges_ref.current, force_options, dt);
	}

	updateNodeObjectPositions();
	updateEdgeObjectGeometries();
	updateBillboards(camera);
	updateCameraRig(dt);

	controls.update();
	renderer.render(scene, camera);
});
```

## Picking and selection

Reuse Three raycasting. The current canvas already has the right conceptual pattern: pointer coordinates are converted to normalized device coordinates, `Raycaster.setFromCamera` is called, and hit objects return a `nodeId`. 

For 3D, raycast against sphere meshes:

```ts
function pickNode(event: PointerEvent): string | null {
	const rect = renderer.domElement.getBoundingClientRect();

	pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
	pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

	raycaster.setFromCamera(pointer, camera);

	const hits = raycaster.intersectObjects(hit_targets_ref.current, false);
	const hit = hits[0]?.object;

	return typeof hit?.userData.nodeId === 'string'
		? hit.userData.nodeId
		: null;
}
```

Pointer behavior:

```text
click node:
	select node

shift/cmd/ctrl click node:
	multi-select

drag empty space:
	orbit/pan through OrbitControls

drag node:
	move node on a camera-facing plane through the node
	set node.pinned = true

double click node:
	focus node

Escape:
	clear focus / cancel link

F:
	focus selected node

2:
	switch to 2D view

3:
	switch to 3D view
```

## 3D dragging

Dragging in 3D should not try to guess arbitrary depth. Use a plane perpendicular to the camera through the selected node’s current position.

```ts
const drag_plane = new THREE.Plane();
const camera_direction = new THREE.Vector3();

camera.getWorldDirection(camera_direction);
drag_plane.setFromNormalAndCoplanarPoint(
	camera_direction,
	selected_node_position
);
```

On pointer move:

```ts
raycaster.ray.intersectPlane(drag_plane, intersection);

dispatch({
	type: 'move_node_3d',
	id: drag.id,
	x: intersection.x,
	y: intersection.y,
	z: intersection.z
});
```

For performance, only dispatch at a throttled rate or on pointer-up. During drag, update the layout ref directly.

## Special zoom behavior

This part is important. It is the signature interaction.

### No node selected: wheel scrubs time

If `selected_node_ids.length === 0`, wheel should not simply dolly the camera. It should move the temporal cursor.

```ts
function onWheel(event: WheelEvent): void {
	event.preventDefault();

	const state = state_ref.current;

	if (state.view.viewport_mode === '3d' && state.selected_node_ids.length === 0) {
		scrubTimeline(event.deltaY);
		return;
	}

	if (state.view.viewport_mode === '3d' && state.active_node_id) {
		zoomFocusedNode(state.active_node_id, event.deltaY);
		return;
	}

	defaultCameraZoom(event.deltaY);
}
```

Timeline scrub behavior:

```ts
function scrubTimeline(delta_y: number): void {
	const range = getGraphTimeRange(state_ref.current);
	const step = range.duration * 0.025;
	const direction = delta_y > 0 ? 1 : -1;
	const next = clamp(current_time_cursor + direction * step, range.min, range.max);

	dispatch_ref.current({ type: 'set_time_cursor', time_cursor: next });
	camera_rig_ref.current.mode = 'timeline';
	camera_rig_ref.current.time_cursor = next;
}
```

Temporal layout mapping:

```ts
function timeToZ(created_at: number, range: TimeRange): number {
	const t = (created_at - range.min) / Math.max(1, range.max - range.min);
	return THREE.MathUtils.lerp(-3600, 3600, t);
}
```

When timeline mode is active:

```text
older nodes are deeper behind the camera
newer nodes slide toward/through the foreground
nodes outside the current time window fade, shrink, or become small stars
```

Do not delete or hide everything aggressively. Use opacity and scale first.

### Node selected: wheel focuses local subgraph

When a node is selected, wheel changes the focus radius around that node.

Compute the focus set:

```ts
function getFocusSet(state: GraphState, node_id: string, depth: number): Set<string> {
	const result = new Set<string>([node_id]);
	const queue = [{ id: node_id, depth: 0 }];

	while (queue.length) {
		const current = queue.shift()!;
		if (current.depth >= depth) continue;

		for (const edge of Object.values(state.edges)) {
			const linked =
				edge.from === current.id ? edge.to :
				edge.to === current.id ? edge.from :
				null;

			if (!linked || result.has(linked)) continue;

			result.add(linked);
			queue.push({ id: linked, depth: current.depth + 1 });
		}
	}

	return result;
}
```

Frame the selected node and its children/related neighborhood:

```ts
function focusNode(node_id: string, depth = 2): void {
	const focus_ids = getFocusSet(state_ref.current, node_id, depth);
	const box = new THREE.Box3();

	for (const id of focus_ids) {
		const pos = getNodePosition(id);
		const r = getNodeRadius(id);
		box.expandByPoint(new THREE.Vector3(pos.x - r, pos.y - r, pos.z - r));
		box.expandByPoint(new THREE.Vector3(pos.x + r, pos.y + r, pos.z + r));
	}

	const sphere = new THREE.Sphere();
	box.getBoundingSphere(sphere);

	camera_rig_ref.current.mode = 'focus';
	camera_rig_ref.current.target.copy(sphere.center);
	camera_rig_ref.current.focus_radius = Math.max(180, sphere.radius * 2.6);
}
```

On wheel with a selected node:

```ts
function zoomFocusedNode(node_id: string, delta_y: number): void {
	const rig = camera_rig_ref.current;

	rig.mode = 'focus';
	rig.focus_node_id = node_id;

	const zoom_factor = delta_y < 0 ? 0.82 : 1.18;
	rig.focus_radius = THREE.MathUtils.clamp(
		rig.focus_radius * zoom_factor,
		80,
		6000
	);

	const selected_pos = getNodePosition(node_id);
	rig.target.lerp(selected_pos, 0.35);
}
```

This gives the “orbit → country → state → city → street” feeling.

## Level of detail

The 3D graph will become unreadable if every imported chat node is equally visible at all times. Add simple level-of-detail bands immediately.

```ts
type DetailLevel = 'galaxy' | 'cluster' | 'thread' | 'message' | 'node_interior';
```

Initial behavior:

```text
far camera:
	show spheres only, no labels except selected/major nodes

medium camera:
	show node titles and major edges

near camera:
	show title, role, token estimate, tags, first text line

focused node:
	show local children/replies/references brighter
	fade unrelated graph to 10–25% opacity
```

Add:

```ts
function computeNodeVisibility(node: ChatNode, camera: THREE.Camera, focus: FocusState): NodeVisualState {
	// distance to camera
	// selected?
	// in focus set?
	// in current time window?
	// return opacity, scale, label_detail
}
```

## View controls UI

Add a small viewport control strip overlay in the graph pane:

```text
[2D] [3D]  Layout: [Manual / Force / Temporal]  [Focus] [Reset Camera] [Save Layout]
```

This can be a simple React overlay, not drawn inside Three.

Add CSS near `.graph-hint`:

```css
.graph-view-controls {
	position: absolute;
	top: 1rem;
	left: 1rem;
	z-index: 3;
	display: flex;
	gap: 0.5rem;
	padding: 0.45rem;
	border: 1px solid var(--line);
	border-radius: 999px;
	background: rgba(7, 12, 24, 0.72);
	backdrop-filter: blur(14px);
}
```

Update `.graph-hint` text depending on mode:

For 3D:

```text
Orbit empty space
Wheel timeline / focus zoom
Double-click focus
Shift-click multi-select
F focus
2 / 3 switch view
```

## Acceptance criteria

Codex should treat the implementation as complete when:

1. The app has a viewport mode toggle between the existing 2D canvas and the new 3D canvas.
2. Existing 2D functionality still works.
3. 3D mode uses round sphere nodes, not square plane cards.
4. 3D mode uses perspective depth and orbit controls.
5. Nodes can be selected with raycasting.
6. Selected nodes visibly glow or gain a halo.
7. Edges render between spheres in 3D.
8. Graph state migrates safely from schema v1 to schema v2.
9. Existing saved graphs/imported JSON with only `x/y` still load, with `z` defaulting to `0`.
10. No React reducer dispatch happens every animation frame.
11. With no node selected, wheel scrubs a temporal cursor.
12. With a node selected, wheel zooms toward/away from that node’s local graph space.
13. There is a reset camera button.
14. There is a save-layout button or at least a clear TODO marker where layout persistence will be committed.
15. `npm run build` passes.

## Development sequence

Recommended branch:

```bash
git checkout codex-master
git pull
git checkout -b feature/3d-round-node-viewport
```

Step 1: Move current canvas.

```text
src/components/GraphCanvas.tsx
→ src/components/graph/GraphCanvas2D.tsx
```

Step 2: Add `GraphViewport.tsx`.

Step 3: Add `viewport_mode` and `layout_mode` to graph state.

Step 4: Add toolbar or overlay toggle.

Step 5: Implement `GraphCanvas3D.tsx` with static sphere nodes and static edges.

Step 6: Add picking/selection.

Step 7: Add camera focus behavior.

Step 8: Add temporal wheel behavior.

Step 9: Add basic force layout.

Step 10: Add polish: halos, labels, fading, reset camera, save layout.

## My design verdict

The square nodes are fine as **manual editing cards**. They are legible, inspectable, and useful when the user wants a clean 2D workspace.

But the main identity of Chat Graph should become the 3D round-node view: a navigable constellation of conversation, memory, semantic linkage, and agent activity. Not “cards on a whiteboard,” but “thoughts as bodies in a shared context-space.”

The key is not just making nodes spherical. The important change is this:

```text
2D mode = editing surface
3D mode = context space
```

2D is where you arrange, inspect, and manually wire things.

3D is where you navigate, discover, cluster, focus, zoom through time, and eventually watch semantic relevance pull old ideas into orbit around the current thought.

That distinction feels right for the project. It also keeps the current work valuable instead of throwing it away.

[1]: https://threejs.org/docs/ "three.js docs"
[2]: https://d3js.org/d3-force "d3-force | D3 by Observable"

You did **not** need to merge it into `master` for me. I can inspect `codex-master` directly as long as you tell me the branch name. That was the missing piece.

I checked `codex-master`, and the branch is meaningfully ahead of `master`. The GitHub compare view reports it as **ahead by 43 commits and behind by 1**, so I would **not** blindly merge it into `master` yet. It is a real feature branch now, not just a tiny Codex scratch branch.

My recommendation: keep `master` stable for the moment, continue work from `codex-master`, and later merge through a PR or squash merge after the 3D viewport pass lands and the build is verified.

What `codex-master` currently has:

The branch has upgraded the project direction nicely. The README now describes Chat Graph as a nonlinear interface where messages, branches, references, contradictions, summaries, and context bundles are part of a navigable graph, and it explicitly lists additive thread/JSON import previews, semantic context candidates, and a context compiler as current features.  

The schema is much more mature than `master`. It now has node kinds for user messages, assistant messages, summaries, memories, artifacts, JSON artifacts, JSON fields, tool calls/results, claims, decisions, branch roots, thread roots, agent sessions, semantic clusters, and context bundles.  It also expands edge kinds into the richer graph language we talked about: `reply_to`, `references`, `supports`, `contradicts`, `revises`, `branches_from`, `variant_of`, `summarizes`, `contains`, `uses_context`, `generated`, `semantic_match`, and tool input/output edges, while keeping the older aliases for compatibility. 

It also added source/provenance fields, thread IDs, branch IDs, branch paths, imported thread records, import manifests, vector refs, graph patches, and node layout metadata. That is exactly the right direction for importing old chats and preserving unique threads/bifurcations.  

The import UX has also moved in the right direction. The toolbar now separates **Restore Backup**, which replaces the current graph, from **Import JSON**, which detects an importer, previews the incoming thread, and merges it into the current graph through `apply_patch`. That separation is important. Restore is destructive; import is additive.  

The context compiler is also now its own real module. It has a `ContextPolicy` with hard/soft context IDs, exclusions, token budget, semantic top-k, contradiction handling, traversal toggles, tool-output inclusion, and radius. Then `compileContext` walks the graph, tracks provenance reasons, budgets by tokens, builds a digest, and emits agent messages.  

The new local context-candidate panel is present too. It ranks related nodes locally, lets you add a candidate as hard context, open it, or create a `references` edge from the active node.  

So my current read is: **Codex did a strong semantic/import foundation pass. It did not yet do the 3D viewport pass.**

The app still mounts the same `GraphCanvas` directly in `App.tsx`; there is no `GraphViewport`, no `GraphCanvas2D`, and no `GraphCanvas3D` split yet.  

And `GraphCanvas` is still fundamentally the flat 2D canvas. It creates an `OrthographicCamera`, positions it at `z = 1000`, adds a flat grid, and renders rectangular plane nodes.  The node body is still `PlaneGeometry(NODE_W, NODE_H)`, not a sphere.  Wheel input still just changes orthographic camera zoom. 

There is, however, a useful starting point for the next 3D pass: `src/layout/forceLayout.ts` already has a force layout engine with `dimensions?: 2 | 3`, link distance, link strength, charge strength, centering, and damping.  It already stores `z` when running in 3D mode.  The `layoutTypes.ts` file also already names several future layout modes, including `force_3d`, `semantic_galaxy`, `thread_tree`, and `cluster_orbit`, plus navigation intents like temporal scrub and focus-selected-space. 

So we do not need to ask Codex to invent the foundation again. We should now ask it to **wire the existing foundation into the actual viewport layer**.

Here’s what I would send Codex next:

````md
# Task: Implement 3D Round-Node Viewport on codex-master

Work from the `codex-master` branch, not `master`.

The branch already contains the semantic/import/context foundation:
- expanded node kinds and edge kinds in `src/types.ts`
- additive `GraphPatch`
- imported threads and import manifests
- local context candidates
- context compiler
- 2D/3D force layout scaffolding in `src/layout/forceLayout.ts`
- layout mode names in `src/layout/layoutTypes.ts`

Do not redo that foundation.

The current UI still mounts `GraphCanvas` directly from `App.tsx`, and `GraphCanvas` is still the flat 2D rectangular-node renderer. The goal of this task is to preserve that 2D mode and add a new 3D round-node viewport.

## Required outcome

Add a viewport mode system:

```text
src/components/graph/
  GraphViewport.tsx
  GraphCanvas2D.tsx
  GraphCanvas3D.tsx
  GraphViewControls.tsx
  graphVisuals.ts
  graphPicking.ts
  graphCamera.ts
````

Move the current `src/components/GraphCanvas.tsx` implementation into:

```text
src/components/graph/GraphCanvas2D.tsx
```

Then replace the old `GraphCanvas` usage in `App.tsx` with:

```tsx
<GraphViewport />
```

`GraphViewport` should switch between the existing 2D viewport and the new 3D viewport.

## State/schema additions

Extend graph state with view state.

Add to `src/types.ts`:

```ts
export type ViewportMode = '2d' | '3d';

export type GraphViewState = {
  viewport_mode: ViewportMode;
  layout_mode: LayoutMode;
  time_cursor: number | null;
  time_window_ms: number | null;
  focused_node_id: string | null;
  focus_depth: number;
  show_labels: boolean;
  show_edges: boolean;
  show_halos: boolean;
};
```

Add to `GraphState`:

```ts
view: GraphViewState;
```

Update `normalizeGraph` so older saved graphs load safely:

```ts
view: {
  viewport_mode: state.view?.viewport_mode ?? '2d',
  layout_mode: state.view?.layout_mode ?? 'manual_2d',
  time_cursor: state.view?.time_cursor ?? null,
  time_window_ms: state.view?.time_window_ms ?? null,
  focused_node_id: state.view?.focused_node_id ?? null,
  focus_depth: state.view?.focus_depth ?? 2,
  show_labels: state.view?.show_labels ?? true,
  show_edges: state.view?.show_edges ?? true,
  show_halos: state.view?.show_halos ?? true
}
```

Add reducer actions:

```ts
| { type: 'set_viewport_mode'; mode: ViewportMode }
| { type: 'set_layout_mode'; mode: LayoutMode }
| { type: 'set_time_cursor'; time_cursor: number | null }
| { type: 'set_focus_node'; id: string | null; depth?: number }
| { type: 'move_node_3d'; id: string; x: number; y: number; z: number }
| { type: 'set_node_pinned'; id: string; pinned: boolean }
```

Keep `schema_version` as-is if you want to avoid a full migration pass, but the normalize path must tolerate missing `view`.

## 3D viewport

Implement `GraphCanvas3D.tsx` with Three.js.

Use:

```ts
THREE.PerspectiveCamera
THREE.WebGLRenderer
THREE.Raycaster
THREE.SphereGeometry
THREE.MeshStandardMaterial
THREE.TorusGeometry
THREE.Sprite
THREE.CanvasTexture
```

Use `OrbitControls` from:

```ts
three/examples/jsm/controls/OrbitControls.js
```

Set up the scene:

```ts
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x060914);
scene.fog = new THREE.FogExp2(0x060914, 0.00018);

const camera = new THREE.PerspectiveCamera(55, width / height, 1, 20000);
camera.position.set(0, 420, 1400);
camera.lookAt(0, 0, 0);
```

Lighting:

```ts
scene.add(new THREE.AmbientLight(0x9fb7ff, 0.6));

const key = new THREE.DirectionalLight(0xffffff, 1.1);
key.position.set(400, 700, 900);
scene.add(key);
```

Controls:

```ts
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.rotateSpeed = 0.45;
controls.panSpeed = 0.65;
controls.zoomSpeed = 0.8;
controls.minDistance = 120;
controls.maxDistance = 9000;
```

## 3D node appearance

Render each node as a sphere.

Do not use rectangular card geometry in 3D mode.

Suggested radius:

```ts
function nodeRadius(node: ChatNode): number {
  const token_component = Math.sqrt(Math.max(1, node.token_estimate)) * 1.35;
  return THREE.MathUtils.clamp(18 + token_component, 22, 72);
}
```

Role colors:

```ts
system: violet
user: cyan/blue
assistant: green/teal
tool: rose/magenta
context: amber/gold
```

Selected node:

* stronger emissive material
* white or role-colored outer halo
* slightly larger scale

Streaming node:

* pulsing halo

Error node:

* red halo or red ring

Use `TorusGeometry` for halos:

```ts
const halo = new THREE.Mesh(
  new THREE.TorusGeometry(radius * 1.25, 1.6, 8, 64),
  new THREE.MeshBasicMaterial({
    color: selected ? 0xffffff : roleColor(node.role),
    transparent: true,
    opacity: selected ? 0.75 : 0.22,
    depthWrite: false
  })
);
```

Halos and labels should face the camera each frame:

```ts
halo.quaternion.copy(camera.quaternion);
label.quaternion.copy(camera.quaternion);
```

## Labels

Use sprite labels generated from canvas, similar to the existing 2D text sprite approach.

Far camera:

* title only

Near/focused:

* title
* node kind
* token estimate
* first text line

Do not show every label at far distance. Use distance/focus-based visibility.

## Edges

Render 3D edges as curved translucent lines or tubes.

Start with lines if simpler:

```ts
const curve = new THREE.CatmullRomCurve3([from, mid, to]);
const points = curve.getPoints(24);
const geometry = new THREE.BufferGeometry().setFromPoints(points);
const line = new THREE.Line(
  geometry,
  new THREE.LineBasicMaterial({
    color: edgeColor(edge.kind),
    transparent: true,
    opacity: 0.5,
    depthWrite: false
  })
);
```

Midpoint should lift slightly:

```ts
const mid = from.clone().add(to).multiplyScalar(0.5);
const distance = from.distanceTo(to);
mid.y += Math.min(220, distance * 0.12);
```

## Object registry

Do not rebuild all Three objects every React state update in 3D mode.

Use registries:

```ts
const node_objects_ref = useRef(new Map<string, NodeObject3D>());
const edge_objects_ref = useRef(new Map<string, EdgeObject3D>());
```

Add/update/remove objects incrementally.

Do not dispatch React reducer actions every animation frame.

Animated layout positions should live in refs. Commit to graph state only when:

* user drags a node
* user pins a node
* user clicks save layout
* layout completes and save is requested

## Layout

Use existing `calculateForceLayout` from `src/layout/forceLayout.ts` for initial positions.

For 3D mode:

* call with `dimensions: 3`
* store results in internal refs
* default `z` to `node.layout?.z ?? temporalZ(node.created_at)`

Use `layout_mode`:

* `force_3d`: force-directed graph constellation
* `semantic_galaxy`: same as force_3d for now, but with cluster/focus naming
* `temporal_river`: arrange primarily along z/time axis
* `manual_2d`: should route to 2D mode or behave as static layout

## Special wheel behavior

This is important.

In 3D mode:

### No node selected

Wheel should scrub time, not just zoom.

```ts
if (state.selected_node_ids.length === 0) {
  scrubTimeline(event.deltaY);
  return;
}
```

Temporal scrub should update `view.time_cursor`.

Older nodes should move/fade toward one side of the z-axis; newer nodes toward the other. Use opacity/scale changes before hiding nodes entirely.

### Node selected

Wheel should focus-zoom around the selected node’s local graph space.

```ts
if (state.active_node_id) {
  zoomFocusedNode(state.active_node_id, event.deltaY);
  return;
}
```

Focus behavior:

* selected node becomes camera target
* local neighbors within `focus_depth` become bright
* unrelated nodes fade to 10–25% opacity
* wheel in/out changes focus radius
* camera should smoothly interpolate, not snap

Double-click node:

* focus node

Escape:

* clear focus or cancel link

F:

* focus selected node

2:

* switch to 2D

3:

* switch to 3D

## 3D dragging

Dragging a node in 3D should use a camera-facing plane through the node position.

On drag:

* update internal layout ref immediately
* mark node pinned
* on pointer-up, dispatch `move_node_3d`

Do not attempt arbitrary-depth dragging.

## UI controls

Add `GraphViewControls.tsx` overlay:

```text
[2D] [3D]  Layout: [Manual / Force 3D / Temporal / Semantic Galaxy]  [Focus] [Reset Camera] [Save Layout]
```

Place it over the graph pane using CSS:

```css
.graph-view-controls {
  position: absolute;
  top: 1rem;
  left: 1rem;
  z-index: 3;
  display: flex;
  gap: 0.5rem;
  padding: 0.45rem;
  border: 1px solid var(--line);
  border-radius: 999px;
  background: rgba(7, 12, 24, 0.72);
  backdrop-filter: blur(14px);
}
```

Update hints:

* 2D: existing hints
* 3D: `Orbit empty space`, `Wheel timeline/focus`, `Double-click focus`, `Shift-click multi-select`, `2/3 switch view`

## Acceptance criteria

* `npm run build` passes.
* Existing 2D viewport still works.
* App can switch between 2D and 3D modes.
* 3D mode uses round sphere nodes.
* 3D mode uses `PerspectiveCamera`.
* 3D mode supports orbit controls.
* Raycast selection works on sphere nodes.
* Selected node shows halo/glow.
* Edges render in 3D.
* Existing saved graphs without `view` load safely.
* Existing nodes without `layout.z` load safely.
* No reducer dispatch happens every animation frame.
* With no node selected, wheel scrubs temporal cursor.
* With a selected node, wheel zooms around that node’s local context space.
* There is a reset-camera control.
* There is a save-layout control or a visible TODO stub.

````

My practical branch advice:

```bash
git checkout codex-master
git pull origin codex-master
git checkout -b feature/3d-round-node-viewport
````

Do the 3D work from `codex-master`, not from `master`, because the branch already contains the imported-thread/schema/context groundwork the 3D view should be aware of.

I would not merge `codex-master` into `master` yet unless you specifically want `master` to represent the current semantic/import foundation before the 3D pass. My cleaner recommendation is:

```text
master
  stable prototype

codex-master
  semantic/import/context foundation

feature/3d-round-node-viewport
  3D viewport work based on codex-master
```

Then later:

```text
feature/3d-round-node-viewport → codex-master
codex-master → master
```

Or, if you want a neat public history:

```text
feature/3d-round-node-viewport → PR → master
```

with a squash merge.

The branch is in a better place than `master` for the next step. It has the bones. Now Codex needs to give it a body with depth.

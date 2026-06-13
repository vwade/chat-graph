export type LayoutMode =
	| 'manual_2d'
	| 'force_2d'
	| 'force_3d'
	| 'temporal_river'
	| 'semantic_galaxy'
	| 'thread_tree'
	| 'cluster_orbit';

export type LayoutNodeState = {
	x: number;
	y: number;
	z?: number;
	pinned: boolean;
	group_id: string;
};

export type LayoutMode = 'manual_2d' | 'force_3d' | 'temporal_3d' | 'cluster_3d';

export type LayoutNavigationIntent =
	| 'camera_zoom'
	| 'temporal_scrub'
	| 'density_change'
	| 'focus_selected_space'
	| 'expand_selected_depth';

export type LayoutNodeState = {
	node_id: string;
	x: number;
	y: number;
	z?: number;
	pinned: boolean;
	group_id?: string;
};

export type ForceLayoutSettings = {
	dimensions: 2 | 3;
	link_distance: number;
	charge_strength: number;
	collision_radius: number;
	alpha_decay: number;
};

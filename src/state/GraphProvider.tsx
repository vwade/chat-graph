import { createContext, useContext, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import type { Dispatch, PropsWithChildren } from 'react';
import type { GraphState } from '../types';
import { createSampleGraph } from '../data/sampleGraph';
import { loadGraph, saveGraph } from '../storage/graphDb';
import { graphReducer, type GraphAction } from './graphReducer';

type GraphContextValue = {
	state: GraphState;
	dispatch: Dispatch<GraphAction>;
	loaded: boolean;
	save_error: string | null;
};

const GraphContext = createContext<GraphContextValue | null>(null);

export function GraphProvider({ children }: PropsWithChildren) {
	const [state, dispatch] = useReducer(graphReducer, undefined, createSampleGraph);
	const [loaded, setLoaded] = useState(false);
	const [save_error, setSaveError] = useState<string | null>(null);
	const first_save_skipped = useRef(false);

	useEffect(() => {
		let cancelled = false;
		loadGraph('default')
			.then((graph) => {
				if (cancelled) return;
				if (graph) dispatch({ type: 'hydrate', state: graph });
				setLoaded(true);
			})
			.catch((error: unknown) => {
				console.error(error);
				if (!cancelled) {
					setSaveError(error instanceof Error ? error.message : 'Failed to load graph.');
					setLoaded(true);
				}
			});
		return () => {
			cancelled = true;
		};
	}, []);

	useEffect(() => {
		if (!loaded) return;
		if (!first_save_skipped.current) {
			first_save_skipped.current = true;
			return;
		}

		const handle = window.setTimeout(() => {
			saveGraph(state).catch((error: unknown) => {
				console.error(error);
				setSaveError(error instanceof Error ? error.message : 'Failed to save graph.');
			});
		}, 400);

		return () => window.clearTimeout(handle);
	}, [state, loaded]);

	const value = useMemo(() => ({ state, dispatch, loaded, save_error }), [state, loaded, save_error]);
	return <GraphContext.Provider value={value}>{children}</GraphContext.Provider>;
}

export function useGraph(): GraphContextValue {
	const value = useContext(GraphContext);
	if (!value) throw new Error('useGraph must be used inside GraphProvider.');
	return value;
}

import type { GraphState } from '../types';

const DB_NAME = 'chat-graph-db';
const DB_VERSION = 1;
const STORE_NAME = 'graphs';

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
	return new Promise((resolve, reject) => {
		request.onsuccess = () => resolve(request.result);
		request.onerror = () => reject(request.error);
	});
}

let db_promise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
	if (db_promise) return db_promise;
	db_promise = new Promise((resolve, reject) => {
		const request = indexedDB.open(DB_NAME, DB_VERSION);
		request.onupgradeneeded = () => {
			const db = request.result;
			if (!db.objectStoreNames.contains(STORE_NAME)) {
				db.createObjectStore(STORE_NAME, { keyPath: 'graph_id' });
			}
		};
		request.onsuccess = () => resolve(request.result);
		request.onerror = () => reject(request.error);
	});
	return db_promise;
}

export async function saveGraph(state: GraphState): Promise<void> {
	const db = await openDb();
	const tx = db.transaction(STORE_NAME, 'readwrite');
	const store = tx.objectStore(STORE_NAME);
	await requestToPromise(store.put({ ...state, last_saved_at: Date.now() }));
	await new Promise<void>((resolve, reject) => {
		tx.oncomplete = () => resolve();
		tx.onerror = () => reject(tx.error);
		tx.onabort = () => reject(tx.error);
	});
}

export async function loadGraph(graph_id = 'default'): Promise<GraphState | null> {
	const db = await openDb();
	const tx = db.transaction(STORE_NAME, 'readonly');
	const store = tx.objectStore(STORE_NAME);
	const result = await requestToPromise<GraphState | undefined>(store.get(graph_id));
	return result ?? null;
}

export async function clearGraph(graph_id = 'default'): Promise<void> {
	const db = await openDb();
	const tx = db.transaction(STORE_NAME, 'readwrite');
	const store = tx.objectStore(STORE_NAME);
	await requestToPromise(store.delete(graph_id));
}

export function downloadJson(filename: string, data: unknown): void {
	const blob = new Blob([JSON.stringify(data, null, '\t')], { type: 'application/json' });
	const url = URL.createObjectURL(blob);
	const anchor = document.createElement('a');
	anchor.href = url;
	anchor.download = filename;
	anchor.click();
	URL.revokeObjectURL(url);
}

export async function readJsonFile<T>(file: File): Promise<T> {
	const text = await file.text();
	return JSON.parse(text) as T;
}

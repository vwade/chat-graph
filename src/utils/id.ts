export function makeId(prefix = 'id'): string {
	const crypto_id = crypto.randomUUID?.();
	if (crypto_id) {
		return `${prefix}_${crypto_id.slice(0, 8)}_${crypto_id.slice(9, 13)}`;
	}
	return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function estimateTokens(text: string): number {
	const trimmed = text.trim();
	if (!trimmed) return 0;
	return Math.ceil(trimmed.length / 4);
}

export function firstLine(text: string, fallback = 'Untitled'): string {
	const line = text.trim().split('\n').find(Boolean);
	if (!line) return fallback;
	return line.length > 72 ? `${line.slice(0, 69)}…` : line;
}

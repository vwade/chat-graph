import type { ChatNode } from '../types';

export type RelevanceInput = {
	query?: string;
	tags?: string[];
	anchor?: ChatNode | null;
};

export type RelevanceScore = {
	score: number;
	reasons: string[];
	matched_terms: string[];
	matched_tags: string[];
};

const WORD_PATTERN = /[a-z0-9][a-z0-9_-]*/gi;
const STOP_WORDS = new Set([
	'a',
	'an',
	'and',
	'are',
	'as',
	'at',
	'be',
	'by',
	'for',
	'from',
	'in',
	'is',
	'it',
	'of',
	'on',
	'or',
	'that',
	'the',
	'this',
	'to',
	'with'
]);

export function tokenizeSearchText(value: string): string[] {
	const seen = new Set<string>();
	const terms = value.toLowerCase().match(WORD_PATTERN) ?? [];
	for (const term of terms) {
		if (term.length < 2) continue;
		if (STOP_WORDS.has(term)) continue;
		seen.add(term);
	}
	return [...seen].sort();
}

export function scoreNodeRelevance(node: ChatNode, input: RelevanceInput): RelevanceScore {
	const query_terms = tokenizeSearchText(input.query ?? '');
	const anchor_terms = input.anchor ? tokenizeSearchText(`${input.anchor.title} ${input.anchor.text}`) : [];
	const requested_tags = normalizeTags(input.tags ?? []);
	const anchor_tags = normalizeTags(input.anchor?.tags ?? []);
	const node_terms = new Set(tokenizeSearchText(`${node.title} ${node.text}`));
	const node_tags = new Set(normalizeTags(node.tags));

	const matched_query_terms = query_terms.filter((term) => node_terms.has(term));
	const matched_anchor_terms = anchor_terms.filter((term) => node_terms.has(term));
	const matched_requested_tags = requested_tags.filter((tag) => node_tags.has(tag));
	const matched_anchor_tags = anchor_tags.filter((tag) => node_tags.has(tag));
	const matched_tags = [...new Set([...matched_requested_tags, ...matched_anchor_tags])].sort();
	const matched_terms = [...new Set([...matched_query_terms, ...matched_anchor_terms])].sort();

	const title_terms = new Set(tokenizeSearchText(node.title));
	const title_bonus = matched_query_terms.filter((term) => title_terms.has(term)).length * 2;
	const score = matched_query_terms.length * 4 + matched_requested_tags.length * 5 + matched_anchor_tags.length * 3 + matched_anchor_terms.length + title_bonus;
	const reasons: string[] = [];

	if (matched_query_terms.length > 0) reasons.push(`text overlap: ${matched_query_terms.join(', ')}`);
	if (matched_requested_tags.length > 0) reasons.push(`requested tag overlap: ${matched_requested_tags.join(', ')}`);
	if (matched_anchor_tags.length > 0) reasons.push(`anchor tag overlap: ${matched_anchor_tags.join(', ')}`);
	if (matched_anchor_terms.length > 0) reasons.push(`anchor text overlap: ${matched_anchor_terms.slice(0, 6).join(', ')}`);

	return {
		score,
		reasons,
		matched_terms,
		matched_tags
	};
}

export function normalizeTags(tags: string[]): string[] {
	return [...new Set(tags.map((tag) => tag.trim().toLowerCase()).filter(Boolean))].sort();
}

import type { AgentMessage, ContextBundle, GraphState } from '../types';

export type AgentRunInput = {
	mode: GraphState['agent_mode'];
	endpoint: string;
	messages: AgentMessage[];
	bundle: ContextBundle;
	user_text: string;
};

export async function runAgent(input: AgentRunInput): Promise<string> {
	if (input.mode === 'http') {
		return runHttpAgent(input);
	}
	return runMockAgent(input);
}

async function runHttpAgent(input: AgentRunInput): Promise<string> {
	const response = await fetch(input.endpoint, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({
			messages: input.messages,
			context: {
				anchor_ids: input.bundle.anchor_ids,
				nodes: input.bundle.nodes,
				edges: input.bundle.edges,
				digest: input.bundle.digest
			}
		})
	});

	if (!response.ok) {
		const body = await response.text().catch(() => '');
		throw new Error(`Agent endpoint failed: ${response.status} ${body}`);
	}

	const data = (await response.json()) as unknown;
	return coerceAgentResponse(data);
}

function coerceAgentResponse(data: unknown): string {
	if (typeof data === 'string') return data;
	if (!data || typeof data !== 'object') return 'The agent endpoint returned an empty response.';

	const record = data as Record<string, unknown>;
	if (typeof record.text === 'string') return record.text;
	if (typeof record.content === 'string') return record.content;

	const choices = record.choices;
	if (Array.isArray(choices) && choices.length > 0) {
		const first = choices[0] as Record<string, unknown>;
		const message = first.message as Record<string, unknown> | undefined;
		if (message && typeof message.content === 'string') return message.content;
	}

	return JSON.stringify(data, null, '\t');
}

async function runMockAgent(input: AgentRunInput): Promise<string> {
	await new Promise((resolve) => setTimeout(resolve, 260));
	const recent = input.bundle.nodes.slice(-5);
	const context_lines = recent.length
		? recent.map((node) => `- ${node.role}: ${node.title}`).join('\n')
		: '- No prior graph context was selected.';

	return [
		'I am the built-in mock agent. Replace me with your local model, OpenAI-compatible proxy, or OpenClaw bridge when you are ready.',
		'',
		'I received this user turn:',
		`> ${input.user_text.trim()}`,
		'',
		'I also received this graph context bundle:',
		context_lines,
		'',
		'Operationally, the important bit is that this reply is now just another node. You can drag it, branch from it, link it to old context, or use it as the anchor for a merged-context turn.'
	].join('\n');
}

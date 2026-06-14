import { ChatPanel } from './components/ChatPanel';
import { Composer } from './components/Composer';
import { ContextCandidates } from './components/ContextCandidates';
import { GraphViewport } from './components/graph/GraphViewport';
import { Inspector } from './components/Inspector';
import { Toolbar } from './components/Toolbar';
import { GraphProvider } from './state/GraphProvider';

export default function App() {
	return (
		<GraphProvider>
			<div className="app-shell">
				<Toolbar />
				<main className="workspace">
					<section className="graph-pane">
						<GraphViewport />
					</section>
					<aside className="side-pane">
						<ChatPanel />
						<ContextCandidates />
						<Composer />
						<Inspector />
					</aside>
				</main>
			</div>
		</GraphProvider>
	);
}

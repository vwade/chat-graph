import { ChatPanel } from './components/ChatPanel';
import { Composer } from './components/Composer';
import { GraphCanvas } from './components/GraphCanvas';
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
						<GraphCanvas />
					</section>
					<aside className="side-pane">
						<ChatPanel />
						<Composer />
						<Inspector />
					</aside>
				</main>
			</div>
		</GraphProvider>
	);
}

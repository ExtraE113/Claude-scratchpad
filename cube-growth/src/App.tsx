import { CubeProvider } from './context/CubeContext';
import { GraphView } from './components/GraphView';
import { SeedInput } from './components/SeedInput/SeedInput';
import { CardPanel } from './components/CardPanel/CardPanel';
import { RecommendationPanel } from './components/RecommendationPanel/RecommendationPanel';
import { useCube } from './context/CubeContext';
import './App.css';

function CubeApp() {
  const { state } = useCube();
  const cardCount = state.graph.nodes.size;

  return (
    <div className="app">
      <header className="app-header">
        <h1>Cube Growth Tool</h1>
        <div className="header-controls">
          <SeedInput />
          <span className="card-count">Cards: {cardCount}</span>
        </div>
      </header>

      <main className="app-main">
        <div className="graph-container">
          <GraphView />
        </div>

        <aside className="sidebar">
          <CardPanel />
          <RecommendationPanel />
        </aside>
      </main>
    </div>
  );
}

function App() {
  return (
    <CubeProvider>
      <CubeApp />
    </CubeProvider>
  );
}

export default App;

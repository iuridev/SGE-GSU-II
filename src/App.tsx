import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { Login } from './pages/Login';
import { Dashboard } from './pages/Dashboard';

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Login />} />
        
        {/* Adicionamos estas rotas apontando para o Dashboard */}
        <Route path="/painel-regional" element={<Dashboard />} />
        <Route path="/painel-escola" element={<Dashboard />} />
        
      </Routes>
    </Router>
  );
}

export default App;
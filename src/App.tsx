import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { Login } from './pages/Login';
import { Dashboard } from './pages/Dashboard';
import { ConsumoAgua } from './pages/ConsumoAgua';
import { Zeladoria } from './pages/Zeladoria';
import { Escola } from './pages/escola'; 
import { Obras } from './pages/Obras';
import { Patrimonio } from './pages/Patrimonio';
import { Notificacoes } from './pages/Notificacoes';
import { Usuario } from './pages/Usuario';

// Importar os novos componentes de estrutura
import { Layout } from './components/Layout';
import { PrivateRoute } from './components/PrivateRoute';

export default function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Login />} />
        
        {/* Rotas Protegidas */}
        <Route element={<PrivateRoute />}>
          <Route element={<Layout />}>
            <Route path="/painel-regional" element={<Dashboard />} />
            <Route path="/consumo-agua" element={<ConsumoAgua />} />
            <Route path="/zeladoria" element={<Zeladoria />} />
            <Route path="/escola" element={<Escola />} />
            <Route path="/usuarios" element={<Usuario />} />
            <Route path="/obras" element={<Obras />} />
            <Route path="/patrimonio" element={<Patrimonio />} />
            <Route path="/notificacoes" element={<Notificacoes />} />
          </Route>
        </Route>
        
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Router>
  );
}
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { Login } from './pages/Login';
import { Dashboard } from './pages/Dashboard';
import { Zeladoria } from './pages/Zeladoria';
// CORREÇÃO: O nome do ficheiro é 'escola.tsx' (minúsculo), então a importação deve corresponder
import { Escola } from './pages/escola'; 
import { Obras } from './pages/Obras';
import { Patrimonio } from './pages/Patrimonio';
import { ConsumoAgua } from './pages/ConsumoAgua';
import { Notificacoes } from './pages/Notificacoes';
import { Usuario } from './pages/Usuario';

export default function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Login />} />
        <Route path="/painel-regional" element={<Dashboard />} />
        <Route path="/zeladoria" element={<Zeladoria />} />
        <Route path="/escola" element={<Escola />} />
        <Route path="/usuarios" element={<Usuario />} />
        
        <Route path="/obras" element={<Obras />} />
        <Route path="/patrimonio" element={<Patrimonio />} />
        <Route path="/consumo-agua" element={<ConsumoAgua />} />
        <Route path="/notificacoes" element={<Notificacoes />} />
        
        {/* Se a rota não existir, redireciona para o login */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Router>
  );
}
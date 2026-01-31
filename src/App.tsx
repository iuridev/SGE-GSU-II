import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { Login } from './pages/Login';
import { Dashboard } from './pages/Dashboard';
import { Zeladoria } from './pages/Zeladoria';
import { ConsumoAgua } from './pages/ConsumoAgua';
import { Patrimonio } from './pages/Patrimonio';
import { Obras } from './pages/Obras';
import { Notificacoes } from './pages/Notificacoes';
import { Escola } from './pages/escola';
import { Usuario } from './pages/Usuario';
//import { Usuarios } from './pages/usuarios';


function App() {
  return (
    <Router>
      <Routes>
        {/* Rota Pública */}
        <Route path="/" element={<Login />} />

        {/* Rotas Principais */}
        {/* Redirecionamos os painéis específicos para o Dashboard geral por enquanto */}
        <Route path="/painel-regional" element={<Dashboard />} />
        <Route path="/painel-escola" element={<Dashboard />} />

        <Route path="/Escola" element={<Escola />} />
{/*        <Route path="/usuarios" element={<Usuarios />} />*/}
        <Route path="/usuarios" element={<Usuario />} />

        
        {/* Rotas dos Módulos (As páginas novas) */}
        <Route path="/zeladoria" element={<Zeladoria />} />
        <Route path="/consumo-agua" element={<ConsumoAgua />} />
        <Route path="/patrimonio" element={<Patrimonio />} />
        <Route path="/obras" element={<Obras />} />
        <Route path="/notificacoes" element={<Notificacoes />} />

        {/* Fallback: Se digitar algo errado, volta pro Login */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Router>
  );
}

export default App;
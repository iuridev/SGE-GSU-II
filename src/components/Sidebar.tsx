import { useState } from 'react';
import { Home, Users, LogOut, ChevronLeft, FileText, Menu, GraduationCap } from 'lucide-react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';

interface SidebarProps {
  userRole: string;
}

interface NavItemProps {
  icon: React.ReactNode;
  label: string;
  collapsed: boolean;
  to: string;
  active?: boolean;
}

export function Sidebar({ userRole }: SidebarProps) {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  async function handleLogout() {
    await supabase.auth.signOut();
    navigate('/');
  }

  // Normaliza a verificação da rota (ignora maiúsculas/minúsculas se necessário)
  const isActive = (path: string) => location.pathname === path;

  return (
    <aside 
      className={`${isCollapsed ? 'w-20' : 'w-64'} bg-slate-900 text-white transition-all duration-300 flex flex-col h-screen shadow-xl z-20 flex-shrink-0 fixed left-0 top-0`}
    >
      <div className="h-16 flex items-center justify-between px-4 border-b border-slate-800">
        {!isCollapsed && <span className="font-bold text-xl tracking-tight text-blue-400">SGE-GSU</span>}
        <button 
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="p-1 rounded hover:bg-slate-700 text-slate-400 hover:text-white transition-colors"
        >
          {isCollapsed ? <Menu size={20} /> : <ChevronLeft size={20} />}
        </button>
      </div>

      <nav className="flex-1 py-6 flex flex-col gap-2 px-3 overflow-y-auto">
        
        <NavItem 
          to="/painel-regional" 
          icon={<Home size={20} />} 
          label="Início" 
          collapsed={isCollapsed} 
          active={isActive('/painel-regional')} 
        />
        
        {/* CORREÇÃO AQUI: Link agora corresponde exatamente à rota no App.tsx */}
        <NavItem 
          to="/consumo-agua" 
          icon={<FileText size={20} />} 
          label="Consumo de Água" 
          collapsed={isCollapsed} 
          active={isActive('/consumo-agua')}
        />

        <NavItem 
          to="/zeladoria" 
          icon={<FileText size={20} />} 
          label="Zeladoria" 
          collapsed={isCollapsed} 
          active={isActive('/zeladoria')}
        />
        
        <NavItem 
          to="/escola" 
          icon={<GraduationCap size={20} />} 
          label="Escolas" 
          collapsed={isCollapsed} 
          active={isActive('/escola')}
        />

        {userRole === 'regional_admin' && (
          <NavItem 
            to="/usuarios" 
            icon={<Users size={20} />} 
            label="Usuários" 
            collapsed={isCollapsed} 
            active={isActive('/usuarios')}
          />
        )}
      </nav>

      <div className="p-4 border-t border-slate-800">
        <button 
          onClick={handleLogout}
          className={`flex items-center ${isCollapsed ? 'justify-center' : 'gap-3'} w-full text-slate-400 hover:text-red-400 hover:bg-slate-800 p-2 rounded transition-colors`}
        >
          <LogOut size={20} />
          {!isCollapsed && <span className="font-medium">Sair</span>}
        </button>
      </div>
    </aside>
  );
}

function NavItem({ icon, label, collapsed, to, active = false }: NavItemProps) {
  return (
    <Link 
      to={to} 
      className={`flex items-center ${collapsed ? 'justify-center' : 'gap-3'} px-3 py-3 rounded-lg transition-colors ${active ? 'bg-blue-600 text-white shadow-md' : 'text-slate-400 hover:bg-slate-800 hover:text-white'}`}
    >
      {icon}
      {!collapsed && <span className="font-medium whitespace-nowrap">{label}</span>}
    </Link>
  );
}
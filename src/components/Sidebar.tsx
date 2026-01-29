import { BookOpen, Home, LayoutDashboard, Settings, Users, Building2, LogOut } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';

interface SidebarProps {
  userRole: 'regional_admin' | 'school_manager' | undefined;
}

export function Sidebar({ userRole }: SidebarProps) {
  const navigate = useNavigate();

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate('/');
  };

  return (
    <aside className="w-64 bg-slate-900 text-white h-screen fixed left-0 top-0 flex flex-col shadow-xl z-50">
      {/* Logo Area */}
      <div className="p-6 flex items-center gap-3 border-b border-slate-700">
        <div className="bg-blue-600 p-2 rounded-lg">
          <BookOpen className="w-6 h-6 text-white" />
        </div>
        <div>
          <h1 className="font-bold text-lg tracking-tight">SGE-GSU</h1>
          <p className="text-xs text-slate-400">Sistema de Gestão</p>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-4 space-y-2 overflow-y-auto">
        
        <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 px-2">Principal</p>
        
        <NavItem icon={<Home size={20} />} label="Início" active />
        
        {userRole === 'regional_admin' && (
          <>
            <NavItem icon={<Building2 size={20} />} label="Minhas Escolas" />
            <NavItem icon={<LayoutDashboard size={20} />} label="Relatórios Regionais" />
          </>
        )}

        {userRole === 'school_manager' && (
          <>
            <NavItem icon={<Users size={20} />} label="Alunos & Turmas" />
            <NavItem icon={<BookOpen size={20} />} label="Diário de Classe" />
          </>
        )}

        <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mt-6 mb-2 px-2">Configurações</p>
        <NavItem icon={<Settings size={20} />} label="Ajustes do Sistema" />
      </nav>

      {/* Footer / Logout */}
      <div className="p-4 border-t border-slate-800">
        <button 
          onClick={handleLogout}
          className="flex items-center gap-3 text-slate-400 hover:text-white hover:bg-slate-800 w-full p-3 rounded-lg transition-colors"
        >
          <LogOut size={20} />
          <span>Sair do Sistema</span>
        </button>
      </div>
    </aside>
  );
}

// Pequeno componente auxiliar para os itens do menu
function NavItem({ icon, label, active = false }: { icon: any, label: string, active?: boolean }) {
  return (
    <a href="#" className={`flex items-center gap-3 p-3 rounded-lg transition-all ${
      active 
        ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/20' 
        : 'text-slate-300 hover:bg-slate-800 hover:text-white'
    }`}>
      {icon}
      <span className="font-medium text-sm">{label}</span>
    </a>
  );
}
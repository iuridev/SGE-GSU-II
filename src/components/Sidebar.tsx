import { 
  Home, 
  LayoutDashboard, 
  Settings, 
  LogOut, 
  Droplets, 
  Hammer, 
  Package, 
  Bell, 
  Wrench,
  BookOpen
} from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';
import { supabase } from '../lib/supabase';

interface SidebarProps {
  userRole: 'regional_admin' | 'school_manager' | undefined | string;
}

export function Sidebar({ userRole }: SidebarProps) {
  const navigate = useNavigate();
  const location = useLocation(); // Hook para saber em qual URL estamos

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate('/');
  };

  // Função auxiliar para verificar se o item é o ativo
  const isActive = (path: string) => location.pathname === path;

  return (
    <aside className="w-64 bg-slate-900 text-white h-screen fixed left-0 top-0 flex flex-col shadow-xl z-50">
      
      {/* Logo Area */}
      <div className="p-6 flex items-center gap-3 border-b border-slate-700">
        <div className="bg-blue-600 p-2 rounded-lg shadow-lg shadow-blue-900/50">
          <BookOpen className="w-6 h-6 text-white" />
        </div>
        <div>
          <h1 className="font-bold text-lg tracking-tight leading-tight">SGE-GSU</h1>
          <p className="text-[10px] text-slate-400 uppercase tracking-widest">Sistema Integrado</p>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-4 space-y-1 overflow-y-auto custom-scrollbar">
        
        <SectionTitle title="Visão Geral" />
        
        {/* O Dashboard tem URLs diferentes dependendo do usuario, checamos ambas */}
        <NavItem 
          icon={<Home size={20} />} 
          label="Início" 
          active={isActive('/painel-escola') || isActive('/painel-regional') || isActive('/dashboard')}
          onClick={() => navigate(userRole === 'regional_admin' ? '/painel-regional' : '/painel-escola')} 
        />

        <SectionTitle title="Gestão Operacional" />

        <NavItem 
          icon={<Wrench size={20} />} 
          label="Zeladoria" 
          active={isActive('/zeladoria')}
          onClick={() => navigate('/zeladoria')} 
        />
        
        <NavItem 
          icon={<Droplets size={20} />} 
          label="Consumo de Água" 
          active={isActive('/consumo-agua')}
          onClick={() => navigate('/consumo-agua')} 
        />
        
        <NavItem 
          icon={<Package size={20} />} 
          label="Patrimônio" 
          active={isActive('/patrimonio')}
          onClick={() => navigate('/patrimonio')} 
        />

        {/* Item exclusivo para Regional ou visível para todos? Deixei para todos verem por enquanto */}
        <NavItem 
          icon={<Hammer size={20} />} 
          label="Obras e Reformas" 
          active={isActive('/obras')}
          onClick={() => navigate('/obras')} 
        />

        <SectionTitle title="Comunicação" />
        
        <NavItem 
          icon={<Bell size={20} />} 
          label="Notificações" 
          active={isActive('/notificacoes')}
          onClick={() => navigate('/notificacoes')} 
        />

        <SectionTitle title="Sistema" />
        <NavItem 
          icon={<Settings size={20} />} 
          label="Configurações" 
          active={isActive('/configuracoes')}
          onClick={() => {}} 
        />

      </nav>

      {/* Footer / Logout */}
      <div className="p-4 border-t border-slate-800 bg-slate-900">
        <button 
          onClick={handleLogout}
          className="flex items-center gap-3 text-slate-400 hover:text-red-400 hover:bg-slate-800 w-full p-3 rounded-lg transition-all group"
        >
          <LogOut size={20} className="group-hover:-translate-x-1 transition-transform" />
          <span className="font-medium">Sair do Sistema</span>
        </button>
      </div>
    </aside>
  );
}

// Componentes Auxiliares para deixar o código limpo

function SectionTitle({ title }: { title: string }) {
  return (
    <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2 mt-6 px-3">
      {title}
    </p>
  );
}

function NavItem({ icon, label, active = false, onClick }: any) {
  return (
    <div 
      onClick={onClick} 
      className={`flex items-center gap-3 p-3 rounded-lg transition-all cursor-pointer select-none ${
        active 
          ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/20 translate-x-1' 
          : 'text-slate-400 hover:bg-slate-800 hover:text-white hover:translate-x-1'
      }`}
    >
      {icon}
      <span className="font-medium text-sm">{label}</span>
    </div>
  );
}
import { useState } from 'react';
import { Home, Users, Settings, LogOut, ChevronLeft, ChevronRight, FileText, Menu } from 'lucide-react';

interface SidebarProps {
  userRole: string;
}

export function Sidebar({ userRole }: SidebarProps) {
  const [isCollapsed, setIsCollapsed] = useState(false);

  return (
    <aside 
      className={`${isCollapsed ? 'w-20' : 'w-64'} bg-slate-900 text-white transition-all duration-300 flex flex-col h-screen shadow-xl z-20 flex-shrink-0`}
    >
      {/* Topo da Sidebar */}
      <div className="h-16 flex items-center justify-between px-4 border-b border-slate-800">
        {!isCollapsed && <span className="font-bold text-xl tracking-tight text-blue-400">SGE-GSU</span>}
        <button 
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="p-1 rounded hover:bg-slate-700 text-slate-400 hover:text-white transition-colors"
        >
          {isCollapsed ? <Menu size={20} /> : <ChevronLeft size={20} />}
        </button>
      </div>

      {/* Menu de Navegação */}
      <nav className="flex-1 py-6 flex flex-col gap-2 px-3">
        <NavItem icon={<Home size={20} />} label="Início" collapsed={isCollapsed} active />
        <NavItem icon={<FileText size={20} />} label="Zeladoria" collapsed={isCollapsed} />
        
        {userRole === 'admin' && (
          <NavItem icon={<Users size={20} />} label="Usuários" collapsed={isCollapsed} />
        )}
      </nav>

      {/* Rodapé */}
      <div className="p-4 border-t border-slate-800">
        <button className={`flex items-center ${isCollapsed ? 'justify-center' : 'gap-3'} w-full text-slate-400 hover:text-red-400 hover:bg-slate-800 p-2 rounded transition-colors`}>
          <LogOut size={20} />
          {!isCollapsed && <span className="font-medium">Sair</span>}
        </button>
      </div>
    </aside>
  );
}

// Componente auxiliar de item de menu
function NavItem({ icon, label, collapsed, active = false }: any) {
  return (
    <a href="#" className={`flex items-center ${collapsed ? 'justify-center' : 'gap-3'} px-3 py-3 rounded-lg transition-colors ${active ? 'bg-blue-600 text-white' : 'text-slate-400 hover:bg-slate-800 hover:text-white'}`}>
      {icon}
      {!collapsed && <span className="font-medium whitespace-nowrap">{label}</span>}
    </a>
  );
}
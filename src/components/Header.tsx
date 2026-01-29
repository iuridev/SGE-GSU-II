import { Bell, Search, UserCircle } from 'lucide-react';

interface HeaderProps {
  userName: string;
  userRole: string;
}

export function Header({ userName, userRole }: HeaderProps) {
  return (
    <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-8 fixed top-0 right-0 left-64 z-40">
      
      {/* Search Bar */}
      <div className="flex items-center gap-2 bg-slate-100 px-4 py-2 rounded-full w-96 text-slate-500">
        <Search size={18} />
        <input 
          type="text" 
          placeholder="Buscar alunos, escolas ou documentos..." 
          className="bg-transparent border-none outline-none text-sm w-full"
        />
      </div>

      {/* User Profile */}
      <div className="flex items-center gap-6">
        <button className="relative text-slate-500 hover:text-blue-600 transition-colors">
          <Bell size={20} />
          <span className="absolute -top-1 -right-1 w-2 h-2 bg-red-500 rounded-full"></span>
        </button>
        
        <div className="flex items-center gap-3 pl-6 border-l border-slate-200">
          <div className="text-right hidden md:block">
            <p className="text-sm font-bold text-slate-700">{userName}</p>
            <p className="text-xs text-slate-500 font-medium">
              {userRole === 'regional_admin' ? 'Administrador Regional' : 'Gestor Escolar'}
            </p>
          </div>
          <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center text-blue-600">
            <UserCircle size={28} />
          </div>
        </div>
      </div>
    </header>
  );
}
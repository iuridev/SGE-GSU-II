import { useState, useEffect } from 'react';
import { Bell, Search, UserCircle, MessageSquare } from 'lucide-react';
import { supabase } from '../lib/supabase';

interface HeaderProps {
  userName: string;
  userRole: string;
}

export function Header({ userName, userRole }: HeaderProps) {
  const [unreadCount, setUnreadCount] = useState(0);
  const [showDropdown, setShowDropdown] = useState(false);

  useEffect(() => {
    let userId: string;

    async function setupNotifications() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      userId = user.id;

      const { count } = await supabase
        .from('messages')
        .select('*', { count: 'exact', head: true })
        .eq('is_read', false)
        .neq('sender_id', userId);

      setUnreadCount(count || 0);

      const channel = supabase
        .channel('header-notifs')
        .on('postgres_changes', { 
          event: '*', 
          schema: 'public', 
          table: 'messages' 
        }, async () => {
          const { count: currentCount } = await supabase
            .from('messages')
            .select('*', { count: 'exact', head: true })
            .eq('is_read', false)
            .neq('sender_id', userId);
          setUnreadCount(currentCount || 0);
        })
        .subscribe();

      return () => { supabase.removeChannel(channel); };
    }

    setupNotifications();
  }, []);

  return (
    <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-8 sticky top-0 z-40 w-full shadow-sm">
      
      {/* Barra de Busca (Esquerda) */}
      <div className="flex items-center gap-2 bg-slate-100 px-4 py-2 rounded-full w-64 lg:w-96 text-slate-500 border border-transparent focus-within:border-blue-300 focus-within:bg-white transition-all">
        <Search size={18} />
        <input 
          type="text" 
          placeholder="Pesquisar..." 
          className="bg-transparent border-none outline-none text-sm w-full font-medium"
        />
      </div>

      {/* Ações e Perfil (Direita) */}
      <div className="flex items-center gap-3 md:gap-6">
        
        {/* SINO DE NOTIFICAÇÃO */}
        <div className="relative">
          <button 
            onClick={() => setShowDropdown(!showDropdown)}
            className={`p-2 rounded-xl transition-all relative ${unreadCount > 0 ? 'bg-blue-50 text-blue-600' : 'hover:bg-slate-100 text-slate-500'}`}
          >
            <Bell size={22} strokeWidth={2.5} />
            {unreadCount > 0 && (
              <span className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-red-600 text-[10px] font-bold text-white ring-2 ring-white">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </button>

          {/* Dropdown de Notificações */}
          {showDropdown && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setShowDropdown(false)}></div>
              <div className="absolute right-0 mt-3 w-80 bg-white rounded-2xl shadow-2xl border border-slate-100 py-3 z-20 animate-in fade-in zoom-in-95 duration-200">
                <div className="px-4 pb-2 border-b border-slate-50 mb-2">
                  <p className="text-xs font-black text-slate-400 uppercase tracking-widest">Notificações</p>
                </div>
                {unreadCount > 0 ? (
                  <div className="max-h-64 overflow-y-auto">
                    <a href="/chat" onClick={() => setShowDropdown(false)} className="flex items-center gap-4 px-4 py-4 hover:bg-blue-50 transition-colors group">
                      <div className="w-10 h-10 bg-blue-100 text-blue-600 rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform">
                        <MessageSquare size={18} />
                      </div>
                      <div>
                        <p className="text-sm font-bold text-slate-800">Mensagens Pendentes</p>
                        <p className="text-xs text-slate-500 font-medium">Há {unreadCount} mensagens novas no chat.</p>
                      </div>
                    </a>
                  </div>
                ) : (
                  <div className="py-10 text-center">
                    <Bell size={32} className="mx-auto text-slate-200 mb-3" />
                    <p className="text-sm text-slate-400 font-medium">Nenhuma notificação</p>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
        
        {/* Perfil do Usuário */}
        <div className="flex items-center gap-3 pl-4 border-l border-slate-200">
          <div className="text-right hidden md:block">
            <p className="text-sm font-bold text-slate-800 leading-none mb-1">{userName}</p>
            <p className="text-[10px] font-black text-blue-600 uppercase tracking-tighter opacity-80 bg-blue-50 px-2 py-0.5 rounded-md inline-block">
               {userRole === 'regional_admin' ? 'Regional Admin' : 
                userRole === 'supervisor' ? 'Supervisor' : 
                userRole === 'dirigente' ? 'Dirigente' : 'Escola'}
            </p>
          </div>
          <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-blue-700 rounded-full flex items-center justify-center text-white border-2 border-white shadow-md">
            <UserCircle size={28} />
          </div>
        </div>
      </div>
    </header>
  );
}
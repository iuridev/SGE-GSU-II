import { useState, useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import { supabase, type Database } from '../lib/supabase';
import { Sidebar } from './Sidebar';
import { Header } from './Header';

type ProfileRow = Database['public']['Tables']['profiles']['Row'];

export function Layout() {
  const [userRole, setUserRole] = useState("");
  const [userName, setUserName] = useState("Carregando...");

  useEffect(() => {
    getProfile();
  }, []);

  async function getProfile() {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setUserName(user.user_metadata?.full_name || "Usuário");
        const { data } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', user.id)
          .single();
        const profile = data as ProfileRow | null;
        if (profile) {
          setUserRole(profile.role || 'school_manager');
          if (profile.full_name) setUserName(profile.full_name);
        }
      }
    } catch (error) {
      console.error("Erro ao carregar perfil:", error);
      setUserRole('school_manager'); 
    }
  }

  return (
    <div className="flex min-h-screen bg-slate-50 font-sans">
      <Sidebar userRole={userRole} />
      
      {/* ml-64: Dá espaço para a Sidebar.
         flex-1: Ocupa todo o resto da tela.
         min-w-0: Evita quebras de layout.
      */}
      <div className="flex-1 ml-64 flex flex-col min-h-screen min-w-0">
        <Header userName={userName} userRole={userRole} />
        
        <main className="flex-1 p-6 md:p-8">
          <Outlet /> 
        </main>
      </div>
    </div>
  );
}
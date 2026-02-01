import { useState, useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import { supabase, type Database } from '../lib/supabase'; // CORREÇÃO: Adicionado 'type' aqui
import { Sidebar } from './Sidebar';
import { Header } from './Header';

// Atalho para o tipo da linha de perfil
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
          
        // Casting explícito para resolver o problema de inferência 'never'
        const profile = data as ProfileRow | null;

        if (profile) {
          setUserRole(profile.role || 'school_manager');
        } else {
          setUserRole('school_manager');
        }
      }
    } catch (error) {
      console.error("Erro ao carregar perfil:", error);
      setUserRole('school_manager'); 
    }
  }

  return (
    <div className="flex min-h-screen bg-gray-50 font-sans">
      <Sidebar userRole={userRole} />
      
      <div className="flex-1 flex flex-col min-h-screen overflow-hidden ml-64">
        <Header userName={userName} userRole={userRole} />
        
        <main className="flex-1 overflow-y-auto p-6 md:p-8">
          <Outlet /> 
        </main>
      </div>
    </div>
  );
}
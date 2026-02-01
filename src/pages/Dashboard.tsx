import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Sidebar } from '../components/Sidebar';
import { Header } from '../components/Header';
import { 
  Zap, 
  Droplet, 
  Truck // Ícone para o caminhão pipa
} from 'lucide-react';
import { PowerOutageModal } from '../components/PowerOutageModal';
import { WaterTruckModal } from '../components/WaterTruckModal'; // Importando o novo modal

// --- INTERFACES ---
interface School {
  id: string;
  name: string;
  sabesp_supply_id?: string; // Código SABESP
}

export function Dashboard() {
  const [loading, setLoading] = useState(true);
  const [userRole, setUserRole] = useState<string>("");
  const [userName, setUserName] = useState<string>("Usuário");
  const [userSchool, setUserSchool] = useState<School | null>(null);

  // Estados dos Modais
  const [isPowerModalOpen, setIsPowerModalOpen] = useState(false);
  const [isWaterTruckModalOpen, setIsWaterTruckModalOpen] = useState(false);

  useEffect(() => {
    init();
  }, []);

  async function init() {
    try {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      setUserName(user.user_metadata?.full_name || "Usuário");

      // Buscar perfil e escola
      const { data: profile } = await (supabase
        .from('profiles') as any)
        .select('role, school_id')
        .eq('id', user.id)
        .single();

      const role = profile?.role || 'school_manager';
      setUserRole(role);

      if (profile?.school_id) {
        const { data: schoolData } = await (supabase.from('schools') as any)
          .select('id, name, sabesp_supply_id')
          .eq('id', profile.school_id)
          .single();
        
        if (schoolData) {
          setUserSchool(schoolData);
        }
      }

    } catch (error) {
      console.error("Erro ao inicializar:", error);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen bg-gray-50 font-sans">
      <Sidebar userRole={userRole} />
      
      <div className="flex-1 flex flex-col min-h-screen overflow-hidden">
        <Header userName={userName} userRole={userRole} />
        
        <main className="flex-1 overflow-y-auto p-6 md:p-8">
          <div className="max-w-6xl mx-auto">
            
            {/* Boas-vindas e Ações Rápidas */}
            <div className="mb-8">
              <h1 className="text-2xl font-bold text-gray-800">
                Olá, {userName.split(' ')[0]}!
              </h1>
              <p className="text-gray-500">Bem-vindo ao Painel de Gestão Regional.</p>
            </div>

            {/* Botões de Ação de Emergência (Visíveis para Gestores) */}
            {userRole === 'school_manager' && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
                {/* Botão Queda de Energia */}
                <button
                  onClick={() => setIsPowerModalOpen(true)}
                  className="p-6 bg-red-50 border-2 border-red-100 rounded-xl hover:border-red-300 hover:shadow-md transition-all group text-left flex items-center gap-4"
                >
                  <div className="p-3 bg-red-100 text-red-600 rounded-lg group-hover:bg-red-600 group-hover:text-white transition-colors">
                    <Zap size={32} />
                  </div>
                  <div>
                    <h3 className="font-bold text-red-800 text-lg">Informar Queda de Energia</h3>
                    <p className="text-sm text-red-600/80">Reportar falta de luz na unidade</p>
                  </div>
                </button>

                {/* Botão Solicitar Caminhão Pipa */}
                <button
                  onClick={() => setIsWaterTruckModalOpen(true)}
                  className="p-6 bg-blue-50 border-2 border-blue-100 rounded-xl hover:border-blue-300 hover:shadow-md transition-all group text-left flex items-center gap-4"
                >
                  <div className="p-3 bg-blue-100 text-blue-600 rounded-lg group-hover:bg-blue-600 group-hover:text-white transition-colors">
                    <Truck size={32} />
                  </div>
                  <div>
                    <h3 className="font-bold text-blue-800 text-lg">Solicitar Caminhão Pipa</h3>
                    <p className="text-sm text-blue-600/80">Pedido emergencial de abastecimento</p>
                  </div>
                </button>
              </div>
            )}

            {/* MOCK DE CONTEÚDO PARA PREENCHER A TELA */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                <h3 className="font-bold text-gray-700 mb-2">Processos Ativos</h3>
                <p className="text-3xl font-bold text-blue-600">12</p>
              </div>
              <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                <h3 className="font-bold text-gray-700 mb-2">Vistorias Pendentes</h3>
                <p className="text-3xl font-bold text-orange-500">3</p>
              </div>
              <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                <h3 className="font-bold text-gray-700 mb-2">Obras em Andamento</h3>
                <p className="text-3xl font-bold text-green-600">1</p>
              </div>
            </div>

          </div>
        </main>

        {/* MODAL: QUEDA DE ENERGIA */}
        <PowerOutageModal 
          isOpen={isPowerModalOpen} 
          onClose={() => setIsPowerModalOpen(false)}
          schoolName={userSchool?.name}
          userName={userName}
        />

        {/* MODAL: SOLICITAÇÃO DE CAMINHÃO PIPA */}
        <WaterTruckModal
          isOpen={isWaterTruckModalOpen}
          onClose={() => setIsWaterTruckModalOpen(false)}
          schoolName={userSchool?.name || ""}
          userName={userName}
          sabespId={userSchool?.sabesp_supply_id}
        />

      </div>
    </div>
  );
}
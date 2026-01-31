import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Sidebar } from '../components/Sidebar';
import { Header } from '../components/Header';
import { PowerOutageModal } from '../components/PowerOutageModal';
import { Users, GraduationCap, School, AlertTriangle, TrendingUp, ZapOff } from 'lucide-react';

export function Dashboard() {
  const [profile, setProfile] = useState<any>({
    // VALORES PADRÃO (Para a tela não ficar branca nunca)
    full_name: 'Administrador (Teste)',
    role: 'regional_admin'
  });
  const [loading, setLoading] = useState(true);
  const [isPowerModalOpen, setIsPowerModalOpen] = useState(false);

  useEffect(() => {
    const getProfile = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        
        if (user) {
          const { data, error } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', user.id)
            .single();

          if (data) {
            setProfile(data);
          } else if (error) {
            console.error("Erro ao buscar perfil, usando padrão:", error);
          }
        }
      } catch (error) {
        console.error("Erro de conexão:", error);
      } finally {
        // Sempre finaliza o loading para mostrar a tela
        setLoading(false);
      }
    };

    getProfile();
  }, []);

  // Se estiver carregando, mostra um spinner bonito em vez de texto puro
  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="flex h-screen w-screen bg-slate-50 overflow-hidden">
      {/* 1. Sidebar Flexível */}
      <Sidebar userRole={profile?.role || 'admin'} />

      {/* 2. Área Principal */}
      <div className="flex-1 flex flex-col h-full relative overflow-hidden">
        
        <Header userName={profile?.full_name || 'Usuário'} userRole={profile?.role || 'admin'} />

        <main className="flex-1 overflow-y-auto p-4 md:p-8 pt-24 scroll-smooth">
          <div className="max-w-7xl mx-auto">

            {/* Welcome Section */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-end mb-8 gap-4">
              <div>
                <h2 className="text-2xl font-bold text-slate-800">
                  Olá, {profile?.full_name?.split(' ')[0]} 👋
                </h2>
                <p className="text-slate-500 mt-1">
                  Resumo operacional da {profile?.role === 'regional_admin' ? 'Diretoria Regional' : 'Unidade Escolar'}.
                </p>
              </div>

              <button
                className="bg-orange-600 hover:bg-orange-700 text-white px-5 py-3 rounded-lg font-bold shadow-lg shadow-orange-600/20 flex items-center gap-2 transition-all active:scale-95 animate-pulse-slow w-full md:w-auto justify-center"
                onClick={() => setIsPowerModalOpen(true)}
              >
                <ZapOff size={20} />
                Notificar Queda de Energia
              </button>
            </div>

            {/* Widgets Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
              <StatCard
                title={profile?.role === 'regional_admin' ? "Escolas Monitoradas" : "Total de Alunos"}
                value={profile?.role === 'regional_admin' ? "42" : "1.250"}
                icon={profile?.role === 'regional_admin' ? <School className="text-blue-600" /> : <Users className="text-blue-600" />}
                trend="+2.5% este mês"
              />
              <StatCard
                title="Presença Hoje"
                value="94%"
                icon={<TrendingUp className="text-emerald-600" />}
                trend="Normal"
                trendColor="text-emerald-600"
              />
              <StatCard
                title="Ocorrências"
                value="3"
                icon={<AlertTriangle className="text-amber-500" />}
                trend="Atenção Necessária"
                trendColor="text-amber-600"
              />
              <StatCard
                title="Novas Matrículas"
                value="18"
                icon={<GraduationCap className="text-purple-600" />}
                trend="Ciclo Vigente"
              />
            </div>

            {/* Tabela Recente */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
              <div className="flex justify-between items-center mb-6">
                <h3 className="font-bold text-slate-700">Atividades Recentes</h3>
                <button className="text-sm text-blue-600 font-medium hover:underline">Ver histórico</button>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left text-slate-600">
                  <thead className="bg-slate-50 text-slate-700 font-semibold uppercase text-xs">
                    <tr>
                      <th className="px-4 py-3 rounded-l-lg">Ação</th>
                      <th className="px-4 py-3">Responsável</th>
                      <th className="px-4 py-3">Data</th>
                      <th className="px-4 py-3 rounded-r-lg">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    <tr>
                      <td className="px-4 py-3 font-medium text-slate-800">Fechamento de Notas - 3º B</td>
                      <td className="px-4 py-3">Prof. Carlos Silva</td>
                      <td className="px-4 py-3">Hoje, 09:42</td>
                      <td className="px-4 py-3"><span className="px-2 py-1 bg-green-100 text-green-700 rounded-full text-xs font-bold">Concluído</span></td>
                    </tr>
                    <tr>
                      <td className="px-4 py-3 font-medium text-slate-800">Solicitação de Histórico</td>
                      <td className="px-4 py-3">Secretaria (Ana)</td>
                      <td className="px-4 py-3">Ontem, 16:20</td>
                      <td className="px-4 py-3"><span className="px-2 py-1 bg-amber-100 text-amber-700 rounded-full text-xs font-bold">Pendente</span></td>
                    </tr>
                    <tr>
                      <td className="px-4 py-3 font-medium text-slate-800">Manutenção Elétrica (Sala 4)</td>
                      <td className="px-4 py-3">Zeladoria</td>
                      <td className="px-4 py-3">28/01/2026</td>
                      <td className="px-4 py-3"><span className="px-2 py-1 bg-blue-100 text-blue-700 rounded-full text-xs font-bold">Agendado</span></td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            <PowerOutageModal
              isOpen={isPowerModalOpen}
              onClose={() => setIsPowerModalOpen(false)}
              schoolName="E.E. Exemplo de Escola"
              userName={profile?.full_name || 'Usuário'}
            />
          </div>
        </main>
      </div>
    </div>
  );
}

// Componente visual dos Cards (Mantido igual)
function StatCard({ title, value, icon, trend, trendColor = "text-blue-600" }: any) {
  return (
    <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 hover:shadow-md transition-shadow group">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-slate-500 text-sm font-medium">{title}</h3>
        <div className="p-2 bg-slate-50 rounded-lg group-hover:bg-blue-50 transition-colors">{icon}</div>
      </div>
      <div className="flex items-end gap-2">
        <span className="text-3xl font-bold text-slate-800">{value}</span>
      </div>
      <p className={`text-xs font-medium mt-2 ${trendColor}`}>{trend}</p>
    </div>
  );
}
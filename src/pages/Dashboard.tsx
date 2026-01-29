import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Sidebar } from '../components/Sidebar';
import { Header } from '../components/Header';
import { PowerOutageModal } from '../components/PowerOutageModal'; // Importe o componente novo
// Adicionei o ícone 'ZapOff' que representa falta de energia
import { Users, GraduationCap, School, AlertTriangle, TrendingUp, ZapOff } from 'lucide-react';

export function Dashboard() {
  const [profile, setProfile] = useState<any>(null);
  const [isPowerModalOpen, setIsPowerModalOpen] = useState(false);

  useEffect(() => {
    // Busca os dados do usuário logado
    const getProfile = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', user.id)
          .single();
        setProfile(data);
      }
    };
    getProfile();
  }, []);

  if (!profile) return <div className="flex h-screen items-center justify-center text-slate-500 bg-slate-50">Carregando sistema...</div>;

  return (
    <div className="min-h-screen bg-slate-50">
      <Sidebar userRole={profile.role} />
      <Header userName={profile.full_name || 'Usuário'} userRole={profile.role} />

      {/* Main Content Area */}
      <main className="ml-64 pt-24 p-8">

        {/* Welcome Section & Botão de Emergência */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-end mb-8 gap-4">
          <div>
            <h2 className="text-2xl font-bold text-slate-800">
              Olá, {profile.full_name?.split(' ')[0]} 👋
            </h2>
            <p className="text-slate-500 mt-1">
              Aqui está o resumo da sua {profile.role === 'regional_admin' ? 'regional' : 'unidade escolar'} hoje.
            </p>
          </div>

          {/* O NOVO BOTÃO LARANJA AQUI */}
          <button
            className="bg-orange-600 hover:bg-orange-700 text-white px-5 py-3 rounded-lg font-bold shadow-lg shadow-orange-600/20 flex items-center gap-2 transition-all active:scale-95 animate-pulse-slow"
            onClick={() => setIsPowerModalOpen(true)}          >
            <ZapOff size={20} />
            Notificar Queda de Energia
          </button>
        </div>

        {/* Widgets Grid (KPIs) */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          {/* Card 1 */}
          <StatCard
            title={profile.role === 'regional_admin' ? "Escolas Ativas" : "Total de Alunos"}
            value={profile.role === 'regional_admin' ? "42" : "1.250"}
            icon={profile.role === 'regional_admin' ? <School className="text-blue-600" /> : <Users className="text-blue-600" />}
            trend="+2.5% este mês"
          />

          {/* Card 2 */}
          <StatCard
            title="Presença Hoje"
            value="94%"
            icon={<TrendingUp className="text-emerald-600" />}
            trend="Média acima do esperado"
            trendColor="text-emerald-600"
          />

          {/* Card 3 */}
          <StatCard
            title="Ocorrências"
            value="3"
            icon={<AlertTriangle className="text-amber-500" />}
            trend="Requer atenção"
            trendColor="text-amber-600"
          />

          {/* Card 4 */}
          <StatCard
            title="Matrículas Novas"
            value="18"
            icon={<GraduationCap className="text-purple-600" />}
            trend="Aberta até 30/02"
          />
        </div>

        {/* Tabela Recente */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
          <div className="flex justify-between items-center mb-6">
            <h3 className="font-bold text-slate-700">Atividades Recentes no SGE</h3>
            <button className="text-sm text-blue-600 font-medium hover:underline">Ver tudo</button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left text-slate-600">
              <thead className="bg-slate-50 text-slate-700 font-semibold uppercase text-xs">
                <tr>
                  <th className="px-4 py-3 rounded-l-lg">Descrição</th>
                  <th className="px-4 py-3">Usuário</th>
                  <th className="px-4 py-3">Data</th>
                  <th className="px-4 py-3 rounded-r-lg">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                <tr>
                  <td className="px-4 py-3 font-medium text-slate-800">Fechamento de Notas - 3º Ano B</td>
                  <td className="px-4 py-3">Prof. Carlos Silva</td>
                  <td className="px-4 py-3">Hoje, 09:42</td>
                  <td className="px-4 py-3"><span className="px-2 py-1 bg-green-100 text-green-700 rounded-full text-xs font-bold">Concluído</span></td>
                </tr>
                <tr>
                  <td className="px-4 py-3 font-medium text-slate-800">Solicitação de Histórico Escolar</td>
                  <td className="px-4 py-3">Secretaria (Ana)</td>
                  <td className="px-4 py-3">Ontem, 16:20</td>
                  <td className="px-4 py-3"><span className="px-2 py-1 bg-amber-100 text-amber-700 rounded-full text-xs font-bold">Pendente</span></td>
                </tr>
                <tr>
                  <td className="px-4 py-3 font-medium text-slate-800">Registro de Ocorrência Disciplinar</td>
                  <td className="px-4 py-3">Inspetor Roberto</td>
                  <td className="px-4 py-3">28/01/2026</td>
                  <td className="px-4 py-3"><span className="px-2 py-1 bg-blue-100 text-blue-700 rounded-full text-xs font-bold">Arquivado</span></td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
        <PowerOutageModal
          isOpen={isPowerModalOpen}
          onClose={() => setIsPowerModalOpen(false)}
          schoolName="E.E. Exemplo de Escola" // Em breve pegaremos do profile
          userName={profile?.full_name || 'Usuário'}
        />
      </main>
    </div>
  );
}

// Componente visual dos Cards
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
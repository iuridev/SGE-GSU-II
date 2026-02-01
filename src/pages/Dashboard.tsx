import { useEffect, useState } from 'react';
import { 
  Building2, Users, AlertTriangle, Droplets, 
  TrendingUp, TrendingDown, Activity, Calendar 
} from 'lucide-react';
import { supabase } from '../lib/supabase';
// NOTE: Removemos Sidebar e Header daqui pois eles já estão no Layout.tsx

export function Dashboard() {
  const [stats, setStats] = useState({
    totalEscolas: 0,
    chamadosAbertos: 0,
    consumoAgua: 0,
    usuariosAtivos: 0
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchDashboardData();
  }, []);

  async function fetchDashboardData() {
    try {
      // Exemplo de buscas (ajuste conforme suas tabelas reais)
      const { count: escolasCount } = await supabase.from('schools').select('*', { count: 'exact', head: true });
      const { count: chamadosCount } = await supabase.from('maintenance_requests').select('*', { count: 'exact', head: true }).eq('status', 'pending');
      
      // Valores simulados ou reais
      setStats({
        totalEscolas: escolasCount || 156,
        chamadosAbertos: chamadosCount || 12,
        consumoAgua: 45000, // Exemplo
        usuariosAtivos: 34
      });
    } catch (error) {
      console.error('Erro ao buscar dados:', error);
    } finally {
      setLoading(false);
    }
  }

  // O return agora contém APENAS o conteúdo da página, sem Sidebar/Header ao redor
  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Visão Geral Regional</h1>
          <p className="text-slate-500">Acompanhamento em tempo real das unidades escolares.</p>
        </div>
        <div className="flex items-center gap-2 text-sm text-slate-500 bg-white px-3 py-1.5 rounded-lg border border-slate-200 shadow-sm">
          <Calendar className="w-4 h-4" />
          <span>{new Date().toLocaleDateString('pt-BR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</span>
        </div>
      </div>

      {/* Grid de Cards Principais */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard 
          title="Total de Escolas" 
          value={stats.totalEscolas} 
          icon={<Building2 className="w-6 h-6 text-blue-600" />} 
          trend="+2 este mês"
          trendUp={true}
          color="bg-blue-50"
        />
        <StatCard 
          title="Chamados Abertos" 
          value={stats.chamadosAbertos} 
          icon={<AlertTriangle className="w-6 h-6 text-amber-600" />} 
          trend="-5 que ontem"
          trendUp={true} // Positivo pois diminuiu problemas
          color="bg-amber-50"
        />
        <StatCard 
          title="Consumo de Água (L)" 
          value={stats.consumoAgua.toLocaleString()} 
          icon={<Droplets className="w-6 h-6 text-cyan-600" />} 
          trend="+12% vs média"
          trendUp={false} // Negativo pois aumentou consumo
          color="bg-cyan-50"
        />
        <StatCard 
          title="Usuários Ativos" 
          value={stats.usuariosAtivos} 
          icon={<Users className="w-6 h-6 text-emerald-600" />} 
          trend="Estável"
          trendUp={true}
          color="bg-emerald-50"
        />
      </div>

      {/* Seção de Gráficos / Listas Recentes */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm">
          <h3 className="font-bold text-slate-900 mb-4">Alertas Recentes</h3>
          {loading ? (
            <div className="h-32 flex items-center justify-center text-slate-400">Carregando...</div>
          ) : (
            <div className="space-y-4">
              {/* Exemplo de lista estática ou dinâmica */}
              <div className="flex items-center gap-4 p-3 bg-red-50 rounded-xl border border-red-100">
                <div className="bg-red-100 p-2 rounded-lg"><AlertTriangle className="w-5 h-5 text-red-600"/></div>
                <div>
                  <p className="text-sm font-bold text-slate-900">Nível Crítico: Reservatório E.E. Indaiá</p>
                  <p className="text-xs text-slate-500">Há 10 minutos</p>
                </div>
              </div>
              <div className="flex items-center gap-4 p-3 bg-amber-50 rounded-xl border border-amber-100">
                <div className="bg-amber-100 p-2 rounded-lg"><Activity className="w-5 h-5 text-amber-600"/></div>
                <div>
                  <p className="text-sm font-bold text-slate-900">Manutenção Pendente: E.E. Centro</p>
                  <p className="text-xs text-slate-500">Há 2 horas</p>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm">
          <h3 className="font-bold text-slate-900 mb-4">Status da Rede</h3>
          <div className="flex items-center justify-center h-48 bg-slate-50 rounded-xl border border-dashed border-slate-200 text-slate-400">
            Gráfico de disponibilidade aqui
          </div>
        </div>
      </div>
    </div>
  );
}

// Componente auxiliar simples para os Cards
function StatCard({ title, value, icon, trend, trendUp, color }: any) {
  return (
    <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between mb-4">
        <div className={`p-3 rounded-xl ${color}`}>
          {icon}
        </div>
        <span className={`flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-full ${trendUp ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
          {trendUp ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
          {trend}
        </span>
      </div>
      <div>
        <h3 className="text-slate-500 text-sm font-medium mb-1">{title}</h3>
        <p className="text-2xl font-bold text-slate-900">{value}</p>
      </div>
    </div>
  );
}

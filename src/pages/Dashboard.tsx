import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { 
  Building2, 
  Droplets, 
  Zap, 
  ShieldCheck, 
  HardHat, 
  AlertTriangle,
  ArrowRight,
  TrendingUp,
  LayoutDashboard,
  Calendar,
  CheckCircle2,
  Info,
  ChevronRight,
  Clock
} from 'lucide-react';
import { WaterTruckModal } from '../components/WaterTruckModal';
import { PowerOutageModal } from '../components/PowerOutageModal';

// Interfaces para garantir a tipagem correta e evitar erros de 'never'
interface Stats {
  schools: number;
  activeZeladorias: number;
  waterAlerts: number;
  activeWorks: number;
}

interface ProfileData {
  full_name: string;
  school_id: string | null;
}

interface SchoolData {
  name: string;
  sabesp_supply_id: string | null;
}

export function Dashboard() {
  // Estados para dados estatísticos
  const [stats, setStats] = useState<Stats>({
    schools: 0,
    activeZeladorias: 0,
    waterAlerts: 0,
    activeWorks: 0
  });
  
  // Estados para informações do usuário e escola
  const [loading, setLoading] = useState(true);
  const [userName, setUserName] = useState('');
  const [schoolName, setSchoolName] = useState('');
  const [sabespCode, setSabespCode] = useState('');
  
  // Estados de controle dos modais
  const [isWaterTruckModalOpen, setIsWaterTruckModalOpen] = useState(false);
  const [isPowerOutageModalOpen, setIsPowerOutageModalOpen] = useState(false);

  useEffect(() => {
    fetchStats();
    fetchUser();
  }, []);

  // Busca dados do usuário logado e sua respectiva escola
  async function fetchUser() {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        // Busca o perfil do usuário
        const { data: profile } = await (supabase as any)
          .from('profiles')
          .select('full_name, school_id')
          .eq('id', user.id)
          .single() as { data: ProfileData | null };
        
        if (profile) {
          setUserName(profile.full_name || 'Gestor');

          // Se o usuário estiver vinculado a uma escola, busca os dados técnicos dela
          if (profile.school_id) {
            const { data: school } = await (supabase as any)
              .from('schools')
              .select('name, sabesp_supply_id')
              .eq('id', profile.school_id)
              .single() as { data: SchoolData | null };
            
            setSchoolName(school?.name || 'Unidade Escolar');
            setSabespCode(school?.sabesp_supply_id || 'Não Cadastrado');
          } else {
            // Fallback para administradores regionais
            setSchoolName('Administração Regional');
            setSabespCode('Gestão Regional');
          }
        }
      }
    } catch (error) {
      console.error('Erro ao buscar dados do usuário:', error);
    }
  }

  // Busca contagens para os cards estatísticos
  async function fetchStats() {
    setLoading(true);
    try {
      // 1. Total de Escolas
      const { count: schoolsCount } = await (supabase as any)
        .from('schools')
        .select('*', { count: 'exact', head: true });

      // 2. Zeladorias Ativas (ignorando inativas/inabitáveis)
      const { count: zeladoriasCount } = await (supabase as any)
        .from('zeladorias')
        .select('*', { count: 'exact', head: true })
        .not('ocupada', 'eq', 'NÃO POSSUI')
        .not('ocupada', 'eq', 'NÃO HABITÁVEL');

      // 3. Alertas de Consumo de Água no mês vigente
      const firstDay = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();
      const { count: waterAlertsCount } = await (supabase as any)
        .from('consumo_agua')
        .select('*', { count: 'exact', head: true })
        .eq('limit_exceeded', true)
        .gte('date', firstDay);

      // 4. Obras ativas (não concluídas)
      const { count: worksCount } = await (supabase as any)
        .from('obras')
        .select('*', { count: 'exact', head: true })
        .not('status', 'eq', 'CONCLUÍDA');

      setStats({
        schools: schoolsCount || 0,
        activeZeladorias: zeladoriasCount || 0,
        waterAlerts: waterAlertsCount || 0,
        activeWorks: worksCount || 0
      });
    } catch (error) {
      console.error('Erro ao carregar estatísticas:', error);
    } finally {
      setLoading(false);
    }
  }

  const getTimeGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Bom dia';
    if (hour < 18) return 'Boa tarde';
    return 'Boa noite';
  };

  return (
    <div className="space-y-8 pb-10">
      {/* Seção de Saudação */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black text-slate-900 tracking-tight">
            {getTimeGreeting()}, <span className="text-blue-600">{userName.split(' ')[0]}</span>
          </h1>
          <p className="text-slate-500 font-medium mt-1 flex items-center gap-2">
            <Calendar size={16} className="text-slate-400" />
            Hoje é {new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })}
          </p>
        </div>
        
        <div className="flex items-center gap-3 bg-white p-2 rounded-2xl border border-slate-100 shadow-sm">
          <div className="w-10 h-10 bg-emerald-50 rounded-xl flex items-center justify-center text-emerald-600">
            <CheckCircle2 size={20} />
          </div>
          <div className="pr-4">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider leading-none">Status do Sistema</p>
            <p className="text-sm font-bold text-slate-700">Operacional</p>
          </div>
        </div>
      </div>

      {/* Grid de Estatísticas (Cards Superiores) */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard 
          title="Unidades de Ensino" 
          value={stats.schools} 
          icon={<Building2 size={24} />} 
          color="blue"
          loading={loading}
          label="Escolas Cadastradas"
        />
        <StatCard 
          title="Zeladorias Ativas" 
          value={stats.activeZeladorias} 
          icon={<ShieldCheck size={24} />} 
          color="emerald"
          loading={loading}
          label="Moradias Funcionais"
        />
        <StatCard 
          title="Alertas de Consumo" 
          value={stats.waterAlerts} 
          icon={<AlertTriangle size={24} />} 
          color="amber"
          loading={loading}
          label="Ocorrências no Mês"
          alert={stats.waterAlerts > 0}
        />
        <StatCard 
          title="Obras na Região" 
          value={stats.activeWorks} 
          icon={<HardHat size={24} />} 
          color="slate"
          loading={loading}
          label="Em Execução"
        />
      </div>

      {/* Seção de Ações Rápidas de Emergência */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-6">
          <div className="flex items-center gap-3">
             <div className="w-1 h-6 bg-blue-600 rounded-full"></div>
             <h2 className="text-xl font-black text-slate-800 uppercase tracking-tight">Serviços de Emergência</h2>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Card para Solicitar Caminhão Pipa */}
            <button 
              onClick={() => setIsWaterTruckModalOpen(true)}
              className="group relative overflow-hidden bg-gradient-to-br from-blue-600 to-blue-800 p-8 rounded-[2.5rem] text-left shadow-xl shadow-blue-200 transition-all hover:scale-[1.02] active:scale-95"
            >
              <div className="relative z-10">
                <div className="w-14 h-14 bg-white/20 backdrop-blur-md rounded-2xl flex items-center justify-center text-white mb-6">
                  <Droplets size={32} />
                </div>
                <h3 className="text-2xl font-black text-white leading-tight">Solicitar<br />Caminhão Pipa</h3>
                <p className="text-blue-100/80 text-sm mt-3 font-medium">Protocolo de abastecimento emergencial unificado.</p>
                <div className="mt-8 flex items-center gap-2 text-white font-bold text-sm uppercase tracking-widest">
                  Iniciar Chamado <ArrowRight size={16} className="group-hover:translate-x-2 transition-transform" />
                </div>
              </div>
              <Droplets className="absolute -bottom-10 -right-10 text-white/10" size={240} />
            </button>

            {/* Card para Notificar Queda de Energia */}
            <button 
              onClick={() => setIsPowerOutageModalOpen(true)}
              className="group relative overflow-hidden bg-gradient-to-br from-slate-800 to-slate-950 p-8 rounded-[2.5rem] text-left shadow-xl shadow-slate-200 transition-all hover:scale-[1.02] active:scale-95"
            >
              <div className="relative z-10">
                <div className="w-14 h-14 bg-white/10 backdrop-blur-md rounded-2xl flex items-center justify-center text-amber-400 mb-6">
                  <Zap size={32} />
                </div>
                <h3 className="text-2xl font-black text-white leading-tight">Notificar<br />Queda de Energia</h3>
                <p className="text-slate-400 text-sm mt-3 font-medium">Comunicação imediata com o setor de manutenção.</p>
                <div className="mt-8 flex items-center gap-2 text-white font-bold text-sm uppercase tracking-widest">
                  Notificar Setor <ArrowRight size={16} className="group-hover:translate-x-2 transition-transform" />
                </div>
              </div>
              <Zap className="absolute -bottom-10 -right-10 text-white/5" size={240} />
            </button>
          </div>
        </div>

        {/* Coluna de Atalhos e Suporte */}
        <div className="space-y-6">
          <div className="flex items-center gap-3">
             <div className="w-1 h-6 bg-slate-400 rounded-full"></div>
             <h2 className="text-xl font-black text-slate-800 uppercase tracking-tight">Atalhos</h2>
          </div>
          
          <div className="bg-white rounded-[2.5rem] border border-slate-100 shadow-xl p-4 space-y-2">
            <QuickLink icon={<LayoutDashboard size={18}/>} title="Relatórios Fiscais" desc="Acompanhamento de contratos" href="/fiscais" color="blue" />
            <QuickLink icon={<TrendingUp size={18}/>} title="Histórico de Consumo" desc="Análise hídrica anual" href="/consumo-agua" color="emerald" />
            <QuickLink icon={<Clock size={18}/>} title="Termos de Ocupação" desc="Gestão de prazos e validades" href="/zeladoria" color="amber" />
          </div>

          <div className="bg-blue-50/50 p-6 rounded-[2rem] border border-blue-100">
            <div className="flex items-center gap-3 mb-4">
              <Info className="text-blue-600" size={20} />
              <h4 className="font-bold text-blue-900">Suporte Técnico</h4>
            </div>
            <p className="text-xs text-blue-700/80 font-medium leading-relaxed">
              O sistema SGE-GSU II centraliza as demandas críticas. Em caso de dúvidas, utilize o canal oficial da Regional.
            </p>
          </div>
        </div>
      </div>

      {/* Renderização Condicional dos Modais */}
      {isWaterTruckModalOpen && (
        <WaterTruckModal 
          isOpen={isWaterTruckModalOpen}
          onClose={() => setIsWaterTruckModalOpen(false)} 
          schoolName={schoolName}
          userName={userName}
          sabespCode={sabespCode}
        />
      )}
      
      {isPowerOutageModalOpen && (
        <PowerOutageModal onClose={() => setIsPowerOutageModalOpen(false)} />
      )}
    </div>
  );
}

// Componente Local: Card de Estatística
function StatCard({ title, value, icon, color, loading, label, alert = false }: any) {
  const colorMap: any = {
    blue: "bg-blue-50 text-blue-600 border-blue-100",
    emerald: "bg-emerald-50 text-emerald-600 border-emerald-100",
    amber: "bg-amber-50 text-amber-600 border-amber-100",
    slate: "bg-slate-50 text-slate-600 border-slate-100",
  };

  return (
    <div className={`bg-white p-6 rounded-[2rem] border border-slate-100 shadow-xl shadow-slate-200/40 transition-all hover:-translate-y-1 ${alert ? 'ring-2 ring-amber-400 ring-offset-2' : ''}`}>
      <div className="flex justify-between items-start mb-4">
        <div className={`p-3 rounded-2xl ${colorMap[color]} shadow-sm`}>
          {icon}
        </div>
        {alert && (
          <span className="flex h-3 w-3 relative">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-3 w-3 bg-amber-500"></span>
          </span>
        )}
      </div>
      
      {loading ? (
        <div className="space-y-2">
          <div className="h-8 w-16 bg-slate-100 animate-pulse rounded-lg"></div>
          <div className="h-4 w-24 bg-slate-50 animate-pulse rounded-lg"></div>
        </div>
      ) : (
        <>
          <h3 className="text-3xl font-black text-slate-800 tracking-tighter">{value}</h3>
          <p className="text-xs font-black text-slate-400 uppercase tracking-widest mt-1">{title}</p>
          <div className="mt-4 pt-4 border-t border-slate-50 flex items-center justify-between">
            <span className="text-[10px] font-bold text-slate-400">{label}</span>
            <ArrowRight size={14} className="text-slate-300" />
          </div>
        </>
      )}
    </div>
  );
}

// Componente Local: Link Rápido
function QuickLink({ icon, title, desc, href, color }: any) {
  const colorMap: any = {
    blue: "group-hover:bg-blue-600 group-hover:text-white text-blue-600 bg-blue-50",
    emerald: "group-hover:bg-emerald-600 group-hover:text-white text-emerald-600 bg-emerald-50",
    amber: "group-hover:bg-amber-600 group-hover:text-white text-amber-600 bg-amber-50",
  };

  return (
    <a href={href} className="group flex items-center gap-4 p-3 hover:bg-slate-50 rounded-2xl transition-all">
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all ${colorMap[color]}`}>
        {icon}
      </div>
      <div className="flex-1">
        <p className="text-sm font-bold text-slate-700 leading-none">{title}</p>
        <p className="text-[10px] text-slate-400 mt-1 font-medium">{desc}</p>
      </div>
      <ChevronRight size={16} className="text-slate-300 group-hover:text-slate-500 transition-colors" />
    </a>
  );
}
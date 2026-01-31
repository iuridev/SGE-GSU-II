import { useEffect, useState, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { Sidebar } from '../components/Sidebar';
import { Header } from '../components/Header';
import { 
  School, 
  Search, 
  MoreVertical, 
  Download, 
  Filter,
  CheckCircle,
  AlertCircle,
  Clock,
  Loader2
} from 'lucide-react';
// Importação segura do Recharts
import { 
  PieChart, 
  Pie, 
  Cell, 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  Legend, 
  ResponsiveContainer 
} from 'recharts';

// --- CONFIGURAÇÃO DE CORES ---
const COLORS = {
  primary: '#1e3a8a',
  secondary: '#3b82f6',
  success: '#10b981',
  warning: '#f59e0b',
  danger: '#ef4444',
  neutral: '#6b7280',
  background: '#f3f4f6'
};

const STATUS_COLORS: Record<string, string> = {
  "CIÊNCIA VALOR": "#10b981",
  "CASA CIVIL": "#f59e0b",
  "PGE": "#ef4444",
  "CECIG-PGE": "#eab308",
  "NÃO POSSUI": "#9ca3af",
  "OCUPADO": "#10b981", 
  "VAGO": "#9ca3af"
};

// --- INTERFACES ---
interface UserProfile {
  role: string;
  school_id: string | null;
}

interface ZeladoriaRecord {
  id: string;
  ue: string;
  status: string;
  zelador_nome: string;
  zelador_rg: string;
  processo_sei: string;
  validade_zeladoria: string;
  status_dare: string;
  school_id: string;
  schools?: {
    name: string;
  };
  [key: string]: any; 
}

// --- COMPONENTES VISUAIS ---

const StatCard = ({ title, value, subtext, icon: Icon, trendUp }: any) => (
  <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 flex items-start justify-between">
    <div>
      <p className="text-sm font-semibold text-gray-500 uppercase tracking-wider">{title}</p>
      <h3 className="text-3xl font-bold text-gray-800 mt-2">{value}</h3>
      <p className="text-xs text-gray-400 mt-1">{subtext}</p>
    </div>
    <div className={`p-3 rounded-lg ${trendUp ? 'bg-green-50 text-green-600' : 'bg-blue-50 text-blue-600'}`}>
      <Icon size={24} />
    </div>
  </div>
);

const StatusBadge = ({ status }: { status: string }) => {
  const s = status ? String(status).toUpperCase() : "N/A";
  
  let colorClass = "bg-gray-100 text-gray-800";
  if (s.includes("CIÊNCIA") || s.includes("ISENTO") || s === "OCUPADO") colorClass = "bg-green-100 text-green-800 border border-green-200";
  else if (s.includes("CASA CIVIL") || s.includes("CECIG")) colorClass = "bg-yellow-100 text-yellow-800 border border-yellow-200";
  else if (s.includes("PGE") || s.includes("NÃO ISENTO") || s.includes("VENCIDO")) colorClass = "bg-red-100 text-red-800 border border-red-200";
  else if (s.includes("NÃO POSSUI") || s === "VAGO") colorClass = "bg-gray-100 text-gray-500 border border-gray-200";

  return (
    <span className={`px-2.5 py-1 rounded-full text-xs font-bold border ${colorClass}`}>
      {status || "N/A"}
    </span>
  );
};

// --- COMPONENTE PRINCIPAL ---

export function Zeladoria() {
  const [dados, setDados] = useState<ZeladoriaRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [error, setError] = useState<string | null>(null);
  
  const [userRole, setUserRole] = useState<string>("");
  const [userName, setUserName] = useState<string>("Usuário");

  useEffect(() => {
    fetchZeladorias();
  }, []);

  async function fetchZeladorias() {
    try {
      setLoading(true);
      setError(null);
      
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      
      if (authError || !user) {
        console.error("Erro de autenticação:", authError);
        setError("Usuário não autenticado.");
        setLoading(false);
        return;
      }

      const name = user.user_metadata?.full_name || user.email?.split('@')[0] || "Usuário";
      setUserName(name);

      const { data: profileData, error: profileError } = await supabase
        .from('profiles') 
        .select('role, school_id') 
        .eq('id', user.id)
        .single();

      if (profileError) {
        console.warn('Aviso: Perfil não encontrado.', profileError);
      }

      const profile = profileData as UserProfile | null;
      const role = profile?.role || 'school_manager';
      setUserRole(role);

      // Query segura
      let query = supabase
        .from('zeladorias')
        .select(`*, schools:school_id (name)`);

      if (role === 'school_manager') {
          if (profile?.school_id) {
            query = query.eq('school_id', profile.school_id);
          } else {
            console.warn('Gestor sem escola vinculada.');
            setDados([]);
            setLoading(false);
            return;
          }
      } 

      const { data, error: dataError } = await query;

      if (dataError) throw dataError;
      
      const rawData = (data || []) as ZeladoriaRecord[];
      
      const dadosMapeados = rawData.map(item => ({
        ...item,
        ue: item.schools?.name || item.ue || "Nome Indisponível"
      }));

      setDados(dadosMapeados);
      
    } catch (err: any) {
      console.error('Erro crítico ao buscar dados:', err);
      setError(err.message || "Erro desconhecido ao carregar dados.");
    } finally {
      setLoading(false);
    }
  }

  // Cálculos protegidos com useMemo
  const stats = useMemo(() => {
    if (!dados || dados.length === 0) {
      return { 
        total: 0, comZeladoria: 0, semZeladoria: 0, ocupacao: "0", 
        pieData: [], barData: [], vencendo: 0 
      };
    }

    const total = dados.length;
    
    const comZeladoria = dados.filter(i => 
      i.status && 
      !String(i.status).toUpperCase().includes("NÃO POSSUI") && 
      !String(i.status).toUpperCase().includes("VAGO")
    ).length;
    
    const semZeladoria = total - comZeladoria;
    const ocupacao = total > 0 ? ((comZeladoria / total) * 100).toFixed(0) : "0";
    
    const statusCount: Record<string, number> = {};
    dados.forEach(item => {
      const s = item.status || "Indefinido";
      statusCount[s] = (statusCount[s] || 0) + 1;
    });
    
    const pieData = Object.keys(statusCount).map(key => ({
      name: key,
      value: statusCount[key]
    })).sort((a, b) => b.value - a.value);

    const dareCount = { "Isento": 0, "Não Isento": 0 };
    dados.forEach(item => {
      const d = item.status_dare ? String(item.status_dare).toUpperCase() : "";
      if (d.includes("ISENTO") && !d.includes("NÃO")) dareCount["Isento"]++;
      else dareCount["Não Isento"]++;
    });
    
    const barData = [
      { name: 'Isento', value: dareCount["Isento"] },
      { name: 'Pendentes', value: dareCount["Não Isento"] }
    ];

    const hoje = new Date();
    const trintaDias = new Date();
    trintaDias.setDate(hoje.getDate() + 30);
    
    const vencendo = dados.filter(item => {
      if (!item.validade_zeladoria) return false;
      const validade = new Date(item.validade_zeladoria);
      return validade >= hoje && validade <= trintaDias;
    }).length;

    return { total, comZeladoria, semZeladoria, ocupacao, pieData, barData, vencendo };
  }, [dados]);

  const filteredData = dados.filter(item => {
    const term = searchTerm.toLowerCase();
    const ue = item.ue ? item.ue.toLowerCase() : "";
    const zelador = item.zelador_nome ? item.zelador_nome.toLowerCase() : "";
    return ue.includes(term) || zelador.includes(term);
  });

  // Se houver erro crítico, mostra mensagem amigável em vez de tela branca
  if (error) {
    return (
      <div className="flex min-h-screen bg-gray-50 items-center justify-center">
        <div className="text-center p-8 bg-white rounded-lg shadow-lg">
          <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-gray-800 mb-2">Ops! Algo deu errado.</h2>
          <p className="text-gray-600 mb-4">{error}</p>
          <button 
            onClick={() => window.location.reload()}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            Tentar Novamente
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-gray-50 font-sans">
      <Sidebar userRole={userRole} />
      
      <div className="flex-1 flex flex-col min-h-screen overflow-hidden">
        <Header userName={userName} userRole={userRole} />
        
        <main className="flex-1 overflow-y-auto p-6 md:p-8 space-y-6">
          
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
                <School className="text-blue-600" />
                Painel de Zeladorias
              </h1>
              <p className="text-gray-500 mt-1">Gestão de Ocupação e Contratos (Base SEFISC)</p>
            </div>
            <div className="flex gap-2">
               <button className="flex items-center px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg shadow-sm hover:bg-gray-50 text-sm font-medium">
                <Filter size={16} className="mr-2" /> Filtros
              </button>
              <button className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg shadow-md hover:bg-blue-700 transition-colors text-sm font-medium">
                <Download size={16} className="mr-2" /> Exportar
              </button>
            </div>
          </div>

          {loading ? (
            <div className="flex items-center justify-center h-64">
              <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <StatCard 
                  title="Total de Unidades" 
                  value={stats.total} 
                  subtext="Escolas monitoradas" 
                  icon={School} 
                />
                <StatCard 
                  title="Ocupação" 
                  value={`${stats.ocupacao}%`} 
                  subtext={`${stats.comZeladoria} ativas`} 
                  icon={CheckCircle}
                  trendUp={true} 
                />
                <StatCard 
                  title="Vagas Disponíveis" 
                  value={stats.semZeladoria} 
                  subtext="Unidades vagas" 
                  icon={AlertCircle}
                  trendUp={false} 
                />
                <StatCard 
                  title="Vencimentos" 
                  value={stats.vencendo} 
                  subtext="Vencem em 30 dias" 
                  icon={Clock} 
                />
              </div>

              {/* Seção de Gráficos com proteção contra dados vazios */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                
                <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 col-span-1 lg:col-span-2">
                  <h3 className="text-lg font-bold text-gray-800 mb-4">Status dos Processos</h3>
                  <div className="h-64">
                    {stats.pieData.length > 0 ? (
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={stats.pieData} layout="vertical" margin={{ top: 5, right: 30, left: 40, bottom: 5 }}>
                          <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} />
                          <XAxis type="number" hide />
                          <YAxis dataKey="name" type="category" width={120} tick={{fontSize: 11}} interval={0} />
                          <Tooltip cursor={{fill: 'transparent'}} contentStyle={{borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'}} />
                          <Bar dataKey="value" radius={[0, 4, 4, 0]} barSize={20}>
                            {stats.pieData.map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={STATUS_COLORS[entry.name] || COLORS.secondary} />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    ) : (
                      <div className="flex items-center justify-center h-full text-gray-400">Sem dados para exibir</div>
                    )}
                  </div>
                </div>

                <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                  <h3 className="text-lg font-bold text-gray-800 mb-4">Situação DARE</h3>
                  <div className="h-64 flex flex-col items-center justify-center">
                     {stats.barData.some(d => d.value > 0) ? (
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={stats.barData}
                            cx="50%"
                            cy="50%"
                            innerRadius={60}
                            outerRadius={80}
                            paddingAngle={5}
                            dataKey="value"
                          >
                            <Cell fill={COLORS.success} />
                            <Cell fill={COLORS.danger} />
                          </Pie>
                          <Tooltip />
                          <Legend verticalAlign="bottom" height={36}/>
                        </PieChart>
                      </ResponsiveContainer>
                     ) : (
                      <div className="flex items-center justify-center h-full text-gray-400">Sem dados</div>
                     )}
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="p-6 border-b border-gray-100 flex flex-col sm:flex-row justify-between items-center bg-gray-50 gap-4">
                  <h3 className="font-bold text-gray-800">Listagem Detalhada</h3>
                  <div className="relative w-full sm:w-64">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={16} />
                    <input 
                      type="text" 
                      placeholder="Procurar escola..." 
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="w-full pl-9 pr-4 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  </div>
                </div>
                
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-gray-50 text-xs font-semibold tracking-wide text-gray-500 uppercase border-b border-gray-200">
                        <th className="px-6 py-4">UE / Unidade</th>
                        <th className="px-6 py-4">Status</th>
                        <th className="px-6 py-4">Zelador (Ocupante)</th>
                        <th className="px-6 py-4">Processo SEI</th>
                        <th className="px-6 py-4">DARE</th>
                        <th className="px-6 py-4 text-center">Ações</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {filteredData.length > 0 ? (
                        filteredData.map((item) => (
                          <tr key={item.id || Math.random()} className="hover:bg-blue-50/50 transition-colors group">
                            <td className="px-6 py-4">
                              <div className="flex items-center">
                                <div className="w-10 h-8 rounded bg-blue-100 text-blue-600 flex items-center justify-center font-bold text-xs mr-3 shrink-0">
                                  {item.id ? item.id.slice(0, 4) : '#'}
                                </div>
                                <span className="font-medium text-gray-900 line-clamp-2">{item.ue}</span>
                              </div>
                            </td>
                            <td className="px-6 py-4">
                              <StatusBadge status={item.status} />
                            </td>
                            <td className="px-6 py-4">
                              <p className="text-sm font-medium text-gray-800 line-clamp-1">{item.zelador_nome || "-"}</p>
                              {item.zelador_rg && (
                                <p className="text-xs text-gray-400 mt-0.5">RG: {item.zelador_rg}</p>
                              )}
                            </td>
                            <td className="px-6 py-4">
                              {item.processo_sei ? (
                                <div className="flex flex-col">
                                  <span className="text-sm text-gray-600 font-mono bg-gray-100 px-2 py-0.5 rounded w-fit">{item.processo_sei}</span>
                                  {item.validade_zeladoria && (
                                    <span className={`text-xs mt-1 font-medium ${new Date(item.validade_zeladoria) < new Date() ? 'text-red-500' : 'text-green-600'}`}>
                                      Val: {new Date(item.validade_zeladoria).toLocaleDateString('pt-BR')}
                                    </span>
                                  )}
                                </div>
                              ) : (
                                <span className="text-gray-400">-</span>
                              )}
                            </td>
                            <td className="px-6 py-4">
                              <StatusBadge status={item.status_dare} />
                            </td>
                            <td className="px-6 py-4 text-center">
                              <button className="text-gray-400 hover:text-blue-600 p-1 rounded-full hover:bg-blue-100 transition-colors">
                                <MoreVertical size={18} />
                              </button>
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={6} className="px-6 py-8 text-center text-gray-500">
                            Nenhum registro encontrado.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </main>
      </div>
    </div>
  );
}
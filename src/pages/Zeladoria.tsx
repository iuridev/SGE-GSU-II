import { useEffect, useState, useMemo, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { Sidebar } from '../components/Sidebar';
import { Header } from '../components/Header';
import { 
  School, 
  Search, 
  Download, 
  Filter,
  CheckCircle,
  AlertCircle,
  Clock,
  Loader2,
  Edit,
  X,
  Save,
  History,
  FileText,
  Plus, 
  Trash2, 
  Flag 
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

// Bibliotecas para PDF
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import html2canvas from 'html2canvas';

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

// Mapeamento de cores baseado nos valores da coluna 'ocupada' do CSV
const STATUS_COLORS: Record<string, string> = {
  "CIÊNCIA VALOR": "#10b981", // Verde
  "CASA CIVIL": "#f59e0b",    // Laranja
  "PGE": "#ef4444",           // Vermelho
  "CECIG-PGE": "#eab308",     // Amarelo
  "NÃO POSSUI": "#9ca3af",    // Cinza
  "NÃO HABITÁVEL": "#6b7280", // Cinza Escuro
  "SIM": "#10b981",           // Verde
  "NÃO": "#9ca3af",           // Cinza
  "CONCLUIDO": "#059669"      // Verde Escuro
};

// Fases do Processo (Ordem Lógica)
const FASES_PROCESSO = [
  "SEI",
  "RELATÓRIO FOTOGRAFICO",
  "ANÁLISE",
  "CECIG PGE",
  "CIÊNCIA VALOR",
  "CASA CIVIL",
  "ASSINATURA DO TERMO",
  "CONCLUIDO"
];

// --- INTERFACES ---
interface UserProfile {
  role: string;
  school_id: string | null;
}

interface TimelineRecord {
  id: string;
  previous_status: string;
  new_status: string;
  changed_at: string;
  notes?: string;
}

interface ZeladoriaRecord {
  id: number | string;
  ue: number | string;   
  nome: string;          
  sei_numero: string;    
  ocupada: string;       
  zelador: string;       
  rg: string;            
  cargo: string;
  autorizacao: string;
  ate: string;
  validade: string;      
  perto_de_vencer: string;
  obs_sefisc: string;
  apelido_zelador: string;
  emails: string;
  dare: string;          
  created_at: string;
  school_id: string | null;
  schools?: {
    name: string;
  };
  [key: string]: any; 
}

// Interface para a lista de escolas (para o dropdown)
interface SchoolOption {
  id: string;
  name: string;
}

// --- COMPONENTES VISUAIS ---

const StatCard = ({ title, value, subtext, icon: Icon, trendUp, colorClass }: any) => (
  <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 flex items-start justify-between">
    <div>
      <p className="text-sm font-semibold text-gray-500 uppercase tracking-wider">{title}</p>
      <h3 className="text-3xl font-bold text-gray-800 mt-2">{value}</h3>
      <p className="text-xs text-gray-400 mt-1">{subtext}</p>
    </div>
    <div className={`p-3 rounded-lg ${colorClass ? colorClass : (trendUp ? 'bg-green-50 text-green-600' : 'bg-blue-50 text-blue-600')}`}>
      <Icon size={24} />
    </div>
  </div>
);

const StatusBadge = ({ status }: { status: string }) => {
  const s = status ? String(status).toUpperCase().trim() : "N/A";
  
  let colorClass = "bg-gray-100 text-gray-800";
  
  if (s.includes("CIÊNCIA") || s === "ISENTO" || s === "SIM" || s === "CONCLUIDO") colorClass = "bg-green-100 text-green-800 border border-green-200";
  else if (s.includes("CASA CIVIL") || s.includes("CECIG") || s.includes("ANÁLISE")) colorClass = "bg-yellow-100 text-yellow-800 border border-yellow-200";
  else if (s.includes("PGE") || s.includes("NÃO INSENTO") || s.includes("NÃO ISENTO")) colorClass = "bg-red-100 text-red-800 border border-red-200";
  else if (s.includes("NÃO POSSUI") || s === "VAGO" || s.includes("NÃO HABITÁVEL")) colorClass = "bg-gray-100 text-gray-500 border border-gray-200";

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
  const [exporting, setExporting] = useState(false);
  
  const [userRole, setUserRole] = useState<string>("");
  const [userName, setUserName] = useState<string>("Usuário");
  const [userId, setUserId] = useState<string>("");

  // Estado para Edição/Criação
  const [selectedZeladoria, setSelectedZeladoria] = useState<ZeladoriaRecord | null>(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [timeline, setTimeline] = useState<TimelineRecord[]>([]);
  const [loadingTimeline, setLoadingTimeline] = useState(false);
  
  // Lista de Escolas para vinculação (apenas Admin)
  const [schoolList, setSchoolList] = useState<SchoolOption[]>([]);

  // Form States
  const [editStatus, setEditStatus] = useState("");
  const [editZelador, setEditZelador] = useState("");
  const [editProcesso, setEditProcesso] = useState("");
  const [editObs, setEditObs] = useState("");
  const [editSchoolId, setEditSchoolId] = useState(""); // Novo estado para vincular escola

  // Refs para PDF
  const kpiRef = useRef<HTMLDivElement>(null);
  const chartsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchZeladorias();
  }, []);

  async function fetchZeladorias() {
    try {
      setLoading(true);
      setError(null);
      
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      
      if (authError || !user) {
        setError("Usuário não autenticado.");
        setLoading(false);
        return;
      }

      setUserId(user.id);
      const name = user.user_metadata?.full_name || user.email?.split('@')[0] || "Usuário";
      setUserName(name);

      const { data: profileData } = await supabase
        .from('profiles') 
        .select('role, school_id') 
        .eq('id', user.id)
        .single();

      const profile = profileData as UserProfile | null;
      const role = profile?.role || 'school_manager';
      setUserRole(role);

      let query = supabase
        .from('zeladorias')
        .select(`*, schools:school_id (name)`)
        .order('id', { ascending: true });

      if (role === 'school_manager') {
          if (profile?.school_id) {
            query = query.eq('school_id', profile.school_id);
          } else {
            setDados([]);
            setLoading(false);
            return;
          }
      } else if (role === 'regional_admin') {
        // Se for admin, carregamos também a lista de todas as escolas para o dropdown de edição
        fetchSchoolsList();
      }

      const { data, error: dataError } = await query;

      if (dataError) throw dataError;
      
      const rawData = (data || []) as ZeladoriaRecord[];
      const dadosMapeados = rawData.map(item => ({
        ...item,
        displayName: item.schools?.name || item.nome || `Unidade ${item.ue}`
      }));

      setDados(dadosMapeados);
      
    } catch (err: any) {
      console.error('Erro ao buscar dados:', err);
      setError(err.message || "Erro desconhecido.");
    } finally {
      setLoading(false);
    }
  }

  // Função auxiliar para carregar lista de escolas (apenas para Admin)
  async function fetchSchoolsList() {
    try {
      const { data } = await (supabase.from('schools') as any)
        .select('id, name')
        .order('name');
      if (data) {
        setSchoolList(data);
      }
    } catch (e) {
      console.error("Erro ao buscar lista de escolas", e);
    }
  }

  // Buscar histórico quando abrir modal
  const fetchTimeline = async (zeladoriaId: string | number) => {
    setLoadingTimeline(true);
    try {
      const { data, error } = await (supabase
        .from('zeladoria_timeline') as any)
        .select('*')
        .eq('zeladoria_id', zeladoriaId)
        .order('changed_at', { ascending: false });
      
      if (!error && data) {
        setTimeline(data);
      } else {
        setTimeline([]);
      }
    } catch (e) {
      console.error("Erro ao buscar timeline", e);
    } finally {
      setLoadingTimeline(false);
    }
  };

  const handleEditClick = (item: ZeladoriaRecord) => {
    setSelectedZeladoria(item);
    setEditStatus(item.ocupada || "");
    setEditZelador(item.zelador || "");
    setEditProcesso(item.sei_numero || "");
    setEditObs(item.obs_sefisc || "");
    setEditSchoolId(item.school_id || ""); // Carrega a escola atual
    
    fetchTimeline(item.id);
    setIsEditModalOpen(true);
  };

  // Função para preparar modal para novo cadastro
  const handleNewProcesso = () => {
    // Objeto vazio temporário para o formulário
    const newRecord: Partial<ZeladoriaRecord> = {
      id: 'new', // Flag para identificar que é novo
      ocupada: 'SEI', // Status inicial padrão
      zelador: '',
      sei_numero: '',
      obs_sefisc: '',
      school_id: '',
      displayName: 'Novo Processo'
    };
    
    setSelectedZeladoria(newRecord as ZeladoriaRecord);
    setEditStatus("SEI");
    setEditZelador("");
    setEditProcesso("");
    setEditObs("");
    setEditSchoolId(""); // Importante: Admin deve selecionar a escola
    setTimeline([]); // Sem histórico para novos
    setIsEditModalOpen(true);
  };

  const handleDeleteProcesso = async () => {
    if (!selectedZeladoria || selectedZeladoria.id === 'new') return;

    if (!window.confirm("Tem a certeza que deseja eliminar este processo de zeladoria? Esta ação não pode ser desfeita.")) {
      return;
    }

    try {
      setLoading(true);

      const { error: deleteError } = await (supabase
        .from('zeladorias') as any)
        .delete()
        .eq('id', selectedZeladoria.id);

      if (deleteError) throw deleteError;

      // Remove da lista local
      setDados(prev => prev.filter(item => item.id !== selectedZeladoria.id));
      
      setIsEditModalOpen(false);
      alert("Processo eliminado com sucesso!");

    } catch (err: any) {
      alert("Erro ao eliminar: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveZeladoria = async () => {
    if (!selectedZeladoria) return;

    try {
      setLoading(true);

      const payload: any = {
        ocupada: editStatus,
        zelador: editZelador,
        sei_numero: editProcesso,
        obs_sefisc: editObs,
      };

      // Se for admin e selecionou uma escola, atualiza o vínculo
      if (userRole === 'regional_admin' && editSchoolId) {
        payload.school_id = editSchoolId;
      }

      // Verificação para novo cadastro
      const isNew = selectedZeladoria.id === 'new';

      if (isNew) {
        // --- CREATE (INSERT) ---
        if (!editSchoolId) {
          throw new Error("Selecione uma escola para vincular o novo processo.");
        }

        // Busca dados da escola para preencher colunas legadas como 'nome' e 'ue' se necessário
        const schoolInfo = schoolList.find(s => s.id === editSchoolId);
        
        const insertPayload = {
          ...payload,
          nome: schoolInfo?.name || "Nova Zeladoria", // Fallback para coluna legada
          // ue: ... se tiver lógica de número de UE, adicione aqui
        };

        const { data: insertedData, error: insertError } = await (supabase
          .from('zeladorias') as any)
          .insert([insertPayload])
          .select()
          .single();

        if (insertError) throw insertError;

        // Atualiza lista local adicionando o novo item
        const newItem = {
          ...insertedData,
          displayName: schoolInfo?.name || insertedData.nome
        };
        setDados(prev => [newItem, ...prev]);
        
        // Adiciona log inicial na timeline
        await (supabase.from('zeladoria_timeline') as any).insert({
          zeladoria_id: insertedData.id,
          previous_status: 'INICIO',
          new_status: editStatus,
          changed_by: userId,
          notes: 'Processo iniciado manualmente pelo administrador'
        });

      } else {
        // --- UPDATE ---
        const { error: updateError } = await (supabase
          .from('zeladorias') as any)
          .update(payload) 
          .eq('id', selectedZeladoria.id);

        if (updateError) throw updateError;

        // Registrar na Timeline se o status mudou
        if (editStatus !== selectedZeladoria.ocupada) {
          await (supabase.from('zeladoria_timeline') as any).insert({
            zeladoria_id: selectedZeladoria.id,
            previous_status: selectedZeladoria.ocupada,
            new_status: editStatus,
            changed_by: userId,
            notes: `Status alterado de ${selectedZeladoria.ocupada} para ${editStatus}`
          });
        }

        // Atualizar estado local
        const newSchoolName = schoolList.find(s => s.id === editSchoolId)?.name;
        setDados(prev => prev.map(item => 
          item.id === selectedZeladoria.id 
            ? { 
                ...item, 
                ...payload,
                displayName: newSchoolName || item.displayName // Atualiza nome se mudou escola
              }
            : item
        ));
      }

      setIsEditModalOpen(false);
      alert(isNew ? "Processo criado com sucesso!" : "Atualizado com sucesso!");

    } catch (err: any) {
      alert("Erro ao salvar: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleExportPDF = async () => {
    setExporting(true);
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 14;

    try {
      doc.setFontSize(12);
      doc.text("Unidade Regional de Ensino Guarulhos Sul", pageWidth / 2, 20, { align: "center" });
      doc.setFontSize(14);
      doc.text("Relatório de Zeladoria", pageWidth / 2, 35, { align: "center" });

      let currentY = 45;

      if (kpiRef.current) {
        const kpiCanvas = await html2canvas(kpiRef.current, { scale: 2 });
        const kpiImg = kpiCanvas.toDataURL('image/png');
        const kpiProps = doc.getImageProperties(kpiImg);
        const kpiHeight = (kpiProps.height * (pageWidth - margin * 2)) / kpiProps.width;
        doc.addImage(kpiImg, 'PNG', margin, currentY, pageWidth - margin * 2, kpiHeight);
        currentY += kpiHeight + 10;
      }

      if (chartsRef.current) {
        if (currentY + 60 > pageHeight) { doc.addPage(); currentY = 20; }
        const chartsCanvas = await html2canvas(chartsRef.current, { scale: 2 });
        const chartsImg = chartsCanvas.toDataURL('image/png');
        const chartsHeight = (doc.getImageProperties(chartsImg).height * (pageWidth - margin * 2)) / doc.getImageProperties(chartsImg).width;
        doc.addImage(chartsImg, 'PNG', margin, currentY, pageWidth - margin * 2, chartsHeight);
        currentY += chartsHeight + 10;
      }

      const tableRows = filteredData.map(item => [
        item.ue || item.id,
        (item as any).displayName,
        item.ocupada,
        item.zelador || '-',
        item.sei_numero || '-',
        item.dare
      ]);

      autoTable(doc, {
        head: [['ID', 'Escola', 'Status', 'Zelador', 'Processo', 'DARE']],
        body: tableRows,
        startY: currentY + 5,
        theme: 'grid',
        styles: { fontSize: 8 },
      });

      doc.save(`Relatorio_Zeladoria.pdf`);
    } catch (err) {
      console.error(err);
      alert("Erro ao gerar PDF.");
    } finally {
      setExporting(false);
    }
  };

  // --- CÁLCULOS ---
  const stats = useMemo(() => {
    const dadosConsiderados = dados.filter(i => {
      const status = i.ocupada ? String(i.ocupada).toUpperCase().trim() : "";
      return status !== "NÃO HABITÁVEL" && status !== "NÃO POSSUI";
    });

    if (!dadosConsiderados || dadosConsiderados.length === 0) {
      return { total: 0, comZeladoria: 0, semZeladoria: 0, ocupacao: "0", pieData: [], barData: [], vencendo: 0, concluidos: 0 };
    }

    const total = dadosConsiderados.length;
    const comZeladoria = dadosConsiderados.filter(i => {
      const s = String(i.ocupada).toUpperCase().trim();
      return !s.includes("VAGO") && s !== "NÃO";
    }).length;
    
    const semZeladoria = total - comZeladoria;
    const ocupacao = total > 0 ? ((comZeladoria / total) * 100).toFixed(0) : "0";
    
    // Novo cálculo: Concluídos
    const concluidos = dadosConsiderados.filter(i => 
      String(i.ocupada).toUpperCase().trim() === "CONCLUIDO"
    ).length;

    const statusCount: Record<string, number> = {};
    dadosConsiderados.forEach(item => {
      const s = item.ocupada || "Indefinido";
      statusCount[s] = (statusCount[s] || 0) + 1;
    });
    
    const pieData = Object.keys(statusCount).map(key => ({
      name: key,
      value: statusCount[key]
    })).sort((a, b) => b.value - a.value);

    const dareCount = { "Isento": 0, "Não Isento": 0 };
    dadosConsiderados.forEach(item => {
      const d = item.dare ? String(item.dare).toUpperCase() : "";
      if ((d.includes("ISENTO") && !d.includes("NÃO")) || d === "SIM") dareCount["Isento"]++;
      else dareCount["Não Isento"]++;
    });
    
    const barData = [
      { name: 'Isento', value: dareCount["Isento"] },
      { name: 'Pendentes', value: dareCount["Não Isento"] }
    ];

    const hoje = new Date();
    const trintaDias = new Date();
    trintaDias.setDate(hoje.getDate() + 30);
    
    const vencendo = dadosConsiderados.filter(item => {
      if (!item.validade) return false;
      const validade = new Date(item.validade);
      if (isNaN(validade.getTime())) return false;
      return validade >= hoje && validade <= trintaDias;
    }).length;

    return { total, comZeladoria, semZeladoria, ocupacao, pieData, barData, vencendo, concluidos };
  }, [dados]);

  const filteredData = dados.filter(item => {
    const term = searchTerm.toLowerCase();
    const nomeEscola = (item as any).displayName ? (item as any).displayName.toLowerCase() : "";
    return nomeEscola.includes(term);
  });

  // ADICIONADO: Tratamento de erro na renderização
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
        
        <main className="flex-1 overflow-y-auto p-6 md:p-8 space-y-6 relative">
          
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
              
              {/* BOTÃO NOVO PROCESSO (Apenas Admin) */}
              {userRole === 'regional_admin' && (
                <button 
                  onClick={handleNewProcesso}
                  className="flex items-center px-4 py-2 bg-emerald-600 text-white rounded-lg shadow-md hover:bg-emerald-700 transition-colors text-sm font-medium"
                >
                  <Plus size={16} className="mr-2" /> Novo Processo
                </button>
              )}

              <button 
                onClick={handleExportPDF}
                disabled={exporting || loading}
                className={`flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg shadow-md hover:bg-blue-700 transition-colors text-sm font-medium ${exporting ? 'opacity-70 cursor-not-allowed' : ''}`}
              >
                {exporting ? <Loader2 size={16} className="mr-2 animate-spin" /> : <Download size={16} className="mr-2" />}
                {exporting ? 'Gerando...' : 'Exportar PDF'}
              </button>
            </div>
          </div>

          {loading && !isEditModalOpen ? (
            <div className="flex items-center justify-center h-64">
              <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
            </div>
          ) : (
            <>
              {/* KPIs */}
              <div ref={kpiRef} className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4 bg-gray-50 p-1">
                <StatCard title="Unidades Habitáveis" value={stats.total} subtext="Escolas c/ Zeladoria" icon={School} />
                <StatCard title="Ocupação" value={`${stats.ocupacao}%`} subtext={`${stats.comZeladoria} ativas`} icon={CheckCircle} trendUp={true} />
                <StatCard title="Vagas Disponíveis" value={stats.semZeladoria} subtext="Unidades vagas" icon={AlertCircle} trendUp={false} />
                <StatCard title="Concluídos" value={stats.concluidos} subtext="Processos Finalizados" icon={Flag} colorClass="bg-emerald-50 text-emerald-600" />
                <StatCard title="Vencimentos" value={stats.vencendo} subtext="Vencem em 30 dias" icon={Clock} />
              </div>

              {/* Gráficos */}
              <div ref={chartsRef} className="grid grid-cols-1 lg:grid-cols-3 gap-6 bg-gray-50 p-1">
                <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 col-span-1 lg:col-span-2">
                  <h3 className="text-lg font-bold text-gray-800 mb-4">Status dos Processos (Habitáveis)</h3>
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={stats.pieData} layout="vertical" margin={{ top: 5, right: 30, left: 40, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} />
                        <XAxis type="number" hide />
                        <YAxis dataKey="name" type="category" width={120} tick={{fontSize: 10}} interval={0} />
                        <Tooltip />
                        <Bar dataKey="value" radius={[0, 4, 4, 0]} barSize={20}>
                          {stats.pieData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={STATUS_COLORS[entry.name] || COLORS.secondary} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
                <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                  <h3 className="text-lg font-bold text-gray-800 mb-4">Situação DARE</h3>
                  <div className="h-64 flex items-center justify-center">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={stats.barData} cx="50%" cy="50%" innerRadius={60} outerRadius={80} paddingAngle={5} dataKey="value">
                          <Cell fill={COLORS.success} />
                          <Cell fill={COLORS.danger} />
                        </Pie>
                        <Tooltip />
                        <Legend verticalAlign="bottom" height={36}/>
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>

              {/* Tabela */}
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
                        <th className="px-6 py-4">ID / Escola</th>
                        <th className="px-6 py-4">Status</th>
                        <th className="px-6 py-4">Zelador (Ocupante)</th>
                        <th className="px-6 py-4">Processo SEI</th>
                        <th className="px-6 py-4">DARE</th>
                        <th className="px-6 py-4 text-center">Ações</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {filteredData.map((item) => (
                        <tr key={item.id} className="hover:bg-blue-50/50 transition-colors group">
                          <td className="px-6 py-4">
                            <div className="flex items-center">
                              <div className="w-10 h-8 rounded bg-blue-100 text-blue-600 flex items-center justify-center font-bold text-xs mr-3 shrink-0">
                                {item.id ? String(item.id) : '#'}
                              </div>
                              <span className="font-medium text-gray-900 line-clamp-2">{(item as any).displayName}</span>
                            </div>
                          </td>
                          <td className="px-6 py-4"><StatusBadge status={item.ocupada} /></td>
                          <td className="px-6 py-4">
                            <p className="text-sm font-medium text-gray-800 line-clamp-1">{item.zelador || "-"}</p>
                            {item.rg && <p className="text-xs text-gray-400 mt-0.5">RG: {item.rg}</p>}
                          </td>
                          <td className="px-6 py-4">
                            <span className="text-sm text-gray-600 font-mono bg-gray-100 px-2 py-0.5 rounded w-fit">{item.sei_numero || "-"}</span>
                          </td>
                          <td className="px-6 py-4"><StatusBadge status={item.dare} /></td>
                          <td className="px-6 py-4 text-center">
                            {userRole === 'regional_admin' && (
                              <button 
                                onClick={() => handleEditClick(item)}
                                className="text-gray-400 hover:text-blue-600 p-2 rounded-full hover:bg-blue-100 transition-colors"
                                title="Editar Processo"
                              >
                                <Edit size={18} />
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}

          {/* MODAL DE EDIÇÃO E HISTÓRICO */}
          {isEditModalOpen && selectedZeladoria && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
              <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
                {/* Header Modal */}
                <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-blue-100 text-blue-600 rounded-lg"><FileText size={20} /></div>
                    <div>
                      <h2 className="text-lg font-bold text-gray-800">
                        {selectedZeladoria.id === 'new' ? 'Novo Processo' : 'Gerenciar Processo'}
                      </h2>
                      <p className="text-xs text-gray-500">{(selectedZeladoria as any).displayName}</p>
                    </div>
                  </div>
                  <button onClick={() => setIsEditModalOpen(false)} className="text-gray-400 hover:text-gray-600 p-1 hover:bg-gray-200 rounded-full">
                    <X size={20} />
                  </button>
                </div>

                <div className="flex-1 overflow-y-auto p-6 grid grid-cols-1 md:grid-cols-3 gap-6">
                  
                  {/* Coluna 1: Formulário de Edição */}
                  <div className="md:col-span-2 space-y-6">
                    {/* Linha do Tempo Visual (Fases) */}
                    <div className="bg-blue-50/50 p-4 rounded-xl border border-blue-100">
                      <h4 className="text-sm font-bold text-blue-900 mb-4 flex items-center gap-2">
                        <CheckCircle size={16} /> Fases do Processo
                      </h4>
                      <div className="flex flex-wrap gap-2">
                        {FASES_PROCESSO.map((fase, idx) => {
                          const isCompleted = FASES_PROCESSO.indexOf(editStatus) >= idx || editStatus === "CONCLUIDO";
                          const isCurrent = editStatus === fase;
                          
                          return (
                            <div key={idx} className={`flex items-center ${idx < FASES_PROCESSO.length - 1 ? 'flex-1' : ''}`}>
                              <div 
                                className={`flex items-center px-3 py-1.5 rounded-full text-xs font-medium border transition-all cursor-pointer
                                  ${isCurrent ? 'bg-blue-600 text-white border-blue-600 shadow-md ring-2 ring-blue-200' : 
                                    isCompleted ? 'bg-green-100 text-green-700 border-green-200' : 
                                    'bg-white text-gray-400 border-gray-200 hover:border-blue-300'
                                  }`}
                                onClick={() => setEditStatus(fase)}
                              >
                                {idx + 1}. {fase}
                              </div>
                              {idx < FASES_PROCESSO.length - 1 && (
                                <div className={`h-0.5 flex-1 mx-1 ${isCompleted ? 'bg-green-200' : 'bg-gray-200'}`}></div>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {/* CAMPO DE SELEÇÃO DE ESCOLA (APENAS ADMIN) */}
                      {userRole === 'regional_admin' && (
                        <div className="md:col-span-2">
                          <label className="block text-xs font-semibold text-gray-600 mb-1">
                            Escola Vinculada (Vínculo) {selectedZeladoria.id === 'new' && <span className="text-red-500">*</span>}
                          </label>
                          <select
                            value={editSchoolId}
                            onChange={(e) => setEditSchoolId(e.target.value)}
                            className="w-full p-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none bg-white"
                          >
                            <option value="">Selecione uma escola...</option>
                            {schoolList.map(school => (
                              <option key={school.id} value={school.id}>
                                {school.name}
                              </option>
                            ))}
                          </select>
                          <p className="text-xs text-gray-400 mt-1">
                            {selectedZeladoria.id === 'new' 
                              ? 'Selecione a escola para este novo processo.' 
                              : 'Alterar isso vinculará este processo a outra unidade.'}
                          </p>
                        </div>
                      )}

                      <div>
                        <label className="block text-xs font-semibold text-gray-600 mb-1">Status Atual</label>
                        <select 
                          value={editStatus} 
                          onChange={(e) => setEditStatus(e.target.value)}
                          className="w-full p-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                        >
                          <option value="">Selecione...</option>
                          {Object.keys(STATUS_COLORS).map(s => <option key={s} value={s}>{s}</option>)}
                          {FASES_PROCESSO.map(f => !Object.keys(STATUS_COLORS).includes(f) && <option key={f} value={f}>{f}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-gray-600 mb-1">Processo SEI</label>
                        <input 
                          type="text" 
                          value={editProcesso}
                          onChange={(e) => setEditProcesso(e.target.value)}
                          className="w-full p-2 border border-gray-300 rounded-lg text-sm"
                        />
                      </div>
                      <div className="md:col-span-2">
                        <label className="block text-xs font-semibold text-gray-600 mb-1">Nome do Zelador</label>
                        <input 
                          type="text" 
                          value={editZelador}
                          onChange={(e) => setEditZelador(e.target.value)}
                          className="w-full p-2 border border-gray-300 rounded-lg text-sm"
                        />
                      </div>
                      <div className="md:col-span-2">
                        <label className="block text-xs font-semibold text-gray-600 mb-1">Observações (SEFISC)</label>
                        <textarea 
                          rows={3}
                          value={editObs}
                          onChange={(e) => setEditObs(e.target.value)}
                          className="w-full p-2 border border-gray-300 rounded-lg text-sm resize-none"
                          placeholder="Adicione notas sobre o andamento..."
                        />
                      </div>
                    </div>
                  </div>

                  {/* Coluna 2: Histórico (Timeline) */}
                  <div className="bg-gray-50 rounded-xl p-4 border border-gray-200 flex flex-col h-full">
                    <h4 className="text-sm font-bold text-gray-700 mb-4 flex items-center gap-2">
                      <History size={16} /> Histórico de Alterações
                    </h4>
                    
                    <div className="flex-1 overflow-y-auto space-y-4 pr-1">
                      {loadingTimeline ? (
                        <div className="text-center py-4 text-gray-400"><Loader2 size={20} className="animate-spin mx-auto"/></div>
                      ) : timeline.length === 0 ? (
                        <p className="text-xs text-gray-400 text-center italic py-4">
                          {selectedZeladoria.id === 'new' ? 'Novo registro - sem histórico.' : 'Nenhum histórico registrado.'}
                        </p>
                      ) : (
                        timeline.map((log) => (
                          <div key={log.id} className="relative pl-4 border-l-2 border-gray-200 pb-2 last:pb-0">
                            <div className="absolute -left-[5px] top-0 w-2.5 h-2.5 bg-gray-400 rounded-full border-2 border-white"></div>
                            <p className="text-xs text-gray-400 mb-0.5">
                              {new Date(log.changed_at).toLocaleString('pt-BR')}
                            </p>
                            <div className="text-xs text-gray-800">
                              <span className="font-semibold block">{log.new_status}</span>
                              {log.notes && <span className="text-gray-500 italic block mt-1">"{log.notes}"</span>}
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>

                {/* Footer Modal */}
                <div className="px-6 py-4 border-t border-gray-100 bg-gray-50 flex justify-between gap-3">
                  {/* BOTÃO EXCLUIR: Apenas Admin e se não for um processo novo */}
                  {userRole === 'regional_admin' && selectedZeladoria.id !== 'new' ? (
                    <button 
                      onClick={handleDeleteProcesso}
                      className="px-4 py-2 text-sm text-red-600 hover:bg-red-50 rounded-lg font-medium flex items-center gap-2 transition-colors border border-transparent hover:border-red-100"
                    >
                      <Trash2 size={16} />
                      Excluir Processo
                    </button>
                  ) : (
                    <div></div> // Espaçador para manter alinhamento
                  )}

                  <div className="flex gap-3">
                    <button 
                      onClick={() => setIsEditModalOpen(false)}
                      className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-200 rounded-lg font-medium"
                    >
                      Cancelar
                    </button>
                    <button 
                      onClick={handleSaveZeladoria}
                      disabled={loading}
                      className="px-4 py-2 text-sm bg-blue-600 text-white hover:bg-blue-700 rounded-lg font-medium flex items-center gap-2 shadow-sm"
                    >
                      {loading ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                      {selectedZeladoria.id === 'new' ? 'Criar Processo' : 'Salvar Alterações'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
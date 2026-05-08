import { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import {
  Plus, Search, Edit, Trash2, FileText,
  Calendar,
  X, Save, Building2,
  ShieldAlert, Loader2,
  History, ArrowRight, FileDown,
  BarChart3, PieChart as PieIcon,
  CheckSquare, UserPlus, ShieldCheck,
  ChevronRight, Filter, MessageSquare
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip,
  ResponsiveContainer, Cell, PieChart, Pie, Legend, LabelList
} from 'recharts';

const ETAPAS_PROCESSO = [
  "1 - RECEBIDO NO SEI",
  "2 - ANÁLISE SEFISC",
  "2.1 - DEVOLUÇÃO PARA ESCOLA",
  "3 - RELATÓRIO FOTOGRÁFICO",
  "4 - VISTORIA SEOM",
  "5 - CECIG - PGE",
  "6 - CIÊNCIA DO OCUPANTE",
  "7 - TERMO DE COMPROMISSO",
  "8 - APROVAÇÃO DIRIGENTE",
  "9 - DPAT-SEDUC",
  "10 - CASA CIVIL",
  "CONCLUÍDO"
];

interface Zeladoria {
  id: string | number;
  ue: string | number;
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
  valor_imovel: number | null;
  imovel_1_porcento: number | null;
  salario_10_porcento: number | null;
  school_id: string | null;
  admin_notes?: string;
  status_updated_at?: string;
  created_at?: string;
}

interface TimelineEntry {
  id: string;
  zeladoria_id: string | number;
  previous_status: string;
  new_status: string;
  changed_at: string;
  changed_by: string;
  notes: string;
}

interface School {
  id: string;
  name: string;
}

const shortStageName = (etapa: string) => etapa.replace(/^\d+\.?\d*\s*-\s*/, '');

export function Zeladoria() {
  const [data, setData] = useState<Zeladoria[]>([]);
  const [schools, setSchools] = useState<School[]>([]);
  const [loading, setLoading] = useState(true);
  const [userRole, setUserRole] = useState<string>('');
  const [userSchoolId, setUserSchoolId] = useState<string | null>(null);
  const [userId, setUserId] = useState<string>('');
  const [searchTerm, setSearchTerm] = useState('');
  const [exporting, setExporting] = useState(false);
  const [activeTab, setActiveTab] = useState<string>('TODOS');
  const [advancingId, setAdvancingId] = useState<string | number | null>(null);

  // Modais
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<Zeladoria | null>(null);
  const [historyData, setHistoryData] = useState<TimelineEntry[]>([]);
  const [saveLoading, setSaveLoading] = useState(false);

  // Formulário
  const [formData, setFormData] = useState<Partial<Zeladoria>>({
    ocupada: ETAPAS_PROCESSO[0],
    perto_de_vencer: 'OK',
    valor_imovel: 0
  });

  useEffect(() => {
    fetchInitialData();
  }, []);

  async function fetchInitialData() {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      let currentRole = '';
      let currentSchoolId = null;

      if (user) {
        setUserId(user.id);
        const { data: profile } = await (supabase as any).from('profiles').select('role, school_id').eq('id', user.id).single();
        currentRole = profile?.role || '';
        currentSchoolId = profile?.school_id || null;
        setUserRole(currentRole);
        setUserSchoolId(currentSchoolId);
      }

      const { data: zeladorias } = await (supabase as any).from('zeladorias').select('*').order('nome');
      const { data: schoolsData } = await (supabase as any).from('schools').select('id, name').order('name');

      let filteredZeladorias = zeladorias || [];
      if (currentRole === 'school_manager' && currentSchoolId) {
        filteredZeladorias = filteredZeladorias.filter((z: Zeladoria) => z.school_id === currentSchoolId);
      }

      setData(filteredZeladorias);
      setSchools(schoolsData || []);
    } catch (error) {
      console.error('Erro ao carregar dados:', error);
    } finally {
      setLoading(false);
    }
  }

  const activeData = useMemo(() => {
    return data.filter(z =>
      z.ocupada !== "NÃO POSSUI" &&
      z.ocupada !== "NÃO HABITÁVEL" &&
      z.ocupada !== "NÃO HABITAVEL"
    );
  }, [data]);

  const sortedAndFilteredData = useMemo(() => {
    let result = data.filter(item =>
      (activeTab === 'TODOS' || item.ocupada === activeTab) &&
      (item.nome?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.zelador?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.sei_numero?.includes(searchTerm))
    );

    return result.sort((a, b) => {
      const stepA = ETAPAS_PROCESSO.indexOf(a.ocupada);
      const stepB = ETAPAS_PROCESSO.indexOf(b.ocupada);
      if (stepA !== stepB) return stepA - stepB;
      const timeA = new Date(a.status_updated_at || a.created_at || 0).getTime();
      const timeB = new Date(b.status_updated_at || b.created_at || 0).getTime();
      return timeA - timeB;
    });
  }, [data, searchTerm, activeTab]);

  const stats = useMemo(() => {
    const concluidos = activeData.filter(z => z.ocupada === "CONCLUÍDO").length;
    const vagas = activeData.filter(z =>
      z.zelador?.toUpperCase().includes('DISPONIVEL') ||
      z.zelador?.toUpperCase().includes('DISPONÍVEL') ||
      !z.zelador || z.zelador.trim() === ""
    ).length;
    return { totalValidas: activeData.length, concluidos, vagas };
  }, [activeData]);

  const statusChartData = useMemo(() => {
    return ETAPAS_PROCESSO.map(etapa => ({
      name: etapa,
      quantidade: activeData.filter(z => z.ocupada === etapa).length
    }));
  }, [activeData]);

  const dareChartData = useMemo(() => {
    const isentos = activeData.filter(z => z.dare?.toLowerCase().includes('isento')).length;
    const pagantes = activeData.filter(z => z.dare && !z.dare.toLowerCase().includes('isento')).length;
    return [
      { name: 'Isentas', value: isentos, color: '#10b981' },
      { name: 'Não Isentas', value: pagantes, color: '#3b82f6' }
    ];
  }, [activeData]);

  const handleExportPDF = async () => {
    setExporting(true);
    try {
      const loadScript = (src: string) => {
        return new Promise((resolve, reject) => {
          if (document.querySelector(`script[src="${src}"]`)) return resolve(true);
          const script = document.createElement('script');
          script.src = src;
          script.onload = resolve;
          script.onerror = reject;
          document.head.appendChild(script);
        });
      };
      await loadScript('https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js');
      const element = document.getElementById('zeladoria-report-template');
      if (!element) throw new Error("Template de relatório não encontrado.");
      element.style.display = 'block';
      const opt = {
        margin: [10, 10, 10, 10],
        filename: `Resumo_Estatistico_Zeladoria_${new Date().toLocaleDateString('pt-BR').replace(/\//g, '_')}.pdf`,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true, letterRendering: true, width: 1120 },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'landscape' },
        pagebreak: { mode: ['css', 'legacy'] }
      };
      await (window as any).html2pdf().set(opt).from(element).save();
      element.style.display = 'none';
      setExporting(false);
    } catch (err) {
      console.error(err);
      alert("Houve um erro ao gerar o PDF. Tente novamente.");
      setExporting(false);
    }
  };

  function handleOpenModal(item: Zeladoria | null = null) {
    if (item) {
      setEditingItem(item);
      setFormData(item);
    } else {
      setEditingItem(null);
      setFormData({
        ocupada: ETAPAS_PROCESSO[0],
        perto_de_vencer: 'OK',
        valor_imovel: 0,
        school_id: userRole === 'school_manager' ? userSchoolId : ''
      });
    }
    setIsModalOpen(true);
  }

  async function fetchHistory(zeladoriaId: string | number) {
    setIsHistoryModalOpen(true);
    setLoading(true);
    try {
      const { data: history } = await (supabase as any)
        .from('zeladoria_timeline')
        .select('*')
        .eq('zeladoria_id', zeladoriaId)
        .order('changed_at', { ascending: false });
      setHistoryData(history || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  async function handleAdvanceStage(item: Zeladoria) {
    if (userRole !== 'regional_admin') return;
    const currentIndex = ETAPAS_PROCESSO.indexOf(item.ocupada);
    if (currentIndex < 0 || currentIndex >= ETAPAS_PROCESSO.length - 1) return;
    const nextStage = ETAPAS_PROCESSO[currentIndex + 1];
    const now = new Date().toISOString();
    setAdvancingId(item.id);
    try {
      const { error } = await (supabase as any)
        .from('zeladorias')
        .update({ ocupada: nextStage, status_updated_at: now })
        .eq('id', item.id);
      if (error) throw error;
      await (supabase as any).from('zeladoria_timeline').insert([{
        zeladoria_id: item.id,
        previous_status: item.ocupada,
        new_status: nextStage,
        changed_by: userId,
        notes: `Processo avançou para a etapa: ${nextStage}`,
        changed_at: now
      }]);
      fetchInitialData();
    } catch (error: any) {
      alert('Erro ao avançar etapa: ' + error.message);
    } finally {
      setAdvancingId(null);
    }
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (userRole !== 'regional_admin') return;
    setSaveLoading(true);
    try {
      if (editingItem) {
        const mudouEtapa = editingItem.ocupada !== formData.ocupada;
        const dataParaSalvar = {
          ...formData,
          status_updated_at: mudouEtapa ? new Date().toISOString() : editingItem.status_updated_at
        };
        const { error } = await (supabase as any).from('zeladorias').update(dataParaSalvar).eq('id', editingItem.id);
        if (error) throw error;
        if (mudouEtapa) {
          await (supabase as any).from('zeladoria_timeline').insert([{
            zeladoria_id: editingItem.id,
            previous_status: editingItem.ocupada,
            new_status: formData.ocupada,
            changed_by: userId,
            notes: `Processo avançou para a etapa: ${formData.ocupada}`,
            changed_at: new Date().toISOString()
          }]);
        }
      } else {
        const { error } = await (supabase as any).from('zeladorias').insert([{
          ...formData,
          status_updated_at: new Date().toISOString()
        }]);
        if (error) throw error;
      }
      setIsModalOpen(false);
      fetchInitialData();
    } catch (error: any) {
      alert('Erro ao guardar: ' + error.message);
    } finally {
      setSaveLoading(false);
    }
  }

  async function handleDelete(id: string | number) {
    if (userRole !== 'regional_admin') return;
    if (!confirm('Eliminar permanentemente este registo?')) return;
    try {
      await (supabase as any).from('zeladoria_timeline').delete().eq('zeladoria_id', id);
      const { error } = await (supabase as any).from('zeladorias').delete().eq('id', id);
      if (error) throw error;
      fetchInitialData();
    } catch (error) {
      alert('Erro ao eliminar registo.');
    }
  }

  const getStepIndex = (etapa: string) => ETAPAS_PROCESSO.indexOf(etapa) + 1;

  return (
    <div className="space-y-6 pb-20 relative">

      {/* Template Oculto para PDF */}
      <div id="zeladoria-report-template" style={{ display: 'none', background: 'white', width: '1080px', padding: '40px' }}>
          {/* ... (O conteúdo do PDF continua inalterado) ... */}
          <div style={{ borderBottom: '6px solid #2563eb', paddingBottom: '20px', marginBottom: '30px' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <tbody>
                    <tr>
                        <td style={{ border: 'none' }}>
                            <h1 style={{ margin: 0, fontSize: '28px', fontWeight: 900, color: '#0f172a' }}>RELATÓRIO ESTATÍSTICO: GESTÃO DE ZELADORIAS</h1>
                            <p style={{ margin: 0, fontSize: '11px', color: '#64748b', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '2px' }}>CONSOLIDADO REGIONAL DE INDICADORES E OCUPAÇÃO</p>
                        </td>
                        <td style={{ border: 'none', textAlign: 'right' }}>
                            <p style={{ margin: 0, fontWeight: 900, fontSize: '14px', color: '#1e293b' }}>{new Date().toLocaleDateString('pt-BR')}</p>
                            <p style={{ margin: 0, fontSize: '9px', color: '#94a3b8', fontWeight: 800 }}>SGE-GSU INTELLIGENCE</p>
                        </td>
                    </tr>
                  </tbody>
              </table>
          </div>
          {/* ... */}
      </div>

      {/* CABEÇALHO */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-blue-600 rounded-2xl text-white shadow-lg shadow-blue-100"><ShieldCheck size={24}/></div>
          <div>
            <h1 className="text-2xl font-black text-slate-900 tracking-tight uppercase">Zeladoria e Ocupação</h1>
            <p className="text-slate-500 text-sm font-medium">Controle de fluxos e autorizações administrativas.</p>
          </div>
        </div>
        <div className="flex gap-3">
          {userRole === 'regional_admin' && (
            <>
              <button
                onClick={handleExportPDF}
                disabled={exporting}
                className="bg-slate-900 text-white px-5 py-2.5 rounded-xl font-bold flex items-center justify-center gap-2 shadow-lg hover:bg-slate-800 transition-all active:scale-95 disabled:opacity-50"
              >
                {exporting ? <Loader2 className="animate-spin" size={18}/> : <FileDown size={18} />}
                {exporting ? 'GERANDO PDF...' : 'RESUMO P/ CHEFIA (PDF)'}
              </button>
              <button
                onClick={() => handleOpenModal()}
                className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-xl font-bold flex items-center gap-2 shadow-lg shadow-blue-100 transition-all active:scale-95"
              >
                <Plus size={18} /> Novo Processo
              </button>
            </>
          )}
        </div>
      </div>

      {/* CARDS DE INDICADORES */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-xl shadow-slate-200/50 flex items-center gap-4 transition-all hover:scale-[1.02]">
          <div className="p-4 bg-blue-50 text-blue-600 rounded-2xl"><Building2 size={24} /></div>
          <div>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Zeladorias Ativas</p>
            <h3 className="text-2xl font-black text-slate-800">{stats.totalValidas} <span className="text-xs text-slate-400 font-bold uppercase">Escolas</span></h3>
          </div>
        </div>
        <div className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-xl shadow-slate-200/50 flex items-center gap-4 transition-all hover:scale-[1.02]">
          <div className="p-4 bg-emerald-50 text-emerald-600 rounded-2xl"><CheckSquare size={24} /></div>
          <div>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Processos Concluídos</p>
            <h3 className="text-2xl font-black text-slate-800">{stats.concluidos} <span className="text-xs text-slate-400 font-bold uppercase">Casos</span></h3>
          </div>
        </div>
        <div className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-xl shadow-slate-200/50 flex items-center gap-4 transition-all hover:scale-[1.02]">
          <div className="p-4 bg-amber-50 text-amber-600 rounded-2xl"><UserPlus size={24} /></div>
          <div>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Vagas Disponíveis</p>
            <h3 className="text-2xl font-black text-slate-800">{stats.vagas} <span className="text-xs text-slate-400 font-bold uppercase">Abertas</span></h3>
          </div>
        </div>
      </div>

      {/* GRÁFICOS ANALÍTICOS */}
      {userRole === 'regional_admin' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-xl shadow-slate-200/40">
            <h3 className="text-sm font-black text-slate-800 uppercase tracking-tight mb-8 flex items-center gap-2">
              <BarChart3 size={18} className="text-blue-600" /> Distribuição por Etapas do Fluxo
            </h3>
            <div className="h-[350px] w-full mt-4">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={statusChartData} layout="vertical" margin={{ top: 5, right: 30, left: 10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="#f1f5f9" />
                  <XAxis type="number" hide />
                  <YAxis dataKey="name" type="category" axisLine={false} tickLine={false} tick={{fontSize: 9, fontWeight: 800, fill: '#64748b'}} width={160} />
                  <RechartsTooltip cursor={{fill: '#f8fafc'}} contentStyle={{borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px rgba(0,0,0,0.1)'}} />
                  <Bar dataKey="quantidade" radius={[0, 6, 6, 0]} barSize={16}>
                    {statusChartData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.name === "CONCLUÍDO" ? '#10b981' : '#3b82f6'} />
                    ))}
                    <LabelList dataKey="quantidade" position="right" style={{ fontSize: '11px', fontWeight: 900, fill: '#334155' }} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
          <div className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-xl shadow-slate-200/40">
            <h3 className="text-sm font-black text-slate-800 uppercase tracking-tight mb-8 flex items-center gap-2">
              <PieIcon size={18} className="text-emerald-600" /> Relação de Pagamentos DARE
            </h3>
            <div className="h-[250px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={dareChartData} innerRadius={60} outerRadius={80} paddingAngle={5} dataKey="value">
                    {dareChartData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <RechartsTooltip />
                  <Legend iconType="circle" wrapperStyle={{fontSize: '11px', fontWeight: 700, paddingTop: '20px'}} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}

      {/* PIPELINE STEPPER + BUSCA */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="px-4 pt-4 pb-0">
          <div className="flex items-center gap-2 mb-3">
            <Filter size={13} className="text-slate-400" />
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Pipeline de Fases</span>
          </div>
          <div className="overflow-x-auto custom-scrollbar pb-3">
            <div className="flex items-center gap-1 min-w-max">

              {/* Botão TODOS */}
              <button
                onClick={() => setActiveTab('TODOS')}
                className={`flex flex-col items-center justify-between px-3 py-2.5 rounded-xl transition-all min-w-[72px] h-[72px] border ${
                  activeTab === 'TODOS'
                    ? 'bg-slate-900 border-slate-900 text-white shadow-md'
                    : 'bg-slate-50 border-slate-100 text-slate-500 hover:bg-slate-100'
                }`}
              >
                <span className={`text-[8px] font-black uppercase tracking-widest ${activeTab === 'TODOS' ? 'text-slate-300' : 'text-slate-400'}`}>Todos</span>
                <span className={`text-2xl font-black leading-none ${activeTab === 'TODOS' ? 'text-white' : 'text-slate-700'}`}>{activeData.length}</span>
                <span className={`text-[7px] font-bold uppercase ${activeTab === 'TODOS' ? 'text-slate-400' : 'text-slate-300'}`}>processos</span>
              </button>

              {ETAPAS_PROCESSO.map((etapa, idx) => {
                const count = activeData.filter(z => z.ocupada === etapa).length;
                const isActive = activeTab === etapa;
                const isConcluido = etapa === "CONCLUÍDO";
                const label = shortStageName(etapa);
                return (
                  <div key={etapa} className="flex items-center gap-1">
                    <ChevronRight size={10} className="text-slate-200 flex-shrink-0" />
                    <button
                      onClick={() => setActiveTab(etapa)}
                      title={etapa}
                      className={`flex flex-col items-center justify-between px-3 py-2.5 rounded-xl transition-all min-w-[80px] max-w-[80px] h-[72px] border ${
                        isActive
                          ? isConcluido
                            ? 'bg-emerald-600 border-emerald-600 text-white shadow-md shadow-emerald-200'
                            : 'bg-blue-600 border-blue-600 text-white shadow-md shadow-blue-200'
                          : count > 0
                            ? 'bg-slate-50 border-slate-100 text-slate-600 hover:bg-slate-100'
                            : 'bg-slate-50 border-slate-100 text-slate-300 opacity-60'
                      }`}
                    >
                      <span className={`text-[8px] font-black ${isActive ? 'text-white/60' : 'text-slate-400'}`}>{idx + 1}</span>
                      <span className={`text-[8px] font-black uppercase text-center leading-tight w-full line-clamp-2`}>{label}</span>
                      <span className={`text-sm font-black leading-none ${isActive ? 'text-white' : count > 0 ? 'text-slate-700' : 'text-slate-300'}`}>{count}</span>
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Busca */}
        <div className="relative px-4 py-3 border-t border-slate-50">
          <Search className="absolute left-7 top-1/2 -translate-y-1/2 text-slate-400" size={15} />
          <input
            type="text"
            placeholder="Buscar por escola, zelador ou número SEI..."
            className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium text-sm transition-all"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      {/* CONTADOR DE RESULTADOS */}
      <div className="flex items-center justify-between px-1">
        <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">
          {sortedAndFilteredData.length} processo(s){activeTab !== 'TODOS' ? ' nesta fase' : ''}
          {searchTerm ? ` · "${searchTerm}"` : ''}
        </p>
      </div>

      {/* CARDS GRID */}
      {loading && data.length === 0 ? (
        <div className="flex items-center justify-center py-24 gap-3 text-slate-400">
          <Loader2 className="animate-spin text-blue-600" size={24}/>
          <span className="font-bold uppercase text-sm tracking-widest">Sincronizando dados...</span>
        </div>
      ) : sortedAndFilteredData.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 gap-3">
          <ShieldCheck size={36} className="text-slate-200" />
          <span className="font-bold uppercase text-sm tracking-widest text-slate-400">Nenhum processo encontrado nesta fase.</span>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {sortedAndFilteredData.map((item) => {
            const step = getStepIndex(item.ocupada);
            const isConcluido = item.ocupada === "CONCLUÍDO";
            const isDisponivel = !item.zelador || item.zelador.trim() === '' ||
              item.zelador.toUpperCase().includes('DISPONIVEL') ||
              item.zelador.toUpperCase().includes('DISPONÍVEL');
            const entryDate = new Date(item.status_updated_at || item.created_at || Date.now());
            const diasNaFase = Math.floor((Date.now() - entryDate.getTime()) / (1000 * 60 * 60 * 24));
            const currentIndex = ETAPAS_PROCESSO.indexOf(item.ocupada);
            const hasNextStep = currentIndex >= 0 && currentIndex < ETAPAS_PROCESSO.length - 1;
            const nextStep = hasNextStep ? ETAPAS_PROCESSO[currentIndex + 1] : null;

            return (
              <div
                key={item.id}
                className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 flex flex-col gap-4 hover:shadow-md hover:border-blue-100 transition-all"
              >
                {/* Topo: nome + badge de etapa */}
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    {item.ue && (
                      <span className="text-[9px] font-black text-slate-400 uppercase">UE {item.ue}</span>
                    )}
                    <p className="font-black text-slate-900 text-xs uppercase leading-tight truncate mt-0.5">{item.nome}</p>
                    <p className="font-mono text-[10px] text-slate-400 mt-1 flex items-center gap-1">
                      <FileText size={10} /> {item.sei_numero || 'SEI não informado'}
                    </p>
                  </div>
                  <span className={`px-2.5 py-1.5 rounded-xl text-[9px] font-black uppercase text-center flex-shrink-0 leading-tight max-w-[88px] ${
                    isConcluido
                      ? 'bg-emerald-50 text-emerald-700 border border-emerald-100'
                      : 'bg-blue-50 text-blue-700 border border-blue-100'
                  }`}>
                    {shortStageName(item.ocupada)}
                  </span>
                </div>

                {/* Barra de progresso */}
                <div>
                  <div className="flex justify-between text-[9px] font-bold text-slate-400 mb-1.5">
                    <span>Progresso do fluxo</span>
                    <span className={`font-black ${isConcluido ? 'text-emerald-600' : 'text-blue-600'}`}>{step}/12</span>
                  </div>
                  <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden flex gap-px">
                    {Array.from({length: 12}).map((_, i) => (
                      <div
                        key={i}
                        className={`flex-1 h-full ${i < step ? (isConcluido ? 'bg-emerald-500' : 'bg-blue-500') : 'bg-slate-100'}`}
                      />
                    ))}
                  </div>
                </div>

                {/* Zelador */}
                <div className="flex items-center gap-2.5">
                  <div className={`w-7 h-7 rounded-xl flex items-center justify-center flex-shrink-0 ${isDisponivel ? 'bg-amber-50' : 'bg-slate-50'}`}>
                    <UserPlus size={13} className={isDisponivel ? 'text-amber-500' : 'text-slate-400'} />
                  </div>
                  <div>
                    <p className="text-[9px] font-bold text-slate-400 uppercase leading-none mb-0.5">Responsável</p>
                    <p className={`text-xs font-bold leading-tight ${isDisponivel ? 'text-amber-600' : 'text-slate-700'}`}>
                      {isDisponivel ? 'Vaga Disponível' : item.zelador}
                    </p>
                  </div>
                </div>

                {/* Nota interna (somente regional_admin) */}
                {userRole === 'regional_admin' && item.admin_notes && (
                  <div className="bg-amber-50 border border-amber-100 rounded-xl p-3 flex items-start gap-2">
                    <MessageSquare size={12} className="text-amber-400 mt-0.5 flex-shrink-0" />
                    <p className="text-[10px] text-amber-800 font-medium leading-snug">{item.admin_notes}</p>
                  </div>
                )}

                {/* Rodapé: tempo + ações */}
                <div className="flex items-center justify-between pt-3 border-t border-slate-50 gap-2 mt-auto">
                  <div>
                    {isConcluido ? (
                      <span className="text-[9px] text-emerald-600 font-bold flex items-center gap-1">
                        ✓ Processo Concluído
                      </span>
                    ) : (
                      <span className="text-[9px] text-slate-400 font-bold flex items-center gap-1">
                        <Calendar size={10} />
                        {diasNaFase === 0 ? 'Entrou hoje' : `${diasNaFase} dia(s) nesta etapa`}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => fetchHistory(item.id)}
                      className="p-2 hover:bg-blue-50 text-slate-400 hover:text-blue-600 rounded-lg transition-colors"
                      title="Ver Histórico"
                    >
                      <History size={14}/>
                    </button>
                    {userRole === 'regional_admin' && (
                      <>
                        <button
                          onClick={() => handleOpenModal(item)}
                          className="p-2 hover:bg-amber-50 text-slate-400 hover:text-amber-600 rounded-lg transition-colors"
                          title="Editar dados"
                        >
                          <Edit size={14}/>
                        </button>
                        <button
                          onClick={() => handleDelete(item.id)}
                          className="p-2 hover:bg-red-50 text-slate-400 hover:text-red-600 rounded-lg transition-colors"
                          title="Excluir"
                        >
                          <Trash2 size={14}/>
                        </button>
                        {!isConcluido && nextStep && (
                          <button
                            onClick={() => handleAdvanceStage(item)}
                            disabled={advancingId === item.id}
                            title={`Avançar para: ${nextStep}`}
                            className="flex items-center gap-1.5 px-3 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-xl text-[10px] font-black uppercase transition-all active:scale-95 shadow-sm shadow-blue-200"
                          >
                            {advancingId === item.id
                              ? <Loader2 size={12} className="animate-spin" />
                              : <ArrowRight size={12}/>
                            }
                            Avançar
                          </button>
                        )}
                      </>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* MODAL DE EDIÇÃO */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-white rounded-[2.5rem] w-full max-w-2xl max-h-[95vh] flex flex-col shadow-2xl animate-in zoom-in-95 duration-300 overflow-hidden border border-slate-100">
            <div className="p-8 border-b border-slate-100 flex justify-between items-center bg-white">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-blue-600 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-blue-200">
                  <ShieldAlert size={24}/>
                </div>
                <div>
                  <h2 className="text-2xl font-black text-slate-800 tracking-tight uppercase leading-none">
                    {editingItem ? 'Editar Processo' : 'Novo Registo'}
                  </h2>
                  <p className="text-xs text-slate-400 font-bold uppercase tracking-widest mt-1">Fluxo Administrativo Regional</p>
                </div>
              </div>
              <button onClick={() => setIsModalOpen(false)} className="p-3 hover:bg-slate-100 rounded-full transition-colors text-slate-400">
                <X size={24}/>
              </button>
            </div>
            <form onSubmit={handleSave} className="p-8 overflow-y-auto custom-scrollbar space-y-6">

              {/* Seleção de Etapa */}
              <div className="space-y-3">
                <label className="text-[11px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                  <div className="w-1 h-3 bg-blue-500 rounded-full" />
                  Etapa do Processo
                </label>
                <select
                  value={formData.ocupada || ''}
                  onChange={e => setFormData({...formData, ocupada: e.target.value})}
                  className="w-full p-3 bg-slate-50 border-2 border-slate-100 rounded-2xl font-bold text-slate-700 focus:border-blue-500 focus:bg-white outline-none transition-all"
                >
                  {ETAPAS_PROCESSO.map(etapa => (
                    <option key={etapa} value={etapa}>{etapa}</option>
                  ))}
                </select>
                {/* Mini progress bar no modal */}
                <div className="flex items-center gap-3">
                  <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden flex gap-px">
                    {Array.from({length: 12}).map((_, i) => {
                      const currentIdx = ETAPAS_PROCESSO.indexOf(formData.ocupada || '');
                      const concluido = formData.ocupada === 'CONCLUÍDO';
                      return (
                        <div
                          key={i}
                          className={`flex-1 h-full ${i < (currentIdx + 1) ? (concluido ? 'bg-emerald-500' : 'bg-blue-500') : 'bg-slate-100'}`}
                        />
                      );
                    })}
                  </div>
                  <span className="text-[10px] font-bold text-slate-400 whitespace-nowrap">
                    {Math.max(0, ETAPAS_PROCESSO.indexOf(formData.ocupada || '') + 1)}/12
                  </span>
                </div>
              </div>

              {/* Dados do processo */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                <div className="md:col-span-2">
                  <label className="block text-[10px] font-bold text-slate-500 uppercase mb-2">Escola Associada</label>
                  <select required disabled={userRole === 'school_manager'} className="w-full p-3 bg-slate-50 border-2 border-slate-100 rounded-2xl font-bold text-slate-700 focus:border-blue-500 focus:bg-white outline-none disabled:opacity-60 transition-all" value={formData.school_id || ''} onChange={e => setFormData({...formData, school_id: e.target.value})}>
                    <option value="">Selecione a Unidade Escolar...</option>
                    {schools.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase mb-2">Ordem Regional</label>
                  <input required placeholder="Ex: 01" className="w-full p-3 bg-slate-50 border-2 border-slate-100 rounded-2xl font-bold transition-all focus:border-blue-500 focus:bg-white outline-none" value={formData.ue || ''} onChange={e => setFormData({...formData, ue: e.target.value})} />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-[10px] font-bold text-slate-500 uppercase mb-2">Nome do Zelador</label>
                  <input required className="w-full p-3 bg-slate-50 border-2 border-slate-100 rounded-2xl font-bold transition-all focus:border-blue-500 focus:bg-white outline-none" value={formData.zelador || ''} onChange={e => setFormData({...formData, zelador: e.target.value})} />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase mb-2">Nº SEI</label>
                  <input required className="w-full p-3 bg-blue-50 border-2 border-blue-100 rounded-2xl font-mono text-blue-700 transition-all focus:border-blue-500 focus:bg-white outline-none" value={formData.sei_numero || ''} onChange={e => setFormData({...formData, sei_numero: e.target.value})} />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase mb-2">Status DARE</label>
                  <input placeholder="Ex: ISENTO ou NÚMERO" className="w-full p-3 bg-slate-50 border-2 border-slate-100 rounded-2xl font-bold transition-all focus:border-blue-500 focus:bg-white outline-none" value={formData.dare || ''} onChange={e => setFormData({...formData, dare: e.target.value})} />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase mb-2">Validade</label>
                  <input type="date" className="w-full p-3 bg-slate-50 border-2 border-slate-100 rounded-2xl font-bold transition-all focus:border-blue-500 focus:bg-white outline-none" value={formData.ate || ''} onChange={e => setFormData({...formData, ate: e.target.value})} />
                </div>
              </div>

              {/* Nota interna - exclusiva para regional_admin */}
              <div className="space-y-2">
                <label className="text-[11px] font-black text-amber-500 uppercase tracking-widest flex items-center gap-2">
                  <MessageSquare size={13} />
                  Nota Interna
                  <span className="text-[9px] text-slate-300 font-bold normal-case tracking-normal">· invisível para gestores escolares</span>
                </label>
                <textarea
                  rows={3}
                  placeholder="Anotações, lembretes, pendências..."
                  className="w-full p-3 bg-amber-50 border-2 border-amber-100 rounded-2xl font-medium text-slate-700 text-sm focus:border-amber-300 focus:bg-white outline-none transition-all resize-none"
                  value={formData.admin_notes || ''}
                  onChange={e => setFormData({...formData, admin_notes: e.target.value})}
                />
              </div>

              <div className="pt-6 flex justify-end gap-4 border-t border-slate-100">
                <button type="button" onClick={() => setIsModalOpen(false)} className="px-8 py-3 text-slate-500 font-black hover:text-slate-800 transition-all uppercase tracking-widest text-[11px]">Descartar</button>
                <button type="submit" disabled={saveLoading || userRole === 'school_manager'} className="px-12 py-3.5 bg-blue-600 text-white rounded-2xl font-black shadow-2xl shadow-blue-200 hover:bg-blue-700 flex items-center gap-3 active:scale-95 disabled:opacity-50 transition-all uppercase tracking-widest text-[11px]">
                  {saveLoading ? <Loader2 className="animate-spin" size={18}/> : <><Save size={18}/> Confirmar</>}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL HISTÓRICO */}
      {isHistoryModalOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 backdrop-blur-md p-4">
          <div className="bg-[#f8fafc] rounded-[3rem] w-full max-w-2xl shadow-2xl flex flex-col max-h-[85vh] overflow-hidden border border-white">
            <div className="p-8 border-b border-slate-100 flex justify-between items-center bg-white">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-blue-50 text-blue-600 rounded-2xl shadow-inner"><History size={24}/></div>
                <div>
                  <h2 className="text-xl font-black text-slate-800 tracking-tight uppercase">Histórico</h2>
                  <p className="text-[10px] text-blue-500 font-bold uppercase tracking-widest">Auditoria de Transições</p>
                </div>
              </div>
              <button onClick={() => setIsHistoryModalOpen(false)} className="p-3 hover:bg-slate-100 rounded-full transition-colors text-slate-400"><X size={24}/></button>
            </div>
            <div className="p-8 overflow-y-auto custom-scrollbar flex-1 bg-gradient-to-b from-white to-slate-50/50">
              {loading ? (
                <div className="flex flex-col items-center justify-center py-20 gap-4">
                  <Loader2 className="animate-spin text-blue-600" size={32}/>
                  <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">Sincronizando...</span>
                </div>
              ) : (
                <div className="relative">
                  <div className="absolute left-[2.25rem] top-4 bottom-4 w-1 bg-gradient-to-b from-blue-200 via-blue-100 to-transparent rounded-full"></div>
                  <div className="space-y-12">
                    {historyData.map((event, idx) => (
                      <div key={event.id} className="relative pl-16 group">
                        <div className={`absolute left-[1.75rem] top-1 w-5 h-5 rounded-full border-4 border-white shadow-lg transition-transform group-hover:scale-125 z-10 ${idx === 0 ? 'bg-blue-600 ring-4 ring-blue-100' : 'bg-slate-300'}`}></div>
                        <div className="bg-white p-6 rounded-[2rem] shadow-sm border border-slate-100">
                          <div className="flex justify-between items-center mb-4 text-slate-400 font-bold text-[10px] uppercase">
                            <div className="flex items-center gap-2"><Calendar size={12}/>{new Date(event.changed_at).toLocaleString()}</div>
                          </div>
                          <div className="flex items-center gap-4 bg-slate-50 p-4 rounded-2xl border border-slate-100/50">
                            <div className="flex-1"><p className="text-[9px] font-black text-slate-400 uppercase mb-1">De</p><span className="text-[11px] font-bold text-slate-500 line-through opacity-60 truncate block">{event.previous_status}</span></div>
                            <div className="w-8 h-8 rounded-full bg-white flex items-center justify-center text-blue-500 shadow-sm"><ArrowRight size={16} /></div>
                            <div className="flex-1"><p className="text-[9px] font-black text-blue-400 uppercase mb-1">Para</p><span className="text-[11px] font-black text-blue-700 truncate block uppercase">{event.new_status}</span></div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

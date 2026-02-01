import { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { 
  Plus, Search, Edit, Trash2, FileText, 
  CheckCircle, Calendar, 
  X, Save, Building2, 
  ShieldAlert, Loader2,
  History, ArrowRight, FileDown,
  BarChart3, PieChart as PieIcon,
  CheckSquare, UserPlus, ShieldCheck
} from 'lucide-react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, 
  ResponsiveContainer, Cell, PieChart, Pie, Legend
} from 'recharts';

// Definição das 8 etapas do processo
const ETAPAS_PROCESSO = [
  "SEI",
  "RELATÓRIO FOTOGRÁFICO",
  "ANÁLISE",
  "CECIG-PGE",
  "CIÊNCIA VALOR",
  "CASA CIVIL",
  "ASSINATURA DO TERMO",
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

export function Zeladoria() {
  const [data, setData] = useState<Zeladoria[]>([]);
  const [schools, setSchools] = useState<School[]>([]);
  const [loading, setLoading] = useState(true);
  const [userRole, setUserRole] = useState<string>('');
  const [userSchoolId, setUserSchoolId] = useState<string | null>(null);
  const [userId, setUserId] = useState<string>('');
  const [searchTerm, setSearchTerm] = useState('');
  const [exporting, setExporting] = useState(false);
  
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

  // --- FILTRO DE UNIDADES ATIVAS ---
  const activeData = useMemo(() => {
    return data.filter(z => 
      z.ocupada !== "NÃO POSSUI" && 
      z.ocupada !== "NÃO HABITÁVEL" &&
      z.ocupada !== "NÃO HABITAVEL"
    );
  }, [data]);

  // --- CÁLCULOS DE INDICADORES ---
  const stats = useMemo(() => {
    const concluidos = activeData.filter(z => z.ocupada === "CONCLUÍDO").length;
    const vagas = activeData.filter(z => 
      z.zelador?.toUpperCase().includes('DISPONIVEL') ||
      z.zelador?.toUpperCase().includes('DISPONÍVEL') ||
      !z.zelador || z.zelador.trim() === ""
    ).length;

    return {
      totalValidas: activeData.length,
      concluidos,
      vagas
    };
  }, [activeData]);

  // --- DADOS PARA GRÁFICOS ---
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

  // --- EXPORTAR PDF ---
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
        html2canvas: { 
          scale: 2, 
          useCORS: true, 
          letterRendering: true,
          width: 1120 
        },
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

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (userRole !== 'regional_admin') return;
    setSaveLoading(true);
    try {
      if (editingItem) {
        const { error } = await (supabase as any).from('zeladorias').update(formData).eq('id', editingItem.id);
        if (error) throw error;
        if (editingItem.ocupada !== formData.ocupada) {
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
        const { error } = await (supabase as any).from('zeladorias').insert([formData]);
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

  const filteredData = data.filter(item => 
    item.nome?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    item.zelador?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    item.sei_numero?.includes(searchTerm)
  );

  const getStepIndex = (etapa: string) => ETAPAS_PROCESSO.indexOf(etapa) + 1;

  return (
    <div className="space-y-6 pb-20 relative">
      
      <div 
        id="zeladoria-report-template" 
        style={{ display: 'none', background: 'white', width: '1080px', padding: '40px' }}
      >
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

          <div style={{ marginBottom: '40px' }}>
            <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: '10px' }}>
                <tbody>
                  <tr>
                      <td style={{ width: '33.3%', background: '#eff6ff', padding: '25px', borderRadius: '20px', border: '1px solid #bfdbfe', textAlign: 'center' }}>
                          <p style={{ margin: 0, fontSize: '10px', fontWeight: 900, color: '#1e40af', textTransform: 'uppercase' }}>Zeladorias Ativas</p>
                          <h3 style={{ margin: '8px 0 0', fontSize: '32px', fontWeight: 900, color: '#1e3a8a' }}>{stats.totalValidas}</h3>
                          <p style={{ margin: '2px 0 0', fontSize: '9px', fontWeight: 700, color: '#60a5fa' }}>Unidades operacionais</p>
                      </td>
                      <td style={{ width: '33.3%', background: '#ecfdf5', padding: '25px', borderRadius: '20px', border: '1px solid #a7f3d0', textAlign: 'center' }}>
                          <p style={{ margin: 0, fontSize: '10px', fontWeight: 900, color: '#065f46', textTransform: 'uppercase' }}>Processos Concluídos</p>
                          <h3 style={{ margin: '8px 0 0', fontSize: '32px', fontWeight: 900, color: '#064e3b' }}>{stats.concluidos}</h3>
                          <p style={{ margin: '2px 0 0', fontSize: '9px', fontWeight: 700, color: '#34d399' }}>Termos finalizados</p>
                      </td>
                      <td style={{ width: '33.3%', background: '#fffbeb', padding: '25px', borderRadius: '20px', border: '1px solid #fde68a', textAlign: 'center' }}>
                          <p style={{ margin: 0, fontSize: '10px', fontWeight: 900, color: '#92400e', textTransform: 'uppercase' }}>Vagas em Aberto</p>
                          <h3 style={{ margin: '8px 0 0', fontSize: '32px', fontWeight: 900, color: '#78350f' }}>{stats.vagas}</h3>
                          <p style={{ margin: '2px 0 0', fontSize: '9px', fontWeight: 700, color: '#fbbf24' }}>Unidades sem zelador</p>
                      </td>
                </tr>
                </tbody>
            </table>
          </div>

          <div style={{ display: 'table', width: '100%', tableLayout: 'fixed' }}>
            <div style={{ display: 'table-cell', width: '50%', paddingRight: '20px', verticalAlign: 'top' }}>
                <h3 style={{ fontSize: '13px', fontWeight: 900, color: '#334155', textTransform: 'uppercase', marginBottom: '15px' }}>Status das Etapas (Resumo Técnico)</h3>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                        <tr style={{ background: '#f1f5f9' }}>
                            <th style={{ padding: '12px', border: '1px solid #cbd5e1', fontSize: '10px', textAlign: 'left' }}>ETAPA DO PROCESSO</th>
                            <th style={{ padding: '12px', border: '1px solid #cbd5e1', fontSize: '10px', textAlign: 'center' }}>QTD.</th>
                        </tr>
                    </thead>
                    <tbody>
                        {statusChartData.map(row => (
                            <tr key={row.name}>
                                <td style={{ padding: '10px', border: '1px solid #cbd5e1', fontSize: '9px', fontWeight: 700 }}>{row.name}</td>
                                <td style={{ padding: '10px', border: '1px solid #cbd5e1', fontSize: '9px', textAlign: 'center', fontWeight: 800, color: '#2563eb' }}>{row.quantidade}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            <div style={{ display: 'table-cell', width: '50%', paddingLeft: '20px', verticalAlign: 'top' }}>
                <h3 style={{ fontSize: '13px', fontWeight: 900, color: '#334155', textTransform: 'uppercase', marginBottom: '15px' }}>Situação Financeira (DARE)</h3>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                        <tr style={{ background: '#f1f5f9' }}>
                            <th style={{ padding: '12px', border: '1px solid #cbd5e1', fontSize: '10px', textAlign: 'left' }}>CLASSIFICAÇÃO</th>
                            <th style={{ padding: '12px', border: '1px solid #cbd5e1', fontSize: '10px', textAlign: 'center' }}>QTD.</th>
                        </tr>
                    </thead>
                    <tbody>
                        {dareChartData.map(row => (
                            <tr key={row.name}>
                                <td style={{ padding: '10px', border: '1px solid #cbd5e1', fontSize: '9px', fontWeight: 700 }}>{row.name}</td>
                                <td style={{ padding: '10px', border: '1px solid #cbd5e1', fontSize: '9px', textAlign: 'center', fontWeight: 800, color: row.name === 'Isentas' ? '#10b981' : '#3b82f6' }}>{row.value}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
                <div style={{ marginTop: '30px', padding: '20px', background: '#f8fafc', borderRadius: '15px', border: '1px dashed #cbd5e1' }}>
                    <p style={{ margin: 0, fontSize: '9px', color: '#64748b', lineHeight: '1.6', fontWeight: 500 }}>
                        * Nota Técnica: Este resumo estatístico foca exclusivamente em unidades ativas, desconsiderando infraestruturas declaradas inexistentes ou inabitáveis na rede regional.
                    </p>
                </div>
            </div>
          </div>

          <div style={{ marginTop: '100px', paddingTop: '20px', borderTop: '2px solid #f1f5f9', textAlign: 'center' }}>
              <p style={{ fontSize: '10px', fontWeight: 900, color: '#cbd5e1', textTransform: 'uppercase', letterSpacing: '4px' }}>SGE-GSU INTELLIGENCE • RELATÓRIO ESTRATÉGICO PARA CHEFIA</p>
          </div>
      </div>

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
            <div className="h-[250px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={statusChartData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} hide />
                  <YAxis axisLine={false} tickLine={false} tick={{fontSize: 10, fontWeight: 700, fill: '#94a3b8'}} />
                  <RechartsTooltip cursor={{fill: '#f8fafc'}} contentStyle={{borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px rgba(0,0,0,0.1)'}} />
                  <Bar dataKey="quantidade" radius={[6, 6, 0, 0]}>
                    {statusChartData.map((_, index) => (
                      <Cell key={`cell-${index}`} fill={index === 7 ? '#10b981' : '#3b82f6'} />
                    ))}
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
                  <Pie
                    data={dareChartData}
                    innerRadius={60}
                    outerRadius={80}
                    paddingAngle={5}
                    dataKey="value"
                  >
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

      {/* BUSCA E TABELA */}
      <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm">
        <div className="relative w-full max-w-2xl">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
          <input 
            type="text" 
            placeholder="Filtrar por escola, zelador ou processo..." 
            className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium transition-all"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 border-b border-slate-100">
              <tr>
                <th className="px-6 py-4 font-bold text-slate-500 uppercase text-[10px] tracking-wider">Unidade / SEI</th>
                <th className="px-6 py-4 font-bold text-slate-500 uppercase text-[10px] tracking-wider">Status do Fluxo</th>
                <th className="px-6 py-4 font-bold text-slate-500 uppercase text-[10px] tracking-wider">Responsável</th>
                <th className="px-6 py-4 font-bold text-slate-500 uppercase text-[10px] tracking-wider text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
              {loading && data.length === 0 ? (
                <tr><td colSpan={5} className="px-6 py-12 text-center text-slate-400 font-bold uppercase tracking-widest"><Loader2 className="animate-spin inline mr-2 text-blue-600"/> Sincronizando dados...</td></tr>
              ) : filteredData.map((item) => {
                const step = getStepIndex(item.ocupada);
                const isConcluido = step === 8;
                const isDisponivel = item.zelador?.toUpperCase().includes('DISPONIVEL') || item.zelador?.toUpperCase().includes('DISPONÍVEL');
                return (
                  <tr key={item.id} className="hover:bg-slate-50/80 transition-colors group">
                    <td className="px-6 py-4">
                      <div className="font-bold text-slate-900 truncate max-w-[250px] uppercase text-xs">{item.nome}</div>
                      <div className="flex items-center gap-1.5 mt-1 font-mono text-[10px] text-slate-400">
                        <FileText size={12} /> {item.sei_numero || 'N/A'}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-col gap-1.5">
                        <span className={`text-[10px] font-black uppercase tracking-tight ${isConcluido ? 'text-emerald-600' : 'text-blue-600'}`}>
                          {item.ocupada}
                        </span>
                        <div className="w-32 h-1 bg-slate-100 rounded-full overflow-hidden flex">
                            {Array.from({length: 8}).map((_, i) => (
                              <div key={i} className={`flex-1 h-full border-r border-white last:border-0 ${i < step ? (isConcluido ? 'bg-emerald-500' : 'bg-blue-500') : 'bg-slate-200'}`} />
                            ))}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className={`font-bold text-xs ${isDisponivel ? 'text-amber-600' : 'text-slate-900'}`}>{item.zelador || 'VAGA DISPONÍVEL'}</div>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={() => fetchHistory(item.id)} className="p-2 hover:bg-slate-100 text-slate-400 hover:text-blue-600 rounded-lg transition-colors" title="Ver Histórico"><History size={16}/></button>
                        {userRole === 'regional_admin' && (
                          <><button onClick={() => handleOpenModal(item)} className="p-2 hover:bg-amber-50 text-slate-400 hover:text-amber-600 rounded-lg transition-colors"><Edit size={16}/></button><button onClick={() => handleDelete(item.id)} className="p-2 hover:bg-red-50 text-slate-400 hover:text-red-600 rounded-lg transition-colors"><Trash2 size={16}/></button></>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* MODAL DE EDIÇÃO */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-white rounded-[2.5rem] w-full max-w-4xl max-h-[95vh] flex flex-col shadow-2xl animate-in zoom-in-95 duration-300 overflow-hidden border border-slate-100">
            <div className="p-8 border-b border-slate-100 flex justify-between items-center bg-white">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-blue-600 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-blue-200"><ShieldAlert size={24}/></div>
                <div><h2 className="text-2xl font-black text-slate-800 tracking-tight uppercase leading-none">{editingItem ? 'Editar Processo' : 'Novo Registro'}</h2><p className="text-xs text-slate-400 font-bold uppercase tracking-widest mt-1">Fluxo Administrativo Regional</p></div>
              </div>
              <button onClick={() => setIsModalOpen(false)} className="p-3 hover:bg-slate-100 rounded-full transition-colors text-slate-400"><X size={24}/></button>
            </div>
            <form onSubmit={handleSave} className="p-8 overflow-y-auto custom-scrollbar space-y-10">
              <div className="space-y-4">
                <label className="text-[11px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2"><div className="w-1 h-3 bg-blue-500 rounded-full"></div>Evolução do Processo</label>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {ETAPAS_PROCESSO.map((etapa, idx) => {
                    const active = formData.ocupada === etapa;
                    const passed = getStepIndex(formData.ocupada || '') > idx;
                    return (
                      <button key={etapa} type="button" onClick={() => setFormData({...formData, ocupada: etapa})} className={`group relative p-4 rounded-2xl text-[10px] font-black transition-all border-2 text-left flex flex-col justify-between h-24 ${active ? 'bg-blue-600 border-blue-600 text-white shadow-xl shadow-blue-100 scale-[1.03]' : passed ? 'bg-blue-50 border-blue-100 text-blue-700' : 'bg-white border-slate-100 text-slate-400 hover:border-blue-200'}`}>
                        <span className={`text-[14px] opacity-40 group-hover:opacity-100 transition-opacity`}>{idx + 1}</span>
                        <span className="uppercase leading-none">{etapa}</span>
                        {passed && !active && <CheckCircle size={14} className="absolute top-4 right-4 text-blue-400" />}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                <div className="md:col-span-2"><label className="block text-[10px] font-bold text-slate-500 uppercase mb-2">Escola Associada</label><select required disabled={userRole === 'school_manager'} className="w-full p-3 bg-slate-50 border-2 border-slate-100 rounded-2xl font-bold text-slate-700 focus:border-blue-500 focus:bg-white outline-none disabled:opacity-60 transition-all" value={formData.school_id || ''} onChange={e => setFormData({...formData, school_id: e.target.value})}><option value="">Seleccione a Unidade Escolar...</option>{schools.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
                <div><label className="block text-[10px] font-bold text-slate-500 uppercase mb-2">Ordem Regional</label><input required placeholder="Ex: 01" className="w-full p-3 bg-slate-50 border-2 border-slate-100 rounded-2xl font-bold transition-all focus:border-blue-500 focus:bg-white outline-none" value={formData.ue || ''} onChange={e => setFormData({...formData, ue: e.target.value})} /></div>
                <div className="md:col-span-2"><label className="block text-[10px] font-bold text-slate-500 uppercase mb-2">Nome do Zelador</label><input required className="w-full p-3 bg-slate-50 border-2 border-slate-100 rounded-2xl font-bold transition-all focus:border-blue-500 focus:bg-white outline-none" value={formData.zelador || ''} onChange={e => setFormData({...formData, zelador: e.target.value})} /></div>
                <div><label className="block text-[10px] font-bold text-slate-500 uppercase mb-2">Nº SEI</label><input required className="w-full p-3 bg-blue-50 border-2 border-blue-100 rounded-2xl font-mono text-blue-700 transition-all focus:border-blue-500 focus:bg-white outline-none" value={formData.sei_numero || ''} onChange={e => setFormData({...formData, sei_numero: e.target.value})} /></div>
                <div><label className="block text-[10px] font-bold text-slate-500 uppercase mb-2">Status DARE</label><input placeholder="Ex: ISENTO ou NÚMERO" className="w-full p-3 border-2 border-slate-100 rounded-2xl font-bold" value={formData.dare || ''} onChange={e => setFormData({...formData, dare: e.target.value})} /></div>
                <div><label className="block text-[10px] font-bold text-slate-500 uppercase mb-2">Validade</label><input type="date" className="w-full p-3 bg-slate-50 border-2 border-slate-100 rounded-2xl font-bold transition-all focus:border-blue-500 focus:bg-white outline-none" value={formData.ate || ''} onChange={e => setFormData({...formData, ate: e.target.value})} /></div>
              </div>
              <div className="pt-10 flex justify-end gap-4 border-t border-slate-100 mt-6 pb-2">
                <button type="button" onClick={() => setIsModalOpen(false)} className="px-8 py-3 text-slate-500 font-black hover:text-slate-800 transition-all uppercase tracking-widest text-[11px]">Descartar</button>
                <button type="submit" disabled={saveLoading || userRole === 'school_manager'} className="px-12 py-3.5 bg-blue-600 text-white rounded-2xl font-black shadow-2xl shadow-blue-200 hover:bg-blue-700 flex items-center gap-3 active:scale-95 disabled:opacity-50 transition-all uppercase tracking-widest text-[11px]">{saveLoading ? <Loader2 className="animate-spin" size={18}/> : <><Save size={18}/> Confirmar</>}</button>
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
              <div className="flex items-center gap-4"><div className="p-3 bg-blue-50 text-blue-600 rounded-2xl shadow-inner"><History size={24}/></div><div><h2 className="text-xl font-black text-slate-800 tracking-tight uppercase">Histórico</h2><p className="text-[10px] text-blue-500 font-bold uppercase tracking-widest">Auditoria de Transições</p></div></div>
              <button onClick={() => setIsHistoryModalOpen(false)} className="p-3 hover:bg-slate-100 rounded-full transition-colors text-slate-400"><X size={24}/></button>
            </div>
            <div className="p-8 overflow-y-auto custom-scrollbar flex-1 bg-gradient-to-b from-white to-slate-50/50">
              {loading ? (
                 <div className="flex flex-col items-center justify-center py-20 gap-4"><Loader2 className="animate-spin text-blue-600" size={32}/><span className="text-xs font-bold text-slate-400 uppercase tracking-widest">Sincronizando...</span></div>
              ) : (
                <div className="relative">
                  <div className="absolute left-[2.25rem] top-4 bottom-4 w-1 bg-gradient-to-b from-blue-200 via-blue-100 to-transparent rounded-full"></div>
                  <div className="space-y-12">
                    {historyData.map((event, idx) => (
                      <div key={event.id} className="relative pl-16 group">
                        <div className={`absolute left-[1.75rem] top-1 w-5 h-5 rounded-full border-4 border-white shadow-lg transition-transform group-hover:scale-125 z-10 ${idx === 0 ? 'bg-blue-600 ring-4 ring-blue-100' : 'bg-slate-300'}`}></div>
                        <div className="bg-white p-6 rounded-[2rem] shadow-sm border border-slate-100">
                          <div className="flex justify-between items-center mb-4 text-slate-400 font-bold text-[10px] uppercase"><div className="flex items-center gap-2"><Calendar size={12}/>{new Date(event.changed_at).toLocaleString()}</div></div>
                          <div className="flex items-center gap-4 bg-slate-50 p-4 rounded-2xl mb-4 border border-slate-100/50">
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
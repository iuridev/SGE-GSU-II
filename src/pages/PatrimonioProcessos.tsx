import React, { useState, useEffect, useMemo, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { 
  Package, Plus, Search, FileText, 
  Trash2, Edit, X, Save, Loader2, 
  Building2, Info, CheckCircle2,
  Calendar, 
  AlertCircle, History, Flag, ShieldAlert, Gift, 
  ClipboardList, DollarSign, ListPlus, Calculator,
  LayoutGrid, CheckCircle, Download, BarChart2, TrendingUp
} from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, Legend } from 'recharts';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import html2canvas from 'html2canvas';

interface PatrimonioItem {
  name: string;
  asset_number: string;
  unit_value: number;
}

interface PatrimonioProcess {
  id: string;
  school_id: string;
  type: string;
  sei_number: string;
  process_date: string;
  current_step: string;
  status: string;
  occurrence_date?: string;
  bulletin_number?: string;
  is_nl_low?: boolean;
  authorship?: string;
  conclusion?: string;
  subtype?: string;
  items_json?: string; 
  created_at: string;
  schools?: { name: string };
}

interface School {
  id: string;
  name: string;
}

const PROCESS_TYPES = [
  { id: 'DOACAO_PDDE', label: 'Doação PDDE', category: 'doacao', color: 'text-emerald-600 bg-emerald-50' },
  { id: 'DOACAO_APM', label: 'Doação APM', category: 'doacao', color: 'text-emerald-600 bg-emerald-50' },
  { id: 'DOACAO_TERCEIROS', label: 'Doação Terceiros', category: 'doacao', color: 'text-emerald-600 bg-emerald-50' },
  { id: 'INSERVIVEIS', label: 'Inservíveis', category: 'inserviveis', color: 'text-amber-600 bg-amber-50' },
  { id: 'BANDEIRAS', label: 'Bandeiras', category: 'bandeiras', color: 'text-blue-600 bg-blue-50' },
  { id: 'FURTOS', label: 'Sinistros (Furtos/Roubos)', category: 'furtos', color: 'text-red-600 bg-red-50' },
];

const WORKFLOWS: Record<string, string[]> = {
  'DOACAO_PDDE': ["RECEBIDO NO SEI", "ANÁLISE DO SEFISC", "DEVOLVIDO PARA CORREÇÃO", "DOE", "REGISTRO NO SAM", "REGISTRO NÚMERO PATRIMÔNIO"],
  'DOACAO_APM': ["RECEBIDO NO SEI", "ANÁLISE DO SEFISC", "DEVOLVIDO PARA CORREÇÃO", "DOE", "REGISTRO NO SAM", "REGISTRO NÚMERO PATRIMÔNIO"],
  'DOACAO_TERCEIROS': ["RECEBIDO NO SEI", "ANÁLISE DO SEFISC", "DEVOLVIDO PARA CORREÇÃO", "DOE", "REGISTRO NO SAM", "REGISTRO NÚMERO PATRIMÔNIO"],
  'INSERVIVEIS': ["RECEBIDO NO SEI", "ANÁLISE DO SEFISC", "DEVOLVIDO PARA CORREÇÃO", "ENCAMINHAMENTO EAMEX", "BAIXA DE NL NO SAM", "REPROVADO / DEVOLVIDO"],
  'FURTOS': ["RECEBIDO NO SEI", "ANÁLISE SEFISC", "DEVOLVIDO PARA CORREÇÃO", "ENCAMINHADO PARA ASURE", "CONCLUÍDO"],
  'BANDEIRAS': ["RECEBIDO", "ANÁLISE SEFISC", "DEVOLVIDO PARA CORREÇÃO", "ENTREGA NO TIRO DE GUERRA", "BAIXA NO SAM"],
};

export function PatrimonioProcessos() {
  const [processes, setProcesses] = useState<PatrimonioProcess[]>([]);
  const [schools, setSchools] = useState<School[]>([]);
  const [loading, setLoading] = useState(true);
  const [saveLoading, setSaveLoading] = useState(false);
  
  // Estados de Exportação
  const [isExporting, setIsExporting] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [exportTargetSchool, setExportTargetSchool] = useState('');

  const [userRole, setUserRole] = useState('');
  const [userSchoolId, setUserSchoolId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  
  const dashboardRef = useRef<HTMLDivElement>(null);

  // Controle de Abas
  const [activeMainTab, setActiveMainTab] = useState<'doacao' | 'furtos' | 'inserviveis' | 'bandeiras'>('doacao');
  const [activeSubTab, setActiveSubTab] = useState<'pendente' | 'concluido'>('pendente');

  // Estados do Modal
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProcess, setEditingProcess] = useState<PatrimonioProcess | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [sinistroItems, setSinistroItems] = useState<PatrimonioItem[]>([]);

  const [formData, setFormData] = useState({
    school_id: '',
    type: 'DOACAO_PDDE',
    sei_number: '',
    process_date: new Date().toISOString().split('T')[0],
    current_step: '',
    status: 'RECEBIDO',
    occurrence_date: '',
    bulletin_number: '',
    is_nl_low: false,
    authorship: 'Não conhecida',
    conclusion: 'EM ANDAMENTO',
    subtype: 'Furto'
  });

  useEffect(() => {
    fetchInitialData();
  }, []);

  useEffect(() => {
    if (!editingProcess && formData.type) {
      const defaultStep = WORKFLOWS[formData.type][0];
      setFormData(prev => ({ ...prev, current_step: defaultStep }));
    }
  }, [formData.type, editingProcess]);

  async function fetchInitialData() {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      let role = '';
      let schoolId = null;

      if (user) {
        const { data: profile } = await (supabase as any).from('profiles').select('role, school_id').eq('id', user.id).single();
        role = profile?.role || '';
        schoolId = profile?.school_id || null;
        setUserRole(role);
        setUserSchoolId(schoolId);
      }

      const { data: schoolsData } = await (supabase as any).from('schools').select('id, name').order('name');
      setSchools(schoolsData || []);
      
      await fetchProcesses(role, schoolId);
    } catch (error) { console.error(error); } finally { setLoading(false); }
  }

  async function fetchProcesses(role?: string, sId?: string | null) {
    const activeRole = role || userRole;
    const activeSchoolId = sId !== undefined ? sId : userSchoolId;

    let query = (supabase as any).from('asset_processes').select('*, schools(name)');
    
    if (activeRole === 'school_manager' && activeSchoolId) {
      query = query.eq('school_id', activeSchoolId);
    }

    const { data, error } = await query.order('process_date', { ascending: false });
    if (!error) setProcesses(data || []);
  }

  const isAdmin = userRole === 'regional_admin';

  // ---------------------------------------------------------
  // LÓGICA DE FILTRO PARA A EXPORTAÇÃO
  // ---------------------------------------------------------
  
  // Esta variável ajusta os dados dinamicamente se estivermos gerando o PDF
  const activeProcesses = useMemo(() => {
    if (isExporting && exportTargetSchool !== '') {
      return processes.filter(p => p.school_id === exportTargetSchool);
    }
    return processes;
  }, [processes, isExporting, exportTargetSchool]);

  const dashboardMetrics = useMemo(() => {
    const total = activeProcesses.length;
    const concluidos = activeProcesses.filter(p => p.status === 'CONCLUÍDO').length;
    const pendentes = total - concluidos;
    
    // Gráfico 1: Processos por Tipo
    const chartData = PROCESS_TYPES.map(type => {
      const typeProcesses = activeProcesses.filter(p => p.type === type.id);
      let xAxisName = type.label;
      if (type.id === 'FURTOS') xAxisName = 'Sinistros';

      return {
        name: xAxisName, 
        Total: typeProcesses.length,
        Concluídos: typeProcesses.filter(p => p.status === 'CONCLUÍDO').length,
        Pendentes: typeProcesses.filter(p => p.status !== 'CONCLUÍDO').length,
      };
    });

    // Gráfico 2: Ranking de Escolas
    const schoolCounts: Record<string, { name: string, Processos: number }> = {};
    activeProcesses.forEach(p => {
      const fullName = p.schools?.name || 'Não informada';
      if (!schoolCounts[fullName]) schoolCounts[fullName] = { name: fullName, Processos: 0 };
      schoolCounts[fullName].Processos += 1;
    });

    const schoolRankingData = Object.values(schoolCounts)
      .sort((a, b) => b.Processos - a.Processos)
      .slice(0, 10); 

    return { total, concluidos, pendentes, chartData, schoolRankingData };
  }, [activeProcesses]);

  // Efeito que captura a tela e gera o PDF assim que o filtro de exportação entra em ação
  useEffect(() => {
    if (!isExporting) return;

    const generatePDF = async () => {
      // Dá 500ms para o React renderizar os novos dados na tela (filtro) e pausar animações
      await new Promise(resolve => setTimeout(resolve, 500));

      try {
        const doc = new jsPDF('landscape');
        const pdfWidth = doc.internal.pageSize.getWidth();
        const margin = 14;
        let currentY = 22;
        
        doc.setFontSize(20);
        doc.setTextColor(79, 70, 229);
        doc.text('Relatório Mensal - Processos de Patrimônio (SGE-GSU-II)', margin, currentY);
        
        currentY += 8;
        doc.setFontSize(10);
        doc.setTextColor(100);

        const schoolName = exportTargetSchool 
          ? schools.find(s => s.id === exportTargetSchool)?.name 
          : 'Todas as Unidades Escolares';
        
        doc.text(`Filtro Aplicado: ${schoolName}`, margin, currentY);
        currentY += 6;
        doc.text(`Gerado em: ${new Date().toLocaleDateString('pt-BR')} às ${new Date().toLocaleTimeString('pt-BR')}`, margin, currentY);
        
        currentY += 10;

        if (dashboardRef.current) {
          const canvas = await html2canvas(dashboardRef.current, { 
            scale: 2, 
            useCORS: true,
            backgroundColor: '#ffffff' 
          });
          const imgData = canvas.toDataURL('image/png');
          
          let printWidth = pdfWidth - (margin * 2);
          let printHeight = (canvas.height * printWidth) / canvas.width;

          // Proteção para a imagem não cortar na página
          const maxAvailableHeight = doc.internal.pageSize.getHeight() - currentY - margin;
          if (printHeight > maxAvailableHeight) {
            const ratio = maxAvailableHeight / printHeight;
            printHeight = maxAvailableHeight;
            printWidth = printWidth * ratio;
          }

          const xOffset = (pdfWidth - printWidth) / 2;
          doc.addImage(imgData, 'PNG', xOffset, currentY, printWidth, printHeight);
          currentY += printHeight + 10;
        }

        if (currentY > doc.internal.pageSize.getHeight() - 40) {
          doc.addPage();
          currentY = margin;
        }

        const tableData = activeProcesses.map(p => [
          p.sei_number,
          p.schools?.name || 'Não informada',
          PROCESS_TYPES.find(t => t.id === p.type)?.label || p.type,
          p.status,
          new Date(p.process_date + 'T12:00:00').toLocaleDateString('pt-BR'),
          p.current_step
        ]);

        autoTable(doc, {
          startY: currentY,
          head: [['Nº SEI', 'Unidade Escolar', 'Tipo de Fluxo', 'Status', 'Data', 'Etapa Atual']],
          body: tableData,
          theme: 'grid',
          headStyles: { fillColor: [79, 70, 229], textColor: 255, fontStyle: 'bold' },
          styles: { fontSize: 8, cellPadding: 3 },
          alternateRowStyles: { fillColor: [248, 250, 252] },
        });

        doc.save(`Relatorio_Patrimonio_${new Date().toISOString().split('T')[0]}.pdf`);
      } catch (error) {
        console.error("Erro ao gerar PDF:", error);
        alert("Ocorreu um erro ao gerar o relatório.");
      } finally {
        setIsExporting(false); // Retorna a tela ao normal (sem filtros)
        setShowExportModal(false);
      }
    };

    generatePDF();
  }, [isExporting, activeProcesses, exportTargetSchool, schools]);
  // ---------------------------------------------------------

  const filteredProcesses = useMemo(() => {
    return processes.filter(p => {
      const matchesSearch = p.sei_number.includes(searchTerm) || p.schools?.name.toLowerCase().includes(searchTerm.toLowerCase());
      const typeInfo = PROCESS_TYPES.find(t => t.id === p.type);
      const matchesMainTab = typeInfo?.category === activeMainTab;
      const isConcluido = p.status === 'CONCLUÍDO';
      const matchesSubTab = activeSubTab === 'concluido' ? isConcluido : !isConcluido;
      return matchesSearch && matchesMainTab && matchesSubTab;
    });
  }, [processes, searchTerm, activeMainTab, activeSubTab]);

  const totalSinistroValue = useMemo(() => {
    return sinistroItems.reduce((acc, curr) => acc + (curr.unit_value || 0), 0);
  }, [sinistroItems]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaveLoading(true);
    setFormError(null);

    const payload = {
      ...formData,
      occurrence_date: formData.occurrence_date ? formData.occurrence_date : null,
      items_json: formData.type === 'FURTOS' ? JSON.stringify(sinistroItems) : null
    };

    try {
      const { data: existingProcess } = await (supabase as any)
        .from('asset_processes')
        .select('id, sei_number')
        .eq('sei_number', formData.sei_number.trim())
        .maybeSingle();

      if (existingProcess && (!editingProcess || existingProcess.id !== editingProcess.id)) {
        throw new Error(`Este número de processo SEI (${formData.sei_number}) já se encontra registrado no sistema.`);
      }

      if (editingProcess) {
        const { error } = await (supabase as any).from('asset_processes').update(payload).eq('id', editingProcess.id);
        if (error) throw error;
      } else {
        const { error } = await (supabase as any).from('asset_processes').insert([payload]);
        if (error) throw error;
      }
      setIsModalOpen(false);
      fetchProcesses();
    } catch (error: any) {
      setFormError(error.message);
    } finally { setSaveLoading(false); }
  }

  async function handleDelete(id: string) {
    if (!confirm("Remover este processo?")) return;
    await (supabase as any).from('asset_processes').delete().eq('id', id);
    fetchProcesses();
  }

  function openModal(process: PatrimonioProcess | null = null) {
    setFormError(null);
    if (process) {
      setEditingProcess(process);
      setFormData({
        school_id: process.school_id,
        type: process.type,
        sei_number: process.sei_number,
        process_date: process.process_date,
        current_step: process.current_step,
        status: process.status,
        occurrence_date: process.occurrence_date || '',
        bulletin_number: process.bulletin_number || '',
        is_nl_low: process.is_nl_low || false,
        authorship: process.authorship || 'Não conhecida',
        conclusion: process.conclusion || 'EM ANDAMENTO',
        subtype: process.subtype || 'Furto'
      });
      setSinistroItems(process.items_json ? JSON.parse(process.items_json) : []);
    } else {
      setEditingProcess(null);
      setFormData({
        school_id: isAdmin ? '' : (userSchoolId || ''),
        type: 'DOACAO_PDDE',
        sei_number: '',
        process_date: new Date().toISOString().split('T')[0],
        current_step: WORKFLOWS['DOACAO_PDDE'][0],
        status: 'RECEBIDO',
        occurrence_date: '',
        bulletin_number: '',
        is_nl_low: false,
        authorship: 'Não conhecida',
        conclusion: 'EM ANDAMENTO',
        subtype: 'Furto'
      });
      setSinistroItems([]);
    }
    setIsModalOpen(true);
  }

  const addSinistroItem = () => {
    setSinistroItems([...sinistroItems, { name: '', asset_number: '', unit_value: 0 }]);
  };

  const removeSinistroItem = (index: number) => {
    setSinistroItems(sinistroItems.filter((_, i) => i !== index));
  };

  const updateSinistroItem = (index: number, field: keyof PatrimonioItem, value: any) => {
    const newItems = [...sinistroItems];
    newItems[index] = { ...newItems[index], [field]: value };
    setSinistroItems(newItems);
  };

  const mainTabs = [
    { id: 'doacao', label: 'Doação', icon: <Gift size={18}/>, color: 'text-emerald-600' },
    { id: 'furtos', label: 'Sinistros / Furtos', icon: <ShieldAlert size={18}/>, color: 'text-red-600' },
    { id: 'inserviveis', label: 'Inservíveis', icon: <Trash2 size={18}/>, color: 'text-amber-600' },
    { id: 'bandeiras', label: 'Bandeiras', icon: <Flag size={18}/>, color: 'text-blue-600' }
  ] as const;

  return (
    <div className="min-h-screen space-y-8 pb-32 bg-[#f8fafc]">
      {/* Header Fixo de Impacto */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="flex items-center gap-5">
          <div className="p-4 bg-indigo-600 rounded-[2rem] text-white shadow-2xl shadow-indigo-100">
            <Package size={36} />
          </div>
          <div>
            <h1 className="text-3xl font-black text-slate-900 tracking-tight uppercase leading-none">Processos de Patrimônio</h1>
            <p className="text-slate-500 font-medium mt-1 uppercase text-xs tracking-widest italic">Monitoramento e Fluxo Regional de Bens</p>
          </div>
        </div>
        
        <div className="flex gap-4">
          <button 
            onClick={() => setShowExportModal(true)} 
            disabled={isExporting}
            className="bg-slate-800 hover:bg-slate-900 disabled:opacity-70 text-white px-8 py-5 rounded-[2rem] font-black flex items-center gap-3 shadow-xl transition-all active:scale-95"
          >
            {isExporting ? <Loader2 size={20} className="animate-spin" /> : <Download size={20} />} 
            {isExporting ? 'GERANDO PDF...' : 'PDF CHEFIA'}
          </button>

          {isAdmin && (
            <button 
              onClick={() => openModal()} 
              className="bg-indigo-600 hover:bg-indigo-700 text-white px-10 py-5 rounded-[2rem] font-black flex items-center gap-3 shadow-xl transition-all active:scale-95 group"
            >
              <Plus size={20} className="group-hover:rotate-90 transition-transform"/> ABRIR NOVO PROCESSO
            </button>
          )}
        </div>
      </div>

      {/* ÁREA DO DASHBOARD CAPTURADA PARA O PDF */}
      <div ref={dashboardRef} className="space-y-6 bg-[#f8fafc] p-2 rounded-[3.5rem]">
        
        {/* CARDS DE MÉTRICAS */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-white p-6 rounded-[2.5rem] border border-slate-100 shadow-lg flex items-center gap-6">
            <div className="p-4 bg-indigo-50 text-indigo-600 rounded-2xl"><ClipboardList size={32}/></div>
            <div>
              <p className="text-xs font-black text-slate-400 uppercase tracking-widest">Total de Processos</p>
              <h2 className="text-4xl font-black text-slate-800">{dashboardMetrics.total}</h2>
            </div>
          </div>
          <div className="bg-white p-6 rounded-[2.5rem] border border-slate-100 shadow-lg flex items-center gap-6">
            <div className="p-4 bg-emerald-50 text-emerald-600 rounded-2xl"><CheckCircle size={32}/></div>
            <div>
              <p className="text-xs font-black text-slate-400 uppercase tracking-widest">Concluídos</p>
              <h2 className="text-4xl font-black text-emerald-600">{dashboardMetrics.concluidos}</h2>
            </div>
          </div>
          <div className="bg-white p-6 rounded-[2.5rem] border border-slate-100 shadow-lg flex items-center gap-6">
            <div className="p-4 bg-amber-50 text-amber-600 rounded-2xl"><History size={32}/></div>
            <div>
              <p className="text-xs font-black text-slate-400 uppercase tracking-widest">Em Andamento</p>
              <h2 className="text-4xl font-black text-amber-600">{dashboardMetrics.pendentes}</h2>
            </div>
          </div>
        </div>

        {/* GRÁFICOS */}
        <div className="grid grid-cols-1 gap-6">
          
          {/* Gráfico 1: Processos por Tipo */}
          <div className="bg-white p-8 rounded-[3.5rem] border border-slate-100 shadow-xl">
            <div className="flex items-center gap-3 mb-8">
              <BarChart2 className="text-indigo-600" size={24} />
              <h2 className="text-lg font-black text-slate-800 uppercase tracking-tight">Distribuição de Processos</h2>
            </div>
            <div className="h-80 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={dashboardMetrics.chartData} margin={{ top: 20, right: 30, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 11, fontWeight: 700 }} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 12, fontWeight: 700 }} />
                  <RechartsTooltip cursor={{ fill: '#f8fafc' }} contentStyle={{ borderRadius: '1rem', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }} />
                  <Legend wrapperStyle={{ paddingTop: '20px', fontWeight: 700, fontSize: '12px' }} />
                  {/* Desliga a animação apenas no momento exato do print para não capturar a barra "subindo" */}
                  <Bar dataKey="Pendentes" stackId="a" fill="#fbbf24" radius={[0, 0, 4, 4]} maxBarSize={60} isAnimationActive={!isExporting}/>
                  <Bar dataKey="Concluídos" stackId="a" fill="#10b981" radius={[4, 4, 0, 0]} maxBarSize={60} isAnimationActive={!isExporting}/>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Gráfico 2: Ranking de Escolas */}
          <div className="bg-white p-8 rounded-[3.5rem] border border-slate-100 shadow-xl">
            <div className="flex items-center gap-3 mb-8">
              <TrendingUp className="text-blue-500" size={24} />
              <h2 className="text-lg font-black text-slate-800 uppercase tracking-tight">Número Processos por Escola</h2>
            </div>
            <div className="h-96 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={dashboardMetrics.schoolRankingData} layout="vertical" margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
                  <XAxis type="number" axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 12, fontWeight: 700 }} />
                  <YAxis dataKey="name" type="category" axisLine={false} tickLine={false} tick={{ fill: '#475569', fontSize: 10, fontWeight: 700 }} width={250} />
                  <RechartsTooltip cursor={{ fill: '#f8fafc' }} contentStyle={{ borderRadius: '1rem', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }} />
                  <Bar dataKey="Processos" fill="#3b82f6" radius={[0, 4, 4, 0]} barSize={24} isAnimationActive={!isExporting}/>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

        </div>
      </div>
      {/* FIM DA ÁREA DO DASHBOARD */}

      {/* Navegação de Abas Principais (Estilo Pílula) */}
      <div className="bg-white p-3 rounded-[3rem] border border-slate-100 shadow-xl flex flex-col md:flex-row items-center justify-between gap-4 mt-8">
        <div className="flex flex-wrap gap-2 p-1.5 bg-slate-100/50 rounded-[2.5rem] w-full md:w-auto">
           {mainTabs.map(tab => (
             <button
              key={tab.id}
              onClick={() => { setActiveMainTab(tab.id); setActiveSubTab('pendente'); }}
              className={`px-8 py-3.5 rounded-[2rem] text-xs font-black uppercase tracking-widest flex items-center gap-3 transition-all ${
                activeMainTab === tab.id 
                  ? 'bg-white text-indigo-600 shadow-xl shadow-indigo-100' 
                  : 'text-slate-400 hover:text-slate-600'
              }`}
             >
               {tab.icon} {tab.label}
             </button>
           ))}
        </div>

        <div className="bg-slate-100 p-1.5 rounded-[2.5rem] flex gap-1 w-full md:w-auto">
           <button 
            onClick={() => setActiveSubTab('pendente')}
            className={`px-6 py-3 rounded-[2rem] text-[10px] font-black uppercase tracking-widest transition-all ${activeSubTab === 'pendente' ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-400 hover:text-indigo-500'}`}
           >
             Não Concluídos
           </button>
           <button 
            onClick={() => setActiveSubTab('concluido')}
            className={`px-6 py-3 rounded-[2rem] text-[10px] font-black uppercase tracking-widest transition-all ${activeSubTab === 'concluido' ? 'bg-emerald-600 text-white shadow-lg' : 'text-slate-400 hover:text-emerald-500'}`}
           >
             Concluídos
           </button>
        </div>
      </div>

      {/* Busca */}
      <div className="bg-white p-4 rounded-[2.5rem] border border-slate-100 shadow-sm">
        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
          <input 
            type="text" 
            placeholder="Pesquisar por Nº SEI ou Unidade Escolar..." 
            className="w-full pl-12 pr-4 py-3 bg-slate-50 border-none rounded-2xl focus:ring-2 focus:ring-indigo-500 font-medium text-slate-700 outline-none"
            value={searchTerm} 
            onChange={(e) => setSearchTerm(e.target.value)} 
          />
        </div>
      </div>

      {/* Lista de Processos */}
      {loading ? (
        <div className="py-40 flex flex-col items-center justify-center gap-4">
           <Loader2 className="animate-spin text-indigo-600" size={48} />
           <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Consultando fluxos...</p>
        </div>
      ) : filteredProcesses.length === 0 ? (
        <div className="py-32 bg-white rounded-[4rem] border-2 border-dashed border-slate-100 text-center flex flex-col items-center justify-center">
           <div className="w-20 h-20 bg-slate-50 text-slate-200 rounded-full flex items-center justify-center mb-4">
              <ClipboardList size={40}/>
           </div>
           <h3 className="text-sm font-black text-slate-400 uppercase tracking-widest">Nenhum processo {activeSubTab === 'concluido' ? 'concluído' : 'pendente'} nesta categoria.</h3>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
          {filteredProcesses.map((p) => {
            const typeInfo = PROCESS_TYPES.find(t => t.id === p.type);
            const workflow = WORKFLOWS[p.type] || [];
            const stepIndex = workflow.indexOf(p.current_step) + 1;
            const progress = (stepIndex / workflow.length) * 100;
            const isCompleted = p.status === 'CONCLUÍDO';

            return (
              <div key={p.id} className="bg-white p-8 rounded-[3.5rem] border border-slate-100 shadow-[0_20px_50px_rgba(0,0,0,0.05)] group hover:border-indigo-300 transition-all flex flex-col xl:flex-row items-center gap-8 relative overflow-hidden">
                 <div className={`absolute left-0 top-0 h-full w-2.5 ${isCompleted ? 'bg-emerald-500' : 'bg-indigo-500'}`}></div>
                 
                 <div className="flex items-center gap-8 flex-1 w-full min-w-0">
                    <div className={`w-24 h-24 rounded-[2rem] flex items-center justify-center shrink-0 shadow-lg ${typeInfo?.color || 'bg-slate-100'}`}>
                       {p.type === 'FURTOS' ? <ShieldAlert size={36}/> : p.type === 'BANDEIRAS' ? <Flag size={36}/> : p.type.includes('DOACAO') ? <Gift size={36}/> : <Package size={36}/>}
                    </div>
                    
                    <div className="flex-1 min-w-0">
                       <div className="flex flex-wrap items-center gap-2 mb-3">
                          <span className="bg-slate-900 text-white text-[10px] font-black px-4 py-1.5 rounded-full uppercase tracking-widest shadow-sm">{p.schools?.name}</span>
                          <span className={`text-[10px] font-black px-4 py-1.5 rounded-full uppercase tracking-widest ${typeInfo?.color}`}>{p.type === 'FURTOS' ? p.subtype : typeInfo?.label}</span>
                       </div>
                       
                       <h3 className="text-3xl font-black text-slate-800 uppercase tracking-tight flex flex-col sm:flex-row sm:items-center gap-3">
                          SEI {p.sei_number}
                          <div className="flex items-center gap-2 text-slate-300 font-bold text-sm tracking-normal capitalize">
                            <Calendar size={16} className="text-indigo-400"/>
                            {new Date(p.process_date + 'T12:00:00').toLocaleDateString('pt-BR')}
                          </div>
                       </h3>
                       
                       <div className="mt-8 space-y-3">
                          <div className="flex justify-between items-end">
                             <p className={`text-[11px] font-black uppercase tracking-[0.1em] flex items-center gap-2 ${isCompleted ? 'text-emerald-600' : 'text-indigo-600'}`}>
                                <History size={16}/> {p.current_step}
                             </p>
                             <span className="text-xs font-black text-slate-400 tracking-tighter">{Math.round(progress)}% Concluído</span>
                          </div>
                          <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden p-0.5 border border-slate-50">
                             <div 
                                className={`h-full transition-all duration-1000 ease-out rounded-full ${isCompleted ? 'bg-emerald-500 shadow-[0_0_15px_rgba(16,185,129,0.4)]' : 'bg-indigo-500 shadow-[0_0_15_rgba(99,102,241,0.4)]'}`} 
                                style={{ width: `${progress}%` }} 
                             />
                          </div>
                       </div>
                    </div>
                 </div>

                 <div className="flex items-center gap-6 shrink-0 border-t xl:border-t-0 xl:border-l border-slate-50 pt-8 xl:pt-0 xl:pl-10 w-full xl:w-auto">
                    <div className="text-center xl:text-right flex-1 xl:flex-none">
                       <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-2">Situação Atual</p>
                       <span className={`px-6 py-2.5 rounded-2xl font-black text-[11px] uppercase tracking-widest shadow-inner border-2 ${
                          isCompleted ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 
                          p.status === 'CORREÇÃO' ? 'bg-red-50 text-red-600 border-red-100 animate-pulse' :
                          'bg-indigo-50 text-indigo-600 border-indigo-100'
                       }`}>
                          {p.status}
                       </span>
                    </div>
                    
                    <div className="flex gap-2">
                       <button 
                        onClick={() => openModal(p)} 
                        className="p-5 bg-slate-50 text-slate-400 hover:bg-indigo-600 hover:text-white rounded-[1.5rem] transition-all shadow-sm active:scale-95"
                       >
                          <Edit size={24}/>
                       </button>
                       {isAdmin && (
                         <button 
                          onClick={() => handleDelete(p.id)} 
                          className="p-5 bg-slate-50 text-slate-400 hover:bg-red-600 hover:text-white rounded-[1.5rem] transition-all shadow-sm active:scale-95"
                         >
                            <Trash2 size={24}/>
                         </button>
                       )}
                    </div>
                 </div>
              </div>
            );
          })}
        </div>
      )}

      {/* MODAL DE SELEÇÃO PARA EXPORTAÇÃO */}
      {showExportModal && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-900/90 backdrop-blur-sm p-4">
          <div className="bg-white rounded-[3rem] w-full max-w-lg shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-8 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-indigo-600 rounded-2xl flex items-center justify-center text-white shadow-xl shadow-indigo-100"><FileText size={24}/></div>
                <div>
                  <h2 className="text-xl font-black text-slate-800 uppercase tracking-tight leading-none">Exportar Relatório</h2>
                  <p className="text-[10px] text-indigo-600 font-bold uppercase tracking-widest mt-1">Geração de PDF</p>
                </div>
              </div>
              <button onClick={() => setShowExportModal(false)} className="p-2 hover:bg-white rounded-full transition-all text-slate-400"><X size={24}/></button>
            </div>
            
            <div className="p-8 space-y-6">
              <div className="space-y-3">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                  <Building2 size={14}/> Selecione a Abrangência
                </label>
                <select 
                  className="w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl font-bold text-slate-700 outline-none focus:border-indigo-500 transition-all shadow-inner"
                  value={exportTargetSchool}
                  onChange={(e) => setExportTargetSchool(e.target.value)}
                >
                  <option value="">Todas as Unidades Escolares</option>
                  {schools.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
            </div>

            <div className="p-8 border-t border-slate-100 bg-white flex justify-end gap-4">
              <button onClick={() => setShowExportModal(false)} className="px-6 py-4 font-black text-slate-400 uppercase text-[11px] hover:text-slate-700 tracking-widest">
                Cancelar
              </button>
              <button 
                onClick={() => setIsExporting(true)} 
                className="px-8 py-4 bg-indigo-600 text-white rounded-2xl font-black uppercase text-[11px] flex items-center gap-3 shadow-xl shadow-indigo-100 hover:bg-indigo-700 transition-all active:scale-95 tracking-widest"
              >
                <Download size={18}/> Confirmar e Gerar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Gestão */}
      {isModalOpen && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-900/90 backdrop-blur-md p-4 overflow-hidden">
          <div className="bg-white rounded-[3.5rem] w-full max-w-5xl max-h-[95vh] shadow-2xl animate-in zoom-in-95 duration-200 border border-white flex flex-col overflow-hidden">
            <div className="p-10 border-b border-slate-100 flex justify-between items-center bg-slate-50/50 shrink-0">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 bg-indigo-600 rounded-2xl flex items-center justify-center text-white shadow-xl shadow-indigo-100"><Package size={28}/></div>
                <div><h2 className="text-2xl font-black text-slate-800 uppercase tracking-tight leading-none">{editingProcess ? 'Atualizar Processo' : 'Novo Processo de Patrimônio'}</h2><p className="text-[10px] text-indigo-600 font-bold uppercase tracking-widest mt-2">Detalhamento Patrimonial Regional II</p></div>
              </div>
              <button onClick={() => setIsModalOpen(false)} className="p-3 hover:bg-white rounded-full transition-all text-slate-400 border border-transparent hover:border-slate-100"><X size={32}/></button>
            </div>

            <form onSubmit={handleSave} className="flex-1 flex flex-col overflow-hidden">
              <div className="p-10 space-y-10 overflow-y-auto custom-scrollbar flex-1">
                {formError && (
                  <div className="p-6 bg-red-50 border-2 border-red-100 rounded-[2rem] flex items-start gap-4 animate-in slide-in-from-top-2">
                    <AlertCircle className="text-red-600 shrink-0" size={24} />
                    <div>
                      <h4 className="text-sm font-black text-red-800 uppercase">Impossível Salvar</h4>
                      <p className="text-xs text-red-600 font-medium mt-1">{formError}</p>
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase ml-1 flex items-center gap-2"><Building2 size={12}/> Unidade Escolar</label>
                    <select required disabled={!isAdmin} className="w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl font-bold outline-none focus:border-indigo-500 disabled:opacity-50 transition-all shadow-inner" value={formData.school_id} onChange={e => setFormData({...formData, school_id: e.target.value})}>
                      <option value="">Selecione a Unidade...</option>
                      {schools.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase ml-1 flex items-center gap-2"><ClipboardList size={12}/> Tipo de Fluxo</label>
                    <select required className="w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl font-bold outline-none focus:border-indigo-500 transition-all shadow-inner" value={formData.type} onChange={e => setFormData({...formData, type: e.target.value})}>
                      {PROCESS_TYPES.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase ml-1 flex items-center gap-2"><FileText size={12}/> Nº Processo SEI</label>
                    <input required className="w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl font-mono font-bold text-indigo-600 focus:border-indigo-500 outline-none transition-all shadow-inner" placeholder="000.000.000/0000-00" value={formData.sei_number} onChange={e => setFormData({...formData, sei_number: e.target.value})} />
                  </div>
                </div>

                {formData.type === 'FURTOS' && (
                  <div className="space-y-12 animate-in slide-in-from-top-4 duration-500">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 p-8 bg-red-50/40 border border-red-100 rounded-[2.5rem] shadow-sm">
                       <div className="space-y-1.5"><label className="text-[10px] font-black text-red-500 uppercase ml-1">Tipo de Ocorrência</label><select className="w-full p-4 bg-white border border-red-100 rounded-xl font-bold outline-none" value={formData.subtype} onChange={e => setFormData({...formData, subtype: e.target.value})}><option value="Furto">Furto</option><option value="Roubo">Roubo</option><option value="Extravio">Extravio</option><option value="Incêndio">Incêndio</option><option value="Vandalismo">Vandalismo</option></select></div>
                       <div className="space-y-1.5"><label className="text-[10px] font-black text-red-500 uppercase ml-1">Data Ocorrência</label><input type="date" className="w-full p-4 bg-white border border-red-100 rounded-xl font-bold outline-none" value={formData.occurrence_date} onChange={e => setFormData({...formData, occurrence_date: e.target.value})} /></div>
                       <div className="space-y-1.5"><label className="text-[10px] font-black text-red-500 uppercase ml-1">Nº Boletim (B.O.)</label><input placeholder="B.O. 00000/2026" className="w-full p-4 bg-white border border-red-100 rounded-xl font-bold outline-none" value={formData.bulletin_number} onChange={e => setFormData({...formData, bulletin_number: e.target.value})} /></div>
                       <div className="space-y-1.5"><label className="text-[10px] font-black text-red-500 uppercase ml-1">Autoria Conhecida?</label><select className="w-full p-4 bg-white border border-red-100 rounded-xl font-bold outline-none" value={formData.authorship} onChange={e => setFormData({...formData, authorship: e.target.value})}><option value="Não conhecida">Não conhecida</option><option value="Conhecida">Conhecida</option></select></div>
                    </div>

                    <div className="space-y-6">
                       <div className="flex items-center justify-between px-2">
                          <h3 className="text-sm font-black text-slate-800 uppercase tracking-[0.2em] flex items-center gap-3"><ListPlus size={20} className="text-red-500"/> Relação Técnica de Itens</h3>
                          <button type="button" onClick={addSinistroItem} className="bg-slate-900 text-white px-8 py-3 rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-black transition-all flex items-center gap-3 shadow-lg active:scale-95"><Plus size={16}/> Adicionar Item</button>
                       </div>
                       
                       <div className="bg-white border border-slate-100 rounded-[3rem] overflow-hidden shadow-2xl">
                          <div className="overflow-x-auto">
                            <table className="w-full">
                               <thead className="bg-slate-50 border-b border-slate-100 text-[10px] font-black text-slate-400 uppercase tracking-[0.3em]">
                                  <tr><th className="p-6 text-left pl-10">Equipamento / Material</th><th className="p-6 text-center">Nº Patrimônio</th><th className="p-6 text-center">Valor Unitário (R$)</th><th className="p-6 text-right pr-10">Ações</th></tr>
                               </thead>
                               <tbody className="divide-y divide-slate-50">
                                  {sinistroItems.map((item, idx) => (
                                    <tr key={idx} className="group hover:bg-slate-50/50 transition-colors">
                                      <td className="p-4 pl-10"><input required placeholder="Descreva o item..." className="w-full p-3.5 bg-slate-50 border-2 border-transparent rounded-xl font-bold text-xs outline-none focus:border-red-400 focus:bg-white transition-all" value={item.name} onChange={e => updateSinistroItem(idx, 'name', e.target.value)} /></td>
                                      <td className="p-4"><input required placeholder="000.000" className="w-full p-3.5 bg-slate-50 border-2 border-transparent rounded-xl font-mono text-center font-bold text-xs outline-none focus:border-red-400 focus:bg-white transition-all" value={item.asset_number} onChange={e => updateSinistroItem(idx, 'asset_number', e.target.value)} /></td>
                                      <td className="p-4">
                                        <div className="relative group/val">
                                          <DollarSign size={14} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within/val:text-red-500 transition-colors"/>
                                          <input type="number" step="0.01" className="w-full p-3.5 pl-10 bg-slate-50 border-2 border-transparent rounded-xl font-black text-center text-sm outline-none focus:border-red-400 focus:bg-white transition-all" value={item.unit_value || ''} onChange={e => updateSinistroItem(idx, 'unit_value', Number(e.target.value))} />
                                        </div>
                                      </td>
                                      <td className="p-4 text-right pr-10"><button type="button" onClick={() => removeSinistroItem(idx)} className="p-3 text-slate-300 hover:text-red-600 hover:bg-red-50 rounded-xl transition-all active:scale-90"><Trash2 size={20}/></button></td>
                                    </tr>
                                  ))}
                               </tbody>
                            </table>
                          </div>
                          <div className="p-8 bg-slate-900 text-white flex flex-col sm:flex-row items-center justify-between gap-4">
                             <div className="flex items-center gap-4 text-white/40 font-black uppercase text-[10px] tracking-[0.2em]"><Calculator size={24}/> Total Geral do Prejuízo Calculado:</div>
                             <div className="text-4xl font-black text-red-400 tabular-nums shadow-sm shadow-red-900/50">R$ {totalSinistroValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div>
                          </div>
                       </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8 p-10 bg-slate-50/50 rounded-[3rem] border border-slate-100 shadow-inner">
                       <div className="space-y-3">
                          <label className="text-[10px] font-black text-slate-400 uppercase ml-1 flex items-center gap-2"><CheckCircle size={14}/> Conclusão Técnica</label>
                          <select className="w-full p-4 bg-white border border-slate-200 rounded-2xl font-bold outline-none focus:ring-4 focus:ring-indigo-500/5 transition-all shadow-sm" value={formData.conclusion} onChange={e => setFormData({...formData, conclusion: e.target.value})}>
                            <option value="EM ANDAMENTO">EM ANDAMENTO (APURAÇÃO)</option>
                            <option value="ENCERRADO COMO CONCLUIDO PELA RESPONSÁBILIDADE">ENCERRADO PELA RESPONSABILIDADE</option>
                            <option value="ENCERRADO COMO CONCLUIDO PELA NÃO RESPONSÁBILIDADE">ENCERRADO PELA NÃO RESPONSABILIDADE</option>
                            <option value="NÃO INSTAURADO">NÃO INSTAURADO</option>
                          </select>
                       </div>
                       <div className="space-y-3">
                          <label className="text-[10px] font-black text-slate-400 uppercase ml-1 flex items-center gap-2"><ShieldAlert size={14}/> NL de Baixa Patrimonial</label>
                          <select className="w-full p-4 bg-white border border-slate-200 rounded-2xl font-bold outline-none focus:ring-4 focus:ring-indigo-500/5 transition-all shadow-sm" value={formData.is_nl_low ? 'Sim' : 'Não'} onChange={e => setFormData({...formData, is_nl_low: e.target.value === 'Sim'})}>
                            <option value="Não">Não (Pendente de Registro no SAM)</option>
                            <option value="Sim">Sim (Baixa Efetivada)</option>
                          </select>
                       </div>
                    </div>
                  </div>
                )}

                {/* Fluxograma Regional */}
                <div className="space-y-8">
                   <div className="flex items-center gap-4 px-2">
                      <div className="w-1.5 h-8 bg-indigo-600 rounded-full"></div>
                      <h3 className="text-xl font-black text-slate-800 uppercase tracking-tight">Status da Etapa no Fluxograma</h3>
                   </div>
                   
                   <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {WORKFLOWS[formData.type].map((step, idx) => {
                        const active = formData.current_step === step;
                        const past = WORKFLOWS[formData.type].indexOf(formData.current_step) > idx;
                        return (
                          <button 
                           key={step} 
                           type="button" 
                           onClick={() => setFormData({...formData, current_step: step})} 
                           className={`p-6 rounded-[2rem] border-2 text-left flex flex-col justify-between h-28 transition-all hover:scale-[1.02] active:scale-95 ${
                             active 
                               ? 'bg-indigo-600 border-indigo-600 text-white shadow-2xl shadow-indigo-100' 
                               : past 
                               ? 'bg-indigo-50 border-indigo-100 text-indigo-700' 
                               : 'bg-slate-50 border-slate-100 text-slate-400 opacity-60'
                           }`}
                          >
                             <div className="flex justify-between items-start">
                                <span className="text-2xl font-black opacity-30 italic">{idx + 1}</span>
                                {past && !active && <CheckCircle2 size={18} className="text-indigo-400"/>}
                                {active && <div className="w-2 h-2 rounded-full bg-white animate-ping"></div>}
                             </div>
                             <span className="text-[10px] font-black uppercase leading-tight tracking-widest">{step}</span>
                          </button>
                        );
                      })}
                   </div>
                </div>

                {/* Status Final da Ficha */}
                <div className="space-y-4">
                   <label className="text-[10px] font-black text-slate-400 uppercase ml-1 tracking-[0.2em] px-2 flex items-center gap-2"><LayoutGrid size={14}/> Categoria de Status Final</label>
                   <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 px-2">
                      {['RECEBIDO', 'EM APURAÇÃO', 'CONCLUÍDO', 'CORREÇÃO'].map(s => (
                        <button 
                         key={s} 
                         type="button" 
                         onClick={() => setFormData({...formData, status: s})} 
                         className={`p-4 rounded-2xl text-[10px] font-black uppercase tracking-widest border-2 transition-all ${
                           formData.status === s 
                             ? 'bg-slate-900 border-slate-900 text-white shadow-xl' 
                             : 'bg-white border-slate-100 text-slate-400 hover:border-slate-300'
                         }`}
                        >
                          {s}
                        </button>
                      ))}
                   </div>
                </div>
              </div>

              {/* Rodapé Fixo */}
              <div className="p-10 border-t border-slate-100 bg-white shrink-0 flex justify-end gap-5">
                 <button type="button" onClick={() => setIsModalOpen(false)} className="px-10 py-5 text-slate-400 font-black hover:text-slate-700 transition-all uppercase tracking-[0.2em] text-[11px]">Cancelar Operação</button>
                 <button 
                  type="submit" 
                  disabled={saveLoading} 
                  className="px-20 py-5 bg-indigo-600 text-white rounded-[2rem] font-black shadow-2xl shadow-indigo-100 hover:bg-indigo-700 flex items-center justify-center gap-4 transition-all active:scale-95"
                 >
                   {saveLoading ? <Loader2 className="animate-spin" size={24}/> : <Save size={24}/>}
                   {editingProcess ? 'ACTUALIZAR PROCESSO NO SISTEMA' : 'LANÇAR NOVO PROCESSO'}
                 </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Informativo Técnico Regional */}
      <div className="bg-slate-900 p-10 rounded-[4rem] text-white shadow-2xl relative overflow-hidden group">
         <Info className="absolute -right-6 -bottom-6 text-white/5 group-hover:scale-110 transition-transform" size={180} />
         <div className="flex items-start gap-8 relative z-10">
            <div className="p-5 bg-white/10 rounded-[1.8rem] backdrop-blur-md border border-white/5 shadow-xl"><Info size={32} className="text-indigo-400"/></div>
            <div>
               <h4 className="text-lg font-black uppercase tracking-tight mb-3">Normatização Técnica GSU II</h4>
               <p className="text-sm text-white/60 leading-relaxed font-medium uppercase italic max-w-3xl">
                  Lembre-se que processos de <strong className="text-emerald-400">Doação</strong> dependem da publicação em Diário Oficial (DOE) para validação legal. 
                  Em <strong className="text-red-400">Sinistros</strong>, o valor total calculado deve coincidir com os registros contábeis para baixa patrimonial via SAM.
                  O status <strong className="text-amber-400">Inservíveis</strong> exige laudo técnico da Regional antes do encaminhamento ao EAMEX.
               </p>
            </div>
         </div>
      </div>
    </div>
  );
}

export default PatrimonioProcessos;
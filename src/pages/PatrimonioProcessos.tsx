import React, { useState, useEffect, useMemo, useRef } from 'react';
import { supabase } from '../lib/supabase';
import {
  Package, Plus, Search, FileText,
  Trash2, Edit, X, Save, Loader2,
  Building2, Info, CheckCircle2,
  Calendar, Eye,
  AlertCircle, History, Flag, ShieldAlert, Gift,
  ClipboardList, DollarSign, ListPlus, Calculator,
  LayoutGrid, CheckCircle, Download, BarChart2, TrendingUp,
  FileDown
} from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, Legend } from 'recharts';
import jsPDF from 'jspdf';
import { addTimbradoAllPages } from '../lib/pdfTimbrado';
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

  const [isExporting, setIsExporting] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [exportTargetSchool, setExportTargetSchool] = useState('');

  const [userRole, setUserRole] = useState('');
  const [userSchoolId, setUserSchoolId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  const dashboardRef = useRef<HTMLDivElement>(null);

  const [activeMainTab, setActiveMainTab] = useState<'doacao' | 'furtos' | 'inserviveis' | 'bandeiras'>('doacao');
  const [activeSubTab, setActiveSubTab] = useState<'pendente' | 'concluido'>('pendente');

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
  const isReadOnly = !!editingProcess && !isAdmin;

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
    const taxaConclusao = total > 0 ? Math.round((concluidos / total) * 100) : 0;

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

    const schoolCounts: Record<string, { name: string, Processos: number }> = {};
    activeProcesses.forEach(p => {
      const fullName = p.schools?.name || 'Não informada';
      if (!schoolCounts[fullName]) schoolCounts[fullName] = { name: fullName, Processos: 0 };
      schoolCounts[fullName].Processos += 1;
    });

    const schoolRankingData = Object.values(schoolCounts)
      .sort((a, b) => b.Processos - a.Processos)
      .slice(0, 10);

    return { total, concluidos, pendentes, taxaConclusao, chartData, schoolRankingData };
  }, [activeProcesses]);

  useEffect(() => {
    if (!isExporting) return;

    const generatePDF = async () => {
      await new Promise(resolve => setTimeout(resolve, 500));

      try {
        const doc = new jsPDF('landscape');
        const pdfWidth = doc.internal.pageSize.getWidth();
        const margin = 14;
        let currentY = 36;

        doc.setFontSize(14);
        doc.setTextColor(79, 70, 229);
        doc.text('Relatório de Processos de Patrimônio — SGE-GSU-II', margin, currentY);

        currentY += 8;
        doc.setFontSize(10);
        doc.setTextColor(100);

        const schoolName = exportTargetSchool
          ? schools.find(s => s.id === exportTargetSchool)?.name
          : 'Todas as Unidades Escolares';

        doc.text(`Filtro Aplicado: ${schoolName}`, margin, currentY);
        currentY += 6;
        doc.text(`Gerado em: ${new Date().toLocaleDateString('pt-BR')} às ${new Date().toLocaleTimeString('pt-BR')}`, margin, currentY);
        currentY += 6;
        doc.text(`Total: ${dashboardMetrics.total} processos | Concluídos: ${dashboardMetrics.concluidos} | Em Andamento: ${dashboardMetrics.pendentes} | Taxa de Conclusão: ${dashboardMetrics.taxaConclusao}%`, margin, currentY);

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

        addTimbradoAllPages(doc);
        doc.save(`Relatorio_Patrimonio_${new Date().toISOString().split('T')[0]}.pdf`);
      } catch (error) {
        console.error("Erro ao gerar PDF:", error);
        alert("Ocorreu um erro ao gerar o relatório.");
      } finally {
        setIsExporting(false);
        setShowExportModal(false);
      }
    };

    generatePDF();
  }, [isExporting, activeProcesses, exportTargetSchool, schools]);

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

    if (editingProcess && !isAdmin) {
      setFormError("Apenas usuários com perfil Regional podem atualizar processos.");
      return;
    }

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
    if (!isAdmin) {
      alert("Sem permissão para excluir.");
      return;
    }
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
    { id: 'doacao', label: 'Doação', icon: <Gift size={15}/>, activeClass: 'bg-emerald-600 text-white shadow-md shadow-emerald-200' },
    { id: 'furtos', label: 'Sinistros', icon: <ShieldAlert size={15}/>, activeClass: 'bg-red-600 text-white shadow-md shadow-red-200' },
    { id: 'inserviveis', label: 'Inservíveis', icon: <Trash2 size={15}/>, activeClass: 'bg-amber-500 text-white shadow-md shadow-amber-200' },
    { id: 'bandeiras', label: 'Bandeiras', icon: <Flag size={15}/>, activeClass: 'bg-blue-600 text-white shadow-md shadow-blue-200' }
  ] as const;

  const catColorMap = {
    doacao: { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200', bar: 'bg-emerald-500', icon: 'text-emerald-600' },
    furtos: { bg: 'bg-red-50', text: 'text-red-700', border: 'border-red-200', bar: 'bg-red-500', icon: 'text-red-600' },
    inserviveis: { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200', bar: 'bg-amber-500', icon: 'text-amber-600' },
    bandeiras: { bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200', bar: 'bg-blue-500', icon: 'text-blue-600' },
  };

  return (
    <div className="min-h-screen bg-slate-50/80 pb-16">

      {/* ── PAGE HEADER ─────────────────────────────────────────── */}
      <div className="bg-white border-b border-slate-200/80 shadow-sm mb-6">
        <div className="px-4 sm:px-6 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-indigo-500 to-violet-600 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-200 shrink-0">
              <Package size={20} className="text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-slate-900 leading-tight tracking-tight">Processos de Patrimônio</h1>
              <p className="text-xs text-slate-400 font-medium">Monitoramento e Fluxo Regional — SGE-GSU-II</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowExportModal(true)}
              disabled={isExporting}
              className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-semibold rounded-xl border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:border-slate-300 transition-all disabled:opacity-60 shadow-sm active:scale-[0.98]"
            >
              {isExporting ? <Loader2 size={15} className="animate-spin" /> : <FileDown size={15} />}
              {isExporting ? 'Gerando PDF...' : 'Exportar PDF'}
            </button>
            <button
              onClick={() => openModal()}
              className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-semibold rounded-xl bg-indigo-600 text-white hover:bg-indigo-700 transition-all shadow-md shadow-indigo-200 active:scale-[0.98]"
            >
              <Plus size={15} /> Novo Processo
            </button>
          </div>
        </div>
      </div>

      <div className="px-4 sm:px-6 space-y-6">

        {/* ── DASHBOARD (capturado para PDF) ────────────────────── */}
        <div ref={dashboardRef} className="space-y-4 p-4 bg-white rounded-2xl border border-slate-100 shadow-sm">

          {/* KPI Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-gradient-to-br from-indigo-50 to-white rounded-2xl border border-indigo-100 p-5 flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-indigo-100 flex items-center justify-center shrink-0">
                <ClipboardList size={22} className="text-indigo-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-indigo-400 uppercase tracking-wider mb-0.5">Total de Processos</p>
                <p className="text-3xl font-bold text-indigo-700 tabular-nums">{dashboardMetrics.total}</p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-xs font-bold text-indigo-300">100%</p>
                <div className="w-14 h-1.5 bg-indigo-100 rounded-full mt-1.5">
                  <div className="h-full w-full bg-indigo-500 rounded-full" />
                </div>
              </div>
            </div>

            <div className="bg-gradient-to-br from-emerald-50 to-white rounded-2xl border border-emerald-100 p-5 flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-emerald-100 flex items-center justify-center shrink-0">
                <CheckCircle size={22} className="text-emerald-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-emerald-400 uppercase tracking-wider mb-0.5">Concluídos</p>
                <p className="text-3xl font-bold text-emerald-600 tabular-nums">{dashboardMetrics.concluidos}</p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-xs font-bold text-emerald-400">{dashboardMetrics.taxaConclusao}%</p>
                <div className="w-14 h-1.5 bg-emerald-100 rounded-full mt-1.5">
                  <div className="h-full bg-emerald-500 rounded-full transition-all duration-700" style={{ width: `${dashboardMetrics.taxaConclusao}%` }} />
                </div>
              </div>
            </div>

            <div className="bg-gradient-to-br from-amber-50 to-white rounded-2xl border border-amber-100 p-5 flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-amber-100 flex items-center justify-center shrink-0">
                <History size={22} className="text-amber-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-amber-400 uppercase tracking-wider mb-0.5">Em Andamento</p>
                <p className="text-3xl font-bold text-amber-600 tabular-nums">{dashboardMetrics.pendentes}</p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-xs font-bold text-amber-400">
                  {dashboardMetrics.total > 0 ? Math.round((dashboardMetrics.pendentes / dashboardMetrics.total) * 100) : 0}%
                </p>
                <div className="w-14 h-1.5 bg-amber-100 rounded-full mt-1.5">
                  <div className="h-full bg-amber-500 rounded-full transition-all duration-700" style={{ width: `${dashboardMetrics.total > 0 ? (dashboardMetrics.pendentes / dashboardMetrics.total) * 100 : 0}%` }} />
                </div>
              </div>
            </div>
          </div>

          {/* Charts */}
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <div className="bg-slate-50 rounded-2xl border border-slate-100 p-5">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <BarChart2 size={17} className="text-indigo-500" />
                  <h3 className="text-sm font-bold text-slate-700">Distribuição por Tipo</h3>
                </div>
                <span className="text-xs text-slate-400 font-medium bg-white px-2.5 py-1 rounded-lg border border-slate-100">Por categoria</span>
              </div>
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={dashboardMetrics.chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                    <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 10, fontWeight: 600 }} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 11, fontWeight: 600 }} />
                    <RechartsTooltip
                      cursor={{ fill: '#f8fafc' }}
                      contentStyle={{ borderRadius: '10px', border: '1px solid #e2e8f0', boxShadow: '0 4px 12px rgba(0,0,0,0.06)', fontSize: '12px' }}
                    />
                    <Legend wrapperStyle={{ paddingTop: '12px', fontWeight: 600, fontSize: '11px' }} />
                    <Bar dataKey="Pendentes" stackId="a" fill="#fbbf24" radius={[0, 0, 4, 4]} maxBarSize={44} isAnimationActive={!isExporting} />
                    <Bar dataKey="Concluídos" stackId="a" fill="#10b981" radius={[4, 4, 0, 0]} maxBarSize={44} isAnimationActive={!isExporting} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="bg-slate-50 rounded-2xl border border-slate-100 p-5">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <TrendingUp size={17} className="text-blue-500" />
                  <h3 className="text-sm font-bold text-slate-700">Processos por Unidade Escolar</h3>
                </div>
                <span className="text-xs text-slate-400 font-medium bg-white px-2.5 py-1 rounded-lg border border-slate-100">Top 10</span>
              </div>
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={dashboardMetrics.schoolRankingData} layout="vertical" margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e2e8f0" />
                    <XAxis type="number" axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 11, fontWeight: 600 }} />
                    <YAxis dataKey="name" type="category" axisLine={false} tickLine={false} tick={{ fill: '#475569', fontSize: 9, fontWeight: 600 }} width={190} />
                    <RechartsTooltip
                      cursor={{ fill: '#f8fafc' }}
                      contentStyle={{ borderRadius: '10px', border: '1px solid #e2e8f0', boxShadow: '0 4px 12px rgba(0,0,0,0.06)', fontSize: '12px' }}
                    />
                    <Bar dataKey="Processos" fill="#6366f1" radius={[0, 4, 4, 0]} barSize={16} isAnimationActive={!isExporting} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        </div>

        {/* ── FILTERS & TABS ────────────────────────────────────── */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-3 flex flex-col lg:flex-row gap-3 items-start lg:items-center">
          <div className="flex flex-wrap gap-1.5 flex-1">
            {mainTabs.map(tab => (
              <button
                key={tab.id}
                onClick={() => { setActiveMainTab(tab.id); setActiveSubTab('pendente'); }}
                className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold transition-all ${
                  activeMainTab === tab.id
                    ? tab.activeClass
                    : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700'
                }`}
              >
                {tab.icon} {tab.label}
              </button>
            ))}
          </div>

          <div className="flex gap-1.5 shrink-0">
            <button
              onClick={() => setActiveSubTab('pendente')}
              className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all ${
                activeSubTab === 'pendente'
                  ? 'bg-amber-50 text-amber-700 border border-amber-200'
                  : 'text-slate-400 hover:bg-slate-50 hover:text-slate-600'
              }`}
            >
              Não Concluídos
            </button>
            <button
              onClick={() => setActiveSubTab('concluido')}
              className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all ${
                activeSubTab === 'concluido'
                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                  : 'text-slate-400 hover:bg-slate-50 hover:text-slate-600'
              }`}
            >
              Concluídos
            </button>
          </div>
        </div>

        {/* ── SEARCH ────────────────────────────────────────────── */}
        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
          <input
            type="text"
            placeholder="Pesquisar por Nº SEI ou Unidade Escolar..."
            className="w-full pl-11 pr-4 py-3 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 text-sm font-medium text-slate-700 outline-none transition-all shadow-sm"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        {/* ── PROCESS LIST ──────────────────────────────────────── */}
        {loading ? (
          <div className="py-24 flex flex-col items-center justify-center gap-3">
            <Loader2 className="animate-spin text-indigo-500" size={36} />
            <p className="text-sm font-medium text-slate-400">Consultando fluxos...</p>
          </div>
        ) : filteredProcesses.length === 0 ? (
          <div className="py-20 bg-white rounded-2xl border-2 border-dashed border-slate-200 text-center flex flex-col items-center justify-center gap-3">
            <div className="w-14 h-14 bg-slate-100 text-slate-300 rounded-2xl flex items-center justify-center">
              <ClipboardList size={28} />
            </div>
            <p className="text-sm font-semibold text-slate-400">
              Nenhum processo {activeSubTab === 'concluido' ? 'concluído' : 'pendente'} nesta categoria.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredProcesses.map((p) => {
              const typeInfo = PROCESS_TYPES.find(t => t.id === p.type);
              const workflow = WORKFLOWS[p.type] || [];
              const stepIndex = workflow.indexOf(p.current_step) + 1;
              const progress = (stepIndex / workflow.length) * 100;
              const isCompleted = p.status === 'CONCLUÍDO';
              const catColor = isCompleted
                ? { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200', bar: 'bg-emerald-500', icon: 'text-emerald-600' }
                : catColorMap[typeInfo?.category as keyof typeof catColorMap] || catColorMap.doacao;

              return (
                <div
                  key={p.id}
                  className="bg-white rounded-2xl border border-slate-100 shadow-sm hover:shadow-md hover:border-indigo-100 transition-all group overflow-hidden"
                >
                  <div className={`h-0.5 w-full ${isCompleted ? 'bg-emerald-500' : catColor.bar}`} />
                  <div className="p-5 flex flex-col sm:flex-row sm:items-center gap-4">
                    {/* Icon */}
                    <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${catColor.bg}`}>
                      {p.type === 'FURTOS'
                        ? <ShieldAlert size={20} className={catColor.icon} />
                        : p.type === 'BANDEIRAS'
                        ? <Flag size={20} className={catColor.icon} />
                        : p.type.includes('DOACAO')
                        ? <Gift size={20} className={catColor.icon} />
                        : <Package size={20} className={catColor.icon} />}
                    </div>

                    {/* Main info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2 mb-1.5">
                        <span className="text-xs font-bold text-slate-700 bg-slate-100 px-2.5 py-1 rounded-lg truncate max-w-xs">
                          {p.schools?.name}
                        </span>
                        <span className={`text-xs font-semibold px-2.5 py-1 rounded-lg border ${catColor.bg} ${catColor.text} ${catColor.border}`}>
                          {p.type === 'FURTOS' ? p.subtype : typeInfo?.label}
                        </span>
                        <span className="text-xs text-slate-400 flex items-center gap-1 ml-auto sm:ml-0">
                          <Calendar size={12} className="text-indigo-400" />
                          {new Date(p.process_date + 'T12:00:00').toLocaleDateString('pt-BR')}
                        </span>
                      </div>

                      <p className="text-base font-bold text-slate-800 font-mono tracking-tight">SEI {p.sei_number}</p>

                      <div className="mt-3 space-y-1.5">
                        <div className="flex items-center justify-between">
                          <p className="text-xs font-medium text-slate-500 flex items-center gap-1.5 truncate">
                            <History size={12} className="text-indigo-400 shrink-0" />
                            <span className="truncate">{p.current_step}</span>
                          </p>
                          <span className="text-xs font-semibold text-slate-400 ml-2 shrink-0">{Math.round(progress)}%</span>
                        </div>
                        <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                          <div
                            className={`h-full transition-all duration-700 rounded-full ${isCompleted ? 'bg-emerald-500' : catColor.bar}`}
                            style={{ width: `${progress}%` }}
                          />
                        </div>
                      </div>
                    </div>

                    {/* Status + Actions */}
                    <div className="flex items-center gap-3 sm:shrink-0">
                      <span className={`px-3 py-1.5 rounded-lg font-semibold text-xs border ${
                        isCompleted ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                        p.status === 'CORREÇÃO' ? 'bg-red-50 text-red-700 border-red-200' :
                        'bg-indigo-50 text-indigo-700 border-indigo-200'
                      }`}>
                        {p.status}
                      </span>

                      <div className="flex gap-1">
                        <button
                          onClick={() => openModal(p)}
                          className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all"
                          title={isAdmin ? 'Editar Processo' : 'Visualizar Processo'}
                        >
                          {isAdmin ? <Edit size={16} /> : <Eye size={16} />}
                        </button>
                        {isAdmin && (
                          <button
                            onClick={() => handleDelete(p.id)}
                            className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
                            title="Excluir Processo"
                          >
                            <Trash2 size={16} />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ── INFO PANEL ────────────────────────────────────────── */}
        <div className="bg-slate-900 rounded-2xl p-6 text-white">
          <div className="flex items-start gap-4">
            <div className="p-2.5 bg-white/10 rounded-xl shrink-0">
              <Info size={18} className="text-indigo-400" />
            </div>
            <div>
              <h4 className="text-sm font-bold uppercase tracking-wide mb-1.5">Normatização Técnica GSU II</h4>
              <p className="text-xs text-white/60 leading-relaxed">
                Processos de <strong className="text-emerald-400">Doação</strong> dependem da publicação em Diário Oficial (DOE) para validação legal.
                Em <strong className="text-red-400">Sinistros</strong>, o valor total calculado deve coincidir com os registros contábeis para baixa patrimonial via SAM.
                O status <strong className="text-amber-400">Inservíveis</strong> exige laudo técnico da Regional antes do encaminhamento ao EAMEX.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* ── EXPORT MODAL ──────────────────────────────────────────── */}
      {showExportModal && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-900/80 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl border border-slate-100 animate-in zoom-in-95 duration-200 overflow-hidden">
            <div className="p-6 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center shadow-md shadow-indigo-200">
                  <FileDown size={18} className="text-white" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-slate-800">Exportar Relatório em PDF</h2>
                  <p className="text-xs text-slate-400 font-medium mt-0.5">Inclui gráficos e métricas completas</p>
                </div>
              </div>
              <button
                onClick={() => setShowExportModal(false)}
                className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400 transition-all"
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div className="space-y-2">
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                  <Building2 size={13} /> Filtrar por Unidade Escolar
                </label>
                <select
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-700 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/10 transition-all"
                  value={exportTargetSchool}
                  onChange={(e) => setExportTargetSchool(e.target.value)}
                >
                  <option value="">Todas as Unidades Escolares</option>
                  {schools.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>

              <div className="bg-indigo-50 rounded-xl p-3 flex items-start gap-2.5 border border-indigo-100">
                <Info size={14} className="text-indigo-500 shrink-0 mt-0.5" />
                <p className="text-xs text-indigo-700 font-medium leading-relaxed">
                  O PDF incluirá os gráficos de distribuição e ranking por escola, métricas de resumo e a tabela completa de processos.
                </p>
              </div>
            </div>

            <div className="p-6 border-t border-slate-100 flex justify-end gap-3">
              <button
                onClick={() => setShowExportModal(false)}
                className="px-4 py-2.5 text-sm font-semibold text-slate-500 hover:text-slate-700 hover:bg-slate-50 rounded-xl transition-all"
              >
                Cancelar
              </button>
              <button
                onClick={() => setIsExporting(true)}
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-indigo-600 text-white text-sm font-semibold rounded-xl shadow-md shadow-indigo-200 hover:bg-indigo-700 transition-all active:scale-[0.98]"
              >
                <Download size={15} /> Gerar PDF
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── PROCESS MODAL ─────────────────────────────────────────── */}
      {isModalOpen && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-900/80 backdrop-blur-md p-4">
          <div className="bg-white rounded-2xl w-full max-w-4xl max-h-[95vh] shadow-2xl animate-in zoom-in-95 duration-200 flex flex-col overflow-hidden border border-slate-100">

            {/* Modal header */}
            <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50/50 shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 bg-indigo-600 rounded-xl flex items-center justify-center shadow-md shadow-indigo-200">
                  <Package size={17} className="text-white" />
                </div>
                <div>
                  <h2 className="text-sm font-bold text-slate-800">
                    {editingProcess ? (isReadOnly ? 'Visualizar Processo' : 'Atualizar Processo') : 'Novo Processo de Patrimônio'}
                  </h2>
                  <p className="text-xs text-indigo-500 font-semibold mt-0.5">Detalhamento Patrimonial Regional II</p>
                </div>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="p-2 hover:bg-slate-100 rounded-xl text-slate-400 transition-all"
              >
                <X size={18} />
              </button>
            </div>

            {/* Modal body */}
            <form onSubmit={handleSave} className="flex-1 flex flex-col overflow-hidden">
              <div className="p-6 space-y-7 overflow-y-auto flex-1">

                {formError && (
                  <div className="p-4 bg-red-50 border border-red-200 rounded-xl flex items-start gap-3 animate-in slide-in-from-top-2">
                    <AlertCircle className="text-red-500 shrink-0 mt-0.5" size={17} />
                    <div>
                      <h4 className="text-sm font-bold text-red-800">Impossível Salvar</h4>
                      <p className="text-xs text-red-600 font-medium mt-0.5">{formError}</p>
                    </div>
                  </div>
                )}

                {/* Basic info fields */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                      <Building2 size={12} /> Unidade Escolar
                    </label>
                    <select required disabled={!isAdmin} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium outline-none focus:border-indigo-400 disabled:opacity-50 transition-all" value={formData.school_id} onChange={e => setFormData({ ...formData, school_id: e.target.value })}>
                      <option value="">Selecione a Unidade...</option>
                      {schools.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                      <ClipboardList size={12} /> Tipo de Fluxo
                    </label>
                    <select required disabled={isReadOnly} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium outline-none focus:border-indigo-400 disabled:opacity-50 transition-all" value={formData.type} onChange={e => setFormData({ ...formData, type: e.target.value })}>
                      {PROCESS_TYPES.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                      <FileText size={12} /> Nº Processo SEI
                    </label>
                    <input required disabled={isReadOnly} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-mono text-sm font-semibold text-indigo-600 focus:border-indigo-400 outline-none disabled:opacity-50 transition-all" placeholder="000.000.000/0000-00" value={formData.sei_number} onChange={e => setFormData({ ...formData, sei_number: e.target.value })} />
                  </div>
                </div>

                {/* FURTOS specific section */}
                {formData.type === 'FURTOS' && (
                  <div className="space-y-6 animate-in slide-in-from-top-4 duration-500">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 p-5 bg-red-50 border border-red-100 rounded-2xl">
                      <div className="space-y-1.5">
                        <label className="text-xs font-semibold text-red-400 uppercase tracking-wider">Tipo de Ocorrência</label>
                        <select disabled={isReadOnly} className="w-full p-3 bg-white border border-red-100 rounded-xl text-sm font-medium outline-none disabled:opacity-50" value={formData.subtype} onChange={e => setFormData({ ...formData, subtype: e.target.value })}>
                          <option value="Furto">Furto</option><option value="Roubo">Roubo</option><option value="Extravio">Extravio</option><option value="Incêndio">Incêndio</option><option value="Vandalismo">Vandalismo</option>
                        </select>
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-xs font-semibold text-red-400 uppercase tracking-wider">Data Ocorrência</label>
                        <input disabled={isReadOnly} type="date" className="w-full p-3 bg-white border border-red-100 rounded-xl text-sm font-medium outline-none disabled:opacity-50" value={formData.occurrence_date} onChange={e => setFormData({ ...formData, occurrence_date: e.target.value })} />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-xs font-semibold text-red-400 uppercase tracking-wider">Nº Boletim (B.O.)</label>
                        <input disabled={isReadOnly} placeholder="B.O. 00000/2026" className="w-full p-3 bg-white border border-red-100 rounded-xl text-sm font-medium outline-none disabled:opacity-50" value={formData.bulletin_number} onChange={e => setFormData({ ...formData, bulletin_number: e.target.value })} />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-xs font-semibold text-red-400 uppercase tracking-wider">Autoria Conhecida?</label>
                        <select disabled={isReadOnly} className="w-full p-3 bg-white border border-red-100 rounded-xl text-sm font-medium outline-none disabled:opacity-50" value={formData.authorship} onChange={e => setFormData({ ...formData, authorship: e.target.value })}>
                          <option value="Não conhecida">Não conhecida</option><option value="Conhecida">Conhecida</option>
                        </select>
                      </div>
                    </div>

                    {/* Items table */}
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                          <ListPlus size={16} className="text-red-500" /> Relação de Itens
                        </h3>
                        {!isReadOnly && (
                          <button type="button" onClick={addSinistroItem} className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-2 bg-slate-900 text-white rounded-xl hover:bg-black transition-all">
                            <Plus size={13} /> Adicionar Item
                          </button>
                        )}
                      </div>

                      <div className="border border-slate-100 rounded-2xl overflow-hidden shadow-sm">
                        <div className="overflow-x-auto">
                          <table className="w-full">
                            <thead className="bg-slate-50 border-b border-slate-100">
                              <tr>
                                <th className="p-3 text-left text-xs font-bold text-slate-400 uppercase tracking-wider">Equipamento / Material</th>
                                <th className="p-3 text-center text-xs font-bold text-slate-400 uppercase tracking-wider">Nº Patrimônio</th>
                                <th className="p-3 text-center text-xs font-bold text-slate-400 uppercase tracking-wider">Valor (R$)</th>
                                <th className="p-3 text-right text-xs font-bold text-slate-400 uppercase tracking-wider">Ação</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-50">
                              {sinistroItems.map((item, idx) => (
                                <tr key={idx} className="hover:bg-slate-50/50 transition-colors">
                                  <td className="p-2.5">
                                    <input required disabled={isReadOnly} placeholder="Descreva o item..." className="w-full p-2.5 bg-slate-50 border border-transparent rounded-lg text-xs font-medium outline-none focus:border-red-300 focus:bg-white disabled:opacity-50 transition-all" value={item.name} onChange={e => updateSinistroItem(idx, 'name', e.target.value)} />
                                  </td>
                                  <td className="p-2.5">
                                    <input required disabled={isReadOnly} placeholder="000.000" className="w-full p-2.5 bg-slate-50 border border-transparent rounded-lg font-mono text-center text-xs font-medium outline-none focus:border-red-300 focus:bg-white disabled:opacity-50 transition-all" value={item.asset_number} onChange={e => updateSinistroItem(idx, 'asset_number', e.target.value)} />
                                  </td>
                                  <td className="p-2.5">
                                    <div className="relative">
                                      <DollarSign size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                                      <input disabled={isReadOnly} type="number" step="0.01" className="w-full p-2.5 pl-7 bg-slate-50 border border-transparent rounded-lg text-center text-xs font-semibold outline-none focus:border-red-300 focus:bg-white disabled:opacity-50 transition-all" value={item.unit_value || ''} onChange={e => updateSinistroItem(idx, 'unit_value', Number(e.target.value))} />
                                    </div>
                                  </td>
                                  <td className="p-2.5 text-right">
                                    {!isReadOnly && (
                                      <button type="button" onClick={() => removeSinistroItem(idx)} className="p-2 text-slate-300 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all">
                                        <Trash2 size={14} />
                                      </button>
                                    )}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                        <div className="p-4 bg-slate-900 text-white flex items-center justify-between">
                          <div className="flex items-center gap-2 text-white/40 text-xs font-bold uppercase tracking-wider">
                            <Calculator size={15} /> Total do Prejuízo:
                          </div>
                          <span className="text-xl font-bold text-red-400 tabular-nums">
                            R$ {totalSinistroValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Conclusion fields */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-5 bg-slate-50 rounded-2xl border border-slate-100">
                      <div className="space-y-1.5">
                        <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                          <CheckCircle size={12} /> Conclusão Técnica
                        </label>
                        <select disabled={isReadOnly} className="w-full p-3 bg-white border border-slate-200 rounded-xl text-sm font-medium outline-none focus:border-indigo-400 disabled:opacity-50 transition-all" value={formData.conclusion} onChange={e => setFormData({ ...formData, conclusion: e.target.value })}>
                          <option value="EM ANDAMENTO">EM ANDAMENTO (APURAÇÃO)</option>
                          <option value="ENCERRADO COMO CONCLUIDO PELA RESPONSÁBILIDADE">ENCERRADO PELA RESPONSABILIDADE</option>
                          <option value="ENCERRADO COMO CONCLUIDO PELA NÃO RESPONSÁBILIDADE">ENCERRADO PELA NÃO RESPONSABILIDADE</option>
                          <option value="NÃO INSTAURADO">NÃO INSTAURADO</option>
                        </select>
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                          <ShieldAlert size={12} /> NL de Baixa Patrimonial
                        </label>
                        <select disabled={isReadOnly} className="w-full p-3 bg-white border border-slate-200 rounded-xl text-sm font-medium outline-none focus:border-indigo-400 disabled:opacity-50 transition-all" value={formData.is_nl_low ? 'Sim' : 'Não'} onChange={e => setFormData({ ...formData, is_nl_low: e.target.value === 'Sim' })}>
                          <option value="Não">Não (Pendente de Registro no SAM)</option>
                          <option value="Sim">Sim (Baixa Efetivada)</option>
                        </select>
                      </div>
                    </div>
                  </div>
                )}

                {/* Workflow steps */}
                <div className="space-y-4">
                  <div className="flex items-center gap-2">
                    <div className="w-1 h-5 bg-indigo-600 rounded-full" />
                    <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider">Etapa no Fluxograma</h3>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {WORKFLOWS[formData.type].map((step, idx) => {
                      const active = formData.current_step === step;
                      const past = WORKFLOWS[formData.type].indexOf(formData.current_step) > idx;
                      return (
                        <button
                          key={step}
                          type="button"
                          disabled={isReadOnly}
                          onClick={() => setFormData({ ...formData, current_step: step })}
                          className={`p-4 rounded-xl border-2 text-left flex flex-col justify-between h-20 transition-all hover:scale-[1.02] active:scale-[0.98] disabled:cursor-not-allowed disabled:hover:scale-100 ${
                            active
                              ? 'bg-indigo-600 border-indigo-600 text-white shadow-lg shadow-indigo-200'
                              : past
                              ? 'bg-indigo-50 border-indigo-100 text-indigo-700'
                              : 'bg-slate-50 border-slate-100 text-slate-400 opacity-60'
                          }`}
                        >
                          <div className="flex justify-between items-center">
                            <span className="text-xl font-bold opacity-30">{idx + 1}</span>
                            {past && !active && <CheckCircle2 size={14} className="text-indigo-400" />}
                            {active && <div className="w-1.5 h-1.5 rounded-full bg-white animate-ping" />}
                          </div>
                          <span className="text-[10px] font-bold uppercase leading-tight tracking-wide">{step}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Final status */}
                <div className="space-y-3">
                  <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                    <LayoutGrid size={12} /> Status Final
                  </label>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {['RECEBIDO', 'EM APURAÇÃO', 'CONCLUÍDO', 'CORREÇÃO'].map(s => (
                      <button
                        key={s}
                        type="button"
                        disabled={isReadOnly}
                        onClick={() => setFormData({ ...formData, status: s })}
                        className={`p-3 rounded-xl text-xs font-semibold uppercase tracking-wider border-2 transition-all disabled:cursor-not-allowed ${
                          formData.status === s
                            ? 'bg-slate-900 border-slate-900 text-white shadow-md'
                            : 'bg-white border-slate-200 text-slate-500 hover:border-slate-300'
                        }`}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Modal footer */}
              <div className="p-5 border-t border-slate-100 bg-slate-50/50 shrink-0 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-5 py-2.5 text-sm font-semibold text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition-all"
                >
                  {isReadOnly ? 'Fechar' : 'Cancelar'}
                </button>
                {!isReadOnly && (
                  <button
                    type="submit"
                    disabled={saveLoading}
                    className="inline-flex items-center gap-2 px-6 py-2.5 bg-indigo-600 text-white text-sm font-semibold rounded-xl shadow-md shadow-indigo-200 hover:bg-indigo-700 transition-all active:scale-[0.98] disabled:opacity-60"
                  >
                    {saveLoading ? <Loader2 className="animate-spin" size={16} /> : <Save size={16} />}
                    {editingProcess ? 'Atualizar Processo' : 'Lançar Processo'}
                  </button>
                )}
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default PatrimonioProcessos;

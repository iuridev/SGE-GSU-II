import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { 
  ShieldAlert, Leaf, Plus, FileText, 
  AlertTriangle, School, 
  Search, Loader2, X, Image as ImageIcon, Link as LinkIcon,
  Download, Edit2, Info, CheckCircle, Award, Zap
} from 'lucide-react';

// Declaração para evitar erro de TS com biblioteca global html2pdf via CDN
declare const html2pdf: any;

// Tipos de dados baseados no banco de dados
interface SchoolData {
  id: string;
  name: string;
}

interface Ocorrencia {
  id: string;
  school_id: string;
  schools?: { name: string }; 
  date: string;
  type: string;
  description: string;
  status: string;
  photo_url?: string;
}

interface AcaoEducativa {
  id: string;
  school_id: string;
  schools?: { name: string }; 
  date: string;
  title: string;
  description: string;
  impact: string;
  photo_before_url?: string;
  photo_after_url?: string;
}

// Interface para o formulário com tipagem estrita
interface PatrimonialFormData {
  school_id: string;
  date: string;
  type: string;
  description: string;
  title: string;
  impact: string;
  status: string;
  photo_url: string;
  photo_before_url: string;
  photo_after_url: string;
  selected_occurrence_id: string;
}

export default function EducacaoPatrimonial() {
  const [activeTab, setActiveTab] = useState<'radar' | 'ocorrencias' | 'acoes'>('radar');
  const [loading, setLoading] = useState(true);
  const [schools, setSchools] = useState<SchoolData[]>([]);
  const [occurrences, setOccurrences] = useState<Ocorrencia[]>([]);
  const [actions, setActions] = useState<AcaoEducativa[]>([]);
  
  // Controle de Perfil e RBAC
  const [userRole, setUserRole] = useState<string>('');
  const [userSchoolId, setUserSchoolId] = useState<string | null>(null);
  
  // Estados de Interface
  const [isPrintingMode, setIsPrintingMode] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [modalType, setModalType] = useState<'ocorrencia' | 'acao'>('ocorrencia');
  const [isRelatedToOccurrence, setIsRelatedToOccurrence] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const initialFormState: PatrimonialFormData = {
    school_id: '',
    date: new Date().toLocaleDateString('en-CA'), 
    type: 'Mobiliário',
    description: '',
    title: '',
    impact: 'Médio',
    status: 'Pendente',
    photo_url: '', 
    photo_before_url: '', 
    photo_after_url: '',
    selected_occurrence_id: ''
  };

  const [formData, setFormData] = useState<PatrimonialFormData>(initialFormState);
  const [searchTerm, setSearchTerm] = useState('');

  // 1. Carregar Perfil do Usuário e Dados Iniciais
  useEffect(() => {
    const initializePage = async () => {
      setLoading(true);
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
          // Tipagem explícita para evitar o erro 'never' do TS
          const { data: profile, error: profileError } = await supabase
            .from('profiles')
            .select('role, school_id')
            .eq('id', session.user.id)
            .single();
          
          if (profile && !profileError) {
            const p = profile as { role: string; school_id: string | null };
            setUserRole(p.role);
            setUserSchoolId(p.school_id);
            await loadAllData(p.role, p.school_id);
          }
        }
      } catch (error) {
        console.error('Erro na inicialização:', error);
      } finally {
        setLoading(false);
      }
    };

    initializePage();
  }, []);

  const loadAllData = async (role: string, schoolId: string | null) => {
    try {
      // Buscar Escolas - Filtra se for school_manager
      let schoolsQuery = supabase.from('schools').select('id, name').order('name');
      if (role === 'school_manager' && schoolId) {
        schoolsQuery = schoolsQuery.eq('id', schoolId);
      }
      const { data: sData } = await schoolsQuery;
      if (sData) setSchools(sData);

      // Buscar Ocorrências
      let occQuery = (supabase as any).from('patrimonial_occurrences').select('*, schools(name)');
      if (role === 'school_manager' && schoolId) {
        occQuery = occQuery.eq('school_id', schoolId);
      }
      const { data: oData } = await occQuery.order('date', { ascending: false });
      if (oData) setOccurrences(oData);

      // Buscar Ações
      let actQuery = (supabase as any).from('patrimonial_actions').select('*, schools(name)');
      if (role === 'school_manager' && schoolId) {
        actQuery = actQuery.eq('school_id', schoolId);
      }
      const { data: aData } = await actQuery.order('date', { ascending: false });
      if (aData) setActions(aData);

    } catch (error) {
      console.error('Erro ao carregar dados:', error);
    }
  };

  // Vínculo inteligente de foto: puxa foto da ocorrência ao selecionar
  useEffect(() => {
    if (isRelatedToOccurrence && formData.selected_occurrence_id) {
      const selectedOcc = occurrences.find(o => o.id === formData.selected_occurrence_id);
      if (selectedOcc) {
        setFormData((prev: PatrimonialFormData) => ({
          ...prev,
          photo_before_url: selectedOcc.photo_url || ''
        }));
      }
    }
  }, [formData.selected_occurrence_id, isRelatedToOccurrence, occurrences]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const finalSchoolId = userRole === 'school_manager' ? userSchoolId : formData.school_id;

      if (modalType === 'ocorrencia') {
        const payload = {
          school_id: finalSchoolId,
          date: formData.date,
          type: formData.type,
          description: formData.description,
          status: formData.status,
          photo_url: formData.photo_url || null
        };

        if (isEditing && editingId) {
          await (supabase as any).from('patrimonial_occurrences').update(payload).eq('id', editingId);
        } else {
          await (supabase as any).from('patrimonial_occurrences').insert([payload]);
        }
      } else {
        const payload = {
          school_id: finalSchoolId,
          date: formData.date,
          title: formData.title,
          description: formData.description,
          impact: formData.impact,
          photo_before_url: formData.photo_before_url || null,
          photo_after_url: formData.photo_after_url || null
        };

        if (isEditing && editingId) {
          await (supabase as any).from('patrimonial_actions').update(payload).eq('id', editingId);
        } else {
          await (supabase as any).from('patrimonial_actions').insert([payload]);
        }
      }
      
      setShowModal(false);
      await loadAllData(userRole, userSchoolId);
      resetForm();
    } catch (error) {
      alert('Erro ao processar o registro. Verifique a conexão.');
      console.error(error);
    }
  };

  const handleEdit = (item: any, type: 'ocorrencia' | 'acao') => {
    if (userRole !== 'regional_admin') return; 

    setModalType(type);
    setIsEditing(true);
    setEditingId(item.id);
    
    setFormData({
      ...initialFormState,
      school_id: item.school_id,
      date: item.date,
      type: item.type || 'Mobiliário',
      title: item.title || '',
      description: item.description || '',
      status: item.status || 'Pendente',
      impact: item.impact || 'Médio',
      photo_url: item.photo_url || '',
      photo_before_url: item.photo_before_url || '',
      photo_after_url: item.photo_after_url || ''
    });
    setShowModal(true);
  };

  const resetForm = () => {
    setFormData({
      ...initialFormState,
      school_id: userRole === 'school_manager' ? (userSchoolId || '') : ''
    });
    setIsRelatedToOccurrence(false);
    setIsEditing(false);
    setEditingId(null);
  };

  const handleExportExcel = () => {
    const headers = ['Data', 'Escola', 'Tipo/Título', 'Descrição', 'Status/Impacto', 'Foto URL'];
    const csvRows = [headers.join(';')];

    occurrences.forEach(o => {
      csvRows.push([
        new Date(o.date).toLocaleDateString('pt-BR'),
        o.schools?.name || 'N/A',
        `Ocorrência: ${o.type}`,
        (o.description || '').replace(/;/g, ' '),
        o.status,
        o.photo_url || ''
      ].join(';'));
    });

    actions.forEach(a => {
      csvRows.push([
        new Date(a.date).toLocaleDateString('pt-BR'),
        a.schools?.name || 'N/A',
        `Ação: ${a.title}`,
        (a.description || '').replace(/;/g, ' '),
        a.impact,
        a.photo_after_url || ''
      ].join(';'));
    });

    const csvContent = "\uFEFF" + csvRows.join("\n");
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `gestao_patrimonial_${new Date().toLocaleDateString('pt-BR').replace(/\//g, '_')}.csv`;
    link.click();
  };

  // --- LÓGICA DE CLASSIFICAÇÃO AUTOMÁTICA DE SUCESSO ---
  const getActionSuccessStatus = (action: AcaoEducativa) => {
    const actionDate = new Date(action.date);
    const today = new Date();
    const diffDays = Math.ceil((today.getTime() - actionDate.getTime()) / (1000 * 60 * 60 * 24));
    
    // Verifica se houve qualquer ocorrência na mesma escola APÓS a data da ação
    const hasNewIncidents = occurrences.some(o => 
      o.school_id === action.school_id && 
      new Date(o.date) > actionDate
    );

    if (hasNewIncidents) return { label: 'Sob Avaliação', color: 'bg-slate-100 text-slate-500', icon: <AlertTriangle size={10} /> };

    if (diffDays >= 60) return { label: 'Plenamente Sucedida', color: 'bg-blue-600 text-white', icon: <Award size={10} /> };
    if (diffDays >= 30) return { label: 'Bem Sucedida', color: 'bg-emerald-600 text-white', icon: <CheckCircle size={10} /> };
    if (diffDays >= 15) return { label: 'Tendência ao Sucesso', color: 'bg-amber-500 text-white', icon: <Zap size={10} /> };
    
    return { label: 'Em Monitoramento', color: 'bg-slate-100 text-slate-600', icon: <Loader2 size={10} className="animate-spin" /> };
  };

  const chartData = useMemo(() => {
    const months = [];
    const today = new Date();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(today.getFullYear(), today.getMonth() - i, 15);
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      months.push(`${year}-${month}`);
    }

    return months.map(monthStr => {
      const occInMonth = occurrences.filter(o => o.date && o.date.startsWith(monthStr));
      const [y, m] = monthStr.split('-').map(Number);
      const labelDate = new Date(y, m - 1, 15);

      return {
        month: monthStr,
        label: labelDate.toLocaleDateString('pt-BR', { month: 'short' }),
        total: occInMonth.length,
        types: {
          'Mobiliário': occInMonth.filter(o => o.type === 'Mobiliário').length,
          'Equipamento': occInMonth.filter(o => o.type === 'Equipamento').length,
          'Predial': occInMonth.filter(o => o.type === 'Predial').length,
          'Vidros': occInMonth.filter(o => o.type === 'Vidros').length,
          'Outros': occInMonth.filter(o => o.type === 'Outros').length,
        }
      };
    });
  }, [occurrences]);

  const maxY = useMemo(() => {
    const maxVal = Math.max(...chartData.map(d => d.total));
    return maxVal < 5 ? 5 : Math.ceil(maxVal * 1.2);
  }, [chartData]);

  const criticalSchools = useMemo(() => {
    const counts: Record<string, { name: string, occ: number, act: number }> = {};
    occurrences.forEach(o => {
      if (!counts[o.school_id]) counts[o.school_id] = { name: o.schools?.name || 'Desconhecida', occ: 0, act: 0 };
      counts[o.school_id].occ++;
    });
    actions.forEach(a => {
      if (!counts[a.school_id]) counts[a.school_id] = { name: a.schools?.name || 'Desconhecida', occ: 0, act: 0 };
      counts[a.school_id].act++;
    });
    return Object.values(counts)
      .sort((a, b) => b.occ - a.occ)
      .slice(0, 5) 
      .map(s => ({ ...s, risk: s.occ > 10 ? 'Alto' : s.occ > 5 ? 'Médio' : 'Baixo' }));
  }, [occurrences, actions]);

  const damageTypes = useMemo(() => {
    const total = occurrences.length || 1;
    const types = ['Mobiliário', 'Equipamento', 'Predial', 'Vidros', 'Outros'];
    return types.map(t => ({
      type: t,
      count: occurrences.filter(o => o.type === t).length,
      percent: Math.round((occurrences.filter(o => o.type === t).length / total) * 100)
    })).sort((a, b) => b.count - a.count);
  }, [occurrences]);

  const colors: Record<string, string> = {
    'Total': '#ef4444', 'Mobiliário': '#f97316', 'Equipamento': '#3b82f6', 
    'Predial': '#a855f7', 'Vidros': '#06b6d4', 'Outros': '#64748b'  
  };

  const handleDownloadPDF = () => {
    setIsPrintingMode(true);
    setTimeout(() => {
      const element = document.getElementById('educacao-patrimonial-content');
      const opt = {
        margin: [10, 10], filename: 'relatorio_patrimonial.pdf',
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'landscape' }
      };
      if (typeof html2pdf !== 'undefined') {
        html2pdf().set(opt).from(element).save().then(() => setIsPrintingMode(false));
      } else {
        window.print();
        setIsPrintingMode(false);
      }
    }, 500); 
  };

  const filteredOccurrencesForModal = useMemo(() => {
    const schoolToFilter = userRole === 'school_manager' ? userSchoolId : formData.school_id;
    if (!schoolToFilter) return [];
    return occurrences.filter(o => o.school_id === schoolToFilter && o.status !== 'Resolvido');
  }, [occurrences, formData.school_id, userRole, userSchoolId]);

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6 animate-in fade-in duration-500 print:p-0 print:m-0 print:w-full print:max-w-none h-full overflow-hidden flex flex-col">
      
      {/* Solução para barras de rolamento duplicadas e visual limpo */}
      <style>{`
        /* Barra de rolamento fina e elegante */
        * {
          scrollbar-width: thin;
          scrollbar-color: #cbd5e1 transparent;
        }
        ::-webkit-scrollbar {
          width: 6px;
          height: 6px;
        }
        ::-webkit-scrollbar-track {
          background: transparent;
        }
        ::-webkit-scrollbar-thumb {
          background: #cbd5e1;
          border-radius: 10px;
        }
        ::-webkit-scrollbar-thumb:hover {
          background: #94a3b8;
        }

        /* Garante que o scroll aconteça apenas no container principal se necessário */
        .main-scroll-area {
          overflow-y: auto;
          overflow-x: hidden;
          flex: 1;
        }

        @media print {
          @page { margin: 1cm; size: landscape; }
          body { background: white !important; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
          aside, header { display: none !important; }
          main { margin: 0 !important; padding: 0 !important; overflow: visible !important; height: auto !important; }
          .tab-content { display: block !important; margin-bottom: 2rem; break-inside: avoid; }
        }
      `}</style>

      <div id="educacao-patrimonial-content" className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex flex-col h-full overflow-hidden">
        
        <div className="main-scroll-area space-y-6 pr-2">
          {/* PDF Header */}
          <div className={`${isPrintingMode ? 'block' : 'hidden print:block'} mb-8 border-b-2 border-gray-800 pb-4`}>
            <div className="flex justify-between items-end">
              <div>
                <h1 className="text-2xl font-black text-gray-900 uppercase">Relatório de Gestão Patrimonial</h1>
                <p className="text-sm font-bold text-gray-500 mt-2 uppercase tracking-widest leading-none">
                  {userRole === 'school_manager' ? `Unidade: ${schools[0]?.name || 'Carregando...'}` : 'Visão Geral Regional'} • SGE-GSU II
                </p>
              </div>
              <div className="text-right text-[10px] font-black uppercase text-gray-400">
                <p>Gerado em: {dataGeracao}</p>
              </div>
            </div>
          </div>

          {/* UI Toolbar */}
          <div className={`flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-gray-100 pb-6 ${isPrintingMode ? 'hidden' : 'print:hidden'}`}>
            <div>
              <h1 className="text-3xl font-black text-gray-800 flex items-center gap-3 tracking-tighter leading-none">
                <ShieldAlert className="w-8 h-8 text-orange-600" />
                Educação Patrimonial & Zeladoria
              </h1>
              <p className="text-gray-500 font-medium text-sm mt-1">
                {userRole === 'school_manager' ? 'Gestão de danos e intervenções da sua unidade.' : 'Dashboard regional de controle de vandalismo.'}
              </p>
            </div>
            
            <div className="flex flex-wrap items-center gap-2">
              <button onClick={handleExportExcel} className="flex items-center gap-2 bg-emerald-100 hover:bg-emerald-200 text-emerald-700 border border-emerald-300 px-4 py-2.5 rounded-xl transition-all font-bold text-sm">
                <Download className="w-4 h-4" /> Excel
              </button>
              <button onClick={handleDownloadPDF} disabled={isPrintingMode} className="flex items-center gap-2 bg-white hover:bg-gray-50 text-gray-700 border border-gray-300 px-4 py-2.5 rounded-xl transition-all font-bold text-sm">
                {isPrintingMode ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />} PDF
              </button>
              <button 
                onClick={() => { 
                  setModalType('ocorrencia'); 
                  resetForm(); 
                  if(userRole === 'school_manager') setFormData(prev => ({...prev, school_id: userSchoolId || ''})); 
                  setShowModal(true); 
                }} 
                className="flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white px-5 py-2.5 rounded-xl transition-all shadow-lg shadow-red-200 font-black uppercase text-xs"
              >
                <Plus className="w-4 h-4" /> Novo Registro
              </button>
            </div>
          </div>

          {loading ? (
            <div className="flex justify-center py-20"><Loader2 className="w-10 h-10 animate-spin text-blue-600" /></div>
          ) : (
            <>
              {/* KPIs */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                {[
                  { label: 'Ocorrências', val: occurrences.length, color: 'text-red-600' },
                  { label: 'Ações Educativas', val: actions.length, color: 'text-emerald-600' },
                  { label: userRole === 'school_manager' ? 'Status Unidade' : 'Escolas Críticas', val: userRole === 'school_manager' ? (occurrences.length > 3 ? 'Atenção' : 'Normal') : criticalSchools.length, color: 'text-blue-600' },
                  { label: 'Taxa Resolução', val: `${occurrences.length ? Math.round((occurrences.filter(o => o.status === 'Resolvido').length / occurrences.length) * 100) : 0}%`, color: 'text-orange-600' }
                ].map((kpi, i) => (
                  <div key={i} className="bg-slate-50 p-6 rounded-2xl border border-slate-100 shadow-sm">
                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest leading-none">{kpi.label}</p>
                    <h3 className={`text-3xl font-black mt-2 ${kpi.color} leading-none`}>{kpi.val}</h3>
                  </div>
                ))}
              </div>

              {/* Gráfico com Pontos */}
              <div className="bg-white rounded-xl border border-gray-100 p-6">
                <h3 className="text-lg font-bold text-gray-800 mb-8 flex items-center justify-between leading-none">
                  <span>Evolução Patrimonial (6 meses)</span>
                  <div className="flex gap-3 text-[10px] uppercase font-black text-gray-400">
                    {Object.entries(colors).map(([key, color]) => (
                      <div key={key} className="flex items-center gap-1.5">
                        <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: color }}></span>{key}
                      </div>
                    ))}
                  </div>
                </h3>
                <div className="h-96 w-full relative px-2">
                  <div className="absolute inset-0 flex flex-col justify-between text-[10px] text-gray-400 font-bold">
                    {[5, 4, 3, 2, 1, 0].map(i => (
                      <div key={i} className="border-b border-gray-50 w-full h-full relative">
                        <span className="absolute -left-8 -top-2 w-6 text-right">{Math.round((i / 5) * maxY)}</span>
                      </div>
                    ))}
                  </div>
                  <svg className="absolute inset-0 w-full h-full overflow-visible" preserveAspectRatio="none" viewBox="0 0 100 100">
                    <polyline fill="none" stroke={colors['Total']} strokeWidth="1" points={chartData.map((d, i) => `${(i / (chartData.length - 1)) * 100},${100 - (d.total / maxY) * 100}`).join(' ')} />
                    {chartData.map((d, i) => (
                      <circle key={`t-${i}`} cx={(i / (chartData.length - 1)) * 100} cy={100 - (d.total / maxY) * 100} r="1.8" fill={colors['Total']} stroke="white" strokeWidth="0.4" />
                    ))}
                    {Object.keys(chartData[0].types).map(type => (
                      <React.Fragment key={type}>
                        <polyline fill="none" stroke={colors[type]} strokeWidth="0.5" strokeDasharray="1 1" points={chartData.map((d, i) => `${(i / (chartData.length - 1)) * 100},${100 - (d.types[type as keyof typeof d.types] / maxY) * 100}`).join(' ')} />
                        {chartData.map((d, i) => d.types[type as keyof typeof d.types] > 0 && (
                          <circle key={`${type}-${i}`} cx={(i / (chartData.length - 1)) * 100} cy={100 - (d.types[type as keyof typeof d.types] / maxY) * 100} r="1.2" fill={colors[type]} />
                        ))}
                      </React.Fragment>
                    ))}
                  </svg>
                  <div className="absolute bottom-0 w-full flex justify-between transform translate-y-7 font-black uppercase text-[10px] text-gray-400">
                    {chartData.map((d, i) => <div key={i} className="w-12 text-center tracking-tighter">{d.label}</div>)}
                  </div>
                </div>
              </div>

              {/* Abas */}
              <div className={`border-b border-gray-100 mb-8 mt-12 ${isPrintingMode ? 'hidden' : 'print:hidden'}`}>
                <nav className="-mb-px flex space-x-10">
                  {['radar', 'ocorrencias', 'acoes'].map((tab) => (
                    <button key={tab} onClick={() => setActiveTab(tab as any)} className={`whitespace-nowrap pb-4 px-1 border-b-4 font-black text-xs uppercase tracking-widest transition-all ${activeTab === tab ? 'border-orange-500 text-orange-600' : 'border-transparent text-gray-400 hover:text-gray-600'}`}>
                      {tab.replace('radar', 'Indicadores').replace('ocorrencias', 'Ocorrências').replace('acoes', 'Ações')}
                    </button>
                  ))}
                </nav>
              </div>

              <div className="min-h-[400px]">
                {/* ABA INDICADORES */}
                <div className={`tab-content ${activeTab === 'radar' || isPrintingMode ? 'block' : 'hidden'}`}>
                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                    <div className="lg:col-span-2 bg-white rounded-xl border border-gray-100 p-6 shadow-sm">
                      <h3 className="text-lg font-black mb-6 uppercase tracking-tight text-gray-800 leading-none">Unidades sob Monitoramento</h3>
                      <div className="space-y-4">
                        {criticalSchools.map((escola, idx) => (
                          <div key={idx} className="flex items-center gap-5 p-4 border-b border-gray-50 last:border-0 hover:bg-slate-50 rounded-2xl transition-all group">
                            <div className={`w-10 h-10 rounded-full flex items-center justify-center font-black text-white shadow-md ${escola.risk === 'Alto' ? 'bg-red-500' : escola.risk === 'Médio' ? 'bg-amber-500' : 'bg-green-500'}`}>{idx + 1}</div>
                            <div className="flex-1">
                              <h4 className="font-bold text-sm text-gray-900 uppercase leading-none mb-1">{escola.name}</h4>
                              <div className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">{escola.occ} Registros | {escola.act} Intervenções</div>
                            </div>
                            <span className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-tighter shadow-sm ${escola.risk === 'Alto' ? 'bg-red-50 text-red-700' : 'bg-green-100 text-green-700'}`}>Risco {escola.risk}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="bg-white rounded-xl border border-gray-100 p-6 shadow-sm">
                      <h3 className="text-lg font-black mb-6 uppercase tracking-tight text-gray-800 leading-none">Danos por Tipo (%)</h3>
                      <div className="space-y-8">
                        {damageTypes.map((type, idx) => (
                          <div key={idx}>
                            <div className="flex justify-between text-[11px] font-black mb-2 uppercase tracking-widest text-gray-500 leading-none"><span>{type.type}</span><span>{type.percent}%</span></div>
                            <div className="w-full bg-gray-100 rounded-full h-4 overflow-hidden p-0.5 shadow-inner">
                              <div className="h-full rounded-full transition-all duration-1000 shadow-sm" style={{ width: `${type.percent}%`, backgroundColor: colors[type.type] || colors['Outros'] }}></div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                {/* ABA OCORRÊNCIAS */}
                <div className={`tab-content ${isPrintingMode ? 'mt-10 block' : (activeTab === 'ocorrencias' ? 'block' : 'hidden')}`}>
                  <div className="bg-white rounded-xl border border-gray-100 overflow-hidden shadow-sm">
                    <div className={`p-5 border-b bg-gray-50 ${isPrintingMode || userRole === 'school_manager' ? 'hidden' : ''}`}>
                      <div className="relative max-w-md">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
                        <input type="text" placeholder="Filtrar por escola..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full pl-12 pr-5 py-3 border-2 border-transparent bg-white rounded-2xl text-sm outline-none font-bold shadow-sm focus:border-blue-500 transition-all" />
                      </div>
                    </div>
                    <h3 className={`${isPrintingMode ? 'block' : 'hidden'} text-xl font-black p-6 border-b bg-gray-50 uppercase tracking-tighter leading-none`}>Detalhamento de Ocorrências</h3>
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-sm">
                        <thead className="bg-gray-100 text-gray-500 font-black uppercase text-[10px] tracking-widest">
                          <tr><th className="p-6">Data</th><th className="p-6">Unidade Escolar</th><th className="p-6">Tipo</th><th className="p-6">Relato Técnico</th><th className="p-6 text-center">Status</th>{userRole === 'regional_admin' && <th className="p-6 text-center">Ação</th>}</tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                          {occurrences.filter(o => o.schools?.name.toLowerCase().includes(searchTerm.toLowerCase())).map((oc) => (
                            <tr key={oc.id} className="hover:bg-slate-50/50 transition-colors">
                              <td className="p-6 font-bold text-gray-500 whitespace-nowrap">{new Date(oc.date).toLocaleDateString('pt-BR')}</td>
                              <td className="p-6 font-black text-gray-900 uppercase text-[12px] tracking-tighter leading-none">{oc.schools?.name}</td>
                              <td className="p-6"><span className="px-3 py-1.5 bg-slate-200 rounded-lg text-[10px] font-black uppercase tracking-tight leading-none">{oc.type}</span></td>
                              <td className="p-6 max-w-xs truncate text-gray-600 font-medium">{oc.description}</td>
                              <td className="p-6 text-center"><span className={`px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest shadow-sm ${oc.status === 'Resolvido' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'} leading-none`}>{oc.status}</span></td>
                              {userRole === 'regional_admin' && (
                                <td className="p-6 text-center">
                                  <button onClick={() => handleEdit(oc, 'ocorrencia')} className="p-2.5 text-blue-600 hover:bg-blue-100 rounded-full transition-all shadow-sm"><Edit2 size={16} /></button>
                                </td>
                              )}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>

                {/* ABA AÇÕES */}
                <div className={`tab-content ${isPrintingMode ? 'mt-10 block' : (activeTab === 'acoes' ? 'block' : 'hidden')}`}>
                   {/* Banner Informativo sobre Monitoramento */}
                   <div className="bg-blue-50 border-l-4 border-blue-600 p-6 rounded-r-[2rem] mb-8 flex items-start gap-4 shadow-sm">
                      <Info className="text-blue-600 shrink-0 mt-0.5" size={24} />
                      <div>
                        <h4 className="text-blue-800 font-black uppercase text-xs tracking-widest mb-2 leading-none">Monitoramento Automático de Sucesso</h4>
                        <p className="text-blue-700 text-sm font-medium leading-relaxed mb-4">
                          O sistema monitora a ausência de novas ocorrências na unidade após a intervenção e as classifica automaticamente:
                        </p>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                           <div className="flex items-center gap-2 bg-white/50 p-3 rounded-xl border border-blue-100 font-black uppercase text-[10px] tracking-widest leading-none">
                             <Zap size={14} className="text-amber-500" /> 15 Dias: Tendência ao Sucesso
                           </div>
                           <div className="flex items-center gap-2 bg-white/50 p-3 rounded-xl border border-blue-100 font-black uppercase text-[10px] tracking-widest leading-none">
                             <CheckCircle size={14} className="text-emerald-500" /> 30 Dias: Bem Sucedida
                           </div>
                           <div className="flex items-center gap-2 bg-white/50 p-3 rounded-xl border border-blue-100 font-black uppercase text-[10px] tracking-widest leading-none">
                             <Award size={14} className="text-blue-500" /> 60 Dias: Plenamente Sucedida
                           </div>
                        </div>
                      </div>
                   </div>

                   <div className={`flex justify-end mb-6 ${isPrintingMode ? 'hidden' : ''}`}>
                      <button onClick={() => { setModalType('acao'); resetForm(); if(userRole === 'school_manager') setFormData(prev => ({...prev, school_id: userSchoolId || ''})); setShowModal(true); }} className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-2.5 rounded-xl transition-all shadow-lg shadow-emerald-200 font-black uppercase text-xs tracking-widest">
                        <Plus className="w-4 h-4" /> Registrar Intervenção
                      </button>
                   </div>

                   <h3 className={`${isPrintingMode ? 'block' : 'hidden'} text-xl font-black p-6 border-b bg-gray-50 uppercase tracking-tighter mb-6 leading-none`}>Histórico de Ações Educativas</h3>
                   
                   <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      {actions.map((acao) => {
                        const successStatus = getActionSuccessStatus(acao);
                        return (
                          <div key={acao.id} className={`bg-white rounded-[2rem] border-2 p-7 transition-all group relative shadow-sm hover:shadow-md ${successStatus.label === 'Plenamente Sucedida' ? 'border-blue-100 bg-blue-50/5' : successStatus.label === 'Bem Sucedida' ? 'border-emerald-100' : 'border-gray-50'}`}>
                            <div className="flex justify-between items-start mb-4">
                              <div className="flex-1">
                                <h4 className="font-black text-gray-900 uppercase tracking-tighter text-lg leading-tight mb-1">{acao.title}</h4>
                                <p className="text-[10px] text-gray-400 font-black flex items-center gap-1.5 uppercase tracking-widest leading-none"><School size={12} /> {acao.schools?.name}</p>
                              </div>
                              <div className="flex flex-col items-end gap-2 shrink-0">
                                <span className="px-2.5 py-1 rounded-lg bg-slate-100 text-slate-700 text-[9px] font-black uppercase shadow-sm border border-slate-200 leading-none">{acao.impact} Impacto</span>
                                <span className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[9px] font-black uppercase shadow-sm animate-in fade-in slide-in-from-top-1 ${successStatus.color} leading-none`}>
                                  {successStatus.icon} {successStatus.label}
                                </span>
                              </div>
                            </div>
                            
                            <p className="text-gray-600 text-sm mt-5 font-medium leading-relaxed line-clamp-3 group-hover:line-clamp-none transition-all">{acao.description}</p>
                            
                            <div className="mt-8 pt-5 border-t border-gray-100 flex justify-between items-center text-[10px] font-black text-gray-300 uppercase tracking-widest leading-none">
                              <span>Executado em: {new Date(acao.date).toLocaleDateString('pt-BR')}</span>
                              <div className="flex gap-2">
                                 {acao.photo_before_url && <span title="Possui registro inicial"><ImageIcon size={14} className="text-gray-200" /></span>}
                                 {acao.photo_after_url && <span title="Possui registro final"><ImageIcon size={14} className="text-blue-400/50" /></span>}
                                 {userRole === 'regional_admin' && (
                                   <button onClick={() => handleEdit(acao, 'acao')} className="p-1.5 text-blue-600 opacity-0 group-hover:opacity-100 hover:bg-blue-50 rounded-full transition-all">
                                     <Edit2 size={14} />
                                   </button>
                                 )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                      {actions.length === 0 && (
                        <div className="col-span-2 p-16 text-center bg-slate-50/50 rounded-[2.5rem] border-4 border-dashed border-slate-100">
                           <Leaf size={48} className="text-slate-200 mx-auto mb-4" />
                           <p className="text-gray-400 font-black uppercase text-xs tracking-widest italic leading-none">Aguardando registros de intervenções educativas.</p>
                        </div>
                      )}
                   </div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Modal RBAC Inteligente */}
      {showModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[9999] flex items-center justify-center p-4">
          <div className="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-2xl p-10 overflow-y-auto max-h-[90vh] animate-in zoom-in-95 duration-300 border-4 border-white">
            <div className="flex justify-between items-center mb-8 border-b border-gray-50 pb-6">
              <h3 className="text-2xl font-black text-gray-900 tracking-tighter uppercase leading-none">
                {isEditing ? 'Atualizar Registro' : (modalType === 'ocorrencia' ? 'Registrar Vandalismo' : 'Nova Intervenção')}
              </h3>
              <button onClick={() => setShowModal(false)} className="p-3 hover:bg-gray-100 rounded-full text-gray-400 transition-all"><X size={24} /></button>
            </div>
            
            <form onSubmit={handleSubmit} className="space-y-6">
              <div>
                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3 px-1 leading-none">Unidade Escolar</label>
                <select 
                  required 
                  disabled={userRole === 'school_manager' || (isEditing && userRole !== 'regional_admin')}
                  value={formData.school_id} 
                  onChange={(e) => setFormData((prev: PatrimonialFormData) => ({...prev, school_id: e.target.value}))} 
                  className={`w-full border-2 p-4 rounded-2xl focus:ring-4 focus:ring-blue-500/10 outline-none transition-all font-black uppercase text-xs ${userRole === 'school_manager' ? 'bg-gray-50 border-gray-100 cursor-not-allowed text-gray-400' : 'border-gray-50 bg-slate-50/50 font-bold shadow-inner'}`}
                >
                  {userRole !== 'school_manager' && <option value="">Selecione a unidade escolar...</option>}
                  {schools.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-6">
                <div>
                  <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3 px-1 leading-none">Data do Evento</label>
                  <input type="date" required value={formData.date} onChange={(e) => setFormData((prev: PatrimonialFormData) => ({...prev, date: e.target.value}))} className="w-full border-2 border-gray-50 bg-slate-50/50 p-4 rounded-2xl font-bold text-xs outline-none focus:border-blue-500 transition-all shadow-inner" />
                </div>
                <div>
                  <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3 px-1 leading-none">
                    {modalType === 'ocorrencia' ? 'Tipo de Dano' : 'Nível de Impacto'}
                  </label>
                  <select 
                    value={modalType === 'ocorrencia' ? formData.type : formData.impact} 
                    onChange={(e) => setFormData((prev: PatrimonialFormData) => ({...prev, [modalType === 'ocorrencia' ? 'type' : 'impact']: e.target.value}))} 
                    className="w-full border-2 border-gray-50 bg-slate-50/50 p-4 rounded-2xl font-bold text-xs outline-none focus:border-blue-500 transition-all shadow-inner"
                  >
                    {modalType === 'ocorrencia' ? (
                      <><option>Mobiliário</option><option>Equipamento</option><option>Predial</option><option>Vidros</option><option>Outros</option></>
                    ) : (
                      <><option>Alto</option><option>Médio</option><option>Baixo</option></>
                    )}
                  </select>
                </div>
              </div>
              
              {modalType === 'ocorrencia' ? (
                <>
                  <div>
                    <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3 px-1 leading-none">Estado do Caso</label>
                    <select value={formData.status} onChange={(e) => setFormData((prev: PatrimonialFormData) => ({...prev, status: e.target.value}))} className="w-full border-2 border-gray-50 bg-slate-50/50 p-4 rounded-2xl font-bold text-xs shadow-inner">
                      <option>Pendente</option><option>Em Análise</option><option>Resolvido</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3 px-1 leading-none">Link da Evidência Fotográfica</label>
                    <input type="text" value={formData.photo_url} onChange={(e) => setFormData((prev: PatrimonialFormData) => ({...prev, photo_url: e.target.value}))} className="w-full border-2 border-gray-50 bg-slate-50/50 p-4 rounded-2xl font-bold text-xs shadow-inner" placeholder="URL da imagem (Google Drive, Imgur, etc)" />
                  </div>
                </>
              ) : (
                <>
                  {!isEditing && (
                    <div className="bg-blue-50 p-7 rounded-[2rem] border-2 border-blue-100 shadow-sm">
                      <p className="text-[10px] font-black text-blue-800 mb-4 flex items-center gap-2 uppercase tracking-widest leading-none"><LinkIcon size={16}/> Resolver registro existente?</p>
                      <div className="flex gap-10 mb-5 px-1">
                        <label className="flex items-center gap-3 cursor-pointer font-black text-blue-900 text-xs uppercase tracking-tighter leading-none">
                          <input type="radio" name="lnk" checked={isRelatedToOccurrence} onChange={() => setIsRelatedToOccurrence(true)} className="w-5 h-5 accent-blue-600" /> SIM
                        </label>
                        <label className="flex items-center gap-3 cursor-pointer font-black text-blue-900 text-xs uppercase tracking-tighter leading-none">
                          <input type="radio" name="lnk" checked={!isRelatedToOccurrence} onChange={() => { setIsRelatedToOccurrence(false); setFormData((prev: PatrimonialFormData) => ({...prev, selected_occurrence_id: '', photo_before_url: ''})); }} className="w-5 h-5 accent-blue-600" /> NÃO
                        </label>
                      </div>
                      {isRelatedToOccurrence && (
                        <select required value={formData.selected_occurrence_id} onChange={(e) => setFormData((prev: PatrimonialFormData) => ({...prev, selected_occurrence_id: e.target.value}))} className="w-full border-2 border-blue-200 p-4 rounded-2xl text-[11px] font-black bg-white uppercase tracking-tighter shadow-sm font-bold">
                          <option value="">Selecione a ocorrência pendente...</option>
                          {filteredOccurrencesForModal.map(o => (<option key={o.id} value={o.id}>{new Date(o.date).toLocaleDateString()} - {o.type}: {o.description?.substring(0, 50)}...</option>))}
                        </select>
                      )}
                    </div>
                  )}
                  <div>
                    <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3 px-1 leading-none">Título da Ação</label>
                    <input type="text" required value={formData.title} onChange={(e) => setFormData((prev: PatrimonialFormData) => ({...prev, title: e.target.value}))} className="w-full border-2 border-gray-50 bg-slate-50/50 p-4 rounded-2xl font-bold text-xs shadow-inner" placeholder="Ex: Substituição das vidraças Bloco B" />
                  </div>
                  <div className="grid grid-cols-2 gap-6">
                    <div><label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3 px-1 leading-none">Foto (Antes)</label><input type="text" value={formData.photo_before_url} readOnly={isRelatedToOccurrence} onChange={(e) => setFormData((prev: PatrimonialFormData) => ({...prev, photo_before_url: e.target.value}))} className={`w-full border-2 p-4 rounded-2xl font-bold text-xs shadow-inner ${isRelatedToOccurrence ? 'bg-gray-100 border-gray-100 text-gray-400' : 'bg-slate-50/50 border-gray-50'}`} placeholder="Link da foto..." /></div>
                    <div><label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3 px-1 leading-none">Foto (Depois)</label><input type="text" value={formData.photo_after_url} onChange={(e) => setFormData((prev: PatrimonialFormData) => ({...prev, photo_after_url: e.target.value}))} className="w-full border-2 border-gray-50 bg-slate-50/50 p-4 rounded-2xl font-bold text-xs shadow-inner focus:border-blue-500 outline-none transition-all" placeholder="Link da foto..." /></div>
                  </div>
                </>
              )}
              
              <div>
                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3 px-1 leading-none">Relato Descritivo</label>
                <textarea rows={3} required value={formData.description} onChange={(e) => setFormData((prev: PatrimonialFormData) => ({...prev, description: e.target.value}))} className="w-full border-2 border-gray-50 bg-slate-50/50 p-4 rounded-2xl font-bold text-xs leading-relaxed outline-none focus:border-blue-500 transition-all shadow-inner" placeholder="Descreva os detalhes da ocorrência ou da intervenção realizada..." />
              </div>

              <div className="flex gap-4 pt-8">
                <button type="button" onClick={() => setShowModal(false)} className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-600 py-5 rounded-[1.5rem] font-black uppercase tracking-widest transition-all">Cancelar</button>
                <button type="submit" className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-5 rounded-[1.5rem] font-black uppercase tracking-widest transition-all shadow-2xl shadow-blue-200">
                  {isEditing ? 'Atualizar Dados' : 'Confirmar Registro'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

const dataGeracao = new Date().toLocaleString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });
import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { 
  ShieldAlert, Leaf, Plus, FileText, 
  AlertTriangle, School, 
  Search, Loader2, X, Link as LinkIcon,
  Download, Info, CheckCircle, Award,
  BarChart3, Filter, ArrowUpRight, ArrowDownRight, MoreHorizontal, Clock, AlertCircle
} from 'lucide-react';

// Declaração para evitar erro de TS com biblioteca global html2pdf via CDN
declare const html2pdf: any;

// --- TIPOS ---
interface SchoolData {
  id: string;
  name: string;
}

// Interface explícita para o perfil do usuário
interface UserProfile {
  role: string;
  school_id: string | null;
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
  occurrence_id?: string; // Campo de vínculo (se existir no banco)
}

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

// --- COMPONENTES VISUAIS ---

// Card de KPI (Indicador)
const KpiCard = ({ title, value, icon: Icon, color, trend }: any) => (
  <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm hover:shadow-md transition-all duration-300 group">
    <div className="flex justify-between items-start mb-4">
      <div className={`p-3 rounded-xl ${color} bg-opacity-10 group-hover:scale-110 transition-transform duration-300`}>
        <Icon className={`w-6 h-6 ${color.replace('bg-', 'text-')}`} />
      </div>
      {trend !== undefined && trend !== null && (
        <span className={`flex items-center text-xs font-bold ${trend >= 0 ? 'text-emerald-600 bg-emerald-50' : 'text-rose-600 bg-rose-50'} px-2 py-1 rounded-lg border border-transparent`}>
          {trend >= 0 ? <ArrowUpRight size={14} className="mr-1"/> : <ArrowDownRight size={14} className="mr-1"/>}
          {Math.abs(trend)}%
        </span>
      )}
    </div>
    <h3 className="text-3xl font-black text-slate-800 tracking-tight mb-1">{value}</h3>
    <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">{title}</p>
  </div>
);

// Componente de Badge de Status
const StatusBadge = ({ status }: { status: string }) => {
  const styles: Record<string, string> = {
    'Pendente': 'bg-rose-50 text-rose-600 border-rose-100',
    'Em Análise': 'bg-amber-50 text-amber-600 border-amber-100',
    'Resolvido': 'bg-emerald-100 text-emerald-700 border-emerald-100',
  };
  const style = styles[status] || 'bg-slate-50 text-slate-600 border-slate-100';
  
  return (
    <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border ${style} shadow-sm inline-flex items-center gap-1.5`}>
      <span className={`w-1.5 h-1.5 rounded-full ${style.replace('bg-', 'bg-opacity-100 bg-').split(' ')[1]}`}></span>
      {status}
    </span>
  );
};

export default function EducacaoPatrimonial() {
  const [loading, setLoading] = useState(true);
  const [schools, setSchools] = useState<SchoolData[]>([]);
  const [occurrences, setOccurrences] = useState<Ocorrencia[]>([]);
  const [actions, setActions] = useState<AcaoEducativa[]>([]);
  
  // Controle de Perfil
  const [userRole, setUserRole] = useState<string>('');
  const [userSchoolId, setUserSchoolId] = useState<string | null>(null);
  
  // UI States
  const [showModal, setShowModal] = useState(false);
  const [modalType, setModalType] = useState<'ocorrencia' | 'acao'>('ocorrencia');
  const [isRelatedToOccurrence, setIsRelatedToOccurrence] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [hoveredBar, setHoveredBar] = useState<number | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  
  // Controle de Impressão
  const [isPrintingMode, setIsPrintingMode] = useState(false);

  // Estado para feedback de erro
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

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

  // Inicialização
  useEffect(() => {
    const initializePage = async () => {
      setLoading(true);
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
          const { data: profileData, error } = await supabase
            .from('profiles')
            .select('role, school_id')
            .eq('id', session.user.id)
            .single();
          
          if (profileData && !error) {
            const profile = profileData as UserProfile;
            setUserRole(profile.role);
            setUserSchoolId(profile.school_id);
            await loadAllData(profile.role, profile.school_id);
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
      let schoolsQuery = supabase.from('schools').select('id, name').order('name');
      let occQuery = (supabase as any).from('patrimonial_occurrences').select('*, schools(name)');
      let actQuery = (supabase as any).from('patrimonial_actions').select('*, schools(name)');

      if (role === 'school_manager' && schoolId) {
        schoolsQuery = schoolsQuery.eq('id', schoolId);
        occQuery = occQuery.eq('school_id', schoolId);
        actQuery = actQuery.eq('school_id', schoolId);
      }

      const [{ data: sData }, { data: oData }, { data: aData }] = await Promise.all([
        schoolsQuery,
        occQuery.order('date', { ascending: false }),
        actQuery.order('date', { ascending: false })
      ]);

      if (sData) setSchools(sData);
      if (oData) setOccurrences(oData);
      if (aData) setActions(aData);

    } catch (error) {
      console.error('Erro ao carregar dados:', error);
    }
  };

  // Funções de Exportação
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

  const handleDownloadPDF = () => {
    setIsPrintingMode(true);
    setTimeout(() => {
      const element = document.getElementById('educacao-patrimonial-content');
      const opt = {
        margin: [5, 5], 
        filename: 'relatorio_patrimonial.pdf',
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

  // --- CÁLCULO DE TENDÊNCIA (Mês Atual vs. Mês Anterior) ---
  const calculateTrend = (data: any[], dateField: string = 'date') => {
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();
    
    // Mês Anterior
    const prevDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const prevMonth = prevDate.getMonth();
    const prevYear = prevDate.getFullYear();

    const currentCount = data.filter(item => {
      const d = new Date(item[dateField]);
      return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
    }).length;

    const prevCount = data.filter(item => {
      const d = new Date(item[dateField]);
      return d.getMonth() === prevMonth && d.getFullYear() === prevYear;
    }).length;

    if (prevCount === 0) return currentCount > 0 ? 100 : 0; 
    
    return Math.round(((currentCount - prevCount) / prevCount) * 100);
  };

  const occurrenceTrend = useMemo(() => calculateTrend(occurrences), [occurrences]);
  const actionsTrend = useMemo(() => calculateTrend(actions), [actions]);

  // Preparação de dados para o Gráfico de Barras
  const chartData = useMemo(() => {
    const months = [];
    const today = new Date();
    // Últimos 6 meses
    for (let i = 5; i >= 0; i--) {
      const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
      months.push({
        dateStr: d.toISOString().slice(0, 7), // YYYY-MM
        label: d.toLocaleDateString('pt-BR', { month: 'short' }).toUpperCase(),
        fullLabel: d.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
      });
    }

    return months.map(m => {
      const occInMonth = occurrences.filter(o => o.date.startsWith(m.dateStr));
      return {
        ...m,
        total: occInMonth.length,
      };
    });
  }, [occurrences]);

  const maxChartValue = Math.max(...chartData.map(d => d.total), 5);

  // --- LÓGICA DE MONITORAMENTO E SUCESSO ---
  const getActionSuccessStatus = (action: AcaoEducativa) => {
    const actionDate = new Date(action.date);
    const today = new Date();
    const diffDays = Math.ceil((today.getTime() - actionDate.getTime()) / (1000 * 60 * 60 * 24));
    
    const hasNewIncidents = occurrences.some(o => 
      o.school_id === action.school_id && 
      new Date(o.date) > actionDate
    );

    if (hasNewIncidents) {
        return { 
            label: 'Sob Avaliação', 
            color: 'text-amber-600 bg-amber-50 border-amber-100', 
            icon: <AlertTriangle size={14} className="text-amber-500" /> 
        };
    }

    if (diffDays >= 60) {
        return { 
            label: 'Consolidação de resultado', 
            color: 'text-emerald-600 bg-emerald-50 border-emerald-100', 
            icon: <Award size={14} className="text-emerald-500" /> 
        };
    }
    if (diffDays >= 30) {
        return { 
            label: 'Bem Sucedida', 
            color: 'text-blue-600 bg-blue-50 border-blue-100', 
            icon: <CheckCircle size={14} className="text-blue-500" /> 
        };
    }
    
    return { 
        label: 'Em monitoramento', 
        color: 'text-indigo-600 bg-indigo-50 border-indigo-100', 
        icon: <Clock size={14} className="text-indigo-500" /> 
    };
  };

  // Verifica se uma ocorrência tem alguma ação vinculada
  const hasLinkedAction = (occ: Ocorrencia) => {
    // Verifica vínculo explícito ou implícito (mesma escola, data posterior à ocorrência)
    return actions.some(a => 
      (a.occurrence_id && a.occurrence_id === occ.id) || 
      (a.school_id === occ.school_id && new Date(a.date) >= new Date(occ.date))
    );
  };

  // Handlers
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    try {
      // --- BLOQUEIO RÍGIDO ---
      // Não permitir salvar como "Resolvido" se não houver ação vinculada
      if (modalType === 'ocorrencia' && formData.status === 'Resolvido') {
        let actionExists = false;
        
        // 1. Verificação no modo Edição:
        if (isEditing && editingId) {
           const currentOcc = occurrences.find(o => o.id === editingId);
           // Se já existe uma ação no banco para essa ocorrência...
           if (currentOcc && hasLinkedAction(currentOcc)) {
             actionExists = true;
           }
        }

        // 2. Verificação no modo Criação ou se não tinha ação antes:
        // Se o usuário marcou "Sim, registrar ação conjunta" (isRelatedToOccurrence) E preencheu o título da ação...
        // Nota: O formulário atual separa os submits. Se ele está no modal 'ocorrencia', ele não está criando a ação AINDA.
        // Portanto, se ele tentar criar uma ocorrência já como 'Resolvida' sem ter a ação criada previamente, deve falhar.
        // A única exceção é se ele estiver usando o fluxo de "Vincular Ação Agora" que apenas seta uma flag visual no momento,
        // mas tecnicamente, a ação precisa existir.
        
        // Para simplificar e garantir integridade: O usuário deve criar a ocorrência como 'Pendente'/'Em Análise',
        // cadastrar a ação, e SÓ DEPOIS mudar para 'Resolvido'.
        // OU, se o sistema permitir criar junto (complexo), validaria ali.
        
        if (!actionExists) {
           setErrorMessage("BLOQUEADO: Para marcar como 'Resolvido', é OBRIGATÓRIO ter uma Ação Educativa cadastrada e vinculada. Cadastre a ação primeiro.");
           return; // Bloqueia o envio
        }
      }

      const finalSchoolId = userRole === 'school_manager' ? userSchoolId : formData.school_id;
      const table = modalType === 'ocorrencia' ? 'patrimonial_occurrences' : 'patrimonial_actions';
      
      const payload: any = {
        school_id: finalSchoolId,
        date: formData.date,
        description: formData.description,
      };

      if (modalType === 'ocorrencia') {
        payload.type = formData.type;
        payload.status = formData.status;
        payload.photo_url = formData.photo_url || null;
      } else {
        payload.title = formData.title;
        payload.impact = formData.impact;
        payload.photo_before_url = formData.photo_before_url || null;
        payload.photo_after_url = formData.photo_after_url || null;
        
        // Se estiver criando uma ação vinculada a uma ocorrência específica
        if (isRelatedToOccurrence && formData.selected_occurrence_id) {
            payload.occurrence_id = formData.selected_occurrence_id;
        }
      }

      if (isEditing && editingId) {
        await (supabase as any).from(table).update(payload).eq('id', editingId);
      } else {
        await (supabase as any).from(table).insert([payload]);
      }
      
      setShowModal(false);
      await loadAllData(userRole, userSchoolId);
      resetForm();
    } catch (error) {
      alert('Erro ao salvar registro.');
    }
  };

  const resetForm = () => {
    setFormData({ ...initialFormState, school_id: userRole === 'school_manager' ? (userSchoolId || '') : '' });
    setIsRelatedToOccurrence(false);
    setIsEditing(false);
    setEditingId(null);
    setErrorMessage(null);
  };

  const handleEdit = (item: any, type: 'ocorrencia' | 'acao') => {
    setModalType(type);
    setIsEditing(true);
    setEditingId(item.id);
    setErrorMessage(null);
    setFormData({
      ...initialFormState,
      ...item,
      type: item.type || 'Mobiliário',
      title: item.title || '',
      impact: item.impact || 'Médio',
      photo_url: item.photo_url || '',
      photo_before_url: item.photo_before_url || '',
      photo_after_url: item.photo_after_url || ''
    });
    setShowModal(true);
  };

  const criticalSchools = useMemo(() => {
    if (occurrences.length === 0) return [];
    const counts = occurrences.reduce((acc: any, curr) => {
      const name = curr.schools?.name || 'Desconhecida';
      acc[name] = (acc[name] || 0) + 1;
      return acc;
    }, {});
    return Object.entries(counts)
      .sort((a: any, b: any) => b[1] - a[1])
      .slice(0, 3);
  }, [occurrences]);

  const dataGeracao = new Date().toLocaleString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });

  return (
    <div id="educacao-patrimonial-content" className="p-8 max-w-[1600px] mx-auto min-h-screen bg-slate-50/50">
      
      {/* Header da Página */}
      <header className="flex flex-col md:flex-row md:items-center justify-between mb-10 gap-6">
        <div>
          <h1 className="text-3xl font-black text-slate-800 tracking-tight flex items-center gap-3">
            <ShieldAlert className="text-indigo-600 w-8 h-8" />
            Gestão Patrimonial
          </h1>
          <p className="text-slate-500 font-medium mt-2">
            Monitoramento de ocorrências, vandalismo e ações de zeladoria escolar.
          </p>
          {isPrintingMode && <p className="text-xs text-slate-400 mt-1">Relatório gerado em {dataGeracao}</p>}
        </div>
        
        {/* Botões - Ocultos na Impressão */}
        {!isPrintingMode && (
          <div className="flex flex-wrap items-center gap-3">
            <button onClick={handleExportExcel} className="bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 px-4 py-3 rounded-xl font-bold text-xs flex items-center gap-2 transition-all">
              <Download size={16} /> EXCEL
            </button>
            <button onClick={handleDownloadPDF} className="bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 px-4 py-3 rounded-xl font-bold text-xs flex items-center gap-2 transition-all mr-2">
              <FileText size={16} /> PDF
            </button>

            <button 
              onClick={() => { setModalType('ocorrencia'); resetForm(); setShowModal(true); }}
              className="bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-3 rounded-xl font-bold text-sm flex items-center gap-2 transition-all shadow-lg shadow-indigo-200 hover:-translate-y-1"
            >
              <Plus size={18} strokeWidth={3} />
              NOVA OCORRÊNCIA
            </button>
            {userRole !== 'school_manager' && (
              <button 
                onClick={() => { setModalType('acao'); resetForm(); setShowModal(true); }}
                className="bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-3 rounded-xl font-bold text-sm flex items-center gap-2 transition-all shadow-lg shadow-emerald-200 hover:-translate-y-1"
              >
                <Leaf size={18} strokeWidth={3} />
                NOVA AÇÃO
              </button>
            )}
          </div>
        )}
      </header>

      {loading ? (
        <div className="flex justify-center items-center h-64">
          <Loader2 className="w-10 h-10 text-indigo-600 animate-spin" />
        </div>
      ) : (
        <>
          {/* Grid de KPIs */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-10">
            <KpiCard 
              title="Total Ocorrências" 
              value={occurrences.length} 
              icon={AlertTriangle} 
              color="bg-rose-500"
              trend={occurrenceTrend} 
            />
            <KpiCard 
              title="Em Aberto" 
              value={occurrences.filter(o => o.status !== 'Resolvido').length} 
              icon={Loader2} 
              color="bg-amber-500" 
            />
            <KpiCard 
              title="Ações Realizadas" 
              value={actions.length} 
              icon={CheckCircle} 
              color="bg-emerald-500"
              trend={actionsTrend}
            />
            <KpiCard 
              title="Taxa de Resolução" 
              value={`${occurrences.length ? Math.round((occurrences.filter(o => o.status === 'Resolvido').length / occurrences.length) * 100) : 0}%`} 
              icon={BarChart3} 
              color="bg-indigo-500" 
            />
          </div>

          {/* Conteúdo Principal */}
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
            
            {/* Coluna da Esquerda: Gráfico e Lista (2/3 da largura) */}
            <div className="xl:col-span-2 space-y-8">
              
              {/* Card do Gráfico */}
              <div className="bg-white p-8 rounded-3xl border border-slate-100 shadow-sm transition-shadow hover:shadow-md">
                <div className="flex justify-between items-center mb-8">
                  <div>
                    <h3 className="text-xl font-bold text-slate-800">Evolução de Ocorrências</h3>
                    <p className="text-sm text-slate-400 font-medium mt-1">Comparativo mensal de incidentes registrados</p>
                  </div>
                  {!isPrintingMode && (
                    <div className="flex gap-2">
                      <button className="p-2 text-slate-400 hover:text-indigo-600 transition-colors bg-slate-50 rounded-lg hover:bg-indigo-50"><Filter size={18} /></button>
                    </div>
                  )}
                </div>

                {/* Área do Gráfico de Barras */}
                <div className="h-[300px] w-full relative flex items-end justify-between gap-4 px-4 select-none">
                  
                  {/* Linhas de Grade (Background) */}
                  <div className="absolute inset-0 flex flex-col justify-between pointer-events-none z-0">
                    {[...Array(5)].map((_, i) => (
                      <div key={i} className="border-b border-dashed border-slate-100 w-full h-full last:border-0 relative">
                        <span className="absolute -left-8 -top-2 text-[10px] font-bold text-slate-300">
                          {Math.round(maxChartValue * (1 - i/4))}
                        </span>
                      </div>
                    ))}
                  </div>

                  {/* Barras */}
                  {chartData.map((data, index) => {
                    const heightPercent = (data.total / maxChartValue) * 100;
                    return (
                      <div 
                        key={index} 
                        className="relative flex-1 h-full flex items-end group z-10"
                        onMouseEnter={() => setHoveredBar(index)}
                        onMouseLeave={() => setHoveredBar(null)}
                      >
                        <div 
                          className={`w-full mx-2 rounded-t-xl transition-all duration-300 ease-out relative ${hoveredBar === index ? 'bg-indigo-600 shadow-lg shadow-indigo-200 translate-y-[-4px]' : 'bg-slate-200'}`}
                          style={{ height: `${heightPercent || 2}%` }} // Minimo de altura para visualização
                        >
                          {/* Tooltip Flutuante */}
                          <div className={`absolute bottom-full left-1/2 -translate-x-1/2 mb-3 bg-slate-800 text-white text-xs font-bold py-1.5 px-3 rounded-lg shadow-xl whitespace-nowrap transition-all duration-200 ${hoveredBar === index ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2 pointer-events-none'}`}>
                            {data.total} Ocorrências
                            <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-slate-800"></div>
                          </div>
                        </div>
                        <div className={`absolute -bottom-8 left-0 right-0 text-center text-[10px] font-bold uppercase tracking-wider transition-colors ${hoveredBar === index ? 'text-indigo-600' : 'text-slate-400'}`}>
                          {data.label}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* Lista de Ocorrências Recentes */}
              <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden transition-shadow hover:shadow-md">
                <div className="p-6 border-b border-slate-50 flex justify-between items-center bg-slate-50/50">
                  <h3 className="font-bold text-slate-800 flex items-center gap-2">
                    <FileText size={18} className="text-slate-400" />
                    Registros Recentes
                  </h3>
                  {!isPrintingMode && (
                    <div className="relative">
                      <input 
                        type="text" 
                        placeholder="Buscar por escola..." 
                        className="pl-9 pr-4 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold outline-none focus:border-indigo-500 w-48 transition-all"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                      />
                      <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    </div>
                  )}
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-white text-slate-400 font-bold uppercase text-[10px] tracking-widest border-b border-slate-50">
                      <tr>
                        <th className="p-5 pl-8">Data</th>
                        <th className="p-5">Escola</th>
                        <th className="p-5">Tipo</th>
                        <th className="p-5 text-center">Status</th>
                        {!isPrintingMode && <th className="p-5 text-right pr-8">Ações</th>}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {occurrences
                        .filter(o => o.schools?.name.toLowerCase().includes(searchTerm.toLowerCase()))
                        .slice(0, 5)
                        .map((occ) => {
                          const hasAction = hasLinkedAction(occ);
                          // Se NÃO está resolvido e NÃO tem ação, consideramos "Ação Necessária"
                          const actionRequired = !hasAction && occ.status !== 'Resolvido';
                          
                          return (
                            <tr key={occ.id} className={`hover:bg-slate-50 transition-colors group ${actionRequired ? 'bg-rose-50/40' : ''}`}>
                              <td className="p-5 pl-8 font-medium text-slate-600 whitespace-nowrap">
                                {new Date(occ.date).toLocaleDateString('pt-BR')}
                              </td>
                              <td className="p-5 font-bold text-slate-800 uppercase text-xs">
                                {occ.schools?.name}
                                {actionRequired && (
                                  <div className="flex items-center gap-1.5 mt-1.5 text-rose-500 text-[10px] font-bold uppercase tracking-tight animate-pulse">
                                    <AlertCircle size={12} /> Ação Pendente
                                  </div>
                                )}
                              </td>
                              <td className="p-5"><span className="text-xs font-medium text-slate-500 bg-slate-100 px-2 py-1 rounded">{occ.type}</span></td>
                              <td className="p-5 text-center"><StatusBadge status={occ.status} /></td>
                              {!isPrintingMode && (
                                <td className="p-5 text-right pr-8">
                                  <button 
                                    onClick={() => handleEdit(occ, 'ocorrencia')} 
                                    className={`transition-colors p-2 rounded-full ${actionRequired ? 'text-rose-400 hover:text-rose-600 hover:bg-rose-100' : 'text-slate-400 hover:text-indigo-600 hover:bg-indigo-50'}`}
                                    title={actionRequired ? "Ocorrência requer ação vinculada" : "Editar"}
                                  >
                                    <MoreHorizontal size={18} />
                                  </button>
                                </td>
                              )}
                            </tr>
                          );
                        })}
                    </tbody>
                  </table>
                </div>
              </div>

            </div>

            {/* Coluna da Direita: Ações e Detalhes (1/3 da largura) */}
            <div className="space-y-8">
              
              {/* Card de Ações Educativas */}
              <div className="bg-indigo-900 rounded-3xl p-8 text-white shadow-xl relative overflow-hidden transition-transform hover:scale-[1.01] duration-300">
                <div className="absolute top-0 right-0 p-32 bg-indigo-800 rounded-full blur-3xl opacity-20 -mr-16 -mt-16 animate-pulse"></div>
                <div className="relative z-10">
                  <div className="flex items-center gap-3 mb-6">
                    <div className="p-3 bg-white/10 rounded-xl backdrop-blur-sm">
                      <Leaf className="text-emerald-400" />
                    </div>
                    <div>
                      <h3 className="text-lg font-bold">Ações Educativas</h3>
                      <p className="text-indigo-200 text-xs font-medium">Monitoramento de Resultados</p>
                    </div>
                  </div>

                  <div className="space-y-4">
                    {actions.slice(0, 4).map((acao, idx) => {
                      const status = getActionSuccessStatus(acao);
                      return (
                        <div key={idx} className="bg-white/5 p-4 rounded-2xl border border-white/10 hover:bg-white/10 transition-all cursor-pointer group">
                          <div className="flex justify-between items-start mb-2">
                            <span className="text-[10px] font-bold bg-indigo-800/50 px-2 py-1 rounded text-indigo-200 uppercase tracking-wider">{new Date(acao.date).toLocaleDateString('pt-BR')}</span>
                            <div className={`flex items-center gap-1.5 px-2 py-1 rounded-lg border text-[9px] font-black uppercase ${status.color}`}>
                                {status.icon} {status.label}
                            </div>
                          </div>
                          <h4 className="font-bold text-sm mb-1 group-hover:text-emerald-300 transition-colors">{acao.title}</h4>
                          <p className="text-xs text-indigo-200 line-clamp-1">{acao.schools?.name}</p>
                        </div>
                      );
                    })}
                  </div>
                  
                  {!isPrintingMode && (
                    <button 
                      onClick={() => { setModalType('acao'); resetForm(); setShowModal(true); }}
                      className="w-full mt-6 bg-white text-indigo-900 py-3.5 rounded-xl font-bold text-sm hover:bg-indigo-50 transition-colors shadow-lg"
                    >
                      Nova Intervenção
                    </button>
                  )}
                </div>
              </div>

              {/* Card de Status Rápido */}
              <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm transition-shadow hover:shadow-md">
                <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
                  <School size={18} className="text-slate-400"/>
                  Unidades Críticas
                </h3>
                <div className="space-y-3">
                  {(criticalSchools.length > 0 ? criticalSchools : [['Nenhuma ocorrência', 0]]).map(([name, count]: any, idx: number) => (
                    <div key={idx} className="flex items-center justify-between p-3 hover:bg-slate-50 rounded-xl transition-colors">
                      <div className="flex items-center gap-3">
                        <span className={`w-6 h-6 flex items-center justify-center rounded-full text-xs font-bold ${idx === 0 ? 'bg-rose-100 text-rose-700' : 'bg-slate-100 text-slate-600'}`}>{idx + 1}</span>
                        <span className="text-xs font-bold text-slate-700 uppercase truncate max-w-[150px]">{name}</span>
                      </div>
                      <span className="text-xs font-bold text-slate-400">{count} regs</span>
                    </div>
                  ))}
                </div>
              </div>

            </div>
          </div>
        </>
      )}

      {/* Modal de Formulário */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white w-full max-w-xl rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 border-4 border-white/50">
            <div className="bg-slate-50 px-8 py-6 border-b border-slate-100 flex justify-between items-center">
              <h3 className="text-xl font-black text-slate-800 tracking-tight">
                {isEditing ? 'Editar Registro' : (modalType === 'ocorrencia' ? 'Nova Ocorrência' : 'Nova Ação')}
              </h3>
              <button onClick={() => setShowModal(false)} className="p-2 bg-white rounded-full text-slate-400 hover:text-rose-500 transition-colors shadow-sm">
                <X size={20} />
              </button>
            </div>
            
            <form onSubmit={handleSubmit} className="p-8 space-y-5">
              
              {errorMessage && (
                <div className="bg-rose-50 border border-rose-200 rounded-xl p-4 flex items-start gap-3 animate-in slide-in-from-top-2">
                  <AlertTriangle className="text-rose-500 shrink-0 mt-0.5" size={18} />
                  <div className="flex-1">
                    <p className="text-sm font-bold text-rose-800">Ação Necessária</p>
                    <p className="text-xs text-rose-600 mt-1">{errorMessage}</p>
                  </div>
                </div>
              )}

              {/* Campos do Formulário */}
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider ml-1">Unidade Escolar</label>
                <select 
                  required
                  disabled={userRole === 'school_manager' || (isEditing && userRole !== 'regional_admin')}
                  value={formData.school_id} 
                  onChange={(e) => setFormData(prev => ({...prev, school_id: e.target.value}))} 
                  className="w-full bg-slate-50 border border-slate-200 text-slate-700 text-sm font-bold rounded-xl p-3 outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
                >
                  <option value="">Selecione a escola...</option>
                  {schools.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-5">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider ml-1">Data</label>
                  <input 
                    type="date" 
                    required 
                    value={formData.date} 
                    onChange={(e) => setFormData(prev => ({...prev, date: e.target.value}))} 
                    className="w-full bg-slate-50 border border-slate-200 text-slate-700 text-sm font-bold rounded-xl p-3 outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider ml-1">
                    {modalType === 'ocorrencia' ? 'Tipo' : 'Impacto'}
                  </label>
                  <select 
                    value={modalType === 'ocorrencia' ? formData.type : formData.impact} 
                    onChange={(e) => setFormData(prev => ({...prev, [modalType === 'ocorrencia' ? 'type' : 'impact']: e.target.value}))} 
                    className="w-full bg-slate-50 border border-slate-200 text-slate-700 text-sm font-bold rounded-xl p-3 outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
                  >
                    {modalType === 'ocorrencia' ? (
                      <><option>Mobiliário</option><option>Vidros</option><option>Equipamento</option><option>Predial</option><option>Outros</option></>
                    ) : (
                      <><option>Alto</option><option>Médio</option><option>Baixo</option></>
                    )}
                  </select>
                </div>
              </div>

              {modalType === 'ocorrencia' && (
                <>
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider ml-1">Status</label>
                    <select 
                      value={formData.status} 
                      onChange={(e) => setFormData(prev => ({...prev, status: e.target.value}))} 
                      className="w-full bg-slate-50 border border-slate-200 text-slate-700 text-sm font-bold rounded-xl p-3 outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
                    >
                      <option>Pendente</option><option>Em Análise</option><option>Resolvido</option>
                    </select>
                    {formData.status === 'Resolvido' && (
                      <p className="text-[10px] text-amber-600 font-bold mt-1 px-1 flex items-center gap-1">
                        <Info size={10} /> Obrigatório ter ação educativa vinculada para concluir.
                      </p>
                    )}
                  </div>
                  {!isEditing && (
                    <div className="bg-indigo-50 p-4 rounded-xl border border-indigo-100">
                      <div className="flex items-center justify-between mb-3">
                        <label className="text-xs font-bold text-indigo-800 uppercase tracking-wider flex items-center gap-2">
                          <LinkIcon size={14}/> Vincular Ação Agora?
                        </label>
                      </div>
                      <div className="flex gap-4">
                        <label className="flex items-center gap-2 cursor-pointer text-sm font-bold text-indigo-900">
                          <input type="radio" name="link_action" checked={!isRelatedToOccurrence} onChange={() => setIsRelatedToOccurrence(false)} className="accent-indigo-600 w-4 h-4"/> Não
                        </label>
                        <label className="flex items-center gap-2 cursor-pointer text-sm font-bold text-indigo-900">
                          <input type="radio" name="link_action" checked={isRelatedToOccurrence} onChange={() => setIsRelatedToOccurrence(true)} className="accent-indigo-600 w-4 h-4"/> Sim, registrar ação conjunta
                        </label>
                      </div>
                    </div>
                  )}
                </>
              )}

              {modalType === 'acao' && (
                <>
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider ml-1">Título da Ação</label>
                    <input 
                      type="text" 
                      required 
                      value={formData.title} 
                      onChange={(e) => setFormData(prev => ({...prev, title: e.target.value}))} 
                      placeholder="Ex: Palestra sobre Cidadania"
                      className="w-full bg-slate-50 border border-slate-200 text-slate-700 text-sm font-bold rounded-xl p-3 outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
                    />
                  </div>
                  
                  {!isEditing && (
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-slate-500 uppercase tracking-wider ml-1">Vincular a Ocorrência (Opcional)</label>
                      <select 
                        value={formData.selected_occurrence_id}
                        onChange={(e) => setFormData(prev => ({...prev, selected_occurrence_id: e.target.value}))}
                        className="w-full bg-slate-50 border border-slate-200 text-slate-700 text-sm font-bold rounded-xl p-3 outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
                      >
                        <option value="">Nenhuma (Ação Preventiva)</option>
                        {occurrences.filter(o => o.status !== 'Resolvido' && o.school_id === formData.school_id).map(o => (
                          <option key={o.id} value={o.id}>
                            {new Date(o.date).toLocaleDateString()} - {o.type}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </>
              )}

              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider ml-1">Descrição</label>
                <textarea 
                  rows={3} 
                  required 
                  value={formData.description} 
                  onChange={(e) => setFormData(prev => ({...prev, description: e.target.value}))} 
                  placeholder="Detalhes do ocorrido..."
                  className="w-full bg-slate-50 border border-slate-200 text-slate-700 text-sm font-bold rounded-xl p-3 outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all resize-none"
                />
              </div>

              <div className="pt-4 flex gap-3">
                <button 
                  type="button" 
                  onClick={() => setShowModal(false)}
                  className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-600 py-3.5 rounded-xl font-bold uppercase text-xs tracking-widest transition-colors"
                >
                  Cancelar
                </button>
                <button 
                  type="submit"
                  className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white py-3.5 rounded-xl font-bold uppercase text-xs tracking-widest transition-all shadow-lg shadow-indigo-200 hover:-translate-y-1"
                >
                  Salvar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
import { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { 
  Droplets, Calendar as ChevronLeft, ChevronRight, 
  Save, X, AlertTriangle, CheckCircle,  
  Search, Building2, Users, Loader2,
  AlertCircle, ArrowRight, ArrowDown, Activity, ShieldCheck,
  TrendingUp, Waves, ListFilter,
  CalendarDays, FileDown,
} from 'lucide-react';
import { 
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, 
  ResponsiveContainer, 
} from 'recharts';

// Tipagem baseada no banco de dados
interface WaterLog {
  id?: string;
  school_id: string;
  date: string;
  reading_m3: number;
  consumption_diff: number; 
  student_count: number;
  staff_count: number;
  limit_exceeded: boolean;
  justification: string | null;
  action_plan: string | null;
  created_at?: string;
  created_by?: string;
  school_name?: string;
}

interface School {
  id: string;
  name: string;
}

const MONTHS = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"
];

const YEARS = Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - 2 + i);

function formatDateToYMD(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function ConsumoAgua() {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [schools, setSchools] = useState<School[]>([]);
  const [selectedSchoolId, setSelectedSchoolId] = useState<string | null>(null);
  const [userRole, setUserRole] = useState<string>('');
  const [userId, setUserId] = useState<string>('');
  const [logs, setLogs] = useState<Record<string, WaterLog>>({}); 
  const [allMonthLogs, setAllMonthLogs] = useState<WaterLog[]>([]); 
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedDateStr, setSelectedDateStr] = useState('');
  const [saveLoading, setSaveLoading] = useState(false);
  const [prevReadingValue, setPrevReadingValue] = useState<number>(0);
  const [loadingPrev, setLoadingPrev] = useState(false);
  
  const [formData, setFormData] = useState({
    reading_m3: 0,
    student_count: 0,
    staff_count: 0,
    justification: '',
    action_plan: ''
  });

  // --- Constantes de Calendário ---
  const monthName = currentDate.toLocaleString('pt-BR', { month: 'long' });
  const firstDayOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1).getDay();
  const daysInMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0).getDate();

  useEffect(() => {
    fetchInitialData();
  }, []);

  useEffect(() => {
    fetchLogs();
  }, [selectedSchoolId, currentDate]);

  async function fetchInitialData() {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setUserId(user.id);
        const { data: profile } = await (supabase as any).from('profiles').select('role, school_id').eq('id', user.id).single();
        setUserRole(profile?.role || '');
        
        if (profile?.role === 'school_manager') {
          setSelectedSchoolId(profile.school_id);
        }
      }

      const { data: schoolsData } = await (supabase as any).from('schools').select('id, name').order('name');
      setSchools(schoolsData || []);
    } catch (error) {
      console.error('Erro ao carregar dados iniciais:', error);
    } finally {
      setLoading(false);
    }
  }

  async function fetchLogs() {
    const firstDay = formatDateToYMD(new Date(currentDate.getFullYear(), currentDate.getMonth(), 1));
    const lastDay = formatDateToYMD(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0));

    try {
      let query = (supabase as any).from('consumo_agua').select('*');
      
      if (selectedSchoolId) {
        query = query.eq('school_id', selectedSchoolId);
      }
      
      const { data, error } = await query
        .gte('date', firstDay)
        .lte('date', lastDay)
        .order('date', { ascending: true });

      if (error) throw error;

      const rawLogs = (data || []) as WaterLog[];
      setAllMonthLogs(rawLogs);

      if (selectedSchoolId) {
        const logsMap: Record<string, WaterLog> = {};
        rawLogs.forEach((log: WaterLog) => {
          logsMap[log.date] = log;
        });
        setLogs(logsMap);
      } else {
        setLogs({});
      }
    } catch (error) {
      console.error('Erro ao buscar consumos:', error);
    }
  }

  // --- Cálculos de Resumo ---
  const stats = useMemo(() => {
    const totalConsumption = allMonthLogs.reduce((acc, curr) => acc + (curr.consumption_diff || 0), 0);
    const totalLimit = allMonthLogs.reduce((acc, curr) => acc + (curr.student_count + curr.staff_count) * 0.008, 0);
    const totalEntries = allMonthLogs.length;
    
    return {
      totalConsumption,
      totalLimit,
      avgConsumption: totalEntries > 0 ? totalConsumption / totalEntries : 0,
      exceededDays: allMonthLogs.filter(log => log.limit_exceeded).length,
    };
  }, [allMonthLogs]);

  const isTotalExceeded = stats.totalConsumption > stats.totalLimit && stats.totalLimit > 0;

  // --- Dados para Exibição ---
  const chartData = useMemo(() => {
    const dailyMap: Record<string, { date: string, consumo: number, limite: number }> = {};
    allMonthLogs.forEach(log => {
      if (!dailyMap[log.date]) {
        dailyMap[log.date] = { 
          date: new Date(log.date + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }), 
          consumo: 0, 
          limite: 0 
        };
      }
      dailyMap[log.date].consumo += (log.consumption_diff || 0);
      dailyMap[log.date].limite += ((log.student_count + log.staff_count) * 0.008);
    });
    return Object.values(dailyMap);
  }, [allMonthLogs]);

  const justificationsList = useMemo(() => {
    return allMonthLogs
      .filter(log => log.limit_exceeded && log.justification)
      .map(log => ({
        ...log,
        school_name: schools.find(s => s.id === log.school_id)?.name || 'Escola não identificada'
      }))
      .sort((a, b) => a.school_name.localeCompare(b.school_name));
  }, [allMonthLogs, schools]);

  // --- Exportação PDF (Novo Motor de Redimensionamento) ---
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

      // Selecionamos o template de impressão que é estruturado apenas com tabelas
      const element = document.getElementById('pdf-print-template');
      if (!element) throw new Error("Template de impressão não encontrado.");

      const schoolName = selectedSchoolId 
        ? schools.find(s => s.id === selectedSchoolId)?.name 
        : 'Rede_Global';

      const opt = {
        margin: [5, 5, 5, 5],
        filename: `Relatorio_Executivo_Consumo_${schoolName}_${monthName}.pdf`,
        image: { type: 'jpeg', quality: 1 },
        html2canvas: { 
          scale: 2, 
          useCORS: true, 
          logging: false,
          letterRendering: true,
          width: 1120 // Largura exata para o layout de tabela em A4 Paisagem
        },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'landscape' },
        pagebreak: { mode: ['css', 'legacy'] }
      };

      // Tornamos o template visível temporariamente apenas para o html2pdf
      element.style.display = 'block';
      
      await (window as any).html2pdf().set(opt).from(element).save();

      element.style.display = 'none';
      setExporting(false);

    } catch (error) {
      console.error('Erro ao gerar PDF:', error);
      alert('Erro na geração do relatório executivo.');
      setExporting(false);
    }
  };

  const handleMonthChange = (monthIdx: number) => {
    const newDate = new Date(currentDate);
    newDate.setMonth(monthIdx);
    setCurrentDate(newDate);
  };

  const handleYearChange = (year: number) => {
    const newDate = new Date(currentDate);
    newDate.setFullYear(year);
    setCurrentDate(newDate);
  };

  const handlePrevMonth = () => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
  const handleNextMonth = () => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));

  const openRegisterModal = async (day: number) => {
    const date = new Date(currentDate.getFullYear(), currentDate.getMonth(), day);
    const dateStr = formatDateToYMD(date);
    const todayStr = formatDateToYMD(new Date());
    
    if (userRole === 'regional_admin') {
      if (logs[dateStr]) {
        setSelectedDateStr(dateStr);
        setFormData({
          reading_m3: logs[dateStr].reading_m3,
          student_count: logs[dateStr].student_count,
          staff_count: logs[dateStr].staff_count,
          justification: logs[dateStr].justification || '',
          action_plan: logs[dateStr].action_plan || ''
        });
        
        setLoadingPrev(true);
        const { data: prevData } = await (supabase as any)
          .from('consumo_agua')
          .select('reading_m3')
          .eq('school_id', selectedSchoolId)
          .lt('date', dateStr)
          .order('date', { ascending: false })
          .limit(1);
        setPrevReadingValue(prevData?.[0]?.reading_m3 || 0);
        setLoadingPrev(false);
        setIsModalOpen(true);
      }
      return;
    }
    
    if (dateStr > todayStr) return;
    setSelectedDateStr(dateStr);
    
    setLoadingPrev(true);
    const { data: prevData } = await (supabase as any)
      .from('consumo_agua')
      .select('reading_m3')
      .eq('school_id', selectedSchoolId)
      .lt('date', dateStr)
      .order('date', { ascending: false })
      .limit(1);
    
    setPrevReadingValue(prevData?.[0]?.reading_m3 || 0);
    setLoadingPrev(false);

    const existing = logs[dateStr];
    setFormData(existing ? {
      reading_m3: existing.reading_m3,
      student_count: existing.student_count,
      staff_count: existing.staff_count,
      justification: existing.justification || '',
      action_plan: existing.action_plan || ''
    } : {
      reading_m3: 0, student_count: 0, staff_count: 0, justification: '', action_plan: ''
    });
    setIsModalOpen(true);
  };

  const currentConsumption = Math.max(0, formData.reading_m3 - prevReadingValue);
  const currentLimit = (formData.student_count + formData.staff_count) * 0.008;
  const isLimitExceeded = currentConsumption > currentLimit && formData.reading_m3 > 0;
  const isHydrometerBlocked = userRole !== 'regional_admin' && (formData.student_count <= 0 || formData.staff_count <= 0);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaveLoading(true);
    try {
      if (isLimitExceeded && (!formData.justification || !formData.action_plan)) {
        throw new Error("Preencha justificativa e ação para excessos.");
      }
      const logData = {
        school_id: selectedSchoolId,
        date: selectedDateStr,
        reading_m3: formData.reading_m3,
        consumption_diff: currentConsumption,
        student_count: formData.student_count,
        staff_count: formData.staff_count, 
        limit_exceeded: isLimitExceeded,
        justification: isLimitExceeded ? formData.justification : null,
        action_plan: isLimitExceeded ? formData.action_plan : null,
        created_by: userId
      };
      const { error } = await (supabase as any).from('consumo_agua').upsert([logData], { onConflict: 'school_id,date' });
      if (error) throw error;
      setIsModalOpen(false);
      fetchLogs();
    } catch (error: any) {
      alert(error.message);
    } finally {
      setSaveLoading(false);
    }
  }

  const renderDay = (day: number) => {
    const date = new Date(currentDate.getFullYear(), currentDate.getMonth(), day);
    const dateStr = formatDateToYMD(date);
    const log = logs[dateStr];
    const todayStr = formatDateToYMD(new Date());
    const isFuture = dateStr > todayStr;
    let stateClass = "bg-slate-50 text-slate-300"; 
    let showAttention = false;

    if (!isFuture) {
      if (log) {
        stateClass = "bg-emerald-50 text-emerald-700 border-emerald-200"; 
        if (log.limit_exceeded) {
          showAttention = true;
          stateClass = "bg-amber-50 text-amber-700 border-amber-300 ring-1 ring-amber-400 ring-inset";
        }
      } else if (dateStr < todayStr) {
        stateClass = "bg-red-50 text-red-700 border-red-200"; 
      }
    }

    return (
      <div key={day} onClick={() => openRegisterModal(day)} className={`h-28 md:h-32 p-3 border rounded-3xl transition-all cursor-pointer flex flex-col justify-between group relative overflow-hidden ${stateClass} ${!log && !isFuture && dateStr < todayStr ? 'hover:bg-red-100' : 'hover:shadow-md'}`}>
        <div className="flex justify-between items-start z-10">
          <span className="text-sm font-black">{day}</span>
          {showAttention && <div className="p-1 bg-amber-500 text-white rounded-full animate-bounce shadow-lg"><AlertTriangle size={14} /></div>}
          {log && !log.limit_exceeded && <CheckCircle size={14} className="text-emerald-500" />}
        </div>
        {log ? (
          <div className="z-10">
             <div className="text-[14px] font-black text-slate-900 leading-none">{log.reading_m3.toLocaleString()}</div>
             <div className="text-[9px] font-bold uppercase text-slate-400 mt-1">m³ Registrado</div>
             <div className={`mt-2 text-[10px] font-black px-2 py-0.5 rounded-full inline-block ${log.limit_exceeded ? 'bg-amber-500 text-white' : 'bg-emerald-200 text-emerald-800'}`}>
                {log.consumption_diff.toFixed(2)} m³
             </div>
          </div>
        ) : !isFuture && dateStr < todayStr ? <div className="text-[10px] font-black uppercase text-red-500 z-10 italic text-center">Atrasado</div> : null}
        {log && <Droplets className="absolute -bottom-2 -right-2 text-current opacity-5" size={60} />}
      </div>
    );
  };

  return (
    <div className="space-y-6 pb-20">
      
      {/* -------------------------------------------------------------------------------- */}
      {/* 1. LAYOUT INTERATIVO (O que o usuário vê na tela) */}
      {/* -------------------------------------------------------------------------------- */}
      
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 print:hidden">
        <div>
          <div className="flex items-center gap-3">
             <div className="p-3 bg-blue-600 rounded-2xl shadow-lg shadow-blue-100 text-white"><Droplets size={24} /></div>
             <div>
                <h1 className="text-2xl font-black text-slate-900 tracking-tight text-blue-600">Gestão Regional de Água</h1>
                <p className="text-slate-500 text-sm font-medium">Auditoria e controle de consumo hídrico.</p>
             </div>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
            {userRole === 'regional_admin' && (
                <button 
                    onClick={handleExportPDF}
                    disabled={exporting}
                    className="bg-slate-900 text-white px-6 py-3 rounded-2xl font-black flex items-center justify-center gap-2 shadow-xl hover:bg-slate-800 transition-all active:scale-95 disabled:opacity-50"
                >
                    {exporting ? <Loader2 className="animate-spin" size={18}/> : <FileDown size={18} />}
                    {exporting ? 'GERANDO PDF...' : 'EXPORTAR RELATÓRIO'}
                </button>
            )}

            {userRole === 'regional_admin' && (
                <div className="flex flex-col sm:flex-row gap-3">
                    <div className="bg-white p-2 rounded-2xl border-2 border-slate-100 shadow-sm flex items-center gap-2">
                        <CalendarDays size={18} className="text-blue-500 ml-2" />
                        <select className="bg-transparent border-none outline-none font-bold text-slate-700 text-xs py-2 cursor-pointer" value={currentDate.getMonth()} onChange={(e) => handleMonthChange(Number(e.target.value))}>
                            {MONTHS.map((m, i) => <option key={m} value={i}>{m}</option>)}
                        </select>
                        <div className="w-px h-4 bg-slate-200"></div>
                        <select className="bg-transparent border-none outline-none font-bold text-slate-700 text-xs py-2 cursor-pointer mr-2" value={currentDate.getFullYear()} onChange={(e) => handleYearChange(Number(e.target.value))}>
                            {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
                        </select>
                    </div>

                    <div className="w-full sm:w-64 bg-white p-2 rounded-2xl border-2 border-slate-100 shadow-sm flex items-center gap-3">
                        <Search size={18} className="text-slate-400 ml-2" />
                        <select className="w-full bg-transparent border-none outline-none font-bold text-slate-700 text-xs py-2 truncate" value={selectedSchoolId || ''} onChange={(e) => setSelectedSchoolId(e.target.value || null)}>
                            <option value="">REDE REGIONAL GLOBAL (TODAS)</option>
                            {schools.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                        </select>
                    </div>
                </div>
            )}
        </div>
      </div>

      {/* Cards de Indicadores (Visíveis na Tela) */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 print:hidden">
          <div className={`p-6 rounded-[2.5rem] border-2 transition-all flex items-center gap-4 shadow-xl ${isTotalExceeded ? 'bg-red-50 border-red-200 text-red-700' : 'bg-white border-slate-100'}`}>
              <div className={`p-4 rounded-2xl ${isTotalExceeded ? 'bg-red-600 text-white' : 'bg-blue-600 text-white'}`}><Waves size={20} /></div>
              <div><p className="text-[10px] font-black uppercase tracking-widest opacity-60">Total Consumido</p><h3 className="text-xl font-black">{stats.totalConsumption.toFixed(2)} m³</h3></div>
          </div>
          <div className="bg-white p-6 rounded-[2.5rem] border-2 border-slate-100 shadow-xl flex items-center gap-4">
              <div className="p-4 bg-slate-900 text-white rounded-2xl"><ShieldCheck size={20} /></div>
              <div><p className="text-[10px] font-black uppercase tracking-widest opacity-40">Teto Operacional</p><h3 className="text-xl font-black text-slate-800">{stats.totalLimit.toFixed(2)} m³</h3></div>
          </div>
          <div className="bg-white p-6 rounded-[2.5rem] border-2 border-slate-100 shadow-xl flex items-center gap-4">
              <div className="p-4 bg-blue-50 text-blue-600 rounded-2xl"><TrendingUp size={20} /></div>
              <div><p className="text-[10px] font-black uppercase tracking-widest opacity-40">Média Diária</p><h3 className="text-xl font-black text-slate-800">{stats.avgConsumption.toFixed(2)} m³</h3></div>
          </div>
          <div className="bg-white p-6 rounded-[2.5rem] border-2 border-slate-100 shadow-xl flex items-center gap-4">
              <div className={`p-4 rounded-2xl ${stats.exceededDays > 0 ? 'bg-amber-500 text-white' : 'bg-emerald-500 text-white'}`}><AlertTriangle size={20} /></div>
              <div><p className="text-[10px] font-black uppercase tracking-widest opacity-40">Alertas Ativos</p><h3 className="text-xl font-black text-slate-800">{stats.exceededDays} dias</h3></div>
          </div>
      </div>

      {/* Gráfico Interativo (Visível apenas na tela) */}
      <div className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-2xl print:hidden">
          <h3 className="text-lg font-black text-slate-800 uppercase tracking-tight flex items-center gap-2 mb-8">
              <Activity className="text-blue-600" size={20} /> Evolução Mensal de Consumo
          </h3>
          <div className="h-[280px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                      <defs><linearGradient id="colorConsumo" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/><stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/></linearGradient></defs>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                      <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{fontSize: 9, fontWeight: 700, fill: '#94a3b8'}} dy={10} />
                      <YAxis axisLine={false} tickLine={false} tick={{fontSize: 9, fontWeight: 700, fill: '#94a3b8'}} />
                      <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 20px rgba(0,0,0,0.1)', fontSize: '10px' }} />
                      <Area type="monotone" dataKey="consumo" stroke="#3b82f6" strokeWidth={3} fillOpacity={1} fill="url(#colorConsumo)" />
                      <Area type="monotone" dataKey="limite" stroke="#e2e8f0" strokeWidth={2} fill="transparent" strokeDasharray="5 5" />
                  </AreaChart>
              </ResponsiveContainer>
          </div>
      </div>

      {/* Cartões de Justificativa (Visíveis na tela quando Global) */}
      {(!selectedSchoolId || userRole === 'regional_admin') && justificationsList.length > 0 && (
          <div className="space-y-6 print:hidden">
              <div className="flex items-center gap-3 px-6"><ListFilter className="text-blue-600" /><h2 className="text-xl font-black text-slate-800 uppercase tracking-tight">Ocorrências da Rede</h2></div>
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                  {justificationsList.map((log) => (
                      <div key={log.id} className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-xl flex flex-col gap-6 group relative overflow-hidden transition-all hover:border-blue-300">
                          <div className="flex justify-between items-start">
                              <div className="flex items-center gap-4">
                                  <div className="w-12 h-12 bg-amber-50 rounded-2xl flex items-center justify-center text-amber-600"><AlertTriangle size={24} /></div>
                                  <div>
                                      <h4 className="font-black text-slate-800 uppercase text-sm leading-none">{log.school_name}</h4>
                                      <span className="text-[10px] text-slate-400 font-bold mt-1 block">{new Date(log.date + 'T12:00:00').toLocaleDateString()}</span>
                                  </div>
                              </div>
                              <span className="bg-red-50 text-red-600 px-3 py-1 rounded-full font-black text-xs">+{log.consumption_diff.toFixed(2)} m³</span>
                          </div>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              <div className="space-y-1"><label className="text-[9px] font-black text-slate-400 uppercase">Justificativa</label><p className="bg-slate-50 p-4 rounded-2xl text-xs text-slate-600 italic leading-relaxed">"{log.justification}"</p></div>
                              <div className="space-y-1"><label className="text-[9px] font-black text-blue-400 uppercase">Plano de Ação</label><p className="bg-blue-50/30 p-4 rounded-2xl text-xs text-blue-800 leading-relaxed font-medium">{log.action_plan}</p></div>
                          </div>
                          <Building2 className="absolute -bottom-6 -right-6 text-slate-50 opacity-20" size={120} />
                      </div>
                  ))}
              </div>
          </div>
      )}

      {/* Calendário Interativo (Visível na tela quando Escola Selecionada) */}
      {selectedSchoolId && (
          <div className="bg-white p-10 rounded-[3rem] border border-slate-100 shadow-2xl print:hidden">
              <div className="flex items-center justify-between mb-10">
                <div className="flex items-center gap-6">
                    <button onClick={handlePrevMonth} className="p-4 hover:bg-slate-50 rounded-3xl border border-slate-100"><ChevronLeft /></button>
                    <div className="text-center"><h2 className="text-3xl font-black text-slate-800 uppercase tracking-tighter leading-none">{monthName}</h2><span className="text-blue-600 font-bold text-xs">{currentDate.getFullYear()}</span></div>
                    <button onClick={handleNextMonth} className="p-4 hover:bg-slate-50 rounded-3xl border border-slate-100"><ChevronRight /></button>
                </div>
              </div>
              <div className="grid grid-cols-7 gap-6">
                  {['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].map(d => (<div key={d} className="text-center text-[11px] font-black text-slate-400 uppercase tracking-widest">{d}</div>))}
                  {Array.from({ length: firstDayOfMonth }).map((_, i) => <div key={`empty-${i}`}></div>)}
                  {Array.from({ length: daysInMonth }).map((_, i) => renderDay(i + 1))}
              </div>
          </div>
      )}

      {/* -------------------------------------------------------------------------------- */}
      {/* 2. TEMPLATE DE IMPRESSÃO (Oculto na tela, visível apenas no PDF) */}
      {/* -------------------------------------------------------------------------------- */}
      
      <div id="pdf-print-template" style={{ display: 'none', background: 'white', width: '1080px' }}>
        
        {/* Cabeçalho Técnico A4 */}
        <div style={{ borderBottom: '4px solid #2563eb', paddingBottom: '20px', marginBottom: '30px' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <tr>
                    <td style={{ border: 'none' }}>
                        <h1 style={{ margin: 0, fontSize: '24px', fontWeight: 900, color: '#0f172a' }}>RELATÓRIO DE MONITORAMENTO HÍDRICO</h1>
                        <p style={{ margin: 0, fontSize: '12px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Secretaria de Gestão Regional • Auditoria de Recursos</p>
                    </td>
                    <td style={{ border: 'none', textAlign: 'right' }}>
                        <div style={{ background: '#2563eb', color: 'white', padding: '5px 15px', borderRadius: '8px', fontWeight: 900, display: 'inline-block', fontSize: '10px' }}>SGE-GSU v8.0</div>
                        <p style={{ margin: '5px 0 0', fontWeight: 900, fontSize: '14px', color: '#1e293b' }}>{monthName.toUpperCase()} / {currentDate.getFullYear()}</p>
                    </td>
                </tr>
            </table>
        </div>

        {/* Resumo da Unidade */}
        <div style={{ background: '#f8fafc', padding: '15px', borderRadius: '15px', border: '1px solid #e2e8f0', marginBottom: '30px' }}>
            <span style={{ fontSize: '10px', fontWeight: 900, color: '#94a3b8', textTransform: 'uppercase' }}>Unidade Analisada:</span>
            <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 900, color: '#1e293b' }}>{selectedSchoolId ? schools.find(s => s.id === selectedSchoolId)?.name : 'REDE REGIONAL GLOBAL (TODAS AS UNIDADES)'}</h2>
        </div>

        {/* Cards Técnicos em Tabela (Para garantir alinhamento no PDF) */}
        <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: '10px', marginBottom: '30px' }}>
            <tr>
                <td style={{ width: '25%', background: isTotalExceeded ? '#fef2f2' : '#eff6ff', padding: '20px', borderRadius: '20px', border: isTotalExceeded ? '2px solid #ef4444' : '1px solid #bfdbfe' }}>
                    <p style={{ margin: 0, fontSize: '10px', fontWeight: 900, color: '#64748b' }}>CONSUMO TOTAL</p>
                    <h3 style={{ margin: '5px 0 0', fontSize: '20px', fontWeight: 900, color: isTotalExceeded ? '#b91c1c' : '#1e3a8a' }}>{stats.totalConsumption.toFixed(2)} m³</h3>
                </td>
                <td style={{ width: '25%', background: '#f8fafc', padding: '20px', borderRadius: '20px', border: '1px solid #e2e8f0' }}>
                    <p style={{ margin: 0, fontSize: '10px', fontWeight: 900, color: '#64748b' }}>TETO LIMITE</p>
                    <h3 style={{ margin: '5px 0 0', fontSize: '20px', fontWeight: 900, color: '#0f172a' }}>{stats.totalLimit.toFixed(2)} m³</h3>
                </td>
                <td style={{ width: '25%', background: '#f8fafc', padding: '20px', borderRadius: '20px', border: '1px solid #e2e8f0' }}>
                    <p style={{ margin: 0, fontSize: '10px', fontWeight: 900, color: '#64748b' }}>MÉDIA DIÁRIA</p>
                    <h3 style={{ margin: '5px 0 0', fontSize: '20px', fontWeight: 900, color: '#1e3a8a' }}>{stats.avgConsumption.toFixed(2)} m³</h3>
                </td>
                <td style={{ width: '25%', background: stats.exceededDays > 0 ? '#fffbeb' : '#f8fafc', padding: '20px', borderRadius: '20px', border: stats.exceededDays > 0 ? '1px solid #fbbf24' : '1px solid #e2e8f0' }}>
                    <p style={{ margin: 0, fontSize: '10px', fontWeight: 900, color: '#64748b' }}>DIAS COM ALERTA</p>
                    <h3 style={{ margin: '5px 0 0', fontSize: '20px', fontWeight: 900, color: '#92400e' }}>{stats.exceededDays} ocorrências</h3>
                </td>
            </tr>
        </table>

        {/* TABELA DE OCORRÊNCIAS (Apenas no PDF) */}
        {justificationsList.length > 0 && (
            <div>
                <h3 style={{ fontSize: '14px', fontWeight: 900, color: '#1e293b', marginBottom: '15px', textTransform: 'uppercase' }}>Detalhamento de Justificativas e Ações Corretivas</h3>
                <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
                    <thead>
                        <tr style={{ background: '#f1f5f9' }}>
                            <th style={{ width: '18%', padding: '12px', border: '1px solid #cbd5e1', fontSize: '10px', fontWeight: 900, textAlign: 'left' }}>ESCOLA</th>
                            <th style={{ width: '10%', padding: '12px', border: '1px solid #cbd5e1', fontSize: '10px', fontWeight: 900, textAlign: 'center' }}>DATA</th>
                            <th style={{ width: '8%', padding: '12px', border: '1px solid #cbd5e1', fontSize: '10px', fontWeight: 900, textAlign: 'center' }}>EXCESSO</th>
                            <th style={{ width: '32%', padding: '12px', border: '1px solid #cbd5e1', fontSize: '10px', fontWeight: 900, textAlign: 'left' }}>JUSTIFICATIVA DO GESTOR</th>
                            <th style={{ width: '32%', padding: '12px', border: '1px solid #cbd5e1', fontSize: '10px', fontWeight: 900, textAlign: 'left' }}>PLANO DE AÇÃO PLANEJADO</th>
                        </tr>
                    </thead>
                    <tbody>
                        {justificationsList.map((log) => (
                            <tr key={log.id}>
                                <td style={{ padding: '10px', border: '1px solid #cbd5e1', fontSize: '10px', fontWeight: 700, textTransform: 'uppercase' }}>{log.school_name}</td>
                                <td style={{ padding: '10px', border: '1px solid #cbd5e1', fontSize: '10px', textAlign: 'center', color: '#64748b' }}>{new Date(log.date + 'T12:00:00').toLocaleDateString()}</td>
                                <td style={{ padding: '10px', border: '1px solid #cbd5e1', fontSize: '10px', textAlign: 'center', fontWeight: 900, color: '#ef4444' }}>+{log.consumption_diff.toFixed(2)}m³</td>
                                <td style={{ padding: '10px', border: '1px solid #cbd5e1', fontSize: '10px', color: '#334155', fontStyle: 'italic', wordWrap: 'break-word' }}>"{log.justification}"</td>
                                <td style={{ padding: '10px', border: '1px solid #cbd5e1', fontSize: '10px', color: '#1e3a8a', fontWeight: 600, wordWrap: 'break-word' }}>{log.action_plan}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        )}

        <div style={{ marginTop: '40px', paddingTop: '20px', borderTop: '1px solid #e2e8f0', textAlign: 'center' }}>
            <p style={{ fontSize: '9px', fontWeight: 900, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '2px' }}>Documento Emitido em {new Date().toLocaleString('pt-BR')} • Sistema SGE-GSU Intelligence</p>
        </div>
      </div>

      {/* Modal de Registro (Apenas Interativo) */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-md p-4 print:hidden">
          <div className="bg-white rounded-[3rem] w-full max-w-3xl shadow-2xl animate-in zoom-in-95 duration-300 overflow-hidden border border-white">
            <div className="p-8 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
              <div className="flex items-center gap-5">
                <div className="w-14 h-14 bg-blue-600 rounded-[1.5rem] flex items-center justify-center text-white"><Droplets size={28}/></div>
                <div><h2 className="text-2xl font-black text-slate-900 tracking-tighter text-blue-600">Registro Detalhado</h2><p className="text-xs text-slate-400 font-bold uppercase tracking-[0.2em]">{new Date(selectedDateStr + 'T12:00:00').toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' })}</p></div>
              </div>
              <button onClick={() => setIsModalOpen(false)} className="p-4 hover:bg-slate-200 rounded-full transition-all text-slate-400"><X size={24}/></button>
            </div>

            <form onSubmit={handleSave} className="p-8 space-y-10 overflow-y-auto max-h-[70vh] custom-scrollbar">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="p-4 bg-slate-50/50 border border-slate-100 rounded-3xl flex flex-col items-center justify-center text-center opacity-60">
                    <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Leitura Anterior</span>
                    {loadingPrev ? <Loader2 className="animate-spin text-slate-400" size={14} /> : <span className="text-sm font-bold text-slate-500">{prevReadingValue.toLocaleString()} m³</span>}
                </div>
                <div className="flex items-center justify-center text-slate-200"><ArrowRight className="hidden md:block" size={20} /><ArrowDown className="md:hidden" size={20} /></div>
                <div className={`p-4 border rounded-3xl flex flex-col items-center justify-center text-center transition-all ${isLimitExceeded ? 'bg-amber-50 border-amber-200' : 'bg-slate-50 border-slate-100'} opacity-80`}>
                    <span className={`text-[9px] font-black uppercase tracking-widest mb-1 ${isLimitExceeded ? 'text-amber-500' : 'text-slate-400'}`}>Consumo Calculado</span>
                    <span className={`text-lg font-black ${isLimitExceeded ? 'text-amber-600' : 'text-slate-600'}`}>{currentConsumption.toFixed(2)} m³</span>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                <div className="space-y-6 p-6 bg-blue-50/30 rounded-[2rem] border-2 border-blue-100/50 relative">
                  <div className="absolute -top-3 left-6 px-3 py-1 bg-blue-600 text-white text-[10px] font-black rounded-full shadow-lg">PASSO 1: POPULAÇÃO</div>
                  <label className="text-[11px] font-black text-blue-600 uppercase tracking-widest flex items-center gap-2 mb-2"><Users size={14} /> Quem estava na unidade?</label>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                       <span className="text-[10px] font-black text-slate-500 uppercase ml-1">Qtde Alunos</span>
                       <input type="number" disabled={userRole === 'regional_admin'} placeholder="0" className="w-full p-4 bg-white border-2 border-blue-200 rounded-2xl font-black text-slate-800 focus:border-blue-600 outline-none transition-all shadow-sm" value={formData.student_count || ''} onChange={(e) => setFormData({...formData, student_count: Number(e.target.value)})} />
                    </div>
                    <div className="space-y-2">
                       <span className="text-[10px] font-black text-slate-500 uppercase ml-1">Funcionários</span>
                       <input type="number" disabled={userRole === 'regional_admin'} placeholder="0" className="w-full p-4 bg-white border-2 border-blue-200 rounded-2xl font-black text-slate-800 focus:border-blue-600 outline-none transition-all shadow-sm" value={formData.staff_count || ''} onChange={(e) => setFormData({...formData, staff_count: Number(e.target.value)})} />
                    </div>
                  </div>
                </div>

                <div className={`space-y-6 p-6 rounded-[2rem] border-2 transition-all relative ${isHydrometerBlocked ? 'bg-slate-50 border-slate-100 opacity-50 grayscale' : 'bg-emerald-50/30 border-emerald-200 shadow-xl shadow-emerald-100/50'}`}>
                  {!isHydrometerBlocked && <div className="absolute -top-3 left-6 px-3 py-1 bg-emerald-600 text-white text-[10px] font-black rounded-full shadow-lg animate-bounce">PASSO 2: HIDRÔMETRO</div>}
                  <label className={`text-[11px] font-black uppercase tracking-widest flex items-center gap-2 transition-colors ${isHydrometerBlocked ? 'text-slate-300' : 'text-emerald-600'}`}><Droplets size={14} /> Leitura Atual do Relógio</label>
                  <div className="relative group">
                     <input type="number" required disabled={isHydrometerBlocked} className={`w-full p-6 font-mono text-4xl text-center outline-none transition-all placeholder:opacity-20 rounded-[1.5rem] shadow-inner ${isHydrometerBlocked ? 'bg-slate-200 border-slate-200 text-slate-400' : 'bg-slate-900 border-4 border-emerald-500 text-white ring-8 ring-emerald-500/10'}`} placeholder="00000" value={formData.reading_m3 || ''} onChange={(e) => setFormData({...formData, reading_m3: Number(e.target.value)})} />
                  </div>
                </div>
              </div>

              {isLimitExceeded && (
                 <div className="p-8 bg-amber-50 border-2 border-amber-300 rounded-[2.5rem] space-y-6 animate-in slide-in-from-top-4 shadow-xl shadow-amber-100">
                    <div className="flex items-center gap-3 text-amber-700"><AlertCircle size={32} className="shrink-0" /><div><h4 className="text-lg font-black uppercase tracking-tight leading-none">ALERTA DE EXCESSO</h4><p className="text-xs font-bold opacity-70 mt-1 uppercase">O consumo excedeu o limite operacional diário.</p></div></div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="space-y-2"><label className="text-[10px] font-black text-amber-600 uppercase tracking-widest ml-1">Qual o motivo?</label><textarea required disabled={userRole === 'regional_admin'} className="w-full p-4 border-2 border-amber-200 rounded-[1.5rem] bg-white outline-none focus:border-amber-600 text-sm font-medium transition-all" rows={3} placeholder="Descreva o motivo..." value={formData.justification} onChange={(e) => setFormData({...formData, justification: e.target.value})} /></div>
                        <div className="space-y-2"><label className="text-[10px] font-black text-amber-600 uppercase tracking-widest ml-1">O que será feito?</label><textarea required disabled={userRole === 'regional_admin'} className="w-full p-4 border-2 border-amber-200 rounded-[1.5rem] bg-white outline-none focus:border-amber-600 text-sm font-medium transition-all" rows={3} placeholder="Medidas tomadas..." value={formData.action_plan} onChange={(e) => setFormData({...formData, action_plan: e.target.value})} /></div>
                    </div>
                 </div>
              )}

              <div className="pt-6 flex justify-end gap-4 border-t border-slate-100 sticky bottom-0 bg-white">
                <button type="button" onClick={() => setIsModalOpen(false)} className="px-8 py-4 text-slate-500 font-black hover:text-slate-800 transition-all uppercase tracking-widest text-[11px]">Cancelar</button>
                {userRole !== 'regional_admin' && (
                    <button type="submit" disabled={saveLoading || loadingPrev || isHydrometerBlocked} className="px-14 py-4 bg-blue-600 text-white rounded-[1.5rem] font-black shadow-2xl shadow-blue-200 hover:bg-blue-700 flex items-center gap-3 active:scale-95 disabled:opacity-50 transition-all uppercase tracking-widest text-[11px]">
                        {saveLoading ? <Loader2 className="animate-spin" size={18}/> : <><Save size={18}/> Salvar Registro</>}
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


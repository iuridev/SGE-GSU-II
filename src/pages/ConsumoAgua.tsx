import { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { 
  Droplets, ChevronLeft, ChevronRight, 
  Save, X, AlertTriangle, CheckCircle,  
  Search, Building2, Users, Loader2,
  AlertCircle, ArrowRight, Activity, ShieldCheck,
  TrendingUp, Waves,
  CalendarDays, FileDown, History, CalendarOff, Trash2,
  Gauge, Plus, Settings, ClipboardCopy, ClipboardCheck, Clock
} from 'lucide-react';
import { 
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, 
  ResponsiveContainer
} from 'recharts';

// Tipagem baseada no banco de dados
interface WaterLog {
  id?: string;
  school_id: string;
  meter_id?: string | null;
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

// Hidrômetro cadastrado para uma escola
interface SchoolMeter {
  id: string;
  school_id: string;
  name: string;
  description?: string;
  is_active: boolean;
  created_at?: string;
}

const MONTHS = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"
];

const YEARS = Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - 2 + i);

const LIMITE_DIARIO_POR_PESSOA = 0.009;

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
  const [supervisorSchoolIds, setSupervisorSchoolIds] = useState<string[]>([]);
  
  const [logs, setLogs] = useState<Record<string, WaterLog>>({}); 
  const [suspensionLogs, setSuspensionLogs] = useState<Record<string, WaterLog>>({}); // sempre meter_id=null
  const [allMonthLogs, setAllMonthLogs] = useState<WaterLog[]>([]); 
  const [waterTruckCount, setWaterTruckCount] = useState(0);
  const [exporting, setExporting] = useState(false);

  // --- Hidrômetros ---
  const [schoolMeters, setSchoolMeters] = useState<SchoolMeter[]>([]);
  const [selectedMeterId, setSelectedMeterId] = useState<string | null>(null);
  // Modal de gestão de hidrômetros (só admin/dirigente)
  const [isMeterModalOpen, setIsMeterModalOpen] = useState(false);
  const [meterModalSchoolId, setMeterModalSchoolId] = useState<string>('');
  const [metersList, setMetersList] = useState<SchoolMeter[]>([]);
  const [newMeterName, setNewMeterName] = useState('');
  const [newMeterDesc, setNewMeterDesc] = useState('');
  const [savingMeter, setSavingMeter] = useState(false);
  
  // States do Modal Individual
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedDateStr, setSelectedDateStr] = useState('');
  const [saveLoading, setSaveLoading] = useState(false);
  const [prevReadingValue, setPrevReadingValue] = useState<number>(0);
  const [loadingPrev, setLoadingPrev] = useState(false);
  
  // States do Modal de Suspensão (Global)
  const [isSuspensionModalOpen, setIsSuspensionModalOpen] = useState(false);
  const [suspensionReason, setSuspensionReason] = useState('Feriado');
  const [customSuspensionReason, setCustomSuspensionReason] = useState('');
  const [existingSuspension, setExistingSuspension] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    reading_m3: 0,
    student_count: 0,
    staff_count: 0,
    justification: '',
    action_plan: ''
  });

  // --- Constantes de Calendário e Papéis ---
  const monthName = currentDate.toLocaleString('pt-BR', { month: 'long' });
  const firstDayOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1).getDay();
  const daysInMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0).getDate();
  
  // Variáveis de Controle de Acesso
  const isManagerRole = ['regional_admin', 'dirigente', 'supervisor'].includes(userRole);
  const canRegisterSuspension = ['regional_admin', 'dirigente'].includes(userRole); 
  const canManageMeters = ['regional_admin', 'dirigente'].includes(userRole);

  // Escola selecionada tem múltiplos hidrômetros?
  const hasMultipleMeters = schoolMeters.length > 1;

  useEffect(() => {
    fetchInitialData();
  }, []);

  // Recarrega sempre que o mês, a escola ou os acessos de supervisor mudarem
  useEffect(() => {
    if (!userRole) return;
    fetchLogs();
    fetchWaterTruckStats();
  }, [selectedSchoolId, currentDate, userRole, supervisorSchoolIds]);

  // Quando a escola muda, busca os hidrômetros dela
  useEffect(() => {
    if (selectedSchoolId) {
      fetchSchoolMeters(selectedSchoolId);
    } else {
      setSchoolMeters([]);
      setSelectedMeterId(null);
    }
  }, [selectedSchoolId]);

  // Quando a escola muda e temos apenas um hidrômetro, não precisamos de seleção
  // Quando há múltiplos, a seleção fica em null (usuário deve escolher ou veremos todos)
  useEffect(() => {
    if (schoolMeters.length === 1) {
      // Uma escola com exatamente 1 hidrômetro cadastrado: selecionado automaticamente
      setSelectedMeterId(schoolMeters[0].id);
    } else if (schoolMeters.length === 0) {
      // Escola sem hidrômetros cadastrados (fluxo legado): meter_id = null
      setSelectedMeterId(null);
    } else {
      // Múltiplos: começa no primeiro, usuário pode trocar
      setSelectedMeterId(schoolMeters[0].id);
    }
  }, [schoolMeters]);

  async function fetchSchoolMeters(schoolId: string) {
    try {
      const { data, error } = await (supabase as any)
        .from('school_meters')
        .select('*')
        .eq('school_id', schoolId)
        .eq('is_active', true)
        .order('created_at', { ascending: true });

      if (!error) setSchoolMeters(data || []);
    } catch (err) {
      console.error('Erro ao buscar hidrômetros:', err);
    }
  }

  async function fetchInitialData() {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      let currentRole = '';
      let currentSupSchools: string[] = [];

      if (user) {
        setUserId(user.id);
        const { data: profile } = await (supabase as any).from('profiles').select('role, school_id, supervisor_schools').eq('id', user.id).single();
        currentRole = profile?.role || '';
        currentSupSchools = profile?.supervisor_schools || [];

        setUserRole(currentRole);
        
        if (currentRole === 'school_manager') {
          setSelectedSchoolId(profile.school_id);
        }
        if (currentRole === 'supervisor') {
          setSupervisorSchoolIds(currentSupSchools);
        }
      }

      const { data: schoolsData } = await (supabase as any).from('schools').select('id, name').order('name');
      
      if (currentRole === 'supervisor') {
        setSchools((schoolsData || []).filter((s: any) => currentSupSchools.includes(s.id)));
      } else {
        setSchools(schoolsData || []);
      }
    } catch (error) {
      console.error('Erro ao carregar dados iniciais:', error);
    }
  }

  async function fetchLogs() {
    const firstDay = formatDateToYMD(new Date(currentDate.getFullYear(), currentDate.getMonth(), 1));
    const lastDay = formatDateToYMD(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0));

    try {
      let query = (supabase as any).from('consumo_agua').select('*');
      
      if (selectedSchoolId) {
        query = query.eq('school_id', selectedSchoolId);
      } else if (userRole === 'supervisor') {
        if (supervisorSchoolIds.length > 0) {
          query = query.in('school_id', supervisorSchoolIds);
        } else {
          setAllMonthLogs([]);
          setLogs({});
          return;
        }
      }
      
      const { data, error } = await query
        .gte('date', firstDay)
        .lte('date', lastDay)
        .order('date', { ascending: true });

      if (error) throw error;

      const rawLogs = (data || []) as WaterLog[];
      setAllMonthLogs(rawLogs);

      // Mapa de suspensões: sempre baseado em meter_id=null, independente do hidrômetro selecionado.
      // Isso garante que os bloqueios de feriado/fim de semana funcionem para escolas
      // com múltiplos hidrômetros, já que suspensões são gravadas com meter_id=null.
      const suspMap: Record<string, WaterLog> = {};
      rawLogs.forEach((log: WaterLog) => {
        if (log.justification && log.justification.startsWith('Suspensão de Expediente:')) {
          if (!suspMap[log.date]) suspMap[log.date] = log;
        }
      });
      setSuspensionLogs(suspMap);

      if (selectedSchoolId) {
        const logsMap: Record<string, WaterLog> = {};
        
        if (hasMultipleMeters && selectedMeterId) {
          // Hidrômetro específico selecionado: mostra registros desse meter
          // MAS também inclui suspensões (meter_id=null) para o calendário mostrar o bloqueio
          rawLogs
            .filter(log =>
              log.meter_id === selectedMeterId ||
              (log.justification && log.justification.startsWith('Suspensão de Expediente:'))
            )
            .forEach((log: WaterLog) => {
              // Suspensão tem prioridade: não sobrescreve se já há uma suspensão nessa data
              if (!logsMap[log.date] || !(logsMap[log.date].justification?.startsWith('Suspensão de Expediente:'))) {
                logsMap[log.date] = log;
              }
              if (log.justification?.startsWith('Suspensão de Expediente:')) {
                logsMap[log.date] = log;
              }
            });
        } else {
          rawLogs.forEach((log: WaterLog) => {
            logsMap[log.date] = log;
          });
        }
        setLogs(logsMap);
      } else {
        // Visão global: só suspensões no mapa
        setLogs(suspMap);
      }
    } catch (error) {
      console.error('Erro ao buscar consumos:', error);
    }
  }

  // Rebusca logs quando o meter selecionado mudar
  useEffect(() => {
    if (selectedSchoolId && schoolMeters.length > 0) {
      fetchLogs();
    }
  }, [selectedMeterId]);

  async function fetchWaterTruckStats() {
    const firstDayYear = new Date(currentDate.getFullYear(), 0, 1).toISOString();
    
    try {
      let query = (supabase as any)
        .from('occurrences')
        .select('*', { count: 'exact', head: true })
        .eq('type', 'WATER_TRUCK')
        .gte('created_at', firstDayYear);

      if (selectedSchoolId) {
        query = query.eq('school_id', selectedSchoolId);
      } else if (userRole === 'supervisor') {
        if (supervisorSchoolIds.length > 0) {
           query = query.in('school_id', supervisorSchoolIds);
        } else {
           setWaterTruckCount(0);
           return;
        }
      }

      const { count, error } = await query;
      if (!error) setWaterTruckCount(count || 0);
    } catch (err) {
      console.error("Erro ao buscar estatísticas de pipa:", err);
    }
  }

  // 1. Criamos uma lista filtrada que respeita o hidrômetro selecionado na tela
  const filteredMonthLogs = useMemo(() => {
    if (selectedSchoolId && selectedMeterId) {
      // Retorna os logs do hidrômetro atual + suspensões (que têm meter_id nulo)
      return allMonthLogs.filter(log => 
        log.meter_id === selectedMeterId || 
        (log.justification && log.justification.startsWith('Suspensão de Expediente:'))
      );
    }
    return allMonthLogs;
  }, [allMonthLogs, selectedSchoolId, selectedMeterId]);

  // 2. Atualizamos os STATS para usar a lista filtrada
  const stats = useMemo(() => {
    const totalConsumption = filteredMonthLogs.reduce((acc, curr) => acc + (curr.consumption_diff || 0), 0);
    const totalLimit = filteredMonthLogs.reduce((acc, curr) => acc + (curr.student_count + curr.staff_count) * LIMITE_DIARIO_POR_PESSOA, 0);
    const totalEntries = filteredMonthLogs.length;
    
    return {
      totalConsumption,
      totalLimit,
      avgConsumption: totalEntries > 0 ? totalConsumption / totalEntries : 0,
      exceededDays: filteredMonthLogs.filter(log => log.limit_exceeded).length,
    };
  }, [filteredMonthLogs]);

  const isTotalExceeded = stats.totalConsumption > stats.totalLimit && stats.totalLimit > 0;

  // 3. Atualizamos o GRÁFICO para usar a lista filtrada
  const chartData = useMemo(() => {
    const dailyMap: Record<string, { date: string, consumo: number, limite: number }> = {};
    filteredMonthLogs.forEach(log => {
      if (!dailyMap[log.date]) {
        dailyMap[log.date] = { 
          date: new Date(log.date + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }), 
          consumo: 0, 
          limite: 0 
        };
      }
      dailyMap[log.date].consumo += (log.consumption_diff || 0);
      dailyMap[log.date].limite += ((log.student_count + log.staff_count) * LIMITE_DIARIO_POR_PESSOA);
    });
    
    if (Object.values(dailyMap).length === 0) {
        return [{ date: 'Sem dados', consumo: 0, limite: 0 }];
    }
    return Object.values(dailyMap);
  }, [filteredMonthLogs]);

  // 4. Atualizamos a lista de JUSTIFICATIVAS para usar a lista filtrada
  const justificationsList = useMemo(() => {
    return filteredMonthLogs
      .filter(log => log.limit_exceeded && log.justification)
      .map(log => ({
        ...log,
        school_name: schools.find(s => s.id === log.school_id)?.name || 'Escola não identificada'
      }))
      .sort((a, b) => a.school_name.localeCompare(b.school_name));
  }, [filteredMonthLogs, schools]);
  

  // ============================================================
  // ESCOLAS COM REGISTROS ATRASADOS (só para regional_admin)
  // ============================================================
  const [copiedLate, setCopiedLate] = useState(false);

  const lateSchools = useMemo(() => {
    if (userRole !== 'regional_admin' || selectedSchoolId) return [];

    const todayStr = formatDateToYMD(new Date());

    // Monta o conjunto de datas úteis (não-futuras, não-hoje) do mês
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const totalDays = new Date(year, month + 1, 0).getDate();
    

    // Dias que contam como "deveriam ter registro"
    const pastDays: string[] = [];
    for (let d = 1; d <= totalDays; d++) {
      const dateStr = formatDateToYMD(new Date(year, month, d));
      // Apenas dias passados e que não são hoje
      if (dateStr < todayStr) {
        pastDays.push(dateStr);
      }
    }

    if (pastDays.length === 0) return [];

    // Para cada escola, verifica quantos dias passados não têm nenhum registro (excluindo suspensões)
    const schoolLateMap: Record<string, { name: string; missingDays: string[] }> = {};

    schools.forEach(school => {
      const schoolLogs = allMonthLogs.filter(l => l.school_id === school.id);
      const registeredDates = new Set(
        schoolLogs
          .filter(l => !(l.justification && l.justification.startsWith('Suspensão de Expediente:')))
          .map(l => l.date)
      );
      const suspensionDates = new Set(
        schoolLogs
          .filter(l => l.justification && l.justification.startsWith('Suspensão de Expediente:'))
          .map(l => l.date)
      );

      const missing = pastDays.filter(d => !registeredDates.has(d) && !suspensionDates.has(d));
      if (missing.length > 0) {
        schoolLateMap[school.id] = { name: school.name, missingDays: missing };
      }
    });

    return Object.values(schoolLateMap).sort((a, b) => b.missingDays.length - a.missingDays.length);
  }, [allMonthLogs, schools, userRole, selectedSchoolId, currentDate]);

  function handleCopyLateList() {
    const monthLabel = `${MONTHS[currentDate.getMonth()]}/${currentDate.getFullYear()}`;
    const lines = lateSchools.map(
      s => `• ${s.name} — ${s.missingDays.length} dia(s) sem registro`
    );
    const text = `Escolas com registros atrasados em ${monthLabel}:\n\n${lines.join('\n')}`;
    navigator.clipboard.writeText(text).then(() => {
      setCopiedLate(true);
      setTimeout(() => setCopiedLate(false), 2500);
    });
  }

  // ============================================================
  // GESTÃO DE HIDRÔMETROS (Modal de Administração)
  // ============================================================
  async function openMeterModal(schoolId: string) {
    setMeterModalSchoolId(schoolId);
    setNewMeterName('');
    setNewMeterDesc('');
    setIsMeterModalOpen(true);
    
    const { data } = await (supabase as any)
      .from('school_meters')
      .select('*')
      .eq('school_id', schoolId)
      .order('created_at', { ascending: true });
    setMetersList(data || []);
  }

  async function handleAddMeter() {
    if (!newMeterName.trim()) return;
    setSavingMeter(true);
    try {
      const { error } = await (supabase as any)
        .from('school_meters')
        .insert([{
          school_id: meterModalSchoolId,
          name: newMeterName.trim(),
          description: newMeterDesc.trim() || null,
          is_active: true,
          created_by: userId
        }]);
      
      if (error) throw error;
      
      setNewMeterName('');
      setNewMeterDesc('');
      // Recarrega a lista
      const { data } = await (supabase as any)
        .from('school_meters')
        .select('*')
        .eq('school_id', meterModalSchoolId)
        .order('created_at', { ascending: true });
      setMetersList(data || []);
      
      // Se é a escola selecionada, atualiza os hidrômetros locais
      if (meterModalSchoolId === selectedSchoolId) {
        fetchSchoolMeters(meterModalSchoolId);
      }
    } catch (err: any) {
      alert(`Erro ao adicionar hidrômetro: ${err.message}`);
    } finally {
      setSavingMeter(false);
    }
  }

  async function handleToggleMeter(meter: SchoolMeter) {
    const { error } = await (supabase as any)
      .from('school_meters')
      .update({ is_active: !meter.is_active })
      .eq('id', meter.id);
    
    if (!error) {
      setMetersList(prev => prev.map(m => m.id === meter.id ? { ...m, is_active: !m.is_active } : m));
      if (meterModalSchoolId === selectedSchoolId) {
        fetchSchoolMeters(meterModalSchoolId);
      }
    }
  }

  // ============================================================
  // EXPORTAR PDF
  // ============================================================
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

      const element = document.getElementById('pdf-print-template');
      if (!element) throw new Error("Template de impressão não encontrado.");

      const pdfNameScope = selectedSchoolId 
        ? schools.find(s => s.id === selectedSchoolId)?.name 
        : (userRole === 'supervisor' ? 'Supervisao' : 'Rede_Global');

      const opt = {
        margin: [5, 5, 5, 5],
        filename: `Relatorio_Executivo_Consumo_${pdfNameScope}_${monthName}.pdf`,
        image: { type: 'jpeg', quality: 1 },
        html2canvas: { 
          scale: 2, 
          useCORS: true, 
          logging: false,
          letterRendering: true,
          width: 1120 
        },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'landscape' },
        pagebreak: { mode: ['css', 'legacy'] }
      };

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
    setCurrentDate(new Date(currentDate.getFullYear(), monthIdx, 1));
  };

  const handleYearChange = (year: number) => {
    setCurrentDate(new Date(year, currentDate.getMonth(), 1));
  };

  const handlePrevMonth = () => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
  const handleNextMonth = () => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));

  // ============================================================
  // ABRIR MODAL DE REGISTRO (atualizado para suportar múltiplos hidrômetros)
  // ============================================================
  const openRegisterModal = async (day: number) => {
    const date = new Date(currentDate.getFullYear(), currentDate.getMonth(), day);
    const dateStr = formatDateToYMD(date);
    const todayStr = formatDateToYMD(new Date());
    
    const isGlobalView = canRegisterSuspension && !selectedSchoolId;

    if (isGlobalView) {
      setSelectedDateStr(dateStr);
      const existingLog = logs[dateStr];
      if (existingLog && existingLog.justification?.startsWith('Suspensão de Expediente:')) {
         setExistingSuspension(existingLog.justification.replace('Suspensão de Expediente:', '').trim());
      } else {
         setExistingSuspension(null);
      }
      setSuspensionReason('Feriado');
      setCustomSuspensionReason('');
      setIsSuspensionModalOpen(true);
      return;
    }

    // Bloqueia escola (school_manager) se o dia tiver suspensão cadastrada
    // Usa suspensionLogs (sempre meter_id=null) para não depender do hidrômetro selecionado
    if (!canRegisterSuspension && suspensionLogs[dateStr]?.justification?.startsWith('Suspensão de Expediente:')) {
      alert("Neste dia não é possível cadastrar o consumo de água devido à suspensão de expediente.");
      return;
    }

    if (!canRegisterSuspension && dateStr > todayStr) return;
    
    if (!selectedSchoolId) return; 

    setSelectedDateStr(dateStr);
    
    setLoadingPrev(true);

    // Busca a leitura anterior mais recente antes da data selecionada.
    // Estratégia:
    // 1. Tenta primeiro com o meter_id específico (novo fluxo com múltiplos hidrômetros)
    // 2. Se não encontrar, tenta com meter_id = NULL (dados legados migrados)
    // 3. Ignora registros de suspensão (reading_m3 = 0 quando suspension)
    //    usando .gt('reading_m3', 0) — suspensões sempre têm reading_m3 copiado
    //    da leitura anterior, mas consumption_diff = 0. Para garantir que não é
    //    uma suspensão, também ignoramos registros com student_count = 0 AND staff_count = 0.
    // A query usa range para não depender do limite padrão do Supabase (1000 linhas).
    const fetchPrevReading = async (): Promise<number> => {
      const baseQuery = () =>
        (supabase as any)
          .from('consumo_agua')
          .select('reading_m3, student_count, staff_count')
          .eq('school_id', selectedSchoolId)
          .lt('date', dateStr)
          .gt('reading_m3', 0)
          .or('student_count.gt.0,staff_count.gt.0') // exclui suspensões puras
          .order('date', { ascending: false })
          .range(0, 0); // equivale a LIMIT 1, mas explícito e sem depender do default

      // Tentativa 1: com meter_id específico
      if (selectedMeterId) {
        const { data: d1 } = await baseQuery().eq('meter_id', selectedMeterId);
        if (d1 && d1.length > 0) return d1[0].reading_m3;
      }

      // Tentativa 2: meter_id NULL (histórico legado da escola)
      const { data: d2 } = await baseQuery().is('meter_id', null);
      if (d2 && d2.length > 0) return d2[0].reading_m3;

      // Tentativa 3: qualquer registro da escola (sem filtro de meter), caso
      // dados legados tenham sido migrados de forma inesperada
      if (selectedMeterId) {
        const { data: d3 } = await baseQuery();
        if (d3 && d3.length > 0) return d3[0].reading_m3;
      }

      return 0;
    };

    const prevReading = await fetchPrevReading();
    setPrevReadingValue(prevReading);
    setLoadingPrev(false);

    // Busca o registro existente para a data, escola e hidrômetro
    let existingLog: WaterLog | undefined;
    if (selectedMeterId) {
      existingLog = allMonthLogs.find(l => l.date === dateStr && l.meter_id === selectedMeterId);
    } else {
      existingLog = allMonthLogs.find(l => l.date === dateStr && !l.meter_id);
    }

    setFormData(existingLog ? {
      reading_m3: existingLog.reading_m3,
      student_count: existingLog.student_count,
      staff_count: existingLog.staff_count,
      justification: existingLog.justification || '',
      action_plan: existingLog.action_plan || ''
    } : {
      reading_m3: 0, student_count: 0, staff_count: 0, justification: '', action_plan: ''
    });
    setIsModalOpen(true);
  };

  const currentConsumption = Math.max(0, formData.reading_m3 - prevReadingValue);
  const currentLimit = (formData.student_count + formData.staff_count) * LIMITE_DIARIO_POR_PESSOA;
  const isLimitExceeded = currentConsumption > currentLimit && formData.reading_m3 > 0;
  const isHydrometerBlocked = !isManagerRole && (formData.student_count <= 0 || formData.staff_count <= 0);

  // ============================================================
  // SALVAR REGISTRO (atualizado para incluir meter_id)
  // ============================================================
  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaveLoading(true);
    try {
      if (isLimitExceeded && (!formData.justification || !formData.action_plan)) {
          throw new Error("Preencha justificativa e ação para excessos.");
      }

      const finalReading = isHydrometerBlocked ? prevReadingValue : formData.reading_m3;
      const finalConsumption = isHydrometerBlocked ? 0 : currentConsumption;

      const meterId = selectedMeterId || null;

      const logData: any = {
        school_id: selectedSchoolId,
        date: selectedDateStr,
        meter_id: meterId,
        reading_m3: finalReading,
        consumption_diff: finalConsumption,
        student_count: formData.student_count,
        staff_count: formData.staff_count,
        limit_exceeded: isLimitExceeded,
        justification: isLimitExceeded ? formData.justification : null,
        action_plan: isLimitExceeded ? formData.action_plan : null,
        created_by: userId
      };

      // Evita onConflict com índice parcial (não suportado pelo Supabase JS).
      // Faz select primeiro para checar existência, depois insert ou update explícito.
      let existingQuery = (supabase as any)
        .from('consumo_agua')
        .select('id')
        .eq('school_id', selectedSchoolId)
        .eq('date', selectedDateStr);
      if (meterId) {
        existingQuery = existingQuery.eq('meter_id', meterId);
      } else {
        existingQuery = existingQuery.is('meter_id', null);
      }
      const { data: existingRows } = await existingQuery.range(0, 0);
      const existingId = existingRows?.[0]?.id;

      let saveError: any = null;
      if (existingId) {
        const { error } = await (supabase as any)
          .from('consumo_agua')
          .update(logData)
          .eq('id', existingId);
        saveError = error;
      } else {
        const { error } = await (supabase as any)
          .from('consumo_agua')
          .insert([logData]);
        saveError = error;
      }
      if (saveError) throw saveError;

      // Cascata em registros futuros do mesmo hidrômetro
      let futureQuery = (supabase as any)
        .from('consumo_agua')
        .select('*')
        .eq('school_id', selectedSchoolId)
        .gt('date', selectedDateStr)
        .order('date', { ascending: true });
      if (meterId) {
        futureQuery = futureQuery.eq('meter_id', meterId);
      } else {
        futureQuery = futureQuery.is('meter_id', null);
      }

      const { data: futureLogs, error: fetchError } = await futureQuery;

      if (!fetchError && futureLogs && futureLogs.length > 0) {
        const logsToUpdate: any[] = [];
        let cascadeReading = finalReading;

        for (const futureLog of futureLogs) {
          const isFutureSuspension = futureLog.student_count === 0 && futureLog.staff_count === 0;

          if (isFutureSuspension) {
            logsToUpdate.push({ id: futureLog.id, reading_m3: cascadeReading, consumption_diff: 0, limit_exceeded: false });
          } else {
            const newDiff = Math.max(0, futureLog.reading_m3 - cascadeReading);
            const newLimit = (futureLog.student_count + futureLog.staff_count) * LIMITE_DIARIO_POR_PESSOA;
            const newExceeded = newDiff > newLimit && futureLog.reading_m3 > 0;
            logsToUpdate.push({
              id: futureLog.id,
              consumption_diff: newDiff,
              limit_exceeded: newExceeded,
              justification: newExceeded ? futureLog.justification : null,
              action_plan: newExceeded ? futureLog.action_plan : null
            });
            break;
          }
        }

        // Atualiza cada log da cascata pelo id — sem onConflict
        for (const lu of logsToUpdate) {
          const { id, ...fields } = lu;
          const { error: ce } = await (supabase as any)
            .from('consumo_agua')
            .update(fields)
            .eq('id', id);
          if (ce) console.error('Erro na cascata:', ce);
        }
      }

      setIsModalOpen(false);
      fetchLogs();
    } catch (error: any) {
      alert(`Erro ao salvar: ${error.message}`);
    } finally {
      setSaveLoading(false);
    }
  }

  // ============================================================
  // EXCLUIR REGISTRO
  // ============================================================
  async function handleDelete() {
    if (!window.confirm("Tem certeza que deseja excluir este registro hídrico?")) return;
    
    setSaveLoading(true);
    try {
      let deleteQuery = (supabase as any)
        .from('consumo_agua')
        .delete()
        .eq('school_id', selectedSchoolId)
        .eq('date', selectedDateStr);
      
      if (selectedMeterId) {
        deleteQuery = deleteQuery.eq('meter_id', selectedMeterId);
      } else {
        deleteQuery = deleteQuery.is('meter_id', null);
      }

      const { error } = await deleteQuery;
      if (error) throw error;
      
      setIsModalOpen(false);
      fetchLogs();
    } catch (error: any) {
      alert(`Erro ao excluir: ${error.message}`);
    } finally {
      setSaveLoading(false);
    }
  }

  // ============================================================
  // SALVAR SUSPENSÃO GLOBAL
  // ============================================================
  async function handleSuspensionSave() {
    setSaveLoading(true);
    try {
      if (!schools || schools.length === 0) throw new Error("Nenhuma escola encontrada no seu escopo.");

      const bulkDataPromises = schools.map(async (school: any) => {
        // Busca última leitura real (não suspensão) para copiar no registro de suspensão.
        // Usa range(0,0) para evitar dependência do limite padrão do Supabase.
        const { data: prevData } = await (supabase as any)
          .from('consumo_agua')
          .select('reading_m3')
          .eq('school_id', school.id)
          .lt('date', selectedDateStr)
          .gt('reading_m3', 0)
          .or('student_count.gt.0,staff_count.gt.0')
          .order('date', { ascending: false })
          .range(0, 0);

        const lastReading = prevData?.[0]?.reading_m3 || 0;
        const finalReason = suspensionReason === 'Outro' ? customSuspensionReason : suspensionReason;
        const justificationText = `Suspensão de Expediente: ${finalReason}`;

        return {
          school_id: school.id,
          meter_id: null, // suspensão global não precisa de meter_id
          date: selectedDateStr,
          reading_m3: lastReading, 
          consumption_diff: 0,
          student_count: 0,
          staff_count: 0,
          limit_exceeded: false,
          justification: justificationText,
          action_plan: 'N/A',
          created_by: userId
        };
      });

      const bulkData = await Promise.all(bulkDataPromises);

      const { error: upsertError } = await (supabase as any)
        .from('consumo_agua')
        .upsert(bulkData, { onConflict: 'school_id,date' });

      if (upsertError) throw upsertError;

      alert(`Suspensão registrada com sucesso para ${bulkData.length} escolas.`);
      setIsSuspensionModalOpen(false);
      fetchLogs(); 

    } catch (error: any) {
      console.error(error);
      alert(`Erro ao registrar suspensão: ${error.message}`);
    } finally {
      setSaveLoading(false);
    }
  }

  // ============================================================
  // RENDER DO CALENDÁRIO
  // ============================================================
  const renderDay = (day: number) => {
    const date = new Date(currentDate.getFullYear(), currentDate.getMonth(), day);
    const dateStr = formatDateToYMD(date);
    const todayStr = formatDateToYMD(new Date());
    const isFuture = dateStr > todayStr;

    // Suspensão sempre vem do mapa dedicado (meter_id=null), nunca do mapa filtrado por hidrômetro
    const suspensionLog = suspensionLogs[dateStr];
    const isSuspension = !!suspensionLog;

    // Para dados normais (leitura do dia), usa o mapa filtrado pelo hidrômetro selecionado
    const log = isSuspension ? suspensionLog : logs[dateStr];
    
    let stateClass = "bg-slate-50 text-slate-300"; 
    let showAttention = false;

    if (log) {
        if (isSuspension) {
          stateClass = "bg-purple-50 text-purple-700 border-purple-200";
        } else {
          stateClass = "bg-emerald-50 text-emerald-700 border-emerald-200"; 
          if (log.limit_exceeded) {
            showAttention = true;
            stateClass = "bg-amber-50 text-amber-700 border-amber-300 ring-1 ring-amber-400 ring-inset";
          }
        }
    } else {
        if (!isFuture && dateStr < todayStr) {
             if (canRegisterSuspension && !selectedSchoolId) {
                 stateClass = "bg-slate-50 text-slate-400 hover:bg-purple-50 hover:border-purple-200 hover:text-purple-600 border-slate-100";
             } else if (!selectedSchoolId) {
                 stateClass = "bg-slate-50 text-slate-300 border-slate-100";
             } else {
                 stateClass = "bg-red-50 text-red-700 border-red-200"; 
             }
        } else if (isFuture) {
             if (canRegisterSuspension && !selectedSchoolId) {
                 stateClass = "bg-slate-50 text-slate-300 hover:bg-purple-50 hover:border-purple-200 hover:text-purple-600 border-slate-100";
             }
        }
    }

    const isClickable = !!selectedSchoolId || canRegisterSuspension;

    return (
      <div 
        key={day} 
        onClick={() => isClickable ? openRegisterModal(day) : null} 
        className={`h-28 md:h-32 p-3 border rounded-3xl transition-all flex flex-col justify-between group relative overflow-hidden ${stateClass} ${isClickable ? 'cursor-pointer hover:shadow-md' : 'cursor-default'}`}
      >
        <div className="flex justify-between items-start z-10">
          <span className="text-sm font-black">{day}</span>
          {showAttention && <div className="p-1 bg-amber-500 text-white rounded-full animate-bounce shadow-lg"><AlertTriangle size={14} /></div>}
          {log && !log.limit_exceeded && !isSuspension && <CheckCircle size={14} className="text-emerald-500" />}
          {isSuspension && <CalendarOff size={14} className="text-purple-500" />}
        </div>
        
        {log ? (
          <div className="z-10">
              {isSuspension ? (
                <div className="text-[10px] font-black uppercase text-purple-600 leading-tight">
                  {log.justification?.replace('Suspensão de Expediente:', '')}
                </div>
              ) : (
                <>
                  <div className="text-[14px] font-black text-slate-900 leading-none">{log.reading_m3.toLocaleString()}</div>
                  <div className="text-[9px] font-bold uppercase text-slate-400 mt-1">m³ Registrado</div>
                  <div className={`mt-2 text-[10px] font-black px-2 py-0.5 rounded-full inline-block ${log.limit_exceeded ? 'bg-amber-500 text-white' : 'bg-emerald-200 text-emerald-800'}`}>
                    {log.consumption_diff.toFixed(2)} m³
                  </div>
                </>
              )}
          </div>
        ) : !isFuture && dateStr < todayStr && selectedSchoolId ? (
          <div className="text-[10px] font-black uppercase text-red-500 z-10 italic text-center">Atrasado</div>
        ) : null}

        {log && <Droplets className="absolute -bottom-2 -right-2 text-current opacity-5" size={60} />}
      </div>
    );
  };

  // ============================================================
  // RENDER PRINCIPAL
  // ============================================================
  return (
    <div className="space-y-6 pb-20">
      
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
            {isManagerRole && (
                <button 
                    onClick={handleExportPDF}
                    disabled={exporting}
                    className="bg-slate-900 text-white px-6 py-3 rounded-2xl font-black flex items-center justify-center gap-2 shadow-xl hover:bg-slate-800 transition-all active:scale-95 disabled:opacity-50"
                >
                    {exporting ? <Loader2 className="animate-spin" size={18}/> : <FileDown size={18} />}
                    {exporting ? 'GERANDO PDF...' : 'EXPORTAR RELATÓRIO'}
                </button>
            )}

            {isManagerRole && (
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
                            <option value="">{userRole === 'supervisor' ? 'VISÃO GERAL (MINHAS UNIDADES)' : 'REDE REGIONAL GLOBAL (TODAS)'}</option>
                            {schools.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                        </select>
                    </div>
                </div>
            )}
        </div>
      </div>

      {/* ===== SELETOR DE HIDRÔMETRO (aparece quando escola tem múltiplos) ===== */}
      {selectedSchoolId && hasMultipleMeters && (
        <div className="bg-white border-2 border-blue-100 rounded-[2rem] p-4 flex flex-wrap items-center gap-3 shadow-sm print:hidden">
          <div className="flex items-center gap-2 text-blue-600">
            <Gauge size={18} />
            <span className="text-xs font-black uppercase tracking-widest">Hidrômetro:</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {schoolMeters.map(meter => (
              <button
                key={meter.id}
                onClick={() => setSelectedMeterId(meter.id)}
                className={`px-4 py-2 rounded-xl text-xs font-black transition-all ${
                  selectedMeterId === meter.id 
                    ? 'bg-blue-600 text-white shadow-lg shadow-blue-200' 
                    : 'bg-slate-100 text-slate-600 hover:bg-blue-50 hover:text-blue-700'
                }`}
              >
                {meter.name}
              </button>
            ))}
          </div>
          {canManageMeters && (
            <button
              onClick={() => openMeterModal(selectedSchoolId)}
              className="ml-auto p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-all"
              title="Gerenciar hidrômetros desta escola"
            >
              <Settings size={16} />
            </button>
          )}
        </div>
      )}

      {/* Botão para admin gerenciar hidrômetros quando escola selecionada tem apenas 1 ou nenhum */}
      {selectedSchoolId && !hasMultipleMeters && canManageMeters && (
        <div className="flex justify-end print:hidden">
          <button
            onClick={() => openMeterModal(selectedSchoolId)}
            className="flex items-center gap-2 px-4 py-2 text-xs font-black text-slate-400 hover:text-blue-600 hover:bg-blue-50 border border-slate-200 hover:border-blue-200 rounded-xl transition-all"
          >
            <Gauge size={14} />
            Gerenciar Hidrômetros
          </button>
        </div>
      )}

      {/* STATS */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 print:hidden">
          <div className={`p-6 rounded-[2.5rem] border-2 transition-all flex items-center gap-4 shadow-xl ${isTotalExceeded ? 'bg-red-50 border-red-200 text-red-700' : 'bg-white border-slate-100'}`}>
              <div className={`p-4 rounded-2xl ${isTotalExceeded ? 'bg-red-600 text-white' : 'bg-blue-600 text-white'}`}><Waves size={20} /></div>
              <div><p className="text-[10px] font-black uppercase tracking-widest opacity-60">Total Consumido</p><h3 className="text-xl font-black">{stats.totalConsumption.toFixed(2)} m³</h3></div>
          </div>
          <div className="bg-white p-6 rounded-[2.5rem] border-2 border-slate-100 shadow-xl flex items-center gap-4">
              <div className="p-4 bg-slate-900 text-white rounded-2xl"><ShieldCheck size={20} /></div>
              <div><p className="text-[10px] font-black uppercase tracking-widest opacity-40">Teto Operacional</p><h3 className="text-xl font-black text-slate-800">{stats.totalLimit.toFixed(2)} m³</h3></div>
          </div>
          <div className="bg-white p-6 rounded-[2.5rem] border-2 border-slate-100 shadow-xl flex items-center gap-4">
              <div className="p-4 bg-emerald-600 text-white rounded-2xl"><TrendingUp size={20} /></div>
              <div><p className="text-[10px] font-black uppercase tracking-widest opacity-40">Média Diária</p><h3 className="text-xl font-black text-slate-800">{stats.avgConsumption.toFixed(2)} m³</h3></div>
          </div>
          <div className="bg-white p-6 rounded-[2.5rem] border-2 border-slate-100 shadow-xl flex items-center gap-4">
              <div className="p-4 bg-amber-500 text-white rounded-2xl"><AlertTriangle size={20} /></div>
              <div><p className="text-[10px] font-black uppercase tracking-widest opacity-40">Dias Excedidos</p><h3 className="text-xl font-black text-slate-800">{stats.exceededDays}</h3></div>
          </div>
          <div className="bg-white p-6 rounded-[2.5rem] border-2 border-slate-100 shadow-xl flex items-center gap-4">
              <div className="p-4 bg-cyan-600 text-white rounded-2xl"><Activity size={20} /></div>
              <div><p className="text-[10px] font-black uppercase tracking-widest opacity-40">Pipas no Ano</p><h3 className="text-xl font-black text-slate-800">{waterTruckCount}</h3></div>
          </div>
      </div>

      {/* GRÁFICO */}
      <div className="bg-white p-6 rounded-[2.5rem] border-2 border-slate-100 shadow-xl print:hidden">
        <div className="flex items-center gap-3 mb-6">
          <div className="p-3 bg-blue-100 rounded-2xl text-blue-600"><TrendingUp size={18} /></div>
          <div>
            <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest">Consumo × Limite</h3>
            <p className="text-xs text-slate-400 font-medium">Comparativo diário do mês</p>
          </div>
        </div>
        <ResponsiveContainer width="100%" height={200}>
          <AreaChart data={chartData} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
            <defs>
              <linearGradient id="colorConsumo" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#2563eb" stopOpacity={0.2}/><stop offset="95%" stopColor="#2563eb" stopOpacity={0}/></linearGradient>
              <linearGradient id="colorLimite" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#10b981" stopOpacity={0.15}/><stop offset="95%" stopColor="#10b981" stopOpacity={0}/></linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
            <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#94a3b8', fontWeight: 'bold' }} />
            <YAxis tick={{ fontSize: 10, fill: '#94a3b8', fontWeight: 'bold' }} />
            <Tooltip contentStyle={{ borderRadius: '1rem', border: 'none', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.1)', fontFamily: 'monospace', fontWeight: 'bold' }} />
            <Area type="monotone" dataKey="consumo" stroke="#2563eb" strokeWidth={3} fillOpacity={1} fill="url(#colorConsumo)" name="Consumo (m³)" dot={false} />
            <Area type="monotone" dataKey="limite" stroke="#10b981" strokeWidth={2} strokeDasharray="5 5" fillOpacity={1} fill="url(#colorLimite)" name="Limite (m³)" dot={false} />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* CALENDÁRIO */}
      <div className="bg-white p-6 rounded-[2.5rem] border-2 border-slate-100 shadow-xl">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-slate-100 rounded-2xl text-slate-600"><CalendarDays size={18} /></div>
            <div>
              <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest capitalize">{monthName} {currentDate.getFullYear()}</h3>
              {selectedSchoolId && (
                <p className="text-xs text-blue-600 font-black mt-0.5 truncate max-w-xs">
                  {schools.find(s => s.id === selectedSchoolId)?.name}
                </p>
              )}
              {selectedSchoolId && hasMultipleMeters && selectedMeterId && (
                <p className="text-[10px] text-slate-400 font-bold flex items-center gap-1 mt-0.5">
                  <Gauge size={10} />
                  {schoolMeters.find(m => m.id === selectedMeterId)?.name}
                </p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={handlePrevMonth} className="p-2 hover:bg-slate-100 rounded-xl transition-all"><ChevronLeft size={20} className="text-slate-600"/></button>
            <button onClick={handleNextMonth} className="p-2 hover:bg-slate-100 rounded-xl transition-all"><ChevronRight size={20} className="text-slate-600"/></button>
          </div>
        </div>
        
        <div className="grid grid-cols-7 gap-2 mb-3">
          {['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].map(d => (
            <div key={d} className="text-center text-[10px] font-black text-slate-400 uppercase py-2">{d}</div>
          ))}
        </div>
        
        <div className="grid grid-cols-7 gap-2">
          {Array.from({ length: firstDayOfMonth }).map((_, i) => <div key={`empty-${i}`} />)}
          {Array.from({ length: daysInMonth }, (_, i) => renderDay(i + 1))}
        </div>
      </div>

      {/* JUSTIFICATIVAS */}
      {justificationsList.length > 0 && (
        <div className="bg-white rounded-[2.5rem] border-2 border-slate-100 shadow-xl overflow-hidden">
          <div className="p-6 border-b border-slate-100 flex items-center gap-3">
            <div className="p-3 bg-amber-100 rounded-2xl text-amber-600"><History size={18} /></div>
            <div>
              <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest">Registros com Excedente</h3>
              <p className="text-xs text-slate-400 font-medium">Dias que ultrapassaram o limite operacional</p>
            </div>
          </div>
          <div className="p-6 space-y-4">
            {justificationsList.map((log, idx) => (
              <div key={log.id || idx} className="p-5 bg-amber-50 border border-amber-200 rounded-[1.5rem] space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-amber-500 text-white rounded-xl"><Building2 size={14}/></div>
                    <div>
                      <p className="text-xs font-black text-slate-800 uppercase">{log.school_name}</p>
                      <p className="text-[10px] text-slate-400 font-medium">{new Date(log.date + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' })}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-black text-amber-700">{log.consumption_diff.toFixed(2)} m³</p>
                    <p className="text-[10px] text-amber-500 font-bold uppercase">Excedido</p>
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="bg-white rounded-xl p-3 border border-amber-100">
                    <p className="text-[9px] font-black text-amber-600 uppercase tracking-widest mb-1">Justificativa</p>
                    <p className="text-xs text-slate-700 font-medium">{log.justification}</p>
                  </div>
                  <div className="bg-white rounded-xl p-3 border border-amber-100">
                    <p className="text-[9px] font-black text-amber-600 uppercase tracking-widest mb-1">Plano de Ação</p>
                    <p className="text-xs text-slate-700 font-medium">{log.action_plan}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ESCOLAS COM ATRASO (só regional_admin na visão geral) */}
      {userRole === 'regional_admin' && !selectedSchoolId && lateSchools.length > 0 && (
        <div className="bg-white rounded-[2.5rem] border-2 border-red-100 shadow-xl overflow-hidden print:hidden">
          <div className="p-6 border-b border-red-100 flex items-center justify-between bg-red-50/40">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-red-500 rounded-2xl text-white"><Clock size={18} /></div>
              <div>
                <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest">Escolas com Registros Atrasados</h3>
                <p className="text-xs text-slate-400 font-medium">
                  {lateSchools.length} escola{lateSchools.length > 1 ? 's' : ''} com dias sem lançamento em {MONTHS[currentDate.getMonth()]}/{currentDate.getFullYear()}
                </p>
              </div>
            </div>
            <button
              onClick={handleCopyLateList}
              className={`flex items-center gap-2 px-5 py-3 rounded-2xl text-[11px] font-black uppercase tracking-widest transition-all active:scale-95 shadow-md ${
                copiedLate
                  ? 'bg-emerald-500 text-white shadow-emerald-200'
                  : 'bg-slate-900 text-white hover:bg-slate-700 shadow-slate-200'
              }`}
            >
              {copiedLate ? <><ClipboardCheck size={15} /> Copiado!</> : <><ClipboardCopy size={15} /> Copiar Lista</>}
            </button>
          </div>

          <div className="divide-y divide-red-50">
            {lateSchools.map((school, idx) => {
              const lastMissing = school.missingDays[school.missingDays.length - 1];
              const daysSinceLastMissing = Math.floor(
                (new Date().getTime() - new Date(lastMissing + 'T12:00:00').getTime()) / (1000 * 60 * 60 * 24)
              );
              const severity = school.missingDays.length >= 5 ? 'high' : school.missingDays.length >= 3 ? 'mid' : 'low';
              const severityColors = {
                high: 'bg-red-100 text-red-700 border-red-200',
                mid: 'bg-orange-100 text-orange-700 border-orange-200',
                low: 'bg-amber-100 text-amber-700 border-amber-200',
              };

              return (
                <div key={school.name} className={`flex items-center justify-between px-6 py-4 hover:bg-red-50/30 transition-all ${idx % 2 === 0 ? '' : 'bg-slate-50/30'}`}>
                  <div className="flex items-center gap-4 min-w-0">
                    <div className="w-7 h-7 rounded-full bg-red-100 text-red-500 flex items-center justify-center text-[10px] font-black shrink-0">
                      {idx + 1}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-black text-slate-800 truncate">{school.name}</p>
                      <p className="text-[10px] text-slate-400 font-medium mt-0.5">
                        Último dia sem registro: {new Date(lastMissing + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}
                        {daysSinceLastMissing > 0 && <span className="ml-1 text-red-400">({daysSinceLastMissing}d atrás)</span>}
                      </p>
                    </div>
                  </div>
                  <div className={`shrink-0 ml-4 px-4 py-1.5 rounded-xl border text-[11px] font-black ${severityColors[severity]}`}>
                    {school.missingDays.length} dia{school.missingDays.length > 1 ? 's' : ''}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Texto pronto para copiar (pré-visualização) */}
          <div className="p-6 border-t border-red-100 bg-slate-50">
            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2">Pré-visualização do texto copiado</p>
            <pre className="text-[11px] text-slate-600 font-mono leading-relaxed whitespace-pre-wrap bg-white border border-slate-200 rounded-2xl p-4 select-all">
{`Escolas com registros atrasados em ${MONTHS[currentDate.getMonth()]}/${currentDate.getFullYear()}:\n\n${lateSchools.map(s => `• ${s.name} — ${s.missingDays.length} dia(s) sem registro`).join('\n')}`}
            </pre>
          </div>
        </div>
      )}

      {/* Mensagem quando não há atrasos */}
      {userRole === 'regional_admin' && !selectedSchoolId && lateSchools.length === 0 && schools.length > 0 && (
        <div className="bg-emerald-50 border-2 border-emerald-100 rounded-[2.5rem] p-6 flex items-center gap-4 print:hidden">
          <div className="p-3 bg-emerald-500 text-white rounded-2xl shrink-0"><CheckCircle size={20} /></div>
          <div>
            <p className="text-sm font-black text-emerald-800 uppercase tracking-widest">Todas as escolas em dia!</p>
            <p className="text-xs text-emerald-600 font-medium mt-0.5">Nenhuma escola com registros atrasados em {MONTHS[currentDate.getMonth()]}/{currentDate.getFullYear()}.</p>
          </div>
        </div>
      )}

      {/* ===== TEMPLATE DE IMPRESSÃO PDF (oculto, gerado pelo html2pdf) ===== */}
      <div id="pdf-print-template" style={{ display: 'none', background: 'white', width: '1080px' }}>
        <div style={{ borderBottom: '4px solid #2563eb', paddingBottom: '20px', marginBottom: '30px' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}><tbody><tr>
            <td style={{ border: 'none' }}>
              <h1 style={{ margin: 0, fontSize: '24px', fontWeight: 900, color: '#0f172a' }}>RELATÓRIO DE MONITORAMENTO HÍDRICO</h1>
              <p style={{ margin: 0, fontSize: '12px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Secretaria de Gestão Regional • Auditoria de Recursos</p>
            </td>
            <td style={{ border: 'none', textAlign: 'right' }}>
              <div style={{ background: '#2563eb', color: 'white', padding: '5px 15px', borderRadius: '8px', fontWeight: 900, display: 'inline-block', fontSize: '10px' }}>SGE-GSU</div>
              <p style={{ margin: '5px 0 0', fontWeight: 900, fontSize: '14px', color: '#1e293b' }}>{monthName.toUpperCase()} / {currentDate.getFullYear()}</p>
            </td>
          </tr></tbody></table>
        </div>

        <div style={{ background: '#f8fafc', padding: '15px', borderRadius: '15px', border: '1px solid #e2e8f0', marginBottom: '30px' }}>
          <span style={{ fontSize: '10px', fontWeight: 900, color: '#94a3b8', textTransform: 'uppercase' }}>Unidade Analisada:</span>
          <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 900, color: '#1e293b' }}>
            {selectedSchoolId
              ? schools.find(s => s.id === selectedSchoolId)?.name
              : (userRole === 'supervisor' ? 'VISÃO DE SUPERVISÃO (UNIDADES SELECIONADAS)' : 'REDE REGIONAL GLOBAL (TODAS AS UNIDADES)')}
          </h2>
          {selectedSchoolId && hasMultipleMeters && selectedMeterId && (
            <p style={{ margin: '4px 0 0', fontSize: '11px', fontWeight: 700, color: '#2563eb' }}>
              {schoolMeters.find(m => m.id === selectedMeterId)?.name}
            </p>
          )}
        </div>

        <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: '10px', marginBottom: '30px' }}><tbody><tr>
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
        </tr></tbody></table>

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
          <p style={{ fontSize: '9px', fontWeight: 900, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '2px' }}>
            Documento Emitido em {new Date().toLocaleString('pt-BR')} • Sistema SGE-GSU
          </p>
        </div>
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-blue-900/40 backdrop-blur-md p-0 md:p-4 print:hidden">
          <div className="bg-white rounded-t-[3rem] md:rounded-[3rem] w-full max-w-2xl shadow-2xl animate-in slide-in-from-bottom-8 md:zoom-in-95 duration-300 overflow-hidden border border-white max-h-[95vh] overflow-y-auto">
            
            {/* Header do Modal */}
            <div className="p-6 md:p-8 border-b border-blue-100 flex justify-between items-start bg-blue-50/50 sticky top-0 z-10">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-blue-600 rounded-[1.2rem] flex items-center justify-center text-white shadow-lg shadow-blue-200"><Droplets size={24}/></div>
                <div>
                  <h2 className="text-xl font-black text-slate-900 tracking-tighter">Registro Hídrico</h2>
                  <p className="text-sm text-blue-600 font-bold">
                    {new Date(selectedDateStr + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })}
                  </p>
                  {/* Mostra qual hidrômetro está sendo registrado */}
                  {selectedMeterId && schoolMeters.length > 0 && (
                    <div className="flex items-center gap-1 mt-1">
                      <Gauge size={11} className="text-slate-400" />
                      <p className="text-[11px] text-slate-500 font-bold">
                        {schoolMeters.find(m => m.id === selectedMeterId)?.name || 'Hidrômetro'}
                      </p>
                    </div>
                  )}
                </div>
              </div>
              <button onClick={() => setIsModalOpen(false)} className="p-3 hover:bg-blue-100 rounded-full transition-all text-blue-400"><X size={20}/></button>
            </div>

            {/* Seletor de hidrômetro dentro do modal (se múltiplos) */}
            {hasMultipleMeters && (
              <div className="px-6 md:px-8 pt-6 pb-0">
                <div className="p-4 bg-blue-50 border-2 border-blue-100 rounded-[1.5rem]">
                  <p className="text-[10px] font-black text-blue-600 uppercase tracking-widest mb-3 flex items-center gap-2">
                    <Gauge size={12} /> Registrando para
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {schoolMeters.map(meter => (
                      <button
                        key={meter.id}
                        type="button"
                        onClick={async () => {
                          setSelectedMeterId(meter.id);
                          // Recarrega leitura anterior para o novo hidrômetro
                          // Mesma estratégia robusta: tenta meter específico, fallback para legado
                          setLoadingPrev(true);
                          const baseQ = () =>
                            (supabase as any)
                              .from('consumo_agua')
                              .select('reading_m3, student_count, staff_count')
                              .eq('school_id', selectedSchoolId)
                              .lt('date', selectedDateStr)
                              .gt('reading_m3', 0)
                              .or('student_count.gt.0,staff_count.gt.0')
                              .order('date', { ascending: false })
                              .range(0, 0);

                          let prevReading = 0;
                          const { data: d1 } = await baseQ().eq('meter_id', meter.id);
                          if (d1 && d1.length > 0) {
                            prevReading = d1[0].reading_m3;
                          } else {
                            const { data: d2 } = await baseQ().is('meter_id', null);
                            if (d2 && d2.length > 0) prevReading = d2[0].reading_m3;
                          }
                          setPrevReadingValue(prevReading);
                          setLoadingPrev(false);

                          // Preenche com dado existente para esse hidrômetro/data
                          const existingLog = allMonthLogs.find(l => l.date === selectedDateStr && l.meter_id === meter.id);
                          setFormData(existingLog ? {
                            reading_m3: existingLog.reading_m3,
                            student_count: existingLog.student_count,
                            staff_count: existingLog.staff_count,
                            justification: existingLog.justification || '',
                            action_plan: existingLog.action_plan || ''
                          } : {
                            reading_m3: 0, student_count: 0, staff_count: 0, justification: '', action_plan: ''
                          });
                        }}
                        className={`px-5 py-2.5 rounded-xl text-xs font-black transition-all flex items-center gap-2 ${
                          selectedMeterId === meter.id 
                            ? 'bg-blue-600 text-white shadow-lg shadow-blue-200' 
                            : 'bg-white text-slate-600 border-2 border-slate-200 hover:border-blue-300'
                        }`}
                      >
                        <Gauge size={12} />
                        {meter.name}
                        {selectedMeterId === meter.id && <CheckCircle size={12} />}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            <form onSubmit={handleSave} className="p-6 md:p-8 space-y-6">
              
              {/* Leitura anterior */}
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-[1.5rem] flex items-center gap-4">
                <div className="p-3 bg-slate-200 text-slate-600 rounded-xl"><History size={16}/></div>
                <div>
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Leitura Anterior</p>
                  {loadingPrev ? (
                    <Loader2 className="animate-spin text-slate-400" size={16} />
                  ) : (
                    <p className="text-lg font-black text-slate-700 font-mono">{prevReadingValue.toLocaleString()} <span className="text-xs font-bold text-slate-400">m³</span></p>
                  )}
                </div>
                {!loadingPrev && formData.reading_m3 > 0 && (
                  <>
                    <ArrowRight size={16} className="text-slate-300" />
                    <div>
                      <p className="text-[10px] font-black text-emerald-600 uppercase tracking-widest">Consumo Calculado</p>
                      <p className="text-lg font-black text-emerald-700 font-mono">{currentConsumption.toFixed(2)} <span className="text-xs font-bold">m³</span></p>
                    </div>
                  </>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* PASSO 1: Pessoas */}
                <div className="space-y-6 p-6 rounded-[2rem] bg-blue-50/30 border-2 border-blue-200 shadow-xl shadow-blue-100/50 relative">
                  <div className="absolute -top-3 left-6 px-3 py-1 bg-blue-600 text-white text-[10px] font-black rounded-full shadow-lg">PASSO 1: PESSOAS</div>
                  <label className="text-[11px] font-black uppercase tracking-widest flex items-center gap-2 text-blue-600"><Users size={14} /> Informe a quantidade</label>
                  <div className="space-y-2">
                      <span className="text-[10px] font-black text-slate-500 uppercase ml-1">Alunos</span>
                      <input type="number" placeholder="0" className="w-full p-4 bg-white border-2 border-blue-200 rounded-2xl font-black text-slate-800 focus:border-blue-600 outline-none transition-all shadow-sm" value={formData.student_count || ''} onChange={(e) => setFormData({...formData, student_count: Number(e.target.value)})} />
                  </div>
                  <div className="space-y-2">
                      <span className="text-[10px] font-black text-slate-500 uppercase ml-1">Funcionários</span>
                      <input type="number" placeholder="0" className="w-full p-4 bg-white border-2 border-blue-200 rounded-2xl font-black text-slate-800 focus:border-blue-600 outline-none transition-all shadow-sm" value={formData.staff_count || ''} onChange={(e) => setFormData({...formData, staff_count: Number(e.target.value)})} />
                  </div>
                </div>

                {/* PASSO 2: Hidrômetro */}
                <div className={`space-y-6 p-6 rounded-[2rem] border-2 transition-all relative ${isHydrometerBlocked ? 'bg-slate-50 border-slate-100 opacity-50 grayscale' : 'bg-emerald-50/30 border-emerald-200 shadow-xl shadow-emerald-100/50'}`}>
                  {!isHydrometerBlocked && (
                    <div className="absolute -top-3 left-6 px-3 py-1 bg-emerald-600 text-white text-[10px] font-black rounded-full shadow-lg animate-bounce">
                      PASSO 2: HIDRÔMETRO
                    </div>
                  )}
                  <label className={`text-[11px] font-black uppercase tracking-widest flex items-center gap-2 transition-colors ${isHydrometerBlocked ? 'text-slate-300' : 'text-emerald-600'}`}>
                    <Droplets size={14} /> Leitura Atual do Relógio
                  </label>
                  <div className="relative group">
                      <input type="number" required disabled={isHydrometerBlocked} className={`w-full p-6 font-mono text-4xl text-center outline-none transition-all placeholder:opacity-20 rounded-[1.5rem] shadow-inner ${isHydrometerBlocked ? 'bg-slate-200 border-slate-200 text-slate-400' : 'bg-slate-900 border-4 border-emerald-500 text-white ring-8 ring-emerald-500/10'}`} placeholder="00000" value={formData.reading_m3 || ''} onChange={(e) => setFormData({...formData, reading_m3: Number(e.target.value)})} />
                  </div>
                </div>
              </div>

              {isLimitExceeded && (
                  <div className="p-8 bg-amber-50 border-2 border-amber-300 rounded-[2.5rem] space-y-6 animate-in slide-in-from-top-4 shadow-xl shadow-amber-100">
                    <div className="flex items-center gap-3 text-amber-700"><AlertCircle size={32} className="shrink-0" /><div><h4 className="text-lg font-black uppercase tracking-tight leading-none">ALERTA DE EXCESSO</h4><p className="text-xs font-bold opacity-70 mt-1 uppercase">O consumo excedeu o limite operacional diário.</p></div></div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="space-y-2"><label className="text-[10px] font-black text-amber-600 uppercase tracking-widest ml-1">Qual o motivo?</label><textarea required className="w-full p-4 border-2 border-amber-200 rounded-[1.5rem] bg-white outline-none focus:border-amber-600 text-sm font-medium transition-all" rows={3} placeholder="Descreva o motivo..." value={formData.justification} onChange={(e) => setFormData({...formData, justification: e.target.value})} /></div>
                        <div className="space-y-2"><label className="text-[10px] font-black text-amber-600 uppercase tracking-widest ml-1">O que será feito?</label><textarea required className="w-full p-4 border-2 border-amber-200 rounded-[1.5rem] bg-white outline-none focus:border-amber-600 text-sm font-medium transition-all" rows={3} placeholder="Medidas tomadas..." value={formData.action_plan} onChange={(e) => setFormData({...formData, action_plan: e.target.value})} /></div>
                    </div>
                  </div>
              )}

              <div className="pt-6 flex items-center justify-between border-t border-slate-100 sticky bottom-0 bg-white">
                <div>
                  {isManagerRole && (() => {
                    const existingForMeter = selectedMeterId
                      ? allMonthLogs.find(l => l.date === selectedDateStr && l.meter_id === selectedMeterId)
                      : allMonthLogs.find(l => l.date === selectedDateStr && !l.meter_id);
                    return existingForMeter ? (
                      <button 
                        type="button" 
                        onClick={handleDelete} 
                        disabled={saveLoading}
                        className="px-6 py-4 text-red-500 font-black hover:bg-red-50 hover:text-red-700 rounded-2xl transition-all flex items-center gap-2 uppercase tracking-widest text-[11px]"
                      >
                        <Trash2 size={16} /> Excluir
                      </button>
                    ) : null;
                  })()}
                </div>
                <div className="flex items-center gap-4">
                  <button type="button" onClick={() => setIsModalOpen(false)} className="px-8 py-4 text-slate-500 font-black hover:text-slate-800 transition-all uppercase tracking-widest text-[11px]">Cancelar</button>
                  <button type="submit" disabled={saveLoading || loadingPrev || isHydrometerBlocked} className="px-14 py-4 bg-blue-600 text-white rounded-[1.5rem] font-black shadow-2xl shadow-blue-200 hover:bg-blue-700 flex items-center gap-3 active:scale-95 disabled:opacity-50 transition-all uppercase tracking-widest text-[11px]">
                      {saveLoading ? <Loader2 className="animate-spin" size={18}/> : <><Save size={18}/> Salvar Registro</>}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ===================================================================
          MODAL DE SUSPENSÃO DE EXPEDIENTE (Global)
      ==================================================================== */}
      {isSuspensionModalOpen && (
         <div className="fixed inset-0 z-50 flex items-center justify-center bg-purple-900/40 backdrop-blur-md p-4 print:hidden">
             <div className="bg-white rounded-[3rem] w-full max-w-md shadow-2xl animate-in zoom-in-95 duration-300 overflow-hidden border border-white">
                <div className="p-8 border-b border-purple-100 flex justify-between items-center bg-purple-50/50">
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 bg-purple-600 rounded-[1.2rem] flex items-center justify-center text-white"><CalendarOff size={24}/></div>
                        <div><h2 className="text-xl font-black text-slate-900 tracking-tighter text-purple-600">Suspensão de Expediente</h2></div>
                    </div>
                    <button onClick={() => setIsSuspensionModalOpen(false)} className="p-3 hover:bg-purple-100 rounded-full transition-all text-purple-400"><X size={20}/></button>
                </div>
                
                <div className="p-8 space-y-6">
                    {existingSuspension ? (
                       <div className="p-6 bg-red-50 rounded-3xl border-2 border-red-100 flex flex-col items-center text-center gap-3 animate-pulse">
                          <div className="p-2 bg-red-100 text-red-600 rounded-full"><AlertTriangle size={20} /></div>
                          <div>
                             <h4 className="text-sm font-black text-red-700 uppercase">Atenção!</h4>
                             <p className="text-xs text-red-600 mt-1 font-medium">Já existe um evento cadastrado para este dia:</p>
                             <div className="mt-2 bg-white px-4 py-2 rounded-xl text-xs font-black text-red-800 shadow-sm border border-red-100">
                                {existingSuspension}
                             </div>
                          </div>
                          <p className="text-[10px] text-red-400 mt-2 italic">Cadastrar novamente irá sobrescrever para todas as suas escolas.</p>
                       </div>
                    ) : (
                       <div className="p-4 bg-purple-50 rounded-2xl border border-purple-100">
                          <p className="text-xs text-purple-800 font-medium leading-relaxed">
                             Você está registrando uma suspensão para o dia <strong className="font-black">{new Date(selectedDateStr + 'T12:00:00').toLocaleDateString()}</strong>. 
                             Isso criará registros com <strong>consumo zero</strong> para <strong>TODAS AS SUAS ESCOLAS</strong>, baseando-se na leitura do dia anterior.
                          </p>
                       </div>
                    )}

                    <div className="space-y-3">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Motivo da Suspensão</label>
                        <select 
                           className="w-full p-4 bg-white border-2 border-slate-200 rounded-2xl font-bold text-slate-700 focus:border-purple-500 outline-none"
                           value={suspensionReason}
                           onChange={(e) => setSuspensionReason(e.target.value)}
                        >
                            <option value="Feriado">Feriado Nacional / Municipal</option>
                            <option value="Ponto Facultativo">Ponto Facultativo</option>
                            <option value="Fim de Semana">Fim de Semana</option>
                            <option value="Recesso Escolar">Recesso Escolar</option>
                            <option value="Outro">Outro Motivo</option>
                        </select>
                    </div>

                    {suspensionReason === 'Outro' && (
                        <div className="space-y-3">
                             <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Descreva o motivo</label>
                             <input 
                               type="text" 
                               className="w-full p-4 bg-white border-2 border-slate-200 rounded-2xl font-bold text-slate-700 focus:border-purple-500 outline-none"
                               value={customSuspensionReason}
                               onChange={(e) => setCustomSuspensionReason(e.target.value)}
                               placeholder="Ex: Dedetização Geral"
                             />
                        </div>
                    )}

                    <button 
                        onClick={handleSuspensionSave}
                        disabled={saveLoading || (suspensionReason === 'Outro' && !customSuspensionReason)}
                        className={`w-full py-4 text-white rounded-[1.5rem] font-black shadow-xl active:scale-95 disabled:opacity-50 transition-all uppercase tracking-widest text-[11px] flex items-center justify-center gap-2 ${existingSuspension ? 'bg-red-600 shadow-red-200 hover:bg-red-700' : 'bg-purple-600 shadow-purple-200 hover:bg-purple-700'}`}
                    >
                        {saveLoading ? <Loader2 className="animate-spin" size={18}/> : <><Save size={18}/> {existingSuspension ? 'Sobrescrever Suspensão' : 'Confirmar Suspensão'}</>}
                    </button>
                </div>
             </div>
         </div>
      )}

      {/* ===================================================================
          MODAL DE GESTÃO DE HIDRÔMETROS (Admin/Dirigente)
      ==================================================================== */}
      {isMeterModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-md p-4 print:hidden">
          <div className="bg-white rounded-[3rem] w-full max-w-lg shadow-2xl animate-in zoom-in-95 duration-300 overflow-hidden border border-white max-h-[90vh] flex flex-col">
            
            <div className="p-8 border-b border-slate-100 flex justify-between items-center bg-slate-50/50 shrink-0">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-slate-800 rounded-[1.2rem] flex items-center justify-center text-white"><Gauge size={24}/></div>
                <div>
                  <h2 className="text-xl font-black text-slate-900 tracking-tighter">Hidrômetros</h2>
                  <p className="text-xs text-slate-400 font-medium">
                    {schools.find(s => s.id === meterModalSchoolId)?.name || 'Escola'}
                  </p>
                </div>
              </div>
              <button onClick={() => setIsMeterModalOpen(false)} className="p-3 hover:bg-slate-100 rounded-full transition-all text-slate-400"><X size={20}/></button>
            </div>

            <div className="p-8 overflow-y-auto space-y-6 flex-1">
              
              {/* Lista de hidrômetros existentes */}
              <div className="space-y-3">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Hidrômetros Cadastrados</p>
                {metersList.length === 0 ? (
                  <div className="p-6 bg-slate-50 rounded-2xl text-center">
                    <Gauge size={32} className="text-slate-300 mx-auto mb-2" />
                    <p className="text-xs text-slate-400 font-medium">Nenhum hidrômetro cadastrado.</p>
                    <p className="text-[10px] text-slate-300 mt-1">Esta escola usa o fluxo padrão (1 hidrômetro implícito).</p>
                  </div>
                ) : (
                  metersList.map(meter => (
                    <div key={meter.id} className={`flex items-center justify-between p-4 rounded-2xl border-2 transition-all ${meter.is_active ? 'bg-white border-slate-200' : 'bg-slate-50 border-slate-100 opacity-60'}`}>
                      <div className="flex items-center gap-3">
                        <div className={`p-2 rounded-xl ${meter.is_active ? 'bg-blue-100 text-blue-600' : 'bg-slate-200 text-slate-400'}`}>
                          <Gauge size={16} />
                        </div>
                        <div>
                          <p className="text-sm font-black text-slate-800">{meter.name}</p>
                          {meter.description && <p className="text-[10px] text-slate-400 font-medium">{meter.description}</p>}
                        </div>
                      </div>
                      <button
                        onClick={() => handleToggleMeter(meter)}
                        className={`px-4 py-2 rounded-xl text-[10px] font-black transition-all ${
                          meter.is_active 
                            ? 'bg-red-50 text-red-500 hover:bg-red-100' 
                            : 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100'
                        }`}
                      >
                        {meter.is_active ? 'Desativar' : 'Ativar'}
                      </button>
                    </div>
                  ))
                )}
              </div>

              {/* Adicionar novo hidrômetro */}
              <div className="p-6 bg-blue-50 border-2 border-blue-100 rounded-[1.5rem] space-y-4">
                <p className="text-[10px] font-black text-blue-600 uppercase tracking-widest flex items-center gap-2">
                  <Plus size={12} /> Adicionar Hidrômetro
                </p>
                <div className="space-y-3">
                  <input
                    type="text"
                    placeholder="Nome (ex: Hidrômetro Bloco A)"
                    className="w-full p-4 bg-white border-2 border-blue-200 rounded-2xl font-bold text-slate-800 focus:border-blue-600 outline-none text-sm placeholder:text-slate-300"
                    value={newMeterName}
                    onChange={(e) => setNewMeterName(e.target.value)}
                  />
                  <input
                    type="text"
                    placeholder="Descrição / localização (opcional)"
                    className="w-full p-3 bg-white border-2 border-blue-100 rounded-2xl font-medium text-slate-700 focus:border-blue-400 outline-none text-sm placeholder:text-slate-300"
                    value={newMeterDesc}
                    onChange={(e) => setNewMeterDesc(e.target.value)}
                  />
                  <button
                    onClick={handleAddMeter}
                    disabled={!newMeterName.trim() || savingMeter}
                    className="w-full py-4 bg-blue-600 text-white rounded-2xl font-black text-[11px] uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-blue-700 active:scale-95 disabled:opacity-40 transition-all shadow-lg shadow-blue-200"
                  >
                    {savingMeter ? <Loader2 className="animate-spin" size={16} /> : <><Plus size={16} /> Adicionar</>}
                  </button>
                </div>
              </div>

              {/* Aviso sobre retrocompatibilidade */}
              {metersList.filter(m => m.is_active).length >= 2 && (
                <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl">
                  <p className="text-[10px] text-amber-700 font-bold leading-relaxed">
                    ⚡ Esta escola agora tem <strong>{metersList.filter(m => m.is_active).length} hidrômetros ativos</strong>. 
                    O gestor da escola verá um seletor de hidrômetro ao registrar o consumo diário.
                    Os registros anteriores (sem hidrômetro vinculado) continuam acessíveis normalmente.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

export default ConsumoAgua;

import { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { addTimbradoAllPages } from '../lib/pdfTimbrado';
import {
  Droplets, ChevronLeft, ChevronRight,
  Save, X, AlertTriangle, CheckCircle,
  Search, Building2, Users, Loader2,
  AlertCircle, ArrowRight, Activity, ShieldCheck,
  TrendingUp, Waves,
  CalendarDays, FileDown, History, CalendarOff, Trash2,
  Gauge, Plus, Settings, ClipboardCopy, ClipboardCheck, Clock,
  GraduationCap, Briefcase
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
  water_exempt?: boolean;
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
  const [isFirstReading, setIsFirstReading] = useState(false);
  
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

  // Escola selecionada está isenta do registro de água?
  const selectedSchool = schools.find(s => s.id === selectedSchoolId);
  const isWaterExempt = selectedSchool?.water_exempt === true;

  async function handleToggleWaterExempt() {
    if (!selectedSchoolId) return;
    const newValue = !isWaterExempt;
    const { error } = await (supabase as any)
      .from('schools')
      .update({ water_exempt: newValue })
      .eq('id', selectedSchoolId);
    if (error) { alert(`Erro ao atualizar isenção: ${error.message}`); return; }
    setSchools(prev => prev.map(s => s.id === selectedSchoolId ? { ...s, water_exempt: newValue } : s));
  }

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
      let profile: any = null;

      if (user) {
        const { data: profileData } = await (supabase as any).from('profiles').select('role, school_id, supervisor_schools').eq('id', user.id).single();
        profile = profileData;
        currentRole = profile?.role || '';
        currentSupSchools = profile?.supervisor_schools || [];
      }

      // Busca escolas ANTES de setar qualquer estado, para que todos os setState
      // abaixo sejam batched pelo React 18 num único render — garante que schools
      // e userRole estarão disponíveis juntos quando o useEffect disparar fetchLogs.
      const { data: schoolsData } = await (supabase as any).from('schools').select('id, name, water_exempt').order('name');

      if (user) {
        setUserId(user.id);
        setUserRole(currentRole);
        if (currentRole === 'school_manager') setSelectedSchoolId(profile.school_id);
        if (currentRole === 'supervisor') setSupervisorSchoolIds(currentSupSchools);
      }

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
      
      // Paginação para contornar o limite máximo de linhas do Supabase por requisição.
      // Cada .range() busca até 1000 linhas; iteramos até não ter mais páginas.
      // O query builder do Supabase JS é imutável: .range() cria uma nova requisição
      // sem modificar `query`, então é seguro reusar o mesmo builder em cada iteração.
      const fetchAllPages = async (): Promise<WaterLog[]> => {
        const PAGE = 1000;
        const all: WaterLog[] = [];
        let from = 0;
        while (true) {
          const { data: page, error: pageErr } = await query
            .gte('date', firstDay)
            .lte('date', lastDay)
            .order('date', { ascending: true })
            .range(from, from + PAGE - 1);
          if (pageErr) throw pageErr;
          if (!page || page.length === 0) break;
          all.push(...page);
          if (page.length < PAGE) break;
          from += PAGE;
        }
        return all;
      };

      const suspSchoolId = selectedSchoolId || schools[0]?.id;
      const [rawLogs, { data: suspData }] = await Promise.all([
        fetchAllPages(),
        suspSchoolId
          ? (supabase as any)
              .from('consumo_agua')
              .select('*')
              .eq('school_id', suspSchoolId)
              .is('meter_id', null)
              .gte('date', firstDay)
              .lte('date', lastDay)
              .like('justification', 'Suspensão de Expediente:%')
          : Promise.resolve({ data: [] }),
      ]);
      setAllMonthLogs(rawLogs);

      // suspensionLogs vem da query dedicada (garante todos os dias mesmo com cap de 1000 linhas)
      const suspMap: Record<string, WaterLog> = {};
      (suspData as WaterLog[] || []).forEach((log: WaterLog) => {
        if (!suspMap[log.date]) suspMap[log.date] = log;
      });
      // fallback: inclui suspensões encontradas na query principal (caso suspSchoolId seja nulo)
      rawLogs.forEach((log: WaterLog) => {
        if (log.justification?.startsWith('Suspensão de Expediente:') && !suspMap[log.date]) {
          suspMap[log.date] = log;
        }
      });
      setSuspensionLogs(suspMap);
      console.log('[fetchLogs] total:', rawLogs.length, 'suspensions:', Object.keys(suspMap));

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

    // Dias com registro real (consumo > 0 e pessoas informadas)
    const daysWithConsumption = filteredMonthLogs.filter(log => (log.consumption_diff || 0) > 0);

    // Média Diária: soma dos consumos ÷ dias com registro
    const registeredConsumption = daysWithConsumption.reduce((acc, curr) => acc + (curr.consumption_diff || 0), 0);
    const avgDailyConsumption = daysWithConsumption.length > 0 ? registeredConsumption / daysWithConsumption.length : 0;

    // Teto Operacional e Média de Limite: calculados sobre os mesmos dias com registro
    const totalLimit = daysWithConsumption.reduce((acc, log) => acc + (log.student_count + log.staff_count) * LIMITE_DIARIO_POR_PESSOA, 0);
    const avgLimit = daysWithConsumption.length > 0 ? totalLimit / daysWithConsumption.length : 0;

    // Média de Alunos e Funcionários: média sobre os dias com registro
    const n = daysWithConsumption.length;
    const avgStudents = n > 0 ? daysWithConsumption.reduce((acc, log) => acc + log.student_count, 0) / n : 0;
    const avgStaff    = n > 0 ? daysWithConsumption.reduce((acc, log) => acc + log.staff_count, 0)    / n : 0;

    return {
      totalConsumption,
      totalLimit,
      avgDailyConsumption,
      exceededDays: filteredMonthLogs.filter(log => log.limit_exceeded).length,
      avgLimit,
      avgStudents,
      avgStaff,
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
  const [activeInfoTab, setActiveInfoTab] = useState<'excedentes' | 'pendentes'>('excedentes');

  const lateSchools = useMemo(() => {
    if (userRole !== 'regional_admin' || selectedSchoolId) return [];

    const todayStr = formatDateToYMD(new Date());

    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const totalDays = new Date(year, month + 1, 0).getDate();

    // Datas com suspensão global já registrada (feriados, recesso etc.)
    // suspensionLogs é keyed por data e cobre toda a rede
    const globalSuspensionDates = new Set(Object.keys(suspensionLogs));

    // Dias úteis passados que deveriam ter registro:
    // exclui fins de semana (escolas não registram Sáb/Dom) e dias com suspensão global
    const pastDays: string[] = [];
    for (let d = 1; d <= totalDays; d++) {
      const date = new Date(year, month, d);
      const dateStr = formatDateToYMD(date);
      const dow = date.getDay(); // 0 = Dom, 6 = Sáb
      if (dateStr < todayStr && dow !== 0 && dow !== 6 && !globalSuspensionDates.has(dateStr)) {
        pastDays.push(dateStr);
      }
    }

    if (pastDays.length === 0) return [];

    const schoolLateMap: Record<string, { name: string; missingDays: string[] }> = {};

    schools.filter(school => !school.water_exempt).forEach(school => {
      const coveredDates = new Set(
        allMonthLogs.filter(l => l.school_id === school.id).map(l => l.date)
      );
      const missing = pastDays.filter(d => !coveredDates.has(d));
      if (missing.length > 0) {
        schoolLateMap[school.id] = { name: school.name, missingDays: missing };
      }
    });

    return Object.values(schoolLateMap).sort((a, b) => a.name.localeCompare(b.name));
  }, [allMonthLogs, schools, userRole, selectedSchoolId, currentDate, suspensionLogs]);

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
        margin: [35, 5, 15, 5],
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
        pagebreak: { before: ['#justifications-section'], avoid: ['tr'] }
      };

      element.style.display = 'block';
      const pdfInstance = await (window as any).html2pdf().set(opt).from(element).toPdf().get('pdf');
      addTimbradoAllPages(pdfInstance as any);
      pdfInstance.save(opt.filename);
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
    setIsFirstReading(prevReading === 0);
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
      if (!isFirstReading && isLimitExceeded && (!formData.justification || !formData.action_plan)) {
          throw new Error("Preencha justificativa e ação para excessos.");
      }

      const finalReading = isHydrometerBlocked ? prevReadingValue : formData.reading_m3;
      // Primeiro registro da escola: apenas registra a leitura base, consumo = 0
      const finalConsumption = (isHydrometerBlocked || isFirstReading) ? 0 : currentConsumption;
      const finalLimitExceeded = isFirstReading ? false : isLimitExceeded;

      const meterId = selectedMeterId || null;

      const logData: any = {
        school_id: selectedSchoolId,
        date: selectedDateStr,
        meter_id: meterId,
        reading_m3: finalReading,
        consumption_diff: finalConsumption,
        student_count: formData.student_count,
        staff_count: formData.staff_count,
        limit_exceeded: finalLimitExceeded,
        justification: finalLimitExceeded ? formData.justification : null,
        action_plan: finalLimitExceeded ? formData.action_plan : null,
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

      // Evita onConflict (tabela sem unique constraint em school_id+date).
      // Faz todos os selects em paralelo, depois inserts/updates em paralelo.
      const existingResults = await Promise.all(
        bulkData.map(record =>
          (supabase as any)
            .from('consumo_agua')
            .select('id')
            .eq('school_id', record.school_id)
            .eq('date', record.date)
            .is('meter_id', null)
            .maybeSingle()
        )
      );

      const toInsert: any[] = [];
      const toUpdate: { id: string; record: any }[] = [];

      existingResults.forEach(({ data: existing, error: selectError }, i) => {
        if (selectError) throw selectError;
        if (existing) {
          toUpdate.push({ id: existing.id, record: bulkData[i] });
        } else {
          toInsert.push(bulkData[i]);
        }
      });

      console.log('[save] toInsert:', toInsert.length, 'toUpdate:', toUpdate.length, 'date:', selectedDateStr);
      const ops: Promise<any>[] = [];

      if (toInsert.length > 0) {
        ops.push(
          (supabase as any).from('consumo_agua').insert(toInsert).then(({ error }: any) => {
            if (error) throw error;
          })
        );
      }

      toUpdate.forEach(({ id, record }) => {
        ops.push(
          (supabase as any).from('consumo_agua').update(record).eq('id', id).then(({ error }: any) => {
            if (error) throw error;
          })
        );
      });

      await Promise.all(ops);

      await fetchLogs();
      alert(`Suspensão registrada com sucesso para ${bulkData.length} escolas.`);
      setIsSuspensionModalOpen(false);

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

    const showDispensada = isWaterExempt && !log && !isFuture && dateStr < todayStr;
    if (showDispensada) stateClass = "bg-cyan-50 text-cyan-700 border-cyan-200";

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
        ) : showDispensada ? (
          <div className="text-[10px] font-black uppercase text-cyan-600 z-10 italic text-center">Dispensada</div>
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
            <div className="ml-auto flex items-center gap-2">
              {userRole === 'regional_admin' && (
                <button
                  onClick={handleToggleWaterExempt}
                  className={`flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-black border rounded-xl transition-all ${
                    isWaterExempt
                      ? 'bg-cyan-50 text-cyan-700 border-cyan-200 hover:bg-cyan-100'
                      : 'text-slate-400 hover:text-cyan-600 hover:bg-cyan-50 border-slate-200 hover:border-cyan-200'
                  }`}
                  title={isWaterExempt ? 'Remover isenção' : 'Dispensar do registro de água'}
                >
                  <Droplets size={12} />
                  {isWaterExempt ? 'Isenta' : 'Dispensar'}
                </button>
              )}
              <button
                onClick={() => openMeterModal(selectedSchoolId)}
                className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-all"
                title="Gerenciar hidrômetros desta escola"
              >
                <Settings size={16} />
              </button>
            </div>
          )}
        </div>
      )}

      {/* Botão para admin gerenciar hidrômetros quando escola selecionada tem apenas 1 ou nenhum */}
      {selectedSchoolId && !hasMultipleMeters && canManageMeters && (
        <div className="flex justify-end gap-2 print:hidden">
          {userRole === 'regional_admin' && (
            <button
              onClick={handleToggleWaterExempt}
              className={`flex items-center gap-2 px-4 py-2 text-xs font-black border rounded-xl transition-all ${
                isWaterExempt
                  ? 'bg-cyan-50 text-cyan-700 border-cyan-200 hover:bg-cyan-100'
                  : 'text-slate-400 hover:text-cyan-600 hover:bg-cyan-50 border-slate-200 hover:border-cyan-200'
              }`}
              title={isWaterExempt ? 'Remover isenção de registro de água' : 'Marcar escola como isenta de registro de água'}
            >
              <Droplets size={14} />
              {isWaterExempt ? 'Isenta (remover)' : 'Dispensar do registro'}
            </button>
          )}
          <button
            onClick={() => openMeterModal(selectedSchoolId)}
            className="flex items-center gap-2 px-4 py-2 text-xs font-black text-slate-400 hover:text-blue-600 hover:bg-blue-50 border border-slate-200 hover:border-blue-200 rounded-xl transition-all"
          >
            <Gauge size={14} />
            Gerenciar Hidrômetros
          </button>
        </div>
      )}

      {/* STATS — Linha 1: métricas de consumo (4 cards) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 print:hidden">
          <div className={`p-5 rounded-[2rem] border-2 transition-all flex items-center gap-4 shadow-lg ${isTotalExceeded ? 'bg-red-50 border-red-200 text-red-700' : 'bg-white border-slate-100'}`}>
              <div className={`p-3 rounded-xl shrink-0 ${isTotalExceeded ? 'bg-red-600 text-white' : 'bg-blue-600 text-white'}`}><Waves size={18} /></div>
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest opacity-60">Total Consumido</p>
                <h3 className="text-lg font-black">{stats.totalConsumption.toFixed(2)} m³</h3>
                <p className="text-[10px] opacity-50 mt-0.5 leading-tight">Último registro do mês menos último do mês anterior</p>
              </div>
          </div>
          <div className="bg-white p-5 rounded-[2rem] border-2 border-slate-100 shadow-lg flex items-center gap-4">
              <div className="p-3 bg-slate-900 text-white rounded-xl shrink-0"><ShieldCheck size={18} /></div>
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest opacity-40">Limite de Consumo</p>
                <h3 className="text-lg font-black text-slate-800">{stats.totalLimit.toFixed(2)} m³</h3>
                <p className="text-[10px] opacity-40 mt-0.5 leading-tight">Limite total que a escola não deve ultrapassar no mês</p>
              </div>
          </div>
          <div className="bg-white p-5 rounded-[2rem] border-2 border-slate-100 shadow-lg flex items-center gap-4">
              <div className="p-3 bg-emerald-600 text-white rounded-xl shrink-0"><TrendingUp size={18} /></div>
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest opacity-40">Média Diária</p>
                <h3 className="text-lg font-black text-slate-800">{stats.avgDailyConsumption.toFixed(2)} m³</h3>
                <p className="text-[10px] opacity-40 mt-0.5 leading-tight">Soma dos consumos ÷ dias com registro no mês</p>
              </div>
          </div>
          <div className="bg-white p-5 rounded-[2rem] border-2 border-slate-100 shadow-lg flex items-center gap-4">
              <div className="p-3 bg-amber-500 text-white rounded-xl shrink-0"><AlertTriangle size={18} /></div>
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest opacity-40">Média de Limite</p>
                <h3 className="text-lg font-black text-slate-800">{stats.avgLimit.toFixed(2)} m³</h3>
                <p className="text-[10px] opacity-40 mt-0.5 leading-tight">Limite médio diário que a escola não pode passar</p>
              </div>
          </div>
      </div>

      {/* STATS — Linha 2: contexto (3 cards) */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 print:hidden">
          <div className="bg-white p-5 rounded-[2rem] border-2 border-slate-100 shadow-lg flex items-center gap-4">
              <div className="p-3 bg-violet-600 text-white rounded-xl shrink-0"><GraduationCap size={18} /></div>
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest opacity-40">Média de Alunos</p>
                <h3 className="text-lg font-black text-slate-800">{Math.round(stats.avgStudents)}</h3>
                <p className="text-[10px] opacity-40 mt-0.5 leading-tight">Média de alunos informados nos dias registrados</p>
              </div>
          </div>
          <div className="bg-white p-5 rounded-[2rem] border-2 border-slate-100 shadow-lg flex items-center gap-4">
              <div className="p-3 bg-rose-600 text-white rounded-xl shrink-0"><Briefcase size={18} /></div>
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest opacity-40">Média de Funcionários</p>
                <h3 className="text-lg font-black text-slate-800">{Math.round(stats.avgStaff)}</h3>
                <p className="text-[10px] opacity-40 mt-0.5 leading-tight">Média de funcionários informados nos dias registrados</p>
              </div>
          </div>
          <div className="bg-white p-5 rounded-[2rem] border-2 border-slate-100 shadow-lg flex items-center gap-4">
              <div className="p-3 bg-cyan-600 text-white rounded-xl shrink-0"><Activity size={18} /></div>
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest opacity-40">Pipas no Ano</p>
                <h3 className="text-lg font-black text-slate-800">{waterTruckCount}</h3>
                <p className="text-[10px] opacity-40 mt-0.5 leading-tight">Caminhões-pipa solicitados nos últimos 12 meses</p>
              </div>
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

      {/* ABAS: Registros com Excedente + Escolas Pendentes */}
      {(justificationsList.length > 0 || (userRole === 'regional_admin' && !selectedSchoolId)) && (
        <div className="bg-white rounded-[2.5rem] border-2 border-slate-100 shadow-xl overflow-hidden print:hidden">

          {/* Cabeçalho das abas */}
          <div className="flex border-b-2 border-slate-100">
            <button
              onClick={() => setActiveInfoTab('excedentes')}
              className={`flex-1 px-6 py-4 text-[11px] font-black uppercase tracking-widest flex items-center justify-center gap-2 transition-all border-b-2 -mb-[2px] ${
                activeInfoTab === 'excedentes'
                  ? 'bg-amber-50 text-amber-700 border-amber-500'
                  : 'text-slate-400 hover:text-slate-600 hover:bg-slate-50 border-transparent'
              }`}
            >
              <History size={14} />
              Registros com Excedente
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
                activeInfoTab === 'excedentes'
                  ? 'bg-amber-500 text-white'
                  : 'bg-slate-200 text-slate-500'
              }`}>
                {justificationsList.length}
              </span>
            </button>

            {userRole === 'regional_admin' && !selectedSchoolId && (
              <button
                onClick={() => setActiveInfoTab('pendentes')}
                className={`flex-1 px-6 py-4 text-[11px] font-black uppercase tracking-widest flex items-center justify-center gap-2 transition-all border-b-2 -mb-[2px] ${
                  activeInfoTab === 'pendentes'
                    ? 'bg-red-50 text-red-700 border-red-500'
                    : 'text-slate-400 hover:text-slate-600 hover:bg-slate-50 border-transparent'
                }`}
              >
                <Clock size={14} />
                Escolas Pendentes
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
                  activeInfoTab === 'pendentes'
                    ? lateSchools.length > 0 ? 'bg-red-500 text-white' : 'bg-emerald-500 text-white'
                    : 'bg-slate-200 text-slate-500'
                }`}>
                  {lateSchools.length}
                </span>
              </button>
            )}
          </div>

          {/* Conteúdo: Registros com Excedente */}
          {activeInfoTab === 'excedentes' && (
            <div>
              {justificationsList.length === 0 ? (
                <div className="p-12 flex flex-col items-center justify-center gap-3 text-center">
                  <div className="p-4 bg-emerald-100 rounded-2xl text-emerald-600"><CheckCircle size={28} /></div>
                  <p className="text-sm font-black text-slate-500 uppercase tracking-widest">Nenhum excedente</p>
                  <p className="text-xs text-slate-400 font-medium">Nenhum registro ultrapassou o limite operacional em {MONTHS[currentDate.getMonth()]}/{currentDate.getFullYear()}.</p>
                </div>
              ) : (
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
              )}
            </div>
          )}

          {/* Conteúdo: Escolas Pendentes */}
          {activeInfoTab === 'pendentes' && userRole === 'regional_admin' && !selectedSchoolId && (
            <div>
              {lateSchools.length === 0 ? (
                <div className="p-12 flex flex-col items-center justify-center gap-3 text-center">
                  <div className="p-4 bg-emerald-100 rounded-2xl text-emerald-600"><CheckCircle size={28} /></div>
                  <p className="text-sm font-black text-emerald-700 uppercase tracking-widest">Todas as escolas em dia!</p>
                  <p className="text-xs text-emerald-600 font-medium">Nenhuma escola com registros atrasados em {MONTHS[currentDate.getMonth()]}/{currentDate.getFullYear()}.</p>
                </div>
              ) : (
                <div>
                  <div className="p-6 border-b border-red-100 flex items-center justify-between bg-red-50/40">
                    <p className="text-xs text-slate-400 font-medium">
                      {lateSchools.length} escola{lateSchools.length > 1 ? 's' : ''} com dias sem lançamento em {MONTHS[currentDate.getMonth()]}/{currentDate.getFullYear()}
                    </p>
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

                  <div className="p-6 border-t border-red-100 bg-slate-50">
                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2">Pré-visualização do texto copiado</p>
                    <pre className="text-[11px] text-slate-600 font-mono leading-relaxed whitespace-pre-wrap bg-white border border-slate-200 rounded-2xl p-4 select-all">
{`Escolas com registros atrasados em ${MONTHS[currentDate.getMonth()]}/${currentDate.getFullYear()}:\n\n${lateSchools.map(s => `• ${s.name} — ${s.missingDays.length} dia(s) sem registro`).join('\n')}`}
                    </pre>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ===== TEMPLATE DE IMPRESSÃO PDF (oculto, gerado pelo html2pdf) ===== */}
      <div id="pdf-print-template" style={{ display: 'none', background: 'white', width: '1080px', padding: '10px 30px', fontFamily: 'Arial, sans-serif' }}>

        {/* Cabeçalho */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '4px solid #2563eb', paddingBottom: '16px', marginBottom: '20px' }}>
          <div>
            <h1 style={{ margin: 0, fontSize: '22px', fontWeight: 900, color: '#0f172a' }}>RELATÓRIO DE MONITORAMENTO HÍDRICO</h1>
            <p style={{ margin: '4px 0 0', fontSize: '11px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Secretaria de Gestão Regional • Auditoria de Recursos</p>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ background: '#2563eb', color: 'white', padding: '4px 14px', borderRadius: '8px', fontWeight: 900, fontSize: '10px', display: 'inline-block' }}>SGE-GSU</div>
            <p style={{ margin: '6px 0 0', fontWeight: 900, fontSize: '14px', color: '#1e293b' }}>{monthName.toUpperCase()} / {currentDate.getFullYear()}</p>
          </div>
        </div>

        {/* Unidade */}
        <div style={{ background: '#f8fafc', padding: '12px 16px', borderRadius: '12px', border: '1px solid #e2e8f0', marginBottom: '20px' }}>
          <span style={{ fontSize: '9px', fontWeight: 900, color: '#94a3b8', textTransform: 'uppercase' }}>Unidade Analisada</span>
          <h2 style={{ margin: '2px 0 0', fontSize: '16px', fontWeight: 900, color: '#1e293b' }}>
            {selectedSchoolId
              ? schools.find(s => s.id === selectedSchoolId)?.name
              : (userRole === 'supervisor' ? 'VISÃO DE SUPERVISÃO (UNIDADES SELECIONADAS)' : 'REDE REGIONAL GLOBAL (TODAS AS UNIDADES)')}
          </h2>
          {selectedSchoolId && hasMultipleMeters && selectedMeterId && (
            <p style={{ margin: '3px 0 0', fontSize: '11px', fontWeight: 700, color: '#2563eb' }}>
              {schoolMeters.find(m => m.id === selectedMeterId)?.name}
            </p>
          )}
        </div>

        {/* Cards linha 1: Consumo (4 cards) */}
        <div style={{ display: 'flex', gap: '10px', marginBottom: '10px' }}>
          <div style={{ flex: 1, background: isTotalExceeded ? '#fef2f2' : '#eff6ff', padding: '14px 16px', borderRadius: '14px', border: isTotalExceeded ? '2px solid #ef4444' : '1px solid #bfdbfe' }}>
            <p style={{ margin: 0, fontSize: '9px', fontWeight: 900, color: '#64748b', textTransform: 'uppercase', letterSpacing: '1px' }}>Total Consumido</p>
            <p style={{ margin: '4px 0 0', fontSize: '20px', fontWeight: 900, color: isTotalExceeded ? '#b91c1c' : '#1e3a8a' }}>{stats.totalConsumption.toFixed(2)} m³</p>
            <p style={{ margin: '3px 0 0', fontSize: '9px', color: '#94a3b8' }}>Último reg. mês − último reg. mês anterior</p>
          </div>
          <div style={{ flex: 1, background: '#f8fafc', padding: '14px 16px', borderRadius: '14px', border: '1px solid #e2e8f0' }}>
            <p style={{ margin: 0, fontSize: '9px', fontWeight: 900, color: '#64748b', textTransform: 'uppercase', letterSpacing: '1px' }}>Limite de Consumo</p>
            <p style={{ margin: '4px 0 0', fontSize: '20px', fontWeight: 900, color: '#0f172a' }}>{stats.totalLimit.toFixed(2)} m³</p>
            <p style={{ margin: '3px 0 0', fontSize: '9px', color: '#94a3b8' }}>Limite total que a escola não deve ultrapassar</p>
          </div>
          <div style={{ flex: 1, background: '#f0fdf4', padding: '14px 16px', borderRadius: '14px', border: '1px solid #bbf7d0' }}>
            <p style={{ margin: 0, fontSize: '9px', fontWeight: 900, color: '#64748b', textTransform: 'uppercase', letterSpacing: '1px' }}>Média Diária</p>
            <p style={{ margin: '4px 0 0', fontSize: '20px', fontWeight: 900, color: '#166534' }}>{stats.avgDailyConsumption.toFixed(2)} m³</p>
            <p style={{ margin: '3px 0 0', fontSize: '9px', color: '#94a3b8' }}>Soma dos consumos ÷ dias com registro</p>
          </div>
          <div style={{ flex: 1, background: '#fffbeb', padding: '14px 16px', borderRadius: '14px', border: '1px solid #fde68a' }}>
            <p style={{ margin: 0, fontSize: '9px', fontWeight: 900, color: '#64748b', textTransform: 'uppercase', letterSpacing: '1px' }}>Média de Limite</p>
            <p style={{ margin: '4px 0 0', fontSize: '20px', fontWeight: 900, color: '#92400e' }}>{stats.avgLimit.toFixed(2)} m³</p>
            <p style={{ margin: '3px 0 0', fontSize: '9px', color: '#94a3b8' }}>Limite médio diário permitido por escola</p>
          </div>
        </div>

        {/* Cards linha 2: Contexto (3 cards) */}
        <div style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
          <div style={{ flex: 1, background: '#f5f3ff', padding: '14px 16px', borderRadius: '14px', border: '1px solid #ddd6fe' }}>
            <p style={{ margin: 0, fontSize: '9px', fontWeight: 900, color: '#64748b', textTransform: 'uppercase', letterSpacing: '1px' }}>Média de Alunos</p>
            <p style={{ margin: '4px 0 0', fontSize: '20px', fontWeight: 900, color: '#4c1d95' }}>{Math.round(stats.avgStudents)}</p>
            <p style={{ margin: '3px 0 0', fontSize: '9px', color: '#94a3b8' }}>Média nos dias com registro</p>
          </div>
          <div style={{ flex: 1, background: '#fff1f2', padding: '14px 16px', borderRadius: '14px', border: '1px solid #fecdd3' }}>
            <p style={{ margin: 0, fontSize: '9px', fontWeight: 900, color: '#64748b', textTransform: 'uppercase', letterSpacing: '1px' }}>Média de Funcionários</p>
            <p style={{ margin: '4px 0 0', fontSize: '20px', fontWeight: 900, color: '#9f1239' }}>{Math.round(stats.avgStaff)}</p>
            <p style={{ margin: '3px 0 0', fontSize: '9px', color: '#94a3b8' }}>Média nos dias com registro</p>
          </div>
          <div style={{ flex: 1, background: '#ecfeff', padding: '14px 16px', borderRadius: '14px', border: '1px solid #a5f3fc' }}>
            <p style={{ margin: 0, fontSize: '9px', fontWeight: 900, color: '#64748b', textTransform: 'uppercase', letterSpacing: '1px' }}>Pipas no Ano</p>
            <p style={{ margin: '4px 0 0', fontSize: '20px', fontWeight: 900, color: '#0e7490' }}>{waterTruckCount}</p>
            <p style={{ margin: '3px 0 0', fontSize: '9px', color: '#94a3b8' }}>Caminhões-pipa solicitados nos últimos 12 meses</p>
          </div>
        </div>

        {/* Gráfico Consumo x Limite */}
        <div style={{ background: '#f8fafc', borderRadius: '14px', border: '1px solid #e2e8f0', padding: '16px', marginBottom: '20px' }}>
          <p style={{ margin: '0 0 4px', fontSize: '11px', fontWeight: 900, color: '#1e293b', textTransform: 'uppercase', letterSpacing: '1px' }}>Consumo × Limite — Comparativo Diário</p>
          <p style={{ margin: '0 0 12px', fontSize: '9px', color: '#94a3b8' }}>
            <span style={{ display: 'inline-block', width: '20px', height: '3px', background: '#2563eb', verticalAlign: 'middle', marginRight: '4px' }} />Consumo (m³)
            <span style={{ display: 'inline-block', width: '20px', height: '2px', borderTop: '2px dashed #10b981', verticalAlign: 'middle', margin: '0 4px 0 12px' }} />Limite (m³)
          </p>
          <AreaChart width={1000} height={120} data={chartData} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
            <defs>
              <linearGradient id="pdfConsumo" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#2563eb" stopOpacity={0.25}/><stop offset="95%" stopColor="#2563eb" stopOpacity={0}/></linearGradient>
              <linearGradient id="pdfLimite" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#10b981" stopOpacity={0.15}/><stop offset="95%" stopColor="#10b981" stopOpacity={0}/></linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey="date" tick={{ fontSize: 9, fill: '#94a3b8', fontWeight: 'bold' }} />
            <YAxis tick={{ fontSize: 9, fill: '#94a3b8', fontWeight: 'bold' }} />
            <Area type="monotone" dataKey="consumo" stroke="#2563eb" strokeWidth={2} fill="url(#pdfConsumo)" dot={false} />
            <Area type="monotone" dataKey="limite" stroke="#10b981" strokeWidth={1.5} strokeDasharray="5 3" fill="url(#pdfLimite)" dot={false} />
          </AreaChart>
        </div>

        {/* Justificativas — sempre começa em nova página */}
        {justificationsList.length > 0 && (
          <div id="justifications-section" style={{ paddingTop: '10px', marginBottom: '20px' }}>
            <h3 style={{ fontSize: '12px', fontWeight: 900, color: '#1e293b', marginBottom: '12px', textTransform: 'uppercase' }}>Detalhamento de Justificativas e Ações Corretivas</h3>
            <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
              <thead>
                <tr style={{ background: '#f1f5f9' }}>
                  <th style={{ width: '18%', padding: '10px', border: '1px solid #cbd5e1', fontSize: '9px', fontWeight: 900, textAlign: 'left' }}>ESCOLA</th>
                  <th style={{ width: '9%', padding: '10px', border: '1px solid #cbd5e1', fontSize: '9px', fontWeight: 900, textAlign: 'center' }}>DATA</th>
                  <th style={{ width: '8%', padding: '10px', border: '1px solid #cbd5e1', fontSize: '9px', fontWeight: 900, textAlign: 'center' }}>EXCESSO</th>
                  <th style={{ width: '32%', padding: '10px', border: '1px solid #cbd5e1', fontSize: '9px', fontWeight: 900, textAlign: 'left' }}>JUSTIFICATIVA</th>
                  <th style={{ width: '33%', padding: '10px', border: '1px solid #cbd5e1', fontSize: '9px', fontWeight: 900, textAlign: 'left' }}>PLANO DE AÇÃO</th>
                </tr>
              </thead>
              <tbody>
                {justificationsList.map((log) => (
                  <tr key={log.id} style={{ pageBreakInside: 'avoid' }}>
                    <td style={{ padding: '8px 10px', border: '1px solid #cbd5e1', fontSize: '9px', fontWeight: 700, textTransform: 'uppercase' }}>{log.school_name}</td>
                    <td style={{ padding: '8px 10px', border: '1px solid #cbd5e1', fontSize: '9px', textAlign: 'center', color: '#64748b' }}>{new Date(log.date + 'T12:00:00').toLocaleDateString()}</td>
                    <td style={{ padding: '8px 10px', border: '1px solid #cbd5e1', fontSize: '9px', textAlign: 'center', fontWeight: 900, color: '#ef4444' }}>+{log.consumption_diff.toFixed(2)} m³</td>
                    <td style={{ padding: '8px 10px', border: '1px solid #cbd5e1', fontSize: '9px', color: '#334155', fontStyle: 'italic', wordWrap: 'break-word' }}>"{log.justification}"</td>
                    <td style={{ padding: '8px 10px', border: '1px solid #cbd5e1', fontSize: '9px', color: '#1e3a8a', fontWeight: 600, wordWrap: 'break-word' }}>{log.action_plan}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Rodapé */}
        <div style={{ paddingTop: '16px', borderTop: '1px solid #e2e8f0', textAlign: 'center' }}>
          <p style={{ fontSize: '9px', fontWeight: 900, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '2px', margin: 0 }}>
            Documento emitido em {new Date().toLocaleString('pt-BR')} • Sistema SGE-GSU
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
                      <input type="number" placeholder="0" min={0} max={9999} className="w-full p-4 bg-white border-2 border-blue-200 rounded-2xl font-black text-slate-800 focus:border-blue-600 outline-none transition-all shadow-sm" value={formData.student_count || ''} onChange={(e) => setFormData({...formData, student_count: Math.min(9999, Math.max(0, Number(e.target.value)))})} />
                  </div>
                  <div className="space-y-2">
                      <span className="text-[10px] font-black text-slate-500 uppercase ml-1">Funcionários</span>
                      <input type="number" placeholder="0" min={0} max={9999} className="w-full p-4 bg-white border-2 border-blue-200 rounded-2xl font-black text-slate-800 focus:border-blue-600 outline-none transition-all shadow-sm" value={formData.staff_count || ''} onChange={(e) => setFormData({...formData, staff_count: Math.min(9999, Math.max(0, Number(e.target.value)))})} />
                  </div>
                </div>

                {/* Banner: Leitura Inicial */}
                {isFirstReading && !loadingPrev && (
                  <div className="flex items-start gap-3 p-4 bg-blue-50 border-2 border-blue-200 rounded-2xl">
                    <AlertCircle size={18} className="text-blue-500 shrink-0 mt-0.5" />
                    <div>
                      <p className="text-[11px] font-black text-blue-700 uppercase tracking-widest">Primeiro Registro</p>
                      <p className="text-[11px] text-blue-600 mt-0.5 leading-snug">Este é o primeiro lançamento da escola. A leitura atual será salva como <strong>leitura base</strong> e o consumo ficará em <strong>0 m³</strong>. O consumo real será calculado a partir do próximo registro.</p>
                    </div>
                  </div>
                )}

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

import React, { useEffect, useState, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { Sidebar } from '../components/Sidebar';
import { Header } from '../components/Header';
import { 
  Droplet, 
  Calendar as CalendarIcon, 
  CheckCircle, 
  AlertTriangle, 
  Search, 
  ChevronLeft, 
  ChevronRight,
  Save,
  Loader2,
  X,
  BarChart2,
  Download,
  TrendingUp,
  Activity
} from 'lucide-react';
import { 
  format, 
  startOfMonth, 
  endOfMonth, 
  eachDayOfInterval, 
  isSameDay, 
  isAfter, 
  isBefore, 
  addDays, 
  subDays
} from 'date-fns';
import { ptBR } from 'date-fns/locale';

// Bibliotecas para PDF
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

// --- INTERFACES ---
interface ConsumptionRecord {
  id: string;
  date: string;
  reading_m3: number;
  consumption_diff: number;
  student_count: number;
  staff_count: number;
  limit_exceeded: boolean;
  justification?: string;
  action_plan?: string;
}

interface SchoolOption {
  id: string;
  name: string;
}

// --- CONSTANTES ---
const LIMIT_FACTOR = 0.008; // Limite por pessoa (m³)

// --- COMPONENTE DE CARD REUTILIZÁVEL ---
const InfoCard = ({ title, value, subtext, icon: Icon, colorClass }: any) => (
  <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 flex items-start justify-between min-h-[120px]">
    <div className="flex flex-col justify-between h-full">
      <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">{title}</p>
      <div>
        <h3 className="text-2xl font-bold text-gray-800 mt-1">{value}</h3>
        {subtext && <p className="text-xs text-gray-400 mt-1">{subtext}</p>}
      </div>
    </div>
    <div className={`p-3 rounded-lg ${colorClass}`}>
      <Icon size={24} />
    </div>
  </div>
);

export function ConsumoAgua() {
  // --- ESTADOS ---
  const [loading, setLoading] = useState(true);
  const [userRole, setUserRole] = useState<string>("");
  const [userName, setUserName] = useState<string>("Usuário");
  const [userId, setUserId] = useState<string>("");
  
  // Seleção de Escola (Admin) e Dados da Escola Atual
  const [schools, setSchools] = useState<SchoolOption[]>([]);
  const [selectedSchoolId, setSelectedSchoolId] = useState<string>("");
  const [currentSchoolName, setCurrentSchoolName] = useState<string>("");

  // Calendário e Registros
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [monthlyRecords, setMonthlyRecords] = useState<ConsumptionRecord[]>([]);
  
  // Dados para Admin (Média Geral)
  const [allSchoolsMonthlyAvg, setAllSchoolsMonthlyAvg] = useState<number>(0);
  
  // Modal de Registro
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [previousReading, setPreviousReading] = useState<number | null>(null);
  
  // Formulário
  const [formData, setFormData] = useState({
    reading: '',
    students: '',
    staff: '',
    justification: '',
    actionPlan: ''
  });
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);

  // --- EFEITOS ---

  useEffect(() => {
    init();
  }, []);

  useEffect(() => {
    if (selectedSchoolId) {
      fetchMonthlyRecords();
    }
    // Se for admin, busca também a média geral do mês
    if (userRole === 'regional_admin') {
      fetchGeneralMonthStats();
    }
  }, [selectedSchoolId, currentMonth, userRole]);

  // --- FUNÇÕES DE INICIALIZAÇÃO ---

  async function init() {
    try {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      setUserId(user.id);
      setUserName(user.user_metadata?.full_name || "Usuário");

      const { data: profile } = await (supabase
        .from('profiles') as any)
        .select('role, school_id')
        .eq('id', user.id)
        .single();

      const role = profile?.role || 'school_manager';
      const userSchoolId = profile?.school_id;
      
      setUserRole(role);

      if (role === 'regional_admin') {
        const { data: schoolsList } = await (supabase.from('schools') as any)
          .select('id, name')
          .order('name');
        
        setSchools(schoolsList || []);
        if (schoolsList && schoolsList.length > 0) {
          setSelectedSchoolId(schoolsList[0].id);
          setCurrentSchoolName(schoolsList[0].name);
        }
      } else {
        if (userSchoolId) {
          setSelectedSchoolId(userSchoolId);
          const { data: schoolData } = await (supabase.from('schools') as any)
            .select('name')
            .eq('id', userSchoolId)
            .single();
          setCurrentSchoolName(schoolData?.name || "Minha Escola");
        }
      }
    } catch (error) {
      console.error("Erro ao inicializar:", error);
    } finally {
      setLoading(false);
    }
  }

  // Busca registros da escola selecionada
  async function fetchMonthlyRecords() {
    if (!selectedSchoolId) return;

    try {
      const start = startOfMonth(currentMonth).toISOString();
      const end = endOfMonth(currentMonth).toISOString();

      const { data } = await (supabase.from('consumo_agua') as any)
        .select('*')
        .eq('school_id', selectedSchoolId)
        .gte('date', start)
        .lte('date', end)
        .order('date', { ascending: true });

      setMonthlyRecords(data || []);
    } catch (error) {
      console.error("Erro ao buscar registros:", error);
    }
  }

  // Busca estatísticas gerais (todas as escolas) para o mês atual - Apenas Admin
  async function fetchGeneralMonthStats() {
    try {
      const start = startOfMonth(currentMonth).toISOString();
      const end = endOfMonth(currentMonth).toISOString();

      // Busca TODOS os registros do mês de TODAS as escolas
      const { data } = await (supabase.from('consumo_agua') as any)
        .select('consumption_diff')
        .gte('date', start)
        .lte('date', end);

      if (data && data.length > 0) {
        const total = data.reduce((acc: number, curr: any) => acc + (curr.consumption_diff || 0), 0);
        // Média de consumo POR DIA (considerando todos os registros)
        setAllSchoolsMonthlyAvg(total / data.length);
      } else {
        setAllSchoolsMonthlyAvg(0);
      }
    } catch (error) {
      console.error("Erro ao buscar estatísticas gerais", error);
    }
  }

  // --- LÓGICA DO CALENDÁRIO ---

  const daysInMonth = useMemo(() => {
    return eachDayOfInterval({
      start: startOfMonth(currentMonth),
      end: endOfMonth(currentMonth)
    });
  }, [currentMonth]);

  const getDayStatus = (date: Date) => {
    const dateStr = format(date, 'yyyy-MM-dd');
    const record = monthlyRecords.find(r => r.date === dateStr);
    const today = new Date();
    
    if (isAfter(date, today) && !isSameDay(date, today)) return 'future';

    if (record) {
      return record.limit_exceeded ? 'warning' : 'success';
    }

    if (isBefore(date, today) && !isSameDay(date, today)) return 'missing';

    return 'today';
  };

  // --- ESTATÍSTICAS DA ESCOLA SELECIONADA ---
  const selectedSchoolStats = useMemo(() => {
    if (monthlyRecords.length === 0) return { avg: 0, exceededDays: 0, estimatedLimit: 0 };

    const totalConsumption = monthlyRecords.reduce((sum, r) => sum + (r.consumption_diff || 0), 0);
    const avg = totalConsumption / monthlyRecords.length;
    const exceededDays = monthlyRecords.filter(r => r.limit_exceeded).length;

    // Calcular limite mensal estimado baseado na média de pessoas informada nos registros existentes
    const totalPeopleRecords = monthlyRecords.reduce((sum, r) => sum + (r.student_count || 0) + (r.staff_count || 0), 0);
    const avgPeople = totalPeopleRecords / monthlyRecords.length;
    const estimatedLimitDaily = avgPeople * LIMIT_FACTOR;
    const estimatedLimitMonthly = estimatedLimitDaily * 30; // Estimativa para 30 dias

    return { avg, exceededDays, estimatedLimit: estimatedLimitMonthly };
  }, [monthlyRecords]);

  // --- FUNÇÃO DE EXPORTAÇÃO PDF ---
  const handleExportPDF = () => {
    setExporting(true);
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();

    try {
      doc.setFontSize(14);
      doc.text("Relatório Mensal de Consumo de Água", pageWidth / 2, 20, { align: "center" });
      
      doc.setFontSize(11);
      doc.text(`Escola: ${currentSchoolName}`, 14, 30);
      doc.text(`Mês de Referência: ${format(currentMonth, 'MMMM/yyyy', { locale: ptBR })}`, 14, 36);
      doc.text(`Data de Emissão: ${new Date().toLocaleDateString('pt-BR')}`, 14, 42);

      const tableData = monthlyRecords.map(record => {
        const totalPeople = (record.student_count || 0) + (record.staff_count || 0);
        const limit = totalPeople * LIMIT_FACTOR;
        
        return [
          format(new Date(record.date), 'dd/MM/yyyy'),
          record.reading_m3.toFixed(2),
          record.consumption_diff.toFixed(2),
          limit.toFixed(3),
          record.limit_exceeded ? 'EXCEDIDO' : 'Normal',
          record.limit_exceeded ? (record.justification || '-') : '-',
          record.limit_exceeded ? (record.action_plan || '-') : '-'
        ];
      });

      autoTable(doc, {
        head: [['Data', 'Leitura', 'Consumo', 'Limite', 'Status', 'Justificativa', 'Ação']],
        body: tableData,
        startY: 50,
        theme: 'grid',
        headStyles: { fillColor: [37, 99, 235] },
        styles: { fontSize: 8 },
        didParseCell: (data) => {
          // Correção de Tipo: Forçar 'any' para evitar erro de índice
          const rawRow = data.row.raw as any[];
          if (data.section === 'body' && rawRow[4] === 'EXCEDIDO') {
            data.cell.styles.textColor = [220, 38, 38];
          }
        }
      });

      doc.save(`Consumo_${currentSchoolName.replace(/\s+/g, '_')}_${format(currentMonth, 'MM-yyyy')}.pdf`);

    } catch (error) {
      console.error("Erro ao gerar PDF:", error);
      alert("Erro ao gerar relatório PDF.");
    } finally {
      setExporting(false);
    }
  };

  // --- LÓGICA DO MODAL ---
  const handleDayClick = async (date: Date) => {
    if (isAfter(date, new Date()) && !isSameDay(date, new Date())) {
      alert("Não é possível registrar consumo futuro.");
      return;
    }

    setSelectedDate(date);
    
    const dateStr = format(date, 'yyyy-MM-dd');
    const existingRecord = monthlyRecords.find(r => r.date === dateStr);

    if (existingRecord) {
      setFormData({
        reading: String(existingRecord.reading_m3),
        students: String(existingRecord.student_count),
        staff: String(existingRecord.staff_count),
        justification: existingRecord.justification || '',
        actionPlan: existingRecord.action_plan || ''
      });
      fetchPreviousReading(date);
    } else {
      await fetchPreviousReading(date);
      setFormData({ reading: '', students: '', staff: '', justification: '', actionPlan: '' });
    }

    setIsModalOpen(true);
  };

  const fetchPreviousReading = async (date: Date) => {
    const { data } = await (supabase.from('consumo_agua') as any)
      .select('reading_m3')
      .eq('school_id', selectedSchoolId)
      .lt('date', format(date, 'yyyy-MM-dd'))
      .order('date', { ascending: false })
      .limit(1)
      .single();

    setPreviousReading(data ? data.reading_m3 : 0);
  };

  const currentReading = parseFloat(formData.reading) || 0;
  const prevReadingVal = previousReading || 0;
  const consumptionDiff = currentReading >= prevReadingVal ? (currentReading - prevReadingVal) : 0; 
  const totalPeople = (parseInt(formData.students) || 0) + (parseInt(formData.staff) || 0);
  const limit = totalPeople * LIMIT_FACTOR;
  const isExceeded = consumptionDiff > limit && limit > 0;

  const handleSave = async () => {
    if (!selectedDate || !selectedSchoolId) return;
    if (!formData.reading || !formData.students || !formData.staff) {
      alert("Preencha todos os campos numéricos.");
      return;
    }
    if (isExceeded && (!formData.justification.trim() || !formData.actionPlan.trim())) {
      alert("Justificativa e Ação Corretiva são obrigatórias.");
      return;
    }

    try {
      setSaving(true);
      const payload = {
        school_id: selectedSchoolId,
        date: format(selectedDate, 'yyyy-MM-dd'),
        reading_m3: currentReading,
        consumption_diff: consumptionDiff,
        student_count: parseInt(formData.students),
        staff_count: parseInt(formData.staff),
        limit_exceeded: isExceeded,
        justification: isExceeded ? formData.justification : null,
        action_plan: isExceeded ? formData.actionPlan : null,
        created_by: userId
      };

      const { error } = await (supabase.from('consumo_agua') as any)
        .upsert(payload, { onConflict: 'school_id, date' });

      if (error) throw error;

      alert("Salvo com sucesso!");
      setIsModalOpen(false);
      fetchMonthlyRecords();
      if (userRole === 'regional_admin') fetchGeneralMonthStats(); // Atualiza média geral se for admin

    } catch (err: any) {
      alert("Erro ao salvar: " + err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex min-h-screen bg-gray-50 font-sans">
      <Sidebar userRole={userRole} />
      
      <div className="flex-1 flex flex-col min-h-screen overflow-hidden">
        <Header userName={userName} userRole={userRole} />
        
        <main className="flex-1 overflow-y-auto p-6 md:p-8">
          <div className="max-w-6xl mx-auto">
            
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
              <div>
                <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
                  <Droplet className="text-blue-600" />
                  Consumo de Água
                </h1>
                <p className="text-gray-500 mt-1">Gestão e monitoramento diário</p>
              </div>

              {userRole === 'regional_admin' && (
                <div className="w-full md:w-auto flex flex-col md:flex-row gap-4 items-end">
                  <div className="w-full md:w-64">
                    <label className="block text-xs font-semibold text-gray-500 mb-1">Visualizar Escola</label>
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={16} />
                      <select
                        value={selectedSchoolId}
                        onChange={(e) => {
                          setSelectedSchoolId(e.target.value);
                          setCurrentSchoolName(schools.find(s => s.id === e.target.value)?.name || "");
                        }}
                        className="w-full pl-9 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none bg-white"
                      >
                        {schools.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                      </select>
                    </div>
                  </div>
                  <button
                    onClick={handleExportPDF}
                    disabled={exporting || monthlyRecords.length === 0}
                    className={`flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg shadow-md hover:bg-blue-700 transition-colors text-sm font-medium ${exporting ? 'opacity-70 cursor-not-allowed' : ''}`}
                  >
                    {exporting ? <Loader2 size={16} className="mr-2 animate-spin" /> : <Download size={16} className="mr-2" />}
                    Exportar
                  </button>
                </div>
              )}
            </div>

            {loading ? (
              <div className="flex justify-center h-64 items-center"><Loader2 className="animate-spin text-blue-600" /></div>
            ) : (
              <>
                {/* CARDS DE ESTATÍSTICAS PARA ADMINISTRADOR */}
                {userRole === 'regional_admin' && (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                    <InfoCard 
                      title="Média Geral (Regional)" 
                      value={`${allSchoolsMonthlyAvg.toFixed(2)} m³`}
                      subtext="Todas as escolas (dia)"
                      icon={Activity} 
                      colorClass="bg-indigo-50 text-indigo-600" 
                    />
                    <InfoCard 
                      title="Média da Escola" 
                      value={`${selectedSchoolStats.avg.toFixed(2)} m³`}
                      subtext="Média diária selecionada"
                      icon={BarChart2} 
                      colorClass="bg-blue-50 text-blue-600" 
                    />
                    <InfoCard 
                      title="Dias com Estouro" 
                      value={`${selectedSchoolStats.exceededDays} dias`}
                      subtext="Acima do limite no mês"
                      icon={AlertTriangle} 
                      colorClass={selectedSchoolStats.exceededDays > 0 ? "bg-red-50 text-red-600" : "bg-green-50 text-green-600"} 
                    />
                    <InfoCard 
                      title="Limite Mensal Est." 
                      value={`~${selectedSchoolStats.estimatedLimit.toFixed(0)} m³`}
                      subtext="Baseado na ocupação atual"
                      icon={TrendingUp} 
                      colorClass="bg-orange-50 text-orange-600" 
                    />
                  </div>
                )}

                {/* CARD DE ESTATÍSTICAS PARA GESTOR (Simplificado) */}
                {userRole === 'school_manager' && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                    <InfoCard 
                      title="Média Mensal" 
                      value={`${selectedSchoolStats.avg.toFixed(2)} m³`}
                      subtext="Média diária"
                      icon={BarChart2} 
                      colorClass="bg-blue-50 text-blue-600" 
                    />
                    <InfoCard 
                      title="Dias com Estouro" 
                      value={`${selectedSchoolStats.exceededDays} dias`}
                      subtext="Atenção necessária"
                      icon={AlertTriangle} 
                      colorClass={selectedSchoolStats.exceededDays > 0 ? "bg-red-50 text-red-600" : "bg-green-50 text-green-600"} 
                    />
                  </div>
                )}

                <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                  <div className="p-4 border-b border-gray-100 flex items-center justify-between bg-blue-50">
                    <div className="flex items-center gap-4">
                      <button onClick={() => setCurrentMonth(subDays(currentMonth, 30))} className="p-1 hover:bg-blue-200 rounded-full">
                        <ChevronLeft size={20} className="text-blue-700" />
                      </button>
                      <h2 className="text-lg font-bold text-blue-900 capitalize">
                        {format(currentMonth, 'MMMM yyyy', { locale: ptBR })}
                      </h2>
                      <button onClick={() => setCurrentMonth(addDays(currentMonth, 30))} className="p-1 hover:bg-blue-200 rounded-full">
                        <ChevronRight size={20} className="text-blue-700" />
                      </button>
                    </div>
                    <div className="text-sm font-medium text-blue-800">{currentSchoolName}</div>
                  </div>

                  <div className="p-6">
                    <div className="grid grid-cols-7 gap-2 mb-2">
                      {['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].map(day => (
                        <div key={day} className="text-center text-xs font-semibold text-gray-400 uppercase tracking-wide py-2">{day}</div>
                      ))}
                    </div>
                    
                    <div className="grid grid-cols-7 gap-2">
                      {Array.from({ length: startOfMonth(currentMonth).getDay() }).map((_, i) => (
                        <div key={`empty-${i}`} className="aspect-square"></div>
                      ))}

                      {daysInMonth.map((day) => {
                        const status = getDayStatus(day);
                        const isFuture = status === 'future';
                        const record = monthlyRecords.find(r => r.date === format(day, 'yyyy-MM-dd'));
                        
                        let bgClass = "bg-gray-50 border-gray-200 hover:border-blue-300";
                        let textClass = "text-gray-700";
                        let icon = null;

                        if (status === 'missing') {
                          bgClass = "bg-red-50 border-red-200 hover:border-red-400";
                          textClass = "text-red-700";
                        } else if (status === 'success') {
                          bgClass = "bg-green-50 border-green-200 hover:border-green-400";
                          textClass = "text-green-700";
                          icon = <CheckCircle size={16} className="text-green-500" />;
                        } else if (status === 'warning') {
                          bgClass = "bg-yellow-50 border-yellow-200 hover:border-yellow-400";
                          textClass = "text-yellow-700";
                          icon = <AlertTriangle size={16} className="text-yellow-600" />;
                        } else if (isFuture) {
                          bgClass = "bg-gray-50 opacity-50 cursor-not-allowed";
                          textClass = "text-gray-400";
                        }

                        return (
                          <div 
                            key={day.toISOString()}
                            onClick={() => !isFuture && handleDayClick(day)}
                            className={`aspect-square rounded-xl border-2 p-2 flex flex-col justify-between cursor-pointer transition-all relative ${bgClass}`}
                          >
                            <span className={`text-sm font-bold ${textClass}`}>{format(day, 'd')}</span>
                            {record && (
                              <div className="mt-1">
                                <p className="text-[10px] font-medium text-gray-500">Consumo</p>
                                <p className={`text-xs font-bold ${record.limit_exceeded ? 'text-red-600' : 'text-blue-600'}`}>{record.consumption_diff} m³</p>
                              </div>
                            )}
                            <div className="absolute top-2 right-2">{icon}</div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <div className="bg-gray-50 p-4 border-t border-gray-100 flex gap-6 text-xs text-gray-600 justify-center">
                    <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-green-500"></div> Registro OK</div>
                    <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-yellow-500"></div> Limite Excedido</div>
                    <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-red-500"></div> Pendente</div>
                    <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-gray-300"></div> Futuro</div>
                  </div>
                </div>
              </>
            )}
          </div>

          {/* MODAL DE REGISTRO (Mantido igual) */}
          {isModalOpen && selectedDate && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
              <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg overflow-hidden animate-fadeIn">
                <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-blue-600 text-white">
                  <div className="flex items-center gap-2">
                    <CalendarIcon size={20} />
                    <h3 className="font-bold">Registro: {format(selectedDate, "dd 'de' MMMM", { locale: ptBR })}</h3>
                  </div>
                  <button onClick={() => setIsModalOpen(false)} className="text-blue-100 hover:text-white"><X size={20} /></button>
                </div>

                <div className="p-6 space-y-6">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="col-span-2">
                      <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Leitura do Hidrômetro (m³)</label>
                      <div className="relative">
                        <input 
                          type="number" 
                          step="0.01"
                          value={formData.reading}
                          onChange={(e) => setFormData({...formData, reading: e.target.value})}
                          className="w-full pl-4 pr-12 py-3 text-lg font-mono border-2 border-gray-300 rounded-lg focus:border-blue-500 outline-none"
                          placeholder="0000.00"
                        />
                        <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 font-bold">m³</span>
                      </div>
                      <p className="text-xs text-gray-400 mt-1">Leitura anterior: <b>{previousReading ?? 0} m³</b></p>
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Qtd. Alunos</label>
                      <input type="number" value={formData.students} onChange={(e) => setFormData({...formData, students: e.target.value})} className="w-full p-2 border border-gray-300 rounded-lg" />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Qtd. Funcionários</label>
                      <input type="number" value={formData.staff} onChange={(e) => setFormData({...formData, staff: e.target.value})} className="w-full p-2 border border-gray-300 rounded-lg" />
                    </div>
                  </div>

                  <div className={`p-4 rounded-lg border ${isExceeded ? 'bg-red-50 border-red-200' : 'bg-green-50 border-green-200'}`}>
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-sm font-medium text-gray-600">Consumo do Dia:</span>
                      <span className="text-lg font-bold text-gray-800">{consumptionDiff.toFixed(2)} m³</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm font-medium text-gray-600">Limite Calculado ({LIMIT_FACTOR} x {totalPeople}):</span>
                      <span className="text-sm font-bold text-gray-800">{limit.toFixed(3)} m³</span>
                    </div>
                    {isExceeded && (
                      <div className="mt-3 flex items-start gap-2 text-red-700 text-xs font-bold">
                        <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                        <span>ATENÇÃO: O consumo excedeu o limite diário permitido. Justificativa obrigatória.</span>
                      </div>
                    )}
                  </div>

                  {isExceeded && (
                    <div className="space-y-4 animate-fadeIn">
                      <div>
                        <label className="block text-xs font-bold text-red-600 uppercase mb-1">Justificativa do Excesso *</label>
                        <textarea rows={2} value={formData.justification} onChange={(e) => setFormData({...formData, justification: e.target.value})} className="w-full p-2 border-2 border-red-100 rounded-lg text-sm focus:border-red-400 outline-none" placeholder="Por que houve excesso hoje?" />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-red-600 uppercase mb-1">Ação Corretiva *</label>
                        <textarea rows={2} value={formData.actionPlan} onChange={(e) => setFormData({...formData, actionPlan: e.target.value})} className="w-full p-2 border-2 border-red-100 rounded-lg text-sm focus:border-red-400 outline-none" placeholder="O que será feito para corrigir?" />
                      </div>
                    </div>
                  )}
                </div>

                <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex justify-end gap-3">
                  <button onClick={() => setIsModalOpen(false)} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-200 rounded-lg font-medium">Cancelar</button>
                  <button onClick={handleSave} disabled={saving} className={`px-6 py-2 text-sm text-white rounded-lg font-medium flex items-center gap-2 shadow-sm transition-colors ${isExceeded ? 'bg-red-600 hover:bg-red-700' : 'bg-blue-600 hover:bg-blue-700'}`}>{saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />} Salvar Registro</button>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
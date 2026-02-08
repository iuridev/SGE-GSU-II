import { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { 
  ClipboardCheck, Plus, Calendar as CalendarIcon, 
  ChevronLeft, ChevronRight, CheckCircle2, 
  AlertCircle, X, Search, Building2, 
  Loader2, 
  Check, Trash2, Clock, ListChecks, ArrowRight, FileDown,
  Ban, XCircle, Star
} from 'lucide-react';

interface MonitoringEvent {
  id: string;
  date: string;
  service_type: string;
  frequency: string;
}

interface MonitoringSubmission {
  event_id: string;
  school_id: string;
  is_completed: boolean;
  is_dispensed: boolean; 
  rating: number | null; // Campo de satisfação (0-10)
  school_name?: string;
  updated_at?: string;
}

const SERVICE_TYPES = ["LIMPEZA", "CUIDADOR", "MERENDA", "VIGILANTE", "TELEFONE"];
const MONTHS = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

export function Fiscalizacao() {
  const [userRole, setUserRole] = useState('');
  const [userSchoolId, setUserSchoolId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [events, setEvents] = useState<MonitoringEvent[]>([]);
  const [submissions, setSubmissions] = useState<MonitoringSubmission[]>([]);
  const [checklistSearch, setChecklistSearch] = useState('');
  
  // Administração
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isChecklistOpen, setIsChecklistOpen] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<MonitoringEvent | null>(null);
  const [schools, setSchools] = useState<any[]>([]);
  const [saveLoading, setSaveLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [newEvent, setNewEvent] = useState({
    date: new Date().toISOString().split('T')[0],
    service_type: 'LIMPEZA',
    frequency: 'MENSAL'
  });

  // Gestor / Calendário
  const [currentCalendarDate, setCurrentCalendarDate] = useState(new Date());

  useEffect(() => {
    fetchInitialData();
  }, []);

  async function fetchInitialData() {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: profile } = await (supabase as any).from('profiles').select('role, school_id').eq('id', user.id).single();
      setUserRole(profile?.role || '');
      setUserSchoolId(profile?.school_id || null);

      const { data: schoolsData } = await (supabase as any).from('schools').select('id, name').order('name');
      setSchools(schoolsData || []);

      await fetchEvents();
    } catch (error) { 
      console.error("Erro ao inicializar dados de fiscalização:", error); 
    } finally { 
      setLoading(false); 
    }
  }

  async function fetchEvents() {
    const { data: eventsData } = await (supabase as any).from('monitoring_events').select('*').order('date', { ascending: false });
    setEvents(eventsData || []);
    
    const { data: subsData } = await (supabase as any).from('monitoring_submissions').select('*');
    setSubmissions(subsData || []);
  }

  async function handleCreateEvent(e: React.FormEvent) {
    e.preventDefault();
    setSaveLoading(true);
    try {
      const { data: event, error: eventError } = await (supabase as any).from('monitoring_events').insert([newEvent]).select().single();
      if (eventError) throw eventError;

      const subs = schools.map(s => ({
        event_id: event.id,
        school_id: s.id,
        is_completed: false,
        is_dispensed: false,
        rating: null
      }));
      await (supabase as any).from('monitoring_submissions').insert(subs);

      setIsModalOpen(false);
      fetchEvents();
    } catch (err: any) { alert(err.message); } finally { setSaveLoading(false); }
  }

  async function updateSubmission(schoolId: string, eventId: string, updates: Partial<MonitoringSubmission>) {
    try {
      await (supabase as any)
        .from('monitoring_submissions')
        .update(updates)
        .eq('event_id', eventId)
        .eq('school_id', schoolId);
      
      setSubmissions(prev => prev.map(s => 
        (s.school_id === schoolId && s.event_id === eventId) 
        ? { ...s, ...updates } 
        : s
      ));
    } catch (err) { console.error(err); }
  }

  async function handleSelectAll(eventId: string) {
    if (!confirm("Deseja marcar TODAS as unidades como CONCLUÍDAS?")) return;
    setSaveLoading(true);
    try {
      await (supabase as any)
        .from('monitoring_submissions')
        .update({ is_completed: true, is_dispensed: false, rating: 10 }) 
        .eq('event_id', eventId);
      
      await fetchEvents();
    } catch (err) {
      console.error(err);
    } finally {
      setSaveLoading(false);
    }
  }

  async function handleDispenseAll(eventId: string) {
    if (!confirm("Deseja marcar TODAS as unidades como DISPENSADAS?")) return;
    setSaveLoading(true);
    try {
      await (supabase as any)
        .from('monitoring_submissions')
        .update({ is_completed: false, is_dispensed: true, rating: null }) 
        .eq('event_id', eventId);
      
      await fetchEvents();
    } catch (err) {
      console.error(err);
    } finally {
      setSaveLoading(false);
    }
  }

  async function handleDeleteEvent(id: string) {
    if (!confirm("Excluir este agendamento?")) return;
    await (supabase as any).from('monitoring_events').delete().eq('id', id);
    fetchEvents();
  }

  const calculateAverageRating = (eventId: string) => {
    const eventSubs = submissions.filter(s => s.event_id === eventId && s.is_completed && s.rating !== null);
    if (eventSubs.length === 0) return 0;
    const sum = eventSubs.reduce((acc, curr) => acc + (curr.rating || 0), 0);
    return sum / eventSubs.length;
  };

  const getRatingColor = (rating: number) => {
    if (rating >= 8) return 'text-emerald-500 bg-emerald-50 border-emerald-100';
    if (rating >= 5) return 'text-amber-500 bg-amber-50 border-amber-100';
    return 'text-red-500 bg-red-50 border-red-100';
  };

  const handleExportPDF = async (event: MonitoringEvent) => {
    setExporting(true);
    setSelectedEvent(event);
    try {
      await new Promise(resolve => setTimeout(resolve, 800));
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
      
      const element = document.getElementById('regional-monitoring-pdf-template');
      if (!element) throw new Error("Template não encontrado.");
      
      element.style.display = 'block';
      const opt = {
        margin: [15, 15, 15, 15],
        filename: `Relatorio_Fiscalizacao_${event.service_type}_${event.date}.pdf`,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true, letterRendering: true, scrollY: 0 },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
      };
      await (window as any).html2pdf().set(opt).from(element).save();
      element.style.display = 'none';
      setExporting(false);
    } catch (err) {
      console.error(err);
      alert("Erro ao gerar o relatório PDF.");
      setExporting(false);
    }
  };

  const filteredEventsForCurrentMonth = useMemo(() => {
    const currentMonth = currentCalendarDate.getMonth();
    const currentYear = currentCalendarDate.getFullYear();
    return events.filter(e => {
      const d = new Date(e.date + 'T12:00:00');
      return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
    });
  }, [events, currentCalendarDate]);

  const taskList = useMemo(() => {
    if (userRole !== 'school_manager') return [];
    return filteredEventsForCurrentMonth
      .map(e => {
        const sub = submissions.find(s => s.event_id === e.id && s.school_id === userSchoolId);
        return {
          ...e,
          is_completed: sub?.is_completed || false,
          is_dispensed: sub?.is_dispensed || false,
          rating: sub?.rating || null
        };
      })
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }, [filteredEventsForCurrentMonth, submissions, userSchoolId, userRole]);

  const filteredSchoolsInChecklist = useMemo(() => {
    return schools.filter(s => s.name.toLowerCase().includes(checklistSearch.toLowerCase()));
  }, [schools, checklistSearch]);

  const renderCalendar = () => {
    const year = currentCalendarDate.getFullYear();
    const month = currentCalendarDate.getMonth();
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    
    const days = [];
    for (let i = 0; i < firstDay; i++) days.push(<div key={`empty-${i}`} className="bg-slate-50/20" />);
    
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const dayEvents = events.filter(e => e.date === dateStr);
      const isToday = dateStr === todayStr;
      
      days.push(
        <div key={d} className={`min-h-[120px] md:min-h-[140px] border border-slate-100 p-3 relative transition-all group overflow-hidden flex flex-col ${isToday ? 'bg-indigo-50/30' : 'bg-white hover:bg-slate-50'}`}>
          <div className="flex justify-between items-center mb-2">
            <span className={`text-sm font-black px-2.5 py-1 rounded-lg ${isToday ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-400 group-hover:text-slate-600'}`}>
              {d}
            </span>
            {isToday && <span className="text-[8px] font-black text-indigo-500 uppercase tracking-[0.2em] animate-pulse">Hoje</span>}
          </div>
          
          <div className="flex-1 space-y-1.5 overflow-y-auto custom-scrollbar-thin">
            {dayEvents.map(e => {
              const sub = submissions.find(s => s.event_id === e.id && s.school_id === userSchoolId);
              const isOk = sub?.is_completed;
              const isDisp = sub?.is_dispensed;
              return (
                <div key={e.id} className={`p-2 rounded-xl text-[9px] font-black uppercase flex flex-col gap-1 border shadow-sm transition-transform hover:scale-[1.02] ${isOk ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : isDisp ? 'bg-slate-100 border-slate-200 text-slate-500' : 'bg-red-50 border-red-200 text-red-600 animate-in zoom-in-95'}`}>
                  <div className="flex items-center gap-1.5">
                    {isOk ? <CheckCircle2 size={10} className="shrink-0"/> : isDisp ? <XCircle size={10} className="shrink-0"/> : <AlertCircle size={10} className="shrink-0"/>}
                    <span className="truncate">{e.service_type}</span>
                  </div>
                  <div className="flex justify-between items-center opacity-60">
                    <span className="text-[7px]">{isDisp ? 'DISPENSADO' : e.frequency}</span>
                    {isOk && sub.rating !== null && (
                        <span className="flex items-center gap-0.5 text-emerald-600"><Star size={8} fill="currentColor"/> {sub.rating}</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      );
    }

    return (
      <div className="grid grid-cols-7 gap-px bg-slate-200 rounded-[3rem] overflow-hidden border border-slate-200 shadow-2xl">
        {['DOMINGO', 'SEGUNDA', 'TERÇA', 'QUARTA', 'QUINTA', 'SEXTA', 'SÁBADO'].map(day => (
          <div key={day} className="bg-slate-50 py-5 text-center text-[10px] font-black text-slate-400 uppercase tracking-[0.3em]">{window.innerWidth < 768 ? day.substring(0,3) : day}</div>
        ))}
        {days}
      </div>
    );
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-40 gap-4">
        <Loader2 className="animate-spin text-indigo-600" size={48} />
        <p className="font-black text-slate-400 uppercase tracking-widest text-xs">Sincronizando Monitoramento...</p>
      </div>
    );
  }

  return (
    <div className="space-y-10 pb-20">
      {/* HEADER */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="flex items-center gap-5">
          <div className="p-4 bg-indigo-600 rounded-[2rem] text-white shadow-2xl shadow-indigo-100">
            <ClipboardCheck size={36} />
          </div>
          <div>
            <h1 className="text-3xl font-black text-slate-900 tracking-tight uppercase leading-none">Fiscalização de Serviços</h1>
            <p className="text-slate-500 font-medium mt-1 uppercase text-xs tracking-widest italic">Monitoramento de conformidade da rede escolar</p>
          </div>
        </div>
        
        {userRole === 'regional_admin' && (
          <button 
            onClick={() => setIsModalOpen(true)}
            className="bg-indigo-600 hover:bg-indigo-700 text-white px-10 py-5 rounded-[2rem] font-black flex items-center gap-3 shadow-2xl transition-all active:scale-95 group"
          >
            <Plus size={20} className="group-hover:rotate-90 transition-transform" /> AGENDAR NOVO MONITORAMENTO
          </button>
        )}
      </div>

      {/* CALENDÁRIO */}
      <div className="bg-white p-10 rounded-[4rem] border border-slate-100 shadow-[0_32px_64px_-12px_rgba(0,0,0,0.08)] overflow-hidden">
        <div className="flex flex-col md:flex-row items-center justify-between mb-12 gap-8">
            <div className="flex items-center gap-6">
              <button onClick={() => setCurrentCalendarDate(new Date(currentCalendarDate.setMonth(currentCalendarDate.getMonth() - 1)))} className="p-5 hover:bg-slate-100 rounded-full border border-slate-100 text-slate-400 transition-all active:scale-90 hover:text-indigo-600"><ChevronLeft size={28}/></button>
              <div className="text-center min-w-[240px]">
                <h2 className="text-5xl font-black text-slate-900 uppercase tracking-tighter leading-none">{MONTHS[currentCalendarDate.getMonth()]}</h2>
                <div className="flex items-center justify-center gap-3 mt-2">
                   <div className="h-0.5 w-8 bg-indigo-600 rounded-full"></div>
                   <span className="text-indigo-600 font-black text-sm tracking-[0.6em] uppercase">{currentCalendarDate.getFullYear()}</span>
                   <div className="h-0.5 w-8 bg-indigo-600 rounded-full"></div>
                </div>
              </div>
              <button onClick={() => setCurrentCalendarDate(new Date(currentCalendarDate.setMonth(currentCalendarDate.getMonth() + 1)))} className="p-5 hover:bg-slate-100 rounded-full border border-slate-100 text-slate-400 transition-all active:scale-90 hover:text-indigo-600"><ChevronRight size={28}/></button>
            </div>
            
            <div className="flex flex-wrap items-center justify-center gap-4">
              <div className="px-6 py-3 bg-slate-50 rounded-2xl flex gap-8 border border-slate-100 shadow-inner">
                <div className="flex items-center gap-2.5 text-[10px] font-black text-emerald-600 uppercase tracking-widest"><div className="w-3 h-3 rounded-full bg-emerald-500 shadow-sm shadow-emerald-200"/> Concluído</div>
                <div className="flex items-center gap-2.5 text-[10px] font-black text-slate-400 uppercase tracking-widest"><div className="w-3 h-3 rounded-full bg-slate-300 shadow-sm"/> Dispensada</div>
                <div className="flex items-center gap-2.5 text-[10px] font-black text-red-500 uppercase tracking-widest"><div className="w-3 h-3 rounded-full bg-red-500 animate-pulse shadow-sm shadow-red-200"/> Pendente</div>
              </div>
              <button onClick={() => setCurrentCalendarDate(new Date())} className="px-8 py-3 bg-indigo-50 text-indigo-600 rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-indigo-600 hover:text-white transition-all">Ir para Hoje</button>
            </div>
        </div>
        
        {renderCalendar()}
      </div>

      {/* DETALHES / CONTROLE */}
      <div className="animate-in slide-in-from-bottom-6 duration-700">
        {userRole === 'school_manager' ? (
          <div className="bg-white p-10 rounded-[3.5rem] border border-slate-100 shadow-2xl">
            <div className="flex items-center gap-4 mb-10 border-b border-slate-100 pb-6">
              <div className="p-4 bg-indigo-600 rounded-3xl text-white shadow-xl"><ListChecks size={28}/></div>
              <div>
                <h2 className="text-2xl font-black text-slate-800 uppercase tracking-tight">Agenda de Compromissos</h2>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Compromissos do mês de {MONTHS[currentCalendarDate.getMonth()]}</p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {taskList.length === 0 ? (
                <div className="col-span-full py-24 text-center">
                  <div className="w-20 h-20 bg-slate-50 text-slate-200 rounded-full flex items-center justify-center mx-auto mb-4"><Clock size={40}/></div>
                  <p className="text-slate-300 font-black uppercase text-xs tracking-widest">Nenhuma tarefa agendada para este mês</p>
                </div>
              ) : taskList.map(task => (
                <div key={task.id} className={`p-6 rounded-[2.5rem] border-2 flex flex-col justify-between h-48 transition-all hover:shadow-2xl ${task.is_completed || task.is_dispensed ? 'bg-slate-50 border-slate-100 opacity-70' : 'bg-white border-red-50 ring-4 ring-red-50/30'}`}>
                  <div className="flex items-start justify-between">
                    <div className={`w-14 h-14 rounded-2xl flex items-center justify-center text-white shadow-lg ${task.is_completed ? 'bg-emerald-500' : task.is_dispensed ? 'bg-slate-400' : 'bg-red-600 animate-pulse'}`}>
                      {task.is_completed ? <Check size={28}/> : task.is_dispensed ? <XCircle size={28}/> : <AlertCircle size={28}/>}
                    </div>
                    <span className={`text-[9px] font-black px-3 py-1 rounded-full uppercase tracking-widest ${task.is_completed ? 'bg-emerald-100 text-emerald-700' : task.is_dispensed ? 'bg-slate-200 text-slate-600' : 'bg-red-100 text-red-700'}`}>
                       {task.is_completed ? 'ENTREGUE' : task.is_dispensed ? 'DISPENSADA' : 'PENDENTE'}
                    </span>
                  </div>
                  <div>
                    <h4 className="font-black uppercase text-lg leading-none tracking-tight mb-1 text-slate-800">{task.service_type}</h4>
                    <div className="flex items-center gap-2 text-slate-400 font-bold text-[10px] uppercase tracking-widest">
                       <CalendarIcon size={12} className="text-indigo-500"/> Vence em: {new Date(task.date + 'T12:00:00').toLocaleDateString()}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="bg-slate-900 p-12 rounded-[4rem] shadow-2xl text-white relative overflow-hidden">
             <div className="absolute top-0 right-0 p-12 opacity-5 pointer-events-none">
                <ClipboardCheck size={280} />
             </div>
             
             <div className="flex flex-col md:flex-row items-center justify-between gap-6 mb-12 relative z-10">
                <div className="flex items-center gap-5">
                  <div className="p-4 bg-white/10 text-amber-400 rounded-[1.5rem] shadow-2xl"><ClipboardCheck size={36}/></div>
                  <div>
                      <h2 className="text-3xl font-black uppercase tracking-tight">Controle Regional</h2>
                      <p className="text-[10px] text-white/40 font-bold uppercase tracking-[0.2em] mt-1">Auditória em Tempo Real e Grau de Satisfação</p>
                  </div>
                </div>
                <div className="bg-white/5 border border-white/10 px-8 py-4 rounded-[2rem] flex gap-10">
                   <div className="text-center">
                      <p className="text-[9px] font-black text-white/40 uppercase tracking-widest">Rede Total</p>
                      <h4 className="text-2xl font-black flex items-center gap-2"><Building2 size={24} className="text-indigo-400"/> {schools.length} Escolas</h4>
                   </div>
                   <div className="w-px h-8 bg-white/10 self-center"></div>
                   <div className="text-center">
                      <p className="text-[9px] font-black text-amber-500 uppercase tracking-widest">Eventos de {MONTHS[currentCalendarDate.getMonth()]}</p>
                      <h4 className="text-2xl font-black">{filteredEventsForCurrentMonth.length} Tipos</h4>
                   </div>
                </div>
             </div>
             
             <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 relative z-10">
               {filteredEventsForCurrentMonth.map(e => {
                 const total = schools.length;
                 const completedOrDispensed = submissions.filter(s => s.event_id === e.id && (s.is_completed || s.is_dispensed)).length;
                 const pct = total > 0 ? (completedOrDispensed / total) * 100 : 0;
                 const avgSatisfaction = calculateAverageRating(e.id);
                 
                 return (
                   <div key={e.id} className="bg-white/5 border border-white/10 p-8 rounded-[3rem] space-y-6 transition-all hover:bg-white/10 hover:border-indigo-500/50 group shadow-xl">
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="flex items-center gap-2">
                             <span className="text-[10px] font-black text-amber-500 bg-amber-500/10 px-2 py-0.5 rounded-lg uppercase tracking-widest">{e.frequency}</span>
                             <span className="text-[10px] font-black text-white/30">•</span>
                             <span className="text-[10px] font-black text-indigo-400 uppercase tracking-widest flex items-center gap-1.5 bg-indigo-500/10 px-2 py-0.5 rounded-lg">
                                <CalendarIcon size={12}/> {new Date(e.date + 'T12:00:00').toLocaleDateString()}
                             </span>
                          </div>
                          <h4 className="font-black uppercase text-xl mt-3 tracking-tight group-hover:text-indigo-400 transition-colors leading-none">{e.service_type}</h4>
                        </div>
                        <button 
                          onClick={() => { setSelectedEvent(e); setIsChecklistOpen(true); }}
                          className="p-4 bg-white/5 hover:bg-indigo-600 rounded-3xl transition-all text-white shadow-xl active:scale-90"
                        ><ArrowRight size={24}/></button>
                      </div>
                      
                      <div className="space-y-4">
                         <div className="flex justify-between items-end">
                            <div className="space-y-1">
                                <p className="text-[9px] font-black text-white/40 uppercase tracking-widest">Satisfação Média</p>
                                <div className="flex items-center gap-2">
                                   <div className={`px-2 py-1 rounded-lg text-lg font-black ${avgSatisfaction >= 8 ? 'bg-emerald-500/20 text-emerald-400' : avgSatisfaction >= 5 ? 'bg-amber-500/20 text-amber-400' : 'bg-red-500/20 text-red-400'}`}>
                                      {avgSatisfaction.toFixed(1)}
                                   </div>
                                   <div className="flex gap-0.5">
                                      {Array.from({length: 5}).map((_, i) => (
                                        <Star key={i} size={10} className={i < Math.round(avgSatisfaction / 2) ? 'text-amber-400 fill-amber-400' : 'text-white/10'} />
                                      ))}
                                   </div>
                                </div>
                            </div>
                            <div className="text-right">
                               <p className="text-[9px] font-black text-white/40 uppercase tracking-widest">Adesão</p>
                               <span className="text-sm font-black text-indigo-400">{Math.round(pct)}%</span>
                            </div>
                         </div>

                         <div className="h-2 bg-white/5 rounded-full overflow-hidden border border-white/5 p-0.5">
                            <div className={`h-full transition-all duration-1000 ease-out rounded-full ${pct > 80 ? 'bg-emerald-50 shadow-[0_0_15px_rgba(16,185,129,0.3)]' : 'bg-indigo-50 shadow-[0_0_15px_rgba(99,102,241,0.3)]'}`} style={{ width: `${pct}%` }} />
                         </div>
                      </div>
                   </div>
                 );
               })}
               {filteredEventsForCurrentMonth.length === 0 && <div className="col-span-full py-20 text-center opacity-20 border-2 border-dashed border-white/10 rounded-[3rem]"><p className="text-sm font-black uppercase tracking-widest">Nenhum evento agendado para o mês de {MONTHS[currentCalendarDate.getMonth()]}.</p></div>}
             </div>
          </div>
        )}
      </div>

      {/* Modal Novo Agendamento */}
      {isModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/80 backdrop-blur-sm p-4">
          <div className="bg-white rounded-[3rem] w-full max-w-md shadow-2xl overflow-hidden border border-white animate-in zoom-in-95 duration-200">
             <div className="p-8 border-b bg-indigo-50 text-indigo-700 flex justify-between items-center">
                <div className="flex items-center gap-4">
                   <div className="w-12 h-12 bg-indigo-600 rounded-2xl flex items-center justify-center text-white shadow-lg"><Plus size={24}/></div>
                   <div>
                      <h2 className="text-xl font-black uppercase tracking-tight leading-none">Novo Monitoramento</h2>
                      <p className="text-[10px] text-indigo-400 font-bold uppercase tracking-widest mt-1">Definir Prazo para a Rede</p>
                   </div>
                </div>
                <button onClick={() => setIsModalOpen(false)} className="p-2 hover:bg-white rounded-full transition-colors text-slate-400"><X size={24}/></button>
             </div>
             <form onSubmit={handleCreateEvent} className="p-8 space-y-6">
                <div className="space-y-2">
                   <label className="text-[10px] font-black text-slate-400 uppercase ml-1">Tipo de Serviço</label>
                   <select required className="w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl font-bold text-slate-700 outline-none focus:border-indigo-600 transition-all" value={newEvent.service_type} onChange={e => setNewEvent({...newEvent, service_type: e.target.value})}>
                      {SERVICE_TYPES.map(s => <option key={s} value={s}>{s}</option>)}
                   </select>
                </div>
                <div className="space-y-2">
                   <label className="text-[10px] font-black text-slate-400 uppercase ml-1">Frequência da Fiscalização</label>
                   <select className="w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl font-bold text-slate-700 outline-none focus:border-indigo-600 transition-all" value={newEvent.frequency} onChange={e => setNewEvent({...newEvent, frequency: e.target.value})}>
                      <option value="MENSAL">MENSAL</option>
                      <option value="SEMANAL">SEMANAL</option>
                      <option value="AVULSO">AVULSO (ÚNICO)</option>
                   </select>
                </div>
                <div className="space-y-2">
                   <label className="text-[10px] font-black text-slate-400 uppercase ml-1">Data Limite de Entrega</label>
                   <input type="date" required className="w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl font-black text-slate-700 outline-none focus:border-indigo-600 transition-all" value={newEvent.date} onChange={e => setNewEvent({...newEvent, date: e.target.value})} />
                </div>
                <button type="submit" disabled={saveLoading} className="w-full py-5 bg-indigo-600 text-white rounded-[1.5rem] font-black shadow-xl shadow-indigo-100 hover:bg-indigo-700 transition-all flex justify-center items-center gap-2 uppercase tracking-widest text-xs">
                   {saveLoading ? <Loader2 className="animate-spin"/> : 'ATIVAR NO CRONOGRAMA'}
                </button>
             </form>
          </div>
        </div>
      )}

      {/* Modal Checklist Regional */}
      {isChecklistOpen && selectedEvent && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/90 backdrop-blur-xl p-4">
          <div className="bg-white rounded-[3.5rem] w-full max-w-6xl max-h-[90vh] shadow-2xl overflow-hidden border border-white animate-in zoom-in-95 duration-200 flex flex-col">
             <div className="p-10 border-b bg-slate-900 text-white flex justify-between items-center">
                <div className="flex items-center gap-6">
                   <div className="w-16 h-16 bg-indigo-500 rounded-[1.8rem] flex items-center justify-center text-white shadow-2xl"><ClipboardCheck size={32}/></div>
                   <div>
                      <h2 className="text-3xl font-black uppercase leading-none tracking-tight">{selectedEvent.service_type}</h2>
                      <div className="flex items-center gap-3 mt-2">
                        <span className="text-[10px] font-black text-indigo-400 uppercase tracking-widest bg-white/5 px-3 py-1 rounded-lg">Prazo: {new Date(selectedEvent.date + 'T12:00:00').toLocaleDateString()}</span>
                        
                        <div className="flex items-center gap-2 ml-4">
                          <button 
                            onClick={() => handleSelectAll(selectedEvent.id)}
                            className="text-[10px] font-black text-emerald-400 uppercase tracking-widest bg-white/10 px-3 py-1 rounded-lg hover:bg-emerald-500 hover:text-white transition-all shadow-sm"
                          >
                             Mapear Todas como OK (Nota 10)
                          </button>
                          <button 
                            onClick={() => handleDispenseAll(selectedEvent.id)}
                            className="text-[10px] font-black text-slate-400 uppercase tracking-widest bg-white/10 px-3 py-1 rounded-lg hover:bg-slate-500 hover:text-white transition-all shadow-sm"
                          >
                             Dispensar Todas
                          </button>
                        </div>
                      </div>
                   </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="relative group">
                    <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
                    <input 
                      type="text" 
                      placeholder="Filtrar Escolas..." 
                      className="bg-white/10 border border-white/5 rounded-xl pl-9 pr-4 py-2 text-xs font-bold text-white outline-none focus:bg-white/20 transition-all w-48"
                      value={checklistSearch}
                      onChange={(e) => setChecklistSearch(e.target.value)}
                    />
                  </div>
                  <button onClick={() => handleExportPDF(selectedEvent)} disabled={exporting} className="px-8 py-4 bg-white/10 hover:bg-white/20 rounded-[1.5rem] text-white transition-all flex items-center gap-3 text-[11px] font-black uppercase tracking-widest shadow-lg border border-white/5">
                    {exporting ? <Loader2 className="animate-spin" size={18}/> : <FileDown size={18}/>} GERAR PDF DA REDE
                  </button>
                  <button onClick={() => setIsChecklistOpen(false)} className="p-4 hover:bg-white/10 rounded-full transition-colors text-slate-400"><X size={32}/></button>
                </div>
             </div>
             
             <div className="p-10 overflow-y-auto flex-1 custom-scrollbar bg-slate-50/50">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                   {filteredSchoolsInChecklist.map(school => {
                      const sub = submissions.find(s => s.event_id === selectedEvent.id && s.school_id === school.id);
                      const isOk = sub?.is_completed;
                      const isDisp = sub?.is_dispensed;
                      const currentRating = sub?.rating || 0;

                      return (
                        <div key={school.id} className={`p-6 rounded-[2.5rem] border-2 transition-all flex flex-col justify-between group shadow-lg ${isOk ? 'bg-white border-emerald-200 ring-4 ring-emerald-50/50' : isDisp ? 'bg-slate-100 border-slate-200 opacity-60' : 'bg-white border-slate-100 hover:border-indigo-400'}`}>
                           <div className="flex items-center justify-between mb-4">
                              <div className="flex items-center gap-4">
                                <div className={`w-11 h-11 rounded-[1.2rem] flex items-center justify-center transition-all shadow-md ${isOk ? 'bg-emerald-500 text-white' : isDisp ? 'bg-slate-300 text-slate-600' : 'bg-slate-100 text-slate-300 group-hover:bg-indigo-100 group-hover:text-indigo-600'}`}>
                                  {isOk ? <Check size={24}/> : isDisp ? <XCircle size={24}/> : <Clock size={24}/>}
                                </div>
                                <span className={`text-[11px] font-black uppercase leading-tight mt-1.5 ${isOk ? 'text-emerald-800' : isDisp ? 'text-slate-500' : 'text-slate-600'}`}>{school.name}</span>
                              </div>
                              <span className={`text-[9px] font-black px-4 py-1.5 rounded-full uppercase tracking-widest ${isOk ? 'bg-emerald-200 text-emerald-700' : isDisp ? 'bg-slate-300 text-slate-700' : 'bg-slate-100 text-slate-400'}`}>
                                 {isOk ? 'COMPROVADO' : isDisp ? 'DISPENSADA' : 'PENDENTE'}
                              </span>
                           </div>

                           <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-center border-t border-slate-50 pt-4">
                              {/* Controle de Satisfação */}
                              <div className={`space-y-2 transition-opacity ${!isOk ? 'opacity-30 pointer-events-none' : 'opacity-100'}`}>
                                 <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">Grau de Satisfação (0-10)</p>
                                 <div className="flex items-center gap-2">
                                    <input 
                                      type="range" min="0" max="10" step="1" 
                                      className="flex-1 accent-indigo-600"
                                      value={currentRating}
                                      onChange={(e) => updateSubmission(school.id, selectedEvent.id, { rating: Number(e.target.value) })}
                                    />
                                    <span className={`w-10 h-10 rounded-xl flex items-center justify-center font-black text-lg ${getRatingColor(currentRating)} shadow-sm`}>
                                      {currentRating}
                                    </span>
                                 </div>
                              </div>

                              <div className="flex justify-end gap-2">
                                 <button 
                                  onClick={() => updateSubmission(school.id, selectedEvent.id, { is_completed: !isOk, is_dispensed: false, rating: !isOk ? 10 : null })}
                                  className={`flex-1 py-3 rounded-2xl border-2 font-black text-[10px] uppercase transition-all flex items-center justify-center gap-2 ${isOk ? 'bg-emerald-500 border-emerald-600 text-white' : 'bg-white border-slate-200 text-slate-400 hover:border-emerald-500 hover:text-emerald-500'}`}
                                 >
                                    <Check size={16}/> {isOk ? 'Dêsfazer' : 'Confirmar'}
                                 </button>
                                 <button 
                                  onClick={() => updateSubmission(school.id, selectedEvent.id, { is_dispensed: !isDisp, is_completed: false, rating: null })}
                                  className={`px-4 py-3 rounded-2xl border-2 transition-all ${isDisp ? 'bg-slate-500 border-slate-600 text-white' : 'bg-white border-slate-200 text-slate-400 hover:border-red-500 hover:text-red-500'}`}
                                 >
                                    <Ban size={16}/>
                                 </button>
                              </div>
                           </div>
                        </div>
                      );
                   })}
                </div>
             </div>
             
             <div className="p-10 border-t bg-white flex justify-between items-center">
                <button onClick={() => handleDeleteEvent(selectedEvent.id)} className="px-8 py-5 text-red-500 font-black uppercase text-[10px] tracking-widest hover:bg-red-50 rounded-[1.5rem] transition-colors flex items-center gap-2"><Trash2 size={18}/> Excluir Agendamento</button>
                <button onClick={() => setIsChecklistOpen(false)} className="px-16 py-6 bg-slate-900 text-white rounded-[2rem] font-black uppercase text-sm shadow-2xl active:scale-95 transition-all hover:bg-black">FINALIZAR CONFERÊNCIA</button>
             </div>
          </div>
        </div>
      )}

      {/* --- TEMPLATE PARA PDF --- */}
      {selectedEvent && (
        <div id="regional-monitoring-pdf-template" style={{ display: 'none', background: 'white', width: '700px', minHeight: '900px', padding: '50px', fontFamily: 'sans-serif' }}>
          <div style={{ borderBottom: '6px solid #1e293b', paddingBottom: '20px', marginBottom: '30px' }}>
             <table style={{ width: '100%' }}>
                <tbody>
                  <tr>
                    <td>
                      <h1 style={{ margin: 0, fontSize: '22px', fontWeight: 900, color: '#0f172a' }}>RELATÓRIO TÉCNICO DE FISCALIZAÇÃO</h1>
                      <p style={{ margin: '5px 0 0', fontSize: '10px', color: '#64748b', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '2px' }}>Gestão de Contratos e Qualidade • Regional II</p>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <div style={{ background: '#1e293b', color: 'white', padding: '8px 20px', borderRadius: '10px', fontSize: '10px', fontWeight: 900 }}>SGE-GSU Intelligence</div>
                      <p style={{ margin: '5px 0 0', fontSize: '12px', fontWeight: 900, color: '#4f46e5' }}>Ref: {selectedEvent.service_type}</p>
                    </td>
                  </tr>
                </tbody>
             </table>
          </div>

          <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: '10px', marginBottom: '30px' }}>
            <tbody>
              <tr>
                <td style={{ background: '#f8fafc', padding: '20px', borderRadius: '20px', border: '1px solid #e2e8f0' }}>
                   <p style={{ margin: 0, fontSize: '9px', fontWeight: 900, color: '#64748b', textTransform: 'uppercase' }}>Vencimento</p>
                   <h3 style={{ margin: '5px 0 0', fontSize: '16px', fontWeight: 900, color: '#0f172a' }}>{new Date(selectedEvent.date + 'T12:00:00').toLocaleDateString('pt-BR')}</h3>
                </td>
                <td style={{ background: '#eff6ff', padding: '20px', borderRadius: '20px', border: '1px solid #bfdbfe', textAlign: 'center' }}>
                   <p style={{ margin: 0, fontSize: '9px', fontWeight: 900, color: '#1e40af', textTransform: 'uppercase' }}>Satisfação Média</p>
                   <h3 style={{ margin: '5px 0 0', fontSize: '18px', fontWeight: 900, color: '#1e3a8a' }}>
                      {calculateAverageRating(selectedEvent.id).toFixed(1)} / 10.0
                   </h3>
                </td>
                <td style={{ background: '#f8fafc', padding: '20px', borderRadius: '20px', border: '1px solid #e2e8f0', textAlign: 'center' }}>
                   <p style={{ margin: 0, fontSize: '9px', fontWeight: 900, color: '#64748b', textTransform: 'uppercase' }}>Cobertura OK</p>
                   <h3 style={{ margin: '5px 0 0', fontSize: '16px', fontWeight: 900, color: '#0f172a' }}>
                      {Math.round((submissions.filter(s => s.event_id === selectedEvent.id && (s.is_completed || s.is_dispensed)).length / schools.length) * 100)}%
                   </h3>
                </td>
              </tr>
            </tbody>
          </table>

          <div style={{ marginBottom: '40px' }}>
             <h4 style={{ margin: '0 0 15px 0', fontSize: '11px', fontWeight: 900, color: '#1e293b', textTransform: 'uppercase', borderBottom: '2px solid #f1f5f9', paddingBottom: '10px' }}>Situação Detalhada das Unidades</h4>
             <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: '#f1f5f9' }}>
                    <th style={{ padding: '12px', border: '1px solid #cbd5e1', textAlign: 'left', fontSize: '9px', fontWeight: 900 }}>ESCOLA</th>
                    <th style={{ padding: '12px', border: '1px solid #cbd5e1', textAlign: 'center', fontSize: '9px', fontWeight: 900 }}>STATUS</th>
                    <th style={{ padding: '12px', border: '1px solid #cbd5e1', textAlign: 'center', fontSize: '9px', fontWeight: 900 }}>NOTA</th>
                  </tr>
                </thead>
                <tbody>
                  {schools.map((school) => {
                    const sub = submissions.find(s => s.event_id === selectedEvent.id && s.school_id === school.id);
                    const isOk = sub?.is_completed;
                    const isDisp = sub?.is_dispensed;
                    return (
                      <tr key={school.id}>
                        <td style={{ padding: '10px', border: '1px solid #cbd5e1', fontSize: '10px', fontWeight: 700, textTransform: 'uppercase' }}>{school.name}</td>
                        <td style={{ padding: '10px', border: '1px solid #cbd5e1', textAlign: 'center', fontSize: '10px', fontWeight: 900, color: isOk ? '#059669' : isDisp ? '#64748b' : '#dc2626' }}>
                          {isOk ? 'FINALIZADO' : isDisp ? 'DISPENSADO' : 'PENDENTE'}
                        </td>
                        <td style={{ padding: '10px', border: '1px solid #cbd5e1', textAlign: 'center', fontSize: '10px', fontWeight: 900 }}>
                          {isOk && sub.rating !== null ? sub.rating.toFixed(1) : '---'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
             </table>
          </div>

          <div style={{ marginTop: 'auto', paddingTop: '50px', textAlign: 'center', borderTop: '2px solid #f1f5f9' }}>
             <p style={{ fontSize: '9px', color: '#94a3b8', fontWeight: 900, letterSpacing: '4px' }}>RELATÓRIO DE QUALIDADE GERADO PELO SISTEMA SGE-GSU</p>
             <p style={{ margin: '10px 0 0', fontSize: '8px', color: '#cbd5e1' }}>Emitido em {new Date().toLocaleString('pt-BR')}</p>
          </div>
        </div>
      )}
    </div>
  );
}

export default Fiscalizacao;
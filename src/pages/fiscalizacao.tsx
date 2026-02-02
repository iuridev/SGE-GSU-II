import { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { 
  ClipboardCheck, Plus, Calendar as CalendarIcon, 
  ChevronLeft, ChevronRight, CheckCircle2, 
  AlertCircle, X, 
  Loader2, MoreVertical,
  Check, Clock, ListChecks, FileDown
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

  // Gestor
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

      // Await fetchEvents to ensure loading state is handled correctly
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
        is_completed: false
      }));
      await (supabase as any).from('monitoring_submissions').insert(subs);

      setIsModalOpen(false);
      fetchEvents();
    } catch (err: any) { alert(err.message); } finally { setSaveLoading(false); }
  }

  async function toggleSubmission(schoolId: string, eventId: string, currentStatus: boolean) {
    try {
      await (supabase as any)
        .from('monitoring_submissions')
        .update({ is_completed: !currentStatus, updated_at: new Date().toISOString() })
        .eq('event_id', eventId)
        .eq('school_id', schoolId);
      
      setSubmissions(prev => prev.map(s => 
        (s.school_id === schoolId && s.event_id === eventId) 
        ? { ...s, is_completed: !currentStatus } 
        : s
      ));
    } catch (err) { console.error(err); }
  }

  async function handleDeleteEvent(id: string) {
    if (!confirm("Excluir este agendamento?")) return;
    await (supabase as any).from('monitoring_events').delete().eq('id', id);
    fetchEvents();
  }

  // --- Lógica de Exportação do Relatório Regional em PDF ---
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
      const fileNameStr = `Relatorio_Fiscalizacao_${event.service_type}_${event.date}.pdf`;
      
      const opt = {
        margin: [15, 15, 15, 15],
        filename: fileNameStr,
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

  // Estatísticas para o Gestor no mês atual
  const managerStats = useMemo(() => {
    if (userRole !== 'school_manager') return null;
    const currentMonth = currentCalendarDate.getMonth();
    const currentYear = currentCalendarDate.getFullYear();
    
    const monthEvents = events.filter(e => {
      const d = new Date(e.date + 'T12:00:00');
      return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
    });

    const pending = monthEvents.filter(e => {
      const sub = submissions.find(s => s.event_id === e.id && s.school_id === userSchoolId);
      return !sub?.is_completed;
    }).length;

    const completed = monthEvents.filter(e => {
      const sub = submissions.find(s => s.event_id === e.id && s.school_id === userSchoolId);
      return sub?.is_completed;
    }).length;

    return { total: monthEvents.length, pending, completed };
  }, [events, submissions, userSchoolId, currentCalendarDate, userRole]);

  // Lista de tarefas ordenada para o Gestor
  const taskList = useMemo(() => {
    if (userRole !== 'school_manager') return [];
    const currentMonth = currentCalendarDate.getMonth();
    return events
      .filter(e => new Date(e.date + 'T12:00:00').getMonth() === currentMonth)
      .map(e => ({
        ...e,
        is_completed: submissions.find(s => s.event_id === e.id && s.school_id === userSchoolId)?.is_completed || false
      }))
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }, [events, submissions, userSchoolId, currentCalendarDate, userRole]);

  const renderCalendar = () => {
    const year = currentCalendarDate.getFullYear();
    const month = currentCalendarDate.getMonth();
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    
    const days = [];
    for (let i = 0; i < firstDay; i++) days.push(<div key={`empty-${i}`} className="bg-slate-50/30" />);
    
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const dayEvents = events.filter(e => e.date === dateStr);
      
      days.push(
        <div key={d} className="min-h-[100px] border border-slate-100 p-2 relative bg-white transition-all group overflow-hidden">
          <span className={`text-[10px] font-black ${dayEvents.length > 0 ? 'text-indigo-600' : 'text-slate-300'}`}>{d}</span>
          <div className="mt-1 space-y-1">
            {dayEvents.map(e => {
              const sub = submissions.find(s => s.event_id === e.id && s.school_id === userSchoolId);
              const isOk = sub?.is_completed;
              return (
                <div key={e.id} className={`p-1.5 rounded-lg text-[7px] font-black uppercase flex items-center gap-1 border ${isOk ? 'bg-emerald-50 border-emerald-100 text-emerald-600' : 'bg-red-50 border-red-100 text-red-500'}`}>
                  {isOk ? <CheckCircle2 size={8}/> : <AlertCircle size={8}/>}
                  <span className="truncate">{e.service_type}</span>
                </div>
              );
            })}
          </div>
        </div>
      );
    }

    return (
      <div className="grid grid-cols-7 gap-px bg-slate-200 rounded-[2rem] overflow-hidden border border-slate-200 shadow-2xl">
        {['D', 'S', 'T', 'Q', 'Q', 'S', 'S'].map(day => (
          <div key={day} className="bg-slate-50 py-3 text-center text-[10px] font-black text-slate-400 uppercase tracking-widest">{day}</div>
        ))}
        {days}
      </div>
    );
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-32 gap-4">
        <Loader2 className="animate-spin text-indigo-600" size={48} />
        <p className="font-black text-slate-400 uppercase tracking-widest text-xs">Sincronizando Cronograma...</p>
      </div>
    );
  }

  return (
    <div className="space-y-8 pb-20">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="p-4 bg-indigo-600 rounded-3xl text-white shadow-xl shadow-indigo-100">
            <ClipboardCheck size={32} />
          </div>
          <div>
            <h1 className="text-3xl font-black text-slate-900 tracking-tight uppercase leading-none">Controle de Fiscalização</h1>
            <p className="text-slate-500 font-medium mt-1">Acompanhamento de conformidade de serviços terceirizados.</p>
          </div>
        </div>
        
        {userRole === 'regional_admin' && (
          <button 
            onClick={() => setIsModalOpen(true)}
            className="bg-indigo-600 hover:bg-indigo-700 text-white px-8 py-4 rounded-2xl font-black flex items-center gap-3 shadow-xl transition-all active:scale-95"
          >
            <Plus size={20} /> AGENDAR NOVA ENTREGA
          </button>
        )}
      </div>

      {userRole === 'school_manager' && managerStats && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
           <div className="bg-white p-6 rounded-[2.5rem] border-2 border-slate-100 shadow-xl flex items-center gap-4">
              <div className="w-14 h-14 bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center shadow-sm"><CalendarIcon size={24}/></div>
              <div>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none">Entregas no Mês</p>
                <h3 className="text-2xl font-black text-slate-800 mt-1">{managerStats.total} <span className="text-[10px] font-bold text-slate-400 uppercase ml-1">Prazos</span></h3>
              </div>
           </div>
           <div className={`p-6 rounded-[2.5rem] border-2 transition-all flex items-center gap-4 shadow-xl ${managerStats.pending > 0 ? 'bg-red-50 border-red-100 text-red-700' : 'bg-white border-slate-100'}`}>
              <div className={`w-14 h-14 rounded-2xl flex items-center justify-center shadow-sm ${managerStats.pending > 0 ? 'bg-red-500 text-white animate-pulse' : 'bg-slate-50 text-slate-400'}`}><Clock size={24}/></div>
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest leading-none opacity-60">Entregas Pendentes</p>
                <h3 className="text-2xl font-black mt-1">{managerStats.pending} <span className="text-[10px] font-bold uppercase ml-1">Faltantes</span></h3>
              </div>
           </div>
           <div className={`p-6 rounded-[2.5rem] border-2 transition-all flex items-center gap-4 shadow-xl ${managerStats.completed === managerStats.total && managerStats.total > 0 ? 'bg-emerald-50 border-emerald-100 text-emerald-700' : 'bg-white border-slate-100'}`}>
              <div className={`w-14 h-14 rounded-2xl flex items-center justify-center shadow-sm ${managerStats.completed === managerStats.total && managerStats.total > 0 ? 'bg-emerald-500 text-white' : 'bg-slate-50 text-slate-400'}`}><CheckCircle2 size={24}/></div>
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest leading-none opacity-60">Status de Entrega</p>
                <h3 className="text-2xl font-black mt-1">{managerStats.completed} <span className="text-[10px] font-bold uppercase ml-1">Concluídas</span></h3>
              </div>
           </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        <div className="lg:col-span-7 space-y-6">
          <div className="bg-white p-8 rounded-[3rem] border border-slate-100 shadow-2xl">
            <div className="flex items-center justify-between mb-8">
               <div className="flex items-center gap-4">
                  <button onClick={() => setCurrentCalendarDate(new Date(currentCalendarDate.setMonth(currentCalendarDate.getMonth() - 1)))} className="p-3 hover:bg-slate-50 rounded-2xl border border-slate-100 text-slate-400 transition-colors"><ChevronLeft/></button>
                  <div className="text-center min-w-[150px]">
                    <h2 className="text-2xl font-black text-slate-800 uppercase tracking-tighter leading-none">{MONTHS[currentCalendarDate.getMonth()]}</h2>
                    <span className="text-indigo-500 font-bold text-xs tracking-[0.2em]">{currentCalendarDate.getFullYear()}</span>
                  </div>
                  <button onClick={() => setCurrentCalendarDate(new Date(currentCalendarDate.setMonth(currentCalendarDate.getMonth() + 1)))} className="p-3 hover:bg-slate-50 rounded-2xl border border-slate-100 text-slate-400 transition-colors"><ChevronRight/></button>
               </div>
               <div className="flex items-center gap-2">
                 <div className="p-2 bg-slate-50 rounded-xl flex gap-3 px-4 border border-slate-100">
                    <div className="flex items-center gap-1.5 text-[9px] font-black text-emerald-600 uppercase"><div className="w-2 h-2 rounded-full bg-emerald-500"/> OK</div>
                    <div className="flex items-center gap-1.5 text-[9px] font-black text-red-500 uppercase"><div className="w-2 h-2 rounded-full bg-red-500 animate-pulse"/> Pendente</div>
                 </div>
               </div>
            </div>
            {renderCalendar()}
          </div>
        </div>

        <div className="lg:col-span-5 space-y-6">
          {userRole === 'school_manager' ? (
            <div className="bg-white p-8 rounded-[3rem] border border-slate-100 shadow-2xl h-full">
              <div className="flex items-center gap-3 mb-8">
                 <div className="p-2.5 bg-indigo-50 text-indigo-600 rounded-xl"><ListChecks size={20}/></div>
                 <h2 className="text-xl font-black text-slate-800 uppercase tracking-tight">Prazos de {MONTHS[currentCalendarDate.getMonth()]}</h2>
              </div>
              
              <div className="space-y-4">
                {taskList.length === 0 ? (
                  <div className="py-12 text-center">
                    <p className="text-slate-300 font-black uppercase text-[10px] tracking-widest">Sem fiscalizações neste mês</p>
                  </div>
                ) : taskList.map(task => (
                  <div key={task.id} className={`p-5 rounded-[1.8rem] border-2 flex items-center justify-between transition-all ${task.is_completed ? 'bg-slate-50/50 border-slate-100' : 'bg-white border-red-50 shadow-lg shadow-red-100/50'}`}>
                    <div className="flex items-center gap-4">
                      <div className={`w-12 h-12 rounded-2xl flex items-center justify-center text-white shadow-sm ${task.is_completed ? 'bg-emerald-500' : 'bg-red-500'}`}>
                        {task.is_completed ? <Check size={20}/> : <AlertCircle size={20}/>}
                      </div>
                      <div>
                        <h4 className={`font-black uppercase text-sm leading-none ${task.is_completed ? 'text-slate-400' : 'text-slate-800'}`}>{task.service_type}</h4>
                        <p className="text-[10px] font-bold text-slate-400 uppercase mt-1 flex items-center gap-1">
                          <CalendarIcon size={10}/> Entrega até {new Date(task.date + 'T12:00:00').toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                    <div className="flex flex-col items-end">
                      <span className={`text-[9px] font-black uppercase px-3 py-1 rounded-full ${task.is_completed ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-600'}`}>
                        {task.is_completed ? 'Finalizado' : 'Faltante'}
                      </span>
                      {task.is_completed && <span className="text-[8px] text-slate-300 font-bold mt-1">GSU/Regional</span>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="bg-slate-900 p-8 rounded-[3rem] shadow-2xl h-full text-white">
               <div className="flex items-center gap-3 mb-10">
                 <div className="p-2.5 bg-white/10 text-amber-400 rounded-xl"><ClipboardCheck size={20}/></div>
                 <h2 className="text-xl font-black uppercase tracking-tight">Controle Regional</h2>
               </div>
               
               <div className="space-y-4">
                 {events.slice(0, 5).map(e => {
                   const total = schools.length;
                   const completed = submissions.filter(s => s.event_id === e.id && s.is_completed).length;
                   const pct = (completed / total) * 100;
                   return (
                     <div key={e.id} className="bg-white/5 border border-white/10 p-5 rounded-[2rem] space-y-4">
                        <div className="flex items-center justify-between">
                          <div>
                            <span className="text-[8px] font-black text-amber-500 uppercase tracking-widest">{e.frequency}</span>
                            <h4 className="font-black uppercase text-sm leading-none mt-0.5">{e.service_type}</h4>
                          </div>
                          <button 
                            onClick={() => { setSelectedEvent(e); setIsChecklistOpen(true); }}
                            className="p-2 hover:bg-white/10 rounded-xl transition-all text-white/40 hover:text-white"
                          ><MoreVertical size={18}/></button>
                        </div>
                        <div className="space-y-1.5">
                           <div className="flex justify-between text-[9px] font-black uppercase tracking-widest text-white/40">
                              <span>Rede Escolar</span>
                              <span>{Math.round(pct)}% OK</span>
                           </div>
                           <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
                              <div className="h-full bg-indigo-500" style={{ width: `${pct}%` }} />
                           </div>
                        </div>
                     </div>
                   );
                 })}
                 {events.length > 5 && <div className="text-center pt-4 opacity-30 text-[9px] font-black uppercase">Ver todos no histórico</div>}
               </div>
            </div>
          )}
        </div>
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-white rounded-[3rem] w-full max-w-md shadow-2xl overflow-hidden border animate-in zoom-in-95">
             <div className="p-8 border-b bg-indigo-50 text-indigo-700 flex justify-between items-center">
                <h2 className="text-xl font-black uppercase tracking-tight">Novo Prazo de Entrega</h2>
                <button onClick={() => setIsModalOpen(false)}><X/></button>
             </div>
             <form onSubmit={handleCreateEvent} className="p-8 space-y-6">
                <div className="space-y-2">
                   <label className="text-[10px] font-black text-slate-400 uppercase ml-1">Tipo de Serviço</label>
                   <select required className="w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl font-bold" value={newEvent.service_type} onChange={e => setNewEvent({...newEvent, service_type: e.target.value})}>
                      {SERVICE_TYPES.map(s => <option key={s} value={s}>{s}</option>)}
                   </select>
                </div>
                <div className="space-y-2">
                   <label className="text-[10px] font-black text-slate-400 uppercase ml-1">Frequência</label>
                   <select className="w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl font-bold" value={newEvent.frequency} onChange={e => setNewEvent({...newEvent, frequency: e.target.value})}>
                      <option value="MENSAL">MENSAL</option>
                      <option value="SEMANAL">SEMANAL</option>
                      <option value="AVULSO">AVULSO</option>
                   </select>
                </div>
                <div className="space-y-2">
                   <label className="text-[10px] font-black text-slate-400 uppercase ml-1">Data Limite</label>
                   <input type="date" required className="w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl font-bold" value={newEvent.date} onChange={e => setNewEvent({...newEvent, date: e.target.value})} />
                </div>
                <button type="submit" disabled={saveLoading} className="w-full py-5 bg-indigo-600 text-white rounded-[1.5rem] font-black shadow-xl shadow-indigo-100 hover:bg-indigo-700 transition-all flex justify-center items-center gap-2 uppercase tracking-widest text-xs">
                   {saveLoading ? <Loader2 className="animate-spin"/> : 'ATIVAR FISCALIZAÇÃO'}
                </button>
             </form>
          </div>
        </div>
      )}

      {isChecklistOpen && selectedEvent && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-xl p-4">
          <div className="bg-white rounded-[3rem] w-full max-w-4xl max-h-[90vh] shadow-2xl overflow-hidden border animate-in zoom-in-95 flex flex-col">
             <div className="p-8 border-b bg-slate-900 text-white flex justify-between items-center">
                <div className="flex items-center gap-5">
                   <div className="w-14 h-14 bg-indigo-500 rounded-2xl flex items-center justify-center text-white shadow-lg"><ClipboardCheck size={28}/></div>
                   <div>
                      <h2 className="text-xl font-black uppercase leading-none tracking-tight">{selectedEvent.service_type}</h2>
                      <p className="text-[10px] text-indigo-400 font-bold uppercase tracking-widest mt-1">Auditoria de Entregas - Rede Regional</p>
                   </div>
                </div>
                <div className="flex items-center gap-2">
                  <button 
                    onClick={() => handleExportPDF(selectedEvent)}
                    disabled={exporting}
                    className="p-3 bg-white/10 hover:bg-white/20 rounded-xl text-white transition-all flex items-center gap-2 text-xs font-bold uppercase"
                  >
                    {exporting ? <Loader2 className="animate-spin" size={16}/> : <FileDown size={16}/>}
                    Relatório
                  </button>
                  <button onClick={() => setIsChecklistOpen(false)} className="p-3 hover:bg-white/10 rounded-full transition-colors text-slate-400"><X size={24}/></button>
                </div>
             </div>
             
             <div className="p-8 overflow-y-auto flex-1 custom-scrollbar">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                   {schools.map(school => {
                      const sub = submissions.find(s => s.event_id === selectedEvent.id && s.school_id === school.id);
                      const isOk = sub?.is_completed;
                      return (
                        <div key={school.id} onClick={() => toggleSubmission(school.id, selectedEvent.id, !!isOk)} className={`p-4 rounded-2xl border-2 transition-all cursor-pointer flex items-center justify-between group ${isOk ? 'bg-emerald-50 border-emerald-200' : 'bg-white border-slate-100 hover:border-indigo-200 shadow-sm'}`}>
                           <div className="flex items-center gap-3">
                              <div className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${isOk ? 'bg-emerald-500 text-white' : 'bg-slate-100 text-slate-400 group-hover:bg-indigo-100 group-hover:text-indigo-600'}`}>
                                 {isOk ? <Check size={18}/> : <div className="w-2 h-2 rounded-full bg-current"/>}
                              </div>
                              <span className={`text-[11px] font-black uppercase ${isOk ? 'text-emerald-800' : 'text-slate-600'}`}>{school.name}</span>
                           </div>
                           <span className={`text-[9px] font-black px-2 py-1 rounded-full uppercase ${isOk ? 'bg-emerald-200 text-emerald-700' : 'bg-slate-100 text-slate-400'}`}>
                              {isOk ? 'OK' : 'PENDENTE'}
                           </span>
                        </div>
                      );
                   })}
                </div>
             </div>
             
             <div className="p-8 border-t bg-slate-50 flex justify-end gap-3">
                <button onClick={() => handleDeleteEvent(selectedEvent.id)} className="px-6 py-4 text-red-500 font-black uppercase text-xs hover:bg-red-50 rounded-2xl transition-colors">Excluir Agendamento</button>
                <button onClick={() => setIsChecklistOpen(false)} className="px-12 py-4 bg-slate-900 text-white rounded-2xl font-black uppercase text-xs shadow-xl active:scale-95">SALVAR E SAIR</button>
             </div>
          </div>
        </div>
      )}

      {/* --- TEMPLATE PARA PDF (OCULTO) --- */}
      {selectedEvent && (
        <div id="regional-monitoring-pdf-template" style={{ display: 'none', background: 'white', width: '700px', minHeight: '900px', padding: '40px', fontFamily: 'sans-serif' }}>
          <div style={{ borderBottom: '4px solid #4f46e5', paddingBottom: '15px', marginBottom: '30px' }}>
             <table style={{ width: '100%' }}>
                <tbody>
                  <tr>
                    <td>
                      <h1 style={{ margin: 0, fontSize: '20px', fontWeight: 900, color: '#1e293b' }}>RELATÓRIO DE FISCALIZAÇÃO REGIONAL</h1>
                      <p style={{ margin: '5px 0 0', fontSize: '10px', color: '#64748b', fontWeight: 700, textTransform: 'uppercase' }}>Controle de Serviços Terceirizados • GSU Intelligence</p>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <div style={{ background: '#4f46e5', color: 'white', padding: '5px 15px', borderRadius: '8px', fontSize: '10px', fontWeight: 900 }}>SGE-GSU v3.0</div>
                      <p style={{ margin: '5px 0 0', fontSize: '9px', color: '#94a3b8' }}>Ref: {selectedEvent.service_type} ({selectedEvent.frequency})</p>
                    </td>
                  </tr>
                </tbody>
             </table>
          </div>

          <div style={{ background: '#f8fafc', padding: '20px', borderRadius: '20px', border: '1px solid #e2e8f0', marginBottom: '30px' }}>
             <table style={{ width: '100%' }}>
                <tbody>
                  <tr>
                    <td>
                       <p style={{ margin: 0, fontSize: '9px', fontWeight: 900, color: '#64748b', textTransform: 'uppercase' }}>Data Limite de Entrega</p>
                       <h3 style={{ margin: '5px 0 0', fontSize: '14px', fontWeight: 900, color: '#1e293b' }}>{new Date(selectedEvent.date + 'T12:00:00').toLocaleDateString()}</h3>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                       <p style={{ margin: 0, fontSize: '9px', fontWeight: 900, color: '#64748b', textTransform: 'uppercase' }}>Status de Cobertura</p>
                       <h3 style={{ margin: '5px 0 0', fontSize: '14px', fontWeight: 900, color: '#4f46e5' }}>
                          {submissions.filter(s => s.event_id === selectedEvent.id && s.is_completed).length} de {schools.length} Escolas (OK)
                       </h3>
                    </td>
                  </tr>
                </tbody>
             </table>
          </div>

          <div style={{ marginBottom: '40px' }}>
             <h4 style={{ margin: '0 0 15px 0', fontSize: '11px', fontWeight: 900, color: '#1e293b', textTransform: 'uppercase' }}>Relação Detalhada por Unidade Escolar</h4>
             <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: '#f1f5f9' }}>
                    <th style={{ padding: '10px', border: '1px solid #cbd5e1', textAlign: 'left', fontSize: '9px', fontWeight: 900, width: '70%' }}>UNIDADE ESCOLAR</th>
                    <th style={{ padding: '10px', border: '1px solid #cbd5e1', textAlign: 'center', fontSize: '9px', fontWeight: 900, width: '30%' }}>STATUS</th>
                  </tr>
                </thead>
                <tbody>
                  {schools.map((school) => {
                    const sub = submissions.find(s => s.event_id === selectedEvent.id && s.school_id === school.id);
                    const isOk = sub?.is_completed;
                    return (
                      <tr key={school.id}>
                        <td style={{ padding: '8px', border: '1px solid #cbd5e1', fontSize: '10px', fontWeight: 700, textTransform: 'uppercase' }}>{school.name}</td>
                        <td style={{ padding: '8px', border: '1px solid #cbd5e1', textAlign: 'center', fontSize: '9px', fontWeight: 900, color: isOk ? '#059669' : '#dc2626' }}>
                          {isOk ? 'ENTREGUE (OK)' : 'PENDENTE'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
             </table>
          </div>

          <div style={{ marginTop: 'auto', paddingTop: '50px', textAlign: 'center', borderTop: '2px solid #f1f5f9' }}>
             <div style={{ display: 'inline-block', borderTop: '1px solid #cbd5e1', paddingTop: '10px', minWidth: '300px' }}>
                <p style={{ margin: 0, fontSize: '10px', fontWeight: 900, textTransform: 'uppercase' }}>Responsável pela Auditoria Regional</p>
                <p style={{ margin: '2px 0 0', fontSize: '8px', color: '#94a3b8' }}>Emitido via SGE-GSU Intelligence em {new Date().toLocaleString('pt-BR')}</p>
             </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Fiscalizacao;
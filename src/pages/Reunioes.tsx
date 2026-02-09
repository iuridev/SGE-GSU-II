import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { 
  Calendar as CalendarIcon, Clock, MapPin, Video, 
  Plus, ChevronLeft, ChevronRight, X, Save, 
  Loader2, Trash2, Edit, ExternalLink,
  Users, CalendarDays, Building2, HardHat,
  ZapOff, Droplets, CheckCircle2, Info,
  CalendarCheck
} from 'lucide-react';

// Definição estrita das chaves de eventos
type EventType = 'REUNIAO' | 'VISITA_TECNICA' | 'ABERTURA_OBRA' | 'FINALIZACAO_OBRA' | 'AVISO_ENERGIA' | 'AVISO_AGUA';

// Tipagem estendida para suportar novos tipos de eventos
interface Meeting {
  id: string;
  title: string;
  description: string;
  date: string;
  time: string;
  modality: 'Online' | 'Presencial' | 'N/A';
  event_type: EventType;
  school_id: string | null;
  location_link: string | null;
  location_address: string | null;
  created_at: string;
  schools?: { name: string };
}

interface School {
  id: string;
  name: string;
}

// Configuração de Estilos por Tipo de Evento
const EVENT_CONFIG: Record<EventType, { label: string; color: string; light: string; text: string; icon: React.ReactNode }> = {
  'REUNIAO': { label: 'Reunião', color: 'bg-indigo-600', light: 'bg-indigo-50', text: 'text-indigo-600', icon: <Users size={18}/> },
  'VISITA_TECNICA': { label: 'Visita Técnica', color: 'bg-emerald-600', light: 'bg-emerald-50', text: 'text-emerald-600', icon: <MapPin size={18}/> },
  'ABERTURA_OBRA': { label: 'Abertura de Obra', color: 'bg-orange-600', light: 'bg-orange-50', text: 'text-orange-600', icon: <HardHat size={18}/> },
  'FINALIZACAO_OBRA': { label: 'Finalização Obra', color: 'bg-green-600', light: 'bg-green-50', text: 'text-green-600', icon: <CheckCircle2 size={18}/> },
  'AVISO_ENERGIA': { label: 'Falta de Energia', color: 'bg-amber-600', light: 'bg-amber-50', text: 'text-amber-600', icon: <ZapOff size={18}/> },
  'AVISO_AGUA': { label: 'Falta de Água', color: 'bg-blue-600', light: 'bg-blue-50', text: 'text-blue-600', icon: <Droplets size={18}/> },
};

const MONTHS = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
const DAYS_WEEK = ["Domingo", "Segunda-feira", "Terça-feira", "Quarta-feira", "Quinta-feira", "Sexta-feira", "Sábado"];
const DAYS_SHORT = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

export function Reunioes() {
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [schools, setSchools] = useState<School[]>([]);
  const [loading, setLoading] = useState(true);
  const [userRole, setUserRole] = useState('');
  
  // Data selecionada (Foco da lista)
  const [selectedDate, setSelectedDate] = useState(new Date());
  // Data de visualização (Foco do mini-calendário)
  const [viewDate, setViewDate] = useState(new Date());
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [saveLoading, setSaveLoading] = useState(false);
  const [editingMeeting, setEditingMeeting] = useState<Meeting | null>(null);
  
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    date: new Date().toISOString().split('T')[0],
    time: '09:00',
    modality: 'Presencial' as 'Online' | 'Presencial' | 'N/A',
    event_type: 'REUNIAO' as EventType,
    school_id: '',
    location_link: '',
    location_address: ''
  });

  useEffect(() => {
    fetchInitialData();
  }, []);

  async function fetchInitialData() {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: profile } = await (supabase as any).from('profiles').select('role').eq('id', user.id).single();
        setUserRole(profile?.role || '');
      }

      const { data: schoolsData } = await (supabase as any).from('schools').select('id, name').order('name');
      setSchools(schoolsData || []);

      await fetchMeetings();
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  }

  async function fetchMeetings() {
    const { data, error } = await (supabase as any)
      .from('meetings')
      .select('*, schools(name)')
      .order('date', { ascending: true })
      .order('time', { ascending: true });
    
    if (!error) setMeetings(data || []);
  }

  const isAdmin = userRole === 'regional_admin';

  // Lógica de Calendário (Mini)
  const firstDayOfMonth = new Date(viewDate.getFullYear(), viewDate.getMonth(), 1).getDay();
  const daysInMonth = new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 0).getDate();

  // Formata data selecionada para string YYYY-MM-DD para filtragem
  const selectedDateStr = useMemo(() => {
    const year = selectedDate.getFullYear();
    const month = String(selectedDate.getMonth() + 1).padStart(2, '0');
    const day = String(selectedDate.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }, [selectedDate]);

  const dailyEvents = useMemo(() => {
    return meetings.filter(m => m.date === selectedDateStr);
  }, [meetings, selectedDateStr]);

  const handlePrevDay = () => {
    const newDate = new Date(selectedDate);
    newDate.setDate(selectedDate.getDate() - 1);
    setSelectedDate(newDate);
    // Sincroniza viewDate se necessário
    if (newDate.getMonth() !== viewDate.getMonth()) setViewDate(new Date(newDate.getFullYear(), newDate.getMonth(), 1));
  };

  const handleNextDay = () => {
    const newDate = new Date(selectedDate);
    newDate.setDate(selectedDate.getDate() + 1);
    setSelectedDate(newDate);
    // Sincroniza viewDate se necessário
    if (newDate.getMonth() !== viewDate.getMonth()) setViewDate(new Date(newDate.getFullYear(), newDate.getMonth(), 1));
  };

  const handleGoToToday = () => {
    const today = new Date();
    setSelectedDate(today);
    setViewDate(new Date(today.getFullYear(), today.getMonth(), 1));
  };

  const changeViewMonth = (offset: number) => {
    const newDate = new Date(viewDate.getFullYear(), viewDate.getMonth() + offset, 1);
    setViewDate(newDate);
  };

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!isAdmin) return;
    setSaveLoading(true);
    
    const payload = {
      ...formData,
      school_id: formData.school_id || null,
      location_link: formData.modality === 'Online' ? formData.location_link : null,
      location_address: formData.modality === 'Presencial' ? formData.location_address : null
    };

    try {
      if (editingMeeting) {
        const { error } = await (supabase as any).from('meetings').update(payload).eq('id', editingMeeting.id);
        if (error) throw error;
      } else {
        const { error } = await (supabase as any).from('meetings').insert([payload]);
        if (error) throw error;
      }
      setIsModalOpen(false);
      fetchMeetings();
    } catch (error: any) {
      alert("Erro ao salvar: " + error.message);
    } finally {
      setSaveLoading(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Excluir este evento permanentemente?")) return;
    try {
      const { error } = await (supabase as any).from('meetings').delete().eq('id', id);
      if (error) throw error;
      fetchMeetings();
    } catch (error: any) {
      alert("Erro ao excluir: " + error.message);
    }
  }

  function openCreateModal() {
    setEditingMeeting(null);
    setFormData({
      title: '',
      description: '',
      date: selectedDateStr,
      time: '09:00',
      modality: 'Presencial',
      event_type: 'REUNIAO',
      school_id: '',
      location_link: '',
      location_address: ''
    });
    setIsModalOpen(true);
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-40 gap-4">
        <Loader2 className="animate-spin text-indigo-600" size={48} />
        <p className="font-black text-slate-400 uppercase tracking-widest text-xs">Sincronizando Agenda...</p>
      </div>
    );
  }

  return (
    <div className="space-y-8 pb-32 bg-[#f8fafc] min-h-screen">
      {/* Cabeçalho */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="flex items-center gap-5">
          <div className="p-4 bg-indigo-600 rounded-[2rem] text-white shadow-2xl shadow-indigo-100">
            <CalendarIcon size={32} />
          </div>
          <div>
            <h1 className="text-3xl font-black text-slate-900 tracking-tight uppercase leading-none">Cronograma Regional</h1>
            <p className="text-slate-500 font-medium mt-1 uppercase text-xs tracking-widest italic">Visão Geral e Detalhamento de Eventos</p>
          </div>
        </div>
        
        {isAdmin && (
          <button 
            onClick={() => openCreateModal()}
            className="bg-indigo-600 hover:bg-indigo-700 text-white px-10 py-5 rounded-[2rem] font-black flex items-center gap-3 shadow-xl transition-all active:scale-95 group"
          >
            <Plus size={20} className="group-hover:rotate-90 transition-transform" /> NOVO EVENTO
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-8 items-start">
        
        {/* Navegador Superior: Mini Calendário e Data Atual */}
        <div className="xl:col-span-12 space-y-8">
           <div className="bg-white p-8 md:p-10 rounded-[4rem] border border-slate-100 shadow-[0_32px_64px_-12px_rgba(0,0,0,0.06)] animate-in fade-in duration-500 overflow-hidden">
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-12">
                 
                 {/* Mini Calendário à Esquerda */}
                 <div className="lg:col-span-4 border-r border-slate-50 pr-0 lg:pr-12">
                    <div className="flex items-center justify-between mb-6">
                       <h3 className="text-sm font-black text-slate-400 uppercase tracking-[0.2em]">{MONTHS[viewDate.getMonth()]} {viewDate.getFullYear()}</h3>
                       <div className="flex gap-2">
                          <button onClick={() => changeViewMonth(-1)} className="p-2 hover:bg-slate-100 rounded-full text-slate-400 transition-colors"><ChevronLeft size={18}/></button>
                          <button onClick={() => changeViewMonth(1)} className="p-2 hover:bg-slate-100 rounded-full text-slate-400 transition-colors"><ChevronRight size={18}/></button>
                       </div>
                    </div>
                    
                    <div className="grid grid-cols-7 gap-1 text-center">
                       {DAYS_SHORT.map(d => (
                         <div key={d} className="text-[9px] font-black text-slate-300 uppercase py-2">{d}</div>
                       ))}
                       
                       {Array.from({ length: firstDayOfMonth }).map((_, i) => (
                         <div key={`empty-${i}`} className="h-10" />
                       ))}

                       {Array.from({ length: daysInMonth }).map((_, i) => {
                         const day = i + 1;
                         const dateStr = `${viewDate.getFullYear()}-${String(viewDate.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                         const isSelected = selectedDateStr === dateStr;
                         const isToday = new Date().toISOString().split('T')[0] === dateStr;
                         
                         // Encontrar tipos de eventos para este dia
                         const dayEvents = meetings.filter(m => m.date === dateStr);
                         const uniqueTypes = Array.from(new Set(dayEvents.map(e => e.event_type))) as EventType[];
                         const hasEvents = uniqueTypes.length > 0;
                         const firstType = uniqueTypes[0];

                         // Lógica de cores da caixa inteira
                         let cellBg = 'bg-transparent';
                         let textColor = 'text-slate-500';
                         let shadow = '';

                         if (isSelected) {
                            cellBg = 'bg-indigo-600';
                            textColor = 'text-white';
                            shadow = 'shadow-lg shadow-indigo-100';
                         } else if (isToday) {
                            cellBg = 'bg-slate-900';
                            textColor = 'text-white';
                         } else if (hasEvents) {
                            cellBg = EVENT_CONFIG[firstType].color;
                            textColor = 'text-white';
                            shadow = 'shadow-sm';
                         }

                         return (
                           <button
                             key={day}
                             onClick={() => setSelectedDate(new Date(viewDate.getFullYear(), viewDate.getMonth(), day))}
                             className={`h-11 rounded-2xl flex flex-col items-center justify-center relative transition-all group hover:opacity-80
                               ${cellBg} ${textColor} ${shadow}`}
                           >
                             <span className="text-[11px] font-black">{day}</span>
                             
                             {/* Indicador de múltiplos eventos (opcional, pequeno ponto branco se houver > 1) */}
                             {hasEvents && uniqueTypes.length > 1 && !isSelected && !isToday && (
                               <div className="absolute top-1 right-1 w-1 h-1 bg-white rounded-full"></div>
                             )}
                           </button>
                         );
                       })}
                    </div>
                 </div>

                 {/* Navegador Linear Centralizado */}
                 <div className="lg:col-span-8 flex flex-col items-center justify-center space-y-8 py-4">
                    <div className="flex items-center gap-6 md:gap-16">
                      <button 
                        onClick={handlePrevDay} 
                        className="p-6 hover:bg-slate-100 rounded-full border border-slate-100 text-slate-400 transition-all hover:text-indigo-600 shadow-sm active:scale-90"
                      >
                        <ChevronLeft size={36}/>
                      </button>
                      
                      <div className="text-center group cursor-pointer" onClick={handleGoToToday}>
                        <p className="text-indigo-600 font-black text-xs md:text-sm tracking-[0.4em] uppercase mb-2 group-hover:scale-110 transition-transform">
                          {DAYS_WEEK[selectedDate.getDay()]}
                        </p>
                        <h2 className="text-5xl md:text-8xl font-black text-slate-900 uppercase tracking-tighter leading-none flex items-baseline gap-4 justify-center">
                          {selectedDate.getDate()}
                          <span className="text-xl md:text-4xl text-slate-300 font-black tracking-normal">
                            {MONTHS[selectedDate.getMonth()]}
                          </span>
                        </h2>
                        <p className="text-slate-400 font-black text-xs md:text-sm mt-3 tracking-widest uppercase">
                          Ano de {selectedDate.getFullYear()}
                        </p>
                      </div>

                      <button 
                        onClick={handleNextDay} 
                        className="p-6 hover:bg-slate-100 rounded-full border border-slate-100 text-slate-400 transition-all hover:text-indigo-600 shadow-sm active:scale-90"
                      >
                        <ChevronRight size={36}/>
                      </button>
                    </div>

                    <div className="flex items-center gap-4">
                       <button 
                        onClick={handleGoToToday}
                        className="px-10 py-3 bg-indigo-50 text-indigo-600 rounded-full font-black text-[10px] uppercase tracking-widest hover:bg-indigo-600 hover:text-white transition-all shadow-sm"
                       >
                         Ir para Hoje
                       </button>
                       <div className="w-px h-6 bg-slate-200"></div>
                       <div className="flex items-center gap-2">
                          <CalendarCheck size={16} className="text-emerald-500" />
                          <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                            {dailyEvents.length} {dailyEvents.length === 1 ? 'Compromisso' : 'Compromissos'} agendados
                          </span>
                       </div>
                    </div>
                 </div>
              </div>
           </div>
        </div>

        {/* Conteúdo Principal: Lista de Eventos */}
        <div className="xl:col-span-8 max-w-5xl w-full mx-auto">
          <div className="space-y-6">
            {dailyEvents.length === 0 ? (
              <div className="py-32 bg-white rounded-[4rem] border-2 border-dashed border-slate-100 text-center flex flex-col items-center justify-center animate-in zoom-in-95">
                 <div className="w-24 h-24 bg-slate-50 text-slate-200 rounded-full flex items-center justify-center mb-6">
                    <CalendarDays size={48}/>
                 </div>
                 <h3 className="text-xl font-black text-slate-300 uppercase tracking-widest">Nenhuma pauta agendada</h3>
                 <p className="text-slate-400 text-xs font-bold uppercase mt-2">Use o calendário acima ou as setas para navegar</p>
              </div>
            ) : (
              <div className="space-y-6 animate-in slide-in-from-bottom-6 duration-500">
                {dailyEvents.map((meeting) => {
                  const config = EVENT_CONFIG[meeting.event_type];
                  return (
                    <div key={meeting.id} className="bg-white rounded-[3.5rem] border border-slate-100 shadow-2xl overflow-hidden group hover:border-indigo-400 transition-all">
                      <div className="flex flex-col md:flex-row">
                        {/* Barra Lateral de Cor */}
                        <div className={`w-full md:w-4 ${config.color}`}></div>
                        
                        <div className="flex-1 p-8 md:p-12">
                          <div className="flex flex-col md:flex-row md:items-start justify-between gap-6">
                            <div className="space-y-5 flex-1">
                              <div className="flex flex-wrap items-center gap-3">
                                <div className={`px-6 py-2.5 rounded-2xl text-[10px] font-black uppercase tracking-widest flex items-center gap-3 ${config.light} ${config.text}`}>
                                  {config.icon}
                                  {config.label}
                                </div>
                                {meeting.schools?.name && (
                                  <div className="flex items-center gap-2 bg-slate-900 text-white px-6 py-2.5 rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-lg">
                                    <Building2 size={14} className="text-indigo-400"/>
                                    {meeting.schools.name}
                                  </div>
                                )}
                              </div>

                              <h3 className="text-3xl md:text-4xl font-black text-slate-800 leading-tight uppercase group-hover:text-indigo-600 transition-colors">
                                {meeting.title}
                              </h3>

                              <div className="flex flex-wrap gap-8 items-center pt-2">
                                 <div className="flex items-center gap-3 text-slate-400 font-black text-xs uppercase tracking-widest">
                                    <Clock size={20} className="text-indigo-500" />
                                    {meeting.time} Horas
                                 </div>
                                 <div className="flex items-center gap-3 text-slate-400 font-black text-xs uppercase tracking-widest">
                                    <MapPin size={20} className="text-indigo-500" />
                                    {meeting.modality}
                                 </div>
                              </div>
                            </div>

                            {isAdmin && (
                              <div className="flex gap-3 shrink-0 self-end md:self-start opacity-0 group-hover:opacity-100 transition-opacity">
                                <button 
                                  onClick={() => { 
                                    setEditingMeeting(meeting); 
                                    setFormData({
                                      title: meeting.title,
                                      description: meeting.description,
                                      date: meeting.date,
                                      time: meeting.time,
                                      modality: meeting.modality,
                                      event_type: meeting.event_type,
                                      school_id: meeting.school_id || '',
                                      location_link: meeting.location_link || '',
                                      location_address: meeting.location_address || ''
                                    }); 
                                    setIsModalOpen(true); 
                                  }} 
                                  className="p-5 bg-slate-50 text-slate-400 hover:bg-indigo-600 hover:text-white rounded-3xl transition-all shadow-sm active:scale-90"
                                >
                                  <Edit size={24}/>
                                </button>
                                <button 
                                  onClick={() => handleDelete(meeting.id)} 
                                  className="p-5 bg-slate-50 text-slate-400 hover:bg-red-600 hover:text-white rounded-3xl transition-all shadow-sm active:scale-90"
                                >
                                  <Trash2 size={24}/>
                                </button>
                              </div>
                            )}
                          </div>

                          <div className="mt-10 pt-10 border-t border-slate-50">
                            <p className="text-slate-500 font-medium leading-relaxed text-sm md:text-lg italic">
                              "{meeting.description}"
                            </p>
                          </div>

                          {meeting.modality === 'Online' && meeting.location_link && (
                            <div className="mt-10">
                               <a 
                                href={meeting.location_link} 
                                target="_blank" 
                                rel="noopener noreferrer" 
                                className="inline-flex items-center gap-5 px-12 py-6 bg-slate-900 hover:bg-black text-white rounded-[2rem] font-black text-[11px] uppercase tracking-[0.2em] shadow-2xl transition-all active:scale-95 group/btn"
                               >
                                 <Video size={22}/> ACESSAR SALA VIRTUAL <ExternalLink size={14} className="opacity-40 group-hover/btn:translate-x-1 transition-transform" />
                               </a>
                            </div>
                          )}

                          {meeting.modality === 'Presencial' && meeting.location_address && (
                            <div className="mt-10 p-6 bg-slate-50 rounded-[2.5rem] border border-slate-100 flex items-center gap-5">
                               <div className="w-14 h-14 bg-white rounded-2xl flex items-center justify-center text-amber-500 shadow-sm border border-slate-100">
                                  <MapPin size={28}/>
                               </div>
                               <div>
                                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">Localização Confirmada</p>
                                  <p className="text-base font-black text-slate-700 uppercase">{meeting.location_address}</p>
                               </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Legenda Lateral */}
        <div className="xl:col-span-4 space-y-6">
           <div className="bg-slate-900 p-10 rounded-[3.5rem] text-white shadow-2xl relative overflow-hidden group h-full">
              <Info className="absolute -right-4 -bottom-4 text-white/5 group-hover:scale-110 transition-transform" size={150} />
              <div className="relative z-10">
                 <div className="flex items-center gap-3 mb-10">
                    <div className="w-2 h-8 bg-indigo-500 rounded-full"></div>
                    <h4 className="text-lg font-black text-white uppercase tracking-[0.2em]">Legenda Técnica</h4>
                 </div>
                 <div className="space-y-6">
                    {Object.entries(EVENT_CONFIG).map(([key, cfg]) => (
                       <div key={key} className="flex items-center gap-5 group/leg cursor-default">
                          <div className={`w-6 h-6 rounded-xl ${cfg.color} shadow-lg ring-4 ring-white/10 group-hover/leg:scale-110 transition-transform`}></div>
                          <div>
                            <span className="text-xs font-black uppercase text-white tracking-widest block leading-none">{cfg.label}</span>
                            <span className="text-[9px] font-bold text-white/40 uppercase tracking-tighter mt-1 block">Classificação Regional</span>
                          </div>
                       </div>
                    ))}
                 </div>
                 
                 <div className="mt-12 pt-10 border-t border-white/5">
                    <p className="text-[10px] text-white/30 font-bold uppercase leading-relaxed italic">
                       * Utilize o mini calendário no topo para filtrar datas específicas e identificar os períodos de obras e vistorias na rede.
                    </p>
                 </div>
              </div>
           </div>
        </div>
      </div>

      {/* Modal Criar/Editar */}
      {isModalOpen && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-900/90 backdrop-blur-md p-4">
          <div className="bg-white rounded-[3.5rem] w-full max-w-4xl max-h-[95vh] shadow-2xl overflow-hidden border border-white animate-in zoom-in-95 duration-200 flex flex-col">
            <div className="p-10 border-b border-slate-100 flex justify-between items-center bg-slate-50/50 shrink-0">
              <div className="flex items-center gap-6">
                <div className={`w-16 h-16 ${EVENT_CONFIG[formData.event_type].color} rounded-[1.8rem] flex items-center justify-center text-white shadow-xl shadow-indigo-100`}>
                  {EVENT_CONFIG[formData.event_type].icon}
                </div>
                <div>
                  <h2 className="text-2xl font-black uppercase tracking-tight leading-none">{editingMeeting ? 'Editar Registro' : 'Novo Agendamento'}</h2>
                  <p className="text-[10px] text-indigo-600 font-bold uppercase tracking-widest mt-2">Gestão de Pauta e Infraestrutura Regional</p>
                </div>
              </div>
              <button onClick={() => setIsModalOpen(false)} className="p-4 hover:bg-white rounded-full transition-all text-slate-400 shadow-sm border border-transparent hover:border-slate-100"><X size={32} /></button>
            </div>

            <form onSubmit={handleSave} className="p-10 space-y-10 overflow-y-auto custom-scrollbar flex-1">
              <div className="space-y-4">
                <label className="text-[11px] font-black text-slate-400 uppercase tracking-[0.2em] ml-2 px-2 border-l-2 border-indigo-600">Categoria do Evento</label>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                  {Object.entries(EVENT_CONFIG).map(([key, cfg]) => (
                    <button 
                      key={key} type="button" 
                      onClick={() => setFormData({...formData, event_type: key as EventType})}
                      className={`p-5 rounded-[1.8rem] border-2 transition-all flex flex-col items-center justify-center text-center gap-3 group ${formData.event_type === key ? `${cfg.color} border-transparent text-white shadow-xl scale-105` : 'bg-white border-slate-100 text-slate-400 hover:border-indigo-200'}`}
                    >
                      <div className={`transition-transform group-hover:scale-110 ${formData.event_type === key ? 'text-white' : cfg.text}`}>{cfg.icon}</div>
                      <span className="text-[9px] font-black uppercase leading-tight tracking-tighter">{cfg.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-500 uppercase ml-1">Unidade Escolar Vinculada</label>
                  <select className="w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl font-bold text-slate-800 focus:border-indigo-500 transition-all shadow-inner outline-none" value={formData.school_id || ''} onChange={e => setFormData({...formData, school_id: e.target.value})}>
                    <option value="">REDE REGIONAL GERAL (SEM ESCOLA)</option>
                    {schools.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-500 uppercase ml-1">Título do Agendamento</label>
                  <input required className="w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl font-bold text-slate-800 focus:border-indigo-500 transition-all shadow-inner outline-none" placeholder="Ex: Entrega de Material / Vistoria" value={formData.title} onChange={e => setFormData({...formData, title: e.target.value})} />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-6">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-500 uppercase ml-1">Data</label>
                  <input type="date" required className="w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl font-bold focus:border-indigo-500 outline-none" value={formData.date} onChange={e => setFormData({...formData, date: e.target.value})} />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-500 uppercase ml-1">Horário</label>
                  <input type="time" required className="w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl font-bold focus:border-indigo-500 outline-none" value={formData.time} onChange={e => setFormData({...formData, time: e.target.value})} />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-500 uppercase ml-1">Modalidade</label>
                  <select className="w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl font-bold" value={formData.modality} onChange={e => setFormData({...formData, modality: e.target.value as any})}>
                    <option value="Presencial">Presencial / In Loco</option>
                    <option value="Online">Online / Remoto</option>
                    <option value="N/A">Apenas Informativo</option>
                  </select>
                </div>
              </div>

              {formData.modality === 'Online' && (
                <div className="space-y-2 animate-in slide-in-from-top-2 duration-300">
                  <label className="text-[10px] font-black text-slate-500 uppercase ml-1 flex items-center gap-2"><Video size={14} className="text-indigo-600"/> Link da Reunião (Meet / Teams)</label>
                  <input type="url" className="w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl font-mono text-xs font-bold text-indigo-600 focus:border-indigo-500 transition-all outline-none" placeholder="https://meet.google.com/..." value={formData.location_link} onChange={e => setFormData({...formData, location_link: e.target.value})} />
                </div>
              )}

              {formData.modality === 'Presencial' && (
                <div className="space-y-2 animate-in slide-in-from-top-2 duration-300">
                  <label className="text-[10px] font-black text-slate-500 uppercase ml-1 flex items-center gap-2"><MapPin size={14} className="text-amber-600"/> Endereço / Local Interno</label>
                  <input className="w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl font-bold text-slate-800 focus:border-amber-500 transition-all shadow-inner outline-none" placeholder="Ex: Auditório Regional, Sala 32..." value={formData.location_address} onChange={e => setFormData({...formData, location_address: e.target.value})} />
                </div>
              )}

              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-500 uppercase ml-1">Observações da Pauta / Detalhes do Evento</label>
                <textarea className="w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl font-bold text-slate-800 focus:border-indigo-500 transition-all min-h-[120px] shadow-inner outline-none" placeholder="Descreva os pontos principais que serão discutidos ou detalhes técnicos..." value={formData.description} onChange={e => setFormData({...formData, description: e.target.value})} />
              </div>

              <div className="pt-8 flex justify-end gap-5 border-t border-slate-50 sticky bottom-0 bg-white">
                <button type="button" onClick={() => setIsModalOpen(false)} className="px-10 py-5 text-slate-400 font-black hover:text-slate-600 transition-all uppercase tracking-widest text-[11px]">Cancelar</button>
                <button 
                  type="submit" 
                  disabled={saveLoading}
                  className="px-20 py-5 bg-indigo-600 text-white rounded-[2rem] font-black shadow-xl shadow-indigo-100 hover:bg-indigo-700 flex items-center gap-4 active:scale-95 transition-all disabled:opacity-50 uppercase tracking-widest text-[11px]"
                >
                  {saveLoading ? <Loader2 className="animate-spin" size={24}/> : <Save size={24} />}
                  {editingMeeting ? 'Salvar Alterações' : 'Confirmar Registro'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default Reunioes;
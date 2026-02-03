import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { 
  Calendar as CalendarIcon, Clock, MapPin, Video, 
  Plus, ChevronLeft, ChevronRight, X, Save, 
  Loader2, Trash2, Edit, ExternalLink,
  Users, CalendarDays
} from 'lucide-react';

interface Meeting {
  id: string;
  title: string;
  description: string;
  date: string;
  time: string;
  modality: 'Online' | 'Presencial';
  location_link: string | null;
  location_address: string | null;
  created_at: string;
}

const MONTHS = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

export function Reunioes() {
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [loading, setLoading] = useState(true);
  const [userRole, setUserRole] = useState('');
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDay, setSelectedDay] = useState<number | null>(new Date().getDate());
  
  // Estados do Modal
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [saveLoading, setSaveLoading] = useState(false);
  const [editingMeeting, setEditingMeeting] = useState<Meeting | null>(null);
  
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    date: new Date().toISOString().split('T')[0],
    time: '09:00',
    modality: 'Online' as 'Online' | 'Presencial',
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
      .select('*')
      .order('date', { ascending: true })
      .order('time', { ascending: true });
    
    if (!error) setMeetings(data || []);
  }

  const isAdmin = userRole === 'regional_admin';

  // Lógica do Calendário
  const daysInMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0).getDate();
  const firstDayOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1).getDay();

  const handlePrevMonth = () => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
  const handleNextMonth = () => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));

  const meetingsForSelectedDay = useMemo(() => {
    if (!selectedDay) return [];
    const dateStr = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}-${String(selectedDay).padStart(2, '0')}`;
    return meetings.filter(m => m.date === dateStr);
  }, [meetings, selectedDay, currentDate]);

  const getMeetingsForDay = (day: number) => {
    const dateStr = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    return meetings.filter(m => m.date === dateStr);
  };

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!isAdmin) return;
    setSaveLoading(true);
    
    const payload = {
      ...formData,
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
      alert("Erro ao salvar reunião: " + error.message);
    } finally {
      setSaveLoading(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Excluir esta reunião do cronograma regional?")) return;
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
      date: `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}-${String(selectedDay || 1).padStart(2, '0')}`,
      time: '09:00',
      modality: 'Online',
      location_link: '',
      location_address: ''
    });
    setIsModalOpen(true);
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-32 gap-4">
        <Loader2 className="animate-spin text-indigo-600" size={48} />
        <p className="font-black text-slate-400 uppercase tracking-widest text-xs">Sincronizando Agenda...</p>
      </div>
    );
  }

  return (
    <div className="space-y-8 pb-20">
      {/* Seção de Cabeçalho */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="p-4 bg-indigo-600 rounded-[2rem] text-white shadow-2xl shadow-indigo-200">
            <CalendarIcon size={32} />
          </div>
          <div>
            <h1 className="text-3xl font-black text-slate-900 tracking-tight uppercase leading-none">Cronograma de Reuniões</h1>
            <p className="text-slate-500 font-medium mt-1 italic">Gestão estratégica e alinhamento da rede regional.</p>
          </div>
        </div>
        
        {isAdmin && (
          <button 
            onClick={openCreateModal}
            className="bg-indigo-600 hover:bg-indigo-700 text-white px-8 py-4 rounded-2xl font-black flex items-center gap-3 shadow-xl transition-all active:scale-95"
          >
            <Plus size={20} /> AGENDAR REUNIÃO
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        {/* Lado Esquerdo: Calendário */}
        <div className="lg:col-span-7">
          <div className="bg-white p-8 rounded-[3rem] border border-slate-100 shadow-2xl overflow-hidden relative group">
            <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-50/50 rounded-full -mr-32 -mt-32 blur-3xl transition-transform group-hover:scale-110"></div>
            
            <div className="relative z-10">
              <div className="flex items-center justify-between mb-10">
                <div className="flex items-center gap-6">
                  <button onClick={handlePrevMonth} className="p-4 hover:bg-indigo-50 rounded-3xl border border-slate-100 text-slate-400 hover:text-indigo-600 transition-all"><ChevronLeft size={24}/></button>
                  <div className="text-center min-w-[180px]">
                    <h2 className="text-3xl font-black text-slate-900 uppercase tracking-tighter leading-none">{MONTHS[currentDate.getMonth()]}</h2>
                    <span className="text-indigo-600 font-black text-xs tracking-[0.3em] uppercase">{currentDate.getFullYear()}</span>
                  </div>
                  <button onClick={handleNextMonth} className="p-4 hover:bg-indigo-50 rounded-3xl border border-slate-100 text-slate-400 hover:text-indigo-600 transition-all"><ChevronRight size={24}/></button>
                </div>
              </div>

              <div className="grid grid-cols-7 gap-4">
                {['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].map(d => (
                  <div key={d} className="text-center text-[10px] font-black text-slate-400 uppercase tracking-widest py-2">{d}</div>
                ))}
                
                {Array.from({ length: firstDayOfMonth }).map((_, i) => (
                  <div key={`empty-${i}`} className="h-20 md:h-24 rounded-3xl bg-slate-50/30 border border-transparent opacity-20" />
                ))}

                {Array.from({ length: daysInMonth }).map((_, i) => {
                  const day = i + 1;
                  const isSelected = selectedDay === day;
                  const dayMeetings = getMeetingsForDay(day);
                  const hasMeeting = dayMeetings.length > 0;
                  const isToday = new Date().getDate() === day && new Date().getMonth() === currentDate.getMonth() && new Date().getFullYear() === currentDate.getFullYear();

                  return (
                    <button
                      key={day}
                      onClick={() => setSelectedDay(day)}
                      className={`h-20 md:h-24 rounded-3xl border-2 flex flex-col items-center justify-center gap-2 transition-all relative overflow-hidden group/day
                        ${isSelected ? 'bg-indigo-600 border-indigo-600 text-white shadow-2xl shadow-indigo-200 scale-105 z-20' : 
                          isToday ? 'bg-slate-900 border-slate-900 text-white z-10' : 
                          hasMeeting ? 'bg-orange-50 border-orange-200 text-orange-700 shadow-sm' :
                          'bg-white border-slate-50 text-slate-400 hover:border-indigo-200 hover:text-indigo-600'}`}
                    >
                      <span className={`text-lg font-black ${hasMeeting && !isSelected && !isToday ? 'text-orange-600' : ''}`}>
                        {day}
                      </span>
                      
                      {hasMeeting && (
                        <div className="flex flex-col items-center gap-1">
                          <div className={`w-2.5 h-2.5 rounded-full animate-pulse shadow-sm ${isSelected ? 'bg-white' : 'bg-orange-500'}`}></div>
                          {dayMeetings.length > 1 && !isSelected && (
                            <span className="text-[8px] font-black uppercase opacity-60">
                              {dayMeetings.length} Pautas
                            </span>
                          )}
                        </div>
                      )}

                      {/* Decoração superior em laranja para dias com reunião */}
                      {hasMeeting && !isSelected && !isToday && (
                        <div className="absolute top-0 left-0 w-full h-1 bg-orange-400/30"></div>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        {/* Lado Direito: Detalhes do Dia */}
        <div className="lg:col-span-5 flex flex-col space-y-6">
          <div className="flex items-center gap-3 px-4">
             <div className="w-1.5 h-6 bg-indigo-600 rounded-full"></div>
             <h2 className="text-xl font-black text-slate-800 uppercase tracking-tight flex items-center gap-2">
                Pauta do Dia {selectedDay} de {MONTHS[currentDate.getMonth()]}
             </h2>
          </div>

          <div className="flex-1 space-y-4 overflow-y-auto max-h-[600px] pr-2 custom-scrollbar">
            {meetingsForSelectedDay.length === 0 ? (
              <div className="bg-white p-12 rounded-[3rem] border-2 border-dashed border-slate-100 flex flex-col items-center justify-center text-center">
                 <div className="w-16 h-16 bg-slate-50 text-slate-200 rounded-full flex items-center justify-center mb-4"><CalendarDays size={32}/></div>
                 <p className="text-xs font-black text-slate-400 uppercase tracking-[0.2em]">Nenhuma reunião agendada para esta data.</p>
              </div>
            ) : (
              meetingsForSelectedDay.map((meeting) => (
                <div key={meeting.id} className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-xl hover:shadow-2xl transition-all group border-l-8 border-l-indigo-600 relative overflow-hidden">
                   <div className="flex justify-between items-start mb-6">
                      <div className={`px-4 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest flex items-center gap-2 ${meeting.modality === 'Online' ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600'}`}>
                         {meeting.modality === 'Online' ? <Video size={12}/> : <MapPin size={12}/>}
                         {meeting.modality}
                      </div>
                      <div className="flex gap-2">
                         {isAdmin && (
                           <>
                              <button onClick={() => { setEditingMeeting(meeting); setFormData(meeting as any); setIsModalOpen(true); }} className="p-2 text-slate-400 hover:text-indigo-600 transition-colors"><Edit size={16}/></button>
                              <button onClick={() => handleDelete(meeting.id)} className="p-2 text-slate-400 hover:text-red-600 transition-colors"><Trash2 size={16}/></button>
                           </>
                         )}
                      </div>
                   </div>

                   <h3 className="text-xl font-black text-slate-800 leading-tight uppercase group-hover:text-indigo-600 transition-colors">{meeting.title}</h3>
                   
                   <div className="mt-4 flex items-center gap-4 text-slate-400 text-xs font-bold uppercase tracking-widest">
                      <div className="flex items-center gap-1.5"><Clock size={14} className="text-indigo-500"/> {meeting.time}h</div>
                      <div className="w-1 h-1 bg-slate-200 rounded-full"></div>
                      <div className="flex items-center gap-1.5 uppercase"><Users size={14} className="text-indigo-500"/> Convite Geral</div>
                   </div>

                   <p className="text-sm text-slate-500 font-medium mt-4 line-clamp-2 leading-relaxed">
                      {meeting.description}
                   </p>

                   {meeting.modality === 'Online' ? (
                      <a 
                        href={meeting.location_link || '#'} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="mt-6 w-full py-4 bg-slate-900 hover:bg-black text-white rounded-2xl font-black text-[10px] uppercase flex items-center justify-center gap-3 shadow-lg transition-all active:scale-95"
                      >
                        <Video size={16}/> ENTRAR NA SALA VIRTUAL <ExternalLink size={12} className="opacity-40"/>
                      </a>
                   ) : (
                      <div className="mt-6 p-4 bg-slate-50 border border-slate-100 rounded-2xl flex items-start gap-3">
                         <MapPin size={18} className="text-amber-500 shrink-0 mt-0.5" />
                         <p className="text-xs font-bold text-slate-600 leading-relaxed uppercase">{meeting.location_address}</p>
                      </div>
                   )}
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Modal Agendamento */}
      {isModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/80 backdrop-blur-sm p-4">
          <div className="bg-white rounded-[3rem] w-full max-w-2xl shadow-2xl overflow-hidden border border-white animate-in zoom-in-95 duration-200">
            <div className="p-8 border-b border-slate-100 flex justify-between items-center bg-indigo-50/50">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-indigo-600 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-indigo-100"><CalendarIcon size={24} /></div>
                <div>
                  <h2 className="text-xl font-black uppercase tracking-tight leading-none">{editingMeeting ? 'Editar Reunião' : 'Agendar Novo Encontro'}</h2>
                  <p className="text-[10px] text-indigo-600 font-bold uppercase tracking-widest mt-1">SGE-GSU Gestão de Agenda</p>
                </div>
              </div>
              <button onClick={() => setIsModalOpen(false)} className="p-2 hover:bg-white rounded-full transition-colors text-slate-400"><X size={24} /></button>
            </div>

            <form onSubmit={handleSave} className="p-8 space-y-6 overflow-y-auto max-h-[80vh] custom-scrollbar">
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-500 uppercase ml-1">Título da Reunião</label>
                <input 
                  required 
                  className="w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl font-bold text-slate-800 focus:border-indigo-500 outline-none transition-all" 
                  placeholder="Ex: Alinhamento de Fiscais Merenda"
                  value={formData.title}
                  onChange={e => setFormData({...formData, title: e.target.value})}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-500 uppercase ml-1">Data</label>
                  <input type="date" required className="w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl font-bold focus:border-indigo-500" value={formData.date} onChange={e => setFormData({...formData, date: e.target.value})} />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-500 uppercase ml-1">Horário</label>
                  <input type="time" required className="w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl font-bold focus:border-indigo-500" value={formData.time} onChange={e => setFormData({...formData, time: e.target.value})} />
                </div>
              </div>

              <div className="space-y-3">
                <label className="text-[10px] font-black text-slate-500 uppercase ml-1">Modalidade</label>
                <div className="grid grid-cols-2 gap-3">
                   <button 
                    type="button" 
                    onClick={() => setFormData({...formData, modality: 'Online'})}
                    className={`p-4 rounded-2xl font-black text-xs uppercase flex items-center justify-center gap-2 border-2 transition-all ${formData.modality === 'Online' ? 'bg-indigo-600 border-indigo-600 text-white shadow-xl shadow-indigo-100 scale-[1.02]' : 'bg-white border-slate-100 text-slate-400 hover:border-indigo-100'}`}
                   >
                     <Video size={18}/> Online
                   </button>
                   <button 
                    type="button" 
                    onClick={() => setFormData({...formData, modality: 'Presencial'})}
                    className={`p-4 rounded-2xl font-black text-xs uppercase flex items-center justify-center gap-2 border-2 transition-all ${formData.modality === 'Presencial' ? 'bg-amber-500 border-amber-500 text-white shadow-xl shadow-amber-100 scale-[1.02]' : 'bg-white border-slate-100 text-slate-400 hover:border-amber-100'}`}
                   >
                     <MapPin size={18}/> Presencial
                   </button>
                </div>
              </div>

              {formData.modality === 'Online' ? (
                <div className="space-y-2 animate-in fade-in slide-in-from-top-2 duration-300">
                  <label className="text-[10px] font-black text-slate-500 uppercase ml-1 flex items-center gap-2"><Video size={14} className="text-indigo-600"/> Link da Reunião (Meet/Teams)</label>
                  <input required type="url" className="w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl font-mono text-xs font-bold text-indigo-600 focus:border-indigo-500 outline-none transition-all" placeholder="https://meet.google.com/..." value={formData.location_link || ''} onChange={e => setFormData({...formData, location_link: e.target.value})} />
                </div>
              ) : (
                <div className="space-y-2 animate-in fade-in slide-in-from-top-2 duration-300">
                  <label className="text-[10px] font-black text-slate-500 uppercase ml-1 flex items-center gap-2"><MapPin size={14} className="text-amber-600"/> Endereço / Sala</label>
                  <input required className="w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl font-bold text-slate-800 focus:border-amber-500 outline-none transition-all" placeholder="Ex: Auditório Regional - 3º Andar" value={formData.location_address || ''} onChange={e => setFormData({...formData, location_address: e.target.value})} />
                </div>
              )}

              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-500 uppercase ml-1">Observações da Pauta</label>
                <textarea className="w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl font-bold text-slate-800 focus:border-indigo-500 outline-none transition-all min-h-[100px]" placeholder="Itens que serão discutidos..." value={formData.description} onChange={e => setFormData({...formData, description: e.target.value})} />
              </div>

              <div className="pt-6 flex justify-end gap-3 border-t border-slate-50 sticky bottom-0 bg-white">
                <button type="button" onClick={() => setIsModalOpen(false)} className="px-8 py-4 text-slate-400 font-black hover:text-slate-600 transition-all uppercase tracking-widest text-xs">Descartar</button>
                <button 
                  type="submit" 
                  disabled={saveLoading}
                  className="px-12 py-4 bg-indigo-600 text-white rounded-2xl font-black shadow-xl shadow-indigo-100 hover:bg-indigo-700 flex items-center gap-3 active:scale-95 transition-all disabled:opacity-50"
                >
                  {saveLoading ? <Loader2 className="animate-spin" size={20}/> : <Save size={20} />}
                  {editingMeeting ? 'SALVAR ALTERAÇÕES' : 'CONFIRMAR AGENDAMENTO'}
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
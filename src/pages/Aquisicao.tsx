import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { 
  ShoppingBag, Calendar, Clock, 
  Search, 
  Save, Loader2, Trash2, Edit,
  FileSpreadsheet, X, Truck,
  Ban, History, PackageCheck, CheckSquare,
  Building2, ListOrdered, Check,
  ChevronDown, XCircle
} from 'lucide-react';

interface AcquisitionEvent {
  id: string;
  title: string;
  start_date: string;
  end_date: string;
  status: 'ABERTO' | 'FECHADO' | 'CANCELADO' | 'ENVIADO_FDE';
  sent_to_fde_date: string | null;
}

interface Item {
  id: string;
  code: string;
  name: string;
  description: string;
}

interface School {
  id: string;
  name: string;
}

interface Response {
  id?: string;
  event_id: string;
  school_id: string;
  item_id: string;
  requested_qty: number;
  planned_qty: number;
  is_received: boolean;
  received_at: string | null;
  schools?: { name: string };
  items?: { code: string; name: string };
}

export function Aquisicao() {
  const [userRole, setUserRole] = useState('');
  const [userSchoolId, setUserSchoolId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'solicitacao' | 'eventos' | 'itens' | 'consolidado' | 'lancamento'>('solicitacao');
  
  const [events, setEvents] = useState<AcquisitionEvent[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [schools, setSchools] = useState<School[]>([]);
  const [responses, setResponses] = useState<Response[]>([]);
  const [historyMap, setHistoryMap] = useState<Record<string, number>>({}); 
  
  const [isEventModalOpen, setIsEventModalOpen] = useState(false);
  const [saveLoading, setSaveLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [editingEvent, setEditingEvent] = useState<AcquisitionEvent | null>(null);

  // Estados para Lançamento Manual (Admin)
  const [adminSelectedEvent, setAdminSelectedEvent] = useState('');
  const [adminSelectedSchool, setAdminSelectedSchool] = useState('');
  const [manualQuantities, setManualQuantities] = useState<Record<string, number>>({});
  
  // Controle de Expansão de Cards
  const [expandedSchools, setExpandedSchools] = useState<Record<string, boolean>>({});

  // Controle de Alterações não salvas (UI)
  const [pendingSaves, setPendingSaves] = useState<Record<string, boolean>>({});

  const [eventFormData, setEventFormData] = useState({
    title: '',
    start_date: new Date().toISOString().split('T')[0],
    end_date: new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0],
    status: 'ABERTO' as any,
    sent_to_fde_date: ''
  });

  const [quantities, setQuantities] = useState<Record<string, number>>({});

  useEffect(() => {
    fetchInitialData();
  }, []);

  async function fetchInitialData() {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: profile } = await (supabase as any).from('profiles').select('role, school_id').eq('id', user.id).single();
        setUserRole(profile?.role || '');
        setUserSchoolId(profile?.school_id || null);
        
        if (profile?.role === 'regional_admin') {
          setActiveTab('consolidado');
        }
      }

      const { data: schoolsData } = await (supabase as any).from('schools').select('id, name').order('name');
      setSchools(schoolsData || []);

      await refreshData();
    } catch (error) { console.error(error); } finally { setLoading(false); }
  }

  const isAdmin = userRole === 'regional_admin';
  const today = new Date().toISOString().split('T')[0];
  const activeEvent = events.find(e => e.status === 'ABERTO' && today >= e.start_date && today <= e.end_date);

  async function refreshData() {
    const { data: evs } = await (supabase as any).from('acquisition_events').select('*').order('created_at', { ascending: false });
    const { data: its } = await (supabase as any).from('acquisition_items').select('*').order('code');
    setEvents(evs || []);
    setItems(its || []);

    const { data: allResps } = await (supabase as any)
      .from('acquisition_responses')
      .select(`
        id, event_id, school_id, item_id, requested_qty, planned_qty, is_received, received_at,
        schools!acquisition_responses_school_id_fkey(name),
        items:acquisition_items!acquisition_responses_item_id_fkey(code, name)
      `);
    
    setResponses(allResps || []);

    const targetSchool = isAdmin ? adminSelectedSchool : userSchoolId;
    const currentEventId = isAdmin ? adminSelectedEvent : activeEvent?.id;

    if (targetSchool) {
      const hMap: Record<string, number> = {};
      (allResps || []).forEach((r: any) => {
        if (r.school_id === targetSchool && r.event_id !== currentEventId) {
          hMap[r.item_id] = (hMap[r.item_id] || 0) + r.planned_qty;
        }
      });
      setHistoryMap(hMap);

      const qMap: Record<string, number> = {};
      if (currentEventId) {
        (allResps || []).forEach((r: any) => {
          if (r.school_id === targetSchool && r.event_id === currentEventId) {
            qMap[r.item_id] = r.requested_qty;
          }
        });
      }
      
      if (isAdmin) setManualQuantities(qMap);
      else setQuantities(qMap);
      
      setPendingSaves({});
    }
  }

  // --- AGRUPAMENTO DAS RESPOSTAS POR ESCOLA ---
  const groupedResponses = useMemo(() => {
    const groups: Record<string, { schoolName: string, items: Response[] }> = {};
    
    responses.forEach(resp => {
      const schoolName = resp.schools?.name || 'Não informada';
      if (resp.requested_qty > 0) {
        if (!groups[resp.school_id]) {
          groups[resp.school_id] = { schoolName, items: [] };
        }
        groups[resp.school_id].items.push(resp);
      }
    });

    return Object.entries(groups)
      .sort((a, b) => a[1].schoolName.localeCompare(b[1].schoolName))
      .filter(([_, group]) => 
        group.schoolName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        group.items.some(i => i.items?.name?.toLowerCase().includes(searchTerm.toLowerCase()) || i.items?.code?.toLowerCase().includes(searchTerm.toLowerCase()))
      );
  }, [responses, searchTerm]);

  // Inicializa o estado de expansão baseado na necessidade de análise
  useEffect(() => {
    const initialExpansion: Record<string, boolean> = {};
    groupedResponses.forEach(([schoolId, group]) => {
      const hasPendingAnalysis = group.items.some(resp => {
        const event = events.find(e => e.id === resp.event_id);
        const isSent = event?.status === 'ENVIADO_FDE';
        const isCanceled = event?.status === 'CANCELADO';
        const isRejected = resp.planned_qty === 0;
        return !isSent && !isCanceled && !isRejected;
      });
      initialExpansion[schoolId] = hasPendingAnalysis;
    });
    setExpandedSchools(initialExpansion);
  }, [groupedResponses, events]);

  useEffect(() => {
    if (isAdmin && (adminSelectedEvent || adminSelectedSchool)) {
      refreshData();
    }
  }, [adminSelectedEvent, adminSelectedSchool]);

  const filteredItems = useMemo(() => {
    return items.filter(i => 
      i.code.toLowerCase().includes(searchTerm.toLowerCase()) || 
      i.name.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [items, searchTerm]);

  // --- ACÇÕES ADMIN ---

  async function handleSaveEvent(e: React.FormEvent) {
    e.preventDefault();
    setSaveLoading(true);
    try {
      if (editingEvent) {
        await (supabase as any).from('acquisition_events').update(eventFormData).eq('id', editingEvent.id);
      } else {
        await (supabase as any).from('acquisition_events').insert([eventFormData]);
      }
      setIsEventModalOpen(false);
      refreshData();
    } catch (error) { alert("Erro ao guardar evento."); }
    setSaveLoading(false);
  }

  async function updatePlannedQty(respId: string, qty: number) {
    if (qty < 0) return;
    await (supabase as any).from('acquisition_responses').update({ planned_qty: qty }).eq('id', respId);
    setResponses(prev => prev.map(r => r.id === respId ? { ...r, planned_qty: qty } : r));
  }

  async function handleRejectItem(respId: string) {
    if (!confirm("Deseja realmente INDEFERIR este item? A quantidade planejada será zerada.")) return;
    await (supabase as any).from('acquisition_responses').update({ planned_qty: 0 }).eq('id', respId);
    refreshData();
  }

  async function toggleReceived(respId: string, current: boolean) {
    await (supabase as any).from('acquisition_responses').update({ 
      is_received: !current,
      received_at: !current ? new Date().toISOString() : null
    }).eq('id', respId);
    refreshData();
  }

  async function deleteEvent(id: string) {
    if (!confirm("Eliminar este evento e todas as respostas vinculadas?")) return;
    await (supabase as any).from('acquisition_events').delete().eq('id', id);
    refreshData();
  }

  async function confirmManualEntry(itemId: string) {
    if (!adminSelectedEvent || !adminSelectedSchool) return;
    const qty = manualQuantities[itemId] || 0;
    
    setSaveLoading(true);
    if (qty <= 0) {
      await (supabase as any).from('acquisition_responses')
        .delete()
        .eq('event_id', adminSelectedEvent)
        .eq('school_id', adminSelectedSchool)
        .eq('item_id', itemId);
    } else {
      await (supabase as any).from('acquisition_responses').upsert({
        event_id: adminSelectedEvent,
        school_id: adminSelectedSchool,
        item_id: itemId,
        requested_qty: qty,
        planned_qty: qty 
      }, { onConflict: 'event_id,school_id,item_id' });
    }
    
    setPendingSaves(prev => ({ ...prev, [itemId]: false }));
    setSaveLoading(false);
    refreshData();
  }

  async function confirmRequest(itemId: string) {
    if (!activeEvent || !userSchoolId) return;
    const qty = quantities[itemId] || 0;

    setSaveLoading(true);
    if (qty <= 0) {
      await (supabase as any).from('acquisition_responses')
        .delete()
        .eq('event_id', activeEvent.id)
        .eq('school_id', userSchoolId)
        .eq('item_id', itemId);
    } else {
      await (supabase as any).from('acquisition_responses').upsert({
        event_id: activeEvent.id,
        school_id: userSchoolId,
        item_id: itemId,
        requested_qty: qty,
        planned_qty: qty 
      }, { onConflict: 'event_id,school_id,item_id' });
    }
    
    setPendingSaves(prev => ({ ...prev, [itemId]: false }));
    setSaveLoading(false);
    refreshData();
  }

  const toggleSchoolExpansion = (schoolId: string) => {
    setExpandedSchools(prev => ({ ...prev, [schoolId]: !prev[schoolId] }));
  };

  return (
    <div className="space-y-8 pb-20">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="flex items-center gap-4">
          <div className="p-4 bg-emerald-600 rounded-[2rem] text-white shadow-2xl shadow-emerald-100">
            <ShoppingBag size={32} />
          </div>
          <div>
            <h1 className="text-3xl font-black text-slate-900 tracking-tight uppercase leading-none">Gestão FDE</h1>
            <p className="text-slate-500 font-medium mt-1 uppercase text-[10px] tracking-widest italic">Controle de Aquisição e Recebimento</p>
          </div>
        </div>

        <div className="flex gap-2 p-2 bg-slate-100 rounded-2xl border border-slate-200">
          {!isAdmin && <TabButton active={activeTab === 'solicitacao'} onClick={() => setActiveTab('solicitacao')} label="Solicitar" />}
          <TabButton active={activeTab === 'consolidado'} onClick={() => setActiveTab('consolidado')} label="Painel Rede" />
          {isAdmin && (
            <>
              <TabButton active={activeTab === 'lancamento'} onClick={() => setActiveTab('lancamento')} label="Lançamento Manual" />
              <TabButton active={activeTab === 'eventos'} onClick={() => setActiveTab('eventos')} label="Eventos" />
              <TabButton active={activeTab === 'itens'} onClick={() => setActiveTab('itens')} label="Catálogo" />
            </>
          )}
        </div>
      </div>

      <div className="bg-white p-4 rounded-[2rem] border border-slate-100 shadow-sm flex gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
          <input 
            type="text" 
            placeholder="Pesquisar por escola, item ou código..."
            className="w-full pl-12 pr-4 py-3 bg-slate-50 border-none rounded-2xl focus:ring-2 focus:ring-emerald-500 font-medium outline-none"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      {loading ? (
        <div className="py-40 flex justify-center"><Loader2 className="animate-spin text-emerald-600" size={48} /></div>
      ) : (
        <div className="animate-in fade-in duration-500">
          
          {/* ABA: SOLICITAÇÃO (ESCOLA) */}
          {activeTab === 'solicitacao' && (
            <div className="space-y-8">
              {!activeEvent ? (
                <div className="bg-white p-20 rounded-[3rem] border-2 border-dashed border-slate-100 text-center flex flex-col items-center">
                   <div className="w-20 h-20 bg-slate-50 text-slate-200 rounded-full flex items-center justify-center mb-4"><Clock size={40}/></div>
                   <h3 className="text-xl font-black text-slate-400 uppercase tracking-widest">Aguardando novo período de pedido</h3>
                </div>
              ) : (
                <div className="space-y-8">
                  <div className="bg-slate-900 p-10 rounded-[3rem] text-white shadow-2xl relative overflow-hidden">
                    <div className="relative z-10">
                      <span className="bg-emerald-500 px-4 py-1 rounded-full text-[10px] font-black uppercase tracking-widest">Sessão de Pedidos Aberta</span>
                      <h2 className="text-3xl font-black mt-4 uppercase tracking-tight">{activeEvent.title}</h2>
                      <p className="text-emerald-400 text-xs font-bold mt-2 uppercase">Prazo de Resposta: {new Date(activeEvent.end_date + 'T12:00:00').toLocaleDateString()}</p>
                    </div>
                    <ShoppingBag className="absolute -bottom-10 -right-10 text-white/5 w-64 h-64 -rotate-12" />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {filteredItems.map(item => {
                      const currentVal = quantities[item.id] || 0;
                      const hasHistory = (historyMap[item.id] || 0) > 0;
                      const isInvalid = currentVal < 0;
                      const isPending = pendingSaves[item.id];

                      return (
                        <div key={item.id} className={`bg-white p-8 rounded-[2.5rem] border-2 transition-all shadow-xl group flex flex-col relative ${isPending ? 'border-emerald-500' : 'border-slate-100'}`}>
                           {hasHistory && (
                             <div className="absolute top-4 right-4 group-hover:scale-110 transition-transform z-10">
                                <div className="bg-amber-50 text-amber-600 px-3 py-1 rounded-xl text-[8px] font-black uppercase flex items-center gap-1 border border-amber-100 shadow-sm">
                                   <History size={10}/> Já solicitado antes: {historyMap[item.id]} un.
                                </div>
                             </div>
                           )}
                           
                           <div className="inline-flex self-start px-3 py-1 bg-slate-900 text-white rounded-lg font-black text-xs uppercase tracking-wider mb-6 shadow-sm">
                             {item.code}
                           </div>
                           
                           <h3 className="font-black text-slate-800 uppercase text-sm leading-tight mb-2 h-10 line-clamp-2">{item.name}</h3>
                           
                           <div className="relative mt-8 space-y-3">
                             {isInvalid && (
                               <div className="absolute -top-6 left-2 animate-bounce">
                                 <span className="bg-red-600 text-white text-[8px] font-black px-2 py-0.5 rounded-full shadow-lg">NÚMERO INVÁLIDO</span>
                               </div>
                             )}
                             <div className={`flex items-center gap-4 p-4 rounded-2xl border-2 transition-all shadow-inner ${isInvalid ? 'bg-red-50 border-red-500' : isPending ? 'bg-emerald-50 border-emerald-300' : 'bg-slate-100 border-slate-200'}`}>
                                <span className={`text-[10px] font-black uppercase tracking-widest ml-1 shrink-0 ${isInvalid ? 'text-red-500' : 'text-slate-500'}`}>Quantidade:</span>
                                <input 
                                  type="number" 
                                  min="0" 
                                  className={`w-full bg-transparent font-black text-right outline-none text-2xl ${isInvalid ? 'text-red-600' : 'text-emerald-600'}`}
                                  value={currentVal || ''}
                                  placeholder="0"
                                  onChange={(e) => {
                                    const val = Number(e.target.value);
                                    setQuantities(prev => ({ ...prev, [item.id]: val }));
                                    setPendingSaves(prev => ({ ...prev, [item.id]: true }));
                                  }}
                                />
                             </div>
                             
                             {isPending && !isInvalid && (
                               <button 
                                 onClick={() => confirmRequest(item.id)}
                                 className="w-full py-3 bg-emerald-600 text-white rounded-xl font-black text-[10px] uppercase shadow-lg shadow-emerald-100 flex items-center justify-center gap-2 hover:bg-emerald-700 active:scale-95 transition-all"
                               >
                                 <Check size={14}/> Gravar Solicitação
                               </button>
                             )}
                           </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ABA: LANÇAMENTO MANUAL (EXCLUSIVO ADMIN) */}
          {activeTab === 'lancamento' && isAdmin && (
            <div className="space-y-8">
               <div className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-xl grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                     <label className="text-[10px] font-black text-slate-400 uppercase ml-1 flex items-center gap-2"><Calendar size={12}/> 1. Seleccione o Evento (Pode ser Antigo)</label>
                     <select 
                        className="w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl font-bold outline-none focus:border-indigo-500"
                        value={adminSelectedEvent}
                        onChange={e => { setAdminSelectedEvent(e.target.value); }}
                     >
                        <option value="">Seleccione o Evento...</option>
                        {events.map(e => <option key={e.id} value={e.id}>{e.title} ({e.status})</option>)}
                     </select>
                  </div>
                  <div className="space-y-2">
                     <label className="text-[10px] font-black text-slate-400 uppercase ml-1 flex items-center gap-2"><Building2 size={12}/> 2. Seleccione a Unidade Escolar</label>
                     <select 
                        className="w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl font-bold outline-none focus:border-indigo-500"
                        value={adminSelectedSchool}
                        onChange={e => { setAdminSelectedSchool(e.target.value); }}
                     >
                        <option value="">Seleccione a Escola...</option>
                        {schools.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                     </select>
                  </div>
               </div>

               {adminSelectedEvent && adminSelectedSchool ? (
                 <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 animate-in slide-in-from-bottom-4 duration-500">
                    {filteredItems.map(item => {
                       const existing = responses.find(r => r.event_id === adminSelectedEvent && r.school_id === adminSelectedSchool && r.item_id === item.id);
                       const currentVal = manualQuantities[item.id] || 0;
                       const hasHistory = (historyMap[item.id] || 0) > 0;
                       const isInvalid = currentVal < 0;
                       const isPending = pendingSaves[item.id];

                       return (
                         <div key={item.id} className={`bg-white p-6 rounded-[2.5rem] border-2 transition-all shadow-xl flex flex-col relative group ${isPending ? 'border-indigo-500' : 'border-slate-100'}`}>
                            {hasHistory && (
                              <div className="absolute top-4 right-4">
                                 <div className="bg-amber-50 text-amber-600 px-2 py-0.5 rounded-lg text-[7px] font-black uppercase border border-amber-100">Solicitado Anterior: {historyMap[item.id]}</div>
                              </div>
                            )}
                            <div className="inline-flex self-start px-2 py-0.5 bg-slate-900 text-white rounded-md font-black text-[11px] uppercase tracking-wider mb-4 shadow-sm">
                              {item.code}
                            </div>
                            <h3 className="font-black text-slate-800 uppercase text-xs leading-tight line-clamp-2 h-10">{item.name}</h3>
                            
                            <div className="relative mt-6 space-y-3">
                               {isInvalid && (
                                 <div className="absolute -top-5 left-1 animate-bounce">
                                   <span className="bg-red-600 text-white text-[7px] font-black px-2 py-0.5 rounded-full shadow-lg">NÚMERO INVÁLIDO</span>
                                 </div>
                               )}
                               <div className={`p-4 rounded-2xl border-2 flex items-center gap-3 shadow-inner transition-all ${isInvalid ? 'bg-red-50 border-red-500' : isPending ? 'bg-indigo-50 border-indigo-300' : 'bg-slate-100 border-slate-200'}`}>
                                  <span className={`text-[9px] font-black uppercase shrink-0 ${isInvalid ? 'text-red-500' : 'text-slate-500'}`}>Qtde Final:</span>
                                  <input 
                                     type="number"
                                     className={`w-full bg-transparent font-black text-right outline-none text-2xl ${isInvalid ? 'text-red-600' : 'text-indigo-700'}`}
                                     value={currentVal || ''}
                                     placeholder="0"
                                     onChange={e => {
                                        const val = Number(e.target.value);
                                        setManualQuantities(prev => ({ ...prev, [item.id]: val }));
                                        setPendingSaves(prev => ({ ...prev, [item.id]: true }));
                                     }}
                                  />
                               </div>

                               {isPending && !isInvalid && (
                                 <button 
                                   onClick={() => confirmManualEntry(item.id)}
                                   className="w-full py-3 bg-indigo-600 text-white rounded-xl font-black text-[10px] uppercase shadow-lg shadow-indigo-100 flex items-center justify-center gap-2 hover:bg-indigo-700 active:scale-95 transition-all"
                                 >
                                   <Check size={14}/> Confirmar Ajuste
                                 </button>
                               )}
                            </div>
                         </div>
                       );
                    })}
                 </div>
               ) : (
                 <div className="py-32 bg-white rounded-[3rem] border-2 border-dashed border-slate-100 text-center flex flex-col items-center">
                    <ListOrdered size={48} className="text-slate-100 mb-4"/>
                    <p className="text-slate-400 font-black uppercase text-xs tracking-widest">Seleccione um evento e uma escola para iniciar o lançamento retroativo.</p>
                 </div>
               )}
            </div>
          )}

          {/* ABA: CONSOLIDADO (AGRUPADO POR ESCOLA COM ACCORDION) */}
          {activeTab === 'consolidado' && (
            <div className="space-y-10">
               <div className="bg-white p-8 rounded-[3rem] border border-slate-100 shadow-2xl flex flex-col md:flex-row justify-between items-center gap-4">
                  <div>
                    <h2 className="text-2xl font-black text-slate-800 uppercase tracking-tight">Painel de Acompanhamento Rede</h2>
                    <p className="text-[10px] text-slate-400 font-bold uppercase mt-1 tracking-widest">Conferência Individualizada por Unidade Escolar</p>
                  </div>
                  <div className="flex gap-2">
                     <button className="bg-slate-900 text-white px-6 py-3 rounded-2xl text-[10px] font-black uppercase flex items-center gap-2 shadow-lg hover:bg-black transition-all"><FileSpreadsheet size={18}/> Baixar CSV Geral</button>
                  </div>
               </div>

               {groupedResponses.length === 0 ? (
                 <div className="bg-white py-32 rounded-[3rem] border-2 border-dashed border-slate-100 text-center">
                    <Building2 size={48} className="mx-auto text-slate-100 mb-4"/>
                    <p className="text-slate-400 font-black uppercase text-xs">Nenhuma solicitação activa no sistema.</p>
                 </div>
               ) : (
                 <div className="space-y-6">
                    {groupedResponses.map(([schoolId, group]) => {
                      const isExpanded = expandedSchools[schoolId];
                      return (
                        <div key={schoolId} className={`bg-white rounded-[2.5rem] border transition-all shadow-xl overflow-hidden ${isExpanded ? 'border-indigo-400' : 'border-slate-100 hover:border-slate-300'}`}>
                           {/* Cabeçalho do Accordion */}
                           <button 
                             onClick={() => toggleSchoolExpansion(schoolId)}
                             className="w-full p-6 bg-slate-50 flex items-center justify-between transition-colors hover:bg-slate-100"
                           >
                              <div className="flex items-center gap-4">
                                 <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shadow-sm border ${isExpanded ? 'bg-indigo-600 text-white border-indigo-500' : 'bg-white text-emerald-600 border-emerald-50'}`}>
                                   <Building2 size={24}/>
                                 </div>
                                 <div className="text-left">
                                    <h3 className={`font-black uppercase tracking-tight ${isExpanded ? 'text-indigo-600' : 'text-slate-800'}`}>{group.schoolName}</h3>
                                    <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">{group.items.length} Itens Solicitados</span>
                                 </div>
                              </div>
                              <div className={`p-2 rounded-full transition-transform duration-300 ${isExpanded ? 'rotate-180 bg-indigo-100 text-indigo-600' : 'bg-slate-200 text-slate-400'}`}>
                                 <ChevronDown size={20}/>
                              </div>
                           </button>
                           
                           {/* Conteúdo Expansível */}
                           {isExpanded && (
                             <div className="animate-in slide-in-from-top-2 duration-300">
                                <div className="overflow-x-auto">
                                   <table className="w-full text-left text-sm">
                                      <thead className="bg-white text-[9px] font-black text-slate-400 uppercase tracking-widest border-b">
                                         <tr>
                                            <th className="p-5 pl-8">Código / Item</th>
                                            <th className="p-5 text-center">Pedida Escola</th>
                                            <th className="p-5 text-center">Planejado Regional</th>
                                            <th className="p-5 text-center">Status FDE</th>
                                            <th className="p-5 text-right pr-8">Acções de Gestão</th>
                                         </tr>
                                      </thead>
                                      <tbody className="divide-y divide-slate-100">
                                         {group.items.map(resp => {
                                           const event = events.find(e => e.id === resp.event_id);
                                           const isSent = event?.status === 'ENVIADO_FDE';
                                           const isCanceled = event?.status === 'CANCELADO';
                                           const isRejected = resp.planned_qty === 0;

                                           return (
                                             <tr key={resp.id} className={`hover:bg-slate-50/50 transition-colors ${resp.is_received ? 'bg-emerald-50/10' : isRejected ? 'bg-red-50/10' : ''}`}>
                                               <td className="p-5 pl-8">
                                                 <div className="flex items-center gap-3">
                                                    <span className={`text-[10px] font-black px-2 py-1 rounded-md shrink-0 ${isRejected ? 'bg-red-100 text-red-600' : 'bg-emerald-50 text-emerald-600'}`}>{resp.items?.code}</span>
                                                    <div>
                                                       <p className={`font-bold uppercase text-[10px] ${isRejected ? 'text-red-400 line-through' : 'text-slate-700'}`}>{resp.items?.name}</p>
                                                       <span className="text-[8px] text-slate-400 uppercase">{event?.title}</span>
                                                    </div>
                                                 </div>
                                               </td>
                                               <td className="p-5 text-center">
                                                 <span className="font-black text-slate-400 text-xs">{resp.requested_qty}</span>
                                               </td>
                                               <td className="p-5 text-center">
                                                 {isAdmin && !isSent ? (
                                                   <input 
                                                     type="number" 
                                                     min="0"
                                                     className={`w-20 p-2 border-2 rounded-xl font-black text-center focus:border-indigo-500 outline-none transition-all ${isRejected ? 'border-red-200 text-red-600' : 'border-slate-200 text-slate-800'}`}
                                                     value={resp.planned_qty}
                                                     onChange={(e) => updatePlannedQty(resp.id!, Number(e.target.value))}
                                                   />
                                                 ) : (
                                                   <span className={`font-black text-lg ${isRejected ? 'text-red-600' : 'text-slate-800'}`}>{resp.planned_qty}</span>
                                                 )}
                                               </td>
                                               <td className="p-5 text-center">
                                                  {isSent ? (
                                                    <span className="text-[8px] font-black text-blue-600 bg-blue-50 px-2 py-1 rounded-lg uppercase">Pedido Enviado</span>
                                                  ) : isCanceled ? (
                                                    <span className="text-[8px] font-black text-red-500 bg-red-50 px-2 py-1 rounded-lg uppercase">Cancelado</span>
                                                  ) : isRejected ? (
                                                    <span className="text-[8px] font-black text-red-600 bg-red-50 px-2 py-1 rounded-lg uppercase flex items-center justify-center gap-1"><XCircle size={10}/> Indeferido</span>
                                                  ) : (
                                                    <span className="text-[8px] font-black text-amber-500 bg-amber-50 px-2 py-1 rounded-lg uppercase">Em Análise</span>
                                                  )}
                                               </td>
                                               <td className="p-5 text-right pr-8">
                                                  <div className="flex items-center justify-end gap-2">
                                                     {isAdmin && !isSent && !isRejected && !isCanceled && (
                                                       <button 
                                                         onClick={() => handleRejectItem(resp.id!)}
                                                         className="p-2 text-slate-300 hover:text-red-500 transition-colors"
                                                         title="Indeferir Solicitação"
                                                       >
                                                          <Ban size={18}/>
                                                       </button>
                                                     )}
                                                     
                                                     {isSent && !isRejected ? (
                                                       <button 
                                                         onClick={() => toggleReceived(resp.id!, resp.is_received)}
                                                         className={`flex items-center gap-2 px-3 py-1.5 rounded-xl font-black text-[9px] uppercase transition-all ${
                                                           resp.is_received 
                                                             ? 'bg-emerald-600 text-white shadow-sm' 
                                                             : 'bg-slate-100 text-slate-400 hover:bg-slate-200'
                                                         }`}
                                                       >
                                                         {resp.is_received ? <PackageCheck size={14}/> : <CheckSquare size={14}/>}
                                                         {resp.is_received ? 'Recebido' : 'Confirmar'}
                                                       </button>
                                                     ) : !isRejected && !isCanceled && (
                                                       <div className="px-3">
                                                          <span className="text-[8px] font-black text-slate-300 uppercase italic">Aguardando Envio FDE</span>
                                                       </div>
                                                     )}
                                                  </div>
                                               </td>
                                             </tr>
                                           );
                                         })}
                                      </tbody>
                                   </table>
                                </div>
                             </div>
                           )}
                        </div>
                      );
                    })}
                 </div>
               )}
            </div>
          )}

          {/* ABA: EVENTOS (ADMIN) */}
          {activeTab === 'eventos' && isAdmin && (
            <div className="space-y-6">
              <div className="bg-white p-10 rounded-[3rem] border-2 border-dashed border-slate-100 flex flex-col items-center justify-center text-center">
                 <button onClick={() => { setEditingEvent(null); setEventFormData({title: '', start_date: today, end_date: today, status: 'ABERTO', sent_to_fde_date: ''}); setIsEventModalOpen(true); }} className="bg-emerald-600 text-white px-10 py-5 rounded-[2rem] font-black uppercase text-xs shadow-xl hover:scale-105 transition-all">Abrir Nova Janela de Pedidos</button>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {events.map(ev => (
                  <div key={ev.id} className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-xl space-y-6 group hover:border-emerald-300 transition-all">
                     <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                           <div className={`p-4 rounded-2xl ${ev.status === 'ABERTO' ? 'bg-emerald-50 text-emerald-600' : ev.status === 'CANCELADO' ? 'bg-red-50 text-red-400' : 'bg-blue-50 text-blue-600'}`}><Calendar size={24}/></div>
                           <div>
                              <h3 className="font-black text-slate-800 uppercase tracking-tight">{ev.title}</h3>
                              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                                Período: {new Date(ev.start_date + 'T12:00:00').toLocaleDateString()} a {new Date(ev.end_date + 'T12:00:00').toLocaleDateString()}
                              </p>
                           </div>
                        </div>
                        <div className="flex gap-1">
                           <button onClick={() => { setEditingEvent(ev); setEventFormData({...ev, sent_to_fde_date: ev.sent_to_fde_date || ''}); setIsEventModalOpen(true); }} className="p-2 text-slate-300 hover:text-indigo-600 transition-colors"><Edit size={18}/></button>
                           <button onClick={() => deleteEvent(ev.id)} className="p-2 text-slate-300 hover:text-red-500 transition-colors"><Trash2 size={18}/></button>
                        </div>
                     </div>

                     <div className="grid grid-cols-2 gap-3">
                        <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
                           <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Status Actual</p>
                           <div className="flex items-center gap-2 mt-1">
                              <div className={`w-2 h-2 rounded-full ${ev.status === 'ABERTO' ? 'bg-emerald-500 animate-pulse' : ev.status === 'CANCELADO' ? 'bg-red-500' : 'bg-blue-500'}`} />
                              <span className="text-[10px] font-black text-slate-700 uppercase">{ev.status.replace('_', ' ')}</span>
                           </div>
                        </div>
                        <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
                           <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Data Envio FDE</p>
                           <p className="text-[10px] font-black text-slate-700 uppercase mt-1">{ev.sent_to_fde_date ? new Date(ev.sent_to_fde_date + 'T12:00:00').toLocaleDateString() : 'NÃO ENVIADO'}</p>
                        </div>
                     </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ABA: CATALOGO (ADMIN) */}
          {activeTab === 'itens' && isAdmin && (
             <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {filteredItems.map(item => (
                  <div key={item.id} className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm flex items-start gap-4">
                     <div className="px-2 py-1 bg-slate-900 text-white rounded-lg flex items-center justify-center font-black text-[10px] shrink-0 shadow-sm">{item.code}</div>
                     <div className="flex-1">
                        <h4 className="text-[10px] font-black text-slate-800 uppercase leading-tight line-clamp-2">{item.name}</h4>
                        <div className="mt-2 pt-2 border-t border-slate-50 flex items-center justify-between">
                           <span className="text-[8px] font-bold text-slate-400 uppercase">Catalogado FDE</span>
                        </div>
                     </div>
                  </div>
                ))}
             </div>
          )}
        </div>
      )}

      {/* Modal Evento (Criar/Editar) */}
      {isEventModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/80 backdrop-blur-sm p-4">
          <div className="bg-white rounded-[3rem] w-full max-w-xl shadow-2xl overflow-hidden animate-in zoom-in-95">
             <div className="p-8 border-b bg-emerald-50 text-emerald-700 flex justify-between items-center">
                <h2 className="text-xl font-black uppercase tracking-tight">{editingEvent ? 'Editar Evento' : 'Nova Janela de Pedidos'}</h2>
                <button onClick={() => setIsEventModalOpen(false)} className="hover:bg-white p-2 rounded-full transition-all"><X size={20}/></button>
             </div>
             <form onSubmit={handleSaveEvent} className="p-8 space-y-6">
                <div className="space-y-2">
                   <label className="text-[10px] font-black text-slate-400 uppercase ml-1">Título do Levantamento</label>
                   <input required className="w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl font-bold text-slate-800 focus:border-indigo-500 outline-none transition-all" placeholder="Ex: Mobiliário 2026 - Reposição" value={eventFormData.title} onChange={e => setEventFormData({...eventFormData, title: e.target.value})} />
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase ml-1">Início</label>
                    <input type="date" required className="w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl font-bold" value={eventFormData.start_date} onChange={e => setEventFormData({...eventFormData, start_date: e.target.value})} />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase ml-1">Fim</label>
                    <input type="date" required className="w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl font-bold" value={eventFormData.end_date} onChange={e => setEventFormData({...eventFormData, end_date: e.target.value})} />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase ml-1">Status do Processo</label>
                    <select className="w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl font-bold" value={eventFormData.status} onChange={e => setEventFormData({...eventFormData, status: e.target.value as any})}>
                       <option value="ABERTO">ABERTO (Escolas Pedindo)</option>
                       <option value="FECHADO">FECHADO (Análise Regional)</option>
                       <option value="ENVIADO_FDE">ENVIADO PARA FDE</option>
                       <option value="CANCELADO">CANCELADO / NEGADO</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase ml-1 flex items-center gap-2"><Truck size={12}/> Data Envio FDE</label>
                    <input type="date" className="w-full p-4 bg-blue-50/30 border-2 border-blue-100 rounded-2xl font-bold text-blue-700" value={eventFormData.sent_to_fde_date || ''} onChange={e => setEventFormData({...eventFormData, sent_to_fde_date: e.target.value})} />
                  </div>
                </div>

                <button type="submit" disabled={saveLoading} className="w-full py-5 bg-emerald-600 text-white rounded-[1.5rem] font-black shadow-xl hover:bg-emerald-700 transition-all flex justify-center items-center gap-2 uppercase tracking-widest text-[10px]">
                   {saveLoading ? <Loader2 className="animate-spin"/> : <Save size={18}/>}
                   {editingEvent ? 'ACTUALIZAR EVENTO' : 'LANÇAR NO SISTEMA'}
                </button>
             </form>
          </div>
        </div>
      )}
    </div>
  );
}

function TabButton({ active, onClick, label }: any) {
  return (
    <button onClick={onClick} className={`px-6 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${active ? 'bg-white text-emerald-600 shadow-sm border border-emerald-50' : 'text-slate-400 hover:text-emerald-500'}`}>{label}</button>
  );
}

export default Aquisicao;
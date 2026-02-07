import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { 
  ShoppingBag, Calendar, Clock, 
  CheckCircle2,Search, 
  Loader2, 
  FileSpreadsheet, X
} from 'lucide-react';

interface AcquisitionEvent {
  id: string;
  title: string;
  start_date: string;
  end_date: string;
  status: 'ABERTO' | 'FECHADO';
}

interface Item {
  id: string;
  code: string;
  name: string;
  description: string;
}

interface Response {
  id?: string;
  event_id: string;
  school_id: string;
  item_id: string;
  requested_qty: number;
  planned_qty: number;
  schools?: { name: string };
  items?: { code: string; name: string };
}

export function Aquisicao() {
  const [userRole, setUserRole] = useState('');
  const [userSchoolId, setUserSchoolId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'solicitacao' | 'eventos' | 'itens' | 'consolidado'>('solicitacao');
  
  const [events, setEvents] = useState<AcquisitionEvent[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [responses, setResponses] = useState<Response[]>([]);
  
  const [isEventModalOpen, setIsEventModalOpen] = useState(false);
  const [saveLoading, setSaveLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  
  // Estados de formulário
  const [eventFormData, setEventFormData] = useState({
    title: '',
    start_date: new Date().toISOString().split('T')[0],
    end_date: new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0],
    status: 'ABERTO' as any
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
        
        if (profile?.role !== 'regional_admin') {
          setActiveTab('solicitacao');
        } else {
          setActiveTab('consolidado');
        }
      }

      await refreshData();
    } catch (error) { console.error(error); } finally { setLoading(false); }
  }

  async function refreshData() {
    const { data: evs } = await (supabase as any).from('acquisition_events').select('*').order('created_at', { ascending: false });
    const { data: its } = await (supabase as any).from('acquisition_items').select('*').order('code');
    setEvents(evs || []);
    setItems(its || []);

    if (userRole === 'regional_admin') {
      const { data: resps } = await (supabase as any)
        .from('acquisition_responses')
        .select(`
          id, event_id, school_id, item_id, requested_qty, planned_qty,
          schools!acquisition_responses_school_id_fkey(name),
          items:acquisition_items!acquisition_responses_item_id_fkey(code, name)
        `);
      setResponses(resps || []);
    } else if (userSchoolId) {
      const { data: resps } = await (supabase as any).from('acquisition_responses').select('*').eq('school_id', userSchoolId);
      const qMap: Record<string, number> = {};
      (resps || []).forEach((r: any) => {
        qMap[`${r.event_id}_${r.item_id}`] = r.requested_qty;
      });
      setQuantities(qMap);
    }
  }

  const isAdmin = userRole === 'regional_admin';
  const today = new Date().toISOString().split('T')[0];
  const activeEvent = events.find(e => e.status === 'ABERTO' && today >= e.start_date && today <= e.end_date);

  // Filtro de catálogo e solicitações
  const filteredItems = useMemo(() => {
    return items.filter(i => 
      i.code.toLowerCase().includes(searchTerm.toLowerCase()) || 
      i.name.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [items, searchTerm]);

  const filteredResponses = useMemo(() => {
    return responses.filter(r => 
      r.schools?.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      r.items?.code.toLowerCase().includes(searchTerm.toLowerCase()) ||
      r.items?.name.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [responses, searchTerm]);

  // --- AÇÕES ADMIN ---
  async function handleCreateEvent(e: React.FormEvent) {
    e.preventDefault();
    setSaveLoading(true);
    await (supabase as any).from('acquisition_events').insert([eventFormData]);
    setIsEventModalOpen(false);
    refreshData();
    setSaveLoading(false);
  }

  async function updatePlannedQty(respId: string, qty: number) {
    await (supabase as any).from('acquisition_responses').update({ planned_qty: qty }).eq('id', respId);
    setResponses(prev => prev.map(r => r.id === respId ? { ...r, planned_qty: qty } : r));
  }

  // --- AÇÕES ESCOLA ---
  async function saveRequest(eventId: string, itemId: string, qty: number) {
    if (!userSchoolId) return;
    const { error } = await (supabase as any).from('acquisition_responses').upsert({
      event_id: eventId,
      school_id: userSchoolId,
      item_id: itemId,
      requested_qty: qty,
      planned_qty: qty 
    }, { onConflict: 'event_id,school_id,item_id' });
    
    if (!error) {
      setQuantities(prev => ({ ...prev, [`${eventId}_${itemId}`]: qty }));
    }
  }

  return (
    <div className="space-y-8 pb-20">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="flex items-center gap-4">
          <div className="p-4 bg-emerald-600 rounded-[2rem] text-white shadow-2xl shadow-emerald-100">
            <ShoppingBag size={32} />
          </div>
          <div>
            <h1 className="text-3xl font-black text-slate-900 tracking-tight uppercase leading-none">Aquisição FDE</h1>
            <p className="text-slate-500 font-medium mt-1 uppercase text-[10px] tracking-widest italic">Análise técnica de mobiliário e equipamentos</p>
          </div>
        </div>

        {isAdmin && (
          <div className="flex gap-2 p-2 bg-slate-100 rounded-2xl border border-slate-200">
            <TabButton active={activeTab === 'consolidado'} onClick={() => { setActiveTab('consolidado'); setSearchTerm(''); }} label="Consolidado" />
            <TabButton active={activeTab === 'eventos'} onClick={() => { setActiveTab('eventos'); setSearchTerm(''); }} label="Eventos" />
            <TabButton active={activeTab === 'itens'} onClick={() => { setActiveTab('itens'); setSearchTerm(''); }} label="Catálogo FDE" />
          </div>
        )}
      </div>

      {/* Barra de Busca Dinâmica */}
      <div className="bg-white p-4 rounded-[2rem] border border-slate-100 shadow-sm">
        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
          <input 
            type="text" 
            placeholder={activeTab === 'consolidado' ? "Filtrar por escola ou item..." : "Pesquisar item no catálogo FDE..."}
            className="w-full pl-12 pr-4 py-3 bg-slate-50 border-none rounded-2xl focus:ring-2 focus:ring-emerald-500 font-medium outline-none transition-all"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      {loading ? (
        <div className="py-40 flex justify-center"><Loader2 className="animate-spin text-emerald-600" size={48} /></div>
      ) : (
        <div className="animate-in fade-in duration-500">
          
          {/* VISÃO GESTOR / SOLICITAÇÃO */}
          {activeTab === 'solicitacao' && (
            <div className="space-y-8">
              {!activeEvent ? (
                <div className="bg-white p-20 rounded-[3rem] border-2 border-dashed border-slate-100 text-center flex flex-col items-center">
                   <div className="w-20 h-20 bg-slate-50 text-slate-200 rounded-full flex items-center justify-center mb-4"><Clock size={40}/></div>
                   <h3 className="text-xl font-black text-slate-400 uppercase tracking-widest">Nenhuma janela de aquisição aberta</h3>
                   <p className="text-slate-400 text-sm mt-2">Aguarde a abertura de um novo período de solicitação pela Administração Regional.</p>
                </div>
              ) : (
                <div className="space-y-8">
                  <div className="bg-emerald-600 p-10 rounded-[3rem] text-white shadow-2xl relative overflow-hidden">
                    <div className="relative z-10">
                      <span className="bg-white/20 px-4 py-1 rounded-full text-[10px] font-black uppercase tracking-widest">Janela Ativa</span>
                      <h2 className="text-3xl font-black mt-4 uppercase tracking-tight">{activeEvent.title}</h2>
                      <div className="flex items-center gap-6 mt-6">
                        <div className="flex items-center gap-2 text-sm font-bold text-emerald-100"><Calendar size={18}/> Prazo Final: {new Date(activeEvent.end_date + 'T12:00:00').toLocaleDateString()}</div>
                        <div className="w-px h-4 bg-white/20"></div>
                        <div className="text-sm font-bold text-emerald-100 uppercase">{items.length} Itens no Catálogo</div>
                      </div>
                    </div>
                    <ShoppingBag className="absolute -bottom-10 -right-10 text-white/10 w-64 h-64 -rotate-12" />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {filteredItems.map(item => {
                      const currentVal = quantities[`${activeEvent.id}_${item.id}`] || 0;
                      return (
                        <div key={item.id} className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-xl group hover:border-emerald-300 transition-all flex flex-col">
                           <div className="flex justify-between items-start mb-6">
                              <div className="w-12 h-12 bg-emerald-50 text-emerald-600 rounded-2xl flex items-center justify-center font-black text-[10px]">{item.code}</div>
                              <CheckCircle2 className={currentVal > 0 ? 'text-emerald-500' : 'text-slate-100'} size={24} />
                           </div>
                           <h3 className="font-black text-slate-800 uppercase text-xs leading-tight mb-2 h-8 line-clamp-2">{item.name}</h3>
                           <p className="text-[10px] text-slate-400 font-bold uppercase tracking-tighter mb-8">Padrão FDE</p>
                           
                           <div className="mt-auto flex items-center gap-4 bg-slate-50 p-3 rounded-2xl border border-slate-100 focus-within:border-emerald-500 transition-colors">
                              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">Necessário:</span>
                              <input 
                                type="number" 
                                min="0" 
                                className="flex-1 bg-transparent font-black text-emerald-600 text-right outline-none text-xl"
                                value={currentVal || ''}
                                placeholder="0"
                                onChange={(e) => saveRequest(activeEvent.id, item.id, Number(e.target.value))}
                              />
                           </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* VISÃO ADMIN: CONSOLIDADO */}
          {activeTab === 'consolidado' && isAdmin && (
            <div className="bg-white rounded-[3rem] border border-slate-100 shadow-2xl overflow-hidden">
               <div className="p-8 bg-slate-50 border-b border-slate-100 flex justify-between items-center">
                  <div>
                    <h2 className="text-xl font-black text-slate-800 uppercase tracking-tight">Análise de Pedidos Rede</h2>
                    <p className="text-[10px] text-slate-400 font-bold uppercase mt-1">Definição de quantidades finais para FDE</p>
                  </div>
                  <div className="flex gap-2">
                     <button className="bg-slate-900 text-white px-5 py-2 rounded-xl text-[10px] font-black uppercase flex items-center gap-2"><FileSpreadsheet size={16}/> Baixar CSV</button>
                  </div>
               </div>
               <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="bg-white text-[10px] font-black text-slate-400 uppercase tracking-widest border-b">
                        <th className="p-6">Unidade Escolar</th>
                        <th className="p-6">Item</th>
                        <th className="p-6 text-center">Pedida Escola</th>
                        <th className="p-6 text-center">Planejado Regional</th>
                        <th className="p-6 text-right">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filteredResponses.length === 0 ? (
                        <tr><td colSpan={5} className="p-20 text-center text-slate-300 font-bold uppercase">Nenhum pedido registrado ou encontrado</td></tr>
                      ) : filteredResponses.map(resp => (
                        <tr key={resp.id} className="hover:bg-slate-50/50 transition-colors">
                          <td className="p-6 font-black text-slate-700 uppercase text-xs">{resp.schools?.name}</td>
                          <td className="p-6">
                            <span className="text-[10px] font-black text-emerald-600 bg-emerald-50 px-2 py-1 rounded-md mr-2">{resp.items?.code}</span>
                            <span className="font-bold text-slate-500 uppercase text-[10px]">{resp.items?.name}</span>
                          </td>
                          <td className="p-6 text-center">
                            <span className="bg-slate-100 px-3 py-1 rounded-full font-black text-slate-600 text-xs">{resp.requested_qty}</span>
                          </td>
                          <td className="p-6 text-center">
                            <input 
                              type="number" 
                              className={`w-20 p-2 border-2 rounded-xl font-black text-center outline-none transition-all ${resp.planned_qty < resp.requested_qty ? 'border-amber-400 bg-amber-50 text-amber-700' : 'border-emerald-200 bg-white text-emerald-700'}`}
                              value={resp.planned_qty}
                              onChange={(e) => updatePlannedQty(resp.id!, Number(e.target.value))}
                            />
                          </td>
                          <td className="p-6 text-right">
                             {resp.planned_qty !== resp.requested_qty ? (
                               <div className="flex flex-col items-end">
                                 <span className="text-[8px] font-black text-amber-500 uppercase bg-amber-50 px-2 py-0.5 rounded-md border border-amber-100">Corte Técnico</span>
                                 <span className="text-[7px] text-slate-400 font-bold mt-1">-{resp.requested_qty - resp.planned_qty} un.</span>
                               </div>
                             ) : (
                               <span className="text-[8px] font-black text-emerald-500 uppercase bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-100">Mantido</span>
                             )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
               </div>
            </div>
          )}

          {/* VISÃO ADMIN: CATALOGO */}
          {activeTab === 'itens' && isAdmin && (
             <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {filteredItems.map(item => (
                  <div key={item.id} className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm flex items-start gap-4">
                     <div className="w-10 h-10 bg-slate-900 text-white rounded-xl flex items-center justify-center font-black text-[9px] shrink-0">{item.code}</div>
                     <div>
                        <h4 className="text-[10px] font-black text-slate-800 uppercase leading-tight line-clamp-2">{item.name}</h4>
                        <p className="text-[8px] text-slate-400 font-bold uppercase mt-1">ID: {item.id.substring(0,8)}</p>
                     </div>
                  </div>
                ))}
             </div>
          )}

          {/* VISÃO ADMIN: EVENTOS */}
          {activeTab === 'eventos' && isAdmin && (
            <div className="space-y-6">
              <div className="bg-white p-10 rounded-[3rem] border-2 border-dashed border-slate-100 flex flex-col items-center justify-center text-center">
                 <button onClick={() => setIsEventModalOpen(true)} className="bg-emerald-600 text-white px-10 py-5 rounded-[2rem] font-black uppercase text-xs shadow-xl shadow-emerald-100 hover:scale-105 transition-all">Abrir Nova Janela de Pedidos</button>
                 <p className="mt-4 text-xs font-bold text-slate-400 uppercase tracking-widest">Defina prazos para a rede responder sobre mobiliários.</p>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {events.map(ev => (
                  <div key={ev.id} className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-xl flex items-center justify-between group hover:border-emerald-300 transition-all">
                     <div className="flex items-center gap-6">
                        <div className={`p-4 rounded-2xl ${ev.status === 'ABERTO' ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-50 text-slate-300'}`}><Calendar size={24}/></div>
                        <div>
                           <h3 className="font-black text-slate-800 uppercase tracking-tight">{ev.title}</h3>
                           <p className="text-[10px] font-bold text-slate-400 mt-1 uppercase tracking-widest">
                             Expira em: {new Date(ev.end_date + 'T12:00:00').toLocaleDateString()}
                           </p>
                        </div>
                     </div>
                     <span className={`px-4 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest ${ev.status === 'ABERTO' ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-100' : 'bg-slate-200 text-slate-500'}`}>
                        {ev.status}
                     </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Modal Evento */}
      {isEventModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/80 backdrop-blur-sm p-4">
          <div className="bg-white rounded-[3rem] w-full max-w-lg shadow-2xl overflow-hidden animate-in zoom-in-95">
             <div className="p-8 border-b bg-emerald-50 text-emerald-700 flex justify-between items-center">
                <h2 className="text-xl font-black uppercase tracking-tight">Configurar Janela FDE</h2>
                <button onClick={() => setIsEventModalOpen(false)} className="p-2 hover:bg-white rounded-full text-emerald-300 hover:text-emerald-700 transition-all"><X/></button>
             </div>
             <form onSubmit={handleCreateEvent} className="p-8 space-y-6">
                <div className="space-y-2">
                   <label className="text-[10px] font-black text-slate-400 uppercase ml-1">Título do Levantamento</label>
                   <input required className="w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl font-bold" placeholder="Ex: Mobiliário Escolar 2026/01" value={eventFormData.title} onChange={e => setEventFormData({...eventFormData, title: e.target.value})} />
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
                <button type="submit" disabled={saveLoading} className="w-full py-5 bg-emerald-600 text-white rounded-[1.5rem] font-black shadow-xl hover:bg-emerald-700 transition-all flex justify-center items-center gap-2 uppercase tracking-widest text-[10px]">
                   {saveLoading ? <Loader2 className="animate-spin"/> : 'LANÇAR NO SISTEMA'}
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
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { supabase } from '../lib/supabase';

import { 
  Ticket, Plus, X, Clock,  
  Paperclip, Send, Building2, CheckCircle2, 
  FileText, Activity, 
  Filter, Flame, UserPlus, ShieldAlert,
  Search, LayoutDashboard, Settings, FolderTree, Tag, Loader2,
  Trash2
} from 'lucide-react';

interface TicketData {
  id: string; protocol: string; school_id: string; title: string; 
  category: string; sub_category?: string; department: 'SEOM' | 'SEFISC';
  description: string; drive_link?: string; 
  status: 'ABERTO' | 'EM_ANDAMENTO' | 'AGUARDANDO_ESCOLA' | 'CONCLUIDO';
  priority: 'URGENTE' | 'ALTA' | 'NORMAL' | 'BAIXA';
  assigned_to?: string; created_at: string; updated_at?: string;
  schools?: { name: string };
  assignee?: { full_name: string };
}

interface TicketMessage {
  id: string; ticket_id: string; user_id: string; message: string; type: string; created_at: string;
  profiles?: { full_name: string; role: string };
}

interface SchoolOption { id: string; name: string; }

interface TicketCategory {
  id: string;
  department: string;
  name: string;
  subcategories: string[];
  is_urgent?: boolean; 
}

export function Chamados() {
  const [tickets, setTickets] = useState<TicketData[]>([]);
  const [categories, setCategories] = useState<TicketCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [userRole, setUserRole] = useState('');
  const [userId, setUserId] = useState('');
  const [userName, setUserName] = useState('');
  const [userSchoolId, setUserSchoolId] = useState<string | null>(null);
  
  // Filtros Avançados CRM
  const [departmentFilter, setDepartmentFilter] = useState<'TODOS' | 'SEOM' | 'SEFISC'>('TODOS');
  const [statusFilter, setStatusFilter] = useState<'TODOS' | 'ABERTO' | 'EM_ANDAMENTO' | 'AGUARDANDO_ESCOLA' | 'CONCLUIDO'>('TODOS');
  const [priorityFilter, setPriorityFilter] = useState<'TODOS' | 'URGENTE' | 'ALTA' | 'NORMAL' | 'BAIXA'>('TODOS');
  const [searchTerm, setSearchTerm] = useState('');
  
  const [schoolsList, setSchoolsList] = useState<SchoolOption[]>([]);
  
  // Formulário Novo Chamado
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [newTicket, setNewTicket] = useState({ 
    school_id: '', title: '', category: '', sub_category: '', 
    department: 'SEOM' as 'SEOM' | 'SEFISC', description: '', drive_link: '', isUrgent: false 
  });

  // Configurações de Assuntos (Árvore)
  const [isConfigOpen, setIsConfigOpen] = useState(false);
  const [newCatName, setNewCatName] = useState('');
  const [newCatDept, setNewCatDept] = useState<'SEOM' | 'SEFISC'>('SEOM');
  const [newCatIsUrgent, setNewCatIsUrgent] = useState(false);
  const [newSubCatMap, setNewSubCatMap] = useState<Record<string, string>>({});

  const [selectedTicket, setSelectedTicket] = useState<TicketData | null>(null);
  const [messages, setMessages] = useState<TicketMessage[]>([]);
  const [newMessage, setNewMessage] = useState('');
  
  // Referência para o container de chat (para fazer o auto-scroll)
  const chatContainerRef = useRef<HTMLDivElement>(null);

  const isAdminOrDirigente = userRole === 'regional_admin' || userRole === 'dirigente';

  useEffect(() => { fetchUserAndTickets(true); fetchCategories(); }, []); 

  // Auto-scroll sempre que a lista de mensagens for atualizada
  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  }, [messages]);

  // Assinatura em Tempo Real (Supabase Realtime) para o ticket selecionado
  useEffect(() => {
    if (!selectedTicket || !supabase) return;

    const channel = supabase
      .channel(`realtime-messages-${selectedTicket.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'ticket_messages',
          filter: `ticket_id=eq.${selectedTicket.id}`
        },
        () => {
          // Sempre que houver uma nova mensagem neste ticket, recarregamos a conversa
          loadMessages(selectedTicket.id);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [selectedTicket]);

  // Função auxiliar para carregar as mensagens de um ticket
  const loadMessages = async (ticketId: string) => {
    const { data } = await (supabase as any)
      .from('ticket_messages')
      .select('*, profiles(full_name, role)')
      .eq('ticket_id', ticketId)
      .order('created_at', { ascending: true });
    
    setMessages(data || []);
    
    // Marca mensagens como lidas
    await (supabase as any)
      .from('ticket_messages')
      .update({ is_read: true })
      .eq('ticket_id', ticketId)
      .neq('user_id', userId);
  };

  async function fetchCategories() {
    if (!supabase) return;
    const { data } = await (supabase as any).from('ticket_categories').select('*').order('name');
    setCategories(data || []);
  }

  // Função atualizada para aceitar atualização silenciosa (background)
  async function fetchUserAndTickets(showLoader: boolean = true) {
    if (!supabase) return;
    if (showLoader) setLoading(true);
    
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      setUserId(user.id);

      const { data: profile } = await (supabase as any).from('profiles').select('full_name, role, school_id').eq('id', user.id).single();
      setUserRole(profile?.role || ''); setUserSchoolId(profile?.school_id || null); setUserName(profile?.full_name || '');

      if (profile?.role === 'regional_admin' || profile?.role === 'dirigente') {
        const { data: schools } = await (supabase as any).from('schools').select('id, name').order('name');
        setSchoolsList(schools || []);
      }

      let query = (supabase as any)
        .from('internal_tickets')
        .select(`*, schools(name), assignee:profiles!internal_tickets_assigned_to_fkey(full_name)`)
        .order('created_at', { ascending: false });

      if (profile?.role === 'school_manager') query = query.eq('school_id', profile.school_id);

      const { data, error } = await query;
      if (error) throw error;
      setTickets(data || []);
    } catch (error) { 
      console.error(error); 
    } finally { 
      setLoading(false); 
    }
  }

  // --- GESTÃO DA ÁRVORE DE ASSUNTOS (ADMIN) ---
  async function handleAddCategory(e: React.FormEvent) {
    e.preventDefault();
    if (!newCatName.trim()) return;
    try {
      await (supabase as any).from('ticket_categories').insert([{ 
        name: newCatName, 
        department: newCatDept, 
        subcategories: [],
        is_urgent: newCatIsUrgent
      }]);
      setNewCatName('');
      setNewCatIsUrgent(false);
      fetchCategories();
    } catch (error) { console.error(error); alert("Erro ao adicionar categoria."); }
  }

  async function handleDeleteCategory(id: string) {
    if(!confirm("Remover este assunto principal?")) return;
    await (supabase as any).from('ticket_categories').delete().eq('id', id);
    fetchCategories();
  }

  async function handleAddSubCategory(categoryId: string, currentSubcategories: string[]) {
    const subName = newSubCatMap[categoryId];
    if (!subName || !subName.trim()) return;
    
    const updatedSubcategories = [...currentSubcategories, subName.trim()];
    try {
      await (supabase as any).from('ticket_categories').update({ subcategories: updatedSubcategories }).eq('id', categoryId);
      setNewSubCatMap(prev => ({ ...prev, [categoryId]: '' }));
      fetchCategories();
    } catch (error) { console.error(error); }
  }

  async function handleRemoveSubCategory(categoryId: string, currentSubcategories: string[], subToRemove: string) {
    const updatedSubcategories = currentSubcategories.filter(s => s !== subToRemove);
    try {
      await (supabase as any).from('ticket_categories').update({ subcategories: updatedSubcategories }).eq('id', categoryId);
      fetchCategories();
    } catch (error) { console.error(error); }
  }

  // --- FILTROS E ORDENAÇÃO INTELIGENTE (URGENTES PRIMEIRO) ---
  const filteredTickets = useMemo(() => {
    let result = tickets;
    
    // Filtro de Departamento
    if (departmentFilter !== 'TODOS') {
      result = result.filter(t => t.department === departmentFilter);
    }
    
    // Filtro de Status
    if (statusFilter !== 'TODOS') {
      result = result.filter(t => t.status === statusFilter);
    }
    
    // Filtro de Prioridade
    if (priorityFilter !== 'TODOS') {
      result = result.filter(t => t.priority === priorityFilter);
    }
    
    // Filtro de Busca (Search)
    if (searchTerm) {
      result = result.filter(t => 
        t.title.toLowerCase().includes(searchTerm.toLowerCase()) || 
        t.protocol.toLowerCase().includes(searchTerm.toLowerCase()) ||
        t.schools?.name.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    return result.sort((a, b) => {
      if (a.status === 'CONCLUIDO' && b.status !== 'CONCLUIDO') return 1;
      if (b.status === 'CONCLUIDO' && a.status !== 'CONCLUIDO') return -1;
      if (a.priority === 'URGENTE' && b.priority !== 'URGENTE') return -1;
      if (b.priority === 'URGENTE' && a.priority !== 'URGENTE') return 1;
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
  }, [tickets, departmentFilter, statusFilter, priorityFilter, searchTerm]);

  // --- TEMPO DE VIDA DO TICKET (SLA) ---
  const getTimeElapsed = (ticket: TicketData) => {
    const start = new Date(ticket.created_at).getTime();
    let end = new Date().getTime();

    // Se estiver concluído e possuir a data de atualização, congela o contador
    if (ticket.status === 'CONCLUIDO' && ticket.updated_at) {
      end = new Date(ticket.updated_at).getTime();
    }

    const diffMs = Math.max(0, end - start);
    const diffMins = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (ticket.status === 'CONCLUIDO') {
      if (diffDays > 0) return `Resolvido em ${diffDays} dia(s)`;
      if (diffHours > 0) return `Resolvido em ${diffHours}h`;
      return `Resolvido em ${diffMins} min`;
    } else {
      if (diffDays > 0) return `Aberto há ${diffDays} dia(s)`;
      if (diffHours > 0) return `Aberto há ${diffHours}h`;
      if (diffMins < 1) return `Agora mesmo`;
      return `Aberto há ${diffMins} min`;
    }
  };

  async function handleCreateTicket(e: React.FormEvent) {
    e.preventDefault();
    
    const targetSchoolId = isAdminOrDirigente ? newTicket.school_id : userSchoolId;
    if (!targetSchoolId) return alert('Erro de identificação: Selecione a Unidade Escolar.');
    if (!newTicket.category) return alert('Selecione um assunto para o chamado.');
    
    try {
      const { count } = await (supabase as any).from('internal_tickets').select('*', { count: 'exact', head: true });
      const protocol = `GSE-${new Date().getFullYear()}-${String((count || 0) + 1).padStart(7, '0')}`;
      
      const payload = { 
        protocol, school_id: targetSchoolId, created_by: userId, 
        title: newTicket.title, category: newTicket.category, sub_category: newTicket.sub_category,
        department: newTicket.department, description: newTicket.description, drive_link: newTicket.drive_link, 
        status: 'ABERTO', priority: newTicket.isUrgent ? 'URGENTE' : 'NORMAL'
      };
      
      const { error } = await (supabase as any).from('internal_tickets').insert([payload]);
      if (error) throw error;
      
      alert(`Chamado ${protocol} criado com sucesso!`);
      setIsCreateOpen(false); 
      setNewTicket({ 
        school_id: '', title: '', category: '', sub_category: '', 
        department: 'SEOM', description: '', drive_link: '', isUrgent: false 
      });
      fetchUserAndTickets(false); // Atualiza no background
    } catch (error: any) { alert('Erro: ' + error.message); }
  }

  async function openTicketDetails(ticket: TicketData) {
    setSelectedTicket(ticket);
    await loadMessages(ticket.id);
  }

  async function handleSendMessage(type: 'RESPONSE' | 'CONCLUSION' = 'RESPONSE') {
    if (type === 'RESPONSE' && !newMessage.trim()) return;
    if (!selectedTicket) return;

    try {
      const msgText = (type === 'CONCLUSION' && !newMessage.trim()) ? "⚠️ Atendimento finalizado pelo administrador." : newMessage;
      await (supabase as any).from('ticket_messages').insert([{ ticket_id: selectedTicket.id, user_id: userId, message: msgText, type: type === 'CONCLUSION' ? 'STATUS_CHANGE' : 'RESPONSE', is_read: false }]);
      
      let newStatus = type === 'CONCLUSION' ? 'CONCLUIDO' : (isAdminOrDirigente ? 'AGUARDANDO_ESCOLA' : 'EM_ANDAMENTO');
      
      const updatePayload: any = { status: newStatus };
      if (type === 'CONCLUSION') {
          // Grava a data atual quando é concluído para travar o contador de SLA
          updatePayload.updated_at = new Date().toISOString();
      }

      await (supabase as any).from('internal_tickets').update(updatePayload).eq('id', selectedTicket.id);

      setNewMessage(''); 
      // Atualiza a lista por trás sem exibir a tela de loading
      fetchUserAndTickets(false); 
      loadMessages(selectedTicket.id);
      setSelectedTicket({ 
        ...selectedTicket, 
        status: newStatus as any, 
        updated_at: updatePayload.updated_at || selectedTicket.updated_at 
      });
    } catch (error) { console.error(error); }
  }

  async function handleAssignToMe() {
    if (!selectedTicket || !isAdminOrDirigente) return;
    try {
      await (supabase as any).from('internal_tickets').update({ assigned_to: userId, status: 'EM_ANDAMENTO' }).eq('id', selectedTicket.id);
      await (supabase as any).from('ticket_messages').insert([{ ticket_id: selectedTicket.id, user_id: userId, message: `👤 ${userName} assumiu este chamado.`, type: 'SYSTEM', is_read: false }]);
      
      // Atualiza a lista por trás sem exibir a tela de loading
      fetchUserAndTickets(false);
      setSelectedTicket(prev => prev ? { ...prev, assigned_to: userId, assignee: { full_name: userName }, status: 'EM_ANDAMENTO' } : null);
    } catch (error) { console.error(error); }
  }

  if (loading) return <div className="min-h-screen flex items-center justify-center bg-slate-50"><Loader2 className="animate-spin text-indigo-600" size={48} /></div>;

  return (
    <div className="space-y-6 pb-20 bg-[#f8fafc] min-h-screen">
      
      {/* HEADER CRM */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="flex items-center gap-4">
           <div className="p-4 bg-slate-900 rounded-[2rem] text-white shadow-xl"><LayoutDashboard size={28} /></div>
           <div>
              <h1 className="text-3xl font-black text-slate-900 tracking-tight uppercase">Helpdesk <span className="text-indigo-600">Pro</span></h1>
              <p className="text-slate-500 text-xs font-bold tracking-widest uppercase mt-1">Gestão Inteligente de Demandas</p>
           </div>
        </div>
        
        <div className="flex items-center gap-3 flex-wrap">
          {isAdminOrDirigente && (
             <button onClick={() => setIsConfigOpen(true)} className="bg-white text-slate-600 border border-slate-200 hover:border-indigo-400 hover:text-indigo-600 px-4 py-3.5 rounded-2xl font-black flex items-center gap-2 shadow-sm transition-all active:scale-95 uppercase text-[10px] tracking-widest">
                <Settings size={16} /> Assuntos
             </button>
          )}
          <button onClick={() => {
              setNewTicket({ school_id: '', title: '', category: '', sub_category: '', department: 'SEOM', description: '', drive_link: '', isUrgent: false });
              setIsCreateOpen(true);
            }} 
            className="bg-indigo-600 text-white px-6 py-3.5 rounded-2xl font-black flex items-center gap-2 shadow-xl shadow-indigo-200 hover:bg-indigo-700 transition-all active:scale-95 uppercase text-[10px] tracking-widest"
          >
              <Plus size={16} /> Novo Ticket
          </button>
        </div>
      </div>

      {/* DASHBOARD RÁPIDO */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
         <div className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-md flex items-center gap-4">
            <div className="p-4 bg-slate-50 text-slate-400 rounded-2xl"><Ticket size={24}/></div>
            <div><p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Total</p><h3 className="text-2xl font-black text-slate-800">{tickets.length}</h3></div>
         </div>
         <div className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-md flex items-center gap-4">
            <div className="p-4 bg-red-50 text-red-600 rounded-2xl animate-pulse"><Flame size={24}/></div>
            <div><p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Urgentes</p><h3 className="text-2xl font-black text-red-600">{tickets.filter(t => t.priority === 'URGENTE' && t.status !== 'CONCLUIDO').length}</h3></div>
         </div>
         <div className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-md flex items-center gap-4">
            <div className="p-4 bg-amber-50 text-amber-600 rounded-2xl"><Clock size={24}/></div>
            <div><p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Em Aberto</p><h3 className="text-2xl font-black text-amber-600">{tickets.filter(t => t.status === 'ABERTO' || t.status === 'EM_ANDAMENTO').length}</h3></div>
         </div>
         <div className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-md flex items-center gap-4">
            <div className="p-4 bg-emerald-50 text-emerald-600 rounded-2xl"><CheckCircle2 size={24}/></div>
            <div><p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Resolvidos</p><h3 className="text-2xl font-black text-emerald-600">{tickets.filter(t => t.status === 'CONCLUIDO').length}</h3></div>
         </div>
      </div>

      {/* ÁREA DE TRABALHO: FILTROS E LISTA */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
         
         {/* SIDEBAR DE FILTROS */}
         <div className="lg:col-span-3 space-y-6">
            <div className="bg-white p-6 rounded-[2.5rem] border border-slate-100 shadow-xl">
               <h3 className="text-xs font-black uppercase text-slate-800 tracking-widest mb-6 flex items-center gap-2"><Filter size={16}/> Filtros Ativos</h3>
               
               <div className="space-y-6">
                  <div>
                     <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-2">Busca</label>
                     <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                        <input type="text" placeholder="Protocolo ou Escola..." className="w-full pl-9 pr-3 py-3 bg-slate-50 border-none rounded-xl text-xs font-bold outline-none focus:ring-2 focus:ring-indigo-500" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
                     </div>
                  </div>

                  <div>
                     <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-2">Departamento</label>
                     <div className="flex flex-col gap-2">
                        {['TODOS', 'SEOM', 'SEFISC'].map(d => (
                           <button key={d} onClick={() => setDepartmentFilter(d as any)} className={`text-left px-4 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${departmentFilter === d ? 'bg-indigo-50 text-indigo-700 border border-indigo-100' : 'text-slate-500 hover:bg-slate-50'}`}>
                              {d}
                           </button>
                        ))}
                     </div>
                  </div>

                  <div>
                     <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-2">Status do Ticket</label>
                     <div className="flex flex-col gap-2">
                        {['TODOS', 'ABERTO', 'EM_ANDAMENTO', 'AGUARDANDO_ESCOLA', 'CONCLUIDO'].map(s => (
                           <button key={s} onClick={() => setStatusFilter(s as any)} className={`text-left px-4 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${statusFilter === s ? 'bg-indigo-50 text-indigo-700 border border-indigo-100' : 'text-slate-500 hover:bg-slate-50'}`}>
                              {s.replace('_', ' ')}
                           </button>
                        ))}
                     </div>
                  </div>

                  <div>
                     <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-2">Nível de Urgência</label>
                     <div className="flex flex-col gap-2">
                        {['TODOS', 'URGENTE', 'ALTA', 'NORMAL', 'BAIXA'].map(p => (
                           <button key={p} onClick={() => setPriorityFilter(p as any)} className={`flex items-center justify-between px-4 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${priorityFilter === p ? 'bg-slate-900 text-white' : 'text-slate-500 hover:bg-slate-50'}`}>
                              {p} {p === 'URGENTE' && <Flame size={12} className={priorityFilter === p ? 'text-red-400' : 'text-red-500'}/>}
                           </button>
                        ))}
                     </div>
                  </div>
               </div>
            </div>
         </div>

         {/* LISTA DE TICKETS KANBAN-STYLE */}
         <div className="lg:col-span-9 space-y-4">
            {filteredTickets.length === 0 ? (
               <div className="bg-white p-20 rounded-[3rem] border-2 border-dashed border-slate-100 text-center flex flex-col items-center">
                  <ShieldAlert size={48} className="text-slate-200 mb-4" />
                  <p className="text-slate-400 font-black uppercase tracking-widest text-xs">Nenhum ticket corresponde aos filtros.</p>
               </div>
            ) : (
               filteredTickets.map(ticket => (
                  <div key={ticket.id} onClick={() => openTicketDetails(ticket)} className={`bg-white p-6 rounded-[2rem] border-l-8 shadow-sm hover:shadow-xl transition-all cursor-pointer flex flex-col md:flex-row md:items-center justify-between gap-6 ${ticket.priority === 'URGENTE' && ticket.status !== 'CONCLUIDO' ? 'border-l-red-500 ring-1 ring-red-100' : ticket.status === 'CONCLUIDO' ? 'border-l-emerald-500 opacity-70' : 'border-l-indigo-500 border-y border-r border-slate-100'}`}>
                     
                     <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-3 mb-2">
                           <span className="text-[10px] font-black bg-slate-100 text-slate-600 px-3 py-1 rounded-md">{ticket.protocol}</span>
                           <span className="text-[9px] font-black bg-indigo-50 text-indigo-600 px-2 py-1 rounded-md border border-indigo-100">{ticket.department}</span>
                           {ticket.priority === 'URGENTE' && ticket.status !== 'CONCLUIDO' && <span className="text-[9px] font-black bg-red-100 text-red-700 px-2 py-1 rounded-md flex items-center gap-1 animate-pulse"><Flame size={10}/> URGENTE</span>}
                           {ticket.status === 'CONCLUIDO' && <span className="text-[9px] font-black bg-emerald-100 text-emerald-700 px-2 py-1 rounded-md flex items-center gap-1"><CheckCircle2 size={10}/> RESOLVIDO</span>}
                        </div>
                        <h3 className="text-lg font-black text-slate-800 truncate">{ticket.title}</h3>
                        <p className="text-xs font-bold text-slate-400 uppercase mt-1 flex items-center gap-2 truncate">
                           <Building2 size={12}/> {ticket.schools?.name || 'Escola'}
                           <span className="w-1 h-1 rounded-full bg-slate-300"></span>
                           {ticket.category} {ticket.sub_category ? `> ${ticket.sub_category}` : ''}
                        </p>
                     </div>

                     <div className="flex items-center gap-6 shrink-0 text-right">
                        <div className="hidden md:block">
                           <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Status</p>
                           <p className="text-xs font-bold text-slate-700">{ticket.status.replace('_', ' ')}</p>
                        </div>
                        <div className="hidden md:block">
                           <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">SLA Tempo</p>
                           <p className="text-xs font-bold text-slate-700 flex items-center gap-1 justify-end"><Clock size={12}/> {getTimeElapsed(ticket)}</p>
                        </div>
                        
                        {/* Avatar do Responsável */}
                        <div className="flex items-center justify-center w-10 h-10 rounded-full bg-slate-50 border-2 border-slate-100 text-slate-400" title={ticket.assignee?.full_name || 'Não atribuído'}>
                           {ticket.assignee ? <span className="text-[10px] font-black text-indigo-600 uppercase">{ticket.assignee.full_name.substring(0,2)}</span> : <UserPlus size={16}/>}
                        </div>
                     </div>
                  </div>
               ))
            )}
         </div>
      </div>

      {/* --- MODAL NOVO CHAMADO SIMPLIFICADO --- */}
      {isCreateOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/80 backdrop-blur-sm p-4">
            <div className="bg-white rounded-[3rem] w-full max-w-3xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden">
                <div className="p-8 border-b border-slate-100 flex justify-between items-center bg-slate-50 shrink-0">
                   <div className="flex items-center gap-4">
                      <div className="w-12 h-12 bg-indigo-600 rounded-2xl flex items-center justify-center text-white shadow-lg"><Ticket size={24}/></div>
                      <div><h2 className="text-xl font-black text-slate-800 uppercase tracking-tight">Abertura de Ticket</h2><p className="text-[10px] font-bold text-indigo-600 uppercase tracking-widest mt-1">Classificação Inteligente</p></div>
                   </div>
                   <button onClick={() => setIsCreateOpen(false)} className="p-3 bg-white hover:bg-slate-200 rounded-full transition-all text-slate-400"><X size={20} /></button>
                </div>
                
                <form onSubmit={handleCreateTicket} className="p-8 space-y-6 overflow-y-auto custom-scrollbar flex-1">
                    
                    {isAdminOrDirigente && (
                       <div>
                          <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Unidade Escolar Solicitante</label>
                          <select required className="w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl font-bold text-slate-700 outline-none focus:border-indigo-500" value={newTicket.school_id} onChange={e => setNewTicket({...newTicket, school_id: e.target.value})}>
                             <option value="">Selecione a unidade...</option>
                             {schoolsList.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                          </select>
                       </div>
                    )}

                    <div>
                        <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Assunto do Chamado</label>
                        <select 
                           required 
                           className="w-full p-4 bg-white border-2 border-slate-200 rounded-2xl font-bold text-slate-700 outline-none focus:border-indigo-500 cursor-pointer" 
                           value={newTicket.category ? `${newTicket.category}|${newTicket.sub_category}` : ''} 
                           onChange={e => {
                              const [catName, subName] = e.target.value.split('|');
                              const cat = categories.find(c => c.name === catName);
                              if (cat) {
                                 setNewTicket({
                                    ...newTicket, 
                                    category: cat.name, 
                                    sub_category: subName, 
                                    department: cat.department as 'SEOM' | 'SEFISC',
                                    isUrgent: !!cat.is_urgent
                                 });
                              }
                           }}
                        >
                           <option value="" disabled>Selecione o assunto...</option>
                           {categories.map(cat => (
                              <optgroup key={cat.id} label={`${cat.name}`}>
                                 {cat.subcategories.length > 0 ? (
                                    cat.subcategories.map(sub => (
                                       <option key={`${cat.name}|${sub}`} value={`${cat.name}|${sub}`}>
                                          {sub} {cat.is_urgent ? ' 🚨 (Urgente)' : ''}
                                       </option>
                                    ))
                                 ) : (
                                    <option key={`${cat.name}|`} value={`${cat.name}|`}>
                                       {cat.name} (Geral) {cat.is_urgent ? ' 🚨 (Urgente)' : ''}
                                    </option>
                                 )}
                              </optgroup>
                           ))}
                        </select>
                        {newTicket.isUrgent && (
                           <div className="mt-3 inline-flex items-center gap-2 bg-red-50 text-red-600 px-4 py-2 rounded-xl border border-red-100">
                              <Flame size={16} className="animate-pulse" />
                              <span className="text-[10px] font-black uppercase tracking-widest">Este assunto aciona o alerta prioritário.</span>
                           </div>
                        )}
                    </div>

                    <div><label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Resumo do Problema (Título)</label><input required type="text" className="w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl font-bold text-slate-700 outline-none focus:border-indigo-500" value={newTicket.title} onChange={e => setNewTicket({...newTicket, title: e.target.value})} placeholder="Ex: Vazamento no banheiro dos alunos" /></div>
                    
                    <div><label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Descrição Detalhada do Chamado</label><textarea required rows={4} className="w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl font-medium text-slate-700 outline-none focus:border-indigo-500 custom-scrollbar" value={newTicket.description} onChange={e => setNewTicket({...newTicket, description: e.target.value})} placeholder="Forneça o máximo de detalhes possíveis para agilizar o atendimento..." /></div>
                    
                    <div>
                        <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Anexos (Link do Drive Compartilhado)</label>
                        <div className="flex items-center gap-3 p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl focus-within:border-indigo-500 transition-all"><Paperclip size={20} className="text-slate-400" /><input type="url" className="w-full bg-transparent font-bold text-slate-700 outline-none text-sm" value={newTicket.drive_link} onChange={e => setNewTicket({...newTicket, drive_link: e.target.value})} placeholder="Cole a URL das fotos/vídeos aqui" /></div>
                    </div>
                    
                    <button type="submit" className="w-full py-5 bg-indigo-600 text-white rounded-2xl font-black uppercase tracking-widest text-xs shadow-xl shadow-indigo-200 hover:bg-indigo-700 active:scale-95 transition-all">
                       GERAR PROTOCOLO E ENVIAR
                    </button>
                </form>
            </div>
        </div>
      )}

      {/* --- MODAL DETALHES DO TICKET (CRM VIEW) --- */}
      {selectedTicket && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/80 backdrop-blur-md p-4">
            <div className="bg-white rounded-[3rem] w-full max-w-5xl h-[85vh] shadow-2xl animate-in zoom-in-95 flex overflow-hidden border border-white">
                
                {/* SIDEBAR ESQUERDA: PROPRIEDADES DO TICKET */}
                <div className="w-1/3 bg-slate-50 border-r border-slate-200 flex flex-col hidden md:flex shrink-0">
                   <div className="p-8 border-b border-slate-200 bg-white">
                      <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">Protocolo {selectedTicket.protocol}</span>
                      <h2 className="text-xl font-black text-slate-800 leading-tight">{selectedTicket.title}</h2>
                   </div>
                   
                   <div className="p-8 overflow-y-auto custom-scrollbar flex-1 space-y-8">
                      {/* Triage Info */}
                      <div>
                         <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-3 border-b pb-2">Informações de Triagem</p>
                         <div className="space-y-4">
                            <div><span className="text-[10px] font-bold text-slate-500 block">Status</span><span className="text-xs font-black text-slate-800 uppercase">{selectedTicket.status.replace('_', ' ')}</span></div>
                            <div><span className="text-[10px] font-bold text-slate-500 block">Prioridade</span><span className={`text-xs font-black uppercase flex items-center gap-1 ${selectedTicket.priority === 'URGENTE' ? 'text-red-600' : 'text-slate-800'}`}>{selectedTicket.priority} {selectedTicket.priority === 'URGENTE' && <Flame size={12}/>}</span></div>
                            <div><span className="text-[10px] font-bold text-slate-500 block">SLA Cronómetro</span><span className="text-xs font-black text-slate-800 uppercase">{getTimeElapsed(selectedTicket)}</span></div>
                         </div>
                      </div>

                      {/* Classificação */}
                      <div>
                         <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-3 border-b pb-2">Classificação Automática</p>
                         <div className="space-y-4">
                            <div><span className="text-[10px] font-bold text-slate-500 block">Mesa Designada</span><span className="text-xs font-black text-indigo-600 uppercase bg-indigo-50 px-2 py-1 rounded inline-block mt-1">{selectedTicket.department}</span></div>
                            <div><span className="text-[10px] font-bold text-slate-500 block">Assunto / Categoria</span><span className="text-xs font-black text-slate-800 uppercase block leading-tight mt-1">{selectedTicket.category} <br/><span className="text-slate-400">↳ {selectedTicket.sub_category || 'Geral'}</span></span></div>
                         </div>
                      </div>

                      {/* Atribuição */}
                      <div>
                         <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-3 border-b pb-2">Responsável Técnica</p>
                         {selectedTicket.assignee ? (
                            <div className="flex items-center gap-3 bg-white p-3 rounded-xl border border-slate-200">
                               <div className="w-8 h-8 bg-indigo-100 text-indigo-600 rounded-full flex items-center justify-center font-black text-[10px]">{selectedTicket.assignee.full_name.substring(0,2)}</div>
                               <div><p className="text-xs font-black text-slate-800 uppercase leading-none">{selectedTicket.assignee.full_name}</p><p className="text-[9px] text-slate-400 font-bold mt-1">Análise Regional</p></div>
                            </div>
                         ) : (
                            <div className="bg-slate-100 p-4 rounded-xl border border-slate-200 border-dashed text-center">
                               <UserPlus size={20} className="mx-auto text-slate-300 mb-2"/>
                               <p className="text-[10px] font-black text-slate-400 uppercase mb-3">Ticket Não Atribuído</p>
                               {isAdminOrDirigente && <button onClick={handleAssignToMe} className="px-4 py-2 bg-indigo-600 text-white text-[10px] font-black uppercase rounded-lg shadow-md hover:bg-indigo-700 w-full transition-all">Assumir Chamado</button>}
                            </div>
                         )}
                      </div>
                   </div>
                </div>

                {/* ÁREA DIREITA: DESCRIÇÃO E CHAT (TIMELINE) */}
                <div className="flex-1 flex flex-col bg-white">
                    <div className="p-6 border-b border-slate-100 flex justify-between items-center shrink-0 shadow-sm z-10">
                       <div className="flex items-center gap-3">
                          <Building2 size={20} className="text-slate-400"/>
                          <div><h3 className="font-black text-slate-800 uppercase text-sm">{selectedTicket.schools?.name}</h3><p className="text-[10px] text-slate-400 font-bold uppercase">Solicitante Oficial</p></div>
                       </div>
                       <button onClick={() => setSelectedTicket(null)} className="p-2 hover:bg-slate-100 rounded-full transition-all"><X size={20} className="text-slate-400" /></button>
                    </div>
                    
                    <div 
                      className="flex-1 overflow-y-auto p-8 space-y-6 bg-slate-50/30 custom-scrollbar scroll-smooth"
                      ref={chatContainerRef}
                    >
                        {/* Descrição Original do Ticket */}
                        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                           <div className="flex items-center gap-2 mb-4"><FileText size={16} className="text-slate-400"/><span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Descrição Original</span></div>
                           <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap font-medium">{selectedTicket.description}</p>
                           {selectedTicket.drive_link && ( <a href={selectedTicket.drive_link} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 mt-4 text-xs font-black text-indigo-600 uppercase bg-indigo-50 px-4 py-2 rounded-xl hover:bg-indigo-100 transition-all"><Paperclip size={14} /> Abrir Anexos no Drive</a> )}
                        </div>

                        <div className="flex items-center gap-4 my-8 opacity-50"><div className="h-px bg-slate-300 flex-1"></div><span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Timeline de Resoluções</span><div className="h-px bg-slate-300 flex-1"></div></div>

                        {messages.length === 0 && <p className="text-center text-slate-300 text-xs font-bold uppercase tracking-widest py-10">Aguardando primeira interação...</p>}
                        
                        {/* Timeline / Chat */}
                        {messages.map(msg => {
                            const isMe = msg.user_id === userId; const isSystem = msg.type !== 'RESPONSE'; const senderName = isMe ? 'Você' : (msg.profiles?.full_name || 'Usuário');
                            return (
                                <div key={msg.id} className={`flex flex-col ${isSystem ? 'items-center' : (isMe ? 'items-end' : 'items-start')}`}>
                                    {isSystem ? ( <span className="text-[9px] font-black text-slate-500 bg-slate-200 px-4 py-1.5 rounded-full uppercase tracking-wider my-2 flex items-center gap-2"><Activity size={10}/> {msg.message}</span> ) : (
                                        <div className="max-w-[80%] flex flex-col animate-in fade-in slide-in-from-bottom-2">
                                            <span className={`text-[9px] font-black uppercase mb-1 px-1 ${isMe ? 'text-right text-indigo-400' : 'text-left text-slate-400'}`}>{senderName}</span>
                                            <div className={`p-5 rounded-[2rem] text-sm shadow-md ${isMe ? 'bg-indigo-600 text-white rounded-tr-sm' : 'bg-white border border-slate-200 text-slate-700 rounded-tl-sm'}`}><p className="leading-relaxed font-medium">{msg.message}</p></div>
                                            <span className={`text-[8px] font-bold block mt-1 px-2 ${isMe ? 'text-right text-slate-300' : 'text-left text-slate-300'}`}>{new Date(msg.created_at).toLocaleString()}</span>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>

                    {/* Input de Resposta */}
                    {selectedTicket.status !== 'CONCLUIDO' && (
                        <div className="p-6 border-t border-slate-200 bg-white shrink-0">
                           <div className="flex gap-3 bg-slate-50 p-2 rounded-[2rem] border border-slate-200 focus-within:border-indigo-400 focus-within:ring-2 focus-within:ring-indigo-50 transition-all">
                              <input type="text" className="flex-1 px-4 bg-transparent outline-none font-medium text-slate-700 text-sm" placeholder="Escreva uma resposta para o solicitante..." value={newMessage} onChange={e => setNewMessage(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleSendMessage()} />
                              
                              {isAdminOrDirigente && newMessage === '' ? (
                                <button onClick={() => handleSendMessage('CONCLUSION')} className="px-6 py-3 bg-emerald-100 text-emerald-700 rounded-2xl hover:bg-emerald-200 transition-all font-black uppercase tracking-widest text-[10px] flex items-center gap-2 shrink-0"><CheckCircle2 size={16} /> Finalizar</button>
                              ) : (
                                <button onClick={() => handleSendMessage('RESPONSE')} className="w-12 h-12 flex items-center justify-center bg-indigo-600 text-white rounded-full hover:bg-indigo-700 transition-all active:scale-95 shrink-0"><Send size={18} className="-ml-1" /></button>
                              )}
                           </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
      )}

      {/* --- MODAL DE CONFIGURAÇÃO DE ASSUNTOS (ADMIN CRM) --- */}
      {isConfigOpen && isAdminOrDirigente && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-900/80 backdrop-blur-md p-4">
          <div className="bg-white rounded-[3rem] w-full max-w-4xl h-[85vh] shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95">
             <div className="p-8 border-b border-slate-100 flex justify-between items-center bg-slate-50 shrink-0">
                <div className="flex items-center gap-4">
                   <div className="w-12 h-12 bg-slate-900 rounded-2xl flex items-center justify-center text-white shadow-lg"><FolderTree size={24}/></div>
                   <div><h2 className="text-xl font-black text-slate-800 uppercase tracking-tight">Árvore de Assuntos</h2><p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Gestão de Categorias do Sistema</p></div>
                </div>
                <button onClick={() => setIsConfigOpen(false)} className="p-3 bg-white hover:bg-slate-200 rounded-full transition-all text-slate-400"><X size={20} /></button>
             </div>
             
             <div className="flex-1 overflow-y-auto p-8 custom-scrollbar bg-slate-50/50 space-y-8">
                
                {/* Nova Categoria */}
                <div className="bg-white p-6 rounded-[2rem] border border-indigo-100 shadow-sm">
                   <h3 className="text-xs font-black uppercase text-indigo-600 tracking-widest mb-4">Adicionar Nova Categoria Principal</h3>
                   <form onSubmit={handleAddCategory} className="flex flex-col md:flex-row items-center gap-4">
                      <select className="p-4 bg-slate-50 border-2 border-slate-100 rounded-xl font-bold text-slate-700 outline-none focus:border-indigo-500 w-full md:w-48" value={newCatDept} onChange={e => setNewCatDept(e.target.value as any)}>
                         <option value="SEOM">SEOM</option>
                         <option value="SEFISC">SEFISC</option>
                      </select>
                      <input type="text" placeholder="Ex: REFORMAS ESTRUTURAIS" className="flex-1 w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-xl font-bold text-slate-700 outline-none focus:border-indigo-500 uppercase" value={newCatName} onChange={e => setNewCatName(e.target.value)} />
                      <label className="flex items-center gap-2 cursor-pointer p-4 bg-red-50 text-red-600 rounded-xl font-bold text-xs uppercase border border-red-100 shrink-0 w-full md:w-auto justify-center">
                         <input type="checkbox" className="accent-red-600 w-4 h-4 cursor-pointer" checked={newCatIsUrgent} onChange={e => setNewCatIsUrgent(e.target.checked)} />
                         <Flame size={16}/> Prioridade Urgente
                      </label>
                      <button type="submit" className="w-full md:w-auto px-8 py-4 bg-indigo-600 text-white rounded-xl font-black uppercase tracking-widest text-[10px] hover:bg-indigo-700 transition-all shadow-md shrink-0">Adicionar</button>
                   </form>
                </div>

                {/* Lista de Categorias e Subcategorias */}
                <div className="space-y-6">
                   {categories.map(cat => (
                      <div key={cat.id} className="bg-white rounded-[2rem] border border-slate-200 overflow-hidden shadow-sm">
                         <div className="p-5 bg-slate-50 border-b border-slate-200 flex justify-between items-center">
                            <div className="flex flex-wrap items-center gap-3">
                               <span className="bg-slate-900 text-white px-3 py-1 rounded-md text-[9px] font-black tracking-widest">{cat.department}</span>
                               <h4 className="font-black text-slate-800 uppercase tracking-tight">{cat.name}</h4>
                               {cat.is_urgent && <span className="bg-red-100 text-red-600 px-3 py-1 rounded-md text-[9px] font-black tracking-widest flex items-center gap-1"><Flame size={12}/> URGENTE</span>}
                            </div>
                            <button onClick={() => handleDeleteCategory(cat.id)} className="p-2 text-slate-400 hover:bg-red-50 hover:text-red-500 rounded-lg transition-all"><Trash2 size={16}/></button>
                         </div>
                         <div className="p-6">
                            <div className="flex flex-wrap gap-2 mb-6">
                               {cat.subcategories.map(sub => (
                                 <span key={sub} className="flex items-center gap-2 bg-indigo-50 border border-indigo-100 text-indigo-700 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest">
                                    <Tag size={12}/> {sub}
                                    <button onClick={() => handleRemoveSubCategory(cat.id, cat.subcategories, sub)} className="ml-2 hover:bg-indigo-200 p-1 rounded-full"><X size={12}/></button>
                                 </span>
                               ))}
                               {cat.subcategories.length === 0 && <span className="text-xs text-slate-400 italic">Nenhuma subcategoria vinculada. (Aparecerá como Assunto "Geral")</span>}
                            </div>
                            <div className="flex gap-2">
                               <input 
                                 type="text" 
                                 placeholder="Nova Subcategoria (Assunto específico)..." 
                                 className="flex-1 p-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-xs outline-none focus:border-indigo-500" 
                                 value={newSubCatMap[cat.id] || ''}
                                 onChange={e => setNewSubCatMap(prev => ({...prev, [cat.id]: e.target.value}))}
                                 onKeyDown={e => e.key === 'Enter' && handleAddSubCategory(cat.id, cat.subcategories)}
                               />
                               <button onClick={() => handleAddSubCategory(cat.id, cat.subcategories)} className="px-6 bg-slate-200 text-slate-600 hover:bg-indigo-600 hover:text-white rounded-xl font-black text-[10px] uppercase transition-all">Adicionar</button>
                            </div>
                         </div>
                      </div>
                   ))}
                   {categories.length === 0 && <p className="text-center text-slate-400 font-bold uppercase py-10">Nenhuma categoria registrada no sistema.</p>}
                </div>
             </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Chamados;
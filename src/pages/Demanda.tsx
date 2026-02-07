import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { 
  AlertCircle, CheckCircle2, Clock, Plus, 
  Search, Trash2, Edit, X, Save, Loader2,
  Building2, Filter,
  MessageSquare
} from 'lucide-react';
import { 
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend 
} from 'recharts';

interface Demand {
  id: string;
  school_id: string;
  title: string;
  description: string;
  deadline: string;
  status: 'PENDENTE' | 'CONCLUÍDO';
  priority: 'BAIXA' | 'MÉDIA' | 'ALTA' | 'CRÍTICA';
  created_at: string;
  completed_at: string | null;
  schools?: { name: string };
}

interface School {
  id: string;
  name: string;
}

export function Demanda() {
  const [demands, setDemands] = useState<Demand[]>([]);
  const [schools, setSchools] = useState<School[]>([]);
  const [loading, setLoading] = useState(true);
  const [userRole, setUserRole] = useState('');
  const [userSchoolId, setUserSchoolId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [saveLoading, setSaveLoading] = useState(false);
  const [editingDemand, setEditingDemand] = useState<Demand | null>(null);
  
  const [formData, setFormData] = useState({
    school_id: '',
    title: '',
    description: '',
    deadline: new Date().toISOString().split('T')[0],
    priority: 'ALTA' as any,
    status: 'PENDENTE' as any
  });

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
      }

      const { data: schoolsData } = await (supabase as any).from('schools').select('id, name').order('name');
      setSchools(schoolsData || []);
      
      await fetchDemands();
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  }

  async function fetchDemands() {
    const { data, error } = await (supabase as any)
      .from('demands')
      .select('*, schools(name)')
      .order('deadline', { ascending: true });
    
    if (!error) setDemands(data || []);
  }

  const isAdmin = userRole === 'regional_admin';

  // --- CÁLCULOS E INDICADORES ---
  const today = new Date().toISOString().split('T')[0];

  const filteredDemands = useMemo(() => {
    return demands.filter(d => {
      const matchesSearch = d.title.toLowerCase().includes(searchTerm.toLowerCase()) || 
                           d.schools?.name.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesRole = isAdmin ? true : d.school_id === userSchoolId;
      return matchesSearch && matchesRole;
    });
  }, [demands, searchTerm, isAdmin, userSchoolId]);

  const stats = useMemo(() => {
    const total = filteredDemands.length;
    const met = filteredDemands.filter(d => d.status === 'CONCLUÍDO').length;
    const pending = filteredDemands.filter(d => d.status === 'PENDENTE').length;
    const overdue = filteredDemands.filter(d => d.status === 'PENDENTE' && d.deadline < today).length;

    return { total, met, pending, overdue };
  }, [filteredDemands, today]);

  const chartData = [
    { name: 'Atendidas', value: stats.met, color: '#10b981' },
    { name: 'Pendentes', value: stats.pending, color: '#6366f1' }
  ];

  // --- AÇÕES ---
  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!isAdmin) return;
    setSaveLoading(true);

    try {
      if (editingDemand) {
        const { error } = await (supabase as any).from('demands').update(formData).eq('id', editingDemand.id);
        if (error) throw error;
      } else {
        const { error } = await (supabase as any).from('demands').insert([formData]);
        if (error) throw error;
      }
      setIsModalOpen(false);
      fetchDemands();
    } catch (error: any) {
      alert("Erro ao salvar demanda: " + error.message);
    } finally {
      setSaveLoading(false);
    }
  }

  async function toggleStatus(demand: Demand) {
    if (!isAdmin) return;
    const newStatus = demand.status === 'PENDENTE' ? 'CONCLUÍDO' : 'PENDENTE';
    const completedAt = newStatus === 'CONCLUÍDO' ? new Date().toISOString() : null;
    
    await (supabase as any).from('demands').update({ status: newStatus, completed_at: completedAt }).eq('id', demand.id);
    fetchDemands();
  }

  async function handleDelete(id: string) {
    if (!confirm("Remover esta solicitação permanentemente?")) return;
    await (supabase as any).from('demands').delete().eq('id', id);
    fetchDemands();
  }

  function openModal(demand: Demand | null = null) {
    if (demand) {
      setEditingDemand(demand);
      setFormData({
        school_id: demand.school_id,
        title: demand.title,
        description: demand.description,
        deadline: demand.deadline,
        priority: demand.priority,
        status: demand.status
      });
    } else {
      setEditingDemand(null);
      setFormData({
        school_id: '',
        title: '',
        description: '',
        deadline: new Date().toISOString().split('T')[0],
        priority: 'ALTA',
        status: 'PENDENTE'
      });
    }
    setIsModalOpen(true);
  }

  return (
    <div className="space-y-8 pb-20">
      {/* Cabeçalho de Impacto */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="flex items-center gap-4">
          <div className="p-4 bg-red-600 rounded-[2rem] text-white shadow-2xl shadow-red-200 animate-pulse">
            <AlertCircle size={32} />
          </div>
          <div>
            <h1 className="text-3xl font-black text-slate-900 tracking-tight uppercase leading-none">Controle de Demandas</h1>
            <p className="text-slate-500 font-medium mt-1">Solicitações de urgência e documentos obrigatórios.</p>
          </div>
        </div>
        
        {isAdmin && (
          <button onClick={() => openModal()} className="bg-slate-900 hover:bg-black text-white px-8 py-4 rounded-2xl font-black flex items-center gap-3 shadow-xl transition-all active:scale-95">
            <Plus size={20} /> CADASTRAR DEMANDA
          </button>
        )}
      </div>

      {/* Monitor de Urgência e Gráfico */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        {/* Painel de Alertas Rápidos */}
        <div className="lg:col-span-8 grid grid-cols-1 md:grid-cols-2 gap-4">
           <div className="bg-white p-8 rounded-[3rem] border border-slate-100 shadow-xl flex items-center gap-6 group hover:border-red-200 transition-all">
              <div className="w-16 h-16 bg-red-50 text-red-600 rounded-3xl flex items-center justify-center group-hover:scale-110 transition-transform"><AlertCircle size={32}/></div>
              <div>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none">Atraso Crítico</p>
                <h3 className="text-3xl font-black text-red-600 mt-1">{stats.overdue} <span className="text-xs font-bold uppercase text-slate-400 ml-1">Fora do Prazo</span></h3>
              </div>
           </div>

           <div className="bg-white p-8 rounded-[3rem] border border-slate-100 shadow-xl flex items-center gap-6 group hover:border-indigo-200 transition-all">
              <div className="w-16 h-16 bg-indigo-50 text-indigo-600 rounded-3xl flex items-center justify-center group-hover:scale-110 transition-transform"><Clock size={32}/></div>
              <div>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none">Em Aberto</p>
                <h3 className="text-3xl font-black text-slate-800 mt-1">{stats.pending} <span className="text-xs font-bold uppercase text-slate-400 ml-1">Pendentes</span></h3>
              </div>
           </div>

           <div className="bg-white p-8 rounded-[3rem] border border-slate-100 shadow-xl flex items-center gap-6 group hover:border-emerald-200 transition-all">
              <div className="w-16 h-16 bg-emerald-50 text-emerald-600 rounded-3xl flex items-center justify-center group-hover:scale-110 transition-transform"><CheckCircle2 size={32}/></div>
              <div>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none">Concluídas</p>
                <h3 className="text-3xl font-black text-emerald-600 mt-1">{stats.met} <span className="text-xs font-bold uppercase text-slate-400 ml-1">Finalizadas</span></h3>
              </div>
           </div>

           <div className="bg-slate-900 p-8 rounded-[3rem] shadow-2xl text-white flex items-center gap-6 relative overflow-hidden">
              <div className="relative z-10">
                <p className="text-[10px] font-black text-indigo-400 uppercase tracking-widest leading-none">Total da Rede</p>
                <h3 className="text-3xl font-black mt-1">{stats.total} <span className="text-xs font-bold uppercase text-white/40 ml-1">Solicitações</span></h3>
              </div>
              <Building2 size={80} className="absolute -right-4 -bottom-4 text-white/5" />
           </div>
        </div>

        {/* Gráfico de Pizza Atendimento */}
        <div className="lg:col-span-4">
          <div className="bg-white p-8 rounded-[3rem] border border-slate-100 shadow-2xl h-full flex flex-col items-center justify-center">
             <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-4">Eficiência de Resposta</h4>
             <div className="h-[200px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={chartData}
                      innerRadius={60}
                      outerRadius={80}
                      paddingAngle={5}
                      dataKey="value"
                    >
                      {chartData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', fontWeight: 'bold' }} />
                    <Legend verticalAlign="bottom" height={36} iconType="circle" />
                  </PieChart>
                </ResponsiveContainer>
             </div>
             <p className="text-[10px] font-bold text-slate-400 text-center px-4 mt-4 uppercase">Cumprimento das solicitações administrativas.</p>
          </div>
        </div>
      </div>

      {/* Lista de Demandas Críticas */}
      <div className="space-y-6">
        <div className="flex flex-col md:flex-row gap-4 items-center justify-between px-2">
           <div className="flex items-center gap-2">
              <Filter size={18} className="text-slate-400"/>
              <h2 className="text-xl font-black text-slate-800 uppercase tracking-tight">Monitoramento Detalhado</h2>
           </div>
           <div className="bg-white p-2 rounded-2xl border border-slate-100 shadow-sm w-full md:max-w-md">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                <input type="text" placeholder="Filtrar por escola ou título da demanda..." className="w-full pl-10 pr-4 py-2 bg-slate-50 border-none rounded-xl focus:ring-2 focus:ring-red-500 font-medium outline-none text-sm" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
              </div>
           </div>
        </div>

        {loading ? (
          <div className="py-20 flex flex-col items-center justify-center gap-4">
             <Loader2 className="animate-spin text-red-600" size={40}/>
             <p className="text-xs font-black text-slate-400 uppercase tracking-widest">Sincronizando Demandas...</p>
          </div>
        ) : filteredDemands.length === 0 ? (
          <div className="py-32 bg-white rounded-[3rem] border-2 border-dashed border-slate-100 text-center">
             <MessageSquare size={48} className="mx-auto text-slate-200 mb-4"/>
             <p className="text-slate-400 font-black uppercase text-xs">Nenhuma demanda ativa encontrada.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4">
            {filteredDemands.map((demand) => {
              const isOverdue = demand.status === 'PENDENTE' && demand.deadline < today;
              const isHighPriority = demand.priority === 'CRÍTICA' || demand.priority === 'ALTA';
              
              return (
                <div key={demand.id} className={`group bg-white p-6 rounded-[2.5rem] border-2 transition-all hover:shadow-2xl flex flex-col md:flex-row items-center justify-between gap-6 ${isOverdue ? 'border-red-200 bg-red-50/20' : isHighPriority ? 'border-amber-100' : 'border-slate-50'}`}>
                   <div className="flex items-center gap-6 flex-1 w-full">
                      <div className={`w-16 h-16 rounded-[1.8rem] flex items-center justify-center shrink-0 shadow-lg ${isOverdue ? 'bg-red-600 text-white animate-pulse' : demand.status === 'CONCLUÍDO' ? 'bg-emerald-500 text-white' : 'bg-slate-100 text-slate-400'}`}>
                         {isOverdue ? <AlertCircle size={28}/> : demand.status === 'CONCLUÍDO' ? <CheckCircle2 size={28}/> : <Clock size={28}/>}
                      </div>
                      
                      <div className="flex-1">
                        <div className="flex flex-wrap items-center gap-2 mb-1">
                           <span className="text-[9px] font-black bg-slate-900 text-white px-3 py-0.5 rounded-full uppercase tracking-widest">{demand.schools?.name}</span>
                           <span className={`text-[9px] font-black px-3 py-0.5 rounded-full uppercase tracking-widest ${
                             demand.priority === 'CRÍTICA' ? 'bg-red-100 text-red-600' : 
                             demand.priority === 'ALTA' ? 'bg-orange-100 text-orange-600' : 'bg-blue-100 text-blue-600'
                           }`}>Prioridade {demand.priority}</span>
                        </div>
                        <h3 className="text-xl font-black text-slate-800 uppercase tracking-tight line-clamp-1">{demand.title}</h3>
                        <p className="text-sm text-slate-500 font-medium mt-1 line-clamp-1">{demand.description}</p>
                      </div>
                   </div>

                   <div className="flex flex-col md:flex-row items-center gap-8 w-full md:w-auto">
                      <div className="text-center md:text-right">
                         <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Prazo de Entrega</p>
                         <p className={`text-sm font-black ${isOverdue ? 'text-red-600 underline decoration-2' : 'text-slate-700'}`}>
                            {new Date(demand.deadline + 'T12:00:00').toLocaleDateString()}
                         </p>
                         {isOverdue && <p className="text-[8px] font-black text-red-500 uppercase mt-1">Prazo Expirado</p>}
                      </div>

                      <div className="flex items-center gap-2">
                        {isAdmin && (
                          <>
                             <button onClick={() => toggleStatus(demand)} className={`px-6 py-3 rounded-2xl font-black text-[10px] uppercase transition-all shadow-md ${demand.status === 'CONCLUÍDO' ? 'bg-emerald-100 text-emerald-700 border-emerald-200' : 'bg-slate-900 text-white hover:bg-black'}`}>
                                {demand.status === 'CONCLUÍDO' ? 'Atendida' : 'Marcar como Atendida'}
                             </button>
                             <button onClick={() => openModal(demand)} className="p-3 bg-white border border-slate-100 text-slate-400 hover:text-indigo-600 rounded-xl transition-all"><Edit size={18}/></button>
                             <button onClick={() => handleDelete(demand.id)} className="p-3 bg-white border border-slate-100 text-slate-400 hover:text-red-600 rounded-xl transition-all"><Trash2 size={18}/></button>
                          </>
                        )}
                        {!isAdmin && (
                          <div className={`px-6 py-3 rounded-2xl font-black text-[10px] uppercase border-2 ${demand.status === 'CONCLUÍDO' ? 'bg-emerald-50 border-emerald-100 text-emerald-600' : 'bg-amber-50 border-amber-100 text-amber-600'}`}>
                            {demand.status === 'CONCLUÍDO' ? 'Tarefa Concluída' : 'Aguardando Resposta'}
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

      {/* Modal Cadastro/Edição */}
      {isModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/80 backdrop-blur-sm p-4">
          <div className="bg-white rounded-[3rem] w-full max-w-2xl shadow-2xl overflow-hidden border border-white animate-in zoom-in-95 duration-200">
            <div className="p-8 border-b border-slate-100 flex justify-between items-center bg-indigo-50/50">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-slate-900 rounded-2xl flex items-center justify-center text-white"><AlertCircle size={24} /></div>
                <div>
                  <h2 className="text-xl font-black uppercase tracking-tight leading-none">{editingDemand ? 'Editar Solicitação' : 'Nova Demanda Regional'}</h2>
                  <p className="text-xs text-indigo-600 font-bold uppercase tracking-widest mt-1">SGE-GSU Gestão Estratégica</p>
                </div>
              </div>
              <button onClick={() => setIsModalOpen(false)} className="p-2 hover:bg-white rounded-full transition-colors text-slate-400"><X size={24} /></button>
            </div>

            <form onSubmit={handleSave} className="p-8 space-y-6 overflow-y-auto max-h-[80vh] custom-scrollbar">
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-500 uppercase ml-1">Unidade Escolar Solicitada</label>
                <select required className="w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl font-bold text-slate-800 focus:border-indigo-500 outline-none transition-all" value={formData.school_id} onChange={e => setFormData({...formData, school_id: e.target.value})}>
                   <option value="">Selecione a Escola...</option>
                   {schools.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-500 uppercase ml-1">Título da Demanda (E-mail ou Documento)</label>
                <input required className="w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl font-bold text-slate-800 focus:border-indigo-500 outline-none transition-all" placeholder="Ex: Resposta E-mail SEI 12345" value={formData.title} onChange={e => setFormData({...formData, title: e.target.value})} />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-500 uppercase ml-1">Data Limite (Prazo Final)</label>
                  <input type="date" required className="w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl font-bold focus:border-red-500" value={formData.deadline} onChange={e => setFormData({...formData, deadline: e.target.value})} />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-500 uppercase ml-1">Nível de Prioridade</label>
                  <select className="w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl font-bold" value={formData.priority} onChange={e => setFormData({...formData, priority: e.target.value as any})}>
                     <option value="BAIXA">BAIXA</option>
                     <option value="MÉDIA">MÉDIA</option>
                     <option value="ALTA">ALTA</option>
                     <option value="CRÍTICA">CRÍTICA</option>
                  </select>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-500 uppercase ml-1">Descrição Detalhada do Pedido</label>
                <textarea className="w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl font-bold text-slate-800 focus:border-indigo-500 outline-none transition-all min-h-[120px]" placeholder="O que exatamente a escola precisa entregar ou responder?" value={formData.description} onChange={e => setFormData({...formData, description: e.target.value})} />
              </div>

              <div className="pt-6 flex justify-end gap-3 border-t border-slate-50 sticky bottom-0 bg-white">
                <button type="button" onClick={() => setIsModalOpen(false)} className="px-8 py-4 text-slate-400 font-black hover:text-slate-600 transition-all uppercase tracking-widest text-xs">Descartar</button>
                <button type="submit" disabled={saveLoading} className="px-12 py-4 bg-red-600 text-white rounded-2xl font-black shadow-xl shadow-red-100 hover:bg-red-700 flex items-center gap-3 active:scale-95 transition-all disabled:opacity-50">
                  {saveLoading ? <Loader2 className="animate-spin" size={20}/> : <Save size={20} />} ATIVAR SOLICITAÇÃO
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default Demanda;
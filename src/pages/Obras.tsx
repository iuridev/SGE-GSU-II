import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { 
  Tooltip, 
  ResponsiveContainer, 
  PieChart, 
  Pie, 
  Cell, 
  Legend 
} from 'recharts';
import { 
   Search, Plus, Loader2, Building2, 
  CheckCircle2, Clock, AlertTriangle, 
  Hammer, X, Save, Trash2,
  Edit, Siren, Filter, LayoutDashboard, List
} from 'lucide-react';

// --- Tipos & Interfaces ---
interface School {
  id: string;
  name: string;
}

interface ConstructionWork {
  id: string;
  school_id: string;
  title: string;
  integra_code?: string;
  pi_code?: string;
  sei_number?: string;
  company_name: string;
  start_date: string;
  deadline_days: number;
  status: 'EM ANDAMENTO' | 'CONCLUÍDO' | 'PARALISADO';
  school?: { name: string };
  created_at?: string;
}

export function Obras() {
  // --- Estados ---
  const [works, setWorks] = useState<ConstructionWork[]>([]);
  const [schools, setSchools] = useState<School[]>([]);
  const [loading, setLoading] = useState(true);
  const [saveLoading, setSaveLoading] = useState(false);
  const [userRole, setUserRole] = useState('');
  const [userSchoolId, setUserSchoolId] = useState<string | null>(null);
  
  // Novos estados de filtro visual
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('TODOS');
  const [viewMode, setViewMode] = useState<'cards' | 'table'>('table');

  // Estados do Modal
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingWork, setEditingWork] = useState<ConstructionWork | null>(null);
  
  const [formData, setFormData] = useState<{
    school_id: string;
    title: string;
    integra_code: string;
    pi_code: string;
    sei_number: string;
    company_name: string;
    start_date: string;
    deadline_days: number;
    status: 'EM ANDAMENTO' | 'CONCLUÍDO' | 'PARALISADO';
  }>({
    school_id: '',
    title: '',
    integra_code: '',
    pi_code: '',
    sei_number: '',
    company_name: '',
    start_date: new Date().toISOString().split('T')[0],
    deadline_days: 180,
    status: 'EM ANDAMENTO'
  });

  // --- Efeitos e Fetch ---
  useEffect(() => {
    fetchInitialData();
  }, []);

  async function fetchInitialData() {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      let role = '';
      let sId = null;

      if (user) {
        const { data: profile } = await (supabase as any)
          .from('profiles')
          .select('role, school_id')
          .eq('id', user.id)
          .single();
        
        role = profile?.role || '';
        sId = profile?.school_id || null;
        setUserRole(role);
        setUserSchoolId(sId);
      }

      const { data: schoolsData } = await (supabase as any).from('schools').select('id, name').order('name');
      setSchools(schoolsData || []);

      await fetchWorks(role, sId);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  }

  async function fetchWorks(role: string, sId: string | null) {
    let query = (supabase as any)
      .from('construction_works')
      .select('*, school:schools(name)');

    if (role === 'school_manager' && sId) {
      query = query.eq('school_id', sId);
    }

    const { data, error } = await query.order('created_at', { ascending: false });
    if (!error) setWorks(data || []);
  }

  // --- Lógica de Negócio e Helpers ---
  const calculateDeadline = (startDate: string, days: number) => {
    const date = new Date(startDate);
    date.setDate(date.getDate() + days);
    return date; 
  };

  const getWorkStatusInfo = (work: ConstructionWork) => {
    if (work.status === 'CONCLUÍDO') return { label: 'Concluído', color: 'bg-emerald-100 text-emerald-700 border-emerald-200', rawStatus: 'concluido' };
    if (work.status === 'PARALISADO') return { label: 'Paralisado', color: 'bg-slate-100 text-slate-600 border-slate-200', rawStatus: 'paralisado' };

    const end = calculateDeadline(work.start_date, work.deadline_days);
    const today = new Date();
    today.setHours(0,0,0,0);
    const endDateCheck = new Date(end);
    endDateCheck.setHours(0,0,0,0);

    const diffTime = endDateCheck.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays < 0) return { label: `Atrasado ${Math.abs(diffDays)} dias`, color: 'bg-red-100 text-red-700 border-red-200', rawStatus: 'atrasado', diffDays };
    if (diffDays <= 30) return { label: `Atenção: ${diffDays} dias`, color: 'bg-amber-100 text-amber-700 border-amber-200', rawStatus: 'atencao', diffDays };
    
    return { label: 'Em Andamento', color: 'bg-blue-50 text-blue-700 border-blue-200', rawStatus: 'andamento', diffDays };
  };

  const getTimeProgress = (work: ConstructionWork) => {
    if (work.status === 'CONCLUÍDO') return 100;
    if (work.status === 'PARALISADO') return 0;

    const start = new Date(work.start_date).getTime();
    const end = calculateDeadline(work.start_date, work.deadline_days).getTime();
    const now = new Date().getTime();
    const total = end - start;
    const elapsed = now - start;

    let percent = (elapsed / total) * 100;
    if (percent < 0) percent = 0;
    if (percent > 100) percent = 100;
    return Math.round(percent);
  };

  // --- Dados Computados para Dashboard ---
  const kpiData = useMemo(() => {
    const total = works.length;
    const concluidas = works.filter(w => w.status === 'CONCLUÍDO').length;
    const paralisadas = works.filter(w => w.status === 'PARALISADO').length;
    
    let atrasadas = 0;
    let emAndamento = 0;

    works.forEach(w => {
      if (w.status === 'EM ANDAMENTO') {
        const info = getWorkStatusInfo(w);
        if (info.rawStatus === 'atrasado') atrasadas++;
        else emAndamento++;
      }
    });

    return { total, concluidas, paralisadas, atrasadas, emAndamento };
  }, [works]);

  const chartDataStatus = [
    { name: 'Em Andamento', value: kpiData.emAndamento, color: '#3B82F6' },
    { name: 'Concluídas', value: kpiData.concluidas, color: '#10B981' },
    { name: 'Atrasadas', value: kpiData.atrasadas, color: '#EF4444' },
    { name: 'Paralisadas', value: kpiData.paralisadas, color: '#94A3B8' },
  ].filter(d => d.value > 0);

  const filteredWorks = useMemo(() => {
    return works.filter(w => {
      const matchesSearch = 
        w.title.toLowerCase().includes(searchTerm.toLowerCase()) || 
        w.school?.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        w.company_name.toLowerCase().includes(searchTerm.toLowerCase());
      
      const statusInfo = getWorkStatusInfo(w);
      let matchesFilter = true;
      
      if (statusFilter === 'ATRASADO') matchesFilter = statusInfo.rawStatus === 'atrasado';
      else if (statusFilter === 'CONCLUIDO') matchesFilter = w.status === 'CONCLUÍDO';
      else if (statusFilter === 'ANDAMENTO') matchesFilter = w.status === 'EM ANDAMENTO' && statusInfo.rawStatus !== 'atrasado';
      else if (statusFilter === 'PARALISADO') matchesFilter = w.status === 'PARALISADO';

      return matchesSearch && matchesFilter;
    });
  }, [works, searchTerm, statusFilter]);

  // --- Ações do Banco de Dados ---
  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaveLoading(true);
    try {
      const payload = {
        ...formData,
        integra_code: formData.integra_code || null,
        pi_code: formData.pi_code || null,
        sei_number: formData.sei_number || null,
      };

      if (editingWork) {
        await (supabase as any).from('construction_works').update(payload).eq('id', editingWork.id);
      } else {
        await (supabase as any).from('construction_works').insert([payload]);
      }
      setIsModalOpen(false);
      fetchWorks(userRole, userSchoolId);
    } catch (error: any) {
      alert("Erro ao salvar: " + error.message);
    } finally {
      setSaveLoading(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Tem certeza que deseja excluir este registo de obra?")) return;
    await (supabase as any).from('construction_works').delete().eq('id', id);
    fetchWorks(userRole, userSchoolId);
  }

  async function markAsComplete(work: ConstructionWork) {
    if (!confirm(`Confirmar conclusão da obra "${work.title}"?`)) return;
    await (supabase as any).from('construction_works').update({ status: 'CONCLUÍDO' }).eq('id', work.id);
    fetchWorks(userRole, userSchoolId);
  }

  function openModal(work: ConstructionWork | null = null) {
    if (work) {
      setEditingWork(work);
      setFormData({
        school_id: work.school_id,
        title: work.title,
        integra_code: work.integra_code || '',
        pi_code: work.pi_code || '',
        sei_number: work.sei_number || '',
        company_name: work.company_name,
        start_date: work.start_date,
        deadline_days: work.deadline_days,
        status: work.status
      });
    } else {
      setEditingWork(null);
      setFormData({
        school_id: userRole === 'school_manager' && userSchoolId ? userSchoolId : '',
        title: '',
        integra_code: '',
        pi_code: '',
        sei_number: '',
        company_name: '',
        start_date: new Date().toISOString().split('T')[0],
        deadline_days: 180,
        status: 'EM ANDAMENTO'
      });
    }
    setIsModalOpen(true);
  }

  const isAdmin = userRole === 'regional_admin';

  return (
    <div className="min-h-screen space-y-8 pb-32 bg-[#f8fafc] p-6 font-sans">
      
      {/* Header Dashboard */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
           <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Painel de Obras</h1>
           <p className="text-slate-500 mt-1">Visão geral do cronograma físico e status das intervenções.</p>
        </div>
        
        {isAdmin && (
          <button 
            onClick={() => openModal()}
            className="bg-orange-600 hover:bg-orange-700 text-white px-6 py-3 rounded-xl font-bold shadow-lg shadow-orange-100 flex items-center gap-2 transition-all active:scale-95"
          >
            <Plus size={20} /> Nova Obra
          </button>
        )}
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard title="Total de Obras" value={kpiData.total} icon={Building2} color="bg-white" />
        <KPICard title="Em Andamento" value={kpiData.emAndamento} icon={Hammer} iconColor="text-blue-600" borderColor="border-l-4 border-blue-500" />
        <KPICard title="Concluídas" value={kpiData.concluidas} icon={CheckCircle2} iconColor="text-emerald-600" borderColor="border-l-4 border-emerald-500" />
        <KPICard title="Atrasadas" value={kpiData.atrasadas} icon={AlertTriangle} iconColor="text-red-600" valueColor="text-red-600" borderColor="border-l-4 border-red-500" />
      </div>

      {/* Gráficos e Filtros */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Gráfico de Status */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 lg:col-span-1">
          <h3 className="text-lg font-bold text-slate-800 mb-4">Distribuição por Status</h3>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={chartDataStatus}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={80}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {chartDataStatus.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip contentStyle={{borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'}} />
                <Legend verticalAlign="bottom" height={36} iconType="circle"/>
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Lista / Tabela */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 lg:col-span-2 flex flex-col">
          
          {/* Toolbar */}
          <div className="p-5 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <h3 className="text-lg font-bold text-slate-800">Obras Recentes</h3>
            
            <div className="flex flex-wrap gap-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                <input 
                  type="text" 
                  placeholder="Buscar obra, escola..." 
                  className="pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 w-full sm:w-48"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
              
              <div className="relative">
                <Filter className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                <select 
                  className="pl-10 pr-8 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 appearance-none cursor-pointer font-medium text-slate-600"
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                >
                  <option value="TODOS">Todos Status</option>
                  <option value="ANDAMENTO">Em Andamento</option>
                  <option value="ATRASADO">Atrasados</option>
                  <option value="CONCLUIDO">Concluídos</option>
                  <option value="PARALISADO">Paralisados</option>
                </select>
              </div>

              <div className="flex bg-slate-100 rounded-lg p-1">
                 <button onClick={() => setViewMode('table')} className={`p-1.5 rounded-md transition-all ${viewMode === 'table' ? 'bg-white shadow text-slate-800' : 'text-slate-400'}`}><List size={18}/></button>
                 <button onClick={() => setViewMode('cards')} className={`p-1.5 rounded-md transition-all ${viewMode === 'cards' ? 'bg-white shadow text-slate-800' : 'text-slate-400'}`}><LayoutDashboard size={18}/></button>
              </div>
            </div>
          </div>

          {/* Conteúdo da Lista */}
          {loading ? (
             <div className="flex-1 flex flex-col items-center justify-center py-20">
                <Loader2 className="animate-spin text-orange-500 mb-2" size={32} />
                <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">Carregando...</span>
             </div>
          ) : filteredWorks.length === 0 ? (
             <div className="flex-1 flex flex-col items-center justify-center py-20 text-center px-4">
                <Building2 className="text-slate-200 mb-4" size={48} />
                <span className="text-slate-400 font-medium">Nenhuma obra encontrada com os filtros atuais.</span>
             </div>
          ) : viewMode === 'table' ? (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 text-slate-500 text-[10px] uppercase tracking-wider font-bold">
                    <th className="p-4 border-b border-slate-100">Obra / Escola</th>
                    <th className="p-4 border-b border-slate-100">Empresa</th>
                    <th className="p-4 border-b border-slate-100">Cronograma (Tempo)</th>
                    <th className="p-4 border-b border-slate-100">Status</th>
                    {isAdmin && <th className="p-4 border-b border-slate-100 text-right">Ações</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {filteredWorks.map((work) => {
                    const statusInfo = getWorkStatusInfo(work);
                    const progress = getTimeProgress(work);
                    const endDate = calculateDeadline(work.start_date, work.deadline_days);

                    return (
                      <tr key={work.id} className="hover:bg-slate-50/50 transition-colors group">
                        <td className="p-4">
                          <div className="flex flex-col">
                            <span className="font-bold text-slate-800 text-sm">{work.title}</span>
                            <span className="text-xs text-slate-500 flex items-center gap-1 mt-0.5">
                              <Building2 size={12} /> {work.school?.name}
                            </span>
                          </div>
                        </td>
                        <td className="p-4 text-xs font-medium text-slate-600">
                           {work.company_name}
                           {work.sei_number && <div className="text-[9px] text-slate-400">SEI: {work.sei_number}</div>}
                        </td>
                        <td className="p-4 w-48">
                          <div className="flex flex-col gap-1">
                             <div className="flex justify-between text-[10px] text-slate-400 font-bold uppercase">
                                <span>Início: {new Date(work.start_date).toLocaleDateString()}</span>
                                <span>{progress}% do Prazo</span>
                             </div>
                             <div className="h-2 bg-slate-100 rounded-full overflow-hidden w-full">
                               <div 
                                 className={`h-full rounded-full transition-all duration-500 ${
                                    progress >= 100 && work.status !== 'CONCLUÍDO' ? 'bg-red-500' : 
                                    work.status === 'CONCLUÍDO' ? 'bg-emerald-500' : 'bg-blue-500'
                                 }`}
                                 style={{ width: `${progress}%` }}
                               />
                             </div>
                             <div className="text-[10px] text-right font-medium text-slate-500">
                                Prev: {endDate.toLocaleDateString()}
                             </div>
                          </div>
                        </td>
                        <td className="p-4">
                          <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wide border ${statusInfo.color}`}>
                             {statusInfo.rawStatus === 'atrasado' ? <Siren size={12}/> : 
                              work.status === 'CONCLUÍDO' ? <CheckCircle2 size={12}/> : <Clock size={12}/>}
                             {statusInfo.label}
                          </div>
                        </td>
                        {isAdmin && (
                          <td className="p-4 text-right">
                            <div className="flex justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                               <button onClick={() => openModal(work)} className="p-1.5 hover:bg-orange-50 text-slate-400 hover:text-orange-600 rounded-lg transition-colors"><Edit size={16}/></button>
                               <button onClick={() => handleDelete(work.id)} className="p-1.5 hover:bg-red-50 text-slate-400 hover:text-red-600 rounded-lg transition-colors"><Trash2 size={16}/></button>
                            </div>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
             <div className="grid grid-cols-1 gap-4 p-4">
                {filteredWorks.map(work => {
                   const statusInfo = getWorkStatusInfo(work);
                   const progress = getTimeProgress(work);

                   return (
                      <div key={work.id} className="bg-white border border-slate-100 rounded-2xl p-5 hover:shadow-md transition-all">
                         <div className="flex justify-between items-start mb-3">
                            <div>
                               <h4 className="font-bold text-slate-800">{work.title}</h4>
                               <p className="text-xs text-slate-500 font-medium flex items-center gap-1 mt-1"><Building2 size={12}/> {work.school?.name}</p>
                            </div>
                            <div className={`px-2 py-1 rounded-lg text-[10px] font-black uppercase border ${statusInfo.color}`}>
                               {statusInfo.label}
                            </div>
                         </div>
                         
                         <div className="mb-4">
                            <div className="flex justify-between text-[10px] font-bold text-slate-400 uppercase mb-1">
                               <span>Progresso do Prazo</span>
                               <span>{progress}%</span>
                            </div>
                            <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                               <div className={`h-full rounded-full ${progress >= 100 && work.status !== 'CONCLUÍDO' ? 'bg-red-500' : 'bg-blue-500'}`} style={{width: `${progress}%`}}></div>
                            </div>
                         </div>

                         <div className="flex justify-between items-center pt-3 border-t border-slate-50">
                            <span className="text-xs text-slate-500 font-medium">{work.company_name}</span>
                            {isAdmin && (
                               <div className="flex gap-2">
                                  {work.status !== 'CONCLUÍDO' && (
                                     <button onClick={() => markAsComplete(work)} className="text-[10px] font-bold text-emerald-600 hover:underline uppercase">Concluir</button>
                                  )}
                                  <button onClick={() => openModal(work)} className="text-slate-400 hover:text-orange-600"><Edit size={14}/></button>
                               </div>
                            )}
                         </div>
                      </div>
                   )
                })}
             </div>
          )}
        </div>
      </div>

      {/* Modal Criar/Editar */}
      {isModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/90 backdrop-blur-md p-4">
          <div className="bg-white rounded-[2rem] w-full max-w-2xl max-h-[90vh] shadow-2xl overflow-hidden border border-white flex flex-col">
             <div className="p-8 border-b border-slate-100 flex justify-between items-center bg-slate-50/50 shrink-0">
                <div className="flex items-center gap-4">
                   <div className="w-12 h-12 bg-orange-600 rounded-2xl flex items-center justify-center text-white shadow-lg"><Hammer size={24}/></div>
                   <div>
                      <h2 className="text-xl font-black uppercase tracking-tight">{editingWork ? 'Editar Obra' : 'Nova Obra'}</h2>
                      <p className="text-[10px] text-orange-600 font-bold uppercase tracking-widest mt-1">Cadastro Técnico</p>
                   </div>
                </div>
                <button onClick={() => setIsModalOpen(false)} className="p-3 hover:bg-white rounded-full text-slate-400"><X size={24}/></button>
             </div>

             <form onSubmit={handleSave} className="p-10 space-y-6 overflow-y-auto custom-scrollbar flex-1">
                <div className="space-y-2">
                   <label className="text-[10px] font-black text-slate-500 uppercase ml-1">Unidade Escolar</label>
                   <select required className="w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl font-bold outline-none focus:border-orange-500" value={formData.school_id} onChange={e => setFormData({...formData, school_id: e.target.value})}>
                      <option value="">Selecione...</option>
                      {schools.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                   </select>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                   <div className="space-y-2">
                      <label className="text-[10px] font-black text-slate-500 uppercase ml-1">Nome da Obra / Serviço</label>
                      <input required className="w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl font-bold focus:border-orange-500 outline-none" placeholder="Ex: Reforma da Cozinha" value={formData.title} onChange={e => setFormData({...formData, title: e.target.value})} />
                   </div>
                   <div className="space-y-2">
                      <label className="text-[10px] font-black text-slate-500 uppercase ml-1">Empresa Contratada</label>
                      <input required className="w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl font-bold focus:border-orange-500 outline-none" placeholder="Razão Social" value={formData.company_name} onChange={e => setFormData({...formData, company_name: e.target.value})} />
                   </div>
                </div>

                <div className="grid grid-cols-3 gap-4">
                   <div className="space-y-2">
                      <label className="text-[10px] font-black text-slate-500 uppercase ml-1">Nº Integra (Opc.)</label>
                      <input className="w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl font-mono text-sm font-bold focus:border-orange-500 outline-none" placeholder="0000" value={formData.integra_code} onChange={e => setFormData({...formData, integra_code: e.target.value})} />
                   </div>
                   <div className="space-y-2">
                      <label className="text-[10px] font-black text-slate-500 uppercase ml-1">Nº PI (Opc.)</label>
                      <input className="w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl font-mono text-sm font-bold focus:border-orange-500 outline-none" placeholder="0000" value={formData.pi_code} onChange={e => setFormData({...formData, pi_code: e.target.value})} />
                   </div>
                   <div className="space-y-2">
                      <label className="text-[10px] font-black text-slate-500 uppercase ml-1">Nº SEI (Opc.)</label>
                      <input className="w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl font-mono text-sm font-bold focus:border-orange-500 outline-none" placeholder="000.000..." value={formData.sei_number} onChange={e => setFormData({...formData, sei_number: e.target.value})} />
                   </div>
                </div>

                <div className="grid grid-cols-2 gap-6 bg-orange-50 p-6 rounded-2xl border border-orange-100">
                   <div className="space-y-2">
                      <label className="text-[10px] font-black text-orange-700 uppercase ml-1">Data de Início</label>
                      <input type="date" required className="w-full p-4 bg-white border-2 border-orange-100 rounded-2xl font-bold focus:border-orange-500 outline-none" value={formData.start_date} onChange={e => setFormData({...formData, start_date: e.target.value})} />
                   </div>
                   <div className="space-y-2">
                      <label className="text-[10px] font-black text-orange-700 uppercase ml-1">Prazo (Dias)</label>
                      <input type="number" required min="1" className="w-full p-4 bg-white border-2 border-orange-100 rounded-2xl font-bold focus:border-orange-500 outline-none" placeholder="Ex: 180" value={formData.deadline_days} onChange={e => setFormData({...formData, deadline_days: Number(e.target.value)})} />
                   </div>
                </div>
                
                {editingWork && (
                   <div className="space-y-2">
                      <label className="text-[10px] font-black text-slate-500 uppercase ml-1">Status da Obra</label>
                      <div className="grid grid-cols-3 gap-3">
                         {['EM ANDAMENTO', 'CONCLUÍDO', 'PARALISADO'].map(s => (
                            <button key={s} type="button" onClick={() => setFormData({...formData, status: s as any})} className={`p-3 rounded-xl text-[10px] font-black uppercase border-2 transition-all ${formData.status === s ? 'bg-slate-900 border-slate-900 text-white' : 'bg-white border-slate-100 text-slate-400'}`}>
                               {s}
                            </button>
                         ))}
                      </div>
                   </div>
                )}
             </form>

             <div className="p-8 border-t border-slate-100 bg-white shrink-0 flex justify-end gap-4">
                <button onClick={() => setIsModalOpen(false)} className="px-8 py-4 text-slate-400 font-black uppercase text-xs hover:text-slate-600 transition-all">Cancelar</button>
                <button onClick={handleSave} disabled={saveLoading} className="px-12 py-4 bg-orange-600 text-white rounded-2xl font-black uppercase text-xs shadow-xl shadow-orange-100 hover:bg-orange-700 flex items-center gap-3 transition-all active:scale-95">
                   {saveLoading ? <Loader2 className="animate-spin" size={18}/> : <Save size={18}/>} Salvar
                </button>
             </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Componente Helper para KPIs
function KPICard({ title, value, icon: Icon, color = 'bg-white', iconColor = 'text-slate-600', borderColor = '', valueColor = 'text-slate-900' }: any) {
  return (
    <div className={`${color} p-6 rounded-2xl shadow-sm border border-slate-100 ${borderColor}`}>
      <div className="flex items-start justify-between mb-2">
        <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">{title}</p>
        <div className={`p-2 rounded-lg bg-slate-50 ${iconColor}`}>
          <Icon size={18} />
        </div>
      </div>
      <h3 className={`text-3xl font-black ${valueColor}`}>{value}</h3>
    </div>
  );
}
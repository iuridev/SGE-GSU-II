import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { 
  HardHat, Search, Plus, Loader2, Building2, 
  Calendar, CheckCircle2, Clock, AlertTriangle, 
  Hammer, Briefcase, X, Save, Trash2,
  Edit, Siren
} from 'lucide-react';

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
}

export function Obras() {
  const [works, setWorks] = useState<ConstructionWork[]>([]);
  const [schools, setSchools] = useState<School[]>([]);
  const [loading, setLoading] = useState(true);
  const [saveLoading, setSaveLoading] = useState(false);
  const [userRole, setUserRole] = useState('');
  const [userSchoolId, setUserSchoolId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  
  // Estados do Modal
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingWork, setEditingWork] = useState<ConstructionWork | null>(null);
  
  // Tipagem explícita para evitar erro de atribuição do status
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

  // --- LÓGICA DE DATAS E STATUS ---
  const calculateDeadline = (startDate: string, days: number) => {
    const date = new Date(startDate);
    date.setDate(date.getDate() + days); // Adiciona os dias corretamente
    // Ajuste para fuso horário local se necessário, mas para cálculo simples de dias funciona
    return date; 
  };

  const getWorkStatus = (work: ConstructionWork) => {
    if (work.status === 'CONCLUÍDO') return { label: 'Concluído', color: 'bg-emerald-100 text-emerald-700 border-emerald-200', icon: <CheckCircle2 size={14}/> };
    if (work.status === 'PARALISADO') return { label: 'Paralisado', color: 'bg-slate-100 text-slate-600 border-slate-200', icon: <X size={14}/> };

    const end = calculateDeadline(work.start_date, work.deadline_days);
    const today = new Date();
    // Resetar horas para comparação justa de datas
    today.setHours(0,0,0,0);
    const endDateCheck = new Date(end);
    endDateCheck.setHours(0,0,0,0);

    const diffTime = endDateCheck.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays < 0) return { label: `Atrasado ${Math.abs(diffDays)} dias`, color: 'bg-red-100 text-red-700 border-red-200 animate-pulse', icon: <Siren size={14}/> };
    if (diffDays <= 30) return { label: `Atenção: ${diffDays} dias`, color: 'bg-amber-100 text-amber-700 border-amber-200', icon: <AlertTriangle size={14}/> };
    
    return { label: 'Em Andamento', color: 'bg-blue-50 text-blue-700 border-blue-200', icon: <Hammer size={14}/> };
  };

  const filteredWorks = useMemo(() => {
    return works.filter(w => 
      w.title.toLowerCase().includes(searchTerm.toLowerCase()) || 
      w.school?.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      w.company_name.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [works, searchTerm]);

  // --- AÇÕES ---
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
    <div className="min-h-screen space-y-8 pb-32 bg-[#f8fafc]">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="flex items-center gap-5">
          <div className="p-4 bg-orange-600 rounded-[2rem] text-white shadow-2xl shadow-orange-100">
            <HardHat size={36} />
          </div>
          <div>
            <h1 className="text-3xl font-black text-slate-900 tracking-tight uppercase leading-none">Gestão de Obras</h1>
            <p className="text-slate-500 font-medium mt-1 uppercase text-xs tracking-widest italic">Controle Físico e Cronograma</p>
          </div>
        </div>
        
        {isAdmin && (
          <button 
            onClick={() => openModal()}
            className="bg-orange-600 hover:bg-orange-700 text-white px-8 py-4 rounded-2xl font-black flex items-center gap-3 shadow-xl transition-all active:scale-95"
          >
            <Plus size={20} /> CADASTRAR OBRA
          </button>
        )}
      </div>

      {/* Busca */}
      <div className="bg-white p-4 rounded-[2rem] border border-slate-100 shadow-sm flex items-center gap-4">
        <Search className="text-slate-400 ml-2" size={20} />
        <input 
          type="text" 
          placeholder="Buscar por escola, empresa ou nome da obra..." 
          className="w-full bg-transparent border-none outline-none font-medium text-slate-700"
          value={searchTerm} 
          onChange={(e) => setSearchTerm(e.target.value)} 
        />
      </div>

      {/* Lista de Obras */}
      {loading ? (
        <div className="py-40 flex flex-col items-center justify-center gap-4">
           <Loader2 className="animate-spin text-orange-500" size={48} />
           <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Carregando projetos...</p>
        </div>
      ) : filteredWorks.length === 0 ? (
        <div className="py-32 bg-white rounded-[3rem] border-2 border-dashed border-slate-100 text-center flex flex-col items-center justify-center">
           <Building2 size={48} className="text-slate-200 mb-4"/>
           <p className="text-slate-400 font-black uppercase text-xs">Nenhuma obra cadastrada.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6">
          {filteredWorks.map((work) => {
            const statusInfo = getWorkStatus(work);
            const endDate = calculateDeadline(work.start_date, work.deadline_days);
            
            return (
              <div key={work.id} className="bg-white p-8 rounded-[3rem] border border-slate-100 shadow-xl group hover:border-orange-200 transition-all relative overflow-hidden">
                 
                 {/* Cabeçalho do Card */}
                 <div className="flex flex-col md:flex-row justify-between items-start gap-4 mb-6">
                    <div className="flex items-start gap-4">
                       <div className="w-14 h-14 bg-slate-50 rounded-2xl flex items-center justify-center text-slate-400 border border-slate-100 shrink-0">
                          <Building2 size={24}/>
                       </div>
                       <div>
                          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">{work.school?.name}</p>
                          <h3 className="text-xl font-black text-slate-800 uppercase leading-tight">{work.title}</h3>
                          <div className="flex items-center gap-2 mt-2">
                             <div className="flex items-center gap-1.5 bg-slate-50 px-2 py-1 rounded-lg border border-slate-100">
                                <Briefcase size={12} className="text-orange-500"/>
                                <span className="text-[10px] font-bold text-slate-600 uppercase">{work.company_name}</span>
                             </div>
                             {work.sei_number && <span className="text-[9px] font-bold text-slate-400 px-2">SEI: {work.sei_number}</span>}
                          </div>
                       </div>
                    </div>

                    <div className={`px-4 py-2 rounded-xl flex items-center gap-2 border shadow-sm ${statusInfo.color}`}>
                       {statusInfo.icon}
                       <span className="text-[10px] font-black uppercase tracking-widest">{statusInfo.label}</span>
                    </div>
                 </div>

                 {/* Informações de Prazo */}
                 <div className="grid grid-cols-1 md:grid-cols-3 gap-4 bg-slate-50/50 p-6 rounded-[2rem] border border-slate-100">
                    <div className="space-y-1">
                       <p className="text-[9px] font-black text-slate-400 uppercase flex items-center gap-1"><Calendar size={10}/> Início</p>
                       <p className="text-sm font-bold text-slate-700">{new Date(work.start_date + 'T12:00:00').toLocaleDateString()}</p>
                    </div>
                    <div className="space-y-1">
                       <p className="text-[9px] font-black text-slate-400 uppercase flex items-center gap-1"><Clock size={10}/> Prazo</p>
                       <p className="text-sm font-bold text-slate-700">{work.deadline_days} Dias</p>
                    </div>
                    <div className="space-y-1">
                       <p className="text-[9px] font-black text-slate-400 uppercase flex items-center gap-1"><CheckCircle2 size={10}/> Previsão Entrega</p>
                       <p className={`text-sm font-black ${statusInfo.label.includes('Atrasado') ? 'text-red-500' : 'text-emerald-600'}`}>
                          {endDate.toLocaleDateString()}
                       </p>
                    </div>
                 </div>

                 {/* Detalhes de Protocolos */}
                 <div className="mt-4 flex flex-wrap gap-2">
                    {work.integra_code && (
                      <span className="text-[9px] font-bold text-slate-400 bg-slate-50 px-3 py-1 rounded-lg border border-slate-100">
                        Integra: {work.integra_code}
                      </span>
                    )}
                    {work.pi_code && (
                      <span className="text-[9px] font-bold text-slate-400 bg-slate-50 px-3 py-1 rounded-lg border border-slate-100">
                        PI: {work.pi_code}
                      </span>
                    )}
                 </div>

                 {/* Rodapé e Ações */}
                 {isAdmin && (
                   <div className="mt-6 pt-6 border-t border-slate-50 flex justify-end gap-3">
                      {work.status !== 'CONCLUÍDO' && (
                        <button 
                          onClick={() => markAsComplete(work)} 
                          className="px-5 py-3 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-2"
                        >
                           <CheckCircle2 size={16}/> Concluir Obra
                        </button>
                      )}
                      <button onClick={() => openModal(work)} className="p-3 bg-slate-50 hover:bg-orange-50 text-slate-400 hover:text-orange-600 rounded-xl transition-all"><Edit size={18}/></button>
                      <button onClick={() => handleDelete(work.id)} className="p-3 bg-slate-50 hover:bg-red-50 text-slate-400 hover:text-red-600 rounded-xl transition-all"><Trash2 size={18}/></button>
                   </div>
                 )}
              </div>
            );
          })}
        </div>
      )}

      {/* Modal Criar/Editar */}
      {isModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/90 backdrop-blur-md p-4">
          <div className="bg-white rounded-[3rem] w-full max-w-2xl max-h-[90vh] shadow-2xl overflow-hidden border border-white flex flex-col">
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

                <div className="grid grid-cols-2 gap-6 bg-orange-50 p-6 rounded-[2rem] border border-orange-100">
                   <div className="space-y-2">
                      <label className="text-[10px] font-black text-orange-700 uppercase ml-1">Data de Início</label>
                      <input type="date" required className="w-full p-4 bg-white border-2 border-orange-100 rounded-2xl font-bold focus:border-orange-500 outline-none" value={formData.start_date} onChange={e => setFormData({...formData, start_date: e.target.value})} />
                   </div>
                   <div className="space-y-2">
                      <label className="text-[10px] font-black text-orange-700 uppercase ml-1">Prazo (Dias Corridos)</label>
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
                   {saveLoading ? <Loader2 className="animate-spin" size={18}/> : <Save size={18}/>} Salvar Dados
                </button>
             </div>
          </div>
        </div>
      )}
    </div>
  );
}
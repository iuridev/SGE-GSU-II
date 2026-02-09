import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { 
  Package, Plus, Search, FileText, 
  Trash2, Edit, X, Save, Loader2, 
  Building2, Filter, Info, CheckCircle2,
  ArrowRight, Calendar, 
  AlertCircle, History, Flag, ShieldAlert, Gift, 
  ClipboardList, DollarSign, ListPlus, Calculator
} from 'lucide-react';

interface PatrimonioItem {
  name: string;
  asset_number: string;
  unit_value: number;
}

interface PatrimonioProcess {
  id: string;
  school_id: string;
  type: string;
  sei_number: string;
  process_date: string;
  current_step: string;
  status: string;
  occurrence_date?: string;
  bulletin_number?: string;
  is_nl_low?: boolean;
  authorship?: string;
  conclusion?: string;
  subtype?: string;
  items_json?: string; 
  created_at: string;
  schools?: { name: string };
}

interface School {
  id: string;
  name: string;
}

const PROCESS_TYPES = [
  { id: 'DOACAO_PDDE', label: 'Doação PDDE', color: 'text-emerald-600 bg-emerald-50' },
  { id: 'DOACAO_APM', label: 'Doação APM', color: 'text-emerald-600 bg-emerald-50' },
  { id: 'DOACAO_TERCEIROS', label: 'Doação Terceiros', color: 'text-indigo-600 bg-indigo-50' },
  { id: 'INSERVIVEIS', label: 'Inservíveis', color: 'text-amber-600 bg-amber-50' },
  { id: 'BANDEIRAS', label: 'Bandeiras', color: 'text-blue-600 bg-blue-50' },
  { id: 'FURTOS', label: 'Sinistros (Furtos/Roubos)', color: 'text-red-600 bg-red-50' },
];

const WORKFLOWS: Record<string, string[]> = {
  'DOACAO_PDDE': ["RECEBIDO NO SEI", "ANÁLISE DO SEFISC", "DEVOLVIDO PARA CORREÇÃO", "DOE", "REGISTRO NO SAM", "REGISTRO NÚMERO PATRIMÔNIO"],
  'DOACAO_APM': ["RECEBIDO NO SEI", "ANÁLISE DO SEFISC", "DEVOLVIDO PARA CORREÇÃO", "DOE", "REGISTRO NO SAM", "REGISTRO NÚMERO PATRIMÔNIO"],
  'DOACAO_TERCEIROS': ["RECEBIDO NO SEI", "ANÁLISE DO SEFISC", "DEVOLVIDO PARA CORREÇÃO", "DOE", "REGISTRO NO SAM", "REGISTRO NÚMERO PATRIMÔNIO"],
  'INSERVIVEIS': ["RECEBIDO NO SEI", "ANÁLISE DO SEFISC", "DEVOLVIDO PARA CORREÇÃO", "ENCAMINHAMENTO EAMEX", "BAIXA DE NL NO SAM", "REPROVADO / DEVOLVIDO"],
  'FURTOS': ["RECEBIDO NO SEI", "ANÁLISE SEFISC", "DEVOLVIDO PARA CORREÇÃO", "ENCAMINHADO PARA ASURE", "CONCLUÍDO"],
  'BANDEIRAS': ["RECEBIDO", "ANÁLISE SEFISC", "DEVOLVIDO PARA CORREÇÃO", "ENTREGA NO TIRO DE GUERRA", "BAIXA NO SAM"],
};

export function PatrimonioProcessos() {
  const [processes, setProcesses] = useState<PatrimonioProcess[]>([]);
  const [schools, setSchools] = useState<School[]>([]);
  const [loading, setLoading] = useState(true);
  const [saveLoading, setSaveLoading] = useState(false);
  const [userRole, setUserRole] = useState('');
  const [userSchoolId, setUserSchoolId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedTypeFilter, setSelectedTypeFilter] = useState<string | null>(null);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProcess, setEditingProcess] = useState<PatrimonioProcess | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [sinistroItems, setSinistroItems] = useState<PatrimonioItem[]>([]);

  const [formData, setFormData] = useState({
    school_id: '',
    type: 'DOACAO_PDDE',
    sei_number: '',
    process_date: new Date().toISOString().split('T')[0],
    current_step: '',
    status: 'RECEBIDO',
    occurrence_date: '',
    bulletin_number: '',
    is_nl_low: false,
    authorship: 'Não conhecida',
    conclusion: 'EM ANDAMENTO',
    subtype: 'Furto'
  });

  useEffect(() => {
    fetchInitialData();
  }, []);

  useEffect(() => {
    if (!editingProcess) {
      const defaultStep = WORKFLOWS[formData.type][0];
      setFormData(prev => ({ ...prev, current_step: defaultStep }));
    }
  }, [formData.type, editingProcess]);

  async function fetchInitialData() {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      let role = '';
      let schoolId = null;

      if (user) {
        const { data: profile } = await (supabase as any).from('profiles').select('role, school_id').eq('id', user.id).single();
        role = profile?.role || '';
        schoolId = profile?.school_id || null;
        setUserRole(role);
        setUserSchoolId(schoolId);
      }

      const { data: schoolsData } = await (supabase as any).from('schools').select('id, name').order('name');
      setSchools(schoolsData || []);
      
      await fetchProcesses(role, schoolId);
    } catch (error) { console.error(error); } finally { setLoading(false); }
  }

  async function fetchProcesses(role?: string, sId?: string | null) {
    const activeRole = role || userRole;
    const activeSchoolId = sId !== undefined ? sId : userSchoolId;

    let query = (supabase as any).from('asset_processes').select('*, schools(name)');
    
    if (activeRole === 'school_manager' && activeSchoolId) {
      query = query.eq('school_id', activeSchoolId);
    }

    const { data, error } = await query.order('process_date', { ascending: false });
    if (!error) setProcesses(data || []);
  }

  const isAdmin = userRole === 'regional_admin';

  const filteredProcesses = useMemo(() => {
    return processes.filter(p => {
      const matchesSearch = p.sei_number.includes(searchTerm) || p.schools?.name.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesType = selectedTypeFilter ? p.type === selectedTypeFilter : true;
      return matchesSearch && matchesType;
    });
  }, [processes, searchTerm, selectedTypeFilter]);

  const totalSinistroValue = useMemo(() => {
    return sinistroItems.reduce((acc, curr) => acc + (curr.unit_value || 0), 0);
  }, [sinistroItems]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaveLoading(true);
    setFormError(null);

    const payload = {
      ...formData,
      items_json: formData.type === 'FURTOS' ? JSON.stringify(sinistroItems) : null
    };

    try {
      const { data: existingProcess } = await (supabase as any)
        .from('asset_processes')
        .select('id, sei_number')
        .eq('sei_number', formData.sei_number.trim())
        .maybeSingle();

      if (existingProcess && (!editingProcess || existingProcess.id !== editingProcess.id)) {
        throw new Error(`Este número de processo SEI (${formData.sei_number}) já se encontra registado no sistema.`);
      }

      if (editingProcess) {
        const { error } = await (supabase as any).from('asset_processes').update(payload).eq('id', editingProcess.id);
        if (error) throw error;
      } else {
        const { error } = await (supabase as any).from('asset_processes').insert([payload]);
        if (error) throw error;
      }
      setIsModalOpen(false);
      fetchProcesses();
    } catch (error: any) {
      setFormError(error.message);
    } finally { setSaveLoading(false); }
  }

  async function handleDelete(id: string) {
    if (!confirm("Remover este processo?")) return;
    await (supabase as any).from('asset_processes').delete().eq('id', id);
    fetchProcesses();
  }

  function openModal(process: PatrimonioProcess | null = null) {
    setFormError(null);
    if (process) {
      setEditingProcess(process);
      setFormData({
        school_id: process.school_id,
        type: process.type,
        sei_number: process.sei_number,
        process_date: process.process_date,
        current_step: process.current_step,
        status: process.status,
        occurrence_date: process.occurrence_date || '',
        bulletin_number: process.bulletin_number || '',
        is_nl_low: process.is_nl_low || false,
        authorship: process.authorship || 'Não conhecida',
        conclusion: process.conclusion || 'EM ANDAMENTO',
        subtype: process.subtype || 'Furto'
      });
      setSinistroItems(process.items_json ? JSON.parse(process.items_json) : []);
    } else {
      setEditingProcess(null);
      setFormData({
        school_id: isAdmin ? '' : (userSchoolId || ''),
        type: 'DOACAO_PDDE',
        sei_number: '',
        process_date: new Date().toISOString().split('T')[0],
        current_step: WORKFLOWS['DOACAO_PDDE'][0],
        status: 'RECEBIDO',
        occurrence_date: '',
        bulletin_number: '',
        is_nl_low: false,
        authorship: 'Não conhecida',
        conclusion: 'EM ANDAMENTO',
        subtype: 'Furto'
      });
      setSinistroItems([]);
    }
    setIsModalOpen(true);
  }

  const addSinistroItem = () => {
    setSinistroItems([...sinistroItems, { name: '', asset_number: '', unit_value: 0 }]);
  };

  const removeSinistroItem = (index: number) => {
    setSinistroItems(sinistroItems.filter((_, i) => i !== index));
  };

  const updateSinistroItem = (index: number, field: keyof PatrimonioItem, value: any) => {
    const newItems = [...sinistroItems];
    newItems[index] = { ...newItems[index], [field]: value };
    setSinistroItems(newItems);
  };

  return (
    <div className="space-y-8 pb-20">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="flex items-center gap-5">
          <div className="p-4 bg-indigo-600 rounded-[2rem] text-white shadow-2xl shadow-indigo-100"><Package size={32} /></div>
          <div>
            <h1 className="text-3xl font-black text-slate-900 tracking-tight uppercase leading-none">Processos de Patrimônio</h1>
            <p className="text-slate-500 font-medium mt-1 uppercase text-[10px] tracking-widest italic italic">Fluxos de Doação e Sinistros</p>
          </div>
        </div>
        <button onClick={() => openModal()} className="bg-indigo-600 hover:bg-indigo-700 text-white px-8 py-4 rounded-2xl font-black flex items-center gap-3 shadow-xl transition-all active:scale-95"><Plus size={20} /> ABRIR NOVO PROCESSO</button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <div className="lg:col-span-8 bg-white p-3 rounded-[2rem] border border-slate-100 shadow-sm flex items-center gap-3">
          <Search className="text-slate-400 ml-4" size={20} />
          <input type="text" placeholder="Nº SEI ou Unidade..." className="w-full py-2 bg-transparent border-none outline-none font-medium text-slate-700" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
        </div>
        <div className="lg:col-span-4 bg-white p-3 rounded-[2rem] border border-slate-100 shadow-sm flex items-center gap-3">
          <Filter className="text-slate-400 ml-4" size={18} />
          <select className="w-full bg-transparent border-none outline-none font-bold text-slate-700 text-xs uppercase" value={selectedTypeFilter || ''} onChange={(e) => setSelectedTypeFilter(e.target.value || null)}>
            <option value="">Todos os Tipos</option>
            {PROCESS_TYPES.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
          </select>
        </div>
      </div>

      {loading ? (
        <div className="py-40 flex justify-center"><Loader2 className="animate-spin text-indigo-600" size={48} /></div>
      ) : filteredProcesses.length === 0 ? (
        <div className="py-32 bg-white rounded-[3rem] border-2 border-dashed border-slate-100 text-center flex flex-col items-center">
           <ClipboardList size={48} className="text-slate-200 mb-4"/><p className="text-slate-400 font-black uppercase text-xs">Nenhum processo encontrado.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6">
          {filteredProcesses.map((p) => {
            const typeInfo = PROCESS_TYPES.find(t => t.id === p.type);
            const workflow = WORKFLOWS[p.type] || [];
            const stepIndex = workflow.indexOf(p.current_step) + 1;
            const progress = (stepIndex / workflow.length) * 100;

            return (
              <div key={p.id} className="bg-white p-8 rounded-[3rem] border border-slate-100 shadow-xl group hover:border-indigo-300 transition-all flex flex-col xl:flex-row items-center gap-8 relative overflow-hidden">
                 <div className={`absolute left-0 top-0 h-full w-2 ${p.status === 'CONCLUÍDO' ? 'bg-emerald-500' : 'bg-indigo-500'}`}></div>
                 <div className="flex items-center gap-6 flex-1 w-full min-w-0">
                    <div className={`w-20 h-20 rounded-3xl flex items-center justify-center shrink-0 shadow-lg ${typeInfo?.color || 'bg-slate-100'}`}>
                       {p.type === 'FURTOS' ? <ShieldAlert size={32}/> : p.type === 'BANDEIRAS' ? <Flag size={32}/> : <Gift size={32}/>}
                    </div>
                    <div className="flex-1 min-w-0">
                       <div className="flex flex-wrap items-center gap-2 mb-2">
                          <span className="bg-slate-900 text-white text-[9px] font-black px-3 py-1 rounded-full uppercase tracking-widest">{p.schools?.name}</span>
                          <span className={`text-[9px] font-black px-3 py-1 rounded-full uppercase tracking-widest ${typeInfo?.color}`}>{p.type === 'FURTOS' ? p.subtype : typeInfo?.label}</span>
                       </div>
                       <h3 className="text-2xl font-black text-slate-800 uppercase tracking-tight flex items-center gap-3">
                          SEI {p.sei_number}
                          <span className="text-slate-300 font-medium text-sm flex items-center gap-1.5"><Calendar size={14}/> {new Date(p.process_date + 'T12:00:00').toLocaleDateString()}</span>
                       </h3>
                       <div className="mt-6 space-y-2">
                          <div className="flex justify-between items-end">
                             <p className="text-[10px] font-black text-indigo-600 uppercase tracking-widest flex items-center gap-2"><History size={14}/> {p.current_step}</p>
                             <span className="text-[10px] font-black text-slate-400">{Math.round(progress)}%</span>
                          </div>
                          <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                             <div className={`h-full transition-all duration-1000 ${p.status === 'CONCLUÍDO' ? 'bg-emerald-50 shadow-[0_0_10px_rgba(16,185,129,0.5)]' : 'bg-indigo-50 shadow-[0_0_10px_rgba(99,102,241,0.5)]'}`} style={{ width: `${progress}%` }} />
                          </div>
                       </div>
                    </div>
                 </div>
                 <div className="flex items-center gap-4 shrink-0 border-t xl:border-t-0 xl:border-l border-slate-50 pt-6 xl:pt-0 xl:pl-8">
                    <div className="text-center xl:text-right">
                       <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Status</p>
                       <span className={`px-4 py-1.5 rounded-xl font-black text-[10px] uppercase tracking-widest shadow-inner ${p.status === 'CONCLUÍDO' ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : p.status === 'CORREÇÃO' ? 'bg-red-50 text-red-600 border-red-100' : 'bg-indigo-50 text-indigo-600 border-indigo-100'}`}>{p.status}</span>
                    </div>
                    <div className="flex gap-2">
                       <button onClick={() => openModal(p)} className="p-4 bg-slate-50 text-slate-400 hover:bg-indigo-600 hover:text-white rounded-2xl transition-all shadow-sm"><Edit size={20}/></button>
                       {isAdmin && <button onClick={() => handleDelete(p.id)} className="p-4 bg-slate-50 text-slate-400 hover:bg-red-600 hover:text-white rounded-2xl transition-all shadow-sm"><Trash2 size={20}/></button>}
                    </div>
                 </div>
              </div>
            );
          })}
        </div>
      )}

      {isModalOpen && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-900/90 backdrop-blur-md p-4 overflow-hidden">
          <div className="bg-white rounded-[3.5rem] w-full max-w-5xl max-h-[95vh] shadow-2xl animate-in zoom-in-95 duration-200 border border-white flex flex-col overflow-hidden">
            <div className="p-8 border-b border-slate-100 flex justify-between items-center bg-slate-50/50 shrink-0">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 bg-indigo-600 rounded-2xl flex items-center justify-center text-white shadow-xl shadow-indigo-100"><Package size={28}/></div>
                <div><h2 className="text-2xl font-black text-slate-800 uppercase tracking-tight leading-none">{editingProcess ? 'Atualizar Processo' : 'Novo Processo'}</h2><p className="text-[10px] text-indigo-600 font-bold uppercase tracking-widest mt-2">Detalhamento Patrimonial Regional</p></div>
              </div>
              <button onClick={() => setIsModalOpen(false)} className="p-3 hover:bg-white rounded-full transition-all text-slate-400"><X size={28}/></button>
            </div>

            <form onSubmit={handleSave} className="flex-1 flex flex-col overflow-hidden">
              <div className="p-10 space-y-10 overflow-y-auto custom-scrollbar">
                {formError && (
                  <div className="p-6 bg-red-50 border-2 border-red-100 rounded-[2rem] flex items-start gap-4 animate-in slide-in-from-top-2">
                    <AlertCircle className="text-red-600 shrink-0" size={24} />
                    <div>
                      <h4 className="text-sm font-black text-red-800 uppercase">Impossível Salvar</h4>
                      <p className="text-xs text-red-600 font-medium mt-1">{formError}</p>
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-slate-400 uppercase ml-1 flex items-center gap-2"><Building2 size={12}/> Escola</label>
                    <select required disabled={!isAdmin} className="w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl font-bold outline-none focus:border-indigo-500 disabled:opacity-50" value={formData.school_id} onChange={e => setFormData({...formData, school_id: e.target.value})}><option value="">Selecione...</option>{schools.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
                  </div>
                  <div className="space-y-1.5"><label className="text-[10px] font-black text-slate-400 uppercase ml-1 flex items-center gap-2"><ClipboardList size={12}/> Categoria</label><select required className="w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl font-bold outline-none focus:border-indigo-500" value={formData.type} onChange={e => setFormData({...formData, type: e.target.value})}>{PROCESS_TYPES.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}</select></div>
                  <div className="space-y-1.5"><label className="text-[10px] font-black text-slate-400 uppercase ml-1 flex items-center gap-2"><FileText size={12}/> Nº SEI</label><input required className="w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl font-mono font-bold text-indigo-600 focus:border-indigo-500 outline-none" placeholder="000.000..." value={formData.sei_number} onChange={e => setFormData({...formData, sei_number: e.target.value})} /></div>
                </div>

                {formData.type === 'FURTOS' && (
                  <div className="space-y-10 animate-in slide-in-from-top-4 duration-500">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 p-8 bg-red-50/50 border-2 border-red-100 rounded-[2.5rem]">
                       <div className="space-y-1.5"><label className="text-[10px] font-black text-red-400 uppercase ml-1">Tipo de Ocorrência</label><select className="w-full p-4 bg-white border-2 border-red-100 rounded-2xl font-bold outline-none" value={formData.subtype} onChange={e => setFormData({...formData, subtype: e.target.value})}><option value="Furto">Furto</option><option value="Roubo">Roubo</option><option value="Extravio">Extravio</option><option value="Incêndio">Incêndio</option><option value="Vandalismo">Vandalismo</option></select></div>
                       <div className="space-y-1.5"><label className="text-[10px] font-black text-red-400 uppercase ml-1">Data Ocorrência</label><input type="date" className="w-full p-4 bg-white border-2 border-red-100 rounded-2xl font-bold outline-none" value={formData.occurrence_date} onChange={e => setFormData({...formData, occurrence_date: e.target.value})} /></div>
                       <div className="space-y-1.5"><label className="text-[10px] font-black text-red-400 uppercase ml-1">Nº Boletim</label><input placeholder="B.O. 00000" className="w-full p-4 bg-white border-2 border-red-100 rounded-2xl font-bold outline-none" value={formData.bulletin_number} onChange={e => setFormData({...formData, bulletin_number: e.target.value})} /></div>
                       <div className="space-y-1.5"><label className="text-[10px] font-black text-red-400 uppercase ml-1">Autoria</label><select className="w-full p-4 bg-white border-2 border-red-100 rounded-2xl font-bold outline-none" value={formData.authorship} onChange={e => setFormData({...formData, authorship: e.target.value})}><option value="Não conhecida">Não conhecida</option><option value="Conhecida">Conhecida</option></select></div>
                    </div>

                    <div className="space-y-6">
                       <div className="flex items-center justify-between px-2">
                          <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest flex items-center gap-2"><ListPlus size={18} className="text-red-500"/> Relação de Itens Perdidos</h3>
                          <button type="button" onClick={addSinistroItem} className="bg-slate-900 text-white px-6 py-2.5 rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-black transition-all flex items-center gap-2 shadow-lg"><Plus size={14}/> Adicionar Item</button>
                       </div>
                       <div className="bg-white border-2 border-slate-100 rounded-[2.5rem] overflow-hidden">
                          <table className="w-full">
                             <thead className="bg-slate-50 border-b border-slate-100 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                                <tr><th className="p-4 text-left pl-8">Equipamento</th><th className="p-4 text-center">Nº Patrimônio</th><th className="p-4 text-center">Valor Unitário</th><th className="p-4 text-center">Ações</th></tr>
                             </thead>
                             <tbody className="divide-y divide-slate-50">
                                {sinistroItems.map((item, idx) => (
                                  <tr key={idx} className="group">
                                    <td className="p-3 pl-8"><input required placeholder="Nome do item..." className="w-full p-3 bg-slate-50 rounded-xl font-bold text-xs outline-none focus:bg-white focus:ring-2 focus:ring-red-500" value={item.name} onChange={e => updateSinistroItem(idx, 'name', e.target.value)} /></td>
                                    <td className="p-3"><input required placeholder="Nº Patr." className="w-full p-3 bg-slate-50 rounded-xl font-mono text-center font-bold text-xs outline-none focus:bg-white focus:ring-2 focus:ring-red-500" value={item.asset_number} onChange={e => updateSinistroItem(idx, 'asset_number', e.target.value)} /></td>
                                    <td className="p-3"><div className="relative"><DollarSign size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"/><input type="number" step="0.01" className="w-full p-3 pl-8 bg-slate-50 rounded-xl font-bold text-center text-xs outline-none focus:bg-white focus:ring-2 focus:ring-red-500" value={item.unit_value || ''} onChange={e => updateSinistroItem(idx, 'unit_value', Number(e.target.value))} /></div></td>
                                    <td className="p-3 text-center"><button type="button" onClick={() => removeSinistroItem(idx)} className="p-2 text-slate-300 hover:text-red-500 transition-colors"><Trash2 size={16}/></button></td>
                                  </tr>
                                ))}
                             </tbody>
                          </table>
                          <div className="p-6 bg-slate-900 text-white flex items-center justify-between">
                             <div className="flex items-center gap-3 text-white/50 font-black uppercase text-[10px]"><Calculator size={20}/> Cálculo do Prejuízo Total:</div>
                             <div className="text-2xl font-black text-red-400">R$ {totalSinistroValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div>
                          </div>
                       </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 p-8 bg-slate-50 rounded-[2.5rem]">
                       <div className="space-y-1.5"><label className="text-[10px] font-black text-slate-400 uppercase ml-1 flex items-center gap-2"><ArrowRight size={12}/> Conclusão do Processo</label><select className="w-full p-4 bg-white border-2 border-slate-100 rounded-2xl font-bold outline-none" value={formData.conclusion} onChange={e => setFormData({...formData, conclusion: e.target.value})}><option value="EM ANDAMENTO">EM ANDAMENTO</option><option value="ENCERRADO COMO CONCLUIDO PELA RESPONSÁBILIDADE">ENCERRADO PELA RESPONSABILIDADE</option><option value="ENCERRADO COMO CONCLUIDO PELA NÃO RESPONSÁBILIDADE">ENCERRADO PELA NÃO RESPONSABILIDADE</option><option value="NÃO INSTAURADO">NÃO INSTAURADO</option></select></div>
                       <div className="space-y-1.5"><label className="text-[10px] font-black text-slate-400 uppercase ml-1 flex items-center gap-2"><ShieldAlert size={12}/> NL de Baixa Efetuada?</label><select className="w-full p-4 bg-white border-2 border-slate-100 rounded-2xl font-bold outline-none" value={formData.is_nl_low ? 'Sim' : 'Não'} onChange={e => setFormData({...formData, is_nl_low: e.target.value === 'Sim'})}><option value="Não">Não (Pendente)</option><option value="Sim">Sim (Baixa no SAM)</option></select></div>
                    </div>
                  </div>
                )}

                <div className="space-y-6">
                   <div className="flex items-center gap-3"><div className="w-1 h-6 bg-indigo-600 rounded-full"></div><h3 className="text-sm font-black text-slate-800 uppercase tracking-tight">Evolução do Fluxo Regional</h3></div>
                   <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                      {WORKFLOWS[formData.type].map((step, idx) => {
                        const active = formData.current_step === step;
                        const past = WORKFLOWS[formData.type].indexOf(formData.current_step) > idx;
                        return (
                          <button key={step} type="button" onClick={() => setFormData({...formData, current_step: step})} className={`p-5 rounded-2xl border-2 text-left flex flex-col justify-between h-24 transition-all hover:-translate-y-1 ${active ? 'bg-indigo-600 border-indigo-600 text-white shadow-xl shadow-indigo-100 scale-[1.03]' : past ? 'bg-indigo-50 border-indigo-100 text-indigo-700' : 'bg-slate-50 border-slate-100 text-slate-400 opacity-60'}`}><div className="flex justify-between items-start"><span className="text-xl font-black opacity-30">{idx + 1}</span>{past && !active && <CheckCircle2 size={16} className="text-indigo-400"/>}</div><span className="text-[10px] font-black uppercase leading-tight">{step}</span></button>
                        );
                      })}
                   </div>
                </div>

                <div className="space-y-2"><label className="text-[10px] font-black text-slate-400 uppercase ml-1">Status Final</label><div className="grid grid-cols-3 gap-2">{['RECEBIDO', 'EM APURAÇÃO', 'CONCLUÍDO', 'CORREÇÃO'].map(s => (<button key={s} type="button" onClick={() => setFormData({...formData, status: s})} className={`p-4 rounded-xl text-[9px] font-black uppercase tracking-widest border-2 transition-all ${formData.status === s ? 'bg-slate-900 border-slate-900 text-white shadow-lg' : 'bg-white border-slate-100 text-slate-400'}`}>{s}</button>))}</div></div>
              </div>

              <div className="p-8 border-t border-slate-100 bg-white shrink-0 flex justify-end gap-4">
                 <button type="button" onClick={() => setIsModalOpen(false)} className="px-8 py-4 text-slate-400 font-black hover:text-slate-600 transition-all uppercase tracking-widest text-xs">Cancelar</button>
                 <button type="submit" disabled={saveLoading} className="px-16 py-4 bg-indigo-600 text-white rounded-[1.5rem] font-black shadow-xl shadow-indigo-100 hover:bg-indigo-700 flex items-center justify-center gap-3 transition-all active:scale-95">{saveLoading ? <Loader2 className="animate-spin" size={20}/> : <Save size={20}/>}{editingProcess ? 'ACTUALIZAR PROCESSO' : 'LANÇAR NO SISTEMA'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="bg-indigo-900 p-8 rounded-[3rem] text-white shadow-2xl relative overflow-hidden group">
         <Info className="absolute -right-4 -bottom-4 text-white/5 group-hover:scale-110 transition-transform" size={120} />
         <div className="flex items-start gap-5 relative z-10">
            <div className="p-3 bg-white/10 rounded-2xl"><Info size={24} className="text-indigo-400"/></div>
            <div>
               <h4 className="text-sm font-black uppercase tracking-tight mb-2">Instrução Técnica GSU</h4>
               <p className="text-[11px] text-white/60 leading-relaxed font-bold uppercase italic max-w-2xl">
                  Processos de doação dependem obrigatoriamente da publicação em DOE para que o registro no SAM e o número de patrimônio sejam gerados. 
                  Em caso de Furtos, assegure que o B.O. esteja anexado no SEI antes do encaminhamento para ASURE.
               </p>
            </div>
         </div>
      </div>
    </div>
  );
}

export default PatrimonioProcessos;
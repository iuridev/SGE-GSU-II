import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { 
  BookOpen, Plus, Search, FileText, ExternalLink, 
  Trash2, Edit, X, Save, Loader2, 
  HardHat, ClipboardCheck, Droplets, Zap, 
  ShieldCheck, Briefcase, Flame, ArrowUpCircle, 
  Accessibility, Package
} from 'lucide-react';

interface Manual {
  id: string;
  title: string;
  description: string;
  category: string;
  drive_link: string;
  created_at: string;
}

const CATEGORIES = [
  { id: 'Obras', icon: <HardHat size={16}/>, color: 'bg-orange-50 text-orange-600 border-orange-100' },
  { id: 'Fiscalização', icon: <ClipboardCheck size={16}/>, color: 'bg-blue-50 text-blue-600 border-blue-100' },
  { id: 'Consumo de Água', icon: <Droplets size={16}/>, color: 'bg-cyan-50 text-cyan-600 border-cyan-100' },
  { id: 'Energia Eletrica', icon: <Zap size={16}/>, color: 'bg-amber-50 text-amber-600 border-amber-100' },
  { id: 'Zeladoria', icon: <ShieldCheck size={16}/>, color: 'bg-emerald-50 text-emerald-600 border-emerald-100' },
  { id: 'Serviço tercerizado', icon: <Briefcase size={16}/>, color: 'bg-indigo-50 text-indigo-600 border-indigo-100' },
  { id: 'AVCB', icon: <Flame size={16}/>, color: 'bg-red-50 text-red-600 border-red-100' },
  { id: 'Elevador', icon: <ArrowUpCircle size={16}/>, color: 'bg-slate-50 text-slate-600 border-slate-100' },
  { id: 'Acessibilidade', icon: <Accessibility size={16}/>, color: 'bg-purple-50 text-purple-600 border-purple-100' },
  { id: 'Patrimônio', icon: <Package size={16}/>, color: 'bg-rose-50 text-rose-600 border-rose-100' },
];

export function Tutoriais() {
  const [manuals, setManuals] = useState<Manual[]>([]);
  const [loading, setLoading] = useState(true);
  const [userRole, setUserRole] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [saveLoading, setSaveLoading] = useState(false);
  const [editingManual, setEditingManual] = useState<Manual | null>(null);
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    category: 'Obras',
    drive_link: ''
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

      const { data } = await (supabase as any).from('manuals').select('*').order('title');
      setManuals(data || []);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  }

  const filteredManuals = useMemo(() => {
    return manuals.filter(m => {
      const matchesSearch = m.title.toLowerCase().includes(searchTerm.toLowerCase()) || 
                           m.description.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesCategory = selectedCategory ? m.category === selectedCategory : true;
      return matchesSearch && matchesCategory;
    });
  }, [manuals, searchTerm, selectedCategory]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (userRole !== 'regional_admin') return;
    setSaveLoading(true);
    try {
      if (editingManual) {
        const { error } = await (supabase as any).from('manuals').update(formData).eq('id', editingManual.id);
        if (error) throw error;
      } else {
        const { error } = await (supabase as any).from('manuals').insert([formData]);
        if (error) throw error;
      }
      setIsModalOpen(false);
      fetchInitialData();
    } catch (error: any) {
      alert("Erro ao salvar: " + error.message);
    } finally {
      setSaveLoading(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Remover este manual permanentemente?")) return;
    try {
      const { error } = await (supabase as any).from('manuals').delete().eq('id', id);
      if (error) throw error;
      fetchInitialData();
    } catch (error: any) {
      alert("Erro ao excluir: " + error.message);
    }
  }

  function openModal(manual: Manual | null = null) {
    if (manual) {
      setEditingManual(manual);
      setFormData({
        title: manual.title,
        description: manual.description,
        category: manual.category,
        drive_link: manual.drive_link
      });
    } else {
      setEditingManual(null);
      setFormData({
        title: '',
        description: '',
        category: 'Obras',
        drive_link: ''
      });
    }
    setIsModalOpen(true);
  }

  return (
    <div className="space-y-8 pb-20">
      {/* Cabeçalho */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="p-4 bg-indigo-600 rounded-3xl text-white shadow-xl shadow-indigo-100">
            <BookOpen size={32} />
          </div>
          <div>
            <h1 className="text-3xl font-black text-slate-900 tracking-tight uppercase leading-none">Manuais e Procedimentos</h1>
            <p className="text-slate-500 font-medium mt-1">Biblioteca técnica para suporte administrativo das unidades.</p>
          </div>
        </div>
        
        {userRole === 'regional_admin' && (
          <button 
            onClick={() => openModal()}
            className="bg-indigo-600 hover:bg-indigo-700 text-white px-8 py-4 rounded-2xl font-black flex items-center gap-3 shadow-xl transition-all active:scale-95"
          >
            <Plus size={20} /> CADASTRAR MANUAL
          </button>
        )}
      </div>

      {/* Busca e Filtros */}
      <div className="space-y-4">
        <div className="bg-white p-4 rounded-[2rem] border border-slate-100 shadow-sm flex items-center gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
            <input 
              type="text" 
              placeholder="Pesquisar por título ou palavra-chave..." 
              className="w-full pl-12 pr-4 py-3 bg-slate-50 border-none rounded-2xl focus:ring-2 focus:ring-indigo-500 font-medium outline-none"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>

        {/* Chips de Categoria */}
        <div className="flex flex-wrap gap-2">
           <button 
            onClick={() => setSelectedCategory(null)}
            className={`px-6 py-2.5 rounded-full text-xs font-black uppercase tracking-widest transition-all border-2 ${!selectedCategory ? 'bg-slate-900 border-slate-900 text-white shadow-lg' : 'bg-white border-slate-100 text-slate-400 hover:border-indigo-200'}`}
           >
             TODOS
           </button>
           {CATEGORIES.map(cat => (
             <button 
              key={cat.id}
              onClick={() => setSelectedCategory(cat.id)}
              className={`px-6 py-2.5 rounded-full text-xs font-black uppercase tracking-widest transition-all border-2 flex items-center gap-2 ${selectedCategory === cat.id ? 'bg-indigo-600 border-indigo-600 text-white shadow-lg' : 'bg-white border-slate-100 text-slate-400 hover:border-indigo-200'}`}
             >
               {cat.icon}
               {cat.id}
             </button>
           ))}
        </div>
      </div>

      {/* Grid de Manuais */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 gap-4">
          <Loader2 className="animate-spin text-indigo-600" size={40} />
          <p className="font-black text-slate-400 uppercase tracking-widest text-xs">Organizando Biblioteca...</p>
        </div>
      ) : filteredManuals.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
           <div className="w-20 h-20 bg-slate-100 rounded-full flex items-center justify-center text-slate-300 mb-4"><FileText size={40}/></div>
           <h3 className="text-xl font-black text-slate-400 uppercase tracking-tight">Nenhum manual encontrado</h3>
           <p className="text-slate-400 text-sm mt-1">Tente ajustar seus filtros ou termos de pesquisa.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredManuals.map((manual) => {
            const catInfo = CATEGORIES.find(c => c.id === manual.category);
            return (
              <div key={manual.id} className="bg-white rounded-[2.5rem] border border-slate-100 shadow-xl overflow-hidden group flex flex-col hover:border-indigo-300 transition-all hover:-translate-y-1">
                <div className="p-8 flex-1 flex flex-col">
                  <div className="flex justify-between items-start mb-6">
                    <div className={`p-3 rounded-2xl shadow-sm border ${catInfo?.color}`}>
                      {catInfo?.icon}
                    </div>
                    <div className="flex gap-1">
                       {userRole === 'regional_admin' && (
                         <>
                            <button onClick={() => openModal(manual)} className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl transition-all"><Edit size={16}/></button>
                            <button onClick={() => handleDelete(manual.id)} className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-all"><Trash2 size={16}/></button>
                         </>
                       )}
                    </div>
                  </div>

                  <div className="flex-1">
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">{manual.category}</span>
                    <h3 className="text-xl font-black text-slate-800 leading-tight mt-1 group-hover:text-indigo-600 transition-colors uppercase">{manual.title}</h3>
                    <p className="text-sm text-slate-500 font-medium mt-4 line-clamp-3 leading-relaxed">
                      {manual.description}
                    </p>
                  </div>

                  <div className="mt-8 pt-6 border-t border-slate-50">
                    <a 
                      href={manual.drive_link} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="w-full py-4 bg-slate-900 hover:bg-black text-white rounded-2xl font-black text-xs uppercase flex items-center justify-center gap-3 shadow-lg transition-all active:scale-95 group/btn"
                    >
                      <FileText size={18} className="group-hover/btn:scale-110 transition-transform" />
                      ACESSAR DOCUMENTO
                      <ExternalLink size={14} className="opacity-50" />
                    </a>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal de Cadastro/Edição */}
      {isModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/80 backdrop-blur-sm p-4">
          <div className="bg-white rounded-[3rem] w-full max-w-2xl shadow-2xl overflow-hidden border border-white animate-in zoom-in-95 duration-200">
            <div className="p-8 border-b border-slate-100 flex justify-between items-center bg-indigo-50/50">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-indigo-600 rounded-2xl flex items-center justify-center text-white shadow-lg"><BookOpen size={24} /></div>
                <div>
                  <h2 className="text-xl font-black uppercase tracking-tight leading-none">{editingManual ? 'Editar Manual' : 'Novo Manual'}</h2>
                  <p className="text-xs text-indigo-600 font-bold uppercase tracking-widest mt-1">Gestão da Base de Conhecimento</p>
                </div>
              </div>
              <button onClick={() => setIsModalOpen(false)} className="p-2 hover:bg-white rounded-full transition-colors text-slate-400"><X size={24} /></button>
            </div>

            <form onSubmit={handleSave} className="p-8 space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="md:col-span-2 space-y-2">
                  <label className="text-[10px] font-black text-slate-500 uppercase ml-1">Título do Manual / Tutorial</label>
                  <input 
                    required 
                    className="w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl font-bold text-slate-800 focus:border-indigo-500 outline-none transition-all" 
                    placeholder="Ex: Procedimentos para Dispensa de Zeladoria"
                    value={formData.title}
                    onChange={e => setFormData({...formData, title: e.target.value})}
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-500 uppercase ml-1">Categoria</label>
                  <select 
                    className="w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl font-bold text-slate-800 focus:border-indigo-500 outline-none transition-all cursor-pointer"
                    value={formData.category}
                    onChange={e => setFormData({...formData, category: e.target.value})}
                  >
                    {CATEGORIES.map(cat => <option key={cat.id} value={cat.id}>{cat.id}</option>)}
                  </select>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-500 uppercase ml-1">Link do Google Drive</label>
                  <input 
                    required 
                    type="url"
                    className="w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl font-mono text-xs font-bold text-indigo-600 focus:border-indigo-500 outline-none transition-all" 
                    placeholder="https://drive.google.com/..."
                    value={formData.drive_link}
                    onChange={e => setFormData({...formData, drive_link: e.target.value})}
                  />
                </div>

                <div className="md:col-span-2 space-y-2">
                  <label className="text-[10px] font-black text-slate-500 uppercase ml-1">Resumo / Descrição curta</label>
                  <textarea 
                    required 
                    className="w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl font-bold text-slate-800 focus:border-indigo-500 outline-none transition-all min-h-[100px]" 
                    placeholder="Explique brevemente o que o usuário encontrará neste documento..."
                    value={formData.description}
                    onChange={e => setFormData({...formData, description: e.target.value})}
                  />
                </div>
              </div>

              <div className="pt-6 flex justify-end gap-3">
                <button type="button" onClick={() => setIsModalOpen(false)} className="px-8 py-4 text-slate-400 font-black hover:text-slate-600 transition-all uppercase tracking-widest text-xs">Descartar</button>
                <button 
                  type="submit" 
                  disabled={saveLoading}
                  className="px-12 py-4 bg-indigo-600 text-white rounded-2xl font-black shadow-xl shadow-indigo-100 hover:bg-indigo-700 flex items-center gap-3 active:scale-95 transition-all disabled:opacity-50"
                >
                  {saveLoading ? <Loader2 className="animate-spin" size={20}/> : <Save size={20} />}
                  {editingManual ? 'SALVAR ALTERAÇÕES' : 'PUBLICAR NA REDE'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default Tutoriais;
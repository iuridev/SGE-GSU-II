import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { resolveViewRole } from '../lib/roles';
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
  { id: 'Obras', icon: <HardHat size={15}/>, color: 'bg-orange-50 text-orange-600 border-orange-200', accent: 'bg-orange-500' },
  { id: 'Fiscalização', icon: <ClipboardCheck size={15}/>, color: 'bg-blue-50 text-blue-600 border-blue-200', accent: 'bg-blue-500' },
  { id: 'Consumo de Água', icon: <Droplets size={15}/>, color: 'bg-cyan-50 text-cyan-600 border-cyan-200', accent: 'bg-cyan-500' },
  { id: 'Energia Eletrica', icon: <Zap size={15}/>, color: 'bg-amber-50 text-amber-600 border-amber-200', accent: 'bg-amber-500' },
  { id: 'Zeladoria', icon: <ShieldCheck size={15}/>, color: 'bg-emerald-50 text-emerald-600 border-emerald-200', accent: 'bg-emerald-500' },
  { id: 'Serviço tercerizado', icon: <Briefcase size={15}/>, color: 'bg-indigo-50 text-indigo-600 border-indigo-200', accent: 'bg-indigo-500' },
  { id: 'AVCB', icon: <Flame size={15}/>, color: 'bg-red-50 text-red-600 border-red-200', accent: 'bg-red-500' },
  { id: 'Elevador', icon: <ArrowUpCircle size={15}/>, color: 'bg-slate-50 text-slate-600 border-slate-200', accent: 'bg-slate-500' },
  { id: 'Acessibilidade', icon: <Accessibility size={15}/>, color: 'bg-purple-50 text-purple-600 border-purple-200', accent: 'bg-purple-500' },
  { id: 'Patrimônio', icon: <Package size={15}/>, color: 'bg-rose-50 text-rose-600 border-rose-200', accent: 'bg-rose-500' },
];

interface ManualCardProps {
  manual: Manual;
  userRole: string;
  onEdit: (manual: Manual) => void;
  onDelete: (id: string) => void;
}

function ManualCard({ manual, userRole, onEdit, onDelete }: ManualCardProps) {
  const catInfo = CATEGORIES.find(c => c.id === manual.category);
  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden group flex flex-col hover:shadow-md hover:border-indigo-200 transition-all hover:-translate-y-0.5 duration-200">
      <div className={`h-1 ${catInfo?.accent || 'bg-slate-300'}`} />
      <div className="p-5 flex-1 flex flex-col">
        <div className="flex items-start justify-between mb-4">
          <div className={`flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider px-2.5 py-1 rounded-full border ${catInfo?.color || ''}`}>
            {catInfo?.icon}
            <span>{manual.category}</span>
          </div>
          {userRole === 'regional_admin' && (
            <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              <button onClick={() => onEdit(manual)} className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all">
                <Edit size={14}/>
              </button>
              <button onClick={() => onDelete(manual.id)} className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all">
                <Trash2 size={14}/>
              </button>
            </div>
          )}
        </div>

        <div className="flex-1">
          <h3 className="text-[15px] font-black text-slate-800 leading-snug group-hover:text-indigo-700 transition-colors uppercase tracking-tight line-clamp-2">
            {manual.title}
          </h3>
          <p className="text-sm text-slate-500 mt-2.5 line-clamp-2 leading-relaxed">
            {manual.description}
          </p>
        </div>

        <a
          href={manual.drive_link}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-4 w-full py-2.5 bg-slate-900 hover:bg-indigo-600 text-white rounded-xl font-black text-xs uppercase flex items-center justify-center gap-2 transition-all active:scale-95"
        >
          <FileText size={13} />
          Acessar Documento
          <ExternalLink size={11} className="opacity-50" />
        </a>
      </div>
    </div>
  );
}

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
        setUserRole(resolveViewRole(profile?.role || ''));
      }
      const { data } = await (supabase as any).from('manuals').select('*').order('title');
      setManuals(data || []);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  }

  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    manuals.forEach(m => { counts[m.category] = (counts[m.category] || 0) + 1; });
    return counts;
  }, [manuals]);

  const filteredManuals = useMemo(() => {
    return manuals.filter(m => {
      const matchesSearch = m.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
                           m.description.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesCategory = selectedCategory ? m.category === selectedCategory : true;
      return matchesSearch && matchesCategory;
    });
  }, [manuals, searchTerm, selectedCategory]);

  const isFiltered = !!selectedCategory || !!searchTerm;

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
      setFormData({ title: manual.title, description: manual.description, category: manual.category, drive_link: manual.drive_link });
    } else {
      setEditingManual(null);
      setFormData({ title: '', description: '', category: 'Obras', drive_link: '' });
    }
    setIsModalOpen(true);
  }

  return (
    <div className="space-y-6 pb-20">
      {/* Cabeçalho */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="p-3.5 bg-indigo-600 rounded-2xl text-white shadow-lg shadow-indigo-100">
            <BookOpen size={26} />
          </div>
          <div>
            <h1 className="text-2xl font-black text-slate-900 tracking-tight uppercase leading-none">Manuais e Procedimentos</h1>
            <p className="text-slate-500 text-sm mt-1">
              Biblioteca técnica · <span className="text-indigo-600 font-black">{manuals.length} documentos</span>
            </p>
          </div>
        </div>
        {userRole === 'regional_admin' && (
          <button
            onClick={() => openModal()}
            className="bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-3 rounded-xl font-black flex items-center gap-2 shadow-lg shadow-indigo-100 transition-all active:scale-95 text-sm"
          >
            <Plus size={16} /> CADASTRAR MANUAL
          </button>
        )}
      </div>

      {/* Busca e Filtros */}
      <div className="space-y-3">
        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
          <input
            type="text"
            placeholder="Pesquisar por título ou palavra-chave..."
            className="w-full pl-11 pr-10 py-3 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent font-medium outline-none shadow-sm text-sm"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
          {searchTerm && (
            <button
              onClick={() => setSearchTerm('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-all"
            >
              <X size={14} />
            </button>
          )}
        </div>

        {/* Chips de categoria - scroll horizontal */}
        <div className="flex gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
          <button
            onClick={() => setSelectedCategory(null)}
            className={`flex-shrink-0 px-4 py-1.5 rounded-full text-xs font-black uppercase tracking-wider transition-all border ${!selectedCategory ? 'bg-slate-900 border-slate-900 text-white' : 'bg-white border-slate-200 text-slate-500 hover:border-slate-300'}`}
          >
            Todos · {manuals.length}
          </button>
          {CATEGORIES.filter(cat => categoryCounts[cat.id]).map(cat => (
            <button
              key={cat.id}
              onClick={() => setSelectedCategory(cat.id)}
              className={`flex-shrink-0 px-4 py-1.5 rounded-full text-xs font-black uppercase tracking-wider transition-all border flex items-center gap-1.5 ${selectedCategory === cat.id ? 'bg-indigo-600 border-indigo-600 text-white' : 'bg-white border-slate-200 text-slate-500 hover:border-indigo-200'}`}
            >
              {cat.icon}
              {cat.id} · {categoryCounts[cat.id]}
            </button>
          ))}
        </div>
      </div>

      {/* Conteúdo */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-24 gap-4">
          <Loader2 className="animate-spin text-indigo-600" size={36} />
          <p className="font-black text-slate-400 uppercase tracking-widest text-xs">Organizando Biblioteca...</p>
        </div>
      ) : filteredManuals.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center text-slate-300 mb-4">
            <FileText size={32}/>
          </div>
          <h3 className="text-lg font-black text-slate-400 uppercase tracking-tight">Nenhum manual encontrado</h3>
          <p className="text-slate-400 text-sm mt-1">Tente ajustar seus filtros ou termos de pesquisa.</p>
        </div>
      ) : isFiltered ? (
        /* Vista plana quando filtrando */
        <div>
          <p className="text-xs font-black text-slate-400 uppercase tracking-widest mb-4">
            {filteredManuals.length} resultado{filteredManuals.length !== 1 ? 's' : ''}
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredManuals.map(manual => (
              <ManualCard key={manual.id} manual={manual} userRole={userRole} onEdit={openModal} onDelete={handleDelete} />
            ))}
          </div>
        </div>
      ) : (
        /* Vista agrupada por categoria */
        <div className="space-y-8">
          {CATEGORIES.map(cat => {
            const items = manuals.filter(m => m.category === cat.id);
            if (items.length === 0) return null;
            return (
              <div key={cat.id}>
                <button
                  className="flex items-center gap-3 mb-4 w-full text-left group/header"
                  onClick={() => setSelectedCategory(cat.id)}
                >
                  <div className={`p-2 rounded-xl border ${cat.color}`}>{cat.icon}</div>
                  <span className="text-sm font-black text-slate-700 uppercase tracking-widest group-hover/header:text-indigo-600 transition-colors">
                    {cat.id}
                  </span>
                  <div className="flex-1 h-px bg-slate-100" />
                  <span className="text-xs font-black text-slate-400 bg-slate-100 px-2.5 py-1 rounded-full">
                    {items.length}
                  </span>
                </button>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {items.map(manual => (
                    <ManualCard key={manual.id} manual={manual} userRole={userRole} onEdit={openModal} onDelete={handleDelete} />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal de Cadastro/Edição */}
      {isModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/80 backdrop-blur-sm p-4">
          <div className="bg-white rounded-3xl w-full max-w-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-indigo-50/50">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center text-white">
                  <BookOpen size={20} />
                </div>
                <div>
                  <h2 className="text-lg font-black uppercase tracking-tight leading-none">
                    {editingManual ? 'Editar Manual' : 'Novo Manual'}
                  </h2>
                  <p className="text-xs text-indigo-600 font-bold uppercase tracking-widest mt-0.5">
                    Gestão da Base de Conhecimento
                  </p>
                </div>
              </div>
              <button onClick={() => setIsModalOpen(false)} className="p-2 hover:bg-white rounded-full transition-colors text-slate-400">
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSave} className="p-6 space-y-5">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div className="md:col-span-2 space-y-1.5">
                  <label className="text-[10px] font-black text-slate-500 uppercase ml-1">Título do Manual</label>
                  <input
                    required
                    className="w-full p-3.5 bg-slate-50 border-2 border-slate-100 rounded-xl font-bold text-slate-800 focus:border-indigo-500 outline-none transition-all"
                    placeholder="Ex: Procedimentos para Dispensa de Zeladoria"
                    value={formData.title}
                    onChange={e => setFormData({...formData, title: e.target.value})}
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-slate-500 uppercase ml-1">Categoria</label>
                  <select
                    className="w-full p-3.5 bg-slate-50 border-2 border-slate-100 rounded-xl font-bold text-slate-800 focus:border-indigo-500 outline-none transition-all cursor-pointer"
                    value={formData.category}
                    onChange={e => setFormData({...formData, category: e.target.value})}
                  >
                    {CATEGORIES.map(cat => <option key={cat.id} value={cat.id}>{cat.id}</option>)}
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-slate-500 uppercase ml-1">Link do Google Drive</label>
                  <input
                    required
                    type="url"
                    className="w-full p-3.5 bg-slate-50 border-2 border-slate-100 rounded-xl font-mono text-xs font-bold text-indigo-600 focus:border-indigo-500 outline-none transition-all"
                    placeholder="https://drive.google.com/..."
                    value={formData.drive_link}
                    onChange={e => setFormData({...formData, drive_link: e.target.value})}
                  />
                </div>

                <div className="md:col-span-2 space-y-1.5">
                  <label className="text-[10px] font-black text-slate-500 uppercase ml-1">Descrição</label>
                  <textarea
                    required
                    className="w-full p-3.5 bg-slate-50 border-2 border-slate-100 rounded-xl font-bold text-slate-800 focus:border-indigo-500 outline-none transition-all min-h-[90px]"
                    placeholder="Explique brevemente o que o usuário encontrará neste documento..."
                    value={formData.description}
                    onChange={e => setFormData({...formData, description: e.target.value})}
                  />
                </div>
              </div>

              <div className="pt-2 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-6 py-3 text-slate-400 font-black hover:text-slate-600 transition-all uppercase tracking-widest text-xs"
                >
                  Descartar
                </button>
                <button
                  type="submit"
                  disabled={saveLoading}
                  className="px-8 py-3 bg-indigo-600 text-white rounded-xl font-black shadow-lg shadow-indigo-100 hover:bg-indigo-700 flex items-center gap-2 active:scale-95 transition-all disabled:opacity-50 text-sm"
                >
                  {saveLoading ? <Loader2 className="animate-spin" size={16}/> : <Save size={16} />}
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

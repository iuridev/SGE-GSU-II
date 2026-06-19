import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import {
  Megaphone, Plus, X, Edit3, Eye, EyeOff, Loader2,
  AlertTriangle, Info, CalendarDays, Bell, ChevronDown,
  ChevronUp, Search, CheckCircle2, Clock, User,
  Save, RefreshCw, ImageIcon
} from 'lucide-react';
import toast from 'react-hot-toast';

interface Comunicado {
  id: string;
  titulo: string;
  conteudo: string;
  tipo: 'URGENTE' | 'INFORMATIVO' | 'EVENTO' | 'AVISO';
  autor: string;
  dataCriacao: string;
  dataExpiracao: string;
  ativo: boolean;
  prioridade: 'ALTA' | 'MEDIA' | 'BAIXA';
  imagemUrl?: string;
}

type TipoComunicado = 'URGENTE' | 'INFORMATIVO' | 'EVENTO' | 'AVISO';
type PrioridadeComunicado = 'ALTA' | 'MEDIA' | 'BAIXA';
type FiltroAba = 'todos' | 'ativos' | 'inativos' | 'urgentes' | 'eventos';

const TIPO_STYLES: Record<TipoComunicado, { bar: string; bg: string; text: string; border: string; gradient: string; label: string; icon: React.ReactNode }> = {
  URGENTE:     { bar: 'bg-red-500',    bg: 'bg-red-50',    text: 'text-red-600',    border: 'border-red-200',   gradient: 'from-red-50 to-white',    label: 'Urgente',     icon: <AlertTriangle size={13} /> },
  INFORMATIVO: { bar: 'bg-blue-500',   bg: 'bg-blue-50',   text: 'text-blue-600',   border: 'border-blue-200',  gradient: 'from-blue-50 to-white',   label: 'Informativo', icon: <Info size={13} /> },
  EVENTO:      { bar: 'bg-purple-500', bg: 'bg-purple-50', text: 'text-purple-600', border: 'border-purple-200', gradient: 'from-purple-50 to-white', label: 'Evento',      icon: <CalendarDays size={13} /> },
  AVISO:       { bar: 'bg-amber-500',  bg: 'bg-amber-50',  text: 'text-amber-600',  border: 'border-amber-200', gradient: 'from-amber-50 to-white',  label: 'Aviso',       icon: <Bell size={13} /> },
};

const PRIORIDADE_STYLES: Record<PrioridadeComunicado, { dot: string; label: string }> = {
  ALTA:  { dot: 'bg-red-500',   label: 'Alta' },
  MEDIA: { dot: 'bg-amber-400', label: 'Média' },
  BAIXA: { dot: 'bg-slate-300', label: 'Baixa' },
};

function formatRelativeTime(isoDate: string): string {
  if (!isoDate) return '';
  try {
    const date = new Date(isoDate);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 1) return 'agora mesmo';
    if (diffMin < 60) return `há ${diffMin}min`;
    const diffH = Math.floor(diffMin / 60);
    if (diffH < 24) return `há ${diffH}h`;
    const diffD = Math.floor(diffH / 24);
    if (diffD === 1) return 'ontem';
    if (diffD < 7) return `há ${diffD} dias`;
    return date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
  } catch {
    return '';
  }
}

function isExpired(dataExpiracao: string): boolean {
  if (!dataExpiracao) return false;
  try {
    const datePart = dataExpiracao.split('T')[0];
    const today = new Date().toISOString().split('T')[0];
    return datePart < today;
  } catch {
    return false;
  }
}

function formatExpirationDate(dataExpiracao: string): string {
  try {
    const datePart = dataExpiracao.split('T')[0];
    const [year, month, day] = datePart.split('-');
    return `${day}/${month}/${year}`;
  } catch {
    return dataExpiracao;
  }
}

function isNew(dataCriacao: string): boolean {
  if (!dataCriacao) return false;
  try {
    const diffH = (new Date().getTime() - new Date(dataCriacao).getTime()) / 3600000;
    return diffH < 24;
  } catch {
    return false;
  }
}

const emptyForm = {
  titulo: '',
  conteudo: '',
  tipo: 'INFORMATIVO' as TipoComunicado,
  dataExpiracao: '',
  prioridade: 'MEDIA' as PrioridadeComunicado,
  imagemUrl: '',
};

export default function Comunicados() {
  const [comunicados, setComunicados] = useState<Comunicado[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toggling, setToggling] = useState<string | null>(null);
  const [userName, setUserName] = useState('');
  const [filtroAba, setFiltroAba] = useState<FiltroAba>('todos');
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editando, setEditando] = useState<Comunicado | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);

  useEffect(() => {
    loadUserAndData();
  }, []);

  async function loadUserAndData() {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data: profile } = await (supabase as any)
        .from('profiles').select('full_name').eq('id', user.id).single();
      setUserName(profile?.full_name || user.email?.split('@')[0] || 'Admin');
    }
    await fetchComunicados();
  }

  async function fetchComunicados() {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('ler-comunicados');
      if (error || data?.erroReal) throw new Error(data?.erroReal || 'Erro ao carregar comunicados');
      setComunicados(data.comunicados || []);
    } catch (err: any) {
      toast.error(err.message || 'Erro ao carregar comunicados');
    } finally {
      setLoading(false);
    }
  }

  async function uploadImagem(file: File): Promise<string> {
    if (file.size > 4 * 1024 * 1024) throw new Error('Imagem muito grande. Use até 4 MB.');
    const ext = file.name.split('.').pop();
    const fileName = `images/${Date.now()}-${Math.random().toString(36).substring(2)}.${ext}`;
    const { error } = await supabase.storage
      .from('comunicados')
      .upload(fileName, file, { contentType: file.type, upsert: true });
    if (error) throw new Error('Erro ao fazer upload: ' + error.message);
    const { data: { publicUrl } } = supabase.storage.from('comunicados').getPublicUrl(fileName);
    return publicUrl;
  }

  async function deletarImagem(imagemUrl: string) {
    const path = imagemUrl.split('/object/public/comunicados/')[1];
    if (!path) return;
    await supabase.storage.from('comunicados').remove([path]);
  }

  async function handleSalvar() {
    if (!form.titulo.trim() || !form.conteudo.trim()) {
      toast.error('Preencha título e conteúdo.');
      return;
    }
    setSaving(true);
    try {
      let imagemUrl = form.imagemUrl;

      if (editando?.imagemUrl) {
        const substituindo = imageFile !== null;
        const removendo = !imageFile && !form.imagemUrl;
        if (substituindo || removendo) await deletarImagem(editando.imagemUrl);
      }

      if (imageFile) {
        imagemUrl = await uploadImagem(imageFile);
      }

      if (editando) {
        const { data, error } = await supabase.functions.invoke('atualizar-comunicado', {
          body: { id: editando.id, ...form, imagemUrl },
        });
        if (error || data?.erroReal) throw new Error(data?.erroReal || 'Erro ao atualizar');
        toast.success('Comunicado atualizado!');
      } else {
        const { data, error } = await supabase.functions.invoke('salvar-comunicado', {
          body: { ...form, imagemUrl, autor: userName },
        });
        if (error || data?.erroReal) throw new Error(data?.erroReal || 'Erro ao salvar');
        toast.success('Comunicado publicado!');
      }
      fecharModal();
      await fetchComunicados();
    } catch (err: any) {
      toast.error(err.message || 'Erro ao salvar comunicado');
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleAtivo(c: Comunicado) {
    setToggling(c.id);
    try {
      const desativando = c.ativo;
      const body: Record<string, unknown> = { id: c.id, ativo: !c.ativo };

      if (desativando && c.imagemUrl) {
        await deletarImagem(c.imagemUrl);
        body.imagemUrl = '';
      }

      const { data, error } = await supabase.functions.invoke('atualizar-comunicado', { body });
      if (error || data?.erroReal) throw new Error(data?.erroReal || 'Erro ao atualizar');
      toast.success(desativando ? 'Comunicado desativado' : 'Comunicado ativado');
      await fetchComunicados();
    } catch (err: any) {
      toast.error(err.message || 'Erro ao atualizar');
    } finally {
      setToggling(null);
    }
  }

  function abrirParaEditar(c: Comunicado) {
    setEditando(c);
    setForm({
      titulo: c.titulo,
      conteudo: c.conteudo,
      tipo: c.tipo,
      dataExpiracao: c.dataExpiracao ? c.dataExpiracao.split('T')[0] : '',
      prioridade: c.prioridade,
      imagemUrl: c.imagemUrl || '',
    });
    setImageFile(null);
    setImagePreview(c.imagemUrl || null);
    setIsModalOpen(true);
  }

  function fecharModal() {
    setIsModalOpen(false);
    setEditando(null);
    setForm(emptyForm);
    setImageFile(null);
    setImagePreview(null);
  }

  function toggleExpand(id: string) {
    setExpandedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  const filtrados = comunicados.filter(c => {
    const matchSearch = !searchTerm ||
      c.titulo.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.conteudo.toLowerCase().includes(searchTerm.toLowerCase());
    if (!matchSearch) return false;
    if (filtroAba === 'ativos') return c.ativo;
    if (filtroAba === 'inativos') return !c.ativo;
    if (filtroAba === 'urgentes') return c.tipo === 'URGENTE';
    if (filtroAba === 'eventos') return c.tipo === 'EVENTO';
    return true;
  });

  const totalAtivos = comunicados.filter(c => c.ativo).length;
  const totalInativos = comunicados.filter(c => !c.ativo).length;
  const totalUrgentes = comunicados.filter(c => c.tipo === 'URGENTE' && c.ativo).length;

  const ABAS: { id: FiltroAba; label: string; count?: number }[] = [
    { id: 'todos', label: 'Todos', count: comunicados.length },
    { id: 'ativos', label: 'Ativos', count: totalAtivos },
    { id: 'inativos', label: 'Inativos', count: totalInativos },
    { id: 'urgentes', label: 'Urgentes', count: totalUrgentes },
    { id: 'eventos', label: 'Eventos' },
  ];

  return (
    <div className="space-y-6 pb-10 max-w-7xl mx-auto">

      {/* ── CABEÇALHO ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-gradient-to-br from-amber-400 to-orange-500 rounded-2xl flex items-center justify-center shadow-lg shadow-amber-500/30">
            <Megaphone size={24} className="text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-extrabold text-slate-800 tracking-tight">Comunicados</h1>
            <p className="text-sm text-slate-500 font-medium mt-0.5">Gerencie os comunicados da URE para as unidades escolares</p>
          </div>
        </div>
        <button
          onClick={() => { setEditando(null); setForm(emptyForm); setIsModalOpen(true); }}
          className="flex items-center gap-2 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white font-bold px-5 py-3 rounded-2xl shadow-lg shadow-amber-500/25 transition-all hover:scale-[1.02] active:scale-[0.98] text-sm"
        >
          <Plus size={18} />
          Novo Comunicado
        </button>
      </div>

      {/* ── STATS ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Total', value: comunicados.length, color: 'bg-slate-100 text-slate-700', icon: <Megaphone size={16} /> },
          { label: 'Ativos', value: totalAtivos, color: 'bg-emerald-50 text-emerald-700', icon: <CheckCircle2 size={16} /> },
          { label: 'Inativos', value: totalInativos, color: 'bg-slate-100 text-slate-500', icon: <EyeOff size={16} /> },
          { label: 'Urgentes ativos', value: totalUrgentes, color: 'bg-red-50 text-red-700', icon: <AlertTriangle size={16} /> },
        ].map(s => (
          <div key={s.label} className={`${s.color} p-4 rounded-2xl flex items-center gap-3`}>
            <div className="opacity-70">{s.icon}</div>
            <div>
              <p className="text-xl font-extrabold leading-none">{s.value}</p>
              <p className="text-[11px] font-semibold uppercase tracking-wider mt-0.5 opacity-70">{s.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* ── FILTROS ── */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-2xl p-1 overflow-x-auto">
          {ABAS.map(aba => (
            <button
              key={aba.id}
              onClick={() => setFiltroAba(aba.id)}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-bold transition-all whitespace-nowrap ${
                filtroAba === aba.id
                  ? 'bg-amber-500 text-white shadow-sm'
                  : 'text-slate-500 hover:text-slate-800 hover:bg-slate-50'
              }`}
            >
              {aba.label}
              {aba.count !== undefined && (
                <span className={`text-[11px] px-1.5 py-0.5 rounded-md font-black ${
                  filtroAba === aba.id ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-500'
                }`}>{aba.count}</span>
              )}
            </button>
          ))}
        </div>
        <div className="relative flex-1 max-w-xs">
          <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Buscar comunicados..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-4 py-2.5 border border-slate-200 rounded-2xl text-sm font-medium text-slate-700 bg-white outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent"
          />
        </div>
        <button onClick={fetchComunicados} className="p-2.5 border border-slate-200 rounded-2xl text-slate-500 hover:text-slate-700 hover:bg-slate-50 transition-colors bg-white" title="Recarregar">
          <RefreshCw size={17} />
        </button>
      </div>

      {/* ── LISTA DE COMUNICADOS ── */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6].map(i => (
            <div key={i} className="bg-white rounded-2xl border border-slate-200 overflow-hidden animate-pulse">
              <div className="h-1.5 bg-slate-100" />
              <div className="p-5 space-y-3">
                <div className="h-4 bg-slate-100 rounded-lg w-24" />
                <div className="h-5 bg-slate-100 rounded-lg w-3/4" />
                <div className="h-4 bg-slate-50 rounded-lg w-full" />
                <div className="h-4 bg-slate-50 rounded-lg w-5/6" />
                <div className="h-3 bg-slate-50 rounded-lg w-1/2 mt-3" />
              </div>
            </div>
          ))}
        </div>
      ) : filtrados.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 gap-4">
          <div className="w-16 h-16 bg-amber-50 rounded-3xl flex items-center justify-center">
            <Megaphone size={28} className="text-amber-300" />
          </div>
          <div className="text-center">
            <p className="text-slate-600 font-bold text-base">Nenhum comunicado encontrado</p>
            <p className="text-slate-400 text-sm font-medium mt-1">
              {searchTerm ? 'Tente outros termos de busca' : 'Clique em "Novo Comunicado" para publicar o primeiro'}
            </p>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtrados.map(c => {
            const style = TIPO_STYLES[c.tipo] || TIPO_STYLES.INFORMATIVO;
            const priStyle = PRIORIDADE_STYLES[c.prioridade] || PRIORIDADE_STYLES.MEDIA;
            const expired = isExpired(c.dataExpiracao);
            const novo = isNew(c.dataCriacao);
            const expanded = expandedIds.has(c.id);

            return (
              <div
                key={c.id}
                className={`bg-white rounded-2xl border overflow-hidden transition-all hover:shadow-md hover:-translate-y-0.5 ${
                  !c.ativo ? 'opacity-60 border-slate-200' : style.border
                } ${expired ? 'opacity-50' : ''}`}
              >
                {/* Stripe de cor no topo */}
                <div className={`h-1.5 ${c.ativo ? style.bar : 'bg-slate-200'}`} />

                {/* Imagem do comunicado */}
                {c.imagemUrl && (
                  <img
                    src={c.imagemUrl}
                    alt={c.titulo}
                    className="w-full h-36 object-cover"
                  />
                )}

                <div className="p-5 flex flex-col gap-3">
                  {/* Badges */}
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-2">
                      <span className={`flex items-center gap-1 text-[10px] font-black uppercase tracking-wider px-2.5 py-1 rounded-lg ${style.bg} ${style.text}`}>
                        {style.icon}
                        {style.label}
                      </span>
                      <span className="flex items-center gap-1 text-[10px] font-bold text-slate-500">
                        <span className={`w-2 h-2 rounded-full ${priStyle.dot}`} />
                        {priStyle.label}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      {novo && c.ativo && (
                        <span className="text-[9px] font-black uppercase tracking-widest bg-emerald-500 text-white px-2 py-0.5 rounded-full">NOVO</span>
                      )}
                      {expired && (
                        <span className="text-[9px] font-black uppercase tracking-widest bg-slate-400 text-white px-2 py-0.5 rounded-full">EXPIRADO</span>
                      )}
                      {c.tipo === 'URGENTE' && c.ativo && !expired && (
                        <span className="flex h-2.5 w-2.5 relative">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                          <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500" />
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Título */}
                  <h3 className="text-sm font-extrabold text-slate-800 leading-snug">{c.titulo}</h3>

                  {/* Conteúdo */}
                  <p className={`text-xs text-slate-500 font-medium leading-relaxed ${expanded ? '' : 'line-clamp-3'}`}>
                    {c.conteudo}
                  </p>
                  {c.conteudo.length > 120 && (
                    <button
                      onClick={() => toggleExpand(c.id)}
                      className="flex items-center gap-1 text-[11px] font-bold text-amber-600 hover:text-amber-700 transition-colors self-start"
                    >
                      {expanded ? <><ChevronUp size={12} /> Mostrar menos</> : <><ChevronDown size={12} /> Ler mais</>}
                    </button>
                  )}

                  {/* Expiração */}
                  {c.dataExpiracao && (
                    <div className="flex items-center gap-1.5 text-[11px] text-slate-400 font-semibold">
                      <Clock size={11} />
                      Expira em {formatExpirationDate(c.dataExpiracao)}
                    </div>
                  )}

                  {/* Autor + tempo */}
                  <div className="flex items-center gap-1.5 text-[11px] text-slate-400 font-semibold border-t border-slate-100 pt-3">
                    <User size={11} />
                    {c.autor}
                    {c.dataCriacao && <span className="ml-auto">{formatRelativeTime(c.dataCriacao)}</span>}
                  </div>

                  {/* Ações */}
                  <div className="flex items-center gap-2 pt-1">
                    <button
                      onClick={() => abrirParaEditar(c)}
                      className="flex items-center gap-1.5 text-xs font-bold text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 px-3 py-2 rounded-xl transition-all flex-1 justify-center"
                    >
                      <Edit3 size={13} /> Editar
                    </button>
                    <button
                      onClick={() => handleToggleAtivo(c)}
                      disabled={toggling === c.id}
                      className={`flex items-center gap-1.5 text-xs font-bold px-3 py-2 rounded-xl transition-all flex-1 justify-center ${
                        c.ativo
                          ? 'text-slate-500 hover:text-red-600 bg-slate-100 hover:bg-red-50'
                          : 'text-emerald-600 hover:text-emerald-700 bg-emerald-50 hover:bg-emerald-100'
                      }`}
                    >
                      {toggling === c.id ? (
                        <Loader2 size={13} className="animate-spin" />
                      ) : c.ativo ? (
                        <><EyeOff size={13} /> Desativar</>
                      ) : (
                        <><Eye size={13} /> Ativar</>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── MODAL CRIAR / EDITAR ── */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            {/* Header do Modal */}
            <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-slate-100">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-amber-50 rounded-xl flex items-center justify-center text-amber-600">
                  {editando ? <Edit3 size={20} /> : <Plus size={20} />}
                </div>
                <div>
                  <h2 className="text-base font-extrabold text-slate-800 leading-none">
                    {editando ? 'Editar Comunicado' : 'Novo Comunicado'}
                  </h2>
                  <p className="text-xs text-slate-400 font-medium mt-0.5">
                    {editando ? `Editando ${editando.id}` : 'Será publicado imediatamente'}
                  </p>
                </div>
              </div>
              <button onClick={fecharModal} className="p-2 rounded-xl hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors">
                <X size={18} />
              </button>
            </div>

            {/* Corpo do Modal */}
            <div className="px-6 py-5 space-y-5">
              {/* Título */}
              <div>
                <label className="block text-xs font-black text-slate-600 uppercase tracking-wider mb-2">Título *</label>
                <input
                  type="text"
                  value={form.titulo}
                  onChange={e => setForm(f => ({ ...f, titulo: e.target.value }))}
                  placeholder="Ex: Reunião obrigatória — 15/06"
                  className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm font-semibold text-slate-800 bg-slate-50 outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent focus:bg-white transition-all"
                />
              </div>

              {/* Conteúdo */}
              <div>
                <label className="block text-xs font-black text-slate-600 uppercase tracking-wider mb-2">Conteúdo *</label>
                <textarea
                  value={form.conteudo}
                  onChange={e => setForm(f => ({ ...f, conteudo: e.target.value }))}
                  placeholder="Descreva o comunicado com todas as informações relevantes..."
                  rows={4}
                  className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm font-medium text-slate-700 bg-slate-50 outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent focus:bg-white transition-all resize-none leading-relaxed"
                />
              </div>

              {/* Tipo */}
              <div>
                <label className="block text-xs font-black text-slate-600 uppercase tracking-wider mb-2">Tipo *</label>
                <div className="grid grid-cols-2 gap-2">
                  {(Object.keys(TIPO_STYLES) as TipoComunicado[]).map(t => {
                    const s = TIPO_STYLES[t];
                    const selected = form.tipo === t;
                    return (
                      <button
                        key={t}
                        type="button"
                        onClick={() => setForm(f => ({ ...f, tipo: t }))}
                        className={`flex items-center gap-2.5 px-4 py-3 rounded-xl border-2 text-sm font-bold transition-all ${
                          selected ? `${s.bg} ${s.text} ${s.border}` : 'border-slate-200 text-slate-500 hover:border-slate-300 hover:bg-slate-50'
                        }`}
                      >
                        {s.icon}
                        {s.label}
                        {selected && <CheckCircle2 size={14} className="ml-auto" />}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Prioridade */}
              <div>
                <label className="block text-xs font-black text-slate-600 uppercase tracking-wider mb-2">Prioridade</label>
                <div className="flex gap-2">
                  {(Object.keys(PRIORIDADE_STYLES) as PrioridadeComunicado[]).map(p => {
                    const ps = PRIORIDADE_STYLES[p];
                    const selected = form.prioridade === p;
                    return (
                      <button
                        key={p}
                        type="button"
                        onClick={() => setForm(f => ({ ...f, prioridade: p }))}
                        className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border-2 text-sm font-bold flex-1 justify-center transition-all ${
                          selected ? 'border-slate-800 bg-slate-800 text-white' : 'border-slate-200 text-slate-500 hover:border-slate-300'
                        }`}
                      >
                        <span className={`w-2.5 h-2.5 rounded-full ${ps.dot}`} />
                        {ps.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Data de expiração */}
              <div>
                <label className="block text-xs font-black text-slate-600 uppercase tracking-wider mb-2">
                  Data de Expiração <span className="font-medium text-slate-400 normal-case">(opcional)</span>
                </label>
                <input
                  type="date"
                  value={form.dataExpiracao}
                  onChange={e => setForm(f => ({ ...f, dataExpiracao: e.target.value }))}
                  className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm font-semibold text-slate-700 bg-slate-50 outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent focus:bg-white transition-all"
                />
                <p className="text-[11px] text-slate-400 font-medium mt-1.5">
                  Após essa data o comunicado será marcado como expirado automaticamente.
                </p>
              </div>

              {/* Imagem */}
              <div>
                <label className="block text-xs font-black text-slate-600 uppercase tracking-wider mb-2">
                  Imagem <span className="font-medium text-slate-400 normal-case">(opcional)</span>
                </label>
                {imagePreview ? (
                  <div className="relative">
                    <img src={imagePreview} alt="Preview" className="w-full h-40 object-cover rounded-xl" />
                    <button
                      type="button"
                      onClick={() => { setImageFile(null); setImagePreview(null); setForm(f => ({ ...f, imagemUrl: '' })); }}
                      className="absolute top-2 right-2 bg-white rounded-full p-1 shadow-md hover:bg-red-50 text-slate-600 hover:text-red-500 transition-colors"
                    >
                      <X size={14} />
                    </button>
                  </div>
                ) : (
                  <label className="flex flex-col items-center justify-center h-28 border-2 border-dashed border-slate-200 rounded-xl cursor-pointer hover:border-amber-400 hover:bg-amber-50/30 transition-all">
                    <ImageIcon size={24} className="text-slate-300 mb-2" />
                    <span className="text-xs font-semibold text-slate-400">Clique para adicionar imagem</span>
                    <span className="text-[10px] text-slate-300 mt-0.5">PNG, JPG, WEBP</span>
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={e => {
                        const file = e.target.files?.[0];
                        if (file) {
                          setImageFile(file);
                          setImagePreview(URL.createObjectURL(file));
                        }
                      }}
                    />
                  </label>
                )}
              </div>
            </div>

            {/* Footer do Modal */}
            <div className="flex gap-3 px-6 pb-6">
              <button
                onClick={fecharModal}
                className="flex-1 border border-slate-200 text-slate-600 font-bold py-3 rounded-2xl hover:bg-slate-50 transition-colors text-sm"
              >
                Cancelar
              </button>
              <button
                onClick={handleSalvar}
                disabled={saving}
                className="flex-1 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 disabled:opacity-60 text-white font-bold py-3 rounded-2xl transition-all flex items-center justify-center gap-2 text-sm shadow-lg shadow-amber-500/25"
              >
                {saving ? (
                  <><Loader2 size={16} className="animate-spin" /> Salvando...</>
                ) : (
                  <><Save size={16} /> {editando ? 'Salvar alterações' : 'Publicar comunicado'}</>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

import { useEffect, useMemo, useState, type ChangeEvent, type FormEvent } from 'react';
import { Camera, ImagePlus, Link2, Loader2, Plus, Search, Tag, Trash2, X } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { comprimirImagem } from '../../lib/imagem';
import { invokePatrimonioSalas as invoke } from '../../lib/patrimonioSalasApi';
import type { ItemPatrimonio, Sala } from '../../pages/PatrimonioSalas';

const BUCKET = 'salas-fotos';
const PASTA_FOTOS = 'sem-identificacao';
const MAX_CANDIDATOS = 50;

interface RegistroSemIdentificacao {
  id: string;
  descricao: string;
  salaId: string | null;
  salaNome: string | null;
  fotoUrl: string | null;
  observacao: string;
  status: 'PENDENTE' | 'VINCULADO';
  chapaVinculada: string | null;
  registradoPorNome: string;
  registradoEm: string;
  vinculadoPorNome: string | null;
  vinculadoEm: string | null;
}

interface Props {
  itens: ItemPatrimonio[];
  allowedSalas: Sala[];
  readOnly: boolean;
  onItemAlocado: (item: Partial<ItemPatrimonio> & { chapa: string }) => void;
}

const FORM_VAZIO = { descricao: '', salaId: '', observacao: '' };
const formatarData = (d?: string | null) => (d ? new Date(d).toLocaleString('pt-BR') : '-');
const pathDaFoto = (url: string) => url.split(`/object/public/${BUCKET}/`)[1];

export function SemIdentificacao({ itens, allowedSalas, readOnly, onItemAlocado }: Props) {
  const [registros, setRegistros] = useState<RegistroSemIdentificacao[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [filtro, setFiltro] = useState<RegistroSemIdentificacao['status']>('PENDENTE');

  const [formAberto, setFormAberto] = useState(false);
  const [form, setForm] = useState(FORM_VAZIO);
  const [foto, setFoto] = useState<Blob | null>(null);
  const [fotoPreview, setFotoPreview] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [erroForm, setErroForm] = useState<string | null>(null);

  const [vinculando, setVinculando] = useState<RegistroSemIdentificacao | null>(null);
  const [buscaChapa, setBuscaChapa] = useState('');
  const [salvandoVinculo, setSalvandoVinculo] = useState(false);
  const [erroVinculo, setErroVinculo] = useState<string | null>(null);

  useEffect(() => {
    invoke('listar_sem_identificacao')
      .then(data => setRegistros(data.registros || []))
      .catch(e => setLoadError(e instanceof Error ? e.message : 'Erro ao carregar os registros.'))
      .finally(() => setLoading(false));
  }, []);

  const visiveis = useMemo(() => registros.filter(r => r.status === filtro), [registros, filtro]);
  const totalPendentes = useMemo(() => registros.filter(r => r.status === 'PENDENTE').length, [registros]);

  // Comodato tem código próprio e inservível já saiu de circulação; chapa já usada não repete.
  const candidatos = useMemo(() => {
    const usadas = new Set(registros.map(r => r.chapaVinculada).filter(Boolean));
    const termo = buscaChapa.trim().toLowerCase();
    return itens.filter(i => !i.alocado && !i.inservivel && !i.comodato && !usadas.has(i.chapa) && (
      !termo || i.chapa.toLowerCase().includes(termo) || i.descricao.toLowerCase().includes(termo)
    ));
  }, [itens, registros, buscaChapa]);

  function trocarPreview(nova: string | null) {
    setFotoPreview(atual => {
      if (atual) URL.revokeObjectURL(atual);
      return nova;
    });
  }

  function abrirForm() {
    setForm({ ...FORM_VAZIO, salaId: allowedSalas.length === 1 ? allowedSalas[0].id : '' });
    setFoto(null);
    trocarPreview(null);
    setErroForm(null);
    setFormAberto(true);
  }

  function fecharForm() {
    setFormAberto(false);
    setFoto(null);
    trocarPreview(null);
  }

  async function handleFoto(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setErroForm(null);
    try {
      const { blob } = await comprimirImagem(file, 1600);
      setFoto(blob);
      trocarPreview(URL.createObjectURL(blob));
    } catch (err) {
      setErroForm(err instanceof Error ? err.message : 'Não foi possível ler a imagem.');
    }
  }

  async function handleSalvar(e: FormEvent) {
    e.preventDefault();
    if (!form.descricao.trim()) return;
    setSalvando(true);
    setErroForm(null);
    let path: string | null = null;
    try {
      let fotoUrl = '';
      if (foto) {
        path = `${PASTA_FOTOS}/${crypto.randomUUID()}.jpg`;
        const { error } = await supabase.storage.from(BUCKET).upload(path, foto, { contentType: 'image/jpeg' });
        if (error) throw error;
        fotoUrl = supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
      }
      const data = await invoke('criar_sem_identificacao', {
        descricao: form.descricao.trim(),
        sala_id: form.salaId,
        foto_url: fotoUrl,
        observacao: form.observacao.trim(),
      });
      setRegistros(prev => [data.registro, ...prev]);
      setFiltro('PENDENTE');
      fecharForm();
    } catch (err) {
      if (path) await supabase.storage.from(BUCKET).remove([path]);
      setErroForm(err instanceof Error ? err.message : 'Erro ao salvar o registro.');
    } finally {
      setSalvando(false);
    }
  }

  async function handleExcluir(r: RegistroSemIdentificacao) {
    if (!confirm(`Excluir o registro "${r.descricao}"?`)) return;
    try {
      await invoke('excluir_sem_identificacao', { id: r.id });
      setRegistros(prev => prev.filter(x => x.id !== r.id));
      const path = r.fotoUrl ? pathDaFoto(r.fotoUrl) : null;
      if (path) await supabase.storage.from(BUCKET).remove([path]);
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Erro ao excluir o registro.');
    }
  }

  function abrirVinculo(r: RegistroSemIdentificacao) {
    setVinculando(r);
    setBuscaChapa('');
    setErroVinculo(null);
  }

  async function handleVincular(item: ItemPatrimonio) {
    if (!vinculando) return;
    const aviso = vinculando.salaNome ? `\n\nO item será alocado na sala "${vinculando.salaNome}".` : '';
    if (!confirm(`Vincular "${vinculando.descricao}" à chapa ${item.chapa}?${aviso}`)) return;
    setSalvandoVinculo(true);
    setErroVinculo(null);
    try {
      const data = await invoke('vincular_sem_identificacao', { id: vinculando.id, chapa: item.chapa });
      setRegistros(prev => prev.map(r => (r.id === vinculando.id ? data.registro : r)));
      if (data.item) onItemAlocado(data.item);
      setVinculando(null);
    } catch (e) {
      setErroVinculo(e instanceof Error ? e.message : 'Erro ao vincular o item.');
    } finally {
      setSalvandoVinculo(false);
    }
  }

  const botaoFiltro = (valor: RegistroSemIdentificacao['status'], rotulo: string) => (
    <button
      onClick={() => setFiltro(valor)}
      className={`px-3 py-2 rounded-lg text-xs font-bold transition-colors ${filtro === valor ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
    >
      {rotulo}
    </button>
  );

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex items-center justify-between gap-3 flex-wrap">
          <div className="flex gap-2">
            {botaoFiltro('PENDENTE', `Pendentes (${totalPendentes})`)}
            {botaoFiltro('VINCULADO', 'Vinculados')}
          </div>
          {!readOnly && (
            <button
              onClick={abrirForm}
              className="flex items-center justify-center gap-2 px-4 py-2 w-full sm:w-auto bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
            >
              <Plus size={16} /> Cadastrar item sem identificação
            </button>
          )}
        </div>

        {loading ? (
          <div className="flex justify-center items-center py-16">
            <Loader2 size={32} className="animate-spin text-blue-500" />
          </div>
        ) : loadError ? (
          <p className="text-sm text-red-600 text-center py-16 px-4">{loadError}</p>
        ) : visiveis.length === 0 ? (
          <div className="text-center py-16 text-slate-400">
            <Tag size={40} className="mx-auto mb-3 opacity-30" />
            <p className="text-sm">{filtro === 'PENDENTE' ? 'Nenhum item pendente de vínculo.' : 'Nenhum item vinculado ainda.'}</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-50">
            {visiveis.map(r => (
              <div key={r.id} className="p-4 flex flex-col sm:flex-row sm:items-center gap-4">
                {r.fotoUrl && (
                  <a href={r.fotoUrl} target="_blank" rel="noopener noreferrer" className="shrink-0">
                    <img src={r.fotoUrl} alt={`Foto: ${r.descricao}`} loading="lazy" className="w-full sm:w-24 h-48 sm:h-24 object-cover rounded-xl border border-slate-100 bg-slate-50" />
                  </a>
                )}
                <div className="min-w-0 flex-1">
                  <p className="font-bold text-slate-800 break-words">{r.descricao}</p>
                  <p className="text-xs text-slate-600 mt-0.5">Sala: {r.salaNome || 'não informada'}</p>
                  {r.observacao && <p className="text-xs text-slate-500 mt-0.5 break-words">{r.observacao}</p>}
                  <p className="text-[11px] text-slate-400 mt-0.5">Registrado por {r.registradoPorNome} em {formatarData(r.registradoEm)}</p>
                  {r.status === 'VINCULADO' && (
                    <p className="text-xs font-bold text-emerald-700 mt-1">
                      Vinculado à chapa {r.chapaVinculada} por {r.vinculadoPorNome} em {formatarData(r.vinculadoEm)}
                    </p>
                  )}
                </div>
                {r.status === 'PENDENTE' && !readOnly && (
                  <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto shrink-0">
                    <button
                      onClick={() => abrirVinculo(r)}
                      className="flex items-center justify-center gap-2 px-4 py-3 sm:py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold text-[11px] uppercase transition-colors"
                    >
                      <Link2 size={14} /> Vincular chapa
                    </button>
                    <button
                      onClick={() => handleExcluir(r)}
                      className="flex items-center justify-center gap-2 px-4 py-3 sm:py-2.5 bg-slate-100 hover:bg-red-50 text-slate-600 hover:text-red-600 rounded-xl font-bold text-[11px] uppercase transition-colors"
                    >
                      <Trash2 size={14} /> Excluir
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {formAberto && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <form onSubmit={handleSalvar} className="bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between">
              <h2 className="font-bold text-slate-800">Item sem identificação</h2>
              <button type="button" onClick={fecharForm} disabled={salvando} className="p-2 text-slate-400 hover:text-slate-600 rounded-lg" title="Fechar">
                <X size={18} />
              </button>
            </div>
            <div className="p-4 space-y-4">
              <div>
                <label htmlFor="semid-descricao" className="text-xs font-bold text-slate-600">Descrição do item *</label>
                <input
                  id="semid-descricao"
                  required
                  value={form.descricao}
                  onChange={e => setForm(f => ({ ...f, descricao: e.target.value }))}
                  placeholder="Ex.: Armário de aço cinza, 2 portas"
                  className="mt-1 w-full p-2.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label htmlFor="semid-sala" className="text-xs font-bold text-slate-600">Sala onde o item está</label>
                <select
                  id="semid-sala"
                  value={form.salaId}
                  onChange={e => setForm(f => ({ ...f, salaId: e.target.value }))}
                  className="mt-1 w-full p-2.5 text-sm border border-slate-200 rounded-lg bg-white outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Não informar</option>
                  {allowedSalas.map(s => <option key={s.id} value={s.id}>{s.nome}</option>)}
                </select>
                <p className="text-[11px] text-slate-400 mt-1">Ao vincular a chapa, o item será alocado nessa sala.</p>
              </div>
              <div>
                <label htmlFor="semid-observacao" className="text-xs font-bold text-slate-600">Observação</label>
                <textarea
                  id="semid-observacao"
                  rows={2}
                  value={form.observacao}
                  onChange={e => setForm(f => ({ ...f, observacao: e.target.value }))}
                  className="mt-1 w-full p-2.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              {fotoPreview && <img src={fotoPreview} alt="Prévia da foto" className="w-full max-h-60 object-contain rounded-xl border border-slate-100 bg-slate-50" />}
              <div className="grid grid-cols-2 gap-2">
                <label className="flex items-center justify-center gap-2 px-3 py-3 bg-slate-800 hover:bg-black text-white rounded-xl font-bold text-[11px] uppercase transition-colors cursor-pointer">
                  <Camera size={14} /> {foto ? 'Tirar outra' : 'Tirar foto'}
                  <input type="file" accept="image/*" capture="environment" className="hidden" onChange={handleFoto} disabled={salvando} />
                </label>
                <label className="flex items-center justify-center gap-2 px-3 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold text-[11px] uppercase transition-colors cursor-pointer">
                  <ImagePlus size={14} /> Da galeria
                  <input type="file" accept="image/*" className="hidden" onChange={handleFoto} disabled={salvando} />
                </label>
              </div>
              {erroForm && <p className="text-xs text-red-600">{erroForm}</p>}
              <button
                type="submit"
                disabled={salvando || !form.descricao.trim()}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold text-xs uppercase transition-colors disabled:opacity-40"
              >
                {salvando && <Loader2 size={14} className="animate-spin" />}
                {salvando ? 'Salvando...' : 'Salvar como pendente'}
              </button>
            </div>
          </form>
        </div>
      )}

      {vinculando && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] flex flex-col">
            <div className="p-4 border-b border-slate-100 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="font-bold text-slate-800">Vincular a uma chapa</h2>
                <p className="text-sm text-slate-600 break-words">{vinculando.descricao}</p>
                {vinculando.salaNome && <p className="text-xs text-slate-400">Será alocado em: {vinculando.salaNome}</p>}
              </div>
              <button onClick={() => setVinculando(null)} disabled={salvandoVinculo} className="p-2 text-slate-400 hover:text-slate-600 rounded-lg shrink-0" title="Fechar">
                <X size={18} />
              </button>
            </div>
            <div className="p-4 border-b border-slate-100">
              <div className="relative">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  autoFocus
                  placeholder="Buscar nos itens disponíveis..."
                  value={buscaChapa}
                  onChange={e => setBuscaChapa(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <p className="text-xs text-slate-400 mt-2">
                {candidatos.length} item(ns){candidatos.length > MAX_CANDIDATOS ? ` · mostrando os ${MAX_CANDIDATOS} primeiros, refine a busca` : ''}
              </p>
              {erroVinculo && <p className="text-xs text-red-600 mt-2">{erroVinculo}</p>}
            </div>
            <div className="overflow-y-auto divide-y divide-slate-50">
              {candidatos.slice(0, MAX_CANDIDATOS).map(item => (
                <div key={item.chapa} className="p-3 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <span className="font-mono font-bold text-blue-700">Chapa {item.chapa}</span>
                    <p className="text-sm text-slate-700 break-words">{item.descricao}</p>
                  </div>
                  <button
                    onClick={() => handleVincular(item)}
                    disabled={salvandoVinculo}
                    className="px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-bold text-[11px] uppercase transition-colors disabled:opacity-50 shrink-0"
                  >
                    {salvandoVinculo ? <Loader2 size={14} className="animate-spin" /> : 'Vincular'}
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

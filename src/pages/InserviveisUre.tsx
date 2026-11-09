import { useEffect, useMemo, useDeferredValue, useState, type ChangeEvent, type ReactNode } from 'react';
import { supabase } from '../lib/supabase';
import { isReadOnlyRole } from '../lib/roles';
import { comprimirImagem } from '../lib/imagem';
import { invokePatrimonioSalas as invoke } from '../lib/patrimonioSalasApi';
import { DefesoEleitoralBanner } from '../components/DefesoEleitoralBanner';
import {
  AlertCircle, Camera, FileDown, ImagePlus, Loader2, Package, Recycle, RefreshCw, Search, Trash2, X,
} from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { addTimbradoAllPages, TIMBRADO_HEADER_H, TIMBRADO_FOOTER_H } from '../lib/pdfTimbrado';

// Reaproveita o bucket das salas: mesmas regras de acesso, só muda a pasta.
const BUCKET = 'salas-fotos';
const PASTA_FOTOS = 'inserviveis';
const ITENS_POR_PAGINA = 100;
const COLUNA_FOTO_PDF = 5;

interface ItemInventario {
  chapa: string;
  descricao: string;
  estadoConservacao: string;
  alocado: boolean;
  comodato?: boolean;
  inservivel?: boolean;
  inservivelFotoUrl?: string | null;
  inservivelObservacao?: string | null;
  inservivelPorNome?: string | null;
  inservivelEm?: string | null;
}

type Aba = 'disponiveis' | 'lista';

const formatarData = (d?: string | null) => (d ? new Date(d).toLocaleString('pt-BR') : '-');

async function carregarMiniatura(url: string) {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const { blob, largura, altura } = await comprimirImagem(await res.blob(), 400, 0.7);
    return { dados: new Uint8Array(await blob.arrayBuffer()), largura, altura };
  } catch {
    return null; // sem a foto a linha ainda sai no PDF
  }
}

export default function InserviveisUre() {
  const [itens, setItens] = useState<ItemInventario[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [readOnly, setReadOnly] = useState(false);

  const [aba, setAba] = useState<Aba>('disponiveis');
  const [busca, setBusca] = useState('');
  const buscaAdiada = useDeferredValue(busca);
  const [limite, setLimite] = useState(ITENS_POR_PAGINA);

  const [itemModal, setItemModal] = useState<ItemInventario | null>(null);
  const [foto, setFoto] = useState<Blob | null>(null);
  const [fotoPreview, setFotoPreview] = useState<string | null>(null);
  const [observacao, setObservacao] = useState('');
  const [processandoFoto, setProcessandoFoto] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erroModal, setErroModal] = useState<string | null>(null);

  const [gerandoPdf, setGerandoPdf] = useState(false);

  useEffect(() => {
    carregar();
  }, []);

  async function carregar() {
    setLoadError(null);
    setRefreshing(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const [perfilRes, dados] = await Promise.all([
        session
          ? (supabase as any).from('profiles').select('role').eq('id', session.user.id).single()
          : Promise.resolve({ data: null }),
        invoke('listar_itens'),
      ]);
      setReadOnly(isReadOnlyRole(perfilRes.data?.role || ''));
      setItens(dados.itens || []);
    } catch (e) {
      console.error(e);
      setLoadError(e instanceof Error ? e.message : 'Erro ao carregar os itens.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  const correspondeBusca = (item: ItemInventario, termo: string) =>
    !termo || item.chapa.toLowerCase().includes(termo) || item.descricao.toLowerCase().includes(termo);

  // Item em comodato é de empresa terceirizada, então a URE não pode declará-lo inservível.
  const disponiveis = useMemo(() => {
    const termo = buscaAdiada.trim().toLowerCase();
    return itens.filter(i => !i.alocado && !i.inservivel && !i.comodato && correspondeBusca(i, termo));
  }, [itens, buscaAdiada]);

  const todosInserviveis = useMemo(
    () => itens
      .filter(i => i.inservivel)
      .sort((a, b) => ((a.inservivelEm || '') < (b.inservivelEm || '') ? 1 : -1)),
    [itens],
  );

  const inserviveis = useMemo(() => {
    const termo = buscaAdiada.trim().toLowerCase();
    return todosInserviveis.filter(i => correspondeBusca(i, termo));
  }, [todosInserviveis, buscaAdiada]);

  function trocarPreview(nova: string | null) {
    setFotoPreview(atual => {
      if (atual) URL.revokeObjectURL(atual);
      return nova;
    });
  }

  function abrirModal(item: ItemInventario) {
    setItemModal(item);
    setFoto(null);
    trocarPreview(null);
    setObservacao('');
    setErroModal(null);
  }

  function fecharModal() {
    setItemModal(null);
    setFoto(null);
    trocarPreview(null);
  }

  async function handleFoto(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setErroModal(null);
    setProcessandoFoto(true);
    try {
      const { blob } = await comprimirImagem(file, 1600);
      setFoto(blob);
      trocarPreview(URL.createObjectURL(blob));
    } catch (err) {
      setErroModal(err instanceof Error ? err.message : 'Não foi possível ler a imagem.');
    } finally {
      setProcessandoFoto(false);
    }
  }

  async function handleSalvar() {
    if (!itemModal || !foto) return;
    const { chapa } = itemModal;
    setSalvando(true);
    setErroModal(null);
    const path = `${PASTA_FOTOS}/${chapa.replace(/[^\w-]/g, '_')}_${Date.now()}.jpg`;
    try {
      const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, foto, { contentType: 'image/jpeg' });
      if (upErr) throw upErr;
      const { data: { publicUrl } } = supabase.storage.from(BUCKET).getPublicUrl(path);

      try {
        const data = await invoke('marcar_inservivel', { chapa, foto_url: publicUrl, observacao: observacao.trim() });
        setItens(prev => prev.map(i => (i.chapa === chapa ? { ...i, ...data.item } : i)));
        fecharModal();
      } catch (err) {
        await supabase.storage.from(BUCKET).remove([path]); // não deixa foto órfã
        throw err;
      }
    } catch (err) {
      console.error(err);
      setErroModal(err instanceof Error ? err.message : 'Erro ao salvar o item.');
    } finally {
      setSalvando(false);
    }
  }

  async function handleRemover(item: ItemInventario) {
    if (!confirm(`Tirar o item ${item.chapa} da lista de inservíveis? A foto será apagada e ele volta a ficar disponível.`)) return;
    try {
      await invoke('desmarcar_inservivel', { chapa: item.chapa });
      setItens(prev => prev.map(i => (i.chapa === item.chapa
        ? { ...i, inservivel: false, inservivelFotoUrl: null, inservivelObservacao: null, inservivelPorNome: null, inservivelEm: null }
        : i)));
      const path = item.inservivelFotoUrl?.split(`/object/public/${BUCKET}/`)[1];
      if (path) await supabase.storage.from(BUCKET).remove([path]);
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Erro ao remover o item da lista.');
    }
  }

  async function handleGerarPdf() {
    setGerandoPdf(true);
    try {
      // Em lotes, para uma lista grande não abrir centenas de downloads de uma vez.
      const miniaturas: Awaited<ReturnType<typeof carregarMiniatura>>[] = [];
      for (let i = 0; i < todosInserviveis.length; i += 8) {
        const lote = todosInserviveis.slice(i, i + 8);
        miniaturas.push(...await Promise.all(lote.map(item => carregarMiniatura(item.inservivelFotoUrl || ''))));
      }

      const doc = new jsPDF('portrait');
      const margin = 14;
      let y = 36;
      doc.setFontSize(14);
      doc.setTextColor(37, 99, 235);
      doc.text('Lista de Itens Inservíveis da URE — SGE-GSU-II', margin, y);
      y += 8;
      doc.setFontSize(10);
      doc.setTextColor(100);
      doc.text(`Gerado em: ${new Date().toLocaleString('pt-BR')}`, margin, y);
      y += 6;
      doc.text(`Total de itens: ${todosInserviveis.length}`, margin, y);
      y += 8;

      autoTable(doc, {
        startY: y,
        head: [['Nº', 'Chapa', 'Descrição do Item', 'Observação', 'Registrado', 'Foto']],
        body: todosInserviveis.map((item, i) => [
          String(i + 1),
          item.chapa,
          item.descricao,
          item.inservivelObservacao || '-',
          `${item.inservivelPorNome || '-'}\n${formatarData(item.inservivelEm)}`,
          '',
        ]),
        theme: 'grid',
        headStyles: { fillColor: [37, 99, 235], textColor: 255, fontStyle: 'bold' },
        styles: { fontSize: 8, cellPadding: 2, valign: 'middle' },
        bodyStyles: { minCellHeight: 34 },
        columnStyles: { 0: { cellWidth: 9 }, 1: { cellWidth: 22 }, 4: { cellWidth: 32 }, [COLUNA_FOTO_PDF]: { cellWidth: 36 } },
        margin: { top: TIMBRADO_HEADER_H + 6, bottom: TIMBRADO_FOOTER_H + 6 },
        didDrawCell: data => {
          if (data.section !== 'body' || data.column.index !== COLUNA_FOTO_PDF) return;
          const m = miniaturas[data.row.index];
          if (!m) return;
          const maxL = data.cell.width - 2;
          const maxA = data.cell.height - 2;
          const escala = Math.min(maxL / m.largura, maxA / m.altura);
          const l = m.largura * escala;
          const a = m.altura * escala;
          doc.addImage(m.dados, 'JPEG', data.cell.x + (data.cell.width - l) / 2, data.cell.y + (data.cell.height - a) / 2, l, a);
        },
      });

      addTimbradoAllPages(doc);
      doc.save(`Inserviveis_URE_${new Date().toISOString().split('T')[0]}.pdf`);
    } catch (e) {
      console.error(e);
      alert('Erro ao gerar o PDF.');
    } finally {
      setGerandoPdf(false);
    }
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-3">
        <Loader2 className="animate-spin text-blue-600" size={36} />
        <p className="text-sm font-medium text-slate-400">Carregando itens...</p>
      </div>
    );
  }

  const abas: { id: Aba; label: string; icon: ReactNode }[] = [
    { id: 'disponiveis', label: 'Itens Disponíveis', icon: <Package size={15} /> },
    { id: 'lista', label: `Lista de Inservíveis (${todosInserviveis.length})`, icon: <Recycle size={15} /> },
  ];

  const chapaClasses = 'font-mono font-bold text-lg text-blue-700 bg-blue-50 px-2.5 py-0.5 rounded-lg';

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-6xl mx-auto">
      <DefesoEleitoralBanner />

      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <Recycle className="text-red-500" size={28} />
            Inservíveis da URE
          </h1>
          <p className="text-slate-500 text-sm mt-1">
            Registre com foto os itens sem condição de uso que ainda não foram alocados em uma sala
          </p>
        </div>
        <button
          onClick={carregar}
          disabled={refreshing}
          className="flex items-center justify-center gap-2 px-3 py-2.5 w-full sm:w-auto text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors text-sm disabled:opacity-60"
        >
          <RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} /> Atualizar
        </button>
      </div>

      {loadError && (
        <div className="bg-red-50 border-2 border-red-100 p-5 rounded-2xl flex items-start gap-4">
          <AlertCircle className="text-red-500 shrink-0 mt-0.5" size={22} />
          <div>
            <h2 className="text-sm font-bold text-red-800">Erro ao carregar os itens</h2>
            <p className="text-xs text-red-700 mt-1">{loadError}</p>
          </div>
        </div>
      )}

      <div className="bg-slate-100 p-1.5 rounded-2xl flex gap-1 w-full flex-wrap">
        {abas.map(a => (
          <button
            key={a.id}
            onClick={() => setAba(a.id)}
            className={`flex-1 min-w-[140px] flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl font-bold text-[11px] uppercase tracking-wider transition-all ${
              aba === a.id ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-blue-500'
            }`}
          >
            {a.icon} {a.label}
          </button>
        ))}
      </div>

      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex flex-wrap gap-3 items-center">
          <div className="relative flex-1 min-w-[200px]">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Buscar por chapa ou descrição..."
              value={busca}
              onChange={e => { setBusca(e.target.value); setLimite(ITENS_POR_PAGINA); }}
              className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          {aba === 'disponiveis' ? (
            <span className="text-xs text-slate-400">{disponiveis.length} item(ns) disponível(is)</span>
          ) : (
            <button
              onClick={handleGerarPdf}
              disabled={gerandoPdf || todosInserviveis.length === 0}
              className="flex items-center justify-center gap-2 px-3 py-2 w-full sm:w-auto bg-slate-900 hover:bg-black text-white rounded-lg font-bold text-[11px] uppercase transition-colors disabled:opacity-40"
            >
              {gerandoPdf ? <Loader2 size={14} className="animate-spin" /> : <FileDown size={14} />}
              {gerandoPdf ? 'Gerando...' : 'Gerar PDF da lista'}
            </button>
          )}
        </div>

        {aba === 'disponiveis' && (
          disponiveis.length === 0 ? (
            <div className="text-center py-16 text-slate-400">
              <Package size={40} className="mx-auto mb-3 opacity-30" />
              <p className="text-sm">Nenhum item disponível encontrado.</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-50">
              {disponiveis.slice(0, limite).map(item => (
                <div key={item.chapa} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-50/50 transition-colors">
                  <div className="min-w-0">
                    <span className={chapaClasses}>Chapa {item.chapa}</span>
                    <p className="font-medium text-slate-800 break-words mt-1">{item.descricao}</p>
                    {item.estadoConservacao && (
                      <span className="text-[10px] font-bold uppercase text-emerald-600">{item.estadoConservacao}</span>
                    )}
                  </div>
                  {!readOnly && (
                    <button
                      onClick={() => abrirModal(item)}
                      className="flex items-center justify-center gap-2 px-4 py-3 sm:py-2.5 w-full sm:w-auto bg-red-600 hover:bg-red-700 text-white rounded-xl font-bold text-[11px] uppercase transition-colors shrink-0"
                    >
                      <Camera size={14} />
                      Marcar inservível
                    </button>
                  )}
                </div>
              ))}
              {disponiveis.length > limite && (
                <button
                  onClick={() => setLimite(n => n + ITENS_POR_PAGINA)}
                  className="w-full p-4 text-sm font-bold text-blue-600 hover:bg-blue-50 transition-colors"
                >
                  Mostrar mais ({disponiveis.length - limite} restantes)
                </button>
              )}
            </div>
          )
        )}

        {aba === 'lista' && (
          inserviveis.length === 0 ? (
            <div className="text-center py-16 text-slate-400">
              <Recycle size={40} className="mx-auto mb-3 opacity-30" />
              <p className="text-sm">Nenhum item na lista de inservíveis.</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-50">
              {inserviveis.map(item => (
                <div key={item.chapa} className="p-4 flex flex-col sm:flex-row sm:items-center gap-4">
                  {item.inservivelFotoUrl && (
                    <a href={item.inservivelFotoUrl} target="_blank" rel="noopener noreferrer" className="shrink-0">
                      <img
                        src={item.inservivelFotoUrl}
                        alt={`Foto do item ${item.chapa}`}
                        loading="lazy"
                        className="w-full sm:w-24 h-48 sm:h-24 object-cover rounded-xl border border-slate-100 bg-slate-50"
                      />
                    </a>
                  )}
                  <div className="min-w-0 flex-1">
                    <span className={chapaClasses}>Chapa {item.chapa}</span>
                    <p className="font-medium text-slate-800 break-words mt-1">{item.descricao}</p>
                    {item.inservivelObservacao && (
                      <p className="text-xs text-slate-600 mt-0.5 break-words">{item.inservivelObservacao}</p>
                    )}
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      Registrado por {item.inservivelPorNome} em {formatarData(item.inservivelEm)}
                    </p>
                  </div>
                  {!readOnly && (
                    <button
                      onClick={() => handleRemover(item)}
                      className="flex items-center justify-center gap-2 px-4 py-3 sm:py-2.5 w-full sm:w-auto bg-slate-100 hover:bg-red-50 text-slate-600 hover:text-red-600 rounded-xl font-bold text-[11px] uppercase transition-colors shrink-0"
                    >
                      <Trash2 size={14} />
                      Tirar da lista
                    </button>
                  )}
                </div>
              ))}
            </div>
          )
        )}
      </div>

      {itemModal && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between">
              <h2 className="font-bold text-slate-800">Marcar como inservível</h2>
              <button onClick={fecharModal} disabled={salvando} className="p-2 text-slate-400 hover:text-slate-600 rounded-lg" title="Fechar">
                <X size={18} />
              </button>
            </div>

            <div className="p-4 space-y-4">
              <div>
                <span className={chapaClasses}>Chapa {itemModal.chapa}</span>
                <p className="font-medium text-slate-800 break-words mt-1">{itemModal.descricao}</p>
              </div>

              {fotoPreview ? (
                <img src={fotoPreview} alt="Prévia da foto" className="w-full max-h-72 object-contain rounded-xl border border-slate-100 bg-slate-50" />
              ) : (
                <div className="h-40 rounded-xl border-2 border-dashed border-slate-200 flex flex-col items-center justify-center text-slate-400 gap-2">
                  {processandoFoto ? <Loader2 size={28} className="animate-spin" /> : <Camera size={28} />}
                  <p className="text-xs">{processandoFoto ? 'Preparando a foto...' : 'A foto do item é obrigatória'}</p>
                </div>
              )}

              <div className="grid grid-cols-2 gap-2">
                <label className="flex items-center justify-center gap-2 px-3 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold text-[11px] uppercase transition-colors cursor-pointer">
                  <Camera size={14} />
                  {foto ? 'Tirar outra' : 'Tirar foto'}
                  <input type="file" accept="image/*" capture="environment" className="hidden" onChange={handleFoto} disabled={salvando} />
                </label>
                <label className="flex items-center justify-center gap-2 px-3 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold text-[11px] uppercase transition-colors cursor-pointer">
                  <ImagePlus size={14} />
                  Da galeria
                  <input type="file" accept="image/*" className="hidden" onChange={handleFoto} disabled={salvando} />
                </label>
              </div>

              <div>
                <label htmlFor="inservivel-observacao" className="text-xs font-bold text-slate-600">Observação (opcional)</label>
                <textarea
                  id="inservivel-observacao"
                  rows={2}
                  value={observacao}
                  onChange={e => setObservacao(e.target.value)}
                  placeholder="Ex.: pé quebrado, tampo solto..."
                  className="mt-1 w-full p-2.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {erroModal && <p className="text-xs text-red-600">{erroModal}</p>}

              <button
                onClick={handleSalvar}
                disabled={!foto || salvando || processandoFoto}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-red-600 hover:bg-red-700 text-white rounded-xl font-bold text-xs uppercase transition-colors disabled:opacity-40"
              >
                {salvando && <Loader2 size={14} className="animate-spin" />}
                {salvando ? 'Salvando...' : 'Salvar na lista de inservíveis'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

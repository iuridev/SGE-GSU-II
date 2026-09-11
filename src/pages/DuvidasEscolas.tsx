import { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { HelpCircle, Loader2, Search, Cloud, List, Link2, Check } from 'lucide-react';

interface Duvida {
  id: string;
  escolaId: string;
  escolaNome: string;
  categoria: string;
  duvida: string;
  contato: string;
  criadoEm: string;
}

// Mesma lista (value = o que fica gravado / label = texto curto de exibição)
// usada em src/pages/FormularioDuvidas.tsx. Fiscalização hoje cobre só
// contratos de elevador, por isso o value já vem descritivo.
const CATEGORIAS = [
  { value: 'Obras', label: 'Obras' },
  { value: 'Manutenções', label: 'Manutenções' },
  { value: 'Patrimônio', label: 'Patrimônio' },
  { value: 'Zeladoria', label: 'Zeladoria' },
  { value: 'Fiscalização de Contrato de Manutenção de Elevadores', label: 'Fiscalização' },
  { value: 'Outro', label: 'Outro' },
];

const CATEGORIA_COR: Record<string, string> = {
  'Obras': 'bg-orange-100 text-orange-700',
  'Manutenções': 'bg-blue-100 text-blue-700',
  'Patrimônio': 'bg-purple-100 text-purple-700',
  'Zeladoria': 'bg-teal-100 text-teal-700',
  'Fiscalização de Contrato de Manutenção de Elevadores': 'bg-indigo-100 text-indigo-700',
  'Outro': 'bg-slate-100 text-slate-600',
};

function categoriaLabel(categoria: string) {
  return CATEGORIAS.find(c => c.value === categoria)?.label || categoria;
}

// Palavras comuns do português que não ajudam a identificar o tema de uma
// dúvida — removidas antes de contar frequência para a nuvem de palavras.
const STOPWORDS = new Set([
  'a','o','as','os','de','da','do','das','dos','em','no','na','nos','nas','um','uma','uns','umas',
  'e','é','ou','que','com','por','para','pra','se','sua','seu','suas','seus','ao','aos','à','às',
  'como','mais','muito','muita','muitos','muitas','isso','esse','essa','esses','essas','este','esta',
  'estes','estas','aquilo','aquele','aquela','aqueles','aquelas','meu','minha','meus','minhas','teu',
  'tua','teus','tuas','nosso','nossa','nossos','nossas','tem','têm','ter','tendo','está','estão',
  'estamos','sou','somos','são','foi','foram','será','serão','não','sim','mas','também','já','ainda',
  'quando','onde','porque','qual','quais','quanto','quanta','quantos','quantas','isto','aqui','ali',
  'lá','cada','outro','outra','outros','outras','entre','sobre','até','sem','depois','antes','assim',
  'então','pois','caso','cujo','cuja','cujos','cujas','numa','num','dessa','desse','dessas','desses',
  'nessa','nesse','nessas','nesses','nela','nele','nelas','neles','pelo','pela','pelos','pelas','eu',
  'você','vocês','nós','eles','elas','ele','ela','me','te','lhe','lhes','minha','tenho','há','todo',
  'toda','todos','todas','qualquer','pode','poderia','gostaria','saber','favor','obrigado','obrigada',
]);

const NUVEM_CORES = ['text-indigo-600', 'text-blue-600', 'text-teal-600', 'text-emerald-600', 'text-amber-600', 'text-rose-600'];

function calcularNuvem(textos: string[], top = 40) {
  const contagem = new Map<string, number>();
  for (const texto of textos) {
    const palavras = texto
      .toLowerCase()
      .normalize('NFC')
      .replace(/[^\p{L}\p{N}\s]/gu, ' ')
      .split(/\s+/)
      .filter(w => w.length >= 3 && !STOPWORDS.has(w));
    for (const p of palavras) contagem.set(p, (contagem.get(p) || 0) + 1);
  }
  return Array.from(contagem.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, top);
}

export default function DuvidasEscolas() {
  const [duvidas, setDuvidas] = useState<Duvida[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState('');
  const [aba, setAba] = useState<'lista' | 'nuvem'>('lista');
  const [filtroCategoria, setFiltroCategoria] = useState('Todas');
  const [filtroBusca, setFiltroBusca] = useState('');
  const [linkCopiado, setLinkCopiado] = useState(false);

  const linkFormulario = `${window.location.origin}/?duvidas=1`;

  function copiarLink() {
    navigator.clipboard.writeText(linkFormulario);
    setLinkCopiado(true);
    setTimeout(() => setLinkCopiado(false), 2000);
  }

  useEffect(() => {
    supabase.functions.invoke('duvidas-escolas-listar', { body: { action: 'listar' } })
      .then(({ data, error }) => {
        if (error) throw error;
        if (data?.error) throw new Error(data.error);
        setDuvidas(data?.duvidas || []);
      })
      .catch((err) => setErro(err?.message || 'Não foi possível carregar as dúvidas.'))
      .finally(() => setLoading(false));
  }, []);

  const filtradas = useMemo(() => {
    const busca = filtroBusca.trim().toLowerCase();
    return duvidas.filter(d => {
      if (filtroCategoria !== 'Todas' && d.categoria !== filtroCategoria) return false;
      if (busca && !d.escolaNome.toLowerCase().includes(busca) && !d.duvida.toLowerCase().includes(busca)) return false;
      return true;
    });
  }, [duvidas, filtroCategoria, filtroBusca]);

  const nuvem = useMemo(() => calcularNuvem(filtradas.map(d => d.duvida)), [filtradas]);
  const maxFreq = nuvem[0]?.[1] || 1;
  const minFreq = nuvem[nuvem.length - 1]?.[1] || 1;

  function formatarData(iso: string) {
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 size={28} className="animate-spin text-indigo-500" />
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex items-start justify-between gap-3 mb-6 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-indigo-600 flex items-center justify-center shadow-lg shadow-indigo-200 shrink-0">
            <HelpCircle size={22} className="text-white" />
          </div>
          <div>
            <h1 className="text-xl font-black text-slate-800">Dúvidas das Escolas</h1>
            <p className="text-sm text-slate-500">Respostas do formulário público — Obras, Manutenções, Patrimônio e Zeladoria</p>
          </div>
        </div>
        <button
          onClick={copiarLink}
          title={linkFormulario}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-colors shrink-0 ${linkCopiado ? 'bg-green-100 text-green-700' : 'bg-indigo-50 text-indigo-600 hover:bg-indigo-100'}`}
        >
          {linkCopiado ? <Check size={14} /> : <Link2 size={14} />}
          {linkCopiado ? 'Link copiado!' : 'Copiar link do formulário'}
        </button>
      </div>

      {erro && <p className="text-sm font-semibold text-red-600 bg-red-50 rounded-xl px-4 py-3 mb-4">{erro}</p>}

      <div className="flex gap-1 p-1.5 bg-white rounded-2xl border border-slate-200 shadow-sm mb-4 w-fit">
        <button
          onClick={() => setAba('lista')}
          className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all flex items-center gap-1.5 ${aba === 'lista' ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-slate-600'}`}
        >
          <List size={14} /> Dúvidas ({filtradas.length})
        </button>
        <button
          onClick={() => setAba('nuvem')}
          className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all flex items-center gap-1.5 ${aba === 'nuvem' ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-slate-600'}`}
        >
          <Cloud size={14} /> Nuvem de Palavras
        </button>
      </div>

      <div className="flex flex-col sm:flex-row gap-2 mb-4">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={filtroBusca}
            onChange={e => setFiltroBusca(e.target.value)}
            placeholder="Buscar por escola ou palavra..."
            className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-slate-200 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-400"
          />
        </div>
        <select
          value={filtroCategoria}
          onChange={e => setFiltroCategoria(e.target.value)}
          className="px-3 py-2.5 rounded-xl border border-slate-200 text-sm font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-400"
        >
          <option value="Todas">Todas as categorias</option>
          {CATEGORIAS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
        </select>
      </div>

      {aba === 'lista' ? (
        filtradas.length === 0 ? (
          <div className="text-center py-16 bg-white rounded-3xl border border-dashed border-slate-200">
            <HelpCircle size={40} className="text-slate-200 mx-auto mb-3" />
            <p className="font-black text-slate-400 uppercase tracking-widest text-sm">Nenhuma dúvida encontrada</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filtradas.map(d => (
              <div key={d.id} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
                <div className="flex items-start justify-between gap-3 mb-2">
                  <p className="font-black text-slate-800 text-sm">{d.escolaNome}</p>
                  <span title={d.categoria} className={`text-[10px] font-black px-2 py-1 rounded-lg uppercase tracking-wide shrink-0 ${CATEGORIA_COR[d.categoria] || CATEGORIA_COR['Outro']}`}>
                    {categoriaLabel(d.categoria)}
                  </span>
                </div>
                <p className="text-sm text-slate-600 whitespace-pre-wrap">{d.duvida}</p>
                <div className="flex items-center justify-between mt-3 text-xs text-slate-400 font-semibold">
                  <span>{d.contato || '—'}</span>
                  <span>{formatarData(d.criadoEm)}</span>
                </div>
              </div>
            ))}
          </div>
        )
      ) : (
        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-8">
          {nuvem.length === 0 ? (
            <div className="text-center py-8">
              <Cloud size={40} className="text-slate-200 mx-auto mb-3" />
              <p className="font-black text-slate-400 uppercase tracking-widest text-sm">Sem dados suficientes ainda</p>
            </div>
          ) : (
            <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2">
              {nuvem.map(([palavra, freq], i) => {
                const escala = maxFreq === minFreq ? 1 : (freq - minFreq) / (maxFreq - minFreq);
                const fontSize = 14 + escala * 30;
                return (
                  <span
                    key={palavra}
                    title={`${freq}x`}
                    className={`font-black ${NUVEM_CORES[i % NUVEM_CORES.length]}`}
                    style={{ fontSize: `${fontSize}px`, lineHeight: 1 }}
                  >
                    {palavra}
                  </span>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import {
  BookOpen, Loader2, Plus, Trash2, Save, X, ArrowLeftRight, Power,
} from 'lucide-react';

// Curadoria da base do assistente de IA (retrieval, SEM tokens).
// Só regional_admin (RLS na migration 20260827000000_assistente_ia_retrieval.sql).

interface Faq {
  id: string;
  pergunta_titulo: string;
  corpo_resposta: string;
  palavras_chave: string[];
  escopo: string;
  ativo: boolean;
}

interface Sinonimo {
  id: string;
  termo: string;
  canonico: string;
}

const ESCOPOS = ['procedimento', 'dados', 'geral'];

const vazio = { pergunta_titulo: '', corpo_resposta: '', palavras_chave: '', escopo: 'procedimento' };

export default function AssistenteFAQ() {
  const [aba, setAba] = useState<'faq' | 'sinonimos'>('faq');
  const [faqs, setFaqs] = useState<Faq[]>([]);
  const [sinonimos, setSinonimos] = useState<Sinonimo[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);

  const [novo, setNovo] = useState({ ...vazio });
  const [editId, setEditId] = useState<string | null>(null);
  const [edit, setEdit] = useState({ ...vazio });

  const [novoSin, setNovoSin] = useState({ termo: '', canonico: '' });

  const carregar = useCallback(async () => {
    const [{ data: f }, { data: s }] = await Promise.all([
      (supabase.from('assistente_faq') as any).select('*').order('criado_em', { ascending: false }),
      (supabase.from('assistente_sinonimos') as any).select('*').order('termo', { ascending: true }),
    ]);
    setFaqs((f || []) as Faq[]);
    setSinonimos((s || []) as Sinonimo[]);
  }, []);

  useEffect(() => {
    (async () => { await carregar(); setCarregando(false); })();
  }, [carregar]);

  const parseChaves = (txt: string) =>
    txt.split(',').map((x) => x.trim().toLowerCase()).filter(Boolean);

  const criarFaq = async () => {
    if (!novo.pergunta_titulo.trim() || !novo.corpo_resposta.trim()) return;
    setSalvando(true);
    try {
      const { error } = await (supabase.from('assistente_faq') as any).insert([{
        pergunta_titulo: novo.pergunta_titulo.trim(),
        corpo_resposta: novo.corpo_resposta.trim(),
        palavras_chave: parseChaves(novo.palavras_chave),
        escopo: novo.escopo,
      }]);
      if (error) throw error;
      setNovo({ ...vazio });
      await carregar();
    } catch (e: any) {
      alert(e?.message || 'Erro ao salvar.');
    } finally {
      setSalvando(false);
    }
  };

  const abrirEdicao = (f: Faq) => {
    setEditId(f.id);
    setEdit({
      pergunta_titulo: f.pergunta_titulo,
      corpo_resposta: f.corpo_resposta,
      palavras_chave: (f.palavras_chave || []).join(', '),
      escopo: f.escopo,
    });
  };

  const salvarEdicao = async () => {
    if (!editId) return;
    setSalvando(true);
    try {
      const { error } = await (supabase.from('assistente_faq') as any).update({
        pergunta_titulo: edit.pergunta_titulo.trim(),
        corpo_resposta: edit.corpo_resposta.trim(),
        palavras_chave: parseChaves(edit.palavras_chave),
        escopo: edit.escopo,
        atualizado_em: new Date().toISOString(),
      }).eq('id', editId);
      if (error) throw error;
      setEditId(null);
      await carregar();
    } catch (e: any) {
      alert(e?.message || 'Erro ao salvar.');
    } finally {
      setSalvando(false);
    }
  };

  const alternarAtivo = async (f: Faq) => {
    await (supabase.from('assistente_faq') as any).update({ ativo: !f.ativo }).eq('id', f.id);
    await carregar();
  };

  const excluirFaq = async (id: string) => {
    if (!window.confirm('Excluir este item da base?')) return;
    await (supabase.from('assistente_faq') as any).delete().eq('id', id);
    await carregar();
  };

  const criarSinonimo = async () => {
    if (!novoSin.termo.trim() || !novoSin.canonico.trim()) return;
    setSalvando(true);
    try {
      const { error } = await (supabase.from('assistente_sinonimos') as any).insert([{
        termo: novoSin.termo.trim().toLowerCase(),
        canonico: novoSin.canonico.trim().toLowerCase(),
      }]);
      if (error) throw error;
      setNovoSin({ termo: '', canonico: '' });
      await carregar();
    } catch (e: any) {
      alert(e?.message || 'Erro ao salvar (termo já existe?).');
    } finally {
      setSalvando(false);
    }
  };

  const excluirSinonimo = async (id: string) => {
    await (supabase.from('assistente_sinonimos') as any).delete().eq('id', id);
    await carregar();
  };

  if (carregando) {
    return (
      <div className="flex items-center justify-center py-24 text-slate-400">
        <Loader2 size={28} className="animate-spin" />
      </div>
    );
  }

  const inputCls =
    'w-full rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition-all text-sm p-2.5';

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-11 h-11 rounded-2xl bg-blue-600 text-white flex items-center justify-center">
          <BookOpen size={22} />
        </div>
        <div>
          <h1 className="text-xl font-black text-slate-800 tracking-tight leading-none">
            Assistente IA — Base de Conhecimento
          </h1>
          <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-1">
            {faqs.length} respostas · {sinonimos.length} sinônimos
          </p>
        </div>
      </div>

      <div className="flex gap-2 mb-5">
        {(['faq', 'sinonimos'] as const).map((a) => (
          <button
            key={a}
            onClick={() => setAba(a)}
            className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${
              aba === a ? 'bg-blue-600 text-white shadow-md' : 'bg-white text-slate-500 border border-slate-200'
            }`}
          >
            {a === 'faq' ? 'Respostas' : 'Sinônimos'}
          </button>
        ))}
      </div>

      {aba === 'faq' ? (
        <>
          {/* nova resposta */}
          <div className="rounded-2xl border border-slate-200 bg-white p-5 mb-5 space-y-3">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Nova resposta</p>
            <input
              className={inputCls}
              placeholder="Título / pergunta-modelo (ex.: Falta de água na escola)"
              value={novo.pergunta_titulo}
              onChange={(e) => setNovo({ ...novo, pergunta_titulo: e.target.value })}
            />
            <textarea
              className={inputCls}
              rows={3}
              placeholder="Resposta que o assistente vai sugerir..."
              value={novo.corpo_resposta}
              onChange={(e) => setNovo({ ...novo, corpo_resposta: e.target.value })}
            />
            <input
              className={inputCls}
              placeholder="Palavras-chave separadas por vírgula (ex.: agua, sabesp, abastecimento)"
              value={novo.palavras_chave}
              onChange={(e) => setNovo({ ...novo, palavras_chave: e.target.value })}
            />
            <div className="flex items-center justify-between gap-3">
              <select
                className={inputCls + ' max-w-[180px]'}
                value={novo.escopo}
                onChange={(e) => setNovo({ ...novo, escopo: e.target.value })}
              >
                {ESCOPOS.map((x) => <option key={x} value={x}>{x}</option>)}
              </select>
              <button
                onClick={criarFaq}
                disabled={salvando || !novo.pergunta_titulo.trim() || !novo.corpo_resposta.trim()}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-600 text-white hover:bg-blue-700 text-xs font-black uppercase tracking-widest transition-all disabled:opacity-40"
              >
                <Plus size={14} /> Adicionar
              </button>
            </div>
          </div>

          {/* lista */}
          <div className="space-y-3">
            {faqs.map((f) => (
              <div key={f.id} className={`rounded-2xl border bg-white p-4 ${f.ativo ? 'border-slate-200' : 'border-slate-200 opacity-60'}`}>
                {editId === f.id ? (
                  <div className="space-y-3">
                    <input className={inputCls} value={edit.pergunta_titulo} onChange={(e) => setEdit({ ...edit, pergunta_titulo: e.target.value })} />
                    <textarea className={inputCls} rows={3} value={edit.corpo_resposta} onChange={(e) => setEdit({ ...edit, corpo_resposta: e.target.value })} />
                    <input className={inputCls} value={edit.palavras_chave} onChange={(e) => setEdit({ ...edit, palavras_chave: e.target.value })} />
                    <div className="flex items-center justify-between gap-3">
                      <select className={inputCls + ' max-w-[180px]'} value={edit.escopo} onChange={(e) => setEdit({ ...edit, escopo: e.target.value })}>
                        {ESCOPOS.map((x) => <option key={x} value={x}>{x}</option>)}
                      </select>
                      <div className="flex gap-2">
                        <button onClick={() => setEditId(null)} className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-100 text-slate-600 text-xs font-black uppercase tracking-widest">
                          <X size={14} /> Cancelar
                        </button>
                        <button onClick={salvarEdicao} disabled={salvando} className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-600 text-white text-xs font-black uppercase tracking-widest disabled:opacity-40">
                          <Save size={14} /> Salvar
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-slate-800">{f.pergunta_titulo}</p>
                        <p className="text-xs text-slate-500 mt-1 whitespace-pre-line">{f.corpo_resposta}</p>
                      </div>
                      <div className="flex gap-1 shrink-0">
                        <button onClick={() => alternarAtivo(f)} title={f.ativo ? 'Desativar' : 'Ativar'} className={`p-2 rounded-lg ${f.ativo ? 'text-emerald-600 hover:bg-emerald-50' : 'text-slate-400 hover:bg-slate-100'}`}>
                          <Power size={15} />
                        </button>
                        <button onClick={() => abrirEdicao(f)} className="p-2 rounded-lg text-slate-500 hover:bg-slate-100">
                          <Save size={15} />
                        </button>
                        <button onClick={() => excluirFaq(f.id)} className="p-2 rounded-lg text-red-500 hover:bg-red-50">
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      <span className="text-[9px] font-black uppercase tracking-wider bg-slate-100 text-slate-500 px-2 py-0.5 rounded">{f.escopo}</span>
                      {(f.palavras_chave || []).map((k) => (
                        <span key={k} className="text-[9px] bg-blue-50 text-blue-600 px-2 py-0.5 rounded">{k}</span>
                      ))}
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        </>
      ) : (
        <>
          <div className="rounded-2xl border border-slate-200 bg-white p-5 mb-5">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-3">Novo sinônimo</p>
            <div className="flex flex-wrap items-center gap-2">
              <input className={inputCls + ' flex-1 min-w-[140px]'} placeholder="termo escrito pelo usuário (ex.: luz)" value={novoSin.termo} onChange={(e) => setNovoSin({ ...novoSin, termo: e.target.value })} />
              <ArrowLeftRight size={16} className="text-slate-400" />
              <input className={inputCls + ' flex-1 min-w-[140px]'} placeholder="termo canônico da base (ex.: energia)" value={novoSin.canonico} onChange={(e) => setNovoSin({ ...novoSin, canonico: e.target.value })} />
              <button onClick={criarSinonimo} disabled={salvando} className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-600 text-white text-xs font-black uppercase tracking-widest disabled:opacity-40">
                <Plus size={14} /> Add
              </button>
            </div>
            <p className="text-[11px] text-slate-400 mt-2">
              Antes de procurar na base, o assistente troca <b>termo</b> por <b>canônico</b> na pergunta.
            </p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white divide-y divide-slate-100">
            {sinonimos.map((s) => (
              <div key={s.id} className="flex items-center gap-3 px-4 py-3 text-sm">
                <span className="font-bold text-slate-700">{s.termo}</span>
                <ArrowLeftRight size={13} className="text-slate-300" />
                <span className="text-slate-500 flex-1">{s.canonico}</span>
                <button onClick={() => excluirSinonimo(s.id)} className="p-1.5 rounded-lg text-red-500 hover:bg-red-50">
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
            {sinonimos.length === 0 && (
              <p className="px-4 py-6 text-center text-xs text-slate-400">Nenhum sinônimo cadastrado.</p>
            )}
          </div>
        </>
      )}
    </div>
  );
}

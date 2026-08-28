import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import {
  Bot, Loader2, Check, X, ChevronDown, MessageSquare, School as SchoolIcon, Sparkles,
} from 'lucide-react';

// Fila de validação do assistente de IA (retrieval puro, SEM tokens).
// Só o regional_admin aprova/rejeita; chefe_departamento enxerga em modo
// leitura. Ver migration 20260827000000_assistente_ia_retrieval.sql.

interface Pergunta {
  id: string;
  conversa_id: string;
  user_id: string;
  school_id: string | null;
  texto: string;
  status: string;
  rascunho_resposta: string | null;
  rascunho_score: number | null;
  rascunho_origem: 'faq' | 'intent' | null;
  criado_em: string;
}

interface MensagemCtx {
  id: string;
  autor: string;
  conteudo: string;
  criado_em: string;
}

function quando(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
  });
}

export default function AssistenteValidacao() {
  const [role, setRole] = useState<string>('');
  const [fila, setFila] = useState<Pergunta[]>([]);
  const [escolas, setEscolas] = useState<Map<string, string>>(new Map());
  const [usuarios, setUsuarios] = useState<Map<string, string>>(new Map());
  const [carregando, setCarregando] = useState(true);

  // estado por item
  const [rascunhos, setRascunhos] = useState<Record<string, string>>({});
  const [salvarFaq, setSalvarFaq] = useState<Record<string, boolean>>({});
  const [processando, setProcessando] = useState<string | null>(null);
  const [expandido, setExpandido] = useState<string | null>(null);
  const [contexto, setContexto] = useState<Record<string, MensagemCtx[]>>({});

  const somenteLeitura = role !== 'regional_admin';

  const carregar = useCallback(async () => {
    const { data: perg } = await (supabase.from('assistente_perguntas') as any)
      .select('*')
      .eq('status', 'pendente_validacao')
      .order('criado_em', { ascending: true });

    const lista = (perg || []) as Pergunta[];
    setFila(lista);
    setRascunhos((prev) => {
      const next = { ...prev };
      lista.forEach((p) => { if (next[p.id] === undefined) next[p.id] = p.rascunho_resposta || ''; });
      return next;
    });

    const schoolIds = [...new Set(lista.map((p) => p.school_id).filter(Boolean))] as string[];
    const userIds = [...new Set(lista.map((p) => p.user_id))];
    if (schoolIds.length) {
      const { data: sc } = await (supabase.from('schools') as any).select('id, name').in('id', schoolIds);
      if (sc) setEscolas(new Map((sc as any[]).map((s) => [s.id, s.name])));
    }
    if (userIds.length) {
      const { data: pf } = await (supabase.from('profiles') as any).select('id, full_name').in('id', userIds);
      if (pf) setUsuarios(new Map((pf as any[]).map((p) => [p.id, p.full_name])));
    }
  }, []);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: p } = await (supabase.from('profiles') as any).select('role').eq('id', user.id).single();
        setRole((p as any)?.role || '');
      }
      await carregar();
      setCarregando(false);
    })();
  }, [carregar]);

  useEffect(() => {
    const canal = supabase
      .channel('assistente-validacao')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'assistente_perguntas' }, carregar)
      .subscribe();
    return () => { supabase.removeChannel(canal); };
  }, [carregar]);

  const abrirContexto = async (p: Pergunta) => {
    if (expandido === p.id) { setExpandido(null); return; }
    setExpandido(p.id);
    if (!contexto[p.id]) {
      const { data } = await (supabase.from('assistente_mensagens') as any)
        .select('id, autor, conteudo, criado_em')
        .eq('conversa_id', p.conversa_id)
        .order('criado_em', { ascending: true });
      if (data) setContexto((prev) => ({ ...prev, [p.id]: data as MensagemCtx[] }));
    }
  };

  const validar = async (p: Pergunta, aprovar: boolean) => {
    const resposta = (rascunhos[p.id] || '').trim();
    if (aprovar && !resposta) { alert('Escreva a resposta antes de aprovar.'); return; }
    if (!aprovar && !window.confirm('Rejeitar esta pergunta? O usuário não receberá resposta automática.')) return;

    setProcessando(p.id);
    try {
      const { error } = await (supabase.rpc as any)('assistente_validar', {
        p_pergunta_id: p.id,
        p_resposta_final: resposta,
        p_aprovar: aprovar,
        p_salvar_faq: aprovar && !!salvarFaq[p.id],
      });
      if (error) throw error;
      setFila((prev) => prev.filter((x) => x.id !== p.id));
    } catch (err: any) {
      console.error('Erro ao validar:', err);
      alert(err?.message || 'Não foi possível concluir a ação.');
    } finally {
      setProcessando(null);
    }
  };

  if (carregando) {
    return (
      <div className="flex items-center justify-center py-24 text-slate-400">
        <Loader2 size={28} className="animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-11 h-11 rounded-2xl bg-blue-600 text-white flex items-center justify-center">
          <Bot size={22} />
        </div>
        <div>
          <h1 className="text-xl font-black text-slate-800 tracking-tight leading-none">
            Assistente IA — Validação
          </h1>
          <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-1">
            {fila.length} pergunta{fila.length !== 1 ? 's' : ''} aguardando
          </p>
        </div>
      </div>

      {somenteLeitura && (
        <div className="mb-4 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-xs font-bold px-4 py-3">
          Modo somente leitura — apenas o Administrador Regional pode aprovar ou rejeitar.
        </div>
      )}

      {fila.length === 0 ? (
        <div className="rounded-2xl border border-slate-100 bg-white py-16 text-center text-slate-400">
          <Check size={34} className="mx-auto mb-3 text-emerald-400" />
          <p className="text-sm font-bold text-slate-500">Nenhuma pergunta pendente.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {fila.map((p) => {
            const score = p.rascunho_score ?? 0;
            const temRascunho = !!p.rascunho_resposta;
            return (
              <div key={p.id} className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
                <div className="px-5 pt-4 pb-3 border-b border-slate-100">
                  <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">
                    <SchoolIcon size={12} />
                    {p.school_id ? escolas.get(p.school_id) || 'Escola' : 'Sem escola'}
                    <span className="text-slate-300">•</span>
                    {usuarios.get(p.user_id) || 'Usuário'}
                    <span className="text-slate-300">•</span>
                    {quando(p.criado_em)}
                  </div>
                  <p className="text-sm font-bold text-slate-800">{p.texto}</p>

                  <button
                    onClick={() => abrirContexto(p)}
                    className="mt-2 inline-flex items-center gap-1.5 text-[11px] font-bold text-slate-500 hover:text-blue-600 transition-colors"
                  >
                    <MessageSquare size={12} />
                    Ver conversa
                    <ChevronDown size={12} className={expandido === p.id ? 'rotate-180 transition-transform' : 'transition-transform'} />
                  </button>

                  {expandido === p.id && (
                    <div className="mt-3 rounded-xl bg-slate-50 border border-slate-100 p-3 space-y-2 max-h-56 overflow-y-auto">
                      {(contexto[p.id] || []).map((m) => (
                        <div key={m.id} className="text-xs">
                          <span className="font-black uppercase tracking-wider text-[9px] text-slate-400">
                            {m.autor}
                          </span>
                          <p className="text-slate-600 whitespace-pre-line">{m.conteudo}</p>
                        </div>
                      ))}
                      {(contexto[p.id] || []).length === 0 && (
                        <p className="text-xs text-slate-400">Sem histórico.</p>
                      )}
                    </div>
                  )}
                </div>

                <div className="px-5 py-4">
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                      Resposta ao usuário
                    </label>
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                        !temRascunho
                          ? 'bg-slate-100 text-slate-500'
                          : p.rascunho_origem === 'intent'
                          ? 'bg-blue-50 text-blue-600'
                          : score >= 0.6
                          ? 'bg-emerald-50 text-emerald-600'
                          : 'bg-amber-50 text-amber-600'
                      }`}
                    >
                      {!temRascunho
                        ? 'Sem sugestão — escreva manualmente'
                        : p.rascunho_origem === 'intent'
                        ? 'Dado ao vivo da escola'
                        : `Sugestão da base · score ${score.toFixed(2)}`}
                    </span>
                  </div>

                  <textarea
                    value={rascunhos[p.id] ?? ''}
                    onChange={(e) => setRascunhos((prev) => ({ ...prev, [p.id]: e.target.value }))}
                    disabled={somenteLeitura}
                    rows={4}
                    placeholder="Escreva a resposta que será enviada à escola..."
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition-all text-sm p-3 disabled:opacity-60"
                  />

                  <div className="flex flex-wrap items-center justify-between gap-3 mt-3">
                    <label className="flex items-center gap-2 text-xs font-bold text-slate-500 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={!!salvarFaq[p.id]}
                        onChange={(e) => setSalvarFaq((prev) => ({ ...prev, [p.id]: e.target.checked }))}
                        disabled={somenteLeitura}
                        className="rounded border-slate-300"
                      />
                      <Sparkles size={13} className="text-amber-500" />
                      Salvar na base de conhecimento
                    </label>

                    <div className="flex gap-2">
                      <button
                        onClick={() => validar(p, false)}
                        disabled={somenteLeitura || processando === p.id}
                        className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-red-50 text-red-600 border border-red-200 hover:bg-red-600 hover:text-white text-xs font-black uppercase tracking-widest transition-all disabled:opacity-40"
                      >
                        <X size={14} /> Rejeitar
                      </button>
                      <button
                        onClick={() => validar(p, true)}
                        disabled={somenteLeitura || processando === p.id}
                        className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-600 text-white hover:bg-blue-700 text-xs font-black uppercase tracking-widest transition-all shadow-md shadow-blue-600/20 disabled:opacity-40"
                      >
                        {processando === p.id ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                        Aprovar e enviar
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

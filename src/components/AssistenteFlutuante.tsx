import React, { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { Bot, X, Send, Loader2, Clock } from 'lucide-react';

// Assistente de IA (retrieval puro, SEM tokens). O usuário de escola
// (school_manager) manda perguntas; a resposta só aparece aqui depois que o
// regional_admin valida na fila (ver src/pages/AssistenteValidacao.tsx e a
// migration 20260827000000_assistente_ia_retrieval.sql).

interface Mensagem {
  id: string;
  conversa_id: string;
  autor: 'usuario' | 'assistente' | 'admin' | 'sistema';
  conteudo: string;
  criado_em: string;
}

interface MinhaPergunta {
  id: string;
  texto: string;
  status: 'pendente_validacao' | 'aprovada' | 'rejeitada';
  criado_em: string;
}

function hora(iso: string): string {
  return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

export default function AssistenteFlutuante() {
  const [aberto, setAberto] = useState(false);
  const [conversaId, setConversaId] = useState<string | null>(null);
  const [mensagens, setMensagens] = useState<Mensagem[]>([]);
  const [pendentes, setPendentes] = useState<MinhaPergunta[]>([]);
  const [texto, setTexto] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const fimRef = useRef<HTMLDivElement>(null);

  const carregarMensagens = useCallback(async (cid: string) => {
    const { data } = await (supabase.from('assistente_mensagens') as any)
      .select('*')
      .eq('conversa_id', cid)
      .order('criado_em', { ascending: true });
    if (data) setMensagens(data as Mensagem[]);
  }, []);

  const carregarPendentes = useCallback(async () => {
    const { data } = await (supabase.from('assistente_minhas_perguntas') as any)
      .select('*')
      .order('criado_em', { ascending: true });
    if (data) setPendentes((data as MinhaPergunta[]).filter((p) => p.status === 'pendente_validacao'));
  }, []);

  const iniciarConversa = useCallback(async (): Promise<string | null> => {
    setCarregando(true);
    setErro(null);
    try {
      const { data, error } = await (supabase.rpc as any)('assistente_iniciar_conversa');
      if (error) throw error;
      const cid = data as string;
      setConversaId(cid);
      await Promise.all([carregarMensagens(cid), carregarPendentes()]);
      return cid;
    } catch (e: any) {
      console.error('Erro ao iniciar assistente:', e);
      setErro(e?.message || 'Não foi possível abrir o assistente agora.');
      return null;
    } finally {
      setCarregando(false);
    }
  }, [carregarMensagens, carregarPendentes]);

  // Abre (ou reaproveita) a conversa no primeiro clique.
  useEffect(() => {
    if (!aberto || conversaId) return;
    iniciarConversa();
  }, [aberto, conversaId, iniciarConversa]);

  // Realtime: resposta aprovada cai aqui na hora.
  useEffect(() => {
    if (!conversaId) return;
    const canal = supabase
      .channel(`assistente-${conversaId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'assistente_mensagens', filter: `conversa_id=eq.${conversaId}` },
        (payload: any) => {
          const nova = payload.new as Mensagem;
          setMensagens((prev) => (prev.some((m) => m.id === nova.id) ? prev : [...prev, nova]));
          if (nova.autor !== 'usuario') carregarPendentes();
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(canal); };
  }, [conversaId, carregarPendentes]);

  useEffect(() => {
    fimRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [mensagens, pendentes, aberto]);

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    const pergunta = texto.trim();
    if (!pergunta || enviando || carregando) return;
    setEnviando(true);
    setTexto('');
    setErro(null);
    try {
      let cid = conversaId;
      if (!cid) {
        cid = await iniciarConversa();
        if (!cid) throw new Error('Sem conversa ativa.');
      }
      const { error } = await (supabase.rpc as any)('assistente_perguntar', {
        p_conversa_id: cid,
        p_texto: pergunta,
      });
      if (error) throw error;
      await Promise.all([carregarMensagens(cid), carregarPendentes()]);
    } catch (err: any) {
      console.error('Erro ao enviar pergunta:', err);
      setTexto(pergunta);
      setErro(err?.message || 'Não foi possível enviar a pergunta. Tente novamente.');
    } finally {
      setEnviando(false);
    }
  };

  return (
    <>
      {/* Botão flutuante — acima do botão de acesso público (bottom-6) */}
      <button
        onClick={() => setAberto((v) => !v)}
        title="Assistente"
        className="fixed bottom-28 right-6 z-50 w-14 h-14 rounded-full bg-blue-600 text-white shadow-xl hover:shadow-2xl hover:scale-110 transition-all duration-200 flex items-center justify-center print:hidden"
      >
        {aberto ? <X size={24} /> : <Bot size={26} />}
        {!aberto && pendentes.length > 0 && (
          <span className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-amber-500 text-[10px] font-bold text-white ring-2 ring-white">
            {pendentes.length}
          </span>
        )}
      </button>

      {aberto && (
        <div className="fixed bottom-44 right-6 z-50 w-[calc(100vw-3rem)] max-w-sm h-[70vh] max-h-[560px] bg-white rounded-3xl shadow-2xl border border-slate-200 flex flex-col overflow-hidden print:hidden animate-in fade-in slide-in-from-bottom-4 duration-200">
          {/* header */}
          <div className="bg-[#0B1120] text-white px-5 py-4 flex items-center gap-3 shrink-0">
            <div className="w-9 h-9 rounded-xl bg-blue-600 flex items-center justify-center">
              <Bot size={20} />
            </div>
            <div className="min-w-0">
              <p className="font-black text-sm tracking-tight leading-none">Assistente</p>
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1">
                Respostas validadas pela regional
              </p>
            </div>
          </div>

          {/* mensagens */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-[#f8fafc]">
            {carregando ? (
              <div className="h-full flex items-center justify-center text-slate-400">
                <Loader2 size={22} className="animate-spin" />
              </div>
            ) : mensagens.length === 0 && pendentes.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center text-slate-400 px-4">
                <Bot size={36} className="mb-3 opacity-30" />
                <p className="text-sm font-bold text-slate-500">Como posso ajudar?</p>
                <p className="text-xs mt-1 leading-snug">
                  Escreva sua dúvida sobre o sistema ou sobre a sua escola. A regional revisa
                  antes de te responder.
                </p>
              </div>
            ) : (
              <>
                {mensagens.map((m) => {
                  const minha = m.autor === 'usuario';
                  return (
                    <div key={m.id} className={`flex ${minha ? 'justify-end' : 'justify-start'}`}>
                      <div
                        className={`max-w-[80%] rounded-2xl px-3.5 py-2.5 shadow-sm text-sm leading-relaxed whitespace-pre-line ${
                          minha
                            ? 'bg-blue-600 text-white rounded-tr-sm'
                            : m.autor === 'sistema'
                            ? 'bg-amber-50 text-amber-800 border border-amber-200 text-xs'
                            : 'bg-white text-slate-700 border border-slate-100 rounded-tl-sm'
                        }`}
                      >
                        {m.conteudo}
                        <div className={`text-[9px] font-bold mt-1 ${minha ? 'text-blue-200 text-right' : 'text-slate-400'}`}>
                          {hora(m.criado_em)}
                        </div>
                      </div>
                    </div>
                  );
                })}

                {pendentes.map((p) => (
                  <div key={p.id} className="flex justify-start">
                    <div className="max-w-[80%] rounded-2xl rounded-tl-sm px-3.5 py-2.5 bg-white border border-dashed border-slate-300 text-xs text-slate-500 flex items-center gap-2">
                      <Clock size={13} className="shrink-0 text-amber-500" />
                      Sua pergunta foi enviada e está aguardando validação da regional.
                    </div>
                  </div>
                ))}
              </>
            )}
            <div ref={fimRef} />
          </div>

          {/* input */}
          <div className="border-t border-slate-200 bg-white shrink-0">
            {erro && (
              <div className="px-3 pt-2 flex items-center justify-between gap-2">
                <p className="text-[11px] text-red-600 font-medium leading-snug">{erro}</p>
                <button
                  type="button"
                  onClick={() => iniciarConversa()}
                  className="text-[11px] font-bold text-blue-600 hover:underline shrink-0"
                >
                  Tentar de novo
                </button>
              </div>
            )}
            <form onSubmit={enviar} className="p-3 flex gap-2">
              <input
                type="text"
                value={texto}
                onChange={(e) => setTexto(e.target.value)}
                placeholder="Digite sua dúvida..."
                disabled={enviando || carregando}
                className="flex-1 px-3.5 py-2.5 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition-all text-sm disabled:opacity-50"
              />
              <button
                type="submit"
                disabled={!texto.trim() || enviando || carregando}
                className="bg-blue-600 text-white w-11 rounded-xl flex items-center justify-center hover:bg-blue-700 disabled:opacity-40 transition-all shrink-0"
              >
                {enviando ? <Loader2 size={17} className="animate-spin" /> : <Send size={17} />}
              </button>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

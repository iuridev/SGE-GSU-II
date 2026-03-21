import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { MANUAL_DO_SISTEMA } from '../lib/manualIA';
import { Loader2, History, MessageSquare } from 'lucide-react';

const apiKey = import.meta.env.VITE_GEMINI_API_KEY || 'AIzaSyAmusJrD2DZqUPduwGpF7yjSD6bxVLH6iM';
const genAI = new GoogleGenerativeAI(apiKey);

export interface Profile {
  id: string;
  full_name: string;
  role: string;
  setor?: string;
  school_id?: string;
}

export interface Mensagem {
  id: string;
  conversa_id: string;
  sender_id: string;
  content: string;
  is_read?: boolean;
  created_at: string;
}

export interface Conversa {
  id: string;
  protocolo: string;
  status: string;
  participante1_id: string;
  participante2_id: string;
}

interface ContatoRenderizado extends Profile {
  conversaAberta?: Conversa;
  mensagensNaoLidas: number;
}

export default function Chat() {
  const [currentUser, setCurrentUser] = useState<Profile | null>(null);
  const [contatos, setContatos] = useState<ContatoRenderizado[]>([]);
  const [mensagens, setMensagens] = useState<Mensagem[]>([]);
  
  const [todasConversas, setTodasConversas] = useState<Conversa[]>([]);
  const [todasMensagensNaoLidas, setTodasMensagensNaoLidas] = useState<Mensagem[]>([]);
  
  const [contatoAtivo, setContatoAtivo] = useState<Profile | null>(null);
  const [conversaAtivaId, setConversaAtivaId] = useState<string | null>(null);
  const [protocoloAtual, setProtocoloAtual] = useState<string | null>(null);
  const [statusConversa, setStatusConversa] = useState<string>('');
  const [novaMensagem, setNovaMensagem] = useState<string>('');
  
  const [carregandoIA, setCarregandoIA] = useState<boolean>(false);
  const [carregandoHistorico, setCarregandoHistorico] = useState<boolean>(false);
  const [showingHistory, setShowingHistory] = useState<boolean>(false);
  
  const mensagensFimRef = useRef<HTMLDivElement>(null);

  // 1. Carrega Utilizador e Dados Globais (CORRIGIDO ERRO 400)
  useEffect(() => {
    async function carregarDadosIniciais() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: perfilData } = await supabase.from('profiles').select('*').eq('id', user.id).single();
      const perfil = perfilData as unknown as Profile;
      setCurrentUser(perfil);

      // Removemos o order e limit que causavam o erro na tabela conversas
      let queryConvs = supabase.from('conversas').select('*');
      
      if (perfil.role !== 'regional_admin') {
         queryConvs = queryConvs.or(`participante1_id.eq.${user.id},participante2_id.eq.${user.id}`);
      }
      
      const { data: convsData } = await queryConvs as any;
      const conversas = (convsData || []) as Conversa[];
      setTodasConversas(conversas);

      if (conversas.length > 0) {
        const convIds = conversas.map(c => c.id);
        const { data: naoLidasData } = await (supabase.from('messages') as any)
          .select('*')
          .in('conversa_id', convIds)
          .eq('is_read', false)
          .neq('sender_id', user.id);
        
        if (naoLidasData) setTodasMensagensNaoLidas(naoLidasData as Mensagem[]);
      }
    }
    carregarDadosIniciais();
  }, []);

  // 2. Carrega Contactos e Associa Conversas
  useEffect(() => {
    async function fetchContatos() {
      if (!currentUser) return;
      
      let query = supabase.from('profiles').select('id, full_name, role, setor, school_id');
      if (currentUser.role === 'regional_admin') {
        query = query.or('school_id.not.is.null,setor.not.is.null');
      } else {
        query = query.not('setor', 'is', null);
      }

      const { data, error } = await query;
      if (!error && data) {
        const baseContatos = data.filter((c: any) => c.id !== currentUser.id) as unknown as Profile[];
        
        let contatosMapeados: ContatoRenderizado[] = baseContatos.map(contato => {
          const conversasDoContato = todasConversas.filter(c => c.participante1_id === contato.id || c.participante2_id === contato.id);
          
          let conversaVisivel = conversasDoContato.find(c => c.status === 'aberta');
          if (!conversaVisivel) {
             conversaVisivel = conversasDoContato.find(c => todasMensagensNaoLidas.some(m => m.conversa_id === c.id));
          }

          const naoLidasCount = todasMensagensNaoLidas.filter(m => conversaVisivel && m.conversa_id === conversaVisivel.id).length;
          
          return { ...contato, conversaAberta: conversaVisivel, mensagensNaoLidas: naoLidasCount };
        });

        contatosMapeados = contatosMapeados.sort((a, b) => {
          if (a.mensagensNaoLidas > 0 && b.mensagensNaoLidas === 0) return -1;
          if (a.mensagensNaoLidas === 0 && b.mensagensNaoLidas > 0) return 1;
          if (a.conversaAberta && !b.conversaAberta) return -1;
          if (!a.conversaAberta && b.conversaAberta) return 1;
          return 0;
        });

        setContatos(contatosMapeados);
      }
    }
    fetchContatos();
  }, [currentUser, todasConversas, todasMensagensNaoLidas]);

  // 3. Abrir Conversa
  const abrirConversa = async (contato: ContatoRenderizado) => {
    setContatoAtivo(contato);
    setMensagens([]);
    setConversaAtivaId(null); 
    setProtocoloAtual('Nova Conversa (A aguardar envio)');
    setStatusConversa('aberta');
    setShowingHistory(false); 

    if (!currentUser) return;

    if (contato.conversaAberta) {
      setConversaAtivaId(contato.conversaAberta.id);
      setProtocoloAtual(contato.conversaAberta.status === 'concluido' ? `${contato.conversaAberta.protocolo} (CONCLUÍDO)` : contato.conversaAberta.protocolo);
      setStatusConversa(contato.conversaAberta.status);
      carregarMensagens(contato.conversaAberta.id);

      if (contato.mensagensNaoLidas > 0) {
        await (supabase.from('messages') as any).update({ is_read: true }).eq('conversa_id', contato.conversaAberta.id).neq('sender_id', currentUser.id);
        setTodasMensagensNaoLidas(prev => prev.filter(m => m.conversa_id !== contato.conversaAberta?.id));
      }
    }
  };

  const carregarMensagens = async (conversaId: string) => {
    // A tabela messages tem created_at, então aqui não tem problema ordenar
    const { data } = await (supabase.from('messages') as any).select('*').eq('conversa_id', conversaId).order('created_at', { ascending: true });
    if (data) setMensagens(data as unknown as Mensagem[]);
  };

  // 4. CARREGAR HISTÓRICO COMPLETO (On-Demand)
  const carregarHistorico = async () => {
    if (!currentUser || !contatoAtivo) return;
    setCarregandoHistorico(true);

    try {
      let queryHist = supabase.from('conversas').select('id');
      
      if (currentUser.role === 'regional_admin') {
        queryHist = queryHist.or(`participante1_id.eq.${contatoAtivo.id},participante2_id.eq.${contatoAtivo.id}`);
      } else {
        queryHist = queryHist.or(`and(participante1_id.eq.${currentUser.id},participante2_id.eq.${contatoAtivo.id}),and(participante1_id.eq.${contatoAtivo.id},participante2_id.eq.${currentUser.id})`);
      }

      const { data: convs } = await queryHist as any;

      if (convs && convs.length > 0) {
        const convIds = convs.map((c: any) => c.id);
        const { data: msgs } = await (supabase.from('messages') as any)
          .select('*')
          .in('conversa_id', convIds)
          .order('created_at', { ascending: true });

        if (msgs) {
          setMensagens(msgs as unknown as Mensagem[]);
          setShowingHistory(true);
        }
      }
    } catch (error) {
      console.error("Erro ao carregar histórico:", error);
    } finally {
      setCarregandoHistorico(false);
    }
  };

  // 5. Realtime Global
  useEffect(() => {
    if (!currentUser) return;

    const canal = supabase
      .channel('mensagens-globais')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, 
      (payload: any) => { 
        const novaMsg = payload.new as Mensagem; 
        
        if (conversaAtivaId && novaMsg.conversa_id === conversaAtivaId) {
          setMensagens((prev) => {
            if (prev.find(m => m.id === novaMsg.id)) return prev;
            return [...prev, novaMsg];
          });
          
          if (novaMsg.sender_id !== currentUser.id) {
             (supabase.from('messages') as any).update({ is_read: true }).eq('id', novaMsg.id).then();
          }
        } else if (novaMsg.sender_id !== currentUser.id) {
          const ehMinhaConversa = currentUser.role === 'regional_admin' || todasConversas.some(c => c.id === novaMsg.conversa_id);
          if (ehMinhaConversa) {
             setTodasMensagensNaoLidas(prev => [...prev, novaMsg]);
          }
        }
      }).subscribe();

    return () => { supabase.removeChannel(canal); };
  }, [conversaAtivaId, currentUser, todasConversas]);

  useEffect(() => {
    mensagensFimRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [mensagens]);

  // 6. INTELIGÊNCIA ARTIFICIAL
  const sugerirRespostaIA = async () => {
    if (mensagens.length === 0) return;
    setCarregandoIA(true);
    try {
      const ultimasMensagens = mensagens.slice(-5).map(m => {
        const quem = m.sender_id === currentUser?.id ? "Administrador" : "Escola";
        return `${quem}: ${m.content}`;
      }).join("\n");

      const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
      const prompt = `${MANUAL_DO_SISTEMA}\n\nHistórico da conversa atual:\n${ultimasMensagens}\n\nSua sugestão de resposta:`;

      const result = await model.generateContent(prompt);
      setNovaMensagem(result.response.text().trim());

    } catch (error) {
      console.error("Erro no Gemini:", error);
    } finally {
      setCarregandoIA(false);
    }
  };
  
  // 7. ENVIAR MENSAGEM
  const enviarMensagem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!novaMensagem.trim() || !currentUser || !contatoAtivo) return;
    if (statusConversa === 'concluido') {
        alert("Este atendimento já foi concluído. Selecione o contato novamente para gerar um novo protocolo.");
        return;
    }

    const textoMensagem = novaMensagem;
    setNovaMensagem(''); 

    let idDaConversaAtual = conversaAtivaId;

    if (!idDaConversaAtual) {
      const setorContato = contatoAtivo.setor || currentUser.setor || 'GERAL';
      const { data: novaConversa, error: erroCriar } = await (supabase.rpc as any)('iniciar_conversa', {
        p_participante1: currentUser.id,
        p_participante2: contatoAtivo.id,
        p_setor: setorContato
      });

      if (erroCriar) { alert("Erro ao gerar protocolo!"); return; }

      const nova = (Array.isArray(novaConversa) ? novaConversa[0] : novaConversa) as Conversa;
      idDaConversaAtual = nova.id;
      
      setConversaAtivaId(nova.id);
      setProtocoloAtual(nova.protocolo);
      setStatusConversa('aberta');
      setTodasConversas(prev => [...prev, nova]);
    }

    const { data: msgInserida, error } = await (supabase.from('messages') as any).insert([{
      conversa_id: idDaConversaAtual,
      sender_id: currentUser.id,
      content: textoMensagem,
      is_read: false 
    }]).select().single();

    if (!error && msgInserida) {
      setMensagens((prev) => {
        if (prev.find(m => m.id === msgInserida.id)) return prev;
        return [...prev, msgInserida as Mensagem];
      });
    }
  };

  // 8. FINALIZAR CONVERSA
  const finalizarAtendimento = async () => {
    if (!conversaAtivaId || !currentUser) return;
    const confirmar = window.confirm("Deseja realmente finalizar este atendimento?");
    if (!confirmar) return;

    const { error } = await (supabase.from('conversas') as any).update({ status: 'concluido' }).eq('id', conversaAtivaId);

    if (!error) {
      await (supabase.from('messages') as any).insert([{
        conversa_id: conversaAtivaId,
        sender_id: currentUser.id,
        content: "⚠️ Este atendimento foi finalizado pelo administrador.",
        is_read: false
      }]);

      setStatusConversa('concluido');
      setProtocoloAtual(`${protocoloAtual} (CONCLUÍDO)`);
    }
  };

  return (
    <div className="flex h-[85vh] bg-white rounded-3xl overflow-hidden shadow-xl border border-slate-100">
      
      {/* BARRA LATERAL */}
      <div className="w-1/3 bg-slate-50 border-r border-slate-200 flex flex-col">
        <div className="p-6 bg-slate-900 text-white font-black text-lg tracking-tight">
          Atendimentos
        </div>
        <div className="overflow-y-auto flex-1 custom-scrollbar">
          {contatos.map((contato) => (
            <div 
              key={contato.id} 
              onClick={() => abrirConversa(contato)} 
              className={`p-5 border-b border-slate-100 cursor-pointer transition-all flex items-center justify-between ${contatoAtivo?.id === contato.id ? 'bg-white border-l-4 border-blue-600 shadow-sm' : 'hover:bg-white'}`}
            >
              <div>
                <p className="font-bold text-slate-800 text-sm truncate max-w-[200px]">{contato.full_name}</p>
                <div className="flex items-center gap-2 mt-1.5">
                   <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">{contato.setor ? `Setor: ${contato.setor}` : 'Escola'}</p>
                   {contato.conversaAberta && (
                     <span className={`text-[9px] px-2 py-0.5 rounded-md font-mono font-bold tracking-tight ${contato.conversaAberta.status === 'concluido' ? 'bg-slate-200 text-slate-500' : 'bg-orange-100 text-orange-700'}`}>
                       {contato.conversaAberta.protocolo}
                     </span>
                   )}
                </div>
              </div>

              {contato.mensagensNaoLidas > 0 && (
                <div className="bg-red-500 text-white text-[10px] font-black w-6 h-6 flex items-center justify-center rounded-full shadow-md animate-pulse shrink-0">
                  {contato.mensagensNaoLidas}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* ÁREA DO CHAT */}
      <div className="w-2/3 flex flex-col bg-[#f8fafc] relative">
        {contatoAtivo ? (
          <>
            <div className="p-6 bg-white border-b border-slate-200 flex justify-between items-center shadow-sm z-10 shrink-0">
              <div>
                <h2 className="text-lg font-black text-slate-800 tracking-tight">{contatoAtivo.full_name}</h2>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-0.5">{contatoAtivo.setor || 'Utilizador da Escola'}</p>
              </div>
              
              <div className="flex items-center gap-3">
                {currentUser?.role === 'regional_admin' && conversaAtivaId && !showingHistory && (
                  <button 
                    onClick={carregarHistorico} 
                    disabled={carregandoHistorico}
                    className="flex items-center gap-2 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg text-xs font-bold transition-colors"
                  >
                    {carregandoHistorico ? <Loader2 size={14} className="animate-spin" /> : <History size={14} />}
                    Ver Histórico
                  </button>
                )}

                <div className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold tracking-tight border ${statusConversa === 'aberta' ? 'bg-orange-50 text-orange-700 border-orange-200' : 'bg-slate-100 text-slate-500 border-slate-200'}`}>
                  {protocoloAtual}
                </div>
                
                {conversaAtivaId && statusConversa === 'aberta' && currentUser && (currentUser.role === 'regional_admin' || currentUser.setor) && (
                  <button onClick={finalizarAtendimento} className="bg-red-50 text-red-600 border border-red-200 hover:bg-red-600 hover:text-white text-xs px-4 py-1.5 rounded-lg font-black uppercase tracking-widest transition-all">
                    Finalizar
                  </button>
                )}
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-6 bg-[#f0f4f8] space-y-4 custom-scrollbar">
              {showingHistory && mensagens.length > 0 && (
                 <div className="text-center my-4">
                    <span className="text-[10px] font-black uppercase tracking-widest bg-slate-200 text-slate-500 px-3 py-1 rounded-full">Início do Histórico</span>
                 </div>
              )}
              
              {mensagens.map((msg) => {
                const isMine = msg.sender_id === currentUser?.id;
                const isSystemMessage = msg.content.startsWith("⚠️");

                if (isSystemMessage) {
                   return (
                     <div key={msg.id} className="flex justify-center my-6">
                        <div className="bg-amber-100/80 text-amber-800 text-[11px] px-6 py-2 rounded-full font-black uppercase tracking-widest shadow-sm text-center border border-amber-200">
                          {msg.content}
                        </div>
                     </div>
                   )
                }

                return (
                  <div key={msg.id} className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[75%] rounded-2xl p-4 shadow-sm relative ${isMine ? 'bg-blue-600 text-white rounded-tr-sm' : 'bg-white text-slate-700 border border-slate-100 rounded-tl-sm'}`}>
                      <p className="text-sm whitespace-pre-line leading-relaxed font-medium">{msg.content}</p>
                      
                      <div className={`flex justify-end items-center gap-1 mt-2 ${isMine ? 'text-blue-200' : 'text-slate-400'}`}>
                        <span className="text-[9px] font-bold tracking-wider">
                          {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                        {isMine && (
                          <span className={msg.is_read ? "text-blue-200" : "text-blue-400/50"}>
                             <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
              <div ref={mensagensFimRef} />
            </div>

            <div className="p-4 bg-white border-t border-slate-200 shrink-0">
              <form onSubmit={enviarMensagem} className="flex gap-3">
                {currentUser?.role === 'regional_admin' && mensagens.length > 0 && statusConversa !== 'concluido' && (
                  <button 
                    type="button" 
                    onClick={sugerirRespostaIA}
                    disabled={carregandoIA}
                    className="bg-purple-50 text-purple-600 border border-purple-200 px-4 py-2 rounded-xl font-black text-xs uppercase tracking-widest hover:bg-purple-600 hover:text-white transition-all flex items-center gap-2 disabled:opacity-50"
                  >
                    {carregandoIA ? <Loader2 size={16} className="animate-spin"/> : '✨ IA'}
                  </button>
                )}

                <input
                  type="text"
                  value={novaMensagem}
                  onChange={(e) => setNovaMensagem(e.target.value)}
                  placeholder={statusConversa === 'concluido' ? "Atendimento finalizado..." : "Digite sua mensagem..."}
                  disabled={statusConversa === 'concluido'}
                  className="flex-1 p-4 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition-all disabled:opacity-50 font-medium text-sm"
                />
                <button 
                  type="submit" 
                  disabled={!novaMensagem.trim() || statusConversa === 'concluido'} 
                  className="bg-blue-600 text-white px-8 py-4 rounded-xl font-black uppercase tracking-widest text-xs hover:bg-blue-700 disabled:opacity-50 transition-all shadow-md shadow-blue-600/20"
                >
                  Enviar
                </button>
              </form>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center bg-[#f8fafc] text-slate-400 flex-col">
            <div className="w-24 h-24 bg-white rounded-full flex items-center justify-center shadow-sm border border-slate-100 mb-4">
              <MessageSquare size={40} className="text-slate-300" />
            </div>
            <p className="text-lg font-black tracking-tight text-slate-500">Nenhum chat selecionado</p>
            <p className="text-xs font-bold uppercase tracking-widest mt-2 opacity-50">Selecione um contato na lateral para iniciar</p>
          </div>
        )}
      </div>
    </div>
  );
}
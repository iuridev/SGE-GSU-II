import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { GoogleGenerativeAI } from '@google/generative-ai'; // IMPORTAÇÃO DA IA
import { MANUAL_DO_SISTEMA } from '../lib/manualIA';

// Configuração segura da Chave da API (Busca do arquivo .env)
const apiKey = import.meta.env.VITE_GEMINI_API_KEY || 'AIzaSyAmusJrD2DZqUPduwGpF7yjSD6bxVLH6iM';
const genAI = new GoogleGenerativeAI(apiKey);

// Interfaces
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
  
  const [todasConversasAbertas, setTodasConversasAbertas] = useState<Conversa[]>([]);
  const [todasMensagensNaoLidas, setTodasMensagensNaoLidas] = useState<Mensagem[]>([]);
  
  const [contatoAtivo, setContatoAtivo] = useState<Profile | null>(null);
  const [conversaAtivaId, setConversaAtivaId] = useState<string | null>(null);
  const [protocoloAtual, setProtocoloAtual] = useState<string | null>(null);
  const [statusConversa, setStatusConversa] = useState<string>('');
  const [novaMensagem, setNovaMensagem] = useState<string>('');
  
  // Estado de carregamento da IA
  const [carregandoIA, setCarregandoIA] = useState<boolean>(false);
  
  const mensagensFimRef = useRef<HTMLDivElement>(null);

  // 1. Carrega Utilizador e Dados Globais
  useEffect(() => {
    async function carregarDadosIniciais() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: perfilData } = await supabase.from('profiles').select('*').eq('id', user.id).single();
      const perfil = perfilData as unknown as Profile;
      setCurrentUser(perfil);

      const { data: convsData } = await (supabase.from('conversas') as any)
        .select('*')
        .eq('status', 'aberta')
        .or(`participante1_id.eq.${user.id},participante2_id.eq.${user.id}`);
      
      const conversas = (convsData || []) as Conversa[];
      setTodasConversasAbertas(conversas);

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

  // 2. Carrega Contactos
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
          const conversa = todasConversasAbertas.find(c => c.participante1_id === contato.id || c.participante2_id === contato.id);
          const naoLidasCount = todasMensagensNaoLidas.filter(m => conversa && m.conversa_id === conversa.id).length;
          
          return { ...contato, conversaAberta: conversa, mensagensNaoLidas: naoLidasCount };
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
  }, [currentUser, todasConversasAbertas, todasMensagensNaoLidas]);

  // 3. Abrir Conversa
  const abrirConversa = async (contato: ContatoRenderizado) => {
    setContatoAtivo(contato);
    setMensagens([]);
    setConversaAtivaId(null); 
    setProtocoloAtual('Nova Conversa (A aguardar envio)');
    setStatusConversa('aberta');

    if (!currentUser) return;

    if (contato.conversaAberta) {
      setConversaAtivaId(contato.conversaAberta.id);
      setProtocoloAtual(contato.conversaAberta.protocolo);
      setStatusConversa(contato.conversaAberta.status);
      carregarMensagens(contato.conversaAberta.id);

      if (contato.mensagensNaoLidas > 0) {
        await (supabase.from('messages') as any).update({ is_read: true }).eq('conversa_id', contato.conversaAberta.id).neq('sender_id', currentUser.id);
        setTodasMensagensNaoLidas(prev => prev.filter(m => m.conversa_id !== contato.conversaAberta?.id));
      }
    }
  };

  const carregarMensagens = async (conversaId: string) => {
    const { data } = await (supabase.from('messages') as any).select('*').eq('conversa_id', conversaId).order('created_at', { ascending: true });
    if (data) setMensagens(data as unknown as Mensagem[]);
  };

  // 4. Realtime Global
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
          const ehMinhaConversa = todasConversasAbertas.some(c => c.id === novaMsg.conversa_id);
          if (ehMinhaConversa) {
             setTodasMensagensNaoLidas(prev => [...prev, novaMsg]);
          }
        }
      }).subscribe();

    return () => { supabase.removeChannel(canal); };
  }, [conversaAtivaId, currentUser, todasConversasAbertas]);

  useEffect(() => {
    mensagensFimRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [mensagens]);

// ==========================================
  // 5. INTELIGÊNCIA ARTIFICIAL (GEMINI 2.5)
  // ==========================================
  const sugerirRespostaIA = async () => {
    if (mensagens.length === 0) return;
    setCarregandoIA(true);
    try {
      const ultimasMensagens = mensagens.slice(-5).map(m => {
        const quem = m.sender_id === currentUser?.id ? "Administrador" : "Escola";
        return `${quem}: ${m.content}`;
      }).join("\n");

      const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

      // Olha como o prompt fica limpo agora! Ele puxa o texto gigante do outro arquivo.
      const prompt = `${MANUAL_DO_SISTEMA}
      
Histórico da conversa atual:
${ultimasMensagens}

Sua sugestão de resposta:`;

      const result = await model.generateContent(prompt);
      setNovaMensagem(result.response.text().trim());

    } catch (error) {
      console.error("Erro no Gemini:", error);
    } finally {
      setCarregandoIA(false);
    }
  };
  
  // 6. ENVIAR MENSAGEM
  const enviarMensagem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!novaMensagem.trim() || !currentUser || !contatoAtivo) return;

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
      setTodasConversasAbertas(prev => [...prev, nova]);
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

  // 7. FINALIZAR CONVERSA
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
        is_read: true
      }]);

      setStatusConversa('concluido');
      setConversaAtivaId(null); 
      setProtocoloAtual('Atendimento Concluído. Envie mensagem para novo protocolo.');
      setTodasConversasAbertas(prev => prev.filter(c => c.id !== conversaAtivaId));
    }
  };

  return (
    <div className="flex h-screen bg-gray-100">
      {/* BARRA LATERAL */}
      <div className="w-1/3 bg-white border-r border-gray-300 flex flex-col">
        <div className="p-4 bg-blue-900 text-white font-bold text-lg">
          Atendimentos SGE-GSU-II
        </div>
        <div className="overflow-y-auto flex-1">
          {contatos.map((contato) => (
            <div 
              key={contato.id} 
              onClick={() => abrirConversa(contato)} 
              className={`p-4 border-b cursor-pointer transition flex items-center justify-between ${contatoAtivo?.id === contato.id ? 'bg-blue-50 border-l-4 border-blue-600' : 'hover:bg-gray-50'}`}
            >
              <div>
                <p className="font-semibold text-gray-800">{contato.full_name}</p>
                <div className="flex items-center gap-2 mt-1">
                   <p className="text-xs text-gray-500">{contato.setor ? `Setor: ${contato.setor}` : 'Escola'}</p>
                   {contato.conversaAberta && (
                     <span className="bg-orange-100 text-orange-700 text-[10px] px-2 py-0.5 rounded font-mono font-bold">
                       {contato.conversaAberta.protocolo}
                     </span>
                   )}
                </div>
              </div>

              {contato.mensagensNaoLidas > 0 && (
                <div className="bg-red-500 text-white text-xs font-bold w-6 h-6 flex items-center justify-center rounded-full shadow-md animate-pulse">
                  {contato.mensagensNaoLidas}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* ÁREA DO CHAT */}
      <div className="w-2/3 flex flex-col">
        {contatoAtivo ? (
          <>
            <div className="p-4 bg-white border-b border-gray-300 flex justify-between items-center shadow-sm z-10">
              <div>
                <h2 className="text-lg font-bold text-gray-800">{contatoAtivo.full_name}</h2>
                <p className="text-sm text-gray-500">{contatoAtivo.setor || 'Utilizador da Escola'}</p>
              </div>
              <div className="flex items-center gap-3">
                <div className={`px-3 py-1 rounded-full text-sm font-mono font-bold border ${statusConversa === 'aberta' ? 'bg-orange-100 text-orange-800 border-orange-200' : 'bg-green-100 text-green-800 border-green-200'}`}>
                  {protocoloAtual}
                </div>
                {conversaAtivaId && currentUser && (currentUser.role === 'regional_admin' || currentUser.setor) && (
                  <button onClick={finalizarAtendimento} className="bg-red-500 hover:bg-red-600 text-white text-sm px-3 py-1 rounded font-semibold transition">
                    Finalizar
                  </button>
                )}
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 bg-[#e5ddd5]">
              {mensagens.map((msg) => {
                const isMine = msg.sender_id === currentUser?.id;
                const isSystemMessage = msg.content.startsWith("⚠️");

                if (isSystemMessage) {
                   return (
                     <div key={msg.id} className="flex justify-center mb-4">
                        <div className="bg-yellow-100 text-yellow-800 text-xs px-4 py-2 rounded-lg font-semibold shadow-sm text-center">
                          {msg.content}
                        </div>
                     </div>
                   )
                }

                return (
                  <div key={msg.id} className={`flex mb-4 ${isMine ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[70%] rounded-lg p-3 shadow-sm relative ${isMine ? 'bg-[#dcf8c6] rounded-tr-none' : 'bg-white rounded-tl-none'}`}>
                      <p className="text-gray-800 whitespace-pre-line">{msg.content}</p>
                      
                      <div className="flex justify-end items-center gap-1 mt-1">
                        <span className="text-[10px] text-gray-500 block text-right">
                          {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                        {isMine && (
                          <span className={msg.is_read ? "text-blue-500" : "text-gray-400"}>
                             <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
              <div ref={mensagensFimRef} />
            </div>

            {/* INPUT DE MENSAGENS COM O BOTÃO DA IA */}
            <div className="p-4 bg-gray-100 border-t border-gray-300">
              <form onSubmit={enviarMensagem} className="flex gap-2">
                
                {/* BOTÃO DA INTELIGÊNCIA ARTIFICIAL */}
                {currentUser?.role === 'regional_admin' && mensagens.length > 0 && (
                  <button 
                    type="button" 
                    onClick={sugerirRespostaIA}
                    disabled={carregandoIA}
                    className="bg-purple-100 text-purple-700 border border-purple-300 px-3 py-2 rounded-full font-semibold hover:bg-purple-200 transition flex items-center gap-1 text-sm disabled:opacity-50"
                    title="Pedir sugestão baseada no manual"
                  >
                    {carregandoIA ? '⏳' : '✨ IA'}
                  </button>
                )}

                <input
                  type="text"
                  value={novaMensagem}
                  onChange={(e) => setNovaMensagem(e.target.value)}
                  placeholder="Escreva a sua mensagem..."
                  className="flex-1 p-3 rounded-full border border-gray-300 focus:outline-none focus:border-blue-500"
                />
                <button type="submit" disabled={!novaMensagem.trim()} className="bg-blue-600 text-white px-6 py-2 rounded-full font-semibold hover:bg-blue-700 disabled:opacity-50 transition">
                  Enviar
                </button>
              </form>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center bg-gray-50 text-gray-400 flex-col">
            <svg className="w-16 h-16 mb-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"></path></svg>
            <p className="text-xl">Selecione um contato para iniciar o atendimento</p>
          </div>
        )}
      </div>
    </div>
  );
}
import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';

// 1. Interfaces
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
  is_read?: boolean; // Adicionado o status de leitura
  created_at: string;
}

export interface Conversa {
  id: string;
  protocolo: string;
  status: string;
  participante1_id: string;
  participante2_id: string;
}

// Interface auxiliar para a tela
interface ContatoRenderizado extends Profile {
  conversaAberta?: Conversa;
  mensagensNaoLidas: number;
}

export default function Chat() {
  const [currentUser, setCurrentUser] = useState<Profile | null>(null);
  const [contatos, setContatos] = useState<ContatoRenderizado[]>([]);
  const [mensagens, setMensagens] = useState<Mensagem[]>([]);
  
  // Estados Globais de Monitoramento
  const [todasConversasAbertas, setTodasConversasAbertas] = useState<Conversa[]>([]);
  const [todasMensagensNaoLidas, setTodasMensagensNaoLidas] = useState<Mensagem[]>([]);
  
  const [contatoAtivo, setContatoAtivo] = useState<Profile | null>(null);
  const [conversaAtivaId, setConversaAtivaId] = useState<string | null>(null);
  const [protocoloAtual, setProtocoloAtual] = useState<string | null>(null);
  const [statusConversa, setStatusConversa] = useState<string>('');
  const [novaMensagem, setNovaMensagem] = useState<string>('');
  
  const mensagensFimRef = useRef<HTMLDivElement>(null);

  // 1. Carrega o utilizador logado e os seus dados globais (Conversas e Não Lidas)
  useEffect(() => {
    async function carregarDadosIniciais() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Pega Perfil
      const { data: perfilData } = await supabase.from('profiles').select('*').eq('id', user.id).single();
      const perfil = perfilData as unknown as Profile;
      setCurrentUser(perfil);

      // Pega Conversas Abertas Globais
      const { data: convsData } = await (supabase.from('conversas') as any)
        .select('*')
        .eq('status', 'aberta')
        .or(`participante1_id.eq.${user.id},participante2_id.eq.${user.id}`);
      
      const conversas = (convsData || []) as Conversa[];
      setTodasConversasAbertas(conversas);

      // Se tem conversas abertas, busca as mensagens não lidas delas
      if (conversas.length > 0) {
        const convIds = conversas.map(c => c.id);
        const { data: naoLidasData } = await (supabase.from('messages') as any)
          .select('*')
          .in('conversa_id', convIds)
          .eq('is_read', false)
          .neq('sender_id', user.id); // Mensagens que NÃO fui eu que enviei
        
        if (naoLidasData) setTodasMensagensNaoLidas(naoLidasData as Mensagem[]);
      }
    }
    carregarDadosIniciais();
  }, []);

  // 2. Carrega e Ordena a lista de contactos
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
        
        // Mapeia os contatos inserindo as informações de protocolo e leitura
        let contatosMapeados: ContatoRenderizado[] = baseContatos.map(contato => {
          const conversa = todasConversasAbertas.find(c => c.participante1_id === contato.id || c.participante2_id === contato.id);
          const naoLidasCount = todasMensagensNaoLidas.filter(m => conversa && m.conversa_id === conversa.id).length;
          
          return {
            ...contato,
            conversaAberta: conversa,
            mensagensNaoLidas: naoLidasCount
          };
        });

        // ORDENAÇÃO: 1º Não Lidas | 2º Protocolos Abertos | 3º Restante
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
  }, [currentUser, todasConversasAbertas, todasMensagensNaoLidas]); // Recalcula se chegar msg nova

  // 3. Clica no contato
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

      // Marca como lida no banco de dados
      if (contato.mensagensNaoLidas > 0) {
        await (supabase.from('messages') as any)
          .update({ is_read: true })
          .eq('conversa_id', contato.conversaAberta.id)
          .neq('sender_id', currentUser.id);
        
        // Remove as mensagens não lidas deste contato do estado global (limpa a bolinha vermelha)
        setTodasMensagensNaoLidas(prev => prev.filter(m => m.conversa_id !== contato.conversaAberta?.id));
      }
    }
  };

  const carregarMensagens = async (conversaId: string) => {
    const { data } = await (supabase.from('messages') as any).select('*').eq('conversa_id', conversaId).order('created_at', { ascending: true });
    if (data) setMensagens(data as unknown as Mensagem[]);
  };

  // 4. Realtime Global (Escuta tudo para atualizar os alertas)
  useEffect(() => {
    if (!currentUser) return;

    const canal = supabase
      .channel('mensagens-globais')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, 
      (payload: any) => { 
        const novaMsg = payload.new as Mensagem; 
        
        // A) Se for para a conversa que estou olhando AGORA
        if (conversaAtivaId && novaMsg.conversa_id === conversaAtivaId) {
          setMensagens((prev) => {
            if (prev.find(m => m.id === novaMsg.id)) return prev;
            return [...prev, novaMsg];
          });
          
          // Como estou com a tela aberta, já marco como lido no banco
          if (novaMsg.sender_id !== currentUser.id) {
             (supabase.from('messages') as any).update({ is_read: true }).eq('id', novaMsg.id).then();
          }
        } 
        // B) Se for para OUTRA conversa e eu for o destinatário
        else if (novaMsg.sender_id !== currentUser.id) {
          // Checa se essa mensagem pertence a alguma conversa minha
          const ehMinhaConversa = todasConversasAbertas.some(c => c.id === novaMsg.conversa_id);
          if (ehMinhaConversa) {
             // Adiciona na lista de não lidas para fazer a bolinha vermelha aparecer
             setTodasMensagensNaoLidas(prev => [...prev, novaMsg]);
          }
        }
      }).subscribe();

    return () => { supabase.removeChannel(canal); };
  }, [conversaAtivaId, currentUser, todasConversasAbertas]);

  useEffect(() => {
    mensagensFimRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [mensagens]);

  // 5. ENVIAR MENSAGEM (Optimistic UI)
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
      
      // Adiciona a nova conversa na lista global para a Sidebar atualizar e mostrar o protocolo
      setTodasConversasAbertas(prev => [...prev, nova]);
    }

    const { data: msgInserida, error } = await (supabase.from('messages') as any).insert([{
      conversa_id: idDaConversaAtual,
      sender_id: currentUser.id,
      content: textoMensagem,
      is_read: false // A mensagem nasce como "não lida" para o destinatário
    }]).select().single();

    if (!error && msgInserida) {
      setMensagens((prev) => {
        if (prev.find(m => m.id === msgInserida.id)) return prev;
        return [...prev, msgInserida as Mensagem];
      });
    }
  };

  // 6. FINALIZAR CONVERSA
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
        is_read: true // Mensagem do sistema não precisa apitar
      }]);

      setStatusConversa('concluido');
      setConversaAtivaId(null); 
      setProtocoloAtual('Atendimento Concluído. Envie mensagem para novo protocolo.');
      
      // Remove da lista de conversas ativas na Sidebar
      setTodasConversasAbertas(prev => prev.filter(c => c.id !== conversaAtivaId));
    }
  };

  return (
    <div className="flex h-screen bg-gray-100">
      {/* BARRA LATERAL (SIDEBAR) */}
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
                   {/* DESTAQUE: Badge de Protocolo Aberto */}
                   {contato.conversaAberta && (
                     <span className="bg-orange-100 text-orange-700 text-[10px] px-2 py-0.5 rounded font-mono font-bold">
                       {contato.conversaAberta.protocolo}
                     </span>
                   )}
                </div>
              </div>

              {/* ALERTA VISUAL: Bolinha de Mensagens Não Lidas */}
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
                      <p className="text-gray-800">{msg.content}</p>
                      
                      {/* Checkmarks de lido/não lido para quem enviou */}
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

            <div className="p-4 bg-gray-100 border-t border-gray-300">
              <form onSubmit={enviarMensagem} className="flex gap-2">
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
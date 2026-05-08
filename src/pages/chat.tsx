import React, { useState, useEffect, useRef, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { MANUAL_DO_SISTEMA } from '../lib/manualIA';
import { Loader2, History, MessageSquare, BarChart2, CheckCircle, Clock, MessageCircle, Users, X, ChevronDown, Search } from 'lucide-react';

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
  created_at?: string;
  updated_at?: string;
}

interface ContatoRenderizado extends Profile {
  conversaAberta?: Conversa;
  mensagensNaoLidas: number;
}

// ─── helpers ──────────────────────────────────────────────────────────────────

function getInitials(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((n) => n[0].toUpperCase())
    .join('');
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);

  const sameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();

  if (sameDay(d, today)) return 'Hoje';
  if (sameDay(d, yesterday)) return 'Ontem';
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

// ─── Avatar ────────────────────────────────────────────────────────────────────

const AVATAR_COLORS = [
  'bg-blue-100 text-blue-700',
  'bg-purple-100 text-purple-700',
  'bg-teal-100 text-teal-700',
  'bg-orange-100 text-orange-700',
  'bg-rose-100 text-rose-700',
  'bg-emerald-100 text-emerald-700',
];

function avatarColor(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

function Avatar({ profile, size = 'md' }: { profile: Profile; size?: 'sm' | 'md' | 'lg' }) {
  const cls = size === 'sm' ? 'w-7 h-7 text-[10px]' : size === 'lg' ? 'w-10 h-10 text-sm' : 'w-8 h-8 text-xs';
  return (
    <div className={`${cls} ${avatarColor(profile.id)} rounded-full flex items-center justify-center font-bold shrink-0`}>
      {getInitials(profile.full_name)}
    </div>
  );
}

// ─── MetricsPanel ─────────────────────────────────────────────────────────────

interface MetricsProps {
  conversas: Conversa[];
  contatos: ContatoRenderizado[];
  todasMensagens?: Mensagem[];
}

function MetricsPanel({ conversas, contatos, todasMensagens = [] }: MetricsProps) {
  const abertas = conversas.filter((c) => c.status === 'aberta').length;
  const concluidas = conversas.filter((c) => c.status === 'concluido').length;
  const total = conversas.length;
  const escolas = contatos.filter((c) => c.school_id).length;
  const totalMsgs = todasMensagens.length;

  // Conversas por dia (últimos 7 dias)
  const hoje = new Date();
  const diasLabels: string[] = [];
  const diasCounts: number[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(hoje);
    d.setDate(hoje.getDate() - i);
    diasLabels.push(d.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', ''));
    const inicio = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const fim = new Date(inicio);
    fim.setDate(fim.getDate() + 1);
    diasCounts.push(
      conversas.filter((c) => {
        if (!c.created_at) return false;
        const t = new Date(c.created_at);
        return t >= inicio && t < fim;
      }).length
    );
  }
  const maxCount = Math.max(...diasCounts, 1);

  const taxaConclusao = total > 0 ? Math.round((concluidas / total) * 100) : 0;

  return (
    <div className="border-t border-slate-200 bg-white">
      {/* header */}
      <div className="px-6 pt-5 pb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <BarChart2 size={15} className="text-slate-400" />
          <span className="text-xs font-black uppercase tracking-widest text-slate-500">Métricas de Atendimento</span>
        </div>
        <span className="text-[10px] text-slate-400 font-medium">Atualizado agora</span>
      </div>

      {/* cards */}
      <div className="px-6 pb-5 grid grid-cols-2 md:grid-cols-5 gap-3">
        <MetricCard icon={<MessageCircle size={14} />} label="Total" value={total} color="blue" />
        <MetricCard icon={<Clock size={14} />} label="Em andamento" value={abertas} color="orange" />
        <MetricCard icon={<CheckCircle size={14} />} label="Concluídos" value={concluidas} color="green" />
        <MetricCard icon={<Users size={14} />} label="Escolas" value={escolas} color="purple" />
        <MetricCard icon={<MessageSquare size={14} />} label="Mensagens" value={totalMsgs} color="slate" />
      </div>

      {/* chart + taxa */}
      <div className="px-6 pb-6 grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* bar chart */}
        <div className="md:col-span-2">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-3">Conversas por dia (últimos 7 dias)</p>
          <div className="flex items-end gap-2 h-20">
            {diasCounts.map((count, i) => (
              <div key={i} className="flex-1 flex flex-col items-center gap-1">
                <span className="text-[9px] font-bold text-slate-400">{count > 0 ? count : ''}</span>
                <div
                  className="w-full rounded-t-sm bg-blue-500 transition-all"
                  style={{ height: `${(count / maxCount) * 56}px`, minHeight: count > 0 ? '4px' : '2px' }}
                />
                <span className="text-[9px] text-slate-400 capitalize">{diasLabels[i]}</span>
              </div>
            ))}
          </div>
        </div>

        {/* taxa conclusão */}
        <div className="flex flex-col justify-center items-center bg-slate-50 rounded-2xl p-4">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-3 text-center">Taxa de conclusão</p>
          <div className="relative w-20 h-20">
            <svg viewBox="0 0 80 80" className="w-full h-full -rotate-90">
              <circle cx="40" cy="40" r="32" fill="none" stroke="#e2e8f0" strokeWidth="8" />
              <circle
                cx="40" cy="40" r="32" fill="none"
                stroke={taxaConclusao >= 70 ? '#22c55e' : taxaConclusao >= 40 ? '#f97316' : '#ef4444'}
                strokeWidth="8"
                strokeDasharray={`${(taxaConclusao / 100) * 201} 201`}
                strokeLinecap="round"
              />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-xl font-black text-slate-700">{taxaConclusao}%</span>
            </div>
          </div>
          <p className="text-[10px] text-slate-400 mt-2 text-center">{concluidas} de {total} atendimentos</p>
        </div>
      </div>
    </div>
  );
}

function MetricCard({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: number; color: string }) {
  const colors: Record<string, string> = {
    blue: 'bg-blue-50 text-blue-600',
    orange: 'bg-orange-50 text-orange-600',
    green: 'bg-emerald-50 text-emerald-600',
    purple: 'bg-purple-50 text-purple-600',
    slate: 'bg-slate-100 text-slate-600',
  };
  return (
    <div className="bg-slate-50 rounded-2xl p-4 flex flex-col gap-2">
      <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${colors[color] || colors.slate}`}>
        {icon}
      </div>
      <p className="text-2xl font-black text-slate-800 leading-none">{value}</p>
      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{label}</p>
    </div>
  );
}

// ─── DateDivider ──────────────────────────────────────────────────────────────

function DateDivider({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 my-4">
      <div className="flex-1 h-px bg-slate-200" />
      <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 px-2">{label}</span>
      <div className="flex-1 h-px bg-slate-200" />
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function Chat() {
  const [currentUser, setCurrentUser] = useState<Profile | null>(null);
  const [contatos, setContatos] = useState<ContatoRenderizado[]>([]);
  const [mensagens, setMensagens] = useState<Mensagem[]>([]);
  const [profilesMap, setProfilesMap] = useState<Map<string, Profile>>(new Map());

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
  const [showMetrics, setShowMetrics] = useState<boolean>(false);
  const [buscaEscola, setBuscaEscola] = useState<string>('');

  const mensagensFimRef = useRef<HTMLDivElement>(null);

  // 1. Carregar dados iniciais
  useEffect(() => {
    async function carregarDadosIniciais() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: perfilData } = await supabase.from('profiles').select('*').eq('id', user.id).single();
      const perfil = perfilData as unknown as Profile;
      setCurrentUser(perfil);

      let queryConvs = supabase.from('conversas').select('*');
      if (perfil.role !== 'regional_admin') {
        queryConvs = queryConvs.or(`participante1_id.eq.${user.id},participante2_id.eq.${user.id}`);
      }
      const { data: convsData } = await queryConvs as any;
      const conversas = (convsData || []) as Conversa[];
      setTodasConversas(conversas);

      if (conversas.length > 0) {
        const convIds = conversas.map((c) => c.id);
        const { data: naoLidasData } = await (supabase.from('messages') as any)
          .select('*')
          .in('conversa_id', convIds)
          .eq('is_read', false)
          .neq('sender_id', user.id);
        if (naoLidasData) setTodasMensagensNaoLidas(naoLidasData as Mensagem[]);
      }

      // Pré-carrega todos os perfis para exibição de nomes nas mensagens
      const { data: allProfiles } = await supabase.from('profiles').select('id, full_name, role, setor, school_id');
      if (allProfiles) {
        const map = new Map<string, Profile>();
        (allProfiles as unknown as Profile[]).forEach((p) => map.set(p.id, p));
        setProfilesMap(map);
      }
    }
    carregarDadosIniciais();
  }, []);

  // 2. Carregar contatos
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

        let contatosMapeados: ContatoRenderizado[] = baseContatos.map((contato) => {
          const conversasDoContato = todasConversas.filter(
            (c) => c.participante1_id === contato.id || c.participante2_id === contato.id
          );
          let conversaVisivel = conversasDoContato.find((c) => c.status === 'aberta');
          if (!conversaVisivel) {
            conversaVisivel = conversasDoContato.find((c) =>
              todasMensagensNaoLidas.some((m) => m.conversa_id === c.id)
            );
          }
          const naoLidasCount = todasMensagensNaoLidas.filter(
            (m) => conversaVisivel && m.conversa_id === conversaVisivel.id
          ).length;
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

  // 3. Abrir conversa
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
      setProtocoloAtual(
        contato.conversaAberta.status === 'concluido'
          ? `${contato.conversaAberta.protocolo} (CONCLUÍDO)`
          : contato.conversaAberta.protocolo
      );
      setStatusConversa(contato.conversaAberta.status);
      carregarMensagens(contato.conversaAberta.id);

      if (contato.mensagensNaoLidas > 0) {
        await (supabase.from('messages') as any)
          .update({ is_read: true })
          .eq('conversa_id', contato.conversaAberta.id)
          .neq('sender_id', currentUser.id);
        setTodasMensagensNaoLidas((prev) =>
          prev.filter((m) => m.conversa_id !== contato.conversaAberta?.id)
        );
      }
    }
  };

  const carregarMensagens = async (conversaId: string) => {
    const { data } = await (supabase.from('messages') as any)
      .select('*')
      .eq('conversa_id', conversaId)
      .order('created_at', { ascending: true });
    if (data) setMensagens(data as unknown as Mensagem[]);
  };

  // 4. Histórico completo
  const carregarHistorico = async () => {
    if (!currentUser || !contatoAtivo) return;
    setCarregandoHistorico(true);
    try {
      let queryHist = supabase.from('conversas').select('id');
      if (currentUser.role === 'regional_admin') {
        queryHist = queryHist.or(
          `participante1_id.eq.${contatoAtivo.id},participante2_id.eq.${contatoAtivo.id}`
        );
      } else {
        queryHist = queryHist.or(
          `and(participante1_id.eq.${currentUser.id},participante2_id.eq.${contatoAtivo.id}),and(participante1_id.eq.${contatoAtivo.id},participante2_id.eq.${currentUser.id})`
        );
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
      console.error('Erro ao carregar histórico:', error);
    } finally {
      setCarregandoHistorico(false);
    }
  };

  // 5. Realtime
  useEffect(() => {
    if (!currentUser) return;
    const canal = supabase
      .channel('mensagens-globais')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages' },
        (payload: any) => {
          const novaMsg = payload.new as Mensagem;
          if (conversaAtivaId && novaMsg.conversa_id === conversaAtivaId) {
            setMensagens((prev) => {
              if (prev.find((m) => m.id === novaMsg.id)) return prev;
              return [...prev, novaMsg];
            });
            if (novaMsg.sender_id !== currentUser.id) {
              (supabase.from('messages') as any).update({ is_read: true }).eq('id', novaMsg.id).then();
            }
          } else if (novaMsg.sender_id !== currentUser.id) {
            const ehMinhaConversa =
              currentUser.role === 'regional_admin' ||
              todasConversas.some((c) => c.id === novaMsg.conversa_id);
            if (ehMinhaConversa) {
              setTodasMensagensNaoLidas((prev) => [...prev, novaMsg]);
            }
          }
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(canal); };
  }, [conversaAtivaId, currentUser, todasConversas]);

  useEffect(() => {
    mensagensFimRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [mensagens]);

  // 6. IA — via Supabase Edge Function (sem CSP issues)
  const sugerirRespostaIA = async () => {
    if (mensagens.length === 0) return;
    setCarregandoIA(true);
    try {
      const ultimasMensagens = mensagens.slice(-8).map((m) => {
        const quem = m.sender_id === currentUser?.id ? 'Atendente' : 'Escola';
        return `${quem}: ${m.content}`;
      }).join('\n');

      const { data, error } = await supabase.functions.invoke('sugerir-resposta-ia', {
        body: {
          mensagens: ultimasMensagens,
          manualDoSistema: MANUAL_DO_SISTEMA,
        },
      });

      if (error) throw error;
      if (data?.sugestao) {
        setNovaMensagem(data.sugestao);
      }
    } catch (error) {
      console.error('Erro na sugestão IA:', error);
      alert('Não foi possível gerar sugestão. Tente novamente.');
    } finally {
      setCarregandoIA(false);
    }
  };

  // 7. Enviar mensagem
  const enviarMensagem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!novaMensagem.trim() || !currentUser || !contatoAtivo) return;
    if (statusConversa === 'concluido') {
      alert('Este atendimento já foi concluído. Selecione o contato novamente para gerar um novo protocolo.');
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
        p_setor: setorContato,
      });
      if (erroCriar) { alert('Erro ao gerar protocolo!'); return; }
      const nova = (Array.isArray(novaConversa) ? novaConversa[0] : novaConversa) as Conversa;
      idDaConversaAtual = nova.id;
      setConversaAtivaId(nova.id);
      setProtocoloAtual(nova.protocolo);
      setStatusConversa('aberta');
      setTodasConversas((prev) => [...prev, nova]);
    }

    const { data: msgInserida, error } = await (supabase.from('messages') as any)
      .insert([{ conversa_id: idDaConversaAtual, sender_id: currentUser.id, content: textoMensagem, is_read: false }])
      .select()
      .single();

    if (!error && msgInserida) {
      setMensagens((prev) => {
        if (prev.find((m) => m.id === msgInserida.id)) return prev;
        return [...prev, msgInserida as Mensagem];
      });
    }
  };

  // 8. Finalizar
  const finalizarAtendimento = async () => {
    if (!conversaAtivaId || !currentUser) return;
    const confirmar = window.confirm('Deseja realmente finalizar este atendimento?');
    if (!confirmar) return;

    const { error } = await (supabase.from('conversas') as any)
      .update({ status: 'concluido' })
      .eq('id', conversaAtivaId);

    if (!error) {
      await (supabase.from('messages') as any).insert([{
        conversa_id: conversaAtivaId,
        sender_id: currentUser.id,
        content: '⚠️ Este atendimento foi finalizado pelo administrador.',
        is_read: false,
      }]);

      setMensagens((prev) => [
        ...prev,
        {
          id: `system-${Date.now()}`,
          conversa_id: conversaAtivaId,
          sender_id: currentUser.id,
          content: '⚠️ Este atendimento foi finalizado pelo administrador.',
          is_read: false,
          created_at: new Date().toISOString(),
        },
      ]);

      setStatusConversa('concluido');
      setProtocoloAtual(`${protocoloAtual} (CONCLUÍDO)`);
    }
  };

  // Agrupa mensagens por data para exibir separadores
  const mensagensAgrupadas = useMemo(() => {
    const grupos: { date: string; msgs: Mensagem[] }[] = [];
    mensagens.forEach((msg) => {
      const label = formatDate(msg.created_at);
      const last = grupos[grupos.length - 1];
      if (last && last.date === label) {
        last.msgs.push(msg);
      } else {
        grupos.push({ date: label, msgs: [msg] });
      }
    });
    return grupos;
  }, [mensagens]);

  const contatosFiltrados = useMemo(() => {
    if (!buscaEscola.trim()) return contatos;
    const q = buscaEscola.toLowerCase().trim();
    return contatos.filter((c) =>
      c.full_name.toLowerCase().includes(q) ||
      (c.setor && c.setor.toLowerCase().includes(q)) ||
      (c.conversaAberta?.protocolo && c.conversaAberta.protocolo.toLowerCase().includes(q))
    );
  }, [contatos, buscaEscola]);

  const isAdmin = currentUser?.role === 'regional_admin';

  // ─── render ─────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-[calc(100vh-80px)] min-h-[600px] bg-white rounded-3xl overflow-hidden shadow-xl border border-slate-100">
      
      {/* MAIN AREA */}
      <div className="flex flex-1 overflow-hidden">

        {/* BARRA LATERAL */}
        <div className="w-80 bg-slate-50 border-r border-slate-200 flex flex-col shrink-0">
          <div className="p-4 bg-slate-900 text-white flex items-center justify-between">
            <span className="font-black text-base tracking-tight">Atendimentos</span>
            <span className="bg-slate-700 text-slate-300 text-[10px] font-black px-2 py-0.5 rounded-full">
              {contatos.filter((c) => c.mensagensNaoLidas > 0).length > 0
                ? `${contatos.filter((c) => c.mensagensNaoLidas > 0).length} novos`
                : `${contatos.length} escolas`}
            </span>
          </div>

          {/* Campo de busca */}
          <div className="px-3 py-2.5 bg-slate-900 border-t border-slate-700">
            <div className="relative">
              <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              <input
                type="text"
                value={buscaEscola}
                onChange={(e) => setBuscaEscola(e.target.value)}
                placeholder="Buscar escola ou protocolo..."
                className="w-full bg-slate-800 text-slate-200 placeholder-slate-500 text-xs pl-8 pr-8 py-2 rounded-lg border border-slate-700 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all"
              />
              {buscaEscola && (
                <button
                  onClick={() => setBuscaEscola('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200 transition-colors"
                >
                  <X size={12} />
                </button>
              )}
            </div>
            {buscaEscola && (
              <p className="text-[10px] text-slate-500 mt-1.5 px-1">
                {contatosFiltrados.length} resultado{contatosFiltrados.length !== 1 ? 's' : ''}
              </p>
            )}
          </div>

          <div className="overflow-y-auto flex-1">
            {contatosFiltrados.length === 0 && buscaEscola ? (
              <div className="flex flex-col items-center justify-center py-12 text-slate-400">
                <Search size={28} className="mb-2 opacity-30" />
                <p className="text-xs font-bold text-center">Nenhuma escola encontrada</p>
                <p className="text-[10px] text-center mt-1 opacity-70">Tente outro termo de busca</p>
              </div>
            ) : null}
            {contatosFiltrados.map((contato) => (
              <div
                key={contato.id}
                onClick={() => abrirConversa(contato)}
                className={`p-4 border-b border-slate-100 cursor-pointer transition-all flex items-center gap-3 
                  ${contatoAtivo?.id === contato.id
                    ? 'bg-white border-l-4 border-l-blue-600 shadow-sm pl-3'
                    : 'hover:bg-white border-l-4 border-l-transparent'}`}
              >
                <div className="relative shrink-0">
                  <Avatar profile={contato} size="md" />
                  {contato.mensagensNaoLidas > 0 && (
                    <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[9px] font-black w-4 h-4 flex items-center justify-center rounded-full animate-pulse">
                      {contato.mensagensNaoLidas}
                    </span>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-bold text-slate-800 text-sm truncate">{contato.full_name}</p>
                  <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                    <p className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">
                      {contato.setor ? `Setor: ${contato.setor}` : 'Escola'}
                    </p>
                    {contato.conversaAberta && (
                      <span className={`text-[8px] px-1.5 py-0.5 rounded font-mono font-bold tracking-tight
                        ${contato.conversaAberta.status === 'concluido'
                          ? 'bg-slate-200 text-slate-500'
                          : 'bg-orange-100 text-orange-700'}`}>
                        {contato.conversaAberta.protocolo}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ÁREA DO CHAT */}
        <div className="flex-1 flex flex-col bg-[#f8fafc] min-w-0">
          {contatoAtivo ? (
            <>
              {/* Header */}
              <div className="px-6 py-4 bg-white border-b border-slate-200 flex justify-between items-center shadow-sm z-10 shrink-0">
                <div className="flex items-center gap-3">
                  <Avatar profile={contatoAtivo} size="lg" />
                  <div>
                    <h2 className="text-base font-black text-slate-800 tracking-tight leading-none">
                      {contatoAtivo.full_name}
                    </h2>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">
                      {contatoAtivo.setor || 'Utilizador da Escola'}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {isAdmin && conversaAtivaId && !showingHistory && (
                    <button
                      onClick={carregarHistorico}
                      disabled={carregandoHistorico}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg text-xs font-bold transition-colors"
                    >
                      {carregandoHistorico ? <Loader2 size={13} className="animate-spin" /> : <History size={13} />}
                      Ver Histórico
                    </button>
                  )}

                  <div className={`px-3 py-1.5 rounded-lg text-[11px] font-mono font-bold tracking-tight border
                    ${statusConversa === 'aberta'
                      ? 'bg-orange-50 text-orange-700 border-orange-200'
                      : 'bg-slate-100 text-slate-500 border-slate-200'}`}>
                    {protocoloAtual}
                  </div>

                  {conversaAtivaId && statusConversa === 'aberta' && currentUser &&
                    (isAdmin || currentUser.setor) && (
                      <button
                        onClick={finalizarAtendimento}
                        className="bg-red-50 text-red-600 border border-red-200 hover:bg-red-600 hover:text-white text-[11px] px-4 py-1.5 rounded-lg font-black uppercase tracking-widest transition-all"
                      >
                        Finalizar
                      </button>
                    )}
                </div>
              </div>

              {/* Messages */}
              <div className="flex-1 overflow-y-auto p-6 space-y-1 custom-scrollbar">
                {showingHistory && (
                  <div className="flex justify-center mb-4">
                    <span className="text-[10px] font-black uppercase tracking-widest bg-slate-200 text-slate-500 px-3 py-1 rounded-full">
                      Início do Histórico
                    </span>
                  </div>
                )}

                {mensagensAgrupadas.map(({ date, msgs }) => (
                  <div key={date}>
                    <DateDivider label={date} />
                    {msgs.map((msg, msgIdx) => {
                      const isMine = msg.sender_id === currentUser?.id;
                      const isSystemMessage = msg.content.startsWith('⚠️');
                      const senderProfile = profilesMap.get(msg.sender_id);
                      const senderName = senderProfile?.full_name || (isMine ? currentUser?.full_name : 'Desconhecido') || 'Desconhecido';

                      // Show avatar/name only on first message of a "group" (same sender, consecutive)
                      const prevMsg = msgIdx > 0 ? msgs[msgIdx - 1] : null;
                      const isFirstInGroup = !prevMsg || prevMsg.sender_id !== msg.sender_id;

                      if (isSystemMessage) {
                        return (
                          <div key={msg.id} className="flex justify-center my-6">
                            <div className="bg-amber-100/80 text-amber-800 text-[11px] px-6 py-2 rounded-full font-black uppercase tracking-widest shadow-sm text-center border border-amber-200">
                              {msg.content}
                            </div>
                          </div>
                        );
                      }

                      return (
                        <div key={msg.id} className={`flex ${isMine ? 'justify-end' : 'justify-start'} ${isFirstInGroup ? 'mt-4' : 'mt-1'}`}>
                          {/* Avatar para mensagens recebidas */}
                          {!isMine && (
                            <div className="mr-2 self-end mb-1">
                              {isFirstInGroup && senderProfile ? (
                                <Avatar profile={senderProfile} size="sm" />
                              ) : (
                                <div className="w-7 h-7" />
                              )}
                            </div>
                          )}

                          <div className={`max-w-[72%] flex flex-col ${isMine ? 'items-end' : 'items-start'}`}>
                            {/* Nome do remetente (apenas no início de cada grupo) */}
                            {isFirstInGroup && (
                              <span className={`text-[10px] font-black uppercase tracking-wider mb-1 px-1
                                ${isMine ? 'text-blue-400' : 'text-slate-400'}`}>
                                {isMine ? (currentUser?.full_name || 'Você') : senderName}
                              </span>
                            )}

                            <div className={`rounded-2xl px-4 py-3 shadow-sm
                              ${isMine
                                ? 'bg-blue-600 text-white rounded-tr-sm'
                                : 'bg-white text-slate-700 border border-slate-100 rounded-tl-sm'}`}>
                              <p className="text-sm whitespace-pre-line leading-relaxed font-medium">{msg.content}</p>

                              {/* Hora + status leitura */}
                              <div className={`flex items-center gap-1 mt-1.5 ${isMine ? 'justify-end' : 'justify-start'}`}>
                                <span className={`text-[9px] font-bold tracking-wider ${isMine ? 'text-blue-200' : 'text-slate-400'}`}>
                                  {formatTime(msg.created_at)}
                                </span>
                                {isMine && (
                                  <span className={msg.is_read ? 'text-blue-200' : 'text-blue-400/50'}>
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                      <polyline points="20 6 9 17 4 12" />
                                    </svg>
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>

                          {/* Espaço do avatar para mensagens enviadas (alinhamento) */}
                          {isMine && <div className="ml-2 w-7 h-7" />}
                        </div>
                      );
                    })}
                  </div>
                ))}

                <div ref={mensagensFimRef} />
              </div>

              {/* Input */}
              <div className="px-4 py-3 bg-white border-t border-slate-200 shrink-0">
                {/* Quem está digitando (identidade visual) */}
                {currentUser && (
                  <div className="flex items-center gap-2 mb-2">
                    <Avatar profile={currentUser} size="sm" />
                    <span className="text-[10px] text-slate-400 font-bold">{currentUser.full_name}</span>
                  </div>
                )}
                <form onSubmit={enviarMensagem} className="flex gap-2">
                  {isAdmin && mensagens.length > 0 && statusConversa !== 'concluido' && (
                    <button
                      type="button"
                      onClick={sugerirRespostaIA}
                      disabled={carregandoIA}
                      className="bg-purple-50 text-purple-600 border border-purple-200 px-3 py-2 rounded-xl font-black text-xs uppercase tracking-widest hover:bg-purple-600 hover:text-white transition-all flex items-center gap-1.5 disabled:opacity-50 shrink-0"
                    >
                      {carregandoIA ? <Loader2 size={14} className="animate-spin" /> : '✨ IA'}
                    </button>
                  )}

                  <input
                    type="text"
                    value={novaMensagem}
                    onChange={(e) => setNovaMensagem(e.target.value)}
                    placeholder={statusConversa === 'concluido' ? 'Atendimento finalizado...' : 'Digite sua mensagem...'}
                    disabled={statusConversa === 'concluido'}
                    className="flex-1 px-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition-all disabled:opacity-50 font-medium text-sm"
                  />
                  <button
                    type="submit"
                    disabled={!novaMensagem.trim() || statusConversa === 'concluido'}
                    className="bg-blue-600 text-white px-6 py-2.5 rounded-xl font-black uppercase tracking-widest text-xs hover:bg-blue-700 disabled:opacity-50 transition-all shadow-md shadow-blue-600/20 shrink-0"
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
              <p className="text-xs font-bold uppercase tracking-widest mt-2 opacity-50">
                Selecione um contato na lateral para iniciar
              </p>
            </div>
          )}
        </div>
      </div>

      {/* PAINEL DE MÉTRICAS (toggle) */}
      {isAdmin && (
        <div className="shrink-0">
          <button
            onClick={() => setShowMetrics((v) => !v)}
            className="w-full flex items-center justify-between px-6 py-2 bg-slate-50 border-t border-slate-200 hover:bg-slate-100 transition-colors"
          >
            <div className="flex items-center gap-2">
              <BarChart2 size={13} className="text-slate-400" />
              <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                {showMetrics ? 'Ocultar métricas' : 'Ver métricas'}
              </span>
            </div>
            <ChevronDown
              size={13}
              className={`text-slate-400 transition-transform ${showMetrics ? 'rotate-180' : ''}`}
            />
          </button>

          {showMetrics && (
            <div className="overflow-y-auto max-h-72">
              <MetricsPanel conversas={todasConversas} contatos={contatos} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

import { useState, useEffect, useMemo, useCallback } from 'react';
import toast from 'react-hot-toast';
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { isReadOnlyRole } from '../lib/roles';
import {
  CalendarRange, ChevronLeft, ChevronRight, Plus, X, Loader2, Search, RefreshCw,
  CalendarDays, ListChecks, BarChart3, CheckCircle2, XCircle, Ban, Clock, CalendarClock,
  Lightbulb, Printer, Pencil, Trash2, RotateCcw, Users, MapPin, School, AlertTriangle,
  Repeat, User, Check,
} from 'lucide-react';
import {
  SETORES, TIPOS_ATIVIDADE, TIPO_INFO, OBJETIVOS_VISITA, TIPOS_COM_PARTICIPANTES,
  toISODate, mesDe, somarMeses, formatarData, nomeMes, semanasDoMes, datasRepeticao,
  aguardandoConfirmacao, sugestoesParaMes, visitaCorrespondente, resumoExecucao, ordenarAtividades,
  type Atividade, type ResumoExecucao, type Setor, type TipoAtividade, type StatusAtividade, type VisitaRegistrada,
} from '../lib/cronogramaAtividades';

// Cronograma de Atividades da SEOM/SEFISC (regional_admin).
// Planejamento mensal (previsto) e depois o registro do que foi realizado:
//  - visita concluída → registrada automaticamente em "Visitas às Escolas"
//    (Edge Function google-sheets-visitas), sem duplicar quando a visita já
//    consta lá;
//  - visita não realizada → sugestão para os meses seguintes até ser
//    reprogramada ou descartada.
// Ver migration 20261014030000_cronograma_atividades.sql e src/lib/cronogramaAtividades.ts.

interface EscolaOption { id: string; name: string; fde_code: string | null }

type Aba = 'calendario' | 'lista' | 'indicadores';
type FiltroStatus = 'TODOS' | 'AGUARDANDO' | StatusAtividade;

interface FormState {
  id: string | null;
  setor: Setor;
  tipo: TipoAtividade;
  titulo: string;
  descricao: string;
  responsavel: string;
  local: string;
  data_prevista: string;
  hora_inicio: string;
  hora_fim: string;
  escolaIds: string[];
  objetivo: string;
  repetir: 0 | 7 | 14;
  origem_id: string | null;
}

// A tabela nova não está nos tipos gerados do client; usa o client sem schema.
const db = supabase as unknown as SupabaseClient;

const DIAS_SEMANA = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];
const PAGINA = 1000;
const MAX_CHIPS_DIA = 3;

const DIACRITICS = new RegExp('[\\u0300-\\u036f]', 'g');
const normalizar = (s: string | null | undefined) =>
  (s || '').normalize('NFD').replace(DIACRITICS, '').toLowerCase().trim();

const hora = (h: string | null) => (h ? h.slice(0, 5) : '');

// Primeiro dia útil do mês; no mês corrente, hoje (ou o próximo dia útil).
function dataSugerida(mes: string, hoje: string): string {
  const d = new Date(`${mesDe(hoje) === mes ? hoje : `${mes}-01`}T00:00:00`);
  while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1);
  return toISODate(d);
}

function statusVisual(a: Atividade, hoje: string) {
  if (a.status === 'CONCLUIDA') return { label: 'Concluída', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200', Icon: CheckCircle2 };
  if (a.status === 'NAO_REALIZADA') return { label: 'Não realizada', cls: 'bg-red-50 text-red-700 border-red-200', Icon: XCircle };
  if (a.status === 'CANCELADA') return { label: 'Cancelada', cls: 'bg-slate-100 text-slate-500 border-slate-200', Icon: Ban };
  if (aguardandoConfirmacao(a, hoje)) return { label: 'Aguardando confirmação', cls: 'bg-amber-50 text-amber-700 border-amber-200', Icon: Clock };
  return { label: 'Planejada', cls: 'bg-blue-50 text-blue-700 border-blue-200', Icon: CalendarClock };
}

function StatusBadge({ a, hoje }: { a: Atividade; hoje: string }) {
  const { label, cls, Icon } = statusVisual(a, hoje);
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[11px] font-semibold whitespace-nowrap ${cls}`}>
      <Icon size={12} /> {label}
    </span>
  );
}

function TipoChip({ tipo }: { tipo: TipoAtividade }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-md border text-[11px] font-semibold whitespace-nowrap ${TIPO_INFO[tipo].chip}`}>
      {TIPO_INFO[tipo].label}
    </span>
  );
}

function SetorBadge({ setor }: { setor: Setor }) {
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-black tracking-wider ${setor === 'SEOM' ? 'bg-orange-100 text-orange-700' : 'bg-cyan-100 text-cyan-700'}`}>
      {setor}
    </span>
  );
}

function Modal({ titulo, onClose, children, largura = 'max-w-lg' }: { titulo: string; onClose: () => void; children: React.ReactNode; largura?: string }) {
  return (
    <div className="fixed inset-0 z-[60] bg-slate-900/50 backdrop-blur-sm flex items-start sm:items-center justify-center p-4 overflow-y-auto print:hidden" onClick={onClose}>
      <div className={`bg-white rounded-2xl shadow-2xl w-full ${largura} my-8`} onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <h2 className="text-base font-bold text-slate-800">{titulo}</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600" aria-label="Fechar">
            <X size={18} />
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

const inputCls = 'w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 bg-white';
const labelCls = 'block text-xs font-semibold text-slate-600 mb-1';

// ─────────────────────────────────────────────────────────────────────────────

export default function CronogramaSetor() {
  const hoje = useMemo(() => toISODate(new Date()), []);

  const [atividades, setAtividades] = useState<Atividade[]>([]);
  const [escolas, setEscolas] = useState<EscolaOption[]>([]);
  const [visitasRegistradas, setVisitasRegistradas] = useState<VisitaRegistrada[]>([]);
  const [responsaveis, setResponsaveis] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [userName, setUserName] = useState('');
  const [readOnly, setReadOnly] = useState(false);

  const [mes, setMes] = useState(() => mesDe(toISODate(new Date())));
  const [aba, setAba] = useState<Aba>('calendario');
  const [filtroSetor, setFiltroSetor] = useState<'TODOS' | Setor>('TODOS');
  const [filtroTipo, setFiltroTipo] = useState<'TODOS' | TipoAtividade>('TODOS');
  const [filtroStatus, setFiltroStatus] = useState<FiltroStatus>('TODOS');
  const [busca, setBusca] = useState('');

  const [form, setForm] = useState<FormState | null>(null);
  const [buscaEscola, setBuscaEscola] = useState('');
  const [detalhe, setDetalhe] = useState<Atividade | null>(null);
  const [concluir, setConcluir] = useState<Atividade | null>(null);
  const [naoRealizada, setNaoRealizada] = useState<Atividade | null>(null);

  // ── Carga ─────────────────────────────────────────────────────────────────

  const fetchAtividades = useCallback(async () => {
    const todas: Atividade[] = [];
    for (let de = 0; ; de += PAGINA) {
      const { data, error } = await db
        .from('cronograma_atividades')
        .select('*')
        .order('data_prevista', { ascending: true })
        .range(de, de + PAGINA - 1);
      if (error) throw error;
      todas.push(...(data || []));
      if (!data || data.length < PAGINA) break;
    }
    setAtividades(todas);
  }, []);

  // Visitas já registradas na planilha — usadas para acusar automaticamente
  // visitas planejadas que já aconteceram. Falha aqui não impede a tela.
  const fetchVisitasRegistradas = useCallback(async () => {
    try {
      const { data, error } = await supabase.functions.invoke('google-sheets-visitas', { method: 'GET' });
      if (error) throw error;
      if (Array.isArray(data)) setVisitasRegistradas(data as VisitaRegistrada[]);
    } catch (e) {
      console.error('Erro ao buscar visitas registradas:', e);
    }
  }, []);

  const carregar = useCallback(async () => {
    setLoading(true);
    try {
      await Promise.all([fetchAtividades(), fetchVisitasRegistradas()]);
    } catch (e) {
      console.error(e);
      toast.error('Não foi possível carregar o cronograma.');
    } finally {
      setLoading(false);
    }
  }, [fetchAtividades, fetchVisitasRegistradas]);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setUserId(user.id);
        const { data: profile } = await db
          .from('profiles').select('full_name, role').eq('id', user.id).single();
        setUserName(profile?.full_name || user.email || '');
        setReadOnly(isReadOnlyRole(profile?.role || ''));
      }
    })();
    (async () => {
      const { data } = await supabase.from('schools').select('id, name, fde_code').order('name');
      if (data) setEscolas((data as EscolaOption[]).filter(e => normalizar(e.name) !== 'unidade regional de ensino'));
    })();
    (async () => {
      const { data } = await db
        .from('profiles').select('full_name').eq('role', 'regional_admin').order('full_name');
      if (data) setResponsaveis(Array.from(new Set((data as { full_name: string | null }[]).map(p => p.full_name).filter(Boolean) as string[])));
    })();
    carregar();
  }, [carregar]);

  // ── Derivados ─────────────────────────────────────────────────────────────

  const passaFiltros = useCallback((a: Atividade) =>
    (filtroSetor === 'TODOS' || a.setor === filtroSetor) &&
    (filtroTipo === 'TODOS' || a.tipo === filtroTipo), [filtroSetor, filtroTipo]);

  const doMes = useMemo(
    () => ordenarAtividades(atividades.filter(a => mesDe(a.data_prevista) === mes && passaFiltros(a))),
    [atividades, mes, passaFiltros],
  );

  const resumo = useMemo(() => resumoExecucao(doMes, hoje), [doMes, hoje]);

  // Pendências de confirmação de qualquer mês (data passou e ninguém informou).
  const pendentes = useMemo(
    () => ordenarAtividades(atividades.filter(a => aguardandoConfirmacao(a, hoje) && passaFiltros(a))),
    [atividades, hoje, passaFiltros],
  );

  const sugestoes = useMemo(
    () => sugestoesParaMes(atividades, mes).filter(passaFiltros),
    [atividades, mes, passaFiltros],
  );

  const porId = useMemo(() => new Map(atividades.map(a => [a.id, a])), [atividades]);

  const deteccoes = useMemo(() => {
    const m = new Map<string, VisitaRegistrada>();
    for (const a of atividades) {
      if (a.tipo !== 'VISITA' || a.status !== 'PLANEJADA' || a.data_prevista > hoje) continue;
      const v = visitaCorrespondente(a, visitasRegistradas);
      if (v) m.set(a.id, v);
    }
    return m;
  }, [atividades, visitasRegistradas, hoje]);

  const ultimaVisitaEscola = useMemo(() => {
    const m = new Map<string, string>();
    for (const v of visitasRegistradas) {
      const chave = (v.fde_code || '').trim() || normalizar(v.escola_nome);
      if (chave && (!m.has(chave) || v.data_visita > m.get(chave)!)) m.set(chave, v.data_visita);
    }
    return (e: EscolaOption) => m.get((e.fde_code || '').trim()) || m.get(normalizar(e.name)) || null;
  }, [visitasRegistradas]);

  const listaFiltrada = useMemo(() => {
    const q = normalizar(busca);
    return doMes.filter(a => {
      if (filtroStatus === 'AGUARDANDO' && !aguardandoConfirmacao(a, hoje)) return false;
      if (filtroStatus !== 'TODOS' && filtroStatus !== 'AGUARDANDO' && a.status !== filtroStatus) return false;
      if (!q) return true;
      return [a.titulo, a.escola_nome, a.responsavel, a.local, a.descricao, a.objetivo].some(c => normalizar(c).includes(q));
    });
  }, [doMes, busca, filtroStatus, hoje]);

  const semanas = useMemo(() => semanasDoMes(mes), [mes]);

  const porDia = useMemo(() => {
    const m = new Map<string, Atividade[]>();
    for (const a of doMes) m.set(a.data_prevista, [...(m.get(a.data_prevista) || []), a]);
    return m;
  }, [doMes]);

  // ── Ações ─────────────────────────────────────────────────────────────────

  const atualizarLocal = (id: string, patch: Partial<Atividade>) => {
    setAtividades(prev => prev.map(a => (a.id === id ? { ...a, ...patch } : a)));
    setDetalhe(prev => (prev && prev.id === id ? { ...prev, ...patch } : prev));
  };

  const atualizar = async (id: string, patch: Partial<Atividade>, msg: string) => {
    const { error } = await db.from('cronograma_atividades').update(patch).eq('id', id);
    if (error) {
      console.error(error);
      toast.error('Não foi possível salvar a alteração.');
      return false;
    }
    atualizarLocal(id, patch);
    toast.success(msg);
    return true;
  };

  const abrirNova = (data?: string, prefill?: Partial<FormState>) => {
    setBuscaEscola('');
    setForm({
      id: null,
      setor: filtroSetor === 'TODOS' ? 'SEOM' : filtroSetor,
      tipo: filtroTipo === 'TODOS' ? 'VISITA' : filtroTipo,
      titulo: '',
      descricao: '',
      responsavel: userName,
      local: '',
      data_prevista: data || dataSugerida(mes, hoje),
      hora_inicio: '',
      hora_fim: '',
      escolaIds: [],
      objetivo: '',
      repetir: 0,
      origem_id: null,
      ...prefill,
    });
  };

  const abrirEdicao = (a: Atividade) => {
    setDetalhe(null);
    setBuscaEscola('');
    setForm({
      id: a.id,
      setor: a.setor,
      tipo: a.tipo,
      titulo: a.titulo,
      descricao: a.descricao || '',
      responsavel: a.responsavel || '',
      local: a.local || '',
      data_prevista: a.data_prevista,
      hora_inicio: hora(a.hora_inicio),
      hora_fim: hora(a.hora_fim),
      escolaIds: a.escola_id ? [a.escola_id] : [],
      objetivo: a.objetivo || '',
      repetir: 0,
      origem_id: a.origem_id,
    });
  };

  const reprogramar = (a: Atividade) => {
    abrirNova(dataSugerida(mes, hoje), {
      setor: a.setor,
      tipo: 'VISITA',
      escolaIds: a.escola_id ? [a.escola_id] : [],
      objetivo: a.objetivo || '',
      responsavel: a.responsavel || userName,
      descricao: a.descricao || '',
      origem_id: a.id,
    });
  };

  const salvarForm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form) return;
    const visita = form.tipo === 'VISITA';
    const escolasSel = form.escolaIds.map(id => escolas.find(es => es.id === id)).filter(Boolean) as EscolaOption[];
    if (visita && !escolasSel.length) return void toast.error('Selecione a escola a ser visitada.');
    if (visita && !form.objetivo) return void toast.error('Informe o objetivo da visita.');
    if (!visita && !form.titulo.trim()) return void toast.error('Informe o título da atividade.');
    if (form.hora_inicio && form.hora_fim && form.hora_fim < form.hora_inicio) return void toast.error('O horário de término é anterior ao de início.');

    const base = {
      setor: form.setor,
      tipo: form.tipo,
      descricao: form.descricao.trim() || null,
      responsavel: form.responsavel.trim() || null,
      local: visita ? null : form.local.trim() || null,
      hora_inicio: form.hora_inicio || null,
      hora_fim: form.hora_fim || null,
      objetivo: visita ? form.objetivo : null,
    };
    const camposEscola = (es?: EscolaOption) => (visita && es
      ? { titulo: es.name, escola_id: es.id, escola_nome: es.name, fde_code: es.fde_code }
      : { titulo: form.titulo.trim(), escola_id: null, escola_nome: null, fde_code: null });

    setSaving(true);
    try {
      if (form.id) {
        const patch = { ...base, ...camposEscola(escolasSel[0]), data_prevista: form.data_prevista };
        const { error } = await db.from('cronograma_atividades').update(patch).eq('id', form.id);
        if (error) throw error;
        atualizarLocal(form.id, patch);
        toast.success('Atividade atualizada.');
      } else {
        const datas = datasRepeticao(form.data_prevista, form.repetir);
        const alvos = visita ? escolasSel : [undefined];
        const linhas = datas.flatMap(data => alvos.map(es => ({
          ...base,
          ...camposEscola(es),
          data_prevista: data,
          created_by: userId,
          origem_id: form.origem_id,
        })));
        const { data, error } = await db.from('cronograma_atividades').insert(linhas).select('*');
        if (error) throw error;
        setAtividades(prev => [...prev, ...(data || [])]);
        toast.success(linhas.length > 1 ? `${linhas.length} atividades incluídas no cronograma.` : 'Atividade incluída no cronograma.');
        if (form.data_prevista && mesDe(form.data_prevista) !== mes) setMes(mesDe(form.data_prevista));
      }
      setForm(null);
    } catch (err) {
      console.error(err);
      toast.error('Não foi possível salvar a atividade.');
    } finally {
      setSaving(false);
    }
  };

  const excluir = async (a: Atividade) => {
    if (!window.confirm(`Excluir "${a.titulo}" do cronograma?`)) return;
    const { error } = await db.from('cronograma_atividades').delete().eq('id', a.id);
    if (error) {
      console.error(error);
      toast.error('Não foi possível excluir a atividade.');
      return;
    }
    setAtividades(prev => prev.filter(x => x.id !== a.id));
    setDetalhe(null);
    toast.success('Atividade excluída.');
  };

  const cancelar = async (a: Atividade) => {
    if (!window.confirm(`Marcar "${a.titulo}" como cancelada? Atividades canceladas não entram no % de execução nem viram sugestão.`)) return;
    await atualizar(a.id, { status: 'CANCELADA' }, 'Atividade cancelada.');
  };

  const reabrir = async (a: Atividade) => {
    await atualizar(a.id, {
      status: 'PLANEJADA', data_realizada: null, observacoes_conclusao: null,
      motivo_nao_realizacao: null, participantes: null,
    }, 'Atividade reaberta.');
  };

  const descartarSugestao = async (a: Atividade) => {
    if (!window.confirm(`Deixar de sugerir a visita a ${a.escola_nome}?`)) return;
    await atualizar(a.id, { sugestao_descartada: true }, 'Sugestão descartada.');
  };

  // Confirma uma visita que já consta na planilha de Visitas às Escolas.
  const confirmarDetectada = async (a: Atividade, v: VisitaRegistrada) => {
    await atualizar(a.id, {
      status: 'CONCLUIDA', data_realizada: v.data_visita, visita_registrada: true,
      observacoes_conclusao: 'Confirmada pelo registro existente em Visitas às Escolas.',
    }, 'Visita confirmada como realizada.');
  };

  // ── Render ────────────────────────────────────────────────────────────────

  const kpis = [
    { label: 'Previstas no mês', valor: resumo.total, Icon: CalendarDays, cor: 'text-blue-600', bg: 'bg-blue-50' },
    { label: 'Concluídas', valor: resumo.concluidas, Icon: CheckCircle2, cor: 'text-emerald-600', bg: 'bg-emerald-50' },
    { label: 'Não realizadas', valor: resumo.naoRealizadas, Icon: XCircle, cor: 'text-red-600', bg: 'bg-red-50' },
    { label: 'Aguardando confirmação', valor: resumo.aguardando, Icon: Clock, cor: 'text-amber-600', bg: 'bg-amber-50' },
    { label: '% de execução', valor: resumo.percentual === null ? '—' : `${resumo.percentual}%`, Icon: BarChart3, cor: 'text-violet-600', bg: 'bg-violet-50' },
  ];

  const acoesRapidas = (a: Atividade) => {
    if (readOnly || a.status !== 'PLANEJADA') return null;
    return (
      <div className="flex gap-1.5 shrink-0">
        <button onClick={() => setConcluir(a)} className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700" title="Marcar como concluída">
          <Check size={14} /> Concluída
        </button>
        <button onClick={() => setNaoRealizada(a)} className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-red-200 text-red-700 bg-white text-xs font-semibold hover:bg-red-50" title="Marcar como não realizada">
          <X size={14} /> Não realizada
        </button>
      </div>
    );
  };

  const linhaResumo = (a: Atividade) => (
    <>
      <div className="flex items-center gap-1.5 flex-wrap">
        <SetorBadge setor={a.setor} />
        <TipoChip tipo={a.tipo} />
        <span className="font-semibold text-slate-800 text-sm">{a.titulo}</span>
      </div>
      <div className="text-xs text-slate-500 mt-1 flex flex-wrap gap-x-3 gap-y-0.5">
        <span className="inline-flex items-center gap-1"><CalendarDays size={12} /> {formatarData(a.data_prevista)}{a.hora_inicio && ` · ${hora(a.hora_inicio)}${a.hora_fim ? `–${hora(a.hora_fim)}` : ''}`}</span>
        {a.objetivo && <span className="inline-flex items-center gap-1"><School size={12} /> {a.objetivo}</span>}
        {a.local && <span className="inline-flex items-center gap-1"><MapPin size={12} /> {a.local}</span>}
        {a.responsavel && <span className="inline-flex items-center gap-1"><User size={12} /> {a.responsavel}</span>}
      </div>
    </>
  );

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-7xl mx-auto print:p-0 print:max-w-none">
      <div className="print:hidden space-y-6">
        {/* Cabeçalho */}
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
              <CalendarRange className="text-blue-600" size={28} />
              Cronograma de Atividades
            </h1>
            <p className="text-slate-500 text-sm mt-1">
              Planejamento mensal da SEOM e da SEFISC — previsto × realizado
            </p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <button onClick={carregar} className="flex items-center gap-2 px-3 py-2 text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 text-sm">
              <RefreshCw size={16} className={loading ? 'animate-spin' : ''} /> Atualizar
            </button>
            <button onClick={() => window.print()} className="flex items-center gap-2 px-3 py-2 text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 text-sm">
              <Printer size={16} /> Imprimir
            </button>
            {!readOnly && (
              <button onClick={() => abrirNova()} className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium">
                <Plus size={18} /> Nova atividade
              </button>
            )}
          </div>
        </div>

        {/* Mês + filtros */}
        <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-3 flex flex-col lg:flex-row lg:items-center gap-3">
          <div className="flex items-center gap-1">
            <button onClick={() => setMes(m => somarMeses(m, -1))} className="p-2 rounded-lg hover:bg-slate-100 text-slate-600" aria-label="Mês anterior"><ChevronLeft size={18} /></button>
            <span className="min-w-[170px] text-center font-bold text-slate-800">{nomeMes(mes)}</span>
            <button onClick={() => setMes(m => somarMeses(m, 1))} className="p-2 rounded-lg hover:bg-slate-100 text-slate-600" aria-label="Próximo mês"><ChevronRight size={18} /></button>
            {mes !== mesDe(hoje) && (
              <button onClick={() => setMes(mesDe(hoje))} className="ml-1 px-2.5 py-1 rounded-lg text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100">Hoje</button>
            )}
          </div>
          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg w-fit">
            {(['TODOS', ...SETORES] as const).map(s => (
              <button key={s} onClick={() => setFiltroSetor(s)} className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all ${filtroSetor === s ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
                {s === 'TODOS' ? 'Todos' : s}
              </button>
            ))}
          </div>
          <select value={filtroTipo} onChange={e => setFiltroTipo(e.target.value as typeof filtroTipo)} className={`${inputCls} lg:w-56`}>
            <option value="TODOS">Todos os tipos</option>
            {TIPOS_ATIVIDADE.map(t => <option key={t} value={t}>{TIPO_INFO[t].plural}</option>)}
          </select>
          <div className="flex flex-wrap gap-x-3 gap-y-1 lg:ml-auto">
            {TIPOS_ATIVIDADE.map(t => (
              <span key={t} className="inline-flex items-center gap-1 text-[11px] text-slate-500">
                <span className={`w-2 h-2 rounded-full ${TIPO_INFO[t].dot}`} /> {TIPO_INFO[t].label}
              </span>
            ))}
          </div>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {kpis.map(({ label, valor, Icon, cor, bg }) => (
            <div key={label} className="bg-white rounded-xl border border-slate-100 shadow-sm p-4 flex items-center gap-3">
              <div className={`w-10 h-10 rounded-lg ${bg} flex items-center justify-center shrink-0`}><Icon size={20} className={cor} /></div>
              <div className="min-w-0">
                <p className="text-[11px] text-slate-500 font-medium leading-tight">{label}</p>
                <p className="text-2xl font-bold text-slate-800">{valor}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Pendências de confirmação (qualquer mês) */}
        {pendentes.length > 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
            <h2 className="text-sm font-bold text-amber-800 flex items-center gap-2 mb-1">
              <AlertTriangle size={16} /> {pendentes.length} {pendentes.length === 1 ? 'atividade aguarda' : 'atividades aguardam'} confirmação
            </h2>
            <p className="text-xs text-amber-700 mb-3">A data prevista já passou. Informe se foi concluída — visitas concluídas são registradas automaticamente em Visitas às Escolas.</p>
            <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
              {pendentes.map(a => {
                const det = deteccoes.get(a.id);
                return (
                  <div key={a.id} className="bg-white rounded-lg border border-amber-100 p-3 flex flex-col md:flex-row md:items-center gap-2">
                    <button onClick={() => setDetalhe(a)} className="flex-1 min-w-0 text-left">
                      {linhaResumo(a)}
                      {det && (
                        <p className="text-xs text-emerald-700 font-semibold mt-1 inline-flex items-center gap-1">
                          <CheckCircle2 size={12} /> Visita encontrada em Visitas às Escolas em {formatarData(det.data_visita)}
                        </p>
                      )}
                    </button>
                    {det && !readOnly ? (
                      <div className="flex gap-1.5 shrink-0">
                        <button onClick={() => confirmarDetectada(a, det)} className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700">
                          <Check size={14} /> Confirmar realizada
                        </button>
                        <button onClick={() => setNaoRealizada(a)} className="px-2.5 py-1.5 rounded-lg border border-red-200 text-red-700 bg-white text-xs font-semibold hover:bg-red-50">Não realizada</button>
                      </div>
                    ) : acoesRapidas(a)}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Sugestões: visitas não realizadas em meses anteriores */}
        {sugestoes.length > 0 && (
          <div className="bg-white border border-violet-200 rounded-xl p-4">
            <h2 className="text-sm font-bold text-violet-800 flex items-center gap-2 mb-1">
              <Lightbulb size={16} /> Sugestões para {nomeMes(mes)}: {sugestoes.length} {sugestoes.length === 1 ? 'visita não realizada' : 'visitas não realizadas'}
            </h2>
            <p className="text-xs text-slate-500 mb-3">Visitas previstas em meses anteriores que não aconteceram. Inclua no cronograma ou descarte a sugestão.</p>
            <div className="grid md:grid-cols-2 gap-2">
              {sugestoes.map(a => (
                <div key={a.id} className="rounded-lg border border-violet-100 bg-violet-50/40 p-3 flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5"><SetorBadge setor={a.setor} /><span className="font-semibold text-sm text-slate-800 truncate">{a.escola_nome}</span></div>
                    <p className="text-xs text-slate-500 mt-0.5">Prevista em {formatarData(a.data_prevista)} · {a.objetivo || 'Sem objetivo'}</p>
                    {a.motivo_nao_realizacao && <p className="text-xs text-red-600 mt-0.5 line-clamp-2">Motivo: {a.motivo_nao_realizacao}</p>}
                  </div>
                  {!readOnly && (
                    <div className="flex flex-col gap-1 shrink-0">
                      <button onClick={() => reprogramar(a)} className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-violet-600 text-white text-xs font-semibold hover:bg-violet-700">
                        <Plus size={14} /> Incluir
                      </button>
                      <button onClick={() => descartarSugestao(a)} className="px-2.5 py-1 rounded-lg text-xs text-slate-500 hover:bg-slate-100">Descartar</button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Abas */}
        <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl w-full sm:w-fit">
          {([
            { key: 'calendario', label: 'Calendário', Icon: CalendarDays },
            { key: 'lista', label: 'Lista', Icon: ListChecks },
            { key: 'indicadores', label: 'Indicadores', Icon: BarChart3 },
          ] as const).map(({ key, label, Icon }) => (
            <button key={key} onClick={() => setAba(key)} className={`flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-all ${aba === key ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
              <Icon size={15} /> {label}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="flex justify-center py-20 text-slate-400"><Loader2 size={32} className="animate-spin" /></div>
        ) : aba === 'calendario' ? (
          <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
            <div className="grid grid-cols-7 bg-slate-50 border-b border-slate-100">
              {DIAS_SEMANA.map(d => <div key={d} className="px-2 py-2 text-[11px] font-bold text-slate-500 uppercase text-center">{d}</div>)}
            </div>
            {semanas.map((semana, i) => (
              <div key={i} className="grid grid-cols-7 border-b border-slate-100 last:border-b-0">
                {semana.map((dia, j) => {
                  if (!dia) return <div key={j} className="min-h-[72px] md:min-h-[110px] bg-slate-50/60 border-r border-slate-100 last:border-r-0" />;
                  const itens = porDia.get(dia) || [];
                  const fimDeSemana = j >= 5;
                  return (
                    <div
                      key={j}
                      onClick={() => !readOnly && abrirNova(dia)}
                      className={`min-h-[72px] md:min-h-[110px] p-1 md:p-1.5 border-r border-slate-100 last:border-r-0 ${fimDeSemana ? 'bg-slate-50/60' : ''} ${readOnly ? '' : 'cursor-pointer hover:bg-blue-50/40'} group`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className={`text-xs font-bold w-6 h-6 flex items-center justify-center rounded-full ${dia === hoje ? 'bg-blue-600 text-white' : 'text-slate-600'}`}>{Number(dia.slice(8))}</span>
                        {!readOnly && <Plus size={13} className="text-blue-400 opacity-0 group-hover:opacity-100 hidden md:block" />}
                      </div>
                      {/* Celular: só pontos coloridos */}
                      <div className="flex flex-wrap gap-1 md:hidden">
                        {itens.map(a => <span key={a.id} className={`w-2 h-2 rounded-full ${TIPO_INFO[a.tipo].dot} ${a.status === 'CANCELADA' ? 'opacity-30' : ''}`} />)}
                      </div>
                      <div className="hidden md:block space-y-1">
                        {itens.slice(0, MAX_CHIPS_DIA).map(a => {
                          const { Icon } = statusVisual(a, hoje);
                          return (
                            <button
                              key={a.id}
                              onClick={e => { e.stopPropagation(); setDetalhe(a); }}
                              title={`${TIPO_INFO[a.tipo].label} · ${a.titulo}`}
                              className={`w-full flex items-center gap-1 px-1.5 py-0.5 rounded border text-[11px] text-left truncate ${TIPO_INFO[a.tipo].chip} ${a.status === 'CANCELADA' ? 'line-through opacity-50' : ''}`}
                            >
                              <Icon size={11} className="shrink-0" />
                              {a.hora_inicio && <span className="font-semibold shrink-0">{hora(a.hora_inicio)}</span>}
                              <span className="truncate">{a.titulo}</span>
                            </button>
                          );
                        })}
                        {itens.length > MAX_CHIPS_DIA && (
                          <button
                            onClick={e => { e.stopPropagation(); setBusca(''); setFiltroStatus('TODOS'); setAba('lista'); }}
                            className="text-[11px] font-semibold text-blue-600 hover:underline px-1"
                          >
                            + {itens.length - MAX_CHIPS_DIA} mais
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        ) : aba === 'lista' ? (
          <div className="space-y-3">
            <div className="flex flex-col sm:flex-row gap-2">
              <div className="relative flex-1">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar por título, escola, responsável, local…" className={`${inputCls} pl-9`} />
              </div>
              <select value={filtroStatus} onChange={e => setFiltroStatus(e.target.value as FiltroStatus)} className={`${inputCls} sm:w-56`}>
                <option value="TODOS">Todos os status</option>
                <option value="PLANEJADA">Planejadas</option>
                <option value="AGUARDANDO">Aguardando confirmação</option>
                <option value="CONCLUIDA">Concluídas</option>
                <option value="NAO_REALIZADA">Não realizadas</option>
                <option value="CANCELADA">Canceladas</option>
              </select>
            </div>
            {listaFiltrada.length === 0 ? (
              <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-10 text-center text-slate-400 text-sm">
                <CalendarRange size={36} className="mx-auto mb-2 opacity-30" />
                Nenhuma atividade encontrada em {nomeMes(mes)}.
              </div>
            ) : semanas.map((semana, i) => {
              const dias = semana.filter(Boolean) as string[];
              const itens = listaFiltrada.filter(a => dias.includes(a.data_prevista));
              if (!itens.length) return null;
              return (
                <div key={i} className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
                  <div className="px-4 py-2 bg-slate-50 border-b border-slate-100 text-xs font-bold text-slate-600">
                    Semana {i + 1} · {formatarData(dias[0])} a {formatarData(dias[dias.length - 1])}
                    <span className="ml-2 font-medium text-slate-400">{itens.length} {itens.length === 1 ? 'atividade' : 'atividades'}</span>
                  </div>
                  <div className="divide-y divide-slate-100">
                    {itens.map(a => (
                      <div key={a.id} className={`p-3 flex flex-col md:flex-row md:items-center gap-2 ${a.status === 'CANCELADA' ? 'opacity-60' : ''}`}>
                        <button onClick={() => setDetalhe(a)} className="flex-1 min-w-0 text-left">{linhaResumo(a)}</button>
                        <div className="flex items-center gap-2 flex-wrap md:justify-end">
                          {a.tipo === 'VISITA' && a.visita_registrada && (
                            <span className="text-[11px] text-teal-700 bg-teal-50 border border-teal-200 rounded-full px-2 py-0.5 font-semibold">Em Visitas às Escolas</span>
                          )}
                          <StatusBadge a={a} hoje={hoje} />
                          {acoesRapidas(a)}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <Indicadores atividades={atividades} doMes={doMes} mes={mes} hoje={hoje} passaFiltros={passaFiltros} />
        )}
      </div>

      {/* Versão de impressão */}
      <div className="hidden print:block text-black">
        <h1 className="text-lg font-bold">Cronograma de Atividades — {filtroSetor === 'TODOS' ? 'SEOM / SEFISC' : filtroSetor} — {nomeMes(mes)}</h1>
        <p className="text-xs mb-3">
          Previstas: {resumo.total} · Concluídas: {resumo.concluidas} · Não realizadas: {resumo.naoRealizadas} · Execução: {resumo.percentual === null ? '—' : `${resumo.percentual}%`}
        </p>
        <table className="w-full text-[11px] border-collapse">
          <thead>
            <tr className="bg-gray-100">
              {['Data', 'Horário', 'Setor', 'Tipo', 'Atividade', 'Responsável', 'Situação'].map(h => <th key={h} className="border border-gray-300 px-2 py-1 text-left">{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {doMes.map(a => (
              <tr key={a.id}>
                <td className="border border-gray-300 px-2 py-1 whitespace-nowrap">{formatarData(a.data_prevista)}</td>
                <td className="border border-gray-300 px-2 py-1 whitespace-nowrap">{hora(a.hora_inicio)}{a.hora_fim ? `–${hora(a.hora_fim)}` : ''}</td>
                <td className="border border-gray-300 px-2 py-1">{a.setor}</td>
                <td className="border border-gray-300 px-2 py-1">{TIPO_INFO[a.tipo].label}</td>
                <td className="border border-gray-300 px-2 py-1">{a.titulo}{a.objetivo ? ` — ${a.objetivo}` : ''}{a.local ? ` (${a.local})` : ''}</td>
                <td className="border border-gray-300 px-2 py-1">{a.responsavel || ''}</td>
                <td className="border border-gray-300 px-2 py-1">{statusVisual(a, hoje).label}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ── Modal: nova / editar ─────────────────────────────────────────── */}
      {form && (
        <Modal titulo={form.id ? 'Editar atividade' : form.origem_id ? 'Reprogramar visita' : 'Nova atividade'} onClose={() => setForm(null)} largura="max-w-2xl">
          <form onSubmit={salvarForm} className="space-y-4">
            {form.origem_id && porId.get(form.origem_id) && (
              <div className="text-xs bg-violet-50 border border-violet-200 text-violet-800 rounded-lg px-3 py-2">
                Reprogramação da visita prevista em {formatarData(porId.get(form.origem_id)!.data_prevista)} que não foi realizada.
              </div>
            )}
            <div className="grid sm:grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Setor</label>
                <div className="flex gap-1 bg-slate-100 p-1 rounded-lg">
                  {SETORES.map(s => (
                    <button type="button" key={s} onClick={() => setForm({ ...form, setor: s })} className={`flex-1 py-1.5 rounded-md text-xs font-bold ${form.setor === s ? 'bg-white shadow-sm text-slate-800' : 'text-slate-500'}`}>{s}</button>
                  ))}
                </div>
              </div>
              <div>
                <label className={labelCls}>Tipo de atividade</label>
                <select
                  value={form.tipo}
                  disabled={!!form.origem_id}
                  onChange={e => setForm({ ...form, tipo: e.target.value as TipoAtividade })}
                  className={inputCls}
                >
                  {TIPOS_ATIVIDADE.map(t => <option key={t} value={t}>{TIPO_INFO[t].label}</option>)}
                </select>
              </div>
            </div>

            {form.tipo === 'VISITA' ? (
              <>
                <div>
                  <label className={labelCls}>
                    {form.id || form.origem_id ? 'Escola' : 'Escola(s)'} <span className="font-normal text-slate-400">{!form.id && !form.origem_id && '— selecione uma ou mais; cada uma vira uma visita'}</span>
                  </label>
                  {form.escolaIds.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mb-2">
                      {form.escolaIds.map(id => (
                        <span key={id} className="inline-flex items-center gap-1 pl-2 pr-1 py-0.5 rounded-full bg-teal-50 border border-teal-200 text-teal-800 text-xs font-medium">
                          {escolas.find(e => e.id === id)?.name || 'Escola'}
                          <button type="button" onClick={() => setForm({ ...form, escolaIds: form.escolaIds.filter(x => x !== id) })} className="p-0.5 rounded-full hover:bg-teal-100" aria-label="Remover escola"><X size={12} /></button>
                        </span>
                      ))}
                    </div>
                  )}
                  <div className="relative">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input value={buscaEscola} onChange={e => setBuscaEscola(e.target.value)} placeholder="Buscar escola por nome ou código FDE" className={`${inputCls} pl-8`} />
                  </div>
                  <div className="mt-1 max-h-44 overflow-y-auto border border-slate-100 rounded-lg divide-y divide-slate-50">
                    {escolas
                      .filter(e => {
                        const q = normalizar(buscaEscola);
                        return !q || normalizar(e.name).includes(q) || (e.fde_code || '').includes(q);
                      })
                      .slice(0, 60)
                      .map(e => {
                        const sel = form.escolaIds.includes(e.id);
                        const ultima = ultimaVisitaEscola(e);
                        const unica = !!form.id || !!form.origem_id;
                        return (
                          <button
                            type="button"
                            key={e.id}
                            onClick={() => setForm({
                              ...form,
                              escolaIds: unica ? [e.id] : sel ? form.escolaIds.filter(x => x !== e.id) : [...form.escolaIds, e.id],
                            })}
                            className={`w-full flex items-center justify-between gap-2 px-3 py-1.5 text-left text-sm ${sel ? 'bg-teal-50' : 'hover:bg-slate-50'}`}
                          >
                            <span className="flex items-center gap-2 min-w-0">
                              <span className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${sel ? 'bg-teal-600 border-teal-600 text-white' : 'border-slate-300'}`}>{sel && <Check size={11} />}</span>
                              <span className="truncate">{e.name}</span>
                            </span>
                            <span className="text-[11px] text-slate-400 shrink-0">{ultima ? `última: ${formatarData(ultima)}` : 'sem visita registrada'}</span>
                          </button>
                        );
                      })}
                  </div>
                </div>
                <div>
                  <label className={labelCls}>Objetivo da visita</label>
                  <select value={form.objetivo} onChange={e => setForm({ ...form, objetivo: e.target.value })} className={inputCls}>
                    <option value="">Selecione…</option>
                    {OBJETIVOS_VISITA.map(o => <option key={o} value={o}>{o}</option>)}
                  </select>
                </div>
              </>
            ) : (
              <div className="grid sm:grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>Título</label>
                  <input value={form.titulo} onChange={e => setForm({ ...form, titulo: e.target.value })} className={inputCls} placeholder={`Ex.: ${form.tipo === 'FORMACAO' ? 'Formação de gestores – Zeladoria' : form.tipo === 'LIVE' ? 'Live – Prestação de contas PDDE' : form.tipo === 'REUNIAO' ? 'Reunião com fiscais de contrato' : 'Descrição curta'}`} />
                </div>
                <div>
                  <label className={labelCls}>Local / link</label>
                  <input value={form.local} onChange={e => setForm({ ...form, local: e.target.value })} className={inputCls} placeholder="Sala, auditório, Teams, YouTube…" />
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="col-span-2">
                <label className={labelCls}>Data prevista</label>
                <input type="date" required value={form.data_prevista} onChange={e => setForm({ ...form, data_prevista: e.target.value })} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Início</label>
                <input type="time" value={form.hora_inicio} onChange={e => setForm({ ...form, hora_inicio: e.target.value })} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Término</label>
                <input type="time" value={form.hora_fim} onChange={e => setForm({ ...form, hora_fim: e.target.value })} className={inputCls} />
              </div>
            </div>

            {!form.id && !form.origem_id && (
              <div>
                <label className={labelCls}><Repeat size={12} className="inline mr-1" />Repetir no mês</label>
                <div className="flex gap-1 bg-slate-100 p-1 rounded-lg w-fit">
                  {([[0, 'Não repetir'], [7, 'Semanal'], [14, 'Quinzenal']] as const).map(([v, l]) => (
                    <button type="button" key={v} onClick={() => setForm({ ...form, repetir: v })} className={`px-3 py-1.5 rounded-md text-xs font-semibold ${form.repetir === v ? 'bg-white shadow-sm text-slate-800' : 'text-slate-500'}`}>{l}</button>
                  ))}
                </div>
                {form.repetir > 0 && form.data_prevista && (
                  <p className="text-[11px] text-slate-500 mt-1">
                    Datas: {datasRepeticao(form.data_prevista, form.repetir).map(formatarData).join(', ')}
                  </p>
                )}
              </div>
            )}

            <div>
              <label className={labelCls}>Responsável(is)</label>
              <input list="cronograma-responsaveis" value={form.responsavel} onChange={e => setForm({ ...form, responsavel: e.target.value })} className={inputCls} placeholder="Nome do servidor (separe vários por vírgula)" />
              <datalist id="cronograma-responsaveis">
                {responsaveis.map(r => <option key={r} value={r} />)}
              </datalist>
            </div>

            <div>
              <label className={labelCls}>Descrição / pauta</label>
              <textarea rows={3} value={form.descricao} onChange={e => setForm({ ...form, descricao: e.target.value })} className={inputCls} placeholder="Detalhes, público-alvo, pauta…" />
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <button type="button" onClick={() => setForm(null)} className="px-4 py-2 rounded-lg text-sm text-slate-600 hover:bg-slate-100">Cancelar</button>
              <button type="submit" disabled={saving} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-60">
                {saving && <Loader2 size={16} className="animate-spin" />}
                {form.id ? 'Salvar alterações' : 'Incluir no cronograma'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* ── Modal: detalhe ───────────────────────────────────────────────── */}
      {detalhe && (
        <Modal titulo={TIPO_INFO[detalhe.tipo].label} onClose={() => setDetalhe(null)}>
          <div className="space-y-4">
            <div>
              <div className="flex items-center gap-1.5 flex-wrap mb-1"><SetorBadge setor={detalhe.setor} /><TipoChip tipo={detalhe.tipo} /><StatusBadge a={detalhe} hoje={hoje} /></div>
              <h3 className="text-lg font-bold text-slate-800">{detalhe.titulo}</h3>
            </div>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
              <div><dt className="text-[11px] text-slate-400 font-semibold uppercase">Data prevista</dt><dd className="text-slate-700">{formatarData(detalhe.data_prevista)}{detalhe.hora_inicio && ` · ${hora(detalhe.hora_inicio)}${detalhe.hora_fim ? `–${hora(detalhe.hora_fim)}` : ''}`}</dd></div>
              {detalhe.responsavel && <div><dt className="text-[11px] text-slate-400 font-semibold uppercase">Responsável</dt><dd className="text-slate-700">{detalhe.responsavel}</dd></div>}
              {detalhe.objetivo && <div><dt className="text-[11px] text-slate-400 font-semibold uppercase">Objetivo</dt><dd className="text-slate-700">{detalhe.objetivo}</dd></div>}
              {detalhe.fde_code && <div><dt className="text-[11px] text-slate-400 font-semibold uppercase">Código FDE</dt><dd className="text-slate-700">{detalhe.fde_code}</dd></div>}
              {detalhe.local && <div><dt className="text-[11px] text-slate-400 font-semibold uppercase">Local</dt><dd className="text-slate-700 break-words">{detalhe.local}</dd></div>}
              {detalhe.data_realizada && <div><dt className="text-[11px] text-slate-400 font-semibold uppercase">Realizada em</dt><dd className="text-slate-700">{formatarData(detalhe.data_realizada)}</dd></div>}
              {detalhe.participantes !== null && <div><dt className="text-[11px] text-slate-400 font-semibold uppercase">Participantes</dt><dd className="text-slate-700">{detalhe.participantes}</dd></div>}
            </dl>
            {detalhe.descricao && <p className="text-sm text-slate-600 whitespace-pre-wrap bg-slate-50 rounded-lg p-3">{detalhe.descricao}</p>}
            {detalhe.observacoes_conclusao && <p className="text-sm text-emerald-800 whitespace-pre-wrap bg-emerald-50 rounded-lg p-3"><b>Conclusão:</b> {detalhe.observacoes_conclusao}</p>}
            {detalhe.motivo_nao_realizacao && <p className="text-sm text-red-800 whitespace-pre-wrap bg-red-50 rounded-lg p-3"><b>Motivo da não realização:</b> {detalhe.motivo_nao_realizacao}</p>}
            {detalhe.tipo === 'VISITA' && detalhe.visita_registrada && (
              <p className="text-xs text-teal-800 bg-teal-50 border border-teal-200 rounded-lg px-3 py-2">Visita registrada em Visitas às Escolas.</p>
            )}
            {detalhe.origem_id && porId.get(detalhe.origem_id) && (
              <p className="text-xs text-violet-800 bg-violet-50 border border-violet-200 rounded-lg px-3 py-2">Reprogramada da visita prevista em {formatarData(porId.get(detalhe.origem_id)!.data_prevista)}.</p>
            )}
            {deteccoes.get(detalhe.id) && (
              <p className="text-xs text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">Há registro desta visita em Visitas às Escolas em {formatarData(deteccoes.get(detalhe.id)!.data_visita)}.</p>
            )}

            {!readOnly && (
              <div className="flex flex-wrap gap-2 pt-3 border-t border-slate-100">
                {detalhe.status === 'PLANEJADA' && (
                  <>
                    {deteccoes.get(detalhe.id) ? (
                      <button onClick={() => confirmarDetectada(detalhe, deteccoes.get(detalhe.id)!)} className="flex items-center gap-1 px-3 py-2 rounded-lg bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700"><Check size={14} /> Confirmar realizada</button>
                    ) : (
                      <button onClick={() => setConcluir(detalhe)} className="flex items-center gap-1 px-3 py-2 rounded-lg bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700"><Check size={14} /> Concluída</button>
                    )}
                    <button onClick={() => setNaoRealizada(detalhe)} className="flex items-center gap-1 px-3 py-2 rounded-lg border border-red-200 text-red-700 text-xs font-semibold hover:bg-red-50"><X size={14} /> Não realizada</button>
                    <button onClick={() => abrirEdicao(detalhe)} className="flex items-center gap-1 px-3 py-2 rounded-lg border border-slate-200 text-slate-600 text-xs font-semibold hover:bg-slate-50"><Pencil size={14} /> Editar</button>
                    <button onClick={() => cancelar(detalhe)} className="flex items-center gap-1 px-3 py-2 rounded-lg border border-slate-200 text-slate-600 text-xs font-semibold hover:bg-slate-50"><Ban size={14} /> Cancelar</button>
                  </>
                )}
                {detalhe.status !== 'PLANEJADA' && !detalhe.visita_registrada && (
                  <button onClick={() => reabrir(detalhe)} className="flex items-center gap-1 px-3 py-2 rounded-lg border border-slate-200 text-slate-600 text-xs font-semibold hover:bg-slate-50"><RotateCcw size={14} /> Reabrir</button>
                )}
                {!detalhe.visita_registrada && (
                  <button onClick={() => excluir(detalhe)} className="flex items-center gap-1 px-3 py-2 rounded-lg text-red-600 text-xs font-semibold hover:bg-red-50 ml-auto"><Trash2 size={14} /> Excluir</button>
                )}
              </div>
            )}
          </div>
        </Modal>
      )}

      {concluir && (
        <ConcluirModal
          atividade={concluir}
          hoje={hoje}
          userName={userName}
          deteccao={deteccoes.get(concluir.id) || null}
          onClose={() => setConcluir(null)}
          onSalvo={(patch, visita) => {
            atualizarLocal(concluir.id, patch);
            if (visita) setVisitasRegistradas(prev => [...prev, visita]);
            setConcluir(null);
          }}
        />
      )}

      {naoRealizada && (
        <Modal titulo="Atividade não realizada" onClose={() => setNaoRealizada(null)}>
          <NaoRealizadaForm
            atividade={naoRealizada}
            onCancel={() => setNaoRealizada(null)}
            onConfirm={async motivo => {
              const ok = await atualizar(naoRealizada.id, { status: 'NAO_REALIZADA', motivo_nao_realizacao: motivo, data_realizada: null }, 'Registrado como não realizada.');
              if (ok) setNaoRealizada(null);
            }}
          />
        </Modal>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Conclusão: para visita, registra também em Visitas às Escolas.
// ─────────────────────────────────────────────────────────────────────────────

function ConcluirModal({ atividade: a, hoje, userName, deteccao, onClose, onSalvo }: {
  atividade: Atividade;
  hoje: string;
  userName: string;
  deteccao: VisitaRegistrada | null;
  onClose: () => void;
  onSalvo: (patch: Partial<Atividade>, visita: VisitaRegistrada | null) => void;
}) {
  const visita = a.tipo === 'VISITA';
  const [data, setData] = useState(deteccao?.data_visita || (a.data_prevista <= hoje ? a.data_prevista : hoje));
  const [obs, setObs] = useState('');
  const [participantes, setParticipantes] = useState('');
  // Se a visita já consta na planilha, não registra de novo (evita duplicidade).
  const [registrar, setRegistrar] = useState(visita && !deteccao);
  const [salvando, setSalvando] = useState(false);

  const salvar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (data > hoje) return void toast.error('A data de realização não pode ser futura.');
    setSalvando(true);
    try {
      let registrada: VisitaRegistrada | null = null;
      if (visita && registrar) {
        const registro = {
          id: `crono-${a.id}`,
          data_visita: data,
          escola_nome: a.escola_nome || a.titulo,
          fde_code: a.fde_code || '',
          visitante: a.responsavel || userName,
          objetivo: a.objetivo || 'Outros',
          observacoes: [obs.trim(), `Planejada no Cronograma ${a.setor}`].filter(Boolean).join(' — '),
          data_registro: new Date().toISOString(),
        };
        const { error } = await supabase.functions.invoke('google-sheets-visitas', { body: registro });
        if (error) throw new Error('visitas');
        registrada = { data_visita: registro.data_visita, escola_nome: registro.escola_nome, fde_code: registro.fde_code };
      }

      const patch: Partial<Atividade> = {
        status: 'CONCLUIDA',
        data_realizada: data,
        observacoes_conclusao: obs.trim() || null,
        participantes: participantes === '' ? null : Number(participantes),
        motivo_nao_realizacao: null,
        ...(visita && (registrar || deteccao) ? { visita_registrada: true, visita_registro_id: registrar ? `crono-${a.id}` : null } : {}),
      };
      const { error } = await db.from('cronograma_atividades').update(patch).eq('id', a.id);
      if (error) {
        // A visita já foi para a planilha: avisa para não registrar de novo.
        if (registrada) toast.error('A visita foi registrada em Visitas às Escolas, mas o cronograma não foi atualizado. Use "Confirmar realizada" em vez de registrar de novo.', { duration: 8000 });
        throw error;
      }
      toast.success(registrada ? 'Concluída e registrada em Visitas às Escolas.' : 'Atividade concluída.');
      onSalvo(patch, registrada);
    } catch (err) {
      console.error(err);
      if (err instanceof Error && err.message === 'visitas') toast.error('Não foi possível registrar a visita em Visitas às Escolas. Nada foi alterado.');
      else toast.error('Não foi possível concluir a atividade.');
    } finally {
      setSalvando(false);
    }
  };

  return (
    <Modal titulo="Concluir atividade" onClose={onClose}>
      <form onSubmit={salvar} className="space-y-4">
        <div className="text-sm"><TipoChip tipo={a.tipo} /> <b className="text-slate-800 ml-1">{a.titulo}</b><p className="text-xs text-slate-500 mt-1">Prevista para {formatarData(a.data_prevista)}</p></div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>Data de realização</label>
            <input type="date" required max={hoje} value={data} onChange={e => setData(e.target.value)} className={inputCls} />
          </div>
          {TIPOS_COM_PARTICIPANTES.includes(a.tipo) && (
            <div>
              <label className={labelCls}><Users size={12} className="inline mr-1" />Participantes</label>
              <input type="number" min={0} value={participantes} onChange={e => setParticipantes(e.target.value)} className={inputCls} placeholder="Opcional" />
            </div>
          )}
        </div>
        <div>
          <label className={labelCls}>Observações</label>
          <textarea rows={3} value={obs} onChange={e => setObs(e.target.value)} className={inputCls} placeholder={visita ? 'O que foi verificado na visita…' : 'Resultados, encaminhamentos…'} />
        </div>
        {visita && (
          deteccao ? (
            <div className="text-xs bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-lg px-3 py-2">
              Esta visita já consta em Visitas às Escolas ({formatarData(deteccao.data_visita)}) e não será registrada novamente.
            </div>
          ) : (
            <label className="flex items-start gap-2 text-sm text-slate-700 bg-teal-50 border border-teal-200 rounded-lg px-3 py-2 cursor-pointer">
              <input type="checkbox" checked={registrar} onChange={e => setRegistrar(e.target.checked)} className="mt-0.5" />
              <span>Registrar automaticamente em <b>Visitas às Escolas</b> (visitante: {a.responsavel || userName}; objetivo: {a.objetivo || 'Outros'})</span>
            </label>
          )
        )}
        <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg text-sm text-slate-600 hover:bg-slate-100">Voltar</button>
          <button type="submit" disabled={salvando} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 disabled:opacity-60">
            {salvando && <Loader2 size={16} className="animate-spin" />} Confirmar conclusão
          </button>
        </div>
      </form>
    </Modal>
  );
}

function NaoRealizadaForm({ atividade: a, onCancel, onConfirm }: { atividade: Atividade; onCancel: () => void; onConfirm: (motivo: string) => Promise<void> }) {
  const [motivo, setMotivo] = useState('');
  const [salvando, setSalvando] = useState(false);
  return (
    <form
      onSubmit={async e => {
        e.preventDefault();
        if (!motivo.trim()) return void toast.error('Informe o motivo.');
        setSalvando(true);
        await onConfirm(motivo.trim());
        setSalvando(false);
      }}
      className="space-y-4"
    >
      <div className="text-sm"><TipoChip tipo={a.tipo} /> <b className="text-slate-800 ml-1">{a.titulo}</b><p className="text-xs text-slate-500 mt-1">Prevista para {formatarData(a.data_prevista)}</p></div>
      <div>
        <label className={labelCls}>Motivo</label>
        <textarea rows={3} autoFocus value={motivo} onChange={e => setMotivo(e.target.value)} className={inputCls} placeholder="Ex.: falta de carro oficial, escola fechada, demanda urgente…" />
      </div>
      {a.tipo === 'VISITA' && (
        <p className="text-xs text-violet-800 bg-violet-50 border border-violet-200 rounded-lg px-3 py-2">
          A visita aparecerá como sugestão no cronograma dos próximos meses até ser reprogramada ou descartada.
        </p>
      )}
      <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
        <button type="button" onClick={onCancel} className="px-4 py-2 rounded-lg text-sm text-slate-600 hover:bg-slate-100">Voltar</button>
        <button type="submit" disabled={salvando} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-semibold hover:bg-red-700 disabled:opacity-60">
          {salvando && <Loader2 size={16} className="animate-spin" />} Registrar
        </button>
      </div>
    </form>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Indicadores: execução por tipo, setor e responsável no mês + tendência.
// ─────────────────────────────────────────────────────────────────────────────

function BarraExecucao({ concluidas, naoRealizadas, planejadas }: { concluidas: number; naoRealizadas: number; planejadas: number }) {
  const total = concluidas + naoRealizadas + planejadas;
  if (!total) return <div className="h-2.5 rounded-full bg-slate-100" />;
  const pct = (n: number) => `${(n / total) * 100}%`;
  return (
    <div className="h-2.5 rounded-full bg-slate-100 overflow-hidden flex">
      <div className="bg-emerald-500" style={{ width: pct(concluidas) }} />
      <div className="bg-red-400" style={{ width: pct(naoRealizadas) }} />
      <div className="bg-blue-300" style={{ width: pct(planejadas) }} />
    </div>
  );
}

function BlocoExecucao({ titulo, grupos }: { titulo: string; grupos: { chave: string; r: ResumoExecucao }[] }) {
  return (
    <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-4">
      <h3 className="text-sm font-semibold text-slate-700 mb-3">{titulo}</h3>
      {grupos.length === 0 ? <p className="text-sm text-slate-400 py-6 text-center">Sem atividades no mês.</p> : (
        <div className="space-y-3">
          {grupos.map(({ chave, r }) => (
            <div key={chave}>
              <div className="flex justify-between text-xs mb-1">
                <span className="font-medium text-slate-700 truncate pr-2">{chave}</span>
                <span className="text-slate-500 shrink-0">{r.concluidas}/{r.total}{r.percentual !== null && <b className="ml-1.5 text-slate-700">{r.percentual}%</b>}</span>
              </div>
              <BarraExecucao concluidas={r.concluidas} naoRealizadas={r.naoRealizadas} planejadas={r.planejadas} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Indicadores({ atividades, doMes, mes, hoje, passaFiltros }: {
  atividades: Atividade[];
  doMes: Atividade[];
  mes: string;
  hoje: string;
  passaFiltros: (a: Atividade) => boolean;
}) {
  const agrupar = (chaves: (a: Atividade) => string[]) => {
    const m = new Map<string, Atividade[]>();
    for (const a of doMes) for (const k of chaves(a)) m.set(k, [...(m.get(k) || []), a]);
    return Array.from(m.entries())
      .map(([k, lista]) => ({ chave: k, r: resumoExecucao(lista, hoje) }))
      .filter(g => g.r.total > 0)
      .sort((x, y) => y.r.total - x.r.total);
  };

  const porTipo = agrupar(a => [TIPO_INFO[a.tipo].plural]);
  const porSetor = agrupar(a => [a.setor]);
  const porResponsavel = agrupar(a => (a.responsavel || 'Sem responsável').split(/[,;]/).map(s => s.trim()).filter(Boolean));

  const tendencia = Array.from({ length: 6 }, (_, i) => somarMeses(mes, i - 5)).map(m => ({
    mes: m,
    r: resumoExecucao(atividades.filter(a => mesDe(a.data_prevista) === m && passaFiltros(a)), hoje),
  }));

  const visitasMes = doMes.filter(a => a.tipo === 'VISITA');
  const reprogramadas = doMes.filter(a => a.origem_id).length;
  const participantes = doMes.reduce((s, a) => s + (a.participantes || 0), 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-slate-500">
        <span className="inline-flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-emerald-500" /> Concluídas</span>
        <span className="inline-flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-red-400" /> Não realizadas</span>
        <span className="inline-flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-blue-300" /> Planejadas / aguardando</span>
        <span>% = concluídas ÷ (concluídas + não realizadas)</span>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Visitas previstas', valor: visitasMes.filter(a => a.status !== 'CANCELADA').length },
          { label: 'Visitas registradas', valor: visitasMes.filter(a => a.visita_registrada).length },
          { label: 'Reprogramadas no mês', valor: reprogramadas },
          { label: 'Participantes (formações, oficinas…)', valor: participantes },
        ].map(k => (
          <div key={k.label} className="bg-white rounded-xl border border-slate-100 shadow-sm p-4">
            <p className="text-[11px] text-slate-500 font-medium">{k.label}</p>
            <p className="text-2xl font-bold text-slate-800">{k.valor}</p>
          </div>
        ))}
      </div>

      <div className="grid md:grid-cols-3 gap-4">
        <BlocoExecucao titulo="Por tipo de atividade" grupos={porTipo} />
        <BlocoExecucao titulo="Por setor" grupos={porSetor} />
        <BlocoExecucao titulo="Por responsável" grupos={porResponsavel} />
      </div>

      <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-4">
        <h3 className="text-sm font-semibold text-slate-700 mb-3">Execução nos últimos 6 meses</h3>
        <div className="grid grid-cols-6 gap-2 items-end h-40">
          {tendencia.map(({ mes: m, r }) => (
            <div key={m} className="flex flex-col items-center justify-end h-full gap-1">
              <span className="text-xs font-bold text-slate-700">{r.percentual === null ? '—' : `${r.percentual}%`}</span>
              <div className="w-full max-w-[48px] bg-slate-100 rounded-t-md flex-1 flex items-end overflow-hidden">
                <div className={`w-full ${m === mes ? 'bg-blue-600' : 'bg-blue-300'}`} style={{ height: `${r.percentual ?? 0}%` }} />
              </div>
              <span className="text-[11px] text-slate-500 capitalize">{new Date(`${m}-01T00:00:00`).toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '')}</span>
              <span className="text-[10px] text-slate-400">{r.concluidas}/{r.total}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

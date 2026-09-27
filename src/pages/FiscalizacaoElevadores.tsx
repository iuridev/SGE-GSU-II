import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
  ArrowUpCircle, ClipboardCheck, Loader2, Lock, CalendarClock, CheckCircle2, AlertTriangle,
  ShieldAlert, Phone, ChevronDown, FileDown, FileText, Search, Megaphone, TrendingUp,
  History, LayoutDashboard, School as SchoolIcon, Timer, UserX, Pencil, Building2, Table2, ExternalLink,
} from 'lucide-react';
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, BarChart, Bar, Legend,
} from 'recharts';
import { supabase } from '../lib/supabase';
import { resolveViewRole, isReadOnlyRole } from '../lib/roles';
import { addTimbradoAllPages } from '../lib/pdfTimbrado';
import { EnviarAlertaModal } from '../components/EnviarAlertaModal';
import { FormularioFiscalizacaoElevador } from '../components/FormularioFiscalizacaoElevador';
import { FUNCTION_NAME } from '../lib/fiscalizacaoElevadoresApi';
import {
  EMPRESAS_CONTATO, PRAZO_EMERGENCIAL_MIN, getQuinzena, ultimasQuinzenas, diasRestantes,
  resumirQuinzena, topNaoConformidades, escolasPendentes, textoDaPergunta, rowsToCsv,
  linhaParaRegistro, type LinhaPlanilha, type EscolaRef, type FiscalizacaoRegistro, type Quinzena, type StatusFiscalizacao,
} from '../lib/fiscalizacaoElevadores';

const ADMIN_LIKE_ROLES = ['regional_admin', 'supervisor', 'dirigente', 'ure_servico'];
const HISTORICO_QUINZENAS = 8;

interface CurrentUser { id: string; full_name: string; role: string; readOnly: boolean; school_id: string | null }
type AdminTab = 'painel' | 'escolas' | 'registros';
type SchoolTab = 'fiscalizar' | 'historico';

const STATUS_UI: Record<StatusFiscalizacao | 'pendente', { label: string; cls: string; dot: string }> = {
  conforme: { label: 'Conforme', cls: 'bg-emerald-100 text-emerald-700', dot: 'bg-emerald-500' },
  atencao: { label: 'Atenção', cls: 'bg-amber-100 text-amber-700', dot: 'bg-amber-500' },
  critico: { label: 'Crítico', cls: 'bg-red-100 text-red-700', dot: 'bg-red-500' },
  pendente: { label: 'Pendente', cls: 'bg-slate-100 text-slate-600', dot: 'bg-slate-400' },
};

const fmtData = (iso: string | null) => (iso ? iso.split('-').reverse().join('/') : '—');
const fmtDataHora = (iso: string | null) => (iso ? new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '—');

function StatusBadge({ status }: { status: StatusFiscalizacao | 'pendente' }) {
  const s = STATUS_UI[status];
  return <span className={`inline-flex items-center gap-1.5 text-[10px] font-black px-2.5 py-1 rounded-full uppercase ${s.cls}`}><span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />{s.label}</span>;
}

function Kpi({ icon, label, valor, sub, tom }: { icon: React.ReactNode; label: string; valor: string; sub?: string; tom: 'blue' | 'emerald' | 'red' | 'amber' }) {
  const tons = {
    blue: 'bg-blue-50 text-blue-600', emerald: 'bg-emerald-50 text-emerald-600',
    red: 'bg-red-50 text-red-600', amber: 'bg-amber-50 text-amber-600',
  };
  return (
    <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-4 flex items-start gap-3">
      <div className={`p-2.5 rounded-2xl shrink-0 ${tons[tom]}`}>{icon}</div>
      <div className="min-w-0">
        <p className="text-[10px] font-black uppercase tracking-wide text-slate-400">{label}</p>
        <p className="text-2xl font-black text-slate-900 leading-tight">{valor}</p>
        {sub && <p className="text-[11px] font-medium text-slate-500 truncate">{sub}</p>}
      </div>
    </div>
  );
}

function RegistroDetalhe({ r }: { r: FiscalizacaoRegistro }) {
  return (
    <div className="px-4 pb-4 pt-1 space-y-3 text-xs">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <Info k="Elevador" v={r.is_operational ? 'Funcionando' : `Parado desde ${fmtData(r.down_since)}`} ruim={!r.is_operational} />
        <Info k="Visita da empresa" v={r.had_visit ? 'Sim' : 'Não houve'} ruim={!r.had_visit} />
        <Info k="Chamado" v={r.had_call ? `${r.call_type ?? ''}${r.call_response_minutes !== null ? ` · ${r.call_response_minutes} min` : ' · sem atendimento registrado'}` : 'Nenhum'}
          ruim={r.call_type === 'emergencial' && (r.call_response_minutes ?? 0) > PRAZO_EMERGENCIAL_MIN} />
        <Info k="Pessoa presa" v={r.person_trapped ? 'Sim' : 'Não'} ruim={r.person_trapped} />
      </div>
      {r.nonconformities.length > 0 && (
        <div className="space-y-1.5">
          <p className="font-black uppercase tracking-wide text-[10px] text-red-600">Não conformidades</p>
          {r.nonconformities.map(id => (
            <div key={id} className="bg-red-50 border border-red-100 rounded-xl px-3 py-2">
              <p className="font-bold text-slate-800">{textoDaPergunta(id)}</p>
              {r.observations?.[id] && <p className="text-slate-600 mt-0.5">“{r.observations[id]}”</p>}
            </div>
          ))}
        </div>
      )}
      {r.general_notes && (
        <div className="bg-slate-50 border border-slate-100 rounded-xl px-3 py-2">
          <p className="font-black uppercase tracking-wide text-[10px] text-slate-400 mb-0.5">Observações gerais</p>
          <p className="text-slate-700">{r.general_notes}</p>
        </div>
      )}
      <p className="text-[10px] text-slate-400 font-medium">Enviado por {r.inspector_name ?? '—'} em {fmtDataHora(r.updated_at ?? r.created_at)}</p>
    </div>
  );
}

function Info({ k, v, ruim }: { k: string; v: string; ruim?: boolean }) {
  return (
    <div className={`rounded-xl px-3 py-2 border ${ruim ? 'bg-red-50 border-red-100' : 'bg-slate-50 border-slate-100'}`}>
      <p className="text-[10px] font-black uppercase tracking-wide text-slate-400">{k}</p>
      <p className={`font-bold first-letter:uppercase ${ruim ? 'text-red-700' : 'text-slate-700'}`}>{v}</p>
    </div>
  );
}

function ContatosEmpresas() {
  const [aberto, setAberto] = useState(false);
  return (
    <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
      <button onClick={() => setAberto(a => !a)} className="w-full flex items-center justify-between gap-3 px-4 py-3.5 text-left">
        <span className="flex items-center gap-2 text-sm font-black text-slate-800"><Phone size={16} className="text-blue-600" /> Abrir chamado — telefones das empresas (24 h)</span>
        <ChevronDown size={18} className={`text-slate-400 transition-transform ${aberto ? 'rotate-180' : ''}`} />
      </button>
      {aberto && (
        <div className="px-4 pb-4 grid grid-cols-1 md:grid-cols-3 gap-3">
          {EMPRESAS_CONTATO.map(e => (
            <div key={e.nome} className="rounded-2xl bg-slate-50 border border-slate-100 p-3">
              <p className="text-sm font-black text-slate-900">{e.nome}</p>
              <p className="text-[11px] text-slate-500 font-medium mb-1.5">{e.regiao}</p>
              {e.fones.map(f => <p key={f} className="text-sm font-bold text-blue-700">{f}</p>)}
            </div>
          ))}
          <p className="md:col-span-3 text-[11px] text-slate-500 font-medium flex items-start gap-1.5">
            <ShieldAlert size={13} className="shrink-0 mt-0.5 text-red-500" />
            Pessoa presa? Acione a empresa e, se necessário, o Corpo de Bombeiros. Nunca tente resgatar sem equipe técnica habilitada. Prazo contratual emergencial: {PRAZO_EMERGENCIAL_MIN} minutos.
          </p>
        </div>
      )}
    </div>
  );
}

export function FiscalizacaoElevadores() {
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [escolas, setEscolas] = useState<EscolaRef[]>([]);
  const [regs, setRegs] = useState<FiscalizacaoRegistro[]>([]);
  const [semEscolaVinculada, setSemEscolaVinculada] = useState(false);
  const [sheetUrl, setSheetUrl] = useState<string | null>(null);

  const [adminTab, setAdminTab] = useState<AdminTab>('painel');
  const [schoolTab, setSchoolTab] = useState<SchoolTab>('fiscalizar');
  const [editando, setEditando] = useState(false);
  const [expandido, setExpandido] = useState<string | null>(null);

  const [busca, setBusca] = useState('');
  const [filtroStatus, setFiltroStatus] = useState<'todos' | StatusFiscalizacao | 'pendente'>('todos');
  const [qSelecionada, setQSelecionada] = useState<string>('');
  const [showAlerta, setShowAlerta] = useState(false);

  const atual = useMemo(() => getQuinzena(), []);
  const quinzenas = useMemo(() => ultimasQuinzenas(HISTORICO_QUINZENAS), []);
  const isAdmin = !!user && ADMIN_LIKE_ROLES.includes(user.role);

  useEffect(() => { void carregar(); }, []);

  async function carregar() {
    setLoading(true);
    try {
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (!authUser) return;
      const { data: profile } = await (supabase as any)
        .from('profiles').select('full_name, role, school_id').eq('id', authUser.id).single();
      const rawRole = profile?.role || '';
      const u: CurrentUser = {
        id: authUser.id,
        full_name: profile?.full_name || authUser.email || 'Usuário',
        role: resolveViewRole(rawRole),
        readOnly: isReadOnlyRole(rawRole),
        school_id: profile?.school_id || null,
      };
      setUser(u);
      const admin = ADMIN_LIKE_ROLES.includes(u.role);

      let listaEscolas: EscolaRef[] = [];
      if (admin) {
        const { data } = await (supabase as any)
          .from('schools').select('id, name').eq('has_elevator', true).order('name');
        listaEscolas = data ?? [];
      } else if (u.school_id) {
        const { data } = await (supabase as any).from('schools').select('id, name').eq('id', u.school_id).single();
        if (data) listaEscolas = [data];
      } else {
        setSemEscolaVinculada(true);
      }
      setEscolas(listaEscolas);

      const { data: resp, error } = await supabase.functions.invoke(FUNCTION_NAME, { method: 'GET' });
      if (error) throw error;
      const linhas: LinhaPlanilha[] = Array.isArray(resp?.inspections) ? resp.inspections : [];
      setSheetUrl(typeof resp?.sheetUrl === 'string' ? resp.sheetUrl : null);
      setRegs(
        linhas
          .map(linhaParaRegistro)
          .filter(r => r.id && r.period_start >= quinzenas[0].inicio)
          .sort((a, b) => b.period_start.localeCompare(a.period_start)),
      );
    } catch (err: any) {
      console.error(err);
      toast.error('Erro ao carregar as fiscalizações de elevadores.');
    } finally {
      setLoading(false);
    }
  }

  const nomeEscola = useMemo(() => new Map(escolas.map(e => [e.id, e.name])), [escolas]);
  const restam = diasRestantes(atual);

  const resumo = useMemo(() => resumirQuinzena(escolas, regs, atual), [escolas, regs, atual]);
  const pendentes = useMemo(() => escolasPendentes(escolas, regs, atual), [escolas, regs, atual]);
  const tendencia = useMemo(() => quinzenas.map(q => {
    const r = resumirQuinzena(escolas, regs, q);
    return { periodo: q.label.split('/')[0] + '/' + q.label.split('/')[1], Adesão: r.adesao, Conformidade: r.scoreMedio ?? 0 };
  }), [escolas, regs, quinzenas]);
  const topNC = useMemo(() => topNaoConformidades(regs.filter(r => r.period_start >= quinzenas[quinzenas.length - 3].inicio)), [regs, quinzenas]);

  const regAtualPorEscola = useMemo(() => {
    const m = new Map<string, FiscalizacaoRegistro>();
    regs.filter(r => r.period_start === atual.inicio).forEach(r => m.set(r.school_id, r));
    return m;
  }, [regs, atual]);

  const linhasEscolas = useMemo(() => escolas
    .map(e => {
      const r = regAtualPorEscola.get(e.id) ?? null;
      return { escola: e, reg: r, status: (r ? r.status : 'pendente') as StatusFiscalizacao | 'pendente', omissoes: pendentes.find(p => p.escola.id === e.id)?.quinzenasSemResposta ?? 0 };
    })
    .filter(l => filtroStatus === 'todos' || l.status === filtroStatus)
    .filter(l => !busca.trim() || l.escola.name.toLowerCase().includes(busca.trim().toLowerCase())),
  [escolas, regAtualPorEscola, pendentes, filtroStatus, busca]);

  const qRegistros: Quinzena = quinzenas.find(q => q.inicio === qSelecionada) ?? atual;
  const registrosDaQuinzena = useMemo(
    () => regs.filter(r => r.period_start === qRegistros.inicio && nomeEscola.has(r.school_id))
      .sort((a, b) => (nomeEscola.get(a.school_id) ?? '').localeCompare(nomeEscola.get(b.school_id) ?? '', 'pt-BR')),
    [regs, qRegistros, nomeEscola],
  );

  const conformidadeCor = (v: number | null) => (v === null ? 'text-slate-400' : v >= 90 ? 'text-emerald-600' : v >= 70 ? 'text-amber-600' : 'text-red-600');

  function resumoTexto(r: FiscalizacaoRegistro): string {
    return r.nonconformities.map(id => `${textoDaPergunta(id)}${r.observations?.[id] ? ` (${r.observations[id]})` : ''}`).join('; ');
  }

  function exportarPDF() {
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    const res = resumirQuinzena(escolas, regs, qRegistros);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(15, 23, 42);
    doc.text(`FISCALIZAÇÃO QUINZENAL DE ELEVADORES — ${qRegistros.label}`, 14, 36);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(100, 116, 139);
    doc.text(`Gerado em ${new Date().toLocaleString('pt-BR')}  ·  Adesão: ${res.respondidas}/${res.totalEscolas} (${res.adesao}%)  ·  Conformidade média: ${res.scoreMedio ?? '—'}%  ·  Parados: ${res.parados}  ·  Críticas: ${res.criticas}`, 14, 41);

    autoTable(doc, {
      startY: 46,
      head: [['Escola', 'Fiscal Setorial', 'Situação', 'Conf.', 'Elevador', 'Visita', 'Chamado', 'Não conformidades / observações']],
      body: registrosDaQuinzena.map(r => [
        nomeEscola.get(r.school_id) ?? '', r.inspector_name ?? '—', STATUS_UI[r.status].label,
        r.score !== null ? `${r.score}%` : '—', r.is_operational ? 'Funcionando' : `Parado (${fmtData(r.down_since)})`,
        r.had_visit ? 'Sim' : 'Não',
        r.had_call ? `${r.call_type}${r.call_response_minutes !== null ? ` ${r.call_response_minutes}min` : ''}${r.person_trapped ? ' · pessoa presa' : ''}` : '—',
        [resumoTexto(r), r.general_notes].filter(Boolean).join(' | ') || '—',
      ]),
      styles: { fontSize: 7, cellPadding: 2, overflow: 'linebreak' },
      headStyles: { fillColor: [15, 23, 42], textColor: [251, 191, 36], fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      columnStyles: { 0: { cellWidth: 48 }, 1: { cellWidth: 30 }, 2: { cellWidth: 18 }, 3: { cellWidth: 12 }, 4: { cellWidth: 28 }, 5: { cellWidth: 12 }, 6: { cellWidth: 30 } },
    });

    if (qRegistros.inicio === atual.inicio && pendentes.length > 0) {
      autoTable(doc, {
        head: [['Escolas que ainda não responderam', 'Quinzenas seguidas sem resposta', 'Última fiscalização']],
        body: pendentes.map(p => [p.escola.name, String(p.quinzenasSemResposta), fmtData(p.ultimaFiscalizacao)]),
        styles: { fontSize: 7, cellPadding: 2 },
        headStyles: { fillColor: [153, 27, 27], textColor: 255 },
        margin: { top: 30 },
      });
    }
    addTimbradoAllPages(doc);
    doc.save(`fiscalizacao_elevadores_${qRegistros.inicio}.pdf`);
  }

  function exportarCSV() {
    const csv = rowsToCsv([
      ['Escola', 'Quinzena', 'Fiscal Setorial', 'Situação', 'Conformidade %', 'Elevador funcionando', 'Parado desde', 'Visita da empresa', 'Chamado', 'Tipo', 'Minutos até atendimento', 'Pessoa presa', 'Não conformidades', 'Observações'],
      ...registrosDaQuinzena.map(r => [
        nomeEscola.get(r.school_id), qRegistros.label, r.inspector_name, STATUS_UI[r.status].label, r.score,
        r.is_operational ? 'Sim' : 'Não', r.down_since, r.had_visit ? 'Sim' : 'Não', r.had_call ? 'Sim' : 'Não',
        r.call_type, r.call_response_minutes, r.person_trapped ? 'Sim' : 'Não', resumoTexto(r), r.general_notes,
      ]),
    ]);
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `fiscalizacao_elevadores_${qRegistros.inicio}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  if (loading) {
    return <div className="flex items-center justify-center py-32"><Loader2 className="animate-spin text-blue-600" size={36} /></div>;
  }

  const prazoTexto = restam < 0 ? 'Prazo encerrado' : restam === 0 ? 'Último dia da quinzena' : `Faltam ${restam} dia${restam > 1 ? 's' : ''}`;
  const meuRegistro = user?.school_id ? regAtualPorEscola.get(user.school_id) ?? null : null;
  const minhaEscola = escolas[0] ?? null;

  return (
    <div className="space-y-6 pb-16 max-w-6xl mx-auto">
      {/* Cabeçalho */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-slate-900 via-blue-950 to-blue-800 text-white p-5 sm:p-7 shadow-xl">
        <div className="absolute -right-8 -top-8 opacity-10"><ArrowUpCircle size={220} /></div>
        <div className="relative flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="p-3.5 bg-white/15 backdrop-blur rounded-2xl shrink-0"><ArrowUpCircle size={30} /></div>
            <div>
              <h1 className="text-xl sm:text-2xl font-black tracking-tight">Fiscalização de Elevadores</h1>
              <p className="text-blue-100/80 text-xs sm:text-sm font-medium">Acompanhamento quinzenal do contrato de manutenção</p>
            </div>
          </div>
          <div className="flex items-center gap-2.5 bg-white/10 backdrop-blur border border-white/15 rounded-2xl px-4 py-2.5">
            <CalendarClock size={20} className="text-amber-300" />
            <div>
              <p className="text-[10px] font-black uppercase tracking-wide text-blue-200">Quinzena atual</p>
              <p className="text-sm font-black">{atual.label} <span className="text-amber-300 font-bold">· {prazoTexto}</span></p>
            </div>
          </div>
        </div>
      </div>

      {user?.readOnly && (
        <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 text-amber-700 px-4 py-3 rounded-xl text-xs font-bold uppercase tracking-wide">
          <Lock size={14} /> Modo somente leitura — este perfil não pode enviar fiscalizações.
        </div>
      )}

      {/* ============================ VISÃO DA ESCOLA ============================ */}
      {!isAdmin && (
        <div className="max-w-3xl mx-auto space-y-5">
          {semEscolaVinculada || !minhaEscola ? (
            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5 text-sm font-bold text-amber-800">
              Seu usuário não está vinculado a uma escola. Peça à URE para ajustar o cadastro.
            </div>
          ) : (
            <>
              <div className="flex items-center gap-2 text-sm font-bold text-slate-600"><Building2 size={16} className="text-blue-600" /> {minhaEscola.name}</div>

              <div className="flex gap-1 bg-slate-100 p-1 rounded-2xl">
                {([['fiscalizar', 'Fiscalizar', ClipboardCheck], ['historico', 'Meu histórico', History]] as const).map(([id, label, Icon]) => (
                  <button key={id} onClick={() => setSchoolTab(id)}
                    className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs sm:text-sm font-black transition-all ${schoolTab === id ? 'bg-white text-blue-700 shadow' : 'text-slate-500'}`}>
                    <Icon size={15} /> {label}
                  </button>
                ))}
              </div>

              {schoolTab === 'fiscalizar' && (
                <>
                  {meuRegistro && !editando ? (
                    <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
                      <div className="flex items-center gap-3 p-5">
                        <div className="p-3 rounded-2xl bg-emerald-50 text-emerald-600"><CheckCircle2 size={26} /></div>
                        <div className="flex-1 min-w-0">
                          <p className="text-base font-black text-slate-900">Fiscalização de {atual.label} enviada</p>
                          <p className="text-xs text-slate-500 font-medium">Você pode corrigir as respostas até {fmtData(atual.fim)}, fim da quinzena.</p>
                        </div>
                        <StatusBadge status={meuRegistro.status} />
                      </div>
                      <RegistroDetalhe r={meuRegistro} />
                      {!user?.readOnly && (
                        <div className="px-4 pb-4">
                          <button onClick={() => setEditando(true)} className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-black">
                            <Pencil size={14} /> Corrigir respostas
                          </button>
                        </div>
                      )}
                    </div>
                  ) : user?.readOnly ? null : (
                    <>
                      <div className="flex items-start gap-3 bg-blue-50 border border-blue-100 rounded-2xl p-4 text-xs text-blue-900 font-medium">
                        <Timer size={18} className="shrink-0 text-blue-600" />
                        <p><b>Leva cerca de 2 minutos.</b> Percorra o elevador, toque em <b>Conforme</b>, <b>Problema</b> ou <b>N/A</b> e use “Tudo conforme” em cada bloco quando estiver tudo certo. Só os problemas pedem descrição.</p>
                      </div>
                      <FormularioFiscalizacaoElevador
                        escola={minhaEscola}
                        quinzena={atual}
                        inspector={{ id: user!.id, name: user!.full_name }}
                        existente={meuRegistro}
                        onSaved={async () => { setEditando(false); await carregar(); }}
                      />
                    </>
                  )}
                </>
              )}

              {schoolTab === 'historico' && (
                <div className="space-y-3">
                  {regs.length === 0 && <p className="text-center text-sm text-slate-400 font-medium py-10">Nenhuma fiscalização enviada ainda.</p>}
                  {regs.map(r => (
                    <div key={r.id} className="bg-white rounded-2xl border border-slate-200 shadow-sm">
                      <button onClick={() => setExpandido(expandido === r.id ? null : r.id)} className="w-full flex items-center justify-between gap-3 p-4 text-left">
                        <div>
                          <p className="text-sm font-black text-slate-800">{fmtData(r.period_start)} a {fmtData(r.period_end)}</p>
                          <p className="text-[11px] text-slate-500 font-medium">{r.nonconformities.length} não conformidade(s) · {r.score ?? '—'}% conforme</p>
                        </div>
                        <div className="flex items-center gap-2"><StatusBadge status={r.status} /><ChevronDown size={16} className={`text-slate-400 transition-transform ${expandido === r.id ? 'rotate-180' : ''}`} /></div>
                      </button>
                      {expandido === r.id && <RegistroDetalhe r={r} />}
                    </div>
                  ))}
                </div>
              )}
              <ContatosEmpresas />
            </>
          )}
        </div>
      )}

      {/* ============================ VISÃO DA URE ============================ */}
      {isAdmin && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex gap-1 bg-slate-100 p-1 rounded-2xl">
              {([['painel', 'Painel', LayoutDashboard], ['escolas', 'Escolas', SchoolIcon], ['registros', 'Registros', FileText]] as const).map(([id, label, Icon]) => (
                <button key={id} onClick={() => setAdminTab(id)}
                  className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-black transition-all ${adminTab === id ? 'bg-white text-blue-700 shadow' : 'text-slate-500'}`}>
                  <Icon size={15} /> {label}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
            {sheetUrl && (
              <a href={sheetUrl} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black shadow-md">
                <Table2 size={14} /> Abrir planilha de dados <ExternalLink size={12} />
              </a>
            )}
            {!user?.readOnly && pendentes.length > 0 && (
              <button onClick={() => setShowAlerta(true)} className="flex items-center gap-2 px-4 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-black shadow-md">
                <Megaphone size={14} /> Cobrar {pendentes.length} pendente{pendentes.length > 1 ? 's' : ''}
              </button>
            )}
            </div>
          </div>

          {escolas.length === 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5 text-sm font-bold text-amber-800">
              Nenhuma escola está marcada com elevador (campo “Possui elevador” no cadastro da escola).
            </div>
          )}

          {/* ---- PAINEL ---- */}
          {adminTab === 'painel' && escolas.length > 0 && (
            <div className="space-y-5">
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <Kpi tom="blue" icon={<ClipboardCheck size={20} />} label="Adesão na quinzena" valor={`${resumo.adesao}%`} sub={`${resumo.respondidas} de ${resumo.totalEscolas} escolas`} />
                <Kpi tom="emerald" icon={<CheckCircle2 size={20} />} label="Conformidade média" valor={resumo.scoreMedio !== null ? `${resumo.scoreMedio}%` : '—'} sub={`${resumo.conformes} conforme · ${resumo.atencao} atenção`} />
                <Kpi tom={resumo.parados > 0 ? 'red' : 'emerald'} icon={<AlertTriangle size={20} />} label="Elevadores parados" valor={String(resumo.parados)} sub={`${resumo.criticas} fiscalização(ões) crítica(s)`} />
                <Kpi tom={resumo.chamadosLentos + resumo.pessoasPresas > 0 ? 'red' : 'amber'} icon={<UserX size={20} />} label="Chamados / ocorrências" valor={String(resumo.chamados)} sub={`${resumo.chamadosLentos} fora do prazo de ${PRAZO_EMERGENCIAL_MIN} min · ${resumo.pessoasPresas} pessoa(s) presa(s)`} />
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
                <section className="lg:col-span-3 bg-white rounded-3xl border border-slate-200 shadow-sm p-5">
                  <h3 className="flex items-center gap-2 text-sm font-black text-slate-800 mb-4"><TrendingUp size={16} className="text-blue-600" /> Evolução por quinzena</h3>
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={tendencia} margin={{ left: -20, right: 8, top: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                        <XAxis dataKey="periodo" tick={{ fontSize: 10 }} />
                        <YAxis domain={[0, 100]} tick={{ fontSize: 10 }} unit="%" />
                        <Tooltip formatter={(v) => `${v}%`} />
                        <Legend wrapperStyle={{ fontSize: 11 }} />
                        <Line type="monotone" dataKey="Adesão" stroke="#2563eb" strokeWidth={2.5} dot={{ r: 3 }} />
                        <Line type="monotone" dataKey="Conformidade" stroke="#059669" strokeWidth={2.5} dot={{ r: 3 }} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </section>

                <section className="lg:col-span-2 bg-white rounded-3xl border border-slate-200 shadow-sm p-5">
                  <h3 className="text-sm font-black text-slate-800 mb-1">Situação das escolas</h3>
                  <p className="text-[11px] text-slate-500 font-medium mb-4">Quinzena {atual.label}</p>
                  {(() => {
                    const partes = [
                      { k: 'conforme' as const, n: resumo.conformes }, { k: 'atencao' as const, n: resumo.atencao },
                      { k: 'critico' as const, n: resumo.criticas }, { k: 'pendente' as const, n: resumo.totalEscolas - resumo.respondidas },
                    ];
                    return (
                      <>
                        <div className="flex h-4 rounded-full overflow-hidden bg-slate-100 mb-4">
                          {partes.map(p => p.n > 0 && <div key={p.k} className={STATUS_UI[p.k].dot} style={{ width: `${(p.n / Math.max(resumo.totalEscolas, 1)) * 100}%` }} title={`${STATUS_UI[p.k].label}: ${p.n}`} />)}
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          {partes.map(p => (
                            <button key={p.k} onClick={() => { setFiltroStatus(p.k); setAdminTab('escolas'); }}
                              className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-slate-50 hover:bg-slate-100 text-left">
                              <span className="flex items-center gap-2 text-xs font-bold text-slate-600"><span className={`w-2.5 h-2.5 rounded-full ${STATUS_UI[p.k].dot}`} />{STATUS_UI[p.k].label}</span>
                              <span className="text-base font-black text-slate-900">{p.n}</span>
                            </button>
                          ))}
                        </div>
                      </>
                    );
                  })()}
                </section>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                <section className="bg-white rounded-3xl border border-slate-200 shadow-sm p-5">
                  <h3 className="text-sm font-black text-slate-800 mb-1">Não conformidades mais frequentes</h3>
                  <p className="text-[11px] text-slate-500 font-medium mb-3">Últimas 3 quinzenas — base para o relatório do Fiscal Técnico</p>
                  {topNC.length === 0 ? (
                    <p className="text-sm text-slate-400 font-medium py-8 text-center">Nenhuma não conformidade registrada.</p>
                  ) : (
                    <div style={{ height: Math.max(180, topNC.length * 46) }}>
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={topNC} layout="vertical" margin={{ left: 0, right: 16 }}>
                          <XAxis type="number" allowDecimals={false} tick={{ fontSize: 10 }} />
                          <YAxis type="category" dataKey="texto" width={150} tick={{ fontSize: 10 }} tickFormatter={(t: string) => (t.length > 26 ? t.slice(0, 25) + '…' : t)} />
                          <Tooltip />
                          <Bar dataKey="total" name="Ocorrências" fill="#dc2626" radius={[0, 6, 6, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </section>

                <section className="bg-white rounded-3xl border border-slate-200 shadow-sm p-5">
                  <h3 className="text-sm font-black text-slate-800 mb-1">Ainda sem resposta</h3>
                  <p className="text-[11px] text-slate-500 font-medium mb-3">Ordenadas por quinzenas seguidas sem fiscalização</p>
                  {pendentes.length === 0 ? (
                    <p className="flex items-center justify-center gap-2 text-sm text-emerald-600 font-bold py-8"><CheckCircle2 size={18} /> Todas as escolas responderam!</p>
                  ) : (
                    <div className="max-h-72 overflow-y-auto space-y-1.5 pr-1">
                      {pendentes.map(p => (
                        <div key={p.escola.id} className="flex items-center justify-between gap-3 bg-slate-50 rounded-xl px-3 py-2 text-xs">
                          <span className="min-w-0 truncate font-bold text-slate-700">{p.escola.name}</span>
                          {p.quinzenasSemResposta > 0
                            ? <span className="shrink-0 text-[10px] font-black px-2 py-1 rounded-full bg-red-100 text-red-700">{p.quinzenasSemResposta} anterior{p.quinzenasSemResposta > 1 ? 'es' : ''} em falta</span>
                            : <span className="shrink-0 text-[10px] font-black px-2 py-1 rounded-full bg-slate-200 text-slate-600">aguardando</span>}
                        </div>
                      ))}
                    </div>
                  )}
                </section>
              </div>
            </div>
          )}

          {/* ---- ESCOLAS ---- */}
          {adminTab === 'escolas' && (
            <div className="space-y-3">
              <div className="flex flex-wrap gap-2">
                <div className="relative flex-1 min-w-[200px]">
                  <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar escola…"
                    className="w-full pl-9 pr-3 py-2.5 rounded-xl border-2 border-slate-200 focus:border-blue-400 outline-none text-sm bg-white" />
                </div>
                <select value={filtroStatus} onChange={e => setFiltroStatus(e.target.value as typeof filtroStatus)}
                  className="px-3 py-2.5 rounded-xl border-2 border-slate-200 text-sm font-bold bg-white">
                  <option value="todos">Todas as situações</option>
                  <option value="pendente">Pendentes</option>
                  <option value="conforme">Conformes</option>
                  <option value="atencao">Atenção</option>
                  <option value="critico">Críticas</option>
                </select>
              </div>
              <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden divide-y divide-slate-100">
                {linhasEscolas.length === 0 && <p className="text-center text-sm text-slate-400 font-medium py-10">Nenhuma escola encontrada.</p>}
                {linhasEscolas.map(l => (
                  <div key={l.escola.id}>
                    <button disabled={!l.reg} onClick={() => setExpandido(expandido === l.escola.id ? null : l.escola.id)}
                      className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left hover:bg-slate-50 disabled:hover:bg-transparent">
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-slate-800 truncate">{l.escola.name}</p>
                        <p className="text-[11px] text-slate-500 font-medium">
                          {l.reg ? `${l.reg.inspector_name ?? '—'} · ${fmtDataHora(l.reg.updated_at ?? l.reg.created_at)}` : l.omissoes > 0 ? `${l.omissoes} quinzena(s) anterior(es) sem resposta` : 'Aguardando resposta'}
                        </p>
                      </div>
                      <div className="shrink-0 flex items-center gap-3">
                        {l.reg && <span className={`text-sm font-black ${conformidadeCor(l.reg.score)}`}>{l.reg.score ?? '—'}%</span>}
                        {l.reg && !l.reg.is_operational && <span className="text-[10px] font-black px-2 py-1 rounded-full bg-red-600 text-white uppercase">Parado</span>}
                        <StatusBadge status={l.status} />
                      </div>
                    </button>
                    {expandido === l.escola.id && l.reg && <RegistroDetalhe r={l.reg} />}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ---- REGISTROS ---- */}
          {adminTab === 'registros' && (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <select value={qRegistros.inicio} onChange={e => setQSelecionada(e.target.value)}
                  className="px-3 py-2.5 rounded-xl border-2 border-slate-200 text-sm font-bold bg-white">
                  {[...quinzenas].reverse().map(q => <option key={q.inicio} value={q.inicio}>Quinzena {q.label}</option>)}
                </select>
                <div className="flex gap-2">
                  <button onClick={exportarCSV} disabled={registrosDaQuinzena.length === 0} className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white border border-slate-200 hover:bg-slate-50 disabled:opacity-50 text-slate-700 text-xs font-black"><FileDown size={14} /> CSV</button>
                  <button onClick={exportarPDF} disabled={registrosDaQuinzena.length === 0} className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white text-xs font-black"><FileDown size={14} /> PDF para relatório</button>
                </div>
              </div>
              <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden divide-y divide-slate-100">
                {registrosDaQuinzena.length === 0 && <p className="text-center text-sm text-slate-400 font-medium py-10">Nenhuma fiscalização enviada nesta quinzena.</p>}
                {registrosDaQuinzena.map(r => (
                  <div key={r.id}>
                    <button onClick={() => setExpandido(expandido === r.id ? null : r.id)} className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left hover:bg-slate-50">
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-slate-800 truncate">{nomeEscola.get(r.school_id)}</p>
                        <p className="text-[11px] text-slate-500 font-medium">{r.nonconformities.length} não conformidade(s) · {r.inspector_name ?? '—'}</p>
                      </div>
                      <div className="shrink-0 flex items-center gap-3">
                        <span className={`text-sm font-black ${conformidadeCor(r.score)}`}>{r.score ?? '—'}%</span>
                        <StatusBadge status={r.status} />
                        <ChevronDown size={16} className={`text-slate-400 transition-transform ${expandido === r.id ? 'rotate-180' : ''}`} />
                      </div>
                    </button>
                    {expandido === r.id && <RegistroDetalhe r={r} />}
                  </div>
                ))}
              </div>
            </div>
          )}

          <ContatosEmpresas />

          {showAlerta && (
            <EnviarAlertaModal
              escolasSugeridas={pendentes.map(p => ({ id: p.escola.id, nome: p.escola.name }))}
              mensagemSugerida={`A fiscalização quinzenal do elevador (${atual.label}) ainda não foi respondida. Acesse "Fiscalização de Elevadores" e responda o checklist rápido (cerca de 2 minutos).`}
              onClose={() => setShowAlerta(false)}
            />
          )}
        </>
      )}
    </div>
  );
}

export default FiscalizacaoElevadores;

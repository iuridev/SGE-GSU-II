import { useState, useEffect, useMemo, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { resolveViewRole } from '../lib/roles';
import { WATER_REPORTING_HARD_START } from './Dashboard';
import { addTimbradoAllPages } from '../lib/pdfTimbrado';
import {
  fetchManejoFromSheet, normalizeName, matchNames, determinarStatus, temPendenciaManejo,
  type ManejoSheetRow, type StatusManejo,
} from '../lib/manejoArboreo';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine,
} from 'recharts';
import {
  Lock, Loader2, RefreshCw, FileDown, TrendingDown, TrendingUp, Minus,
  Droplets, TreeDeciduous, AlertTriangle, CheckCircle2, ClipboardCheck, Table as TableIcon,
} from 'lucide-react';

const ALLOWED_ROLES = ['regional_admin', 'school_manager', 'supervisor', 'dirigente'];

const COR_TOTAL = '#e11d48';   // rose-600 — % da rede com qualquer pendência
const COR_AGUA = '#2563eb';    // blue-600 — mesma cor usada em Consumo de Água
const COR_MANEJO = '#059669';  // emerald-600 — mesma cor usada em Manejo Arbóreo

// Manejo arbóreo entra numa fase posterior — por ora a página acompanha apenas
// a água. Com `false`, todos os elementos de manejo somem (KPIs, gráfico, tabela,
// PDF, título e menu em src/App.tsx) e o snapshot semanal grava só os campos de
// água. Todo o código de manejo continua aqui: basta voltar para `true`.
export const MOSTRAR_MANEJO: boolean = false;

interface SchoolLite { id: string; name: string; water_exempt: boolean; }

interface SnapshotRow {
  id: string;
  semana: string; // YYYY-MM-DD (segunda-feira)
  escola_id: string;
  escola_nome: string;
  tem_pendencia_agua: string; // 'TRUE' | 'FALSE'
  dias_agua_pendentes: string;
  agua_dispensada: string; // 'TRUE' | 'FALSE' — escola dispensada do registro de água
  status_manejo: string;
  tem_pendencia_manejo: string; // 'TRUE' | 'FALSE'
  gerado_em: string;
  gerado_por_nome: string;
}

// Registro administrativo da própria URE, não uma escola — nunca deve entrar
// nas contagens/percentuais desta página (mesmo padrão de exclusão usado em
// src/pages/VisitasEscolares.tsx e src/pages/Remanejamento.tsx).
const NOME_URE = 'UNIDADE REGIONAL DE ENSINO';

function formatDateToYMD(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function mondayOnOrBefore(date: Date): Date {
  const d = new Date(date);
  const dayOfWeek = d.getDay(); // 0=Dom, 1=Seg, ... 6=Sáb
  const diasDesdeSegunda = (dayOfWeek + 6) % 7;
  d.setDate(d.getDate() - diasDesdeSegunda);
  d.setHours(0, 0, 0, 0);
  return d;
}

function formatWeekLabel(ymd: string): string {
  const [, m, d] = ymd.split('-');
  return `${d}/${m}`;
}

function isTrue(v: string): boolean {
  return v === 'TRUE' || v === 'true';
}

export default function PendenciasSemanais() {
  const [loading, setLoading] = useState(true);
  const [userRoleRaw, setUserRoleRaw] = useState('');
  const [userRole, setUserRole] = useState('');
  const [userSchoolId, setUserSchoolId] = useState<string | null>(null);
  const [supervisorSchoolIds, setSupervisorSchoolIds] = useState<string[]>([]);

  const [schools, setSchools] = useState<SchoolLite[]>([]);
  const [selectedSchoolId, setSelectedSchoolId] = useState<string>('');
  const [snapshots, setSnapshots] = useState<SnapshotRow[]>([]);

  const [snapshotting, setSnapshotting] = useState(false);
  const [snapshotMsg, setSnapshotMsg] = useState<{ tipo: 'ok' | 'erro'; texto: string } | null>(null);
  const [exporting, setExporting] = useState(false);

  const printRef = useRef<HTMLDivElement>(null);

  async function invoke(action: string, payload: Record<string, unknown> = {}) {
    const { data, error } = await supabase.functions.invoke('pendencias-semanais', {
      body: { action, ...payload },
    });
    if (error) {
      let message = error.message;
      const context = (error as any).context;
      if (context && typeof context.json === 'function') {
        try {
          const body = await context.clone().json();
          if (body?.error) message = body.error;
        } catch { /* corpo não é JSON, mantém mensagem padrão */ }
      }
      throw new Error(message);
    }
    if (data?.error) throw new Error(data.error);
    return data;
  }

  async function carregarHistorico() {
    const data = await invoke('listar');
    setSnapshots(data?.rows || []);
  }

  async function carregarContexto() {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      let rawRole = '';
      let supSchools: string[] = [];
      let schoolId: string | null = null;

      if (user) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('role, school_id, supervisor_schools')
          .eq('id', user.id)
          .single();
        rawRole = (profile as any)?.role || '';
        schoolId = (profile as any)?.school_id || null;
        supSchools = (profile as any)?.supervisor_schools || [];
      }

      setUserRoleRaw(rawRole);
      setUserRole(resolveViewRole(rawRole));
      setUserSchoolId(schoolId);
      setSupervisorSchoolIds(supSchools);

      // Escolas paginadas (Supabase limita 1000 linhas por requisição por padrão),
      // mesmo padrão usado em src/pages/Dashboard.tsx / ConsumoAgua.tsx.
      const PAGE = 1000;
      const all: SchoolLite[] = [];
      let from = 0;
      while (true) {
        const { data: page } = await supabase.from('schools').select('id, name, water_exempt').order('name').range(from, from + PAGE - 1);
        if (!page || page.length === 0) break;
        all.push(...(page as SchoolLite[]));
        if (page.length < PAGE) break;
        from += PAGE;
      }
      setSchools(all.filter(s => normalizeName(s.name) !== NOME_URE));

      await carregarHistorico();
    } catch (err) {
      console.error('Erro ao carregar contexto de pendências semanais:', err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    carregarContexto();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function gerarSnapshot() {
    setSnapshotting(true);
    setSnapshotMsg(null);
    try {
      const hoje = new Date();

      // ── Água: reaproveita a mesma RPC e janela do Dashboard ──────────────
      const seisMesesAtras = new Date(hoje.getFullYear(), hoje.getMonth() - 5, 1);
      const windowStart = seisMesesAtras > WATER_REPORTING_HARD_START ? seisMesesAtras : WATER_REPORTING_HARD_START;
      const { data: pendenciasAgua, error: aguaError } = await supabase.rpc('get_pending_water_schools', {
        p_window_start: formatDateToYMD(windowStart),
        p_today: formatDateToYMD(hoje),
      });
      if (aguaError) throw aguaError;

      const diasPendentesPorEscola: Record<string, number> = {};
      (pendenciasAgua || []).forEach((row: any) => {
        diasPendentesPorEscola[row.school_id] = (diasPendentesPorEscola[row.school_id] || 0) + row.missing_days;
      });

      // ── Manejo arbóreo: só é calculado quando MOSTRAR_MANEJO está ativo.
      // Enquanto a página acompanha apenas água, o snapshot grava os campos de
      // manejo vazios (mesma lógica/planilha de src/pages/ManejoArboreo.tsx). ─
      const sheetMap = MOSTRAR_MANEJO
        ? await fetchManejoFromSheet().catch((err) => {
            console.warn('Planilha de manejo indisponível ao gerar snapshot:', err);
            return new Map<string, ManejoSheetRow>();
          })
        : new Map<string, ManejoSheetRow>();

      const linhas = schools.map((escola) => {
        const diasAgua = diasPendentesPorEscola[escola.id] || 0;

        let statusManejo = '';
        let temManejo = false;
        if (MOSTRAR_MANEJO) {
          const supNorm = normalizeName(escola.name);
          let sheetRow: ManejoSheetRow | undefined;
          for (const [sheetNorm, row] of sheetMap) {
            if (matchNames(supNorm, sheetNorm)) { sheetRow = row; break; }
          }
          const status: StatusManejo = determinarStatus({
            naoSeAplica: sheetRow?.naoSeAplica ?? false,
            validadeAutorizacao: sheetRow ? (sheetRow.naoSeAplica ? null : sheetRow.validadeISO) : null,
            daPlanilha: !!sheetRow,
          });
          statusManejo = status;
          temManejo = temPendenciaManejo(status);
        }

        return {
          escola_id: escola.id,
          escola_nome: escola.name,
          tem_pendencia_agua: diasAgua > 0,
          dias_agua_pendentes: diasAgua,
          agua_dispensada: !!escola.water_exempt,
          status_manejo: statusManejo,
          tem_pendencia_manejo: temManejo,
        };
      });

      const semana = formatDateToYMD(mondayOnOrBefore(hoje));
      const resultado = await invoke('gerar_snapshot', { semana, rows: linhas });

      await carregarHistorico();
      setSnapshotMsg({
        tipo: 'ok',
        texto: `Snapshot da semana de ${formatWeekLabel(semana)} gerado: ${resultado.criadas} escola(s) nova(s), ${resultado.atualizadas} atualizada(s).`,
      });
    } catch (err: any) {
      console.error('Erro ao gerar snapshot semanal:', err);
      setSnapshotMsg({ tipo: 'erro', texto: err?.message || 'Erro ao gerar snapshot semanal.' });
    } finally {
      setSnapshotting(false);
    }
  }

  const escolasVisiveisPicker = useMemo(() => {
    if (userRole === 'supervisor') return schools.filter(s => supervisorSchoolIds.includes(s.id));
    return schools;
  }, [schools, userRole, supervisorSchoolIds]);

  const weeklyData = useMemo(() => {
    const bySemana = new Map<string, SnapshotRow[]>();
    for (const s of snapshots) {
      if (!bySemana.has(s.semana)) bySemana.set(s.semana, []);
      bySemana.get(s.semana)!.push(s);
    }
    const semanas = Array.from(bySemana.keys()).sort();
    return semanas.map((semana) => {
      let rows = bySemana.get(semana)!;
      if (userRole === 'supervisor') rows = rows.filter(r => supervisorSchoolIds.includes(r.escola_id));
      const total = rows.length;
      // Escolas dispensadas (água) ou "não se aplica" (manejo) não são avaliadas
      // nesses pilares — mesmo critério de RankingEscolas.tsx/ManejoArboreo.tsx —
      // então saem do denominador de cada percentual, não só do numerador.
      const elegiveisAgua = rows.filter(r => !isTrue(r.agua_dispensada));
      const elegiveisManejo = rows.filter(r => r.status_manejo !== 'NAO_SE_APLICA');
      const comAgua = elegiveisAgua.filter(r => isTrue(r.tem_pendencia_agua)).length;
      const comManejo = elegiveisManejo.filter(r => isTrue(r.tem_pendencia_manejo)).length;
      const pct = (n: number, base: number) => (base > 0 ? Math.round((n / base) * 1000) / 10 : 0);
      const pctAgua = pct(comAgua, elegiveisAgua.length);
      const pctManejo = pct(comManejo, elegiveisManejo.length);
      return {
        semana,
        semanaLabel: formatWeekLabel(semana),
        total, comAgua, comManejo,
        pctAgua, pctManejo,
        // Com manejo ativo, Total = média simples entre % Água e % Manejo (não é
        // a % de escolas com pelo menos uma das duas pendências). Enquanto só a
        // água é acompanhada, Total = % Água.
        pctQualquer: MOSTRAR_MANEJO
          ? Math.round(((pctAgua + pctManejo) / 2) * 10) / 10
          : pctAgua,
      };
    });
  }, [snapshots, userRole, supervisorSchoolIds]);

  const escolaFocoId = userRole === 'school_manager' ? userSchoolId : (selectedSchoolId || null);
  const nomeEscolaFoco = escolaFocoId ? schools.find(s => s.id === escolaFocoId)?.name : null;

  const schoolWeeklyData = useMemo(() => {
    if (!escolaFocoId) return [];
    return snapshots
      .filter(s => s.escola_id === escolaFocoId)
      .sort((a, b) => a.semana.localeCompare(b.semana))
      .map(s => ({
        semana: s.semana,
        semanaLabel: formatWeekLabel(s.semana),
        agua: isTrue(s.tem_pendencia_agua),
        manejo: isTrue(s.tem_pendencia_manejo),
        statusManejo: s.status_manejo,
      }));
  }, [snapshots, escolaFocoId]);

  const semanaAtual = weeklyData[weeklyData.length - 1];
  const semanaAnterior = weeklyData[weeklyData.length - 2];
  const delta = semanaAtual && semanaAnterior ? Math.round((semanaAtual.pctQualquer - semanaAnterior.pctQualquer) * 10) / 10 : null;

  const podeGerarSnapshot = userRoleRaw === 'regional_admin';
  const podeFiltrarEscola = userRole === 'regional_admin' || userRole === 'dirigente';

  async function handleExportPDF() {
    if (!printRef.current) return;
    setExporting(true);
    try {
      const opts = { scale: 2, useCORS: true, allowTaint: true, backgroundColor: '#ffffff' };
      const canvas = await html2canvas(printRef.current, opts);
      const doc = new jsPDF('portrait', 'mm', 'a4');
      const pw = doc.internal.pageSize.getWidth();
      const ph = doc.internal.pageSize.getHeight();

      const usableTop = 32;
      const usableH = ph - 32 - 12;
      const ratio = canvas.width / canvas.height;
      const usableRatio = pw / usableH;
      let w, h, x, y;
      if (ratio > usableRatio) {
        w = pw; h = pw / ratio; x = 0; y = usableTop + (usableH - h) / 2;
      } else {
        h = usableH; w = usableH * ratio; x = (pw - w) / 2; y = usableTop;
      }
      doc.addImage(canvas.toDataURL('image/png'), 'PNG', x, y, w, h);
      addTimbradoAllPages(doc);
      doc.save(`pendencias-semanais-${new Date().toISOString().split('T')[0]}.pdf`);
    } catch (e) {
      console.error(e);
      alert('Erro ao gerar PDF.');
    } finally {
      setExporting(false);
    }
  }

  // ── Guarda de acesso ──────────────────────────────────────────────────
  if (loading) {
    return <div className="min-h-screen flex items-center justify-center"><Loader2 className="animate-spin text-indigo-500" size={32} /></div>;
  }

  if (!ALLOWED_ROLES.includes(userRole)) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4">
        <Lock className="w-16 h-16 text-red-400 mb-4" />
        <h1 className="text-xl font-black text-slate-800 mb-2">Acesso Restrito</h1>
        <p className="text-slate-500 text-center max-w-md text-sm">
          Esta página é de uso exclusivo do acompanhamento de metas do Plano de Ação.
        </p>
      </div>
    );
  }

  const DeltaIcon = delta === null ? Minus : delta < 0 ? TrendingDown : delta > 0 ? TrendingUp : Minus;
  const deltaCor = delta === null || delta === 0 ? 'text-slate-500 bg-slate-50 border-slate-200' : delta < 0 ? 'text-emerald-700 bg-emerald-50 border-emerald-200' : 'text-red-700 bg-red-50 border-red-200';

  return (
    <div className="space-y-6">
      {/* ── Banner principal ── */}
      <div className="rounded-2xl overflow-hidden shadow-xl" style={{ background: 'linear-gradient(135deg, #4c0519 0%, #7f1d1d 50%, #831843 100%)' }}>
        <div className="relative px-6 py-7 md:px-8">
          <div className="relative flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-center gap-5">
              <div className="w-16 h-16 bg-rose-500 rounded-2xl flex items-center justify-center shadow-2xl shadow-rose-500/40 flex-shrink-0">
                <ClipboardCheck size={34} className="text-white" />
              </div>
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-[10px] font-black text-rose-300 uppercase tracking-[0.2em] bg-rose-500/10 px-2 py-0.5 rounded-full border border-rose-500/20">Plano de Ação</span>
                </div>
                <h1 className="text-2xl md:text-3xl font-black text-white tracking-tight leading-tight">{MOSTRAR_MANEJO ? 'Pendências Semanais — Água e Manejo Arbóreo' : 'Pendências Semanais — Água'}</h1>
                <p className="text-rose-200/70 text-sm mt-1">
                  Meta: zerar o percentual de escolas com pendências junto à URE
                </p>
              </div>
            </div>

            {podeGerarSnapshot && (
              <button
                onClick={gerarSnapshot}
                disabled={snapshotting}
                className="flex items-center gap-2 px-5 py-3 rounded-xl text-sm font-bold text-white bg-rose-500 hover:bg-rose-400 disabled:opacity-60 shadow-lg shadow-rose-500/30 transition-all"
              >
                {snapshotting ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
                Gerar snapshot da semana
              </button>
            )}
          </div>
        </div>

        {MOSTRAR_MANEJO && (
          <div className="bg-black/20 px-8 py-3 flex flex-wrap items-center gap-2 border-t border-white/5">
            <span className="text-xs text-rose-300/70 font-semibold">
              Pendência de manejo arbóreo = aguardando validade, vencida ou sem resposta.
            </span>
          </div>
        )}
      </div>

      {snapshotMsg && (
        <div className={`rounded-xl px-4 py-3 text-sm font-semibold border flex items-center gap-2 ${snapshotMsg.tipo === 'ok' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-red-50 text-red-700 border-red-200'}`}>
          {snapshotMsg.tipo === 'ok' ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
          {snapshotMsg.texto}
        </div>
      )}

      {snapshots.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-16 flex flex-col items-center justify-center text-center">
          <div className="w-16 h-16 bg-rose-50 text-rose-400 rounded-2xl flex items-center justify-center mb-4">
            <ClipboardCheck size={30} />
          </div>
          <h3 className="text-xl font-black text-slate-800">Ainda não há histórico</h3>
          <p className="text-slate-500 max-w-md mt-2 text-sm leading-relaxed">
            {podeGerarSnapshot
              ? 'Clique em "Gerar snapshot da semana" para registrar a primeira leitura de pendências.'
              : 'Assim que o primeiro snapshot semanal for gerado pela gestão regional, a evolução aparecerá aqui.'}
          </p>
        </div>
      ) : (
        <>
          {/* ── KPI Cards ── */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Semana Atual</p>
              <p className="text-2xl font-black text-slate-700">{semanaAtual ? formatWeekLabel(semanaAtual.semana) : '—'}</p>
            </div>
            <div className={`bg-white rounded-2xl p-5 border shadow-sm ${semanaAtual?.pctQualquer === 0 ? 'border-emerald-200' : 'border-rose-200'}`}>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">% Escolas com Pendência</p>
              <p className={`text-3xl font-black ${semanaAtual?.pctQualquer === 0 ? 'text-emerald-600' : 'text-rose-600'}`}>{semanaAtual ? `${semanaAtual.pctQualquer}%` : '—'}</p>
            </div>
            <div className={`bg-white rounded-2xl p-5 border shadow-sm ${deltaCor}`}>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Variação vs. Semana Anterior</p>
              <p className="text-2xl font-black flex items-center gap-1.5"><DeltaIcon size={20} />{delta === null ? '—' : `${delta > 0 ? '+' : ''}${delta}%`}</p>
            </div>
            <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">{MOSTRAR_MANEJO ? 'Água / Manejo Pendentes' : 'Escolas com Água Pendente'}</p>
              <p className="text-2xl font-black text-slate-700 flex items-center gap-3">
                <span className="flex items-center gap-1.5"><Droplets size={18} style={{ color: COR_AGUA }} />{semanaAtual?.comAgua ?? '—'}</span>
                {MOSTRAR_MANEJO && (
                  <span className="flex items-center gap-1.5"><TreeDeciduous size={18} style={{ color: COR_MANEJO }} />{semanaAtual?.comManejo ?? '—'}</span>
                )}
              </p>
            </div>
          </div>

          {/* ── Filtro por escola (regional_admin/dirigente) ── */}
          {podeFiltrarEscola && (
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm px-5 py-4 flex items-center gap-3">
              <label className="text-xs font-black text-slate-400 uppercase tracking-widest">Ver escola específica</label>
              <select
                value={selectedSchoolId}
                onChange={(e) => setSelectedSchoolId(e.target.value)}
                className="flex-1 max-w-sm px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:border-rose-400 focus:ring-2 focus:ring-rose-100 bg-slate-50 focus:bg-white transition-all"
              >
                <option value="">Todas as escolas (média da rede)</option>
                {escolasVisiveisPicker.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
          )}

          {/* ── Área exportável (gráfico + tabela) ── */}
          <div ref={printRef} className="space-y-6 bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
            {nomeEscolaFoco && (
              <p className="text-sm font-bold text-slate-600">Escola selecionada: <span className="text-rose-600">{nomeEscolaFoco}</span></p>
            )}

            {escolaFocoId ? (
              <div>
                <p className="text-xs font-black text-slate-400 uppercase tracking-widest mb-3">{MOSTRAR_MANEJO ? 'Evolução semanal — Água e Manejo Arbóreo' : 'Evolução semanal — Água'}</p>
                <div className="overflow-x-auto">
                  <div className="flex gap-2 min-w-max pb-2">
                    {schoolWeeklyData.map((w) => (
                      <div key={w.semana} className="flex flex-col items-center gap-1.5 bg-slate-50 border border-slate-100 rounded-xl px-3 py-2.5 min-w-[64px]">
                        <span className="text-[10px] font-black text-slate-400">{w.semanaLabel}</span>
                        <div className="flex items-center gap-1" title={`Água: ${w.agua ? 'pendente' : 'ok'}`}>
                          <Droplets size={13} style={{ color: w.agua ? COR_AGUA : '#cbd5e1' }} />
                          <div className="w-2 h-2 rounded-full" style={{ background: w.agua ? '#ef4444' : '#10b981' }} />
                        </div>
                        {MOSTRAR_MANEJO && (
                          <div className="flex items-center gap-1" title={`Manejo: ${w.statusManejo}`}>
                            <TreeDeciduous size={13} style={{ color: w.manejo ? COR_MANEJO : '#cbd5e1' }} />
                            <div className="w-2 h-2 rounded-full" style={{ background: w.manejo ? '#ef4444' : '#10b981' }} />
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div>
                <p className="text-xs font-black text-slate-400 uppercase tracking-widest mb-3">Evolução semanal — % da rede com pendência</p>
                <ResponsiveContainer width="100%" height={320}>
                  <LineChart data={weeklyData} margin={{ top: 8, right: 16, left: -8, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                    <XAxis dataKey="semanaLabel" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={{ stroke: '#e2e8f0' }} tickLine={false} />
                    <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} tickFormatter={(v) => `${v}%`} />
                    <ReferenceLine y={0} stroke="#94a3b8" strokeDasharray="4 4" label={{ value: 'Meta: 0%', position: 'insideTopRight', fill: '#94a3b8', fontSize: 11, fontWeight: 700 }} />
                    <Tooltip formatter={(value: any, name: any) => [`${value}%`, name]} contentStyle={{ borderRadius: 12, border: '1px solid #e2e8f0', fontSize: 12 }} />
                    <Legend wrapperStyle={{ fontSize: 12, fontWeight: 700 }} />
                    {MOSTRAR_MANEJO && <Line type="monotone" dataKey="pctQualquer" name="Total com pendência" stroke={COR_TOTAL} strokeWidth={2.5} dot={{ r: 4 }} activeDot={{ r: 6 }} />}
                    <Line type="monotone" dataKey="pctAgua" name="Água" stroke={COR_AGUA} strokeWidth={MOSTRAR_MANEJO ? 2 : 2.5} dot={{ r: MOSTRAR_MANEJO ? 3 : 4 }} activeDot={{ r: 6 }} />
                    {MOSTRAR_MANEJO && <Line type="monotone" dataKey="pctManejo" name="Manejo Arbóreo" stroke={COR_MANEJO} strokeWidth={2} dot={{ r: 3 }} />}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* ── Tabela (visão acessível dos mesmos dados) ── */}
            <div>
              <p className="text-xs font-black text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-1.5"><TableIcon size={13} /> Dados por semana</p>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-100">
                      <th className="text-left py-2.5 px-4 text-[11px] font-black text-slate-400 uppercase tracking-widest">Semana</th>
                      {MOSTRAR_MANEJO && <th className="text-center py-2.5 px-4 text-[11px] font-black text-slate-400 uppercase tracking-widest">% Total</th>}
                      <th className="text-center py-2.5 px-4 text-[11px] font-black text-slate-400 uppercase tracking-widest">% Água</th>
                      {MOSTRAR_MANEJO && <th className="text-center py-2.5 px-4 text-[11px] font-black text-slate-400 uppercase tracking-widest">% Manejo</th>}
                      <th className="text-center py-2.5 px-4 text-[11px] font-black text-slate-400 uppercase tracking-widest">Escolas</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {weeklyData.slice().reverse().map(w => (
                      <tr key={w.semana}>
                        <td className="py-2.5 px-4 font-bold text-slate-700">{w.semanaLabel}</td>
                        {MOSTRAR_MANEJO && <td className="py-2.5 px-4 text-center font-black" style={{ color: COR_TOTAL }}>{w.pctQualquer}%</td>}
                        <td className="py-2.5 px-4 text-center" style={{ color: COR_AGUA }}>{w.pctAgua}%</td>
                        {MOSTRAR_MANEJO && <td className="py-2.5 px-4 text-center" style={{ color: COR_MANEJO }}>{w.pctManejo}%</td>}
                        <td className="py-2.5 px-4 text-center text-slate-400">{w.total}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <div className="flex justify-end">
            <button
              onClick={handleExportPDF}
              disabled={exporting}
              className="flex items-center gap-2 px-5 py-3 rounded-xl text-sm font-bold text-white bg-slate-800 hover:bg-slate-700 disabled:opacity-60 shadow-lg transition-all"
            >
              {exporting ? <Loader2 size={16} className="animate-spin" /> : <FileDown size={16} />}
              Exportar PDF
            </button>
          </div>
        </>
      )}
    </div>
  );
}

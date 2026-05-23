import { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import {
  AreaChart, Area, PieChart, Pie, Cell,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer
} from 'recharts';
import {
  Building2, HardHat, Droplets,
  FileDown, Loader2, RefreshCw, ArrowUpCircle,
  AlertTriangle, TreeDeciduous, ShieldCheck, Package, Car, CalendarDays
} from 'lucide-react';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';

// ── Utilities ────────────────────────────────────────────────
function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let cur = '';
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (inQ && line[i + 1] === '"') { cur += '"'; i++; }
      else inQ = !inQ;
    } else if (c === ',' && !inQ) { result.push(cur.trim()); cur = ''; }
    else cur += c;
  }
  result.push(cur.trim());
  return result;
}

function obrasStatusNorm(s: string): 'andamento' | 'concluido' | 'paralisado' {
  const u = (s || '').toUpperCase().trim();
  if (u.includes('CONCLU')) return 'concluido';
  if (u.includes('PARALISA') || u.includes('SUSPENS')) return 'paralisado';
  return 'andamento';
}

function fmtM3(v: number) {
  return v >= 1000 ? `${(v / 1000).toFixed(1)} mil` : String(v);
}

const BRAND  = '#ea580c';
const NAVY   = '#0f172a';
const GREEN  = '#10b981';
const AMBER  = '#f59e0b';
const RED    = '#ef4444';
const SLATE  = '#94a3b8';
const BLUE   = '#3b82f6';
const TEAL   = '#14b8a6';
const PURPLE = '#a855f7';

type ChartItem    = { name: string; value: number; color: string };
type DemPrioItem  = { name: string; value: number; fill: string };

// ── Component ────────────────────────────────────────────────
export function PainelGerencial() {
  const printRef1 = useRef<HTMLDivElement>(null);
  const printRef2 = useRef<HTMLDivElement>(null);

  const [loading,   setLoading]   = useState(true);
  const [exporting, setExporting] = useState(false);
  const [updated,   setUpdated]   = useState('');

  // KPIs
  const [totalEscolas,   setTotalEscolas]   = useState(0);
  const [totalObras,     setTotalObras]     = useState(0);
  const [demandasAtivas, setDemandasAtivas] = useState(0);
  const [zelAtivas,      setZelAtivas]      = useState(0);

  // Charts – page 1
  const [obrasStat, setObrasStat] = useState<ChartItem[]>([]);
  const [elevFun,   setElevFun]   = useState(0);
  const [elevAll,   setElevAll]   = useState(0);
  const [demPrio,   setDemPrio]   = useState<DemPrioItem[]>([]);
  const [manejoData, setManejoData] = useState<ChartItem[]>([]);
  const [patriData,  setPatriData]  = useState<ChartItem[]>([]);
  const [zelData,    setZelData]    = useState<ChartItem[]>([]);

  // Charts – page 2
  const [consumo,           setConsumo]           = useState<{ mes: string; agua: number }[]>([]);
  const [carrosTotal,       setCarrosTotal]       = useState(0);
  const [carrosAprovados,   setCarrosAprovados]   = useState(0);
  const [reservasAprovadas, setReservasAprovadas] = useState(0);
  const [reservasPendentes, setReservasPendentes] = useState(0);

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    try {
      await Promise.all([loadSupabase(), loadObras(), loadElevadores()]);
      const n = new Date();
      setUpdated(`${n.toLocaleDateString('pt-BR')} às ${n.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }

  async function loadSupabase() {
    const [escRes, demRes, conRes, zelRes, patriRes, manejoRes, carrosRes, reservasRes] = await Promise.all([
      (supabase as any).from('schools').select('id', { count: 'exact', head: true }),
      (supabase as any).from('demands').select('status, priority'),
      (supabase as any).from('consumo_agua_luz').select('mes_ano, agua_qtde_m3'),
      (supabase as any).from('zeladorias').select('ocupada'),
      (supabase as any).from('asset_processes').select('status'),
      (supabase as any).from('schools').select('id, manejo_arboreo(validade_autorizacao, nao_se_aplica)'),
      (supabase as any).from('car_schedules').select('status'),
      (supabase as any).from('agendamentos_ambientes').select('status'),
    ]);

    setTotalEscolas(escRes.count || 0);

    // Demandas
    const dems: any[] = demRes.data || [];
    setDemandasAtivas(dems.filter(d => {
      const s = (d.status || '').toLowerCase();
      return !s.includes('conclu') && !s.includes('cancel') && !s.includes('fecha');
    }).length);
    const prioCnt: Record<string, number> = {};
    dems.forEach(d => {
      const p = (d.priority || 'baixa').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
      prioCnt[p] = (prioCnt[p] || 0) + 1;
    });
    const PRIO_CFG: Record<string, { label: string; fill: string; order: number }> = {
      critica: { label: 'Crítica', fill: RED,   order: 0 },
      alta:    { label: 'Alta',    fill: BRAND, order: 1 },
      media:   { label: 'Média',   fill: AMBER, order: 2 },
      baixa:   { label: 'Baixa',   fill: GREEN, order: 3 },
    };
    setDemPrio(
      Object.entries(prioCnt)
        .map(([k, v]) => ({ name: PRIO_CFG[k]?.label ?? k, value: v, fill: PRIO_CFG[k]?.fill ?? SLATE, _ord: PRIO_CFG[k]?.order ?? 99 }))
        .sort((a: any, b: any) => a._ord - b._ord)
    );

    // Consumo
    const rows: any[] = conRes.data || [];
    const mp: Record<string, number> = {};
    rows.forEach(r => {
      if (!r.mes_ano) return;
      mp[r.mes_ano] = (mp[r.mes_ano] || 0) + (Number(r.agua_qtde_m3) || 0);
    });
    setConsumo(
      Object.entries(mp)
        .map(([mes, agua]) => {
          const p = mes.split('/');
          return { mes, agua: Math.round(agua), _s: p.length === 2 ? `${p[1]}-${p[0].padStart(2, '0')}` : mes };
        })
        .sort((a: any, b: any) => a._s.localeCompare(b._s))
        .slice(-12)
        .map(({ mes, agua }) => ({ mes, agua }))
    );

    // Zeladoria
    const zels: any[] = zelRes.data || [];
    const zelConc = zels.filter(z => z.ocupada === 'CONCLUÍDO').length;
    const zelAnd  = zels.length - zelConc;
    setZelAtivas(zelAnd);
    setZelData([
      { name: 'Concluídas',   value: zelConc, color: GREEN },
      { name: 'Em Andamento', value: zelAnd,  color: TEAL  },
    ].filter(d => d.value > 0));

    // Patrimônio
    const patri: any[] = patriRes.data || [];
    const patriConc = patri.filter(p => p.status === 'CONCLUÍDO').length;
    setPatriData([
      { name: 'Concluídos', value: patriConc,              color: GREEN  },
      { name: 'Pendentes',  value: patri.length - patriConc, color: PURPLE },
    ].filter(d => d.value > 0));

    // Manejo Arbóreo
    const mRows: any[] = manejoRes.data || [];
    const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
    let mValido = 0, mVencido = 0, mPendente = 0, mNaoSeAplica = 0;
    mRows.forEach(school => {
      const m = Array.isArray(school.manejo_arboreo) ? school.manejo_arboreo[0] : school.manejo_arboreo;
      if (m?.nao_se_aplica) { mNaoSeAplica++; return; }
      if (!m || !m.validade_autorizacao) { mPendente++; return; }
      const [ano, mes, dia] = m.validade_autorizacao.split('-');
      new Date(Number(ano), Number(mes) - 1, Number(dia)) < hoje ? mVencido++ : mValido++;
    });
    setManejoData([
      { name: 'Válido',   value: mValido,      color: GREEN },
      { name: 'Vencido',  value: mVencido,     color: RED   },
      { name: 'Pendente', value: mPendente,    color: AMBER },
      { name: 'N/A',      value: mNaoSeAplica, color: SLATE },
    ].filter(d => d.value > 0));

    // Carros
    const carros: any[] = carrosRes.data || [];
    setCarrosTotal(carros.length);
    setCarrosAprovados(carros.filter(c => {
      const s = (c.status || '').toUpperCase();
      return s.includes('APROVADO') || s === 'OK';
    }).length);

    // Reservas de Ambientes
    const reservas: any[] = reservasRes.data || [];
    setReservasAprovadas(reservas.filter(r => r.status === 'aprovado').length);
    setReservasPendentes(reservas.filter(r => r.status === 'pendente').length);
  }

  async function loadObras() {
    const url = import.meta.env.VITE_OBRAS_CSV_URL as string;
    if (!url) return;
    const res = await fetch(url, { cache: 'no-store' });
    const text = await res.text();
    const lines = text.replace(/\r/g, '').split('\n');
    if (lines.length < 2) return;
    const hdrs = parseCSVLine(lines[0]).map(h =>
      h.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/"/g, '').trim()
    );
    const siIdx = hdrs.findIndex(h => h.includes('status'));
    const esIdx = hdrs.findIndex(h => h.includes('escola'));
    if (siIdx < 0) return;
    let a = 0, c = 0, p = 0;
    for (let i = 1; i < lines.length; i++) {
      if (!lines[i].trim()) continue;
      const v = parseCSVLine(lines[i]);
      if (esIdx >= 0 && !v[esIdx]) continue;
      const st = obrasStatusNorm(v[siIdx] || '');
      if (st === 'andamento') a++;
      else if (st === 'concluido') c++;
      else p++;
    }
    setTotalObras(a + c + p);
    setObrasStat([
      { name: 'Em Andamento', value: a, color: BRAND },
      { name: 'Concluídas',   value: c, color: GREEN },
      { name: 'Paralisadas',  value: p, color: SLATE },
    ].filter(d => d.value > 0));
  }

  async function loadElevadores() {
    const id = import.meta.env.VITE_ELEVADOR_SHEET_ID as string;
    if (!id) return;
    const res = await fetch(`https://docs.google.com/spreadsheets/d/${id}/gviz/tq?tqx=out:json&sheet=Elevadores`);
    const text = await res.text();
    const js = text.match(/google\.visualization\.Query\.setResponse\(([\s\S]*)\)/)?.[1];
    if (!js) return;
    const json = JSON.parse(js);
    const gRows: any[] = json?.table?.rows || [];
    let fun = 0, tot = 0;
    gRows.forEach(row => {
      const cells = row?.c || [];
      if (!cells[1]?.v) return;
      tot++;
      const v = cells[10]?.v;
      if (v === true || v === 'true' || (typeof v === 'string' && /sim|yes/i.test(v))) fun++;
    });
    setElevFun(fun);
    setElevAll(tot);
  }

  async function handleExportPDF() {
    if (!printRef1.current || !printRef2.current) return;
    setExporting(true);
    try {
      const opts = { scale: 2.5, useCORS: true, allowTaint: true, backgroundColor: '#ffffff' };
      const c1 = await html2canvas(printRef1.current, opts);
      const c2 = await html2canvas(printRef2.current, opts);
      const doc = new jsPDF('landscape', 'mm', 'a4');
      const pw = doc.internal.pageSize.getWidth();
      const ph = doc.internal.pageSize.getHeight();
      doc.addImage(c1.toDataURL('image/png'), 'PNG', 0, 0, pw, ph);
      doc.addPage();
      doc.addImage(c2.toDataURL('image/png'), 'PNG', 0, 0, pw, ph);
      doc.save(`painel-gerencial-${new Date().toISOString().split('T')[0]}.pdf`);
    } catch (e) { console.error(e); alert('Erro ao gerar PDF.'); }
    finally { setExporting(false); }
  }

  const elevData: ChartItem[] = [
    { name: 'Funcionando', value: elevFun,           color: GREEN },
    { name: 'Manutenção',  value: elevAll - elevFun, color: AMBER },
  ].filter(d => d.value > 0);

  const now     = new Date();
  const dateStr = now.toLocaleDateString('pt-BR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

  // ── Shared header props ─────────────────────────────────────
  const headerBg = `linear-gradient(135deg, ${NAVY} 0%, #1e2d45 60%, #2d1a0a 100%)`;

  return (
    <div className="min-h-screen bg-slate-100 font-sans">

      {/* ── Control bar ── */}
      <div className="bg-white border-b border-slate-200 px-6 py-3 flex items-center justify-between gap-4 sticky top-0 z-10 shadow-sm">
        <div>
          <h2 className="font-bold text-slate-800">Painel Gerencial — Impressão (2 páginas A4)</h2>
          {updated && <p className="text-xs text-slate-400 mt-0.5">Dados de: {updated}</p>}
        </div>
        <div className="flex items-center gap-3">
          <button onClick={load} disabled={loading}
            className="flex items-center gap-2 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg text-sm font-semibold transition-all disabled:opacity-50">
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            Atualizar
          </button>
          <button onClick={handleExportPDF} disabled={loading || exporting}
            className="flex items-center gap-2 px-5 py-2 bg-orange-600 hover:bg-orange-500 text-white rounded-lg text-sm font-bold shadow transition-all disabled:opacity-60 active:scale-95">
            {exporting ? <Loader2 size={14} className="animate-spin" /> : <FileDown size={14} />}
            Gerar PDF (2 × A4)
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-32 gap-4">
          <div className="relative">
            <Loader2 size={36} className="animate-spin text-orange-500" />
            <div className="absolute inset-0 rounded-full bg-orange-100 animate-ping opacity-30" />
          </div>
          <p className="text-slate-400 font-semibold text-sm">Carregando dados de todos os módulos...</p>
        </div>
      ) : (
        <div className="py-8 px-6 flex flex-col gap-6">

          {/* ══════════════ PAGE 1 ══════════════ */}
          <PageLabel>Página 1 — Obras · Elevadores · Manejo · Demandas · Patrimônio · Zeladoria</PageLabel>
          <div
            ref={printRef1}
            className="bg-white mx-auto overflow-hidden"
            style={{ width: 1050, boxShadow: '0 0 40px rgba(0,0,0,0.15)' }}
          >
            {/* Header */}
            <div className="relative overflow-hidden" style={{ background: headerBg }}>
              <div className="absolute -top-16 -right-16 w-64 h-64 rounded-full opacity-10" style={{ background: BRAND }} />
              <div className="absolute -bottom-8 left-1/3 w-48 h-48 rounded-full opacity-5" style={{ background: BRAND }} />
              <div className="absolute bottom-0 left-0 right-0 h-8 overflow-hidden opacity-20"
                style={{ backgroundImage: `repeating-linear-gradient(-45deg,transparent,transparent 6px,${BRAND} 6px,${BRAND} 12px)` }} />
              <div className="relative px-10 py-8">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="inline-flex items-center gap-2 rounded-full px-3 py-1 mb-3"
                      style={{ background: 'rgba(234,88,12,0.2)', border: '1px solid rgba(234,88,12,0.4)' }}>
                      <div className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: BRAND }} />
                      <span className="text-xs font-bold uppercase tracking-widest" style={{ color: '#fda87d' }}>
                        Sistema de Gestão Educacional · GSU-II
                      </span>
                    </div>
                    <h1 className="text-4xl font-black text-white tracking-tight">
                      Painel de <span style={{ color: '#fb923c' }}>Gestão Integrada</span>
                    </h1>
                    <p className="text-slate-300 mt-1.5 text-sm">
                      Diretoria de Ensino Região Guarulhos Sul II · Infraestrutura e Serviços
                    </p>
                  </div>
                  <div className="text-right mt-1">
                    <p className="text-slate-400 text-xs uppercase tracking-wider">Emitido em</p>
                    <p className="text-white font-bold text-sm mt-0.5 capitalize">{dateStr}</p>
                    <p className="text-slate-400 text-xs mt-1">{updated}</p>
                  </div>
                </div>
                <div className="grid grid-cols-4 gap-4 mt-6">
                  {[
                    { label: 'Escolas no Portfólio',      value: totalEscolas,   icon: Building2,     color: '#60a5fa' },
                    { label: 'Obras Registradas',         value: totalObras,     icon: HardHat,       color: '#fb923c' },
                    { label: 'Demandas Ativas',           value: demandasAtivas, icon: AlertTriangle, color: '#fbbf24' },
                    { label: 'Zeladorias em Andamento',   value: zelAtivas,      icon: ShieldCheck,   color: '#2dd4bf' },
                  ].map(({ label, value, icon: Icon, color }) => (
                    <div key={label} className="rounded-2xl p-4 flex items-center gap-4"
                      style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }}>
                      <div className="rounded-xl p-2.5 shrink-0" style={{ background: `${color}20` }}>
                        <Icon size={20} style={{ color }} />
                      </div>
                      <div>
                        <div className="text-3xl font-black text-white tabular-nums">{value}</div>
                        <div className="text-xs font-semibold mt-0.5" style={{ color: '#94a3b8' }}>{label}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Row 1: Obras | Elevadores | Manejo */}
            <div className="grid grid-cols-3 border-b border-slate-100">
              <div className="p-7 border-r border-slate-100">
                <SectionHeader icon={HardHat} color={BRAND} title="Obras e Reformas" sub="Status das intervenções nas unidades" />
                <DonutWithLegend data={obrasStat} total={totalObras} size={165} />
              </div>
              <div className="p-7 border-r border-slate-100">
                <SectionHeader icon={ArrowUpCircle} color={BLUE} title="Elevadores" sub="Funcionamento dos equipamentos" />
                <DonutWithLegend data={elevData} total={elevAll} size={165}
                  footer={elevAll > 0 ? `${Math.round((elevFun / elevAll) * 100)}% em operação` : undefined}
                  footerColor={elevAll > 0 && elevFun / elevAll >= 0.8 ? GREEN : AMBER}
                />
              </div>
              <div className="p-7">
                <SectionHeader icon={TreeDeciduous} color={GREEN} title="Manejo Arbóreo" sub="Situação das autorizações por escola" />
                <DonutWithLegend data={manejoData} total={manejoData.reduce((s, d) => s + d.value, 0)} size={165} />
              </div>
            </div>

            {/* Row 2: Demandas | Patrimônio | Zeladoria */}
            <div className="grid grid-cols-3 border-b border-slate-100">
              <div className="p-7 border-r border-slate-100">
                <SectionHeader icon={AlertTriangle} color={AMBER} title="Demandas por Prioridade" sub="Distribuição conforme criticidade" />
                {demPrio.length > 0 ? (
                  <div style={{ height: 200 }} className="mt-4">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={demPrio} layout="vertical" margin={{ top: 4, right: 40, left: 60, bottom: 4 }} barSize={26}>
                        <XAxis type="number" tick={{ fontSize: 11, fill: '#94a3b8' }} allowDecimals={false} />
                        <YAxis type="category" dataKey="name" tick={{ fontSize: 12, fill: '#475569', fontWeight: 600 }} />
                        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                        <Tooltip contentStyle={{ borderRadius: 12, border: 'none', fontSize: 12, boxShadow: '0 4px 20px rgba(0,0,0,0.12)' }} cursor={{ fill: '#f8fafc' }} />
                        <Bar dataKey="value" name="Demandas" radius={[0, 8, 8, 0]}>
                          {demPrio.map((e, i) => <Cell key={i} fill={e.fill} />)}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                ) : <EmptyState />}
              </div>
              <div className="p-7 border-r border-slate-100">
                <SectionHeader icon={Package} color={PURPLE} title="Processos de Patrimônio" sub="Status dos processos ativos" />
                <DonutWithLegend data={patriData} total={patriData.reduce((s, d) => s + d.value, 0)} size={165} />
              </div>
              <div className="p-7">
                <SectionHeader icon={ShieldCheck} color={TEAL} title="Zeladoria" sub="Andamento dos processos de zeladoria" />
                <DonutWithLegend data={zelData} total={zelData.reduce((s, d) => s + d.value, 0)} size={165} />
              </div>
            </div>

            {/* Page 1 footer */}
            <div className="px-10 py-4 flex items-center justify-between" style={{ background: '#f8fafc' }}>
              <div className="flex items-center gap-3">
                <div className="w-1 h-7 rounded-full" style={{ background: BRAND }} />
                <div>
                  <p className="text-xs font-black text-slate-700 uppercase tracking-wider">SGE-GSU-II</p>
                  <p className="text-[10px] text-slate-400">Sistema de Gestão Educacional · Dados Internos</p>
                </div>
              </div>
              <p className="text-[10px] text-slate-400">
                Página 1 de 2 · Gerado em {updated}
              </p>
            </div>
          </div>

          {/* ══════════════ PAGE 2 ══════════════ */}
          <PageLabel>Página 2 — Carros Oficiais · Reservas de Ambientes · Consumo Hídrico</PageLabel>
          <div
            ref={printRef2}
            className="bg-white mx-auto overflow-hidden"
            style={{ width: 1050, boxShadow: '0 0 40px rgba(0,0,0,0.15)' }}
          >
            {/* Mini header – continuation banner */}
            <div className="relative overflow-hidden" style={{ background: headerBg }}>
              <div className="absolute -top-8 -right-8 w-40 h-40 rounded-full opacity-10" style={{ background: BRAND }} />
              <div className="absolute bottom-0 left-0 right-0 h-6 overflow-hidden opacity-20"
                style={{ backgroundImage: `repeating-linear-gradient(-45deg,transparent,transparent 6px,${BRAND} 6px,${BRAND} 12px)` }} />
              <div className="relative px-10 py-6 flex items-center justify-between">
                <div>
                  <div className="inline-flex items-center gap-2 rounded-full px-3 py-1 mb-2"
                    style={{ background: 'rgba(234,88,12,0.2)', border: '1px solid rgba(234,88,12,0.4)' }}>
                    <div className="w-1.5 h-1.5 rounded-full" style={{ background: BRAND }} />
                    <span className="text-xs font-bold uppercase tracking-widest" style={{ color: '#fda87d' }}>
                      Continuação · Página 2 de 2
                    </span>
                  </div>
                  <h2 className="text-2xl font-black text-white tracking-tight">
                    Painel de <span style={{ color: '#fb923c' }}>Gestão Integrada</span>
                    <span className="text-slate-400 text-base font-semibold ml-3">· Mobilidade e Consumo</span>
                  </h2>
                </div>
                <div className="text-right">
                  <p className="text-slate-400 text-xs uppercase tracking-wider">Emitido em</p>
                  <p className="text-white font-semibold text-sm mt-0.5 capitalize">{dateStr}</p>
                  <p className="text-slate-400 text-xs mt-1">{updated}</p>
                </div>
              </div>
            </div>

            {/* Row 3: Carros | Reservas */}
            <div className="grid grid-cols-2 border-b border-slate-100">
              <div className="p-8 border-r border-slate-100">
                <SectionHeader icon={Car} color={BLUE} title="Carros Oficiais" sub="Agendamentos de veículos oficiais registrados no sistema" />
                <div className="grid grid-cols-3 gap-5 mt-6">
                  <BigStatCard label="Total de Pedidos" value={carrosTotal}     color={SLATE} />
                  <BigStatCard label="Aprovados"        value={carrosAprovados} color={GREEN} />
                  <BigStatCard
                    label="Taxa de Aprovação"
                    value={carrosTotal > 0 ? `${Math.round((carrosAprovados / carrosTotal) * 100)}%` : '—'}
                    color={carrosTotal > 0 && carrosAprovados / carrosTotal >= 0.7 ? GREEN : AMBER}
                  />
                </div>
                {carrosTotal > 0 && (
                  <div className="mt-6">
                    <div className="flex justify-between text-xs font-semibold text-slate-500 mb-1.5">
                      <span>Aprovação acumulada</span>
                      <span style={{ color: carrosAprovados / carrosTotal >= 0.7 ? GREEN : AMBER }}>
                        {Math.round((carrosAprovados / carrosTotal) * 100)}%
                      </span>
                    </div>
                    <div className="h-3 bg-slate-100 rounded-full overflow-hidden">
                      <div className="h-full rounded-full transition-all"
                        style={{ width: `${Math.round((carrosAprovados / carrosTotal) * 100)}%`,
                          background: carrosAprovados / carrosTotal >= 0.7 ? GREEN : AMBER }} />
                    </div>
                  </div>
                )}
              </div>

              <div className="p-8">
                <SectionHeader icon={CalendarDays} color={PURPLE} title="Reservas de Ambientes" sub="Agendamentos de salas e espaços da Diretoria" />
                <div className="grid grid-cols-3 gap-5 mt-6">
                  <BigStatCard label="Aprovadas"  value={reservasAprovadas} color={GREEN}  />
                  <BigStatCard label="Pendentes"  value={reservasPendentes} color={AMBER}  />
                  <BigStatCard label="Total"      value={reservasAprovadas + reservasPendentes} color={BLUE} />
                </div>
                {(reservasAprovadas + reservasPendentes) > 0 && (
                  <div className="mt-6">
                    <div className="flex justify-between text-xs font-semibold text-slate-500 mb-1.5">
                      <span>Taxa de aprovação</span>
                      <span style={{ color: GREEN }}>
                        {Math.round((reservasAprovadas / (reservasAprovadas + reservasPendentes)) * 100)}%
                      </span>
                    </div>
                    <div className="h-3 bg-slate-100 rounded-full overflow-hidden">
                      <div className="h-full rounded-full transition-all"
                        style={{ width: `${Math.round((reservasAprovadas / (reservasAprovadas + reservasPendentes)) * 100)}%`,
                          background: GREEN }} />
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Row 4: Consumo Hídrico */}
            <div className="px-8 pt-7 pb-6">
              <SectionHeader icon={Droplets} color={BLUE} title="Evolução do Consumo Hídrico" sub="Consumo total de água (m³) consolidado nas unidades escolares — últimos 12 meses" />
              {consumo.length > 0 ? (
                <div style={{ height: 340 }} className="mt-5">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={consumo} margin={{ top: 10, right: 30, left: 20, bottom: 0 }}>
                      <defs>
                        <linearGradient id="gradAgua2" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%"  stopColor={BLUE} stopOpacity={0.3} />
                          <stop offset="95%" stopColor={BLUE} stopOpacity={0.02} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                      <XAxis dataKey="mes" tick={{ fontSize: 12, fill: '#94a3b8' }} />
                      <YAxis tick={{ fontSize: 12, fill: '#94a3b8' }} tickFormatter={v => fmtM3(v)} />
                      <Tooltip
                        contentStyle={{ borderRadius: 12, border: 'none', fontSize: 13, boxShadow: '0 4px 20px rgba(0,0,0,0.12)' }}
                        formatter={(v: any) => [`${v.toLocaleString('pt-BR')} m³`, 'Consumo']}
                      />
                      <Area type="monotone" dataKey="agua" name="Consumo (m³)"
                        stroke={BLUE} strokeWidth={3} fill="url(#gradAgua2)"
                        dot={{ fill: BLUE, r: 4, strokeWidth: 0 }} activeDot={{ r: 6 }} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="flex items-center justify-center border-2 border-dashed border-slate-100 rounded-2xl mt-5"
                  style={{ height: 340 }}>
                  <p className="text-slate-300 text-xs font-bold uppercase tracking-wider">Sem dados de consumo hídrico</p>
                </div>
              )}
            </div>

            {/* Page 2 footer */}
            <div className="px-10 py-4 flex items-center justify-between border-t border-slate-100" style={{ background: '#f8fafc' }}>
              <div className="flex items-center gap-3">
                <div className="w-1 h-7 rounded-full" style={{ background: BRAND }} />
                <div>
                  <p className="text-xs font-black text-slate-700 uppercase tracking-wider">SGE-GSU-II</p>
                  <p className="text-[10px] text-slate-400">Sistema de Gestão Educacional · Dados Internos</p>
                </div>
              </div>
              <p className="text-[10px] text-slate-400">
                Página 2 de 2 · Gerado em {updated} · Informações de uso exclusivo da Diretoria
              </p>
            </div>
          </div>

        </div>
      )}
    </div>
  );
}

// ── Sub-components ──────────────────────────────────────────

function PageLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 max-w-[1050px] mx-auto">
      <div className="flex-1 h-px bg-slate-300" />
      <span className="text-[11px] font-bold text-slate-400 uppercase tracking-widest whitespace-nowrap">{children}</span>
      <div className="flex-1 h-px bg-slate-300" />
    </div>
  );
}

function SectionHeader({ icon: Icon, color, title, sub }: {
  icon: any; color: string; title: string; sub: string;
}) {
  return (
    <div className="flex items-start gap-3 mb-1">
      <div className="rounded-xl p-2 shrink-0 mt-0.5" style={{ background: `${color}15` }}>
        <Icon size={16} style={{ color }} />
      </div>
      <div>
        <h3 className="font-black text-slate-800 text-sm leading-tight">{title}</h3>
        <p className="text-[11px] text-slate-400 mt-0.5">{sub}</p>
      </div>
    </div>
  );
}

function DonutWithLegend({ data, total, size, footer, footerColor }: {
  data: ChartItem[]; total: number; size: number;
  footer?: string; footerColor?: string;
}) {
  if (!data.length) return <EmptyState />;
  return (
    <div className="flex flex-col items-center mt-4">
      <div style={{ width: size, height: size }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={data} cx="50%" cy="50%" innerRadius="50%" outerRadius="76%" paddingAngle={3} dataKey="value" strokeWidth={0}>
              {data.map((e, i) => <Cell key={i} fill={e.color} />)}
            </Pie>
            <Tooltip contentStyle={{ borderRadius: 10, border: 'none', fontSize: 12, boxShadow: '0 4px 16px rgba(0,0,0,0.1)' }} />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <div className="w-full mt-3 space-y-2">
        {data.map(d => (
          <div key={d.name} className="flex items-center gap-2">
            <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: d.color }} />
            <span className="flex-1 text-xs font-semibold text-slate-600">{d.name}</span>
            <span className="text-sm font-black tabular-nums shrink-0" style={{ color: d.color }}>{d.value}</span>
            {total > 0 && (
              <span className="text-[10px] text-slate-400 w-7 text-right shrink-0">
                {((d.value / total) * 100).toFixed(0)}%
              </span>
            )}
          </div>
        ))}
        {footer && <p className="text-xs font-bold pt-1" style={{ color: footerColor }}>{footer}</p>}
        <p className="text-[10px] text-slate-400 border-t border-slate-100 pt-1.5">Total: <strong>{total}</strong></p>
      </div>
    </div>
  );
}

function BigStatCard({ label, value, color }: { label: string; value: number | string; color: string }) {
  return (
    <div className="rounded-2xl p-5 text-center" style={{ background: `${color}10`, border: `1px solid ${color}30` }}>
      <div className="text-4xl font-black tabular-nums" style={{ color }}>{value}</div>
      <div className="text-xs font-semibold text-slate-500 mt-1.5 leading-tight">{label}</div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex items-center justify-center h-32 text-slate-300 text-[10px] font-bold uppercase tracking-wider mt-4 border-2 border-dashed border-slate-100 rounded-xl">
      Sem dados disponíveis
    </div>
  );
}

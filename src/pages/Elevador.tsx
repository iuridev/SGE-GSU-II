import { useState, useEffect, useMemo, useRef } from 'react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import html2canvas from 'html2canvas';
import { addTimbradoAllPages } from '../lib/pdfTimbrado';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, Legend,
} from 'recharts';
import {
  ArrowUpCircle,
  CheckCircle2,
  AlertTriangle,
  Search,
  Loader2,
  Settings2,
  Wrench,
  MapPin,
  RefreshCw,
  Hash,
  Building2,
  DollarSign,
  Calendar,
  Layers,
  ClipboardList,
  ShieldCheck,
  FileDown,
  CalendarDays,
  X,
} from 'lucide-react';

// Colunas da aba "Elevadores":
// A: CIE | B: ESCOLA | C: CONTRATO | D: ENDEREÇO | E: NÚM. | F: BAIRRO
// G: DESCRITIVO | H: Paradas | I: ORÇAMENTO | J: DATA ORÇAMENTO
// K: ELEVADOR EM FUNCIONAMENTO? | L: STATUS | M: PROBLEMA

const ELEVADOR_SHEET_ID = import.meta.env.VITE_ELEVADOR_SHEET_ID as string;

interface ElevadorRow {
  cie: string;
  escola: string;
  contrato: string;
  endereco: string;
  numero: string;
  bairro: string;
  descritivo: string;
  paradas: string;
  orcamento: number | null;
  dataOrcamento: string | null;
  emFuncionamento: boolean;
  status: string;
  problema: string;
}

function parseGvizDate(v: any): string | null {
  if (!v) return null;
  if (typeof v === 'string') {
    const m = v.match(/Date\((\d+),(\d+),(\d+)/);
    if (m) return new Date(+m[1], +m[2], +m[3]).toLocaleDateString('pt-BR');
  }
  return null;
}

async function fetchElevadoresFromSheet(): Promise<ElevadorRow[]> {
  const url = `https://docs.google.com/spreadsheets/d/${ELEVADOR_SHEET_ID}/gviz/tq?tqx=out:json&sheet=Elevadores`;
  const res = await fetch(url);
  const text = await res.text();
  const jsonStr = text
    .replace(/[\s\S]*?google\.visualization\.Query\.setResponse\(/, '')
    .replace(/\);?\s*$/, '');
  const data = JSON.parse(jsonStr);

  return (data.table.rows as any[])
    .map((row) => {
      const c = row.c as any[];
      const get = (i: number) => c[i]?.v ?? null;
      const str = (i: number): string => String(get(i) ?? '').trim();
      return {
        cie: get(0) ? String(Math.round(Number(get(0)))) : '',
        escola: str(1),
        contrato: str(2),
        endereco: str(3),
        numero: get(4) ? String(Math.round(Number(get(4)))) : '',
        bairro: str(5),
        descritivo: str(6),
        paradas: str(7).replace(/\r/g, '').trim(),
        orcamento: get(8) != null ? Number(get(8)) : null,
        dataOrcamento: parseGvizDate(get(9)),
        emFuncionamento: str(10).toUpperCase() === 'SIM',
        status: str(11),
        problema: str(12),
      };
    })
    .filter((r) => r.escola);
}

// dd/mm/yyyy (formato devolvido por parseGvizDate) -> yyyy-mm-dd, para dar pra
// agrupar por mês. Retorna '' quando não reconhece o formato.
function parseDataBR(raw: string | null): string {
  if (!raw) return '';
  const m = raw.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (!m) return '';
  const [, d, mo, y] = m;
  return `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`;
}

// Agrupa o texto livre da coluna STATUS em poucas categorias (mesmas usadas pelas
// cores de statusStyle) — sem isso o gráfico teria uma barra por variação de texto.
function statusBucket(status: string): string {
  const s = status.toLowerCase();
  if (s.includes('conclu')) return 'Concluído';
  if (s.includes('aguard')) return 'Aguardando';
  if (s.includes('reparo') || s.includes('revis')) return 'Reparo/Revisão';
  if (s.includes('verific') || s.includes('pdde')) return 'Verificação/PDDE';
  if (!s) return 'Sem Status';
  return 'Outro';
}
const STATUS_BUCKET_COLORS: Record<string, string> = {
  'Concluído': '#10b981', 'Aguardando': '#f59e0b', 'Reparo/Revisão': '#f97316',
  'Verificação/PDDE': '#3b82f6', 'Outro': '#94a3b8', 'Sem Status': '#cbd5e1',
};

function statusStyle(status: string): string {
  const s = status.toLowerCase();
  if (s.includes('conclu')) return 'bg-emerald-100 text-emerald-700';
  if (s.includes('aguard')) return 'bg-amber-100 text-amber-700';
  if (s.includes('reparo') || s.includes('revis')) return 'bg-orange-100 text-orange-700';
  if (s.includes('verific') || s.includes('pdde')) return 'bg-blue-100 text-blue-700';
  return 'bg-slate-100 text-slate-500';
}

function ElevadorCard({
  el,
  fmtCurrency,
}: {
  el: ElevadorRow;
  fmtCurrency: (v: number) => string;
}) {
  const ok = el.emFuncionamento;
  return (
    <div
      className={`bg-white rounded-[3rem] border-2 transition-all shadow-xl overflow-hidden group flex flex-col
        ${ok ? 'border-slate-100 hover:border-emerald-200' : 'border-red-100 hover:border-red-300 shadow-red-50'}`}
    >
      <div className={`h-1.5 w-full ${ok ? 'bg-emerald-400' : 'bg-red-500'}`} />

      <div className="p-8 flex flex-col gap-5 flex-1">
        {/* Topo */}
        <div className="flex items-start justify-between">
          <div className={`p-3.5 rounded-2xl ${ok ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-500'}`}>
            <ArrowUpCircle size={28} className={!ok ? 'opacity-50' : ''} />
          </div>
          <div className="flex flex-col items-end gap-2">
            <span
              className={`px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest
                ${ok ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700 animate-pulse'}`}
            >
              {ok ? 'Funcionando' : 'Parado'}
            </span>
            {el.contrato && (
              <span className="px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest bg-slate-100 text-slate-500">
                {el.contrato}
              </span>
            )}
          </div>
        </div>

        {/* Nome da escola */}
        <div>
          <h3 className="text-lg font-black text-slate-800 uppercase tracking-tight leading-tight group-hover:text-amber-600 transition-colors line-clamp-2">
            {el.escola}
          </h3>
          <div className="flex flex-wrap gap-x-4 gap-y-1.5 mt-2.5">
            {el.cie && (
              <div className="flex items-center gap-1.5 text-slate-400">
                <Hash size={12} className="shrink-0" />
                <span className="text-[11px] font-bold uppercase">CIE {el.cie}</span>
              </div>
            )}
            {(el.endereco || el.bairro) && (
              <div className="flex items-center gap-1.5 text-slate-400">
                <MapPin size={12} className="shrink-0" />
                <span className="text-[11px] font-bold uppercase truncate max-w-[240px]">
                  {el.endereco ? `${el.endereco}${el.numero ? ', ' + el.numero : ''}` : ''}
                  {el.bairro ? ` · ${el.bairro}` : ''}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Descritivo técnico */}
        {el.descritivo && (
          <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100">
            <div className="flex items-start gap-2">
              <Settings2 size={13} className="text-slate-400 mt-0.5 shrink-0" />
              <p className="text-[10px] text-slate-500 font-medium leading-relaxed line-clamp-3">
                {el.descritivo}
              </p>
            </div>
          </div>
        )}

        {/* Paradas */}
        {el.paradas && (
          <div className="flex items-center gap-2 text-slate-500">
            <Layers size={13} className="shrink-0 text-slate-400" />
            <span className="text-[11px] font-bold uppercase">{el.paradas}</span>
          </div>
        )}

        {/* Status e Problema */}
        <div className="flex flex-wrap gap-2">
          {el.status && (
            <span
              className={`px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center gap-1.5 ${statusStyle(el.status)}`}
            >
              <ClipboardList size={12} />
              {el.status}
            </span>
          )}
          {el.problema && (
            <span className="px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest bg-amber-50 text-amber-700 flex items-center gap-1.5">
              <Wrench size={12} />
              {el.problema}
            </span>
          )}
        </div>

        {/* Orçamento e data */}
        {(el.orcamento != null || el.dataOrcamento) && (
          <div className="mt-auto pt-4 border-t border-slate-50 flex flex-wrap gap-5">
            {el.orcamento != null && (
              <div className="flex items-center gap-2">
                <DollarSign size={14} className="text-amber-500" />
                <span className="text-sm font-black text-slate-700">{fmtCurrency(el.orcamento)}</span>
              </div>
            )}
            {el.dataOrcamento && (
              <div className="flex items-center gap-2 text-slate-400">
                <Calendar size={14} />
                <span className="text-xs font-bold">{el.dataOrcamento}</span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export function Elevador() {
  const [elevadores, setElevadores] = useState<ElevadorRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [filter, setFilter] = useState<'all' | 'sim' | 'nao'>('all');
  const [contratoFilter, setContratoFilter] = useState('all');

  // ── Relatório Mensal (PDF) ────────────────────────────────────────────
  const [showRelatorioModal, setShowRelatorioModal] = useState(false);
  const [relatorioMes, setRelatorioMes] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });
  const [gerandoRelatorioPdf, setGerandoRelatorioPdf] = useState(false);
  const relatorioRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    try {
      await fetchData();
    } finally {
      setLoading(false);
    }
  }

  async function fetchData() {
    setRefreshing(true);
    try {
      const rows = await fetchElevadoresFromSheet();
      setElevadores(rows);
    } catch (err) {
      console.error('Erro ao buscar dados de elevadores:', err);
    } finally {
      setRefreshing(false);
    }
  }

  const fmtCurrency = (v: number) =>
    v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  function exportPDF() {
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    const dataGeracao = new Date().toLocaleString('pt-BR');

    // Subtítulo (timbrado desenhado por addTimbradoAllPages ao final)
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(15, 23, 42);
    doc.text('GESTÃO DE ELEVADORES — PAINEL DE MANUTENÇÃO E CONTROLE', 14, 36);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    doc.text(`Gerado em: ${dataGeracao}`, 14, 41);

    // KPIs
    const kpis = [
      `Total: ${stats.total}`,
      `Funcionando: ${stats.funcionando}`,
      `Parados: ${stats.parados}`,
      `Orçamento: ${fmtCurrency(stats.totalOrcamento)}`,
    ];
    doc.setFontSize(8);
    doc.text(`${kpis[0]}   ${kpis[1]}`, 200, 36);
    doc.text(`${kpis[2]}   ${kpis[3]}`, 200, 41);

    // Tabela
    autoTable(doc, {
      startY: 47,
      head: [['CIE', 'Escola', 'Contrato', 'Bairro', 'Paradas', 'Funcionando?', 'Status', 'Orçamento', 'Problema']],
      body: filtered.map((e) => [
        e.cie,
        e.escola,
        e.contrato || '—',
        e.bairro || '—',
        e.paradas || '—',
        e.emFuncionamento ? 'SIM' : 'NÃO',
        e.status || '—',
        e.orcamento != null ? fmtCurrency(e.orcamento) : '—',
        e.problema || '—',
      ]),
      styles: { fontSize: 7, cellPadding: 2.5, overflow: 'linebreak' },
      headStyles: { fillColor: [15, 23, 42], textColor: [251, 191, 36], fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      columnStyles: {
        0: { cellWidth: 18 },
        1: { cellWidth: 52 },
        2: { cellWidth: 20 },
        3: { cellWidth: 28 },
        4: { cellWidth: 30 },
        5: { cellWidth: 22, halign: 'center' },
        6: { cellWidth: 35 },
        7: { cellWidth: 28, halign: 'right' },
        8: { cellWidth: 35 },
      },
      didParseCell(data) {
        if (data.column.index === 5 && data.section === 'body') {
          const val = String(data.cell.raw);
          data.cell.styles.textColor = val === 'SIM' ? [5, 150, 105] : [220, 38, 38];
          data.cell.styles.fontStyle = 'bold';
        }
      },
    });

    addTimbradoAllPages(doc);

    const filtroLabel = filter !== 'all' ? `_${filter}` : '';
    doc.save(`elevadores${filtroLabel}_${new Date().toISOString().slice(0, 10)}.pdf`);
  }

  const contratos = useMemo(
    () => Array.from(new Set(elevadores.map((e) => e.contrato).filter(Boolean))).sort(),
    [elevadores]
  );

  const stats = useMemo(() => {
    const total = elevadores.length;
    const funcionando = elevadores.filter((e) => e.emFuncionamento).length;
    const parados = total - funcionando;
    const totalOrcamento = elevadores.reduce((s, e) => s + (e.orcamento ?? 0), 0);
    return { total, funcionando, parados, totalOrcamento };
  }, [elevadores]);

  // ── Relatório Mensal ────────────────────────────────────────────────────
  // A planilha não tem data de cadastro/conclusão por elevador — só um status
  // textual e uma data de orçamento (nem sempre preenchida). Por isso o corte
  // "no mês" só vale para orçamentos datados; o resto do relatório é sempre uma
  // fotografia da situação atual.
  const statusChartData = useMemo(() => {
    const counts: Record<string, number> = {};
    elevadores.forEach((e) => {
      const b = statusBucket(e.status);
      counts[b] = (counts[b] || 0) + 1;
    });
    return Object.entries(counts)
      .map(([name, quantidade]) => ({ name, quantidade, color: STATUS_BUCKET_COLORS[name] || '#94a3b8' }))
      .sort((a, b) => b.quantidade - a.quantidade);
  }, [elevadores]);

  const contratoChartData = useMemo(() => {
    const counts: Record<string, number> = {};
    elevadores.forEach((e) => {
      const c = e.contrato || 'Sem Contrato';
      counts[c] = (counts[c] || 0) + 1;
    });
    return Object.entries(counts)
      .map(([name, quantidade]) => ({ name, quantidade }))
      .sort((a, b) => b.quantidade - a.quantidade)
      .slice(0, 8);
  }, [elevadores]);

  const opcoesMesRelatorio = useMemo(() => {
    const opts: { key: string; label: string }[] = [];
    const base = new Date();
    for (let i = 0; i < 12; i++) {
      const d = new Date(base.getFullYear(), base.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      opts.push({ key, label: d.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }) });
    }
    return opts;
  }, []);

  const mesLabel = (mesStr: string) => {
    const [ano, mesNum] = mesStr.split('-').map(Number);
    if (!ano || !mesNum) return mesStr;
    return new Date(ano, mesNum - 1, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  };

  const relatorioMetrics = useMemo(() => {
    const mes = relatorioMes;
    const orcamentosDoMes = elevadores.filter((e) => parseDataBR(e.dataOrcamento).startsWith(mes));
    const valorOrcadoNoMes = orcamentosDoMes.reduce((s, e) => s + (e.orcamento ?? 0), 0);

    const [anoSel, mesSelNum] = mes.split('-').map(Number);
    const tendencia = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(anoSel, (mesSelNum - 1) - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const label = d.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' });
      const qtd = elevadores.filter((e) => parseDataBR(e.dataOrcamento).startsWith(key)).length;
      tendencia.push({ mes: label, 'Orçamentos Datados': qtd });
    }

    return { orcamentosNoMesCount: orcamentosDoMes.length, valorOrcadoNoMes, tendencia };
  }, [relatorioMes, elevadores]);

  // Relatório Mensal em PDF: mesma técnica já usada nas demais páginas
  // (html2canvas do bloco de cards + gráficos Recharts renderizado no modal + addImage).
  const gerarRelatorioMensalPdf = async () => {
    if (!relatorioRef.current) return;
    setGerandoRelatorioPdf(true);
    try {
      await new Promise((r) => setTimeout(r, 400));
      const canvas = await html2canvas(relatorioRef.current, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#ffffff',
      });
      const imgData = canvas.toDataURL('image/png');

      const doc = new jsPDF();
      const pdfWidth = doc.internal.pageSize.getWidth();
      const pdfHeight = doc.internal.pageSize.getHeight();
      const margin = 14;
      const currentY = 40;

      let printWidth = pdfWidth - margin * 2;
      let printHeight = (canvas.height * printWidth) / canvas.width;
      const maxHeight = pdfHeight - currentY - margin;
      if (printHeight > maxHeight) {
        const ratio = maxHeight / printHeight;
        printHeight = maxHeight;
        printWidth *= ratio;
      }
      doc.addImage(imgData, 'PNG', margin, currentY, printWidth, printHeight);

      addTimbradoAllPages(doc);
      doc.save(`Relatorio_Mensal_Elevadores_${relatorioMes}.pdf`);
      setShowRelatorioModal(false);
    } catch (err) {
      console.error(err);
      alert('Houve um erro ao gerar o PDF. Tente novamente.');
    } finally {
      setGerandoRelatorioPdf(false);
    }
  };

  const filtered = useMemo(
    () =>
      elevadores.filter((e) => {
        const q = searchTerm.toLowerCase();
        const matchSearch =
          !q ||
          e.escola.toLowerCase().includes(q) ||
          e.cie.includes(q) ||
          e.bairro.toLowerCase().includes(q);
        const matchFunc =
          filter === 'all' ? true : filter === 'sim' ? e.emFuncionamento : !e.emFuncionamento;
        const matchContrato = contratoFilter === 'all' || e.contrato === contratoFilter;
        return matchSearch && matchFunc && matchContrato;
      }),
    [elevadores, searchTerm, filter, contratoFilter]
  );

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-40 gap-4">
        <Loader2 className="animate-spin text-amber-500" size={48} />
        <p className="font-black text-slate-400 uppercase tracking-widest text-xs">
          Carregando dados de elevadores...
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-8 pb-32 bg-[#f8fafc] min-h-screen">
      {/* Header */}
      <div className="bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 rounded-[3rem] p-10 text-white shadow-2xl relative overflow-hidden">
        <Settings2
          className="absolute -right-8 -top-8 text-white/5 animate-spin"
          style={{ animationDuration: '30s' }}
          size={200}
        />
        <Wrench
          className="absolute right-48 -bottom-6 text-white/5"
          size={100}
        />
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="flex items-center gap-6">
            <div className="p-5 bg-amber-500 rounded-[2rem] shadow-2xl shadow-amber-900/60">
              <ArrowUpCircle size={36} className="text-white" />
            </div>
            <div>
              <h1 className="text-3xl font-black text-white tracking-tight uppercase leading-none">
                Gestão de Elevadores
              </h1>
              <p className="text-amber-400/80 font-bold mt-1 uppercase text-xs tracking-widest">
                Painel de Manutenção e Controle
              </p>
              <p className="text-slate-400 text-xs mt-1 font-medium italic">
                Fonte: Planilha Operacional · {elevadores.length} elevadores cadastrados
              </p>
            </div>
          </div>
          <div className="flex gap-3 self-start md:self-auto">
            <button
              onClick={() => setShowRelatorioModal(true)}
              className="flex items-center gap-2 bg-white/10 hover:bg-white/20 border border-white/10 px-5 py-3 rounded-2xl text-white text-xs font-black uppercase tracking-widest transition-all active:scale-95"
            >
              <ClipboardList size={15} />
              Relatório Mensal
            </button>
            <button
              onClick={exportPDF}
              disabled={filtered.length === 0}
              className="flex items-center gap-2 bg-amber-500 hover:bg-amber-400 px-5 py-3 rounded-2xl text-white text-xs font-black uppercase tracking-widest transition-all active:scale-95 disabled:opacity-40 shadow-lg shadow-amber-900/40"
            >
              <FileDown size={15} />
              Exportar PDF
            </button>
            <button
              onClick={fetchData}
              disabled={refreshing}
              className="flex items-center gap-2 bg-white/10 hover:bg-white/20 border border-white/10 px-5 py-3 rounded-2xl text-white text-xs font-black uppercase tracking-widest transition-all active:scale-95 disabled:opacity-50"
            >
              <RefreshCw size={15} className={refreshing ? 'animate-spin' : ''} />
              Atualizar
            </button>
          </div>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-lg flex items-center gap-4">
          <div className="w-14 h-14 bg-slate-100 text-slate-600 rounded-2xl flex items-center justify-center shrink-0">
            <Building2 size={26} />
          </div>
          <div>
            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">
              Total
            </p>
            <h3 className="text-3xl font-black text-slate-800">{stats.total}</h3>
          </div>
        </div>

        <div className="bg-white p-6 rounded-3xl border border-emerald-100 shadow-lg flex items-center gap-4">
          <div className="w-14 h-14 bg-emerald-50 text-emerald-600 rounded-2xl flex items-center justify-center shrink-0">
            <CheckCircle2 size={26} />
          </div>
          <div>
            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">
              Funcionando
            </p>
            <h3 className="text-3xl font-black text-emerald-600">{stats.funcionando}</h3>
          </div>
        </div>

        <div className="bg-white p-6 rounded-3xl border border-red-100 shadow-lg flex items-center gap-4">
          <div className="w-14 h-14 bg-red-50 text-red-500 rounded-2xl flex items-center justify-center shrink-0">
            <AlertTriangle size={26} />
          </div>
          <div>
            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">
              Parados
            </p>
            <h3 className="text-3xl font-black text-red-600">{stats.parados}</h3>
          </div>
        </div>

        <div className="bg-white p-6 rounded-3xl border border-amber-100 shadow-lg flex items-center gap-4">
          <div className="w-14 h-14 bg-amber-50 text-amber-500 rounded-2xl flex items-center justify-center shrink-0">
            <DollarSign size={26} />
          </div>
          <div className="min-w-0">
            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">
              Orçamento Total
            </p>
            <h3 className="text-lg font-black text-amber-600 truncate">
              {fmtCurrency(stats.totalOrcamento)}
            </h3>
          </div>
        </div>
      </div>

      {/* Filtros */}
      <div className="bg-white p-4 rounded-[2.5rem] border border-slate-100 shadow-sm flex flex-wrap gap-4 items-center">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
          <input
            type="text"
            placeholder="Buscar por escola, CIE ou bairro..."
            className="w-full pl-11 pr-4 py-3 bg-slate-50 rounded-2xl text-sm font-medium text-slate-700 outline-none focus:ring-2 focus:ring-amber-400 border-none"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        <div className="flex gap-2 p-2 bg-slate-100 rounded-2xl">
          {(
            [
              ['all', 'Todos'],
              ['sim', 'Funcionando'],
              ['nao', 'Parados'],
            ] as const
          ).map(([val, lbl]) => (
            <button
              key={val}
              onClick={() => setFilter(val)}
              className={`px-5 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all
                ${filter === val ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
            >
              {lbl}
            </button>
          ))}
        </div>

        <select
          value={contratoFilter}
          onChange={(e) => setContratoFilter(e.target.value)}
          className="bg-slate-50 border-none rounded-2xl px-4 py-3 text-xs font-black uppercase tracking-widest text-slate-600 outline-none focus:ring-2 focus:ring-amber-400 cursor-pointer"
        >
          <option value="all">Todos os Contratos</option>
          {contratos.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>

      {/* Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
        {filtered.length === 0 ? (
          <div className="col-span-full py-32 bg-white rounded-[4rem] border-2 border-dashed border-slate-100 text-center flex flex-col items-center justify-center">
            <Wrench size={48} className="text-slate-100 mb-4" />
            <h3 className="text-sm font-black text-slate-400 uppercase tracking-widest">
              Nenhum elevador encontrado com estes filtros
            </h3>
          </div>
        ) : (
          filtered.map((el, i) => <ElevadorCard key={i} el={el} fmtCurrency={fmtCurrency} />)
        )}
      </div>

      {/* Rodapé técnico */}
      <div className="bg-slate-900 p-10 rounded-[4rem] text-white shadow-2xl relative overflow-hidden group">
        <ShieldCheck
          className="absolute -right-6 -bottom-6 text-white/5 group-hover:scale-110 transition-transform"
          size={180}
        />
        <div className="flex items-start gap-8 relative z-10">
          <div className="p-5 bg-white/10 rounded-[1.8rem] backdrop-blur-md border border-white/5 shadow-xl">
            <Wrench size={32} className="text-amber-400" />
          </div>
          <div>
            <h4 className="text-lg font-black uppercase tracking-tight mb-3">
              Dados de Manutenção Preventiva
            </h4>
            <p className="text-sm text-white/60 leading-relaxed font-medium uppercase italic max-w-3xl">
              Os dados deste painel são sincronizados diretamente com a{' '}
              <strong className="text-amber-400">Planilha Operacional de Elevadores</strong>. Para
              atualizar status de funcionamento, contratos ou orçamentos, edite a planilha
              diretamente. As alterações refletem no sistema após clicar em{' '}
              <strong className="text-emerald-400">Atualizar</strong>.
            </p>
          </div>
        </div>
      </div>

      {/* Modal: Relatório Mensal (PDF) */}
      {showRelatorioModal && (
        <div className="fixed inset-0 z-[110] bg-slate-900/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between p-5 border-b border-slate-100">
              <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                <ClipboardList size={20} className="text-amber-600" /> Relatório Mensal
              </h2>
              <button onClick={() => setShowRelatorioModal(false)} className="p-2 hover:bg-slate-100 rounded-lg transition-colors">
                <X size={18} className="text-slate-500" />
              </button>
            </div>

            <div className="px-5 py-3 border-b border-slate-100 flex items-center gap-3">
              <label className="text-sm font-medium text-slate-600 flex items-center gap-1.5"><CalendarDays size={15} /> Mês de referência:</label>
              <select
                value={relatorioMes}
                onChange={(e) => setRelatorioMes(e.target.value)}
                className="px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500"
              >
                {opcoesMesRelatorio.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
              </select>
            </div>

            <div className="overflow-y-auto flex-1 p-5">
              <div ref={relatorioRef} className="space-y-5 bg-white p-1">
                <div>
                  <h3 className="text-base font-bold text-slate-800">Relatório Mensal — Gestão de Elevadores</h3>
                  <p className="text-xs text-slate-500">Referência: {mesLabel(relatorioMes)} • Gerado em {new Date().toLocaleString('pt-BR')}</p>
                  <p className="text-[11px] text-amber-600 mt-1">
                    A planilha não guarda data de cadastro/conclusão por elevador — só a data do orçamento (nem sempre preenchida). Os demais indicadores são a situação atual, não recortada por mês.
                  </p>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div className="border border-slate-100 rounded-xl p-3">
                    <p className="text-xs text-slate-500 font-medium">Orçamentos Datados no Mês</p>
                    <p className="text-2xl font-bold text-slate-800 mt-1">{relatorioMetrics.orcamentosNoMesCount}</p>
                    <p className="text-[11px] text-slate-400 mt-0.5">{fmtCurrency(relatorioMetrics.valorOrcadoNoMes)}</p>
                  </div>
                  <div className="border border-slate-100 rounded-xl p-3">
                    <p className="text-xs text-slate-500 font-medium">Funcionando (hoje)</p>
                    <p className="text-2xl font-bold text-emerald-600 mt-1">{stats.funcionando}</p>
                  </div>
                  <div className="border border-slate-100 rounded-xl p-3">
                    <p className="text-xs text-slate-500 font-medium">Parados (hoje)</p>
                    <p className="text-2xl font-bold text-red-600 mt-1">{stats.parados}</p>
                  </div>
                  <div className="border border-slate-100 rounded-xl p-3 bg-slate-50">
                    <p className="text-xs text-slate-500 font-medium">Orçamento Total</p>
                    <p className="text-lg font-bold text-slate-800 mt-1">{fmtCurrency(stats.totalOrcamento)}</p>
                  </div>
                </div>

                <div>
                  <h4 className="text-xs font-semibold text-slate-500 mb-2">Orçamentos Datados por Mês (últimos 6 meses)</h4>
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={relatorioMetrics.tendencia} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                      <XAxis dataKey="mes" tick={{ fontSize: 10 }} />
                      <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                      <Tooltip />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      <Bar dataKey="Orçamentos Datados" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                <div>
                  <h4 className="text-xs font-semibold text-slate-500 mb-2">Situação Atual por Status</h4>
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={statusChartData} layout="vertical" margin={{ top: 5, right: 30, left: 10, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" horizontal vertical={false} stroke="#f1f5f9" />
                      <XAxis type="number" hide allowDecimals={false} />
                      <YAxis dataKey="name" type="category" axisLine={false} tickLine={false} tick={{ fontSize: 11, fontWeight: 600, fill: '#64748b' }} width={130} />
                      <Tooltip />
                      <Bar dataKey="quantidade" radius={[0, 6, 6, 0]} barSize={18}>
                        {statusChartData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                <div>
                  <h4 className="text-xs font-semibold text-slate-500 mb-2">Elevadores por Contrato</h4>
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={contratoChartData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                      <XAxis dataKey="name" tick={{ fontSize: 9 }} interval={0} angle={-20} textAnchor="end" />
                      <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                      <Tooltip />
                      <Bar dataKey="quantidade" fill="#0ea5e9" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>

            <div className="p-4 border-t border-slate-100 flex justify-end gap-2">
              <button
                onClick={() => setShowRelatorioModal(false)}
                className="px-4 py-2 text-sm text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={gerarRelatorioMensalPdf}
                disabled={gerandoRelatorioPdf}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-amber-600 rounded-lg hover:bg-amber-700 disabled:opacity-60 transition-colors"
              >
                {gerandoRelatorioPdf ? <Loader2 size={16} className="animate-spin" /> : <FileDown size={16} />}
                {gerandoRelatorioPdf ? 'Gerando PDF...' : 'Baixar PDF'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Elevador;

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  PieChart, Pie, Cell, ResponsiveContainer, LabelList,
} from 'recharts';
import {
  HardHat, Download, RefreshCw, Search,
  Building2, DollarSign, CheckCircle, Clock, AlertTriangle,
  ChevronLeft, ChevronRight, X, TrendingUp, Layers,
} from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import html2canvas from 'html2canvas';

//Pagina URE GUARULHOS SUL

const SHEET_ID = import.meta.env.VITE_FDE_SHEET_ID as string;

interface ObraRow {
  codPredio: string;
  escola: string;
  orgaoExecutor: string;
  fase: string;
  etapa: string;
  situacao: string;
  pi: string;
  valorOrcamento: number;
  intervencao: string;
  descricao: string;
}

const FASE_COLORS: Record<string, string> = {
  'Planejamento': '#94a3b8',
  'Orçamento': '#f59e0b',
  'Projeto': '#3b82f6',
  'Pré-Contratação': '#8b5cf6',
  'Contratação': '#f97316',
  'Execução': '#22c55e',
  'Finalizado': '#10b981',
  'Finalizada': '#10b981',
};

const CHART_COLORS = ['#f97316', '#f59e0b', '#3b82f6', '#8b5cf6', '#22c55e', '#ef4444', '#06b6d4', '#84cc16'];

function formatCurrency(value: number): string {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

async function fetchSheetData(): Promise<ObraRow[]> {
  const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:json`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Erro HTTP ${response.status}`);

  const text = await response.text();
  const jsonStart = text.indexOf('{');
  const jsonEnd = text.lastIndexOf('}') + 1;
  if (jsonStart === -1 || jsonEnd === 0) throw new Error('Resposta inválida da planilha');

  const json = JSON.parse(text.slice(jsonStart, jsonEnd));
  if (!json.table?.rows) throw new Error('Estrutura de dados inesperada');

  return json.table.rows
    .filter((row: any) => row?.c?.[1]?.v)
    .map((row: any): ObraRow => {
      const c = row.c || [];
      const v = (i: number) => c[i]?.v ?? null;

      let valorOrcamento = 0;
      const rawValor = v(7);
      if (typeof rawValor === 'number') {
        valorOrcamento = rawValor;
      } else if (typeof rawValor === 'string' && rawValor) {
        valorOrcamento = parseFloat(rawValor.replace(/[^0-9.]/g, '')) || 0;
      }

      return {
        codPredio: v(0) != null ? String(v(0)).trim() : '',
        escola: v(1) != null ? String(v(1)).trim() : '',
        orgaoExecutor: v(2) != null ? String(v(2)).trim() : '',
        fase: v(3) != null ? String(v(3)).trim() : '',
        etapa: v(4) != null ? String(v(4)).trim() : '',
        situacao: v(5) != null ? String(v(5)).trim() : '',
        pi: v(6) != null ? String(v(6)).trim() : '',
        valorOrcamento,
        intervencao: v(8) != null ? String(v(8)).trim() : '',
        descricao: v(9) != null ? String(v(9)).trim() : '',
      };
    });
}

function getFaseColor(fase: string): string {
  return FASE_COLORS[fase] || '#94a3b8';
}

function getSituacaoBadge(s: string): string {
  const lower = s?.toLowerCase() || '';
  if (lower.includes('conclu') || lower.includes('finaliz')) return 'bg-emerald-100 text-emerald-700';
  if (lower.includes('andamento')) return 'bg-orange-100 text-orange-700';
  if (lower.includes('pendente') || lower.includes('aguard')) return 'bg-amber-100 text-amber-700';
  if (lower.includes('suspen') || lower.includes('paralis')) return 'bg-red-100 text-red-600';
  return 'bg-slate-100 text-slate-600';
}

const CustomPieLabel = ({ cx, cy, midAngle, outerRadius, name, percent }: any) => {
  if (percent < 0.05) return null;
  const RADIAN = Math.PI / 180;
  const radius = outerRadius + 28;
  const x = cx + radius * Math.cos(-midAngle * RADIAN);
  const y = cy + radius * Math.sin(-midAngle * RADIAN);
  return (
    <text x={x} y={y} fill="#475569" textAnchor={x > cx ? 'start' : 'end'} dominantBaseline="central" style={{ fontSize: 11, fontWeight: 600 }}>
      {`${name} (${(percent * 100).toFixed(0)}%)`}
    </text>
  );
};

export default function PrevisaoObrasFDE() {
  const [obras, setObras] = useState<ObraRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [exportingPdf, setExportingPdf] = useState(false);

  const [searchQuery, setSearchQuery] = useState('');
  const [filterFase, setFilterFase] = useState('');
  const [filterIntervencao, setFilterIntervencao] = useState('');
  const [filterSituacao, setFilterSituacao] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 15;

  const chartsRef = useRef<HTMLDivElement>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchSheetData();
      setObras(data);
      setLastUpdated(new Date());
    } catch (err) {
      setError('Não foi possível carregar os dados. Verifique a conexão e tente novamente.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const uniqueFases = useMemo(() => [...new Set(obras.map(o => o.fase).filter(Boolean))].sort(), [obras]);
  const uniqueIntervencoes = useMemo(() => [...new Set(obras.map(o => o.intervencao).filter(Boolean))].sort(), [obras]);
  const uniqueSituacoes = useMemo(() => [...new Set(obras.map(o => o.situacao).filter(Boolean))].sort(), [obras]);

  const filteredObras = useMemo(() => {
    return obras.filter(obra => {
      const q = searchQuery.toLowerCase();
      const matchSearch = !q ||
        obra.escola.toLowerCase().includes(q) ||
        obra.codPredio.includes(q) ||
        obra.pi.toLowerCase().includes(q) ||
        obra.descricao.toLowerCase().includes(q) ||
        obra.intervencao.toLowerCase().includes(q);
      return matchSearch &&
        (!filterFase || obra.fase === filterFase) &&
        (!filterIntervencao || obra.intervencao === filterIntervencao) &&
        (!filterSituacao || obra.situacao === filterSituacao);
    });
  }, [obras, searchQuery, filterFase, filterIntervencao, filterSituacao]);

  const kpis = useMemo(() => {
    const total = obras.length;
    const valorTotal = obras.reduce((sum, o) => sum + o.valorOrcamento, 0);
    const concluidas = obras.filter(o => {
      const f = o.fase?.toLowerCase() || '';
      const s = o.situacao?.toLowerCase() || '';
      return f.includes('finaliz') || s.includes('conclu');
    }).length;
    const emAndamento = obras.filter(o => {
      const s = o.situacao?.toLowerCase() || '';
      return s.includes('andamento');
    }).length;
    return { total, valorTotal, concluidas, emAndamento };
  }, [obras]);

  const faseChartData = useMemo(() => {
    const counts: Record<string, number> = {};
    obras.forEach(o => { if (o.fase) counts[o.fase] = (counts[o.fase] || 0) + 1; });
    return Object.entries(counts).map(([fase, count]) => ({ fase, count })).sort((a, b) => b.count - a.count);
  }, [obras]);

  const intervencaoChartData = useMemo(() => {
    const counts: Record<string, number> = {};
    obras.forEach(o => { if (o.intervencao) counts[o.intervencao] = (counts[o.intervencao] || 0) + 1; });
    return Object.entries(counts).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  }, [obras]);

  const orgaoChartData = useMemo(() => {
    const counts: Record<string, number> = {};
    obras.forEach(o => { if (o.orgaoExecutor) counts[o.orgaoExecutor] = (counts[o.orgaoExecutor] || 0) + 1; });
    return Object.entries(counts).map(([orgao, count]) => ({ orgao: orgao.length > 22 ? orgao.slice(0, 19) + '…' : orgao, count }))
      .sort((a, b) => b.count - a.count).slice(0, 8);
  }, [obras]);

  const topEscolasChartData = useMemo(() => {
    const totals: Record<string, number> = {};
    obras.forEach(o => {
      if (o.escola && o.valorOrcamento > 0) totals[o.escola] = (totals[o.escola] || 0) + o.valorOrcamento;
    });
    return Object.entries(totals)
      .map(([escola, valor]) => ({ escola: escola.length > 28 ? escola.slice(0, 25) + '…' : escola, valor }))
      .sort((a, b) => b.valor - a.valor)
      .slice(0, 8);
  }, [obras]);

  const paginatedObras = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    return filteredObras.slice(start, start + ITEMS_PER_PAGE);
  }, [filteredObras, currentPage]);

  const totalPages = Math.ceil(filteredObras.length / ITEMS_PER_PAGE);

  const clearFilters = () => {
    setSearchQuery('');
    setFilterFase('');
    setFilterIntervencao('');
    setFilterSituacao('');
    setCurrentPage(1);
  };

  const hasFilters = searchQuery || filterFase || filterIntervencao || filterSituacao;

  const exportPDF = async () => {
    setExportingPdf(true);
    try {
      const doc = new jsPDF('p', 'mm', 'a4');
      const pw = doc.internal.pageSize.getWidth();

      // ── Cabeçalho ──
      doc.setFillColor(15, 23, 42);
      doc.rect(0, 0, pw, 55, 'F');
      doc.setFillColor(249, 115, 22);
      doc.rect(0, 49, pw, 6, 'F');

      doc.setFontSize(22);
      doc.setTextColor(255, 255, 255);
      doc.setFont('helvetica', 'bold');
      doc.text('Previsão de Obras FDE', 14, 24);

      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(148, 163, 184);
      doc.text('Fundação para o Desenvolvimento da Educação', 14, 33);
      doc.text(`Gerado em: ${new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })} às ${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`, 14, 41);

      // ── KPIs ──
      doc.setTextColor(30, 41, 59);
      doc.setFontSize(13);
      doc.setFont('helvetica', 'bold');
      doc.text('Indicadores Gerais', 14, 68);

      autoTable(doc, {
        startY: 73,
        head: [['Indicador', 'Valor']],
        body: [
          ['Total de Obras / Intervenções', kpis.total.toLocaleString('pt-BR')],
          ['Valor Total Orçado', formatCurrency(kpis.valorTotal)],
          ['Obras Concluídas / Finalizadas', kpis.concluidas.toLocaleString('pt-BR')],
          ['Obras em Andamento', kpis.emAndamento.toLocaleString('pt-BR')],
          ['Obras Filtradas (seleção atual)', filteredObras.length.toLocaleString('pt-BR')],
        ],
        headStyles: { fillColor: [249, 115, 22], textColor: 255, fontStyle: 'bold' },
        alternateRowStyles: { fillColor: [254, 247, 237] },
        styles: { fontSize: 10 },
      });

      // ── Gráficos (captura visual) ──
      if (chartsRef.current) {
        doc.addPage();
        doc.setFillColor(15, 23, 42);
        doc.rect(0, 0, pw, 18, 'F');
        doc.setFontSize(13);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(255, 255, 255);
        doc.text('Análise Gráfica', 14, 12);

        const canvas = await html2canvas(chartsRef.current, {
          scale: 2,
          backgroundColor: '#f8fafc',
          useCORS: true,
          logging: false,
        });
        const imgData = canvas.toDataURL('image/png');
        const imgW = pw - 20;
        const imgH = (canvas.height * imgW) / canvas.width;

        let yPos = 24;
        if (yPos + imgH > doc.internal.pageSize.getHeight() - 10) {
          doc.addPage();
          yPos = 14;
        }
        doc.addImage(imgData, 'PNG', 10, yPos, imgW, imgH);
      }

      // ── Tabela de dados ──
      doc.addPage();
      doc.setFillColor(15, 23, 42);
      doc.rect(0, 0, pw, 18, 'F');
      doc.setFontSize(13);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(255, 255, 255);
      doc.text(`Listagem Detalhada (${filteredObras.length} registros)`, 14, 12);

      autoTable(doc, {
        startY: 24,
        head: [['Cód.', 'Escola', 'Fase', 'Situação', 'Intervenção', 'Valor Orçado']],
        body: filteredObras.map(o => [
          o.codPredio,
          o.escola.length > 45 ? o.escola.slice(0, 42) + '…' : o.escola,
          o.fase || '-',
          o.situacao || '-',
          o.intervencao || '-',
          o.valorOrcamento > 0 ? formatCurrency(o.valorOrcamento) : '-',
        ]),
        headStyles: { fillColor: [249, 115, 22], textColor: 255, fontStyle: 'bold' },
        alternateRowStyles: { fillColor: [254, 247, 237] },
        styles: { fontSize: 7.5 },
        columnStyles: {
          0: { cellWidth: 14 },
          1: { cellWidth: 62 },
          2: { cellWidth: 24 },
          3: { cellWidth: 24 },
          4: { cellWidth: 26 },
          5: { cellWidth: 30, halign: 'right' },
        },
      });

      const pageCount = (doc as any).internal.getNumberOfPages();
      for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFontSize(8);
        doc.setTextColor(148, 163, 184);
        doc.text(`Página ${i} de ${pageCount} • SGE-GSU Intelligence II`, pw / 2, doc.internal.pageSize.getHeight() - 8, { align: 'center' });
      }

      doc.save(`previsao-obras-fde-${new Date().toISOString().slice(0, 10)}.pdf`);
    } catch (err) {
      console.error('Erro ao exportar PDF:', err);
    } finally {
      setExportingPdf(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-96 gap-5">
        <div className="relative w-20 h-20">
          <div className="w-20 h-20 border-4 border-orange-100 rounded-full" />
          <div className="absolute inset-0 w-20 h-20 border-4 border-orange-500 border-t-transparent rounded-full animate-spin" />
          <div className="absolute inset-0 flex items-center justify-center">
            <HardHat size={26} className="text-orange-500" />
          </div>
        </div>
        <div className="text-center">
          <p className="font-black text-slate-700 text-xl">Carregando dados da FDE</p>
          <p className="text-slate-400 text-sm mt-1">Buscando informações da planilha de obras…</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-96 gap-4">
        <div className="w-16 h-16 bg-red-100 rounded-2xl flex items-center justify-center">
          <AlertTriangle size={32} className="text-red-500" />
        </div>
        <div className="text-center max-w-sm">
          <p className="font-black text-slate-800 text-lg">Erro ao carregar dados</p>
          <p className="text-slate-500 text-sm mt-1">{error}</p>
        </div>
        <button onClick={loadData} className="flex items-center gap-2 bg-orange-500 hover:bg-orange-600 text-white px-6 py-3 rounded-xl font-bold transition-colors shadow-lg shadow-orange-500/20">
          <RefreshCw size={18} /> Tentar novamente
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">

      {/* ── Banner principal ── */}
      <div className="rounded-2xl overflow-hidden shadow-xl" style={{ background: 'linear-gradient(135deg, #0f172a 0%, #1c2e47 55%, #431407 100%)' }}>
        <div className="relative px-6 py-7 md:px-8">
          <div className="absolute inset-0 opacity-5" style={{ backgroundImage: 'repeating-linear-gradient(45deg, #f97316 0, #f97316 1px, transparent 0, transparent 50%)', backgroundSize: '20px 20px' }} />
          <div className="relative flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-center gap-5">
              <div className="w-16 h-16 bg-orange-500 rounded-2xl flex items-center justify-center shadow-2xl shadow-orange-500/40 flex-shrink-0">
                <HardHat size={34} className="text-white" />
              </div>
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-[10px] font-black text-orange-400 uppercase tracking-[0.2em] bg-orange-500/10 px-2 py-0.5 rounded-full border border-orange-500/20">FDE</span>
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Infraestrutura</span>
                </div>
                <h1 className="text-2xl md:text-3xl font-black text-white tracking-tight leading-tight">Previsão de Obras FDE</h1>
                <p className="text-slate-400 text-sm mt-1">
                  Fundação para o Desenvolvimento da Educação
                  {lastUpdated && <span className="text-slate-500"> • Atualizado às {lastUpdated.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <button onClick={loadData} className="flex items-center gap-2 bg-white/10 hover:bg-white/20 text-white px-4 py-2.5 rounded-xl transition-all text-sm font-semibold border border-white/10 hover:border-white/20">
                <RefreshCw size={15} /> Atualizar
              </button>
              <button
                onClick={exportPDF}
                disabled={exportingPdf}
                className="flex items-center gap-2 bg-orange-500 hover:bg-orange-400 text-white px-5 py-2.5 rounded-xl text-sm font-black shadow-lg shadow-orange-500/30 transition-all disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {exportingPdf
                  ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Gerando…</>
                  : <><Download size={16} /> Exportar PDF</>
                }
              </button>
            </div>
          </div>
        </div>
        <div className="bg-black/20 px-8 py-3 flex items-center gap-6 border-t border-white/5">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse" />
            <span className="text-xs text-slate-400 font-semibold">{obras.length.toLocaleString('pt-BR')} registros carregados</span>
          </div>
          <div className="h-3 w-px bg-white/10" />
          <span className="text-xs text-slate-500">Fonte: Google Sheets FDE</span>
        </div>
      </div>

      {/* ── KPI Cards ── */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        {[
          { label: 'Total de Obras', value: kpis.total.toLocaleString('pt-BR'), sub: 'registros na planilha', icon: <Layers size={20} className="text-slate-600" />, bg: 'bg-slate-50', border: 'border-slate-200' },
          { label: 'Valor Total Orçado', value: formatCurrency(kpis.valorTotal), sub: 'orçamento acumulado', icon: <DollarSign size={20} className="text-orange-500" />, bg: 'bg-orange-50', border: 'border-orange-200' },
          { label: 'Concluídas', value: kpis.concluidas.toLocaleString('pt-BR'), sub: 'obras finalizadas', icon: <CheckCircle size={20} className="text-emerald-500" />, bg: 'bg-emerald-50', border: 'border-emerald-200' },
          { label: 'Em Andamento', value: kpis.emAndamento.toLocaleString('pt-BR'), sub: 'obras ativas', icon: <Clock size={20} className="text-amber-500" />, bg: 'bg-amber-50', border: 'border-amber-200' },
        ].map((kpi, i) => (
          <div key={i} className={`bg-white rounded-2xl p-5 border ${kpi.border} shadow-sm hover:shadow-md transition-shadow`}>
            <div className="flex items-center justify-between mb-4">
              <p className="text-[11px] font-black text-slate-400 uppercase tracking-widest">{kpi.label}</p>
              <div className={`w-9 h-9 ${kpi.bg} rounded-xl flex items-center justify-center`}>{kpi.icon}</div>
            </div>
            <p className="text-2xl font-black text-slate-900 leading-none">{kpi.value}</p>
            <p className="text-xs text-slate-400 mt-2">{kpi.sub}</p>
          </div>
        ))}
      </div>

      {/* ── Gráficos ── */}
      <div ref={chartsRef} className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Obras por Fase */}
        <div className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm">
          <div className="flex items-center gap-2 mb-1">
            <TrendingUp size={18} className="text-orange-500" />
            <h3 className="font-black text-slate-800">Obras por Fase</h3>
          </div>
          <p className="text-xs text-slate-400 mb-5">Quantidade de intervenções em cada fase</p>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={faseChartData} margin={{ top: 4, right: 8, left: -10, bottom: 55 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
              <XAxis dataKey="fase" tick={{ fontSize: 11, fill: '#64748b' }} angle={-35} textAnchor="end" interval={0} />
              <YAxis tick={{ fontSize: 11, fill: '#64748b' }} />
              <Tooltip
                contentStyle={{ borderRadius: 12, border: '1px solid #e2e8f0', boxShadow: '0 4px 20px rgba(0,0,0,0.08)' }}
                formatter={(v: any) => [v, 'Obras']}
              />
              <Bar dataKey="count" radius={[6, 6, 0, 0]} name="Obras">
                {faseChartData.map((entry, i) => (
                  <Cell key={i} fill={getFaseColor(entry.fase)} />
                ))}
                <LabelList dataKey="count" position="top" style={{ fontSize: 11, fontWeight: 700, fill: '#475569' }} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Tipos de Intervenção */}
        <div className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm">
          <div className="flex items-center gap-2 mb-1">
            <Building2 size={18} className="text-orange-500" />
            <h3 className="font-black text-slate-800">Tipos de Intervenção</h3>
          </div>
          <p className="text-xs text-slate-400 mb-4">Distribuição por modalidade de obra</p>
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie
                data={intervencaoChartData}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                outerRadius={85}
                labelLine={false}
                label={CustomPieLabel}
              >
                {intervencaoChartData.map((_, i) => (
                  <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{ borderRadius: 12, border: '1px solid #e2e8f0', boxShadow: '0 4px 20px rgba(0,0,0,0.08)' }}
                formatter={(v: any) => [v, 'Obras']}
              />
              <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* Por Órgão Executor */}
        <div className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm">
          <div className="flex items-center gap-2 mb-1">
            <HardHat size={18} className="text-orange-500" />
            <h3 className="font-black text-slate-800">Por Órgão Executor</h3>
          </div>
          <p className="text-xs text-slate-400 mb-4">Top 8 órgãos com mais intervenções</p>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={orgaoChartData} layout="vertical" margin={{ top: 0, right: 50, left: 4, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 11, fill: '#64748b' }} />
              <YAxis type="category" dataKey="orgao" tick={{ fontSize: 10, fill: '#64748b' }} width={110} />
              <Tooltip
                contentStyle={{ borderRadius: 12, border: '1px solid #e2e8f0', boxShadow: '0 4px 20px rgba(0,0,0,0.08)' }}
                formatter={(v: any) => [v, 'Obras']}
              />
              <Bar dataKey="count" fill="#f97316" radius={[0, 6, 6, 0]} name="Obras">
                <LabelList dataKey="count" position="right" style={{ fontSize: 11, fontWeight: 700, fill: '#475569' }} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Top Escolas por Valor */}
        <div className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm">
          <div className="flex items-center gap-2 mb-1">
            <DollarSign size={18} className="text-orange-500" />
            <h3 className="font-black text-slate-800">Top Escolas por Valor</h3>
          </div>
          <p className="text-xs text-slate-400 mb-4">8 unidades com maior investimento orçado</p>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={topEscolasChartData} layout="vertical" margin={{ top: 0, right: 80, left: 4, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
              <XAxis
                type="number"
                tick={{ fontSize: 10, fill: '#64748b' }}
                tickFormatter={(v: number) => `R$ ${(v / 1_000_000).toFixed(1)}M`}
              />
              <YAxis type="category" dataKey="escola" tick={{ fontSize: 9.5, fill: '#64748b' }} width={115} />
              <Tooltip
                contentStyle={{ borderRadius: 12, border: '1px solid #e2e8f0', boxShadow: '0 4px 20px rgba(0,0,0,0.08)' }}
                formatter={(v: any) => formatCurrency(Number(v))}
              />
              <Bar dataKey="valor" fill="#f59e0b" radius={[0, 6, 6, 0]} name="Valor">
                <LabelList
                  dataKey="valor"
                  position="right"
                  formatter={(v: any) => `R$ ${(Number(v) / 1000).toFixed(0)}K`}
                  style={{ fontSize: 10, fontWeight: 700, fill: '#475569' }}
                />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* ── Tabela de dados ── */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        {/* Filtros */}
        <div className="p-5 border-b border-slate-100 bg-slate-50/50">
          <div className="flex flex-col md:flex-row gap-3 flex-wrap">
            <div className="relative flex-1 min-w-52">
              <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              <input
                type="text"
                placeholder="Buscar escola, código, PI, descrição…"
                value={searchQuery}
                onChange={e => { setSearchQuery(e.target.value); setCurrentPage(1); }}
                className="w-full pl-10 pr-4 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100 bg-white transition-all"
              />
            </div>
            <select
              value={filterFase}
              onChange={e => { setFilterFase(e.target.value); setCurrentPage(1); }}
              className="text-sm border border-slate-200 rounded-xl px-3 py-2.5 focus:outline-none focus:border-orange-400 bg-white cursor-pointer min-w-40"
            >
              <option value="">Todas as Fases</option>
              {uniqueFases.map(f => <option key={f} value={f}>{f}</option>)}
            </select>
            <select
              value={filterIntervencao}
              onChange={e => { setFilterIntervencao(e.target.value); setCurrentPage(1); }}
              className="text-sm border border-slate-200 rounded-xl px-3 py-2.5 focus:outline-none focus:border-orange-400 bg-white cursor-pointer min-w-40"
            >
              <option value="">Todos os Tipos</option>
              {uniqueIntervencoes.map(i => <option key={i} value={i}>{i}</option>)}
            </select>
            <select
              value={filterSituacao}
              onChange={e => { setFilterSituacao(e.target.value); setCurrentPage(1); }}
              className="text-sm border border-slate-200 rounded-xl px-3 py-2.5 focus:outline-none focus:border-orange-400 bg-white cursor-pointer min-w-40"
            >
              <option value="">Todas as Situações</option>
              {uniqueSituacoes.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            {hasFilters && (
              <button
                onClick={clearFilters}
                className="flex items-center gap-1.5 text-sm text-red-500 hover:text-red-700 px-3 py-2.5 rounded-xl hover:bg-red-50 transition-colors font-semibold"
              >
                <X size={14} /> Limpar filtros
              </button>
            )}
          </div>
          <div className="flex items-center gap-2 mt-3">
            <span className="text-xs font-bold text-slate-500">{filteredObras.length.toLocaleString('pt-BR')}</span>
            <span className="text-xs text-slate-400">de {obras.length.toLocaleString('pt-BR')} registros</span>
            {hasFilters && <span className="text-[10px] bg-orange-100 text-orange-600 font-bold px-2 py-0.5 rounded-full uppercase tracking-wider">filtrado</span>}
          </div>
        </div>

        {/* Tabela */}
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100">
                <th className="text-left px-4 py-3 text-[11px] font-black text-slate-400 uppercase tracking-widest whitespace-nowrap">Cód.</th>
                <th className="text-left px-4 py-3 text-[11px] font-black text-slate-400 uppercase tracking-widest">Escola</th>
                <th className="text-left px-4 py-3 text-[11px] font-black text-slate-400 uppercase tracking-widest whitespace-nowrap">Fase</th>
                <th className="text-left px-4 py-3 text-[11px] font-black text-slate-400 uppercase tracking-widest whitespace-nowrap">Situação</th>
                <th className="text-left px-4 py-3 text-[11px] font-black text-slate-400 uppercase tracking-widest whitespace-nowrap">Intervenção</th>
                <th className="text-left px-4 py-3 text-[11px] font-black text-slate-400 uppercase tracking-widest whitespace-nowrap">PI</th>
                <th className="text-right px-4 py-3 text-[11px] font-black text-slate-400 uppercase tracking-widest whitespace-nowrap">Valor Orçado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {paginatedObras.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-16 text-slate-400">
                    <Search size={32} className="mx-auto mb-3 opacity-30" />
                    <p className="font-semibold">Nenhum registro encontrado</p>
                    <p className="text-sm mt-1">Tente ajustar os filtros de busca</p>
                  </td>
                </tr>
              ) : paginatedObras.map((obra, i) => (
                <tr key={i} className="hover:bg-orange-50/30 transition-colors group">
                  <td className="px-4 py-3.5 font-mono text-xs text-slate-500 font-bold whitespace-nowrap">{obra.codPredio}</td>
                  <td className="px-4 py-3.5 max-w-xs">
                    <p className="font-bold text-slate-800 text-sm leading-snug">{obra.escola}</p>
                    {obra.descricao && (
                      <p className="text-[11px] text-slate-400 mt-0.5 truncate">{obra.descricao}</p>
                    )}
                  </td>
                  <td className="px-4 py-3.5 whitespace-nowrap">
                    {obra.fase ? (
                      <span
                        className="inline-block px-2.5 py-1 rounded-lg text-[11px] font-bold text-white whitespace-nowrap"
                        style={{ backgroundColor: getFaseColor(obra.fase) }}
                      >
                        {obra.fase}
                      </span>
                    ) : <span className="text-slate-300 text-xs">—</span>}
                  </td>
                  <td className="px-4 py-3.5 whitespace-nowrap">
                    {obra.situacao ? (
                      <span className={`inline-block px-2.5 py-1 rounded-lg text-[11px] font-bold whitespace-nowrap ${getSituacaoBadge(obra.situacao)}`}>
                        {obra.situacao}
                      </span>
                    ) : <span className="text-slate-300 text-xs">—</span>}
                  </td>
                  <td className="px-4 py-3.5 text-xs text-slate-600 whitespace-nowrap">{obra.intervencao || <span className="text-slate-300">—</span>}</td>
                  <td className="px-4 py-3.5 text-xs text-slate-500 font-mono whitespace-nowrap">{obra.pi || <span className="text-slate-300">—</span>}</td>
                  <td className="px-4 py-3.5 text-right whitespace-nowrap">
                    {obra.valorOrcamento > 0
                      ? <span className="font-black text-sm text-slate-800">{formatCurrency(obra.valorOrcamento)}</span>
                      : <span className="text-slate-300 text-xs">—</span>
                    }
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Paginação */}
        {totalPages > 1 && (
          <div className="px-5 py-4 border-t border-slate-100 flex items-center justify-between bg-slate-50/50">
            <p className="text-xs text-slate-500 font-semibold">
              Mostrando {((currentPage - 1) * ITEMS_PER_PAGE) + 1}–{Math.min(currentPage * ITEMS_PER_PAGE, filteredObras.length)} de {filteredObras.length.toLocaleString('pt-BR')} registros
            </p>
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setCurrentPage(1)}
                disabled={currentPage === 1}
                className="px-2.5 py-1.5 text-xs font-bold text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              >
                Início
              </button>
              <button
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="p-1.5 rounded-lg border border-slate-200 hover:bg-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronLeft size={15} className="text-slate-600" />
              </button>
              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                let page: number;
                if (totalPages <= 5) page = i + 1;
                else if (currentPage <= 3) page = i + 1;
                else if (currentPage >= totalPages - 2) page = totalPages - 4 + i;
                else page = currentPage - 2 + i;
                return (
                  <button
                    key={page}
                    onClick={() => setCurrentPage(page)}
                    className={`w-8 h-8 rounded-lg text-xs font-bold transition-colors ${currentPage === page ? 'bg-orange-500 text-white shadow-md shadow-orange-500/20' : 'text-slate-500 hover:bg-slate-100'}`}
                  >
                    {page}
                  </button>
                );
              })}
              <button
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="p-1.5 rounded-lg border border-slate-200 hover:bg-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronRight size={15} className="text-slate-600" />
              </button>
              <button
                onClick={() => setCurrentPage(totalPages)}
                disabled={currentPage === totalPages}
                className="px-2.5 py-1.5 text-xs font-bold text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              >
                Fim
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

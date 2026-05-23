import { useState, useEffect, useMemo, useRef } from 'react';
import { supabase } from '../lib/supabase';
import {
  Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend,
  BarChart, Bar, XAxis, YAxis, CartesianGrid
} from 'recharts';
import {
  Search, Loader2, Building2,
  CheckCircle2,
  Hammer, LayoutDashboard, List,
  FileDown, PauseCircle, ShieldAlert, ExternalLink, RefreshCw,
  HardHat, CalendarDays, User, Tag
} from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import html2canvas from 'html2canvas';

const SHEET_CSV_URL =
  'https://docs.google.com/spreadsheets/d/e/2PACX-1vQxDP4rgV07LXZsqVb6iRm9FrZupl9GNZhvTqJOsaZ8wXmyBuDRv9uweJiqxLYp7ybYCuz-xmC_67XC/pub?gid=1689661295&single=true&output=csv';

const SHEET_EDIT_URL =
  'https://docs.google.com/spreadsheets/d/1zBWrvYmRk0RJ4gx3-O2Ja6wDC73I1vwCIV4sCRkex2U/edit?gid=1689661295#gid=1689661295';

interface School {
  id: string;
  name: string;
}

interface SheetWork {
  escola: string;
  obra: string;
  integra?: string;
  pi?: string;
  sei?: string;
  empresa: string;
  fiscal?: string;
  status: string;
  dataInicio?: string;
  matchedSchoolId?: string;
  matchedSchoolName?: string;
}

// --- Utilities ---

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let cur = '';
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (inQ && line[i + 1] === '"') { cur += '"'; i++; }
      else inQ = !inQ;
    } else if (c === ',' && !inQ) {
      result.push(cur.trim());
      cur = '';
    } else {
      cur += c;
    }
  }
  result.push(cur.trim());
  return result;
}

function normalizeForMatch(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\be\.?\s*e\.?\s*/gi, '')
    .replace(/escola\s+estadual\s*/gi, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function matchSchool(sheetName: string, schools: School[]): School | undefined {
  if (!sheetName) return undefined;
  const n = normalizeForMatch(sheetName);
  return (
    schools.find(s => normalizeForMatch(s.name) === n) ||
    schools.find(s => { const sn = normalizeForMatch(s.name); return sn.includes(n) || n.includes(sn); })
  );
}

function normalizeStatus(status: string): 'EM ANDAMENTO' | 'CONCLUÍDO' | 'PARALISADO' {
  const s = (status || '').toUpperCase().trim();
  if (s.includes('CONCLU')) return 'CONCLUÍDO';
  if (s.includes('PARALISA') || s.includes('SUSPENS')) return 'PARALISADO';
  return 'EM ANDAMENTO';
}

function getStatusInfo(status: string) {
  const n = normalizeStatus(status);
  if (n === 'CONCLUÍDO')  return { label: 'Concluída',   dot: 'bg-emerald-400', badge: 'bg-emerald-50 text-emerald-700 border-emerald-200',  bar: 'bg-emerald-400', rawStatus: 'concluido' };
  if (n === 'PARALISADO') return { label: 'Paralisada',  dot: 'bg-slate-400',   badge: 'bg-slate-50 text-slate-600 border-slate-200',         bar: 'bg-slate-300',   rawStatus: 'paralisado' };
  return                         { label: 'Em Andamento', dot: 'bg-orange-400',  badge: 'bg-orange-50 text-orange-700 border-orange-200',      bar: 'bg-orange-400',  rawStatus: 'andamento' };
}

// --- Component ---

export function Obras() {
  const [sheetWorks, setSheetWorks] = useState<SheetWork[]>([]);
  const [allSchools, setAllSchools] = useState<School[]>([]);
  const [loading, setLoading] = useState(true);
  const [exportLoading, setExportLoading] = useState(false);
  const [userRole, setUserRole] = useState('');
  const [userSchoolId, setUserSchoolId] = useState<string | null>(null);
  const [supervisorSchoolIds, setSupervisorSchoolIds] = useState<string[]>([]);
  const [lastUpdated, setLastUpdated] = useState('Carregando...');
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('TODOS');
  const [viewMode, setViewMode] = useState<'cards' | 'table'>('table');
  const chartsRef = useRef<HTMLDivElement>(null);

  useEffect(() => { fetchInitialData(); }, []);

  async function fetchInitialData() {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      let role = '', sId = null, supSchools: string[] = [];
      if (user) {
        const { data: profile } = await (supabase as any)
          .from('profiles').select('role, school_id, supervisor_schools').eq('id', user.id).single();
        role = profile?.role || '';
        sId = profile?.school_id || null;
        supSchools = profile?.supervisor_schools || [];
        setUserRole(role); setUserSchoolId(sId); setSupervisorSchoolIds(supSchools);
      }
      const { data: schoolsData } = await (supabase as any).from('schools').select('id, name').order('name');
      const schools: School[] = schoolsData || [];
      setAllSchools(schools);
      await fetchSheetData(schools, role, sId, supSchools);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  }

  async function fetchSheetData(schools: School[], role: string, sId: string | null, supSchools: string[]) {
    try {
      const res = await fetch(SHEET_CSV_URL, { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();
      const lines = text.replace(/\r/g, '').split('\n');
      if (lines.length < 2) return;

      const rawHeaders = parseCSVLine(lines[0]);
      const headers = rawHeaders.map(h =>
        h.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/"/g, '').trim()
      );

      const idx = {
        escola:     headers.findIndex(h => h.includes('escola')),
        obra:       headers.findIndex(h => h.includes('obra')),
        integra:    headers.findIndex(h => h.includes('integra')),
        pi:         headers.findIndex(h => h === 'pi'),
        sei:        headers.findIndex(h => h.includes('sei')),
        empresa:    headers.findIndex(h => h.includes('empresa')),
        fiscal:     headers.findIndex(h => h.includes('fiscal')),
        status:     headers.findIndex(h => h.includes('status')),
        dataInicio: headers.findIndex(h => h.includes('inicio') || (h.includes('data') && h.includes('in'))),
      };
      if (idx.dataInicio < 0) idx.dataInicio = headers.findIndex(h => h.startsWith('data'));

      const rows: SheetWork[] = [];
      for (let i = 1; i < lines.length; i++) {
        if (!lines[i].trim()) continue;
        const v = parseCSVLine(lines[i]);
        const escola = idx.escola >= 0 ? (v[idx.escola] || '') : '';
        if (!escola) continue;
        const matched = matchSchool(escola, schools);
        rows.push({
          escola,
          obra:       idx.obra >= 0       ? v[idx.obra]       || '' : '',
          integra:    idx.integra >= 0    ? v[idx.integra]    || '' : '',
          pi:         idx.pi >= 0         ? v[idx.pi]         || '' : '',
          sei:        idx.sei >= 0        ? v[idx.sei]        || '' : '',
          empresa:    idx.empresa >= 0    ? v[idx.empresa]    || '' : '',
          fiscal:     idx.fiscal >= 0     ? v[idx.fiscal]     || '' : '',
          status:     idx.status >= 0     ? v[idx.status]     || '' : '',
          dataInicio: idx.dataInicio >= 0 ? v[idx.dataInicio] || '' : '',
          matchedSchoolId:   matched?.id,
          matchedSchoolName: matched?.name || escola,
        });
      }

      let filtered = rows;
      if (role === 'school_manager' && sId)          filtered = rows.filter(r => r.matchedSchoolId === sId);
      else if (role === 'supervisor' && supSchools.length > 0) filtered = rows.filter(r => r.matchedSchoolId && supSchools.includes(r.matchedSchoolId));

      setSheetWorks(filtered);
      const now = new Date();
      setLastUpdated(`${now.toLocaleDateString('pt-BR')} às ${now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`);
    } catch (err) {
      console.error('Erro ao buscar planilha:', err);
      setLastUpdated('Erro ao sincronizar');
    }
  }

  async function handleRefresh() {
    setLoading(true);
    await fetchSheetData(allSchools, userRole, userSchoolId, supervisorSchoolIds);
    setLoading(false);
  }

  const kpiData = useMemo(() => {
    const total      = sheetWorks.length;
    const concluidas = sheetWorks.filter(w => normalizeStatus(w.status) === 'CONCLUÍDO').length;
    const paralisadas= sheetWorks.filter(w => normalizeStatus(w.status) === 'PARALISADO').length;
    const emAndamento= total - concluidas - paralisadas;
    return { total, concluidas, paralisadas, emAndamento };
  }, [sheetWorks]);

  const chartDataStatus = [
    { name: 'Em Andamento', value: kpiData.emAndamento, color: '#f97316' },
    { name: 'Concluídas',   value: kpiData.concluidas,  color: '#10b981' },
    { name: 'Paralisadas',  value: kpiData.paralisadas, color: '#94a3b8' },
  ].filter(d => d.value > 0);

  const schoolBarData = useMemo(() => {
    const counts: Record<string, { name: string; andamento: number; concluido: number; paralisado: number }> = {};
    sheetWorks.forEach(w => {
      const key = w.matchedSchoolName || w.escola;
      const shortName = key.length > 18 ? key.substring(0, 16) + '..' : key;
      if (!counts[key]) counts[key] = { name: shortName, andamento: 0, concluido: 0, paralisado: 0 };
      const n = normalizeStatus(w.status);
      if (n === 'CONCLUÍDO') counts[key].concluido++;
      else if (n === 'PARALISADO') counts[key].paralisado++;
      else counts[key].andamento++;
    });
    return Object.values(counts)
      .sort((a, b) => (b.andamento + b.concluido + b.paralisado) - (a.andamento + a.concluido + a.paralisado))
      .slice(0, 8);
  }, [sheetWorks]);

  const filteredWorks = useMemo(() => {
    return sheetWorks.filter(w => {
      const q = searchTerm.toLowerCase();
      const matchesSearch = !q ||
        w.obra.toLowerCase().includes(q) ||
        w.escola.toLowerCase().includes(q) ||
        (w.matchedSchoolName || '').toLowerCase().includes(q) ||
        w.empresa.toLowerCase().includes(q);
      const normSt = normalizeStatus(w.status);
      const matchesFilter =
        statusFilter === 'TODOS'      ? true :
        statusFilter === 'CONCLUIDO'  ? normSt === 'CONCLUÍDO' :
        statusFilter === 'ANDAMENTO'  ? normSt === 'EM ANDAMENTO' :
        statusFilter === 'PARALISADO' ? normSt === 'PARALISADO' : true;
      return matchesSearch && matchesFilter;
    });
  }, [sheetWorks, searchTerm, statusFilter]);

  async function handleExportPDF() {
    setExportLoading(true);
    try {
      const doc = new jsPDF('landscape', 'mm', 'a4');
      const pageW = doc.internal.pageSize.getWidth();
      doc.setFillColor(234, 88, 12);
      doc.rect(0, 0, pageW, 28, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(18); doc.setFont('helvetica', 'bold');
      doc.text('PAINEL DE OBRAS E REFORMAS', 14, 12);
      doc.setFontSize(8); doc.setFont('helvetica', 'normal');
      doc.text('SGE · GSU-II · Infraestrutura', 14, 19);
      doc.text(`Gerado em: ${new Date().toLocaleDateString('pt-BR')} às ${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`, pageW - 14, 19, { align: 'right' });

      doc.setTextColor(0, 0, 0); doc.setFontSize(7); doc.setFont('helvetica', 'bold');
      doc.text('MÉTRICAS GERAIS', 14, 38);
      const kpis = [
        { label: 'Total',        value: kpiData.total,        r: 71,  g: 85,  b: 105 },
        { label: 'Em Andamento', value: kpiData.emAndamento,  r: 234, g: 88,  b: 12  },
        { label: 'Concluídas',   value: kpiData.concluidas,   r: 16,  g: 185, b: 129 },
        { label: 'Paralisadas',  value: kpiData.paralisadas,  r: 148, g: 163, b: 184 },
      ];
      const boxW = (pageW - 28) / kpis.length - 2;
      kpis.forEach((kpi, i) => {
        const x = 14 + i * (boxW + 2);
        doc.setFillColor(kpi.r, kpi.g, kpi.b);
        doc.roundedRect(x, 41, boxW, 18, 2, 2, 'F');
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(16); doc.setFont('helvetica', 'bold');
        doc.text(String(kpi.value), x + boxW / 2, 53, { align: 'center' });
        doc.setFontSize(5.5); doc.setFont('helvetica', 'normal');
        doc.text(kpi.label.toUpperCase(), x + boxW / 2, 57, { align: 'center' });
      });

      let chartEndY = 63;
      if (chartsRef.current) {
        try {
          const canvas = await html2canvas(chartsRef.current, { scale: 1.5, useCORS: true, backgroundColor: '#ffffff' });
          const imgW = pageW - 28;
          const imgH = Math.min((canvas.height / canvas.width) * imgW, 60);
          doc.addImage(canvas.toDataURL('image/png'), 'PNG', 14, 63, imgW, imgH);
          chartEndY = 63 + imgH + 6;
        } catch { chartEndY = 67; }
      }

      doc.setTextColor(0,0,0); doc.setFontSize(8); doc.setFont('helvetica', 'bold');
      doc.text(`LISTAGEM DE OBRAS (${filteredWorks.length} registros)`, 14, chartEndY);
      autoTable(doc, {
        startY: chartEndY + 4,
        head: [['Obra / Serviço', 'Escola', 'Empresa', 'Fiscal', 'Data Início', 'Status']],
        body: filteredWorks.map(w => [
          w.obra, w.matchedSchoolName || w.escola, w.empresa || '-',
          w.fiscal || '-', w.dataInicio || '-', getStatusInfo(w.status).label,
        ]),
        styles: { fontSize: 7, cellPadding: 2.5 },
        headStyles: { fillColor: [234, 88, 12], textColor: 255, fontStyle: 'bold' },
        alternateRowStyles: { fillColor: [248, 250, 252] },
        columnStyles: { 0: { cellWidth: 58 }, 1: { cellWidth: 48 }, 2: { cellWidth: 36 }, 3: { cellWidth: 24 }, 4: { cellWidth: 22 }, 5: { cellWidth: 'auto' } },
      });
      const totalPages = (doc as any).internal.getNumberOfPages();
      for (let i = 1; i <= totalPages; i++) {
        doc.setPage(i); doc.setFontSize(6.5); doc.setTextColor(148, 163, 184); doc.setFont('helvetica', 'normal');
        doc.text(`Página ${i} de ${totalPages} · SGE-GSU-II`, pageW / 2, doc.internal.pageSize.getHeight() - 6, { align: 'center' });
      }
      doc.save(`relatorio-obras-${new Date().toISOString().split('T')[0]}.pdf`);
    } catch (err) {
      console.error('Erro ao gerar PDF:', err);
      alert('Erro ao gerar o PDF. Tente novamente.');
    } finally { setExportLoading(false); }
  }

  const isAdminOrDirigente = userRole === 'regional_admin' || userRole === 'dirigente';
  const isSchoolManager = userRole === 'school_manager';

  const filterOptions = [
    { key: 'TODOS',      label: 'Todas',         count: sheetWorks.length },
    { key: 'ANDAMENTO',  label: 'Em Andamento',  count: kpiData.emAndamento },
    { key: 'CONCLUIDO',  label: 'Concluídas',    count: kpiData.concluidas  },
    { key: 'PARALISADO', label: 'Paralisadas',   count: kpiData.paralisadas },
  ];

  return (
    <div className="min-h-screen bg-stone-100 font-sans">

      {/* ── HERO HEADER ── */}
      <div className="relative bg-gradient-to-br from-zinc-900 via-zinc-800 to-orange-950 px-6 pt-10 pb-32 overflow-hidden">
        {/* decorative blobs */}
        <div className="absolute -top-20 -right-20 w-96 h-96 bg-orange-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-1/3 w-72 h-72 bg-orange-700/20 rounded-full blur-3xl pointer-events-none" />
        {/* diagonal stripe accent */}
        <div className="absolute bottom-0 left-0 right-0 h-12 overflow-hidden pointer-events-none">
          <div className="absolute inset-0"
            style={{ backgroundImage: 'repeating-linear-gradient(-45deg, transparent, transparent 8px, rgba(249,115,22,0.15) 8px, rgba(249,115,22,0.15) 16px)' }} />
        </div>

        <div className="relative max-w-7xl mx-auto">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-8">
            <div>
              <div className="inline-flex items-center gap-2 bg-orange-500/20 border border-orange-500/30 rounded-full px-4 py-1.5 mb-5">
                <HardHat size={13} className="text-orange-400" />
                <span className="text-orange-300 text-[11px] font-bold uppercase tracking-[0.15em]">SGE · Infraestrutura</span>
              </div>
              <h1 className="text-5xl font-black text-white tracking-tight leading-none">
                Painel de <span className="text-orange-400">Obras</span>
              </h1>
              <p className="text-zinc-400 mt-3 text-sm max-w-md">
                Monitoramento centralizado de obras e intervenções nas unidades escolares da GSU-II
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              {userRole === 'regional_admin' && (
                <a href={SHEET_EDIT_URL} target="_blank" rel="noopener noreferrer"
                  className="group flex items-center gap-2 bg-white/10 hover:bg-white/15 border border-white/15 text-white px-5 py-2.5 rounded-xl font-semibold text-sm transition-all active:scale-95 backdrop-blur-sm">
                  <ExternalLink size={15} className="group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
                  Abrir Planilha
                </a>
              )}
              <button onClick={handleExportPDF} disabled={exportLoading}
                className="flex items-center gap-2 bg-orange-500 hover:bg-orange-400 text-white px-5 py-2.5 rounded-xl font-semibold text-sm shadow-lg shadow-orange-900/50 transition-all active:scale-95 disabled:opacity-60">
                {exportLoading ? <Loader2 size={15} className="animate-spin" /> : <FileDown size={15} />}
                Exportar PDF
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 -mt-20 pb-32 space-y-5">

        {/* ── KPI CARDS ── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <KPICard label="Total de Obras"  value={kpiData.total}        sub="intervenções registradas" gradient="from-zinc-700 to-zinc-900"     icon={Building2}    />
          <KPICard label="Em Andamento"    value={kpiData.emAndamento}  sub="obras em execução"        gradient="from-orange-500 to-orange-700" icon={Hammer}       glow="shadow-orange-300" />
          <KPICard label="Concluídas"      value={kpiData.concluidas}   sub="obras finalizadas"        gradient="from-emerald-500 to-teal-700"  icon={CheckCircle2} glow="shadow-emerald-300" />
          <KPICard label="Paralisadas"     value={kpiData.paralisadas}  sub="aguardando retomada"      gradient="from-slate-400 to-slate-600"   icon={PauseCircle}  />
        </div>

        {/* ── SCHOOL MANAGER NOTICE ── */}
        {isSchoolManager && (
          <div className="flex items-center gap-3 bg-blue-600 text-white rounded-2xl px-5 py-4 shadow-lg shadow-blue-200">
            <ShieldAlert size={18} className="shrink-0" />
            <p className="text-sm font-medium">
              Visualização restrita — exibindo apenas obras vinculadas à sua unidade escolar.
            </p>
          </div>
        )}

        {/* ── CHARTS ── */}
        <div ref={chartsRef} className="grid grid-cols-1 lg:grid-cols-5 gap-4">
          <div className="bg-white rounded-2xl shadow-sm border border-stone-200 p-6 lg:col-span-2">
            <div className="flex items-center gap-2 mb-1">
              <div className="w-1 h-4 bg-orange-500 rounded-full" />
              <h3 className="font-bold text-zinc-800 text-sm">Distribuição por Status</h3>
            </div>
            <p className="text-xs text-zinc-400 mb-4 ml-3">Visão proporcional do portfólio</p>
            <div style={{ height: 220 }}>
              {chartDataStatus.length > 0 ? (
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie data={chartDataStatus} cx="50%" cy="44%" innerRadius={58} outerRadius={82} paddingAngle={3} dataKey="value">
                      {chartDataStatus.map((entry, i) => <Cell key={i} fill={entry.color} stroke="transparent" />)}
                    </Pie>
                    <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 8px 24px rgba(0,0,0,0.12)', fontSize: 12 }} formatter={(v: any, n: any) => [v, n]} />
                    <Legend verticalAlign="bottom" height={36} iconType="circle" iconSize={8} />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-zinc-200 text-xs font-bold uppercase tracking-widest text-center border-2 border-dashed border-zinc-100 rounded-xl">
                  Sem dados
                </div>
              )}
            </div>
          </div>

          <div className="bg-white rounded-2xl shadow-sm border border-stone-200 p-6 lg:col-span-3">
            <div className="flex items-center gap-2 mb-1">
              <div className="w-1 h-4 bg-orange-500 rounded-full" />
              <h3 className="font-bold text-zinc-800 text-sm">Obras por Unidade Escolar</h3>
            </div>
            <p className="text-xs text-zinc-400 mb-4 ml-3">Concentração de intervenções</p>
            <div style={{ height: 220 }}>
              {schoolBarData.length > 0 ? (
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={schoolBarData} margin={{ top: 0, right: 8, left: -24, bottom: 42 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                    <XAxis dataKey="name" tick={{ fontSize: 9, fill: '#94a3b8' }} angle={-32} textAnchor="end" interval={0} />
                    <YAxis tick={{ fontSize: 9, fill: '#94a3b8' }} allowDecimals={false} />
                    <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 8px 24px rgba(0,0,0,0.12)', fontSize: 12 }} />
                    <Bar dataKey="andamento" name="Em Andamento" stackId="a" fill="#f97316" />
                    <Bar dataKey="concluido"  name="Concluída"    stackId="a" fill="#10b981" />
                    <Bar dataKey="paralisado" name="Paralisada"   stackId="a" fill="#94a3b8" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-zinc-200 text-xs font-bold uppercase tracking-widest text-center border-2 border-dashed border-zinc-100 rounded-xl">
                  Sem dados
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── LIST PANEL ── */}
        <div className="bg-white rounded-2xl shadow-sm border border-stone-200 overflow-hidden">

          {/* Toolbar */}
          <div className="px-6 pt-5 pb-4 border-b border-stone-100">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h3 className="font-bold text-zinc-900">Registro de Obras</h3>
                <div className="flex items-center gap-2 mt-0.5">
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  <span className="text-xs text-zinc-400">
                    Fonte: Google Sheets · {lastUpdated}
                    {isAdminOrDirigente && (
                      <a href={SHEET_EDIT_URL} target="_blank" rel="noopener noreferrer"
                        className="ml-2 text-orange-500 hover:text-orange-700 font-bold transition-colors">
                        editar ↗
                      </a>
                    )}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" size={14} />
                  <input
                    type="text"
                    placeholder="Buscar obra ou escola..."
                    className="pl-9 pr-4 py-2 bg-stone-50 border border-stone-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-400 focus:border-transparent w-full sm:w-52 transition-all"
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                  />
                </div>
                <button onClick={handleRefresh} disabled={loading} title="Atualizar da planilha"
                  className="p-2 hover:bg-stone-100 text-zinc-400 hover:text-zinc-700 rounded-xl transition-colors disabled:opacity-40">
                  <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
                </button>
                <div className="flex bg-stone-100 rounded-xl p-1">
                  <button onClick={() => setViewMode('table')}
                    className={`p-1.5 rounded-lg transition-all ${viewMode === 'table' ? 'bg-white shadow-sm text-zinc-800' : 'text-zinc-400'}`}>
                    <List size={15} />
                  </button>
                  <button onClick={() => setViewMode('cards')}
                    className={`p-1.5 rounded-lg transition-all ${viewMode === 'cards' ? 'bg-white shadow-sm text-zinc-800' : 'text-zinc-400'}`}>
                    <LayoutDashboard size={15} />
                  </button>
                </div>
              </div>
            </div>

            {/* Status filter pills */}
            <div className="flex gap-2 mt-4 flex-wrap">
              {filterOptions.map(({ key, label, count }) => {
                const active = statusFilter === key;
                const pill =
                  key === 'ANDAMENTO'  ? (active ? 'bg-orange-500 text-white border-orange-500'  : 'bg-orange-50 text-orange-700 border-orange-200 hover:border-orange-300') :
                  key === 'CONCLUIDO'  ? (active ? 'bg-emerald-500 text-white border-emerald-500' : 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:border-emerald-300') :
                  key === 'PARALISADO' ? (active ? 'bg-slate-500 text-white border-slate-500'     : 'bg-slate-50 text-slate-600 border-slate-200 hover:border-slate-300') :
                                         (active ? 'bg-zinc-800 text-white border-zinc-800'       : 'bg-stone-50 text-zinc-600 border-stone-200 hover:border-stone-300');
                return (
                  <button key={key} onClick={() => setStatusFilter(key)}
                    className={`flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-semibold border transition-all ${pill}`}>
                    {label}
                    <span className={`font-black tabular-nums ${active ? 'opacity-90' : 'opacity-60'}`}>{count}</span>
                  </button>
                );
              })}
              <span className="ml-auto text-xs text-zinc-400 self-center">{filteredWorks.length} resultado(s)</span>
            </div>
          </div>

          {/* Content */}
          {loading ? (
            <div className="flex flex-col items-center justify-center py-24 gap-3">
              <div className="relative">
                <Loader2 className="animate-spin text-orange-500" size={32} />
                <div className="absolute inset-0 rounded-full bg-orange-100 animate-ping opacity-30" />
              </div>
              <span className="text-xs font-bold text-zinc-400 uppercase tracking-widest">Carregando da planilha...</span>
            </div>
          ) : filteredWorks.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 gap-4">
              <div className="w-16 h-16 bg-stone-100 rounded-2xl flex items-center justify-center">
                <Building2 className="text-stone-300" size={28} />
              </div>
              <p className="text-zinc-400 text-sm font-medium">Nenhuma obra encontrada com os filtros atuais.</p>
              {statusFilter !== 'TODOS' && (
                <button onClick={() => setStatusFilter('TODOS')}
                  className="text-xs text-orange-500 font-bold hover:underline">
                  Limpar filtro
                </button>
              )}
            </div>
          ) : viewMode === 'table' ? (

            /* ── TABLE VIEW ── */
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="bg-stone-50 text-zinc-400 text-[10px] uppercase tracking-widest font-bold">
                    <th className="pl-6 pr-4 py-3.5 border-b border-stone-100 w-2" />
                    <th className="px-4 py-3.5 border-b border-stone-100">Obra / Escola</th>
                    <th className="px-4 py-3.5 border-b border-stone-100">Empresa</th>
                    <th className="px-4 py-3.5 border-b border-stone-100">Fiscal</th>
                    <th className="px-4 py-3.5 border-b border-stone-100">Início</th>
                    <th className="px-4 py-3.5 border-b border-stone-100">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredWorks.map((work, i) => {
                    const si = getStatusInfo(work.status);
                    return (
                      <tr key={i} className="group hover:bg-orange-50/30 transition-colors border-b border-stone-50 last:border-0">
                        {/* status bar */}
                        <td className="pl-6 pr-2 py-4">
                          <div className={`w-1 h-10 rounded-full ${si.bar}`} />
                        </td>
                        <td className="px-4 py-4 max-w-xs">
                          <p className="font-bold text-zinc-800 text-sm leading-snug">{work.obra}</p>
                          <p className="text-xs text-zinc-400 flex items-center gap-1 mt-1">
                            <Building2 size={10} className="shrink-0" />
                            <span className="truncate">{work.matchedSchoolName || work.escola}</span>
                          </p>
                          {(work.sei || work.integra || work.pi) && (
                            <div className="flex flex-wrap gap-1 mt-1.5">
                              {work.sei     && <span className="inline-flex items-center gap-1 text-[9px] bg-zinc-100 text-zinc-500 px-1.5 py-0.5 rounded font-mono"><Tag size={7} />SEI: {work.sei}</span>}
                              {work.integra && <span className="inline-flex items-center gap-1 text-[9px] bg-zinc-100 text-zinc-500 px-1.5 py-0.5 rounded font-mono"><Tag size={7} />INT: {work.integra}</span>}
                              {work.pi      && <span className="inline-flex items-center gap-1 text-[9px] bg-zinc-100 text-zinc-500 px-1.5 py-0.5 rounded font-mono"><Tag size={7} />PI: {work.pi}</span>}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-4">
                          <span className="text-sm text-zinc-600 font-medium">{work.empresa || '—'}</span>
                        </td>
                        <td className="px-4 py-4">
                          {work.fiscal ? (
                            <div className="flex items-center gap-1.5">
                              <div className="w-6 h-6 rounded-full bg-orange-100 flex items-center justify-center shrink-0">
                                <User size={11} className="text-orange-600" />
                              </div>
                              <span className="text-xs font-semibold text-zinc-700">{work.fiscal}</span>
                            </div>
                          ) : <span className="text-zinc-300">—</span>}
                        </td>
                        <td className="px-4 py-4">
                          {work.dataInicio ? (
                            <div className="flex items-center gap-1.5 text-xs text-zinc-500">
                              <CalendarDays size={12} className="text-zinc-400" />
                              {work.dataInicio}
                            </div>
                          ) : <span className="text-zinc-300">—</span>}
                        </td>
                        <td className="px-4 py-4 pr-6">
                          <div className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-bold border ${si.badge}`}>
                            <div className={`w-1.5 h-1.5 rounded-full ${si.dot} ${si.rawStatus === 'andamento' ? 'animate-pulse' : ''}`} />
                            {si.label}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

          ) : (

            /* ── CARDS VIEW ── */
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 p-5">
              {filteredWorks.map((work, i) => {
                const si = getStatusInfo(work.status);
                const topColor =
                  si.rawStatus === 'concluido'  ? 'bg-emerald-500' :
                  si.rawStatus === 'paralisado' ? 'bg-slate-300' :
                  'bg-gradient-to-r from-orange-500 to-amber-400';
                return (
                  <div key={i} className="group bg-white border border-stone-200 rounded-2xl overflow-hidden hover:shadow-lg hover:shadow-orange-100/60 hover:-translate-y-0.5 transition-all duration-200">
                    {/* top strip */}
                    <div className={`h-1.5 w-full ${topColor}`} />
                    <div className="p-5">
                      {/* header row */}
                      <div className="flex items-start justify-between gap-3 mb-4">
                        <div className="flex-1 min-w-0">
                          <h4 className="font-bold text-zinc-800 text-sm leading-snug line-clamp-2">{work.obra}</h4>
                          <p className="text-xs text-zinc-400 flex items-center gap-1 mt-1.5">
                            <Building2 size={10} className="shrink-0" />
                            <span className="truncate">{work.matchedSchoolName || work.escola}</span>
                          </p>
                        </div>
                        <div className={`shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold border ${si.badge}`}>
                          <div className={`w-1.5 h-1.5 rounded-full ${si.dot} ${si.rawStatus === 'andamento' ? 'animate-pulse' : ''}`} />
                          {si.label}
                        </div>
                      </div>

                      {/* metadata grid */}
                      <div className="grid grid-cols-2 gap-x-4 gap-y-2.5 pt-3.5 border-t border-stone-100">
                        <div>
                          <p className="text-[9px] font-bold text-zinc-400 uppercase tracking-wider mb-1">Empresa</p>
                          <p className="text-xs font-semibold text-zinc-700 truncate">{work.empresa || '—'}</p>
                        </div>
                        <div>
                          <p className="text-[9px] font-bold text-zinc-400 uppercase tracking-wider mb-1">Fiscal</p>
                          <p className="text-xs font-semibold text-zinc-700 truncate">{work.fiscal || '—'}</p>
                        </div>
                        {work.dataInicio && (
                          <div>
                            <p className="text-[9px] font-bold text-zinc-400 uppercase tracking-wider mb-1">Início</p>
                            <p className="text-xs font-semibold text-zinc-600 flex items-center gap-1">
                              <CalendarDays size={10} className="text-zinc-400" /> {work.dataInicio}
                            </p>
                          </div>
                        )}
                        {(work.sei || work.integra || work.pi) && (
                          <div className="col-span-2 flex flex-wrap gap-1 pt-1">
                            {work.sei     && <span className="text-[9px] bg-zinc-100 text-zinc-500 px-1.5 py-0.5 rounded font-mono">SEI: {work.sei}</span>}
                            {work.integra && <span className="text-[9px] bg-zinc-100 text-zinc-500 px-1.5 py-0.5 rounded font-mono">INT: {work.integra}</span>}
                            {work.pi      && <span className="text-[9px] bg-zinc-100 text-zinc-500 px-1.5 py-0.5 rounded font-mono">PI: {work.pi}</span>}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── KPI CARD ──
function KPICard({ label, value, sub, gradient, icon: Icon, glow = '' }: {
  label: string; value: number; sub: string;
  gradient: string; icon: any; glow?: string;
}) {
  return (
    <div className={`relative bg-gradient-to-br ${gradient} rounded-2xl p-5 text-white shadow-lg ${glow} overflow-hidden`}>
      <div className="absolute -top-6 -right-6 w-24 h-24 bg-white/5 rounded-full pointer-events-none" />
      <div className="absolute -bottom-4 -left-4 w-16 h-16 bg-black/10 rounded-full pointer-events-none" />
      <div className="relative">
        <div className="w-9 h-9 bg-white/15 rounded-xl flex items-center justify-center mb-4">
          <Icon size={17} />
        </div>
        <div className="text-4xl font-black tracking-tight tabular-nums">{value}</div>
        <div className="text-[11px] font-bold uppercase tracking-wider opacity-80 mt-1">{label}</div>
        <div className="text-[10px] opacity-50 mt-0.5">{sub}</div>
      </div>
    </div>
  );
}

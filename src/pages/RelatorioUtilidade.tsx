import { useEffect, useState, useRef, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import {
  ComposedChart, BarChart, Bar, Area, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import {
  Download, SlidersHorizontal, Droplets, Zap, TrendingDown, TrendingUp,
  Calendar, Activity, DollarSign, Database, Users, X,
  ChevronDown, ChevronUp, Search, RotateCcw, Building2,
} from 'lucide-react';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import { addTimbradoAllPages } from '../lib/pdfTimbrado';

const extractCIE = (val: any) => {
  if (val === null || val === undefined) return '';
  const numStr = String(val).split('.')[0].replace(/\D/g, '');
  const num = parseInt(numStr, 10);
  return isNaN(num) ? '' : num.toString();
};

const fetchAll = async (table: string) => {
  let allData: any[] = [];
  let from = 0;
  const step = 999;
  let hasMore = true;
  while (hasMore) {
    const { data, error } = await supabase.from(table).select('*').range(from, from + step);
    if (error) { console.error(`Erro ao buscar ${table}:`, error); break; }
    if (data && data.length > 0) {
      allData = [...allData, ...data];
      from += step + 1;
      if (data.length <= step) hasMore = false;
    } else { hasMore = false; }
  }
  return allData;
};

type Utilidade = 'ambas' | 'agua' | 'energia';
type Preset = 'ano' | 'sem1' | 'sem2' | '6m' | '3m';

export default function DashboardConsumo() {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtroEscola, setFiltroEscola] = useState('todas');
  const [busca, setBusca] = useState('');
  const [filtroUtilidade, setFiltroUtilidade] = useState<Utilidade>('ambas');
  const [mostrarAvancado, setMostrarAvancado] = useState(false);
  const anoAtual = new Date().getFullYear();
  const [dataInicio, setDataInicio] = useState(`${anoAtual}-01`);
  const [dataFim, setDataFim] = useState(`${anoAtual}-12`);
  const [ultimaAtualizacao, setUltimaAtualizacao] = useState<string>('...');
  const [gerandoPDF, setGerandoPDF] = useState(false);
  const dashboardRef = useRef<HTMLDivElement>(null);

  useEffect(() => { fetchData(); }, []);

  async function fetchData() {
    setLoading(true);
    try {
      const [resConta, resFiscal, escolasDB, indiceDB] = await Promise.all([
        fetchAll('consumo_agua_luz'),
        fetchAll('consumo_agua'),
        fetchAll('schools'),
        fetchAll('indice_escolas'),
      ]);

      if (resConta && resConta.length > 0) {
        resConta.sort((a, b) => {
          if (!a.mes_ano || !b.mes_ano) return 0;
          const [mA, yA] = a.mes_ano.split('/').map(Number);
          const [mB, yB] = b.mes_ano.split('/').map(Number);
          return new Date(yA, mA - 1).getTime() - new Date(yB, mB - 1).getTime();
        });

        const tradutorNomesParaCIE = new Map();
        if (indiceDB) {
          indiceDB.forEach(idx => {
            const cie = extractCIE(idx.cie || idx.CIE);
            if (cie) {
              [idx.nome_escola_novo || idx['NOME ESCOLA NOVO'], idx.nome_escola_antigo || idx['NOME ESCOLA ANTIGO'], idx.nome_no_banco_de_dados || idx['NOME NO BANCO DE DADOS']]
                .forEach(n => { if (n) tradutorNomesParaCIE.set(n.trim().toUpperCase(), cie); });
            }
          });
        }

        const mapaIdFiscalParaCIE = new Map();
        if (escolasDB) {
          escolasDB.forEach(esc => {
            const cie = extractCIE(esc.cie_code || esc.fde_code);
            if (cie) mapaIdFiscalParaCIE.set(esc.id, cie);
          });
        }

        const fiscalAgrupado = new Map();
        if (resFiscal) {
          resFiscal.forEach(f => {
            const cie = mapaIdFiscalParaCIE.get(f.school_id);
            if (!cie || !f.date) return;
            let mesAno = '';
            const dateStr = String(f.date).split('T')[0];
            if (dateStr.includes('-')) {
              const partes = dateStr.split('-');
              if (partes.length >= 2) mesAno = `${partes[1]}/${partes[0]}`;
            } else if (dateStr.includes('/')) {
              const partes = dateStr.split('/');
              if (partes.length === 3) mesAno = `${partes[1]}/${partes[2]}`;
            }
            if (!mesAno) return;
            const key = `${cie}-${mesAno}`;
            const consumoNoDia = Number(f.consumption_diff) || 0;
            const totalPessoasNoDia = (Number(f.student_count) || 0) + (Number(f.staff_count) || 0);
            if (fiscalAgrupado.has(key)) {
              const prev = fiscalAgrupado.get(key);
              fiscalAgrupado.set(key, { totalConsumo: prev.totalConsumo + consumoNoDia, somaPessoas: prev.somaPessoas + totalPessoasNoDia, registros: prev.registros + 1 });
            } else {
              fiscalAgrupado.set(key, { totalConsumo: consumoNoDia, somaPessoas: totalPessoasNoDia, registros: 1 });
            }
          });
        }

        const dadosMesclados = resConta.map(conta => {
          let cieAlvo = extractCIE(conta.codigo_predio);
          if (!cieAlvo) cieAlvo = tradutorNomesParaCIE.get(conta.nome_escola?.trim().toUpperCase()) || '';
          const mesAnoLimpo = conta.mes_ano?.trim();
          const keyBusca = `${cieAlvo}-${mesAnoLimpo}`;
          const auditoria = fiscalAgrupado.get(keyBusca);
          return {
            ...conta,
            agua_fiscal_m3: auditoria ? auditoria.totalConsumo : null,
            media_pessoas_fiscal: auditoria && auditoria.registros > 0 ? Math.round(auditoria.somaPessoas / auditoria.registros) : null,
          };
        });

        setData(dadosMesclados);
        const maisRecente = [...resConta].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0];
        if (maisRecente) setUltimaAtualizacao(new Date(maisRecente.created_at).toLocaleDateString('pt-BR'));
      }
    } catch (error) {
      console.error('Falha ao recuperar dados:', error);
    } finally {
      setLoading(false);
    }
  }

  const aplicarPreset = (preset: Preset) => {
    const ano = new Date().getFullYear();
    const agora = new Date();
    const mes = agora.getMonth() + 1;
    const mesStr = String(mes).padStart(2, '0');
    const meses6Atras = new Date(agora); meses6Atras.setMonth(meses6Atras.getMonth() - 6);
    const meses3Atras = new Date(agora); meses3Atras.setMonth(meses3Atras.getMonth() - 3);
    const map: Record<Preset, { inicio: string; fim: string }> = {
      ano: { inicio: `${ano}-01`, fim: `${ano}-12` },
      sem1: { inicio: `${ano}-01`, fim: `${ano}-06` },
      sem2: { inicio: `${ano}-07`, fim: `${ano}-12` },
      '6m': { inicio: `${meses6Atras.getFullYear()}-${String(meses6Atras.getMonth() + 1).padStart(2, '0')}`, fim: `${ano}-${mesStr}` },
      '3m': { inicio: `${meses3Atras.getFullYear()}-${String(meses3Atras.getMonth() + 1).padStart(2, '0')}`, fim: `${ano}-${mesStr}` },
    };
    setDataInicio(map[preset].inicio);
    setDataFim(map[preset].fim);
  };

  const resetarFiltros = () => {
    setFiltroEscola('todas');
    setBusca('');
    setDataInicio(`${anoAtual}-01`);
    setDataFim(`${anoAtual}-12`);
    setFiltroUtilidade('ambas');
  };

  const parseDate = (str: string) => {
    const [m, y] = str.trim().split('/').map(Number);
    return new Date(y, m - 1);
  };

  const escolasFiltradas = useMemo(() => {
    const todas = ([...new Set(data.map(d => d.nome_escola))] as string[]).sort();
    if (!busca) return todas;
    return todas.filter(e => e?.toLowerCase().includes(busca.toLowerCase()));
  }, [data, busca]);

  const dadosFiltrados = useMemo(() => {
    return data.filter(d => {
      const matchEscola = filtroEscola === 'todas' || d.nome_escola === filtroEscola;
      if (!d.mes_ano || !d.mes_ano.includes('/')) return false;
      const dDate = parseDate(d.mes_ano);
      const start = new Date(dataInicio + '-01');
      const end = new Date(dataFim + '-01');
      return matchEscola && dDate >= start && dDate <= end;
    });
  }, [data, filtroEscola, dataInicio, dataFim]);

  const metricas = useMemo(() => {
    const atualFinanceiro = dadosFiltrados.reduce((acc, c) => acc + (Number(c.agua_valor) || 0) + (Number(c.energia_valor) || 0), 0);
    const atualAguaM3 = dadosFiltrados.reduce((acc, c) => acc + (Number(c.agua_qtde_m3) || 0), 0);
    const atualEnergiaKwh = dadosFiltrados.reduce((acc, c) => acc + (Number(c.energia_qtde_kwh) || 0), 0);
    const regComPessoas = dadosFiltrados.filter(d => d.media_pessoas_fiscal > 0);
    const mediaPessoas = regComPessoas.length > 0
      ? Math.round(regComPessoas.reduce((acc, c) => acc + c.media_pessoas_fiscal, 0) / regComPessoas.length) : 0;
    const meses = [...new Set(dadosFiltrados.map(d => d.mes_ano))].sort((a, b) => {
      const [mA, yA] = a.split('/').map(Number);
      const [mB, yB] = b.split('/').map(Number);
      return new Date(yA, mA - 1).getTime() - new Date(yB, mB - 1).getTime();
    });
    let diffFin = 0, diffAgua = 0, diffLuz = 0;
    if (meses.length > 1) {
      const prim = dadosFiltrados.filter(d => d.mes_ano === meses[0]);
      const ult = dadosFiltrados.filter(d => d.mes_ano === meses[meses.length - 1]);
      const vPrimFin = prim.reduce((a, c) => a + (Number(c.agua_valor) || 0) + (Number(c.energia_valor) || 0), 0);
      const vUltFin = ult.reduce((a, c) => a + (Number(c.agua_valor) || 0) + (Number(c.energia_valor) || 0), 0);
      const vPrimAgua = prim.reduce((a, c) => a + (Number(c.agua_qtde_m3) || 0), 0);
      const vUltAgua = ult.reduce((a, c) => a + (Number(c.agua_qtde_m3) || 0), 0);
      const vPrimLuz = prim.reduce((a, c) => a + (Number(c.energia_qtde_kwh) || 0), 0);
      const vUltLuz = ult.reduce((a, c) => a + (Number(c.energia_qtde_kwh) || 0), 0);
      if (vPrimFin > 0) diffFin = ((vUltFin - vPrimFin) / vPrimFin) * 100;
      if (vPrimAgua > 0) diffAgua = ((vUltAgua - vPrimAgua) / vPrimAgua) * 100;
      if (vPrimLuz > 0) diffLuz = ((vUltLuz - vPrimLuz) / vPrimLuz) * 100;
    }
    return {
      atualFinanceiro, diffFin, economizou: diffFin <= 0,
      atualAguaM3, diffAgua, economizouAgua: diffAgua <= 0,
      atualEnergiaKwh, diffLuz, economizouLuz: diffLuz <= 0,
      mediaPessoas, primMes: meses[0], ultMes: meses[meses.length - 1],
    };
  }, [dadosFiltrados]);

  // Quando "Rede Estadual (Geral)", agrega todos os valores por mês para os gráficos.
  // Quando escola individual, usa os dados filtrados diretamente (já são um registro por mês).
  const dadosParaGrafico = useMemo(() => {
    if (filtroEscola !== 'todas') return dadosFiltrados;

    const agrupado = new Map<string, any>();
    dadosFiltrados.forEach(d => {
      const mes = d.mes_ano;
      if (!mes) return;
      if (!agrupado.has(mes)) {
        agrupado.set(mes, { mes_ano: mes, agua_qtde_m3: 0, energia_qtde_kwh: 0, agua_valor: 0, energia_valor: 0, agua_fiscal_m3: 0, _temFiscal: false });
      }
      const e = agrupado.get(mes);
      e.agua_qtde_m3 += Number(d.agua_qtde_m3) || 0;
      e.energia_qtde_kwh += Number(d.energia_qtde_kwh) || 0;
      e.agua_valor += Number(d.agua_valor) || 0;
      e.energia_valor += Number(d.energia_valor) || 0;
      if (d.agua_fiscal_m3 !== null && d.agua_fiscal_m3 !== undefined) {
        e.agua_fiscal_m3 += Number(d.agua_fiscal_m3) || 0;
        e._temFiscal = true;
      }
    });

    return [...agrupado.values()]
      .sort((a, b) => {
        const [mA, yA] = a.mes_ano.split('/').map(Number);
        const [mB, yB] = b.mes_ano.split('/').map(Number);
        return new Date(yA, mA - 1).getTime() - new Date(yB, mB - 1).getTime();
      })
      .map(e => ({ ...e, agua_fiscal_m3: e._temFiscal ? e.agua_fiscal_m3 : null }));
  }, [dadosFiltrados, filtroEscola]);

  const filtrosAtivos = useMemo(() => {
    const ativos: { label: string; key: string }[] = [];
    if (filtroEscola !== 'todas') ativos.push({ label: filtroEscola, key: 'escola' });
    if (filtroUtilidade !== 'ambas') ativos.push({ label: filtroUtilidade === 'agua' ? 'Apenas Água' : 'Apenas Energia', key: 'utilidade' });
    if (dataInicio !== `${anoAtual}-01` || dataFim !== `${anoAtual}-12`)
      ativos.push({ label: `${dataInicio} → ${dataFim}`, key: 'data' });
    return ativos;
  }, [filtroEscola, filtroUtilidade, dataInicio, dataFim, anoAtual]);

  const exportarPDF = async () => {
    if (!dashboardRef.current) return;
    setGerandoPDF(true);
    try {
      const canvas = await html2canvas(dashboardRef.current, { scale: 2 });
      const pdf = new jsPDF('p', 'mm', 'a4');
      const marginX = 14;
      pdf.setFont('helvetica', 'bold'); pdf.setFontSize(12); pdf.setTextColor(15, 23, 42);
      pdf.text('Relatório de Consumo e Auditoria Física', marginX, 36);
      pdf.setFont('helvetica', 'normal'); pdf.setFontSize(10); pdf.setTextColor(71, 85, 105);
      const nomeEscolaPDF = filtroEscola === 'todas' ? 'Rede Estadual (Visão Geral)' : filtroEscola;
      pdf.text(`Unidade Escolar: ${nomeEscolaPDF}`, marginX, 42);
      pdf.setFontSize(9); pdf.setTextColor(100, 116, 139);
      pdf.text(`Data de emissão: ${new Date().toLocaleString('pt-BR')}`, marginX, 47);
      pdf.setDrawColor(226, 232, 240); pdf.setLineWidth(0.5);
      pdf.line(marginX, 51, pdf.internal.pageSize.getWidth() - marginX, 51);
      const imgData = canvas.toDataURL('image/png');
      const imgWidth = pdf.internal.pageSize.getWidth() - marginX * 2;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;
      pdf.addImage(imgData, 'PNG', marginX, 55, imgWidth, imgHeight);
      addTimbradoAllPages(pdf);
      pdf.save(`Relatorio_${nomeEscolaPDF.replace(/[^a-zA-Z0-9]/g, '_')}.pdf`);
    } finally {
      setGerandoPDF(false);
    }
  };

  const mostraAgua = filtroUtilidade === 'ambas' || filtroUtilidade === 'agua';
  const mostraEnergia = filtroUtilidade === 'ambas' || filtroUtilidade === 'energia';

  if (loading) return (
    <div className="min-h-screen bg-slate-50">
      <div className="bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 px-8 py-10">
        <div className="h-3 w-36 bg-white/10 rounded-full mb-5 animate-pulse" />
        <div className="h-9 w-80 bg-white/10 rounded-xl mb-3 animate-pulse" />
        <div className="h-3 w-64 bg-white/10 rounded-full animate-pulse" />
      </div>
      <div className="px-8 py-8 space-y-8">
        <div className="grid grid-cols-3 gap-6">
          {[1, 2, 3].map(i => <div key={i} className="h-44 bg-white rounded-3xl animate-pulse border border-slate-100" />)}
        </div>
        <div className="grid grid-cols-2 gap-8">
          {[1, 2].map(i => <div key={i} className="h-80 bg-white rounded-3xl animate-pulse border border-slate-100" />)}
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50">

      {/* ── HERO HEADER ── */}
      <div className="relative bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 px-8 py-10 overflow-hidden">
        <div className="absolute -top-24 -right-24 w-96 h-96 bg-blue-600 rounded-full blur-[140px] opacity-20 pointer-events-none" />
        <div className="absolute bottom-0 left-1/4 w-72 h-72 bg-indigo-600 rounded-full blur-[120px] opacity-10 pointer-events-none" />

        <div className="relative">
          <div className="flex items-center gap-2 text-blue-400 text-[11px] font-bold uppercase tracking-widest mb-4">
            <Activity size={13} />
            Gestão de Utilidades
          </div>
          <h1 className="text-4xl font-black text-white leading-tight mb-2">
            Painel de Consumo e Auditoria
          </h1>
          <p className="text-slate-400 text-sm max-w-lg">
            Monitoramento integrado de água e energia com cruzamento dos apontamentos fiscais
          </p>

          <div className="mt-6 flex flex-wrap gap-3">
            <div className="inline-flex items-center gap-2 bg-white/10 backdrop-blur-sm px-4 py-2 rounded-xl border border-white/10 text-sm text-slate-300">
              <Database size={13} className="text-blue-400" />
              Atualizado em <strong className="text-white ml-1">{ultimaAtualizacao}</strong>
            </div>
            <div className="inline-flex items-center gap-2 bg-white/10 backdrop-blur-sm px-4 py-2 rounded-xl border border-white/10 text-sm text-slate-300">
              <Building2 size={13} className="text-blue-400" />
              <strong className="text-white">{dadosFiltrados.length}</strong>&nbsp;registros
            </div>
            {filtroEscola !== 'todas' && metricas.mediaPessoas > 0 && (
              <div className="inline-flex items-center gap-2 bg-indigo-500/20 backdrop-blur-sm px-4 py-2 rounded-xl border border-indigo-400/30 text-sm text-indigo-300">
                <Users size={13} />
                Média: <strong className="text-white ml-1">{metricas.mediaPessoas} pessoas/dia</strong>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── FILTER BAR ── */}
      <div className="bg-white border-b border-slate-200 shadow-sm sticky top-0 z-20">
        <div className="px-8 py-4">

          {/* Main row */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2 text-slate-600 font-semibold text-sm shrink-0">
              <SlidersHorizontal size={15} className="text-blue-600" />
              Filtros
            </div>
            <div className="h-5 w-px bg-slate-200 shrink-0" />

            {/* School */}
            <div className="relative min-w-[260px] max-w-xs">
              <Building2 size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              <select
                className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-8 pr-7 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent appearance-none cursor-pointer text-slate-700"
                value={filtroEscola}
                onChange={e => setFiltroEscola(e.target.value)}
              >
                <option value="todas">Rede Estadual (Geral)</option>
                {escolasFiltradas.map(e => <option key={e} value={e}>{e}</option>)}
              </select>
              <ChevronDown size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            </div>

            {/* Date range */}
            <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm">
              <Calendar size={13} className="text-slate-400 shrink-0" />
              <input type="month" value={dataInicio} onChange={e => setDataInicio(e.target.value)} className="bg-transparent outline-none text-slate-700 text-sm w-[118px]" />
              <span className="text-slate-300 font-light">→</span>
              <input type="month" value={dataFim} onChange={e => setDataFim(e.target.value)} className="bg-transparent outline-none text-slate-700 text-sm w-[118px]" />
            </div>

            {/* Quick presets */}
            <div className="flex items-center gap-1">
              {(['Este Ano', '1º Sem', '2º Sem', '6 Meses', '3 Meses'] as const).map((label, i) => {
                const presets: Preset[] = ['ano', 'sem1', 'sem2', '6m', '3m'];
                return (
                  <button key={label} onClick={() => aplicarPreset(presets[i])}
                    className="px-2.5 py-1.5 text-[11px] font-semibold bg-slate-100 hover:bg-blue-100 hover:text-blue-700 text-slate-600 rounded-lg transition-all whitespace-nowrap">
                    {label}
                  </button>
                );
              })}
            </div>

            {/* Right actions */}
            <div className="ml-auto flex items-center gap-2 shrink-0">
              <button
                onClick={() => setMostrarAvancado(!mostrarAvancado)}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold transition-all ${mostrarAvancado ? 'bg-blue-600 text-white shadow-md shadow-blue-200' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
              >
                <SlidersHorizontal size={13} />
                Avançado
                {mostrarAvancado ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
              </button>
              <button
                onClick={exportarPDF} disabled={gerandoPDF}
                className="flex items-center gap-2 bg-slate-900 hover:bg-blue-600 text-white px-4 py-2 rounded-xl text-sm font-medium transition-all disabled:opacity-50 shadow-sm"
              >
                <Download size={15} />
                {gerandoPDF ? 'Gerando...' : 'Exportar PDF'}
              </button>
            </div>
          </div>

          {/* Advanced filters */}
          {mostrarAvancado && (
            <div className="mt-4 pt-4 border-t border-slate-100 flex flex-wrap items-center gap-6">
              {/* Utility type */}
              <div className="flex items-center gap-3">
                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider shrink-0">Utilidade</span>
                <div className="flex items-center bg-slate-100 p-1 rounded-xl gap-0.5">
                  {([
                    { value: 'ambas' as Utilidade, label: 'Ambas', Icon: null },
                    { value: 'agua' as Utilidade, label: 'Água', Icon: Droplets },
                    { value: 'energia' as Utilidade, label: 'Energia', Icon: Zap },
                  ]).map(opt => (
                    <button key={opt.value} onClick={() => setFiltroUtilidade(opt.value)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${filtroUtilidade === opt.value ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
                      {opt.Icon && <opt.Icon size={12} />}
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* School search */}
              <div className="relative">
                <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                <input
                  type="text" placeholder="Buscar escola..." value={busca}
                  onChange={e => setBusca(e.target.value)}
                  className="pl-8 pr-8 py-2 text-sm bg-slate-100 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 w-60"
                />
                {busca && (
                  <button onClick={() => setBusca('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700">
                    <X size={13} />
                  </button>
                )}
              </div>

              <button onClick={resetarFiltros}
                className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-rose-600 font-medium transition-colors ml-auto">
                <RotateCcw size={13} />
                Limpar tudo
              </button>
            </div>
          )}

          {/* Active filter chips */}
          {filtrosAtivos.length > 0 && (
            <div className="mt-3 flex items-center gap-2 flex-wrap">
              <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Ativos:</span>
              {filtrosAtivos.map(f => (
                <button key={f.key}
                  onClick={() => {
                    if (f.key === 'escola') setFiltroEscola('todas');
                    if (f.key === 'utilidade') setFiltroUtilidade('ambas');
                    if (f.key === 'data') { setDataInicio(`${anoAtual}-01`); setDataFim(`${anoAtual}-12`); }
                  }}
                  className="inline-flex items-center gap-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 px-3 py-1 rounded-full text-xs font-medium border border-blue-100 transition-colors group">
                  {f.label}
                  <X size={11} className="opacity-50 group-hover:opacity-100" />
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── MAIN CONTENT ── */}
      <div ref={dashboardRef} className="px-8 py-8 space-y-8">

        {/* KPI CARDS */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">

          {/* Financial */}
          <div className="bg-white rounded-3xl p-8 border border-slate-100 shadow-sm relative overflow-hidden">
            <div className="absolute -top-10 -right-10 w-36 h-36 bg-violet-50 rounded-full pointer-events-none" />
            <div className="relative">
              <div className="flex items-start justify-between mb-6">
                <div className="w-11 h-11 rounded-2xl bg-violet-100 flex items-center justify-center">
                  <DollarSign size={20} className="text-violet-600" />
                </div>
                <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold ${metricas.economizou ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>
                  {metricas.economizou ? <TrendingDown size={11} /> : <TrendingUp size={11} />}
                  {Math.abs(metricas.diffFin).toFixed(1)}%
                </span>
              </div>
              <p className="text-slate-500 text-[11px] font-bold uppercase tracking-widest mb-1">Gasto Total</p>
              <h2 className="text-2xl font-black text-slate-900 leading-tight">
                {metricas.atualFinanceiro.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
              </h2>
              {metricas.primMes && metricas.primMes !== metricas.ultMes && (
                <p className="mt-4 text-[10px] text-slate-400 uppercase font-bold tracking-widest border-t border-slate-100 pt-3">
                  {metricas.primMes} → {metricas.ultMes}
                </p>
              )}
            </div>
          </div>

          {/* Water */}
          <div className="relative bg-gradient-to-br from-blue-500 to-blue-700 rounded-3xl p-8 shadow-lg shadow-blue-200 overflow-hidden">
            <div className="absolute -top-8 -right-8 w-32 h-32 bg-blue-400/25 rounded-full blur-lg pointer-events-none" />
            <div className="absolute -bottom-10 -left-6 w-28 h-28 bg-blue-800/20 rounded-full blur-xl pointer-events-none" />
            <div className="relative">
              <div className="flex items-start justify-between mb-6">
                <Droplets size={28} className="text-blue-200" />
                <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold ${metricas.economizouAgua ? 'bg-white text-emerald-600' : 'bg-rose-500 text-white'}`}>
                  {metricas.economizouAgua ? <TrendingDown size={11} /> : <TrendingUp size={11} />}
                  {Math.abs(metricas.diffAgua).toFixed(1)}%
                </span>
              </div>
              <p className="text-blue-100 text-[11px] font-bold uppercase tracking-widest mb-1">Volume de Água</p>
              <h2 className="text-3xl font-black text-white leading-tight">
                {metricas.atualAguaM3.toLocaleString('pt-BR')}
                <small className="text-base ml-1.5 font-semibold opacity-60">m³</small>
              </h2>
              {metricas.primMes && metricas.primMes !== metricas.ultMes && (
                <p className="mt-4 text-[10px] text-blue-200 uppercase font-bold tracking-widest border-t border-white/20 pt-3">
                  {metricas.primMes} → {metricas.ultMes}
                </p>
              )}
            </div>
          </div>

          {/* Energy */}
          <div className="relative bg-gradient-to-br from-amber-400 to-orange-500 rounded-3xl p-8 shadow-lg shadow-amber-100 overflow-hidden">
            <div className="absolute -top-8 -right-8 w-32 h-32 bg-amber-300/25 rounded-full blur-lg pointer-events-none" />
            <div className="absolute -bottom-10 -left-6 w-28 h-28 bg-orange-600/15 rounded-full blur-xl pointer-events-none" />
            <div className="relative">
              <div className="flex items-start justify-between mb-6">
                <Zap size={28} className="text-amber-900/30" />
                <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold ${metricas.economizouLuz ? 'bg-white text-emerald-600' : 'bg-rose-500 text-white'}`}>
                  {metricas.economizouLuz ? <TrendingDown size={11} /> : <TrendingUp size={11} />}
                  {Math.abs(metricas.diffLuz).toFixed(1)}%
                </span>
              </div>
              <p className="text-amber-900/60 text-[11px] font-bold uppercase tracking-widest mb-1">Consumo de Energia</p>
              <h2 className="text-3xl font-black text-amber-950 leading-tight">
                {metricas.atualEnergiaKwh.toLocaleString('pt-BR')}
                <small className="text-base ml-1.5 font-semibold opacity-50">kWh</small>
              </h2>
              {metricas.primMes && metricas.primMes !== metricas.ultMes && (
                <p className="mt-4 text-[10px] text-amber-900/50 uppercase font-bold tracking-widest border-t border-amber-900/10 pt-3">
                  {metricas.primMes} → {metricas.ultMes}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* CHARTS */}
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">

          {/* Audit chart */}
          <div className="bg-white rounded-3xl p-8 border border-slate-100 shadow-sm">
            <div className="mb-6 flex items-start gap-3">
              <div className="w-11 h-11 rounded-2xl bg-indigo-50 flex items-center justify-center shrink-0">
                <Activity size={18} className="text-indigo-600" />
              </div>
              <div>
                <h3 className="text-lg font-black text-slate-800">Auditoria: Conta vs Fiscal</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Área contínua = Concessionária · <span className="border-b border-dashed border-slate-400">Tracejado</span> = Apontamento Fiscal
                </p>
              </div>
            </div>
            <div className="h-[320px]">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={dadosParaGrafico} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="gradAgua" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.15} />
                      <stop offset="95%" stopColor="#3B82F6" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="gradEnergia" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#F59E0B" stopOpacity={0.15} />
                      <stop offset="95%" stopColor="#F59E0B" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" />
                  <XAxis dataKey="mes_ano" axisLine={false} tickLine={false} tick={{ fill: '#94A3B8', fontSize: 11 }} dy={10} />
                  {mostraAgua && (
                    <YAxis yAxisId="left" orientation="left" axisLine={false} tickLine={false} tick={{ fill: '#94A3B8', fontSize: 11 }} tickFormatter={v => `${v}m³`} width={65} />
                  )}
                  {mostraEnergia && (
                    <YAxis yAxisId="right" orientation="right" axisLine={false} tickLine={false} tick={{ fill: '#94A3B8', fontSize: 11 }} tickFormatter={v => `${v}kWh`} width={78} />
                  )}
                  <Tooltip
                    contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 25px 30px -5px rgba(0,0,0,0.12)', padding: '12px 16px' }}
                    cursor={{ stroke: '#E2E8F0', strokeWidth: 2 }}
                    formatter={(value: any, name: any, props: any) => {
                      if (name === 'media_pessoas_fiscal') return null;
                      if (value === null || value === undefined) return ['Não registrado pelo Fiscal', '📋 Água (Fiscal)'];
                      const pessoas = props.payload.media_pessoas_fiscal ? ` (~${props.payload.media_pessoas_fiscal} pessoas)` : '';
                      if (name === 'agua_fiscal_m3') return [`${Number(value).toLocaleString('pt-BR')} m³${pessoas}`, '📋 Água (Fiscal)'];
                      if (name === 'agua_qtde_m3') return [`${Number(value).toLocaleString('pt-BR')} m³`, '💧 Água (Sabesp)'];
                      if (name === 'energia_qtde_kwh') return [`${Number(value).toLocaleString('pt-BR')} kWh`, '⚡ Energia (EDP)'];
                      return [value, name];
                    }}
                  />
                  <Legend wrapperStyle={{ paddingTop: '16px', fontSize: '12px' }} />
                  {mostraAgua && (
                    <Area yAxisId="left" type="monotone" dataKey="agua_qtde_m3" name="Água (Conta)" stroke="#3B82F6" strokeWidth={3} fill="url(#gradAgua)" dot={{ r: 3, strokeWidth: 2 }} activeDot={{ r: 5 }} />
                  )}
                  {mostraEnergia && (
                    <Area yAxisId="right" type="monotone" dataKey="energia_qtde_kwh" name="Energia (Conta)" stroke="#F59E0B" strokeWidth={3} fill="url(#gradEnergia)" dot={{ r: 3, strokeWidth: 2 }} activeDot={{ r: 5 }} />
                  )}
                  {mostraAgua && (
                    <Line yAxisId="left" type="monotone" dataKey="agua_fiscal_m3" name="Água (Fiscal)" stroke="#3B82F6" strokeWidth={2} strokeDasharray="6 4" dot={{ r: 3, fill: 'white', strokeWidth: 2 }} connectNulls />
                  )}
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Financial chart */}
          <div className="bg-white rounded-3xl p-8 border border-slate-100 shadow-sm">
            <div className="mb-6 flex items-start gap-3">
              <div className="w-11 h-11 rounded-2xl bg-emerald-50 flex items-center justify-center shrink-0">
                <DollarSign size={18} className="text-emerald-600" />
              </div>
              <div>
                <h3 className="text-lg font-black text-slate-800">Custos Financeiros</h3>
                <p className="text-xs text-slate-500 mt-0.5">Água (Sabesp) e Energia (EDP) por período</p>
              </div>
            </div>
            <div className="h-[320px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={dadosParaGrafico} barGap={4} barCategoryGap="35%">
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" />
                  <XAxis dataKey="mes_ano" axisLine={false} tickLine={false} tick={{ fill: '#94A3B8', fontSize: 11 }} dy={10} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fill: '#94A3B8', fontSize: 11 }} tickFormatter={v => `R$${(v / 1000).toFixed(0)}k`} width={55} />
                  <Tooltip
                    contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 25px 30px -5px rgba(0,0,0,0.12)', padding: '12px 16px' }}
                    cursor={{ fill: '#F8FAFC' }}
                    formatter={(value: any, name: any) => {
                      const formatado = `R$ ${Number(value).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
                      return [formatado, name === 'agua_valor' ? '💧 Custo Água' : '⚡ Custo Energia'];
                    }}
                  />
                  <Legend wrapperStyle={{ paddingTop: '16px', fontSize: '12px' }} />
                  {mostraAgua && (
                    <Bar dataKey="agua_valor" name="Custo Água" fill="#3B82F6" radius={[6, 6, 0, 0]} maxBarSize={36} />
                  )}
                  {mostraEnergia && (
                    <Bar dataKey="energia_valor" name="Custo Energia" fill="#F59E0B" radius={[6, 6, 0, 0]} maxBarSize={36} />
                  )}
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

import { useState, useEffect, useMemo, useRef } from 'react';
import Papa from 'papaparse';
import { supabase } from '../lib/supabase';
import {
  Search,
  FileText,
  Building2,
  ShieldAlert,
  Loader2,
  BarChart3,
  PieChart as PieIcon,
  Flame,
  ShieldCheck,
  RefreshCw,
  ExternalLink,
  Table2,
  ClipboardList,
  CalendarDays,
  FileDown,
  X,
} from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import html2canvas from 'html2canvas';
import { addTimbradoAllPages } from '../lib/pdfTimbrado';
import * as XLSX from 'xlsx';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  Cell,
  PieChart,
  Pie,
  Legend
} from 'recharts';

interface AvcbData {
  codigoFde: string;
  nomePredio: string;
  areaConstruida: string;
  pavimentos: string;
  emissao: string;
  validade: string;
  statusContr: string;
  fase: string;
}

const SHEET_CSV_URL = import.meta.env.VITE_AVCB_SHEET_CSV_URL as string;

const normalizeText = (value: any) =>
  String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/_/g, '')
    .replace(/\s+/g, '')
    .trim();

const normalizeCode = (value: any) =>
  String(value || '')
    .replace(/\D/g, '')
    .trim();

// dd/mm/yyyy (como o texto vem digitado na planilha) -> yyyy-mm-dd, para dar pra
// comparar/agrupar por mês. Retorna '' quando não reconhece o formato.
function parseDataBR(raw: string): string {
  if (!raw || raw === '-') return '';
  const m = raw.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) {
    const [, d, mo, y] = m;
    return `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  return '';
}

export default function Avcb() {
  const [isMounted, setIsMounted] = useState(false);
  const [data, setData] = useState<AvcbData[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  // ── Relatório Mensal (PDF) ────────────────────────────────────────────
  const [showRelatorioModal, setShowRelatorioModal] = useState(false);
  const [relatorioMes, setRelatorioMes] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });
  const [gerandoRelatorioPdf, setGerandoRelatorioPdf] = useState(false);
  const relatorioRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setIsMounted(true);
    fetchAvcbData();
  }, []);

  const fetchAvcbData = () => {
    setLoading(true);

    Papa.parse(SHEET_CSV_URL, {
      download: true,
      header: true,
      skipEmptyLines: true,
      transformHeader: normalizeText,

      complete: async (results) => {
        const planData = results.data as any[];

        const { data: schoolsData, error } = await (supabase as any)
          .from('schools')
          .select('name, fde_code');

        if (error) {
          console.error('Erro ao buscar escolas:', error);
        }

        const getSchoolNameByFde = (codigoFde: string) => {
          const school = schoolsData?.find((s: any) => {
            return normalizeCode(s.fde_code) === normalizeCode(codigoFde);
          });

          return school?.name || 'Escola não localizada';
        };

        const formattedData: AvcbData[] = planData
          .map((row) => {
            const getVal = (searchTerms: string[]) => {
              const key = Object.keys(row).find((k) => {
                const cleanKey = normalizeText(k);

                return searchTerms.some((term) =>
                  cleanKey.includes(normalizeText(term))
                );
              });

              const value = key ? String(row[key] || '').trim() : '';
              return value || '-';
            };

            const codigoFde = normalizeCode(
              getVal(['codigofde', 'codigo_fde', 'codigo fde', 'fde'])
            );

            return {
              codigoFde,
              nomePredio: getSchoolNameByFde(codigoFde),
              areaConstruida: getVal([
                'areaconstruida',
                'area_construida',
                'area construida'
              ]),
              pavimentos: getVal(['pavimentos', 'pavimento']),
              emissao: getVal(['emissao', 'emissão']),
              validade: getVal(['validade']),
              statusContr: getVal([
                'statuscontr',
                'status_contr',
                'status contratual',
                'status'
              ]),
              fase: getVal(['fase', 'faseprojeto', 'fase do projeto'])
            };
          })
          .filter((escola) => escola.codigoFde !== '');

        setData(formattedData);
        setLoading(false);
      },

      error: (error) => {
        console.error('Erro ao ler a planilha AVCB:', error);
        setLoading(false);
      }
    });
  };

  const stats = useMemo(() => {
    const total = data.length;

    const regulares = data.filter(
      (item) => item.validade && item.validade !== '-'
    ).length;

    const pendentes = total - regulares;

    return { total, regulares, pendentes };
  }, [data]);

  const statusChartData = useMemo(() => {
    const statusCount: Record<string, number> = {};

    data.forEach((item) => {
      const status =
        item.statusContr && item.statusContr !== '-'
          ? item.statusContr
          : 'Sem Informação';

      statusCount[status] = (statusCount[status] || 0) + 1;
    });

    return Object.keys(statusCount)
      .map((key) => ({
        name: key,
        quantidade: statusCount[key]
      }))
      .sort((a, b) => b.quantidade - a.quantidade)
      .slice(0, 5);
  }, [data]);

  const regularizacaoChartData = useMemo(() => {
    return [
      {
        name: 'AVCB Vigente',
        value: stats.regulares,
        color: '#10b981'
      },
      {
        name: 'Pendente/Projeto',
        value: stats.pendentes,
        color: '#f59e0b'
      }
    ];
  }, [stats]);

  // ── Relatório Mensal ────────────────────────────────────────────────────
  // "Emissao" e "Validade" são as únicas datas reais da planilha — usadas para
  // os cortes por mês. O resto (status contratual, fase) só existe como
  // situação atual, sem histórico de quando mudou.
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
    const emitidosNoMes = data.filter(d => parseDataBR(d.emissao).startsWith(mes)).length;
    const vencendoNoMes = data.filter(d => parseDataBR(d.validade).startsWith(mes)).length;

    const [anoSel, mesSelNum] = mes.split('-').map(Number);
    const tendencia = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(anoSel, (mesSelNum - 1) - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const label = d.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' });
      const emitidos = data.filter(x => parseDataBR(x.emissao).startsWith(key)).length;
      const vencendo = data.filter(x => parseDataBR(x.validade).startsWith(key)).length;
      tendencia.push({ mes: label, Emitidos: emitidos, Vencendo: vencendo });
    }

    return { emitidosNoMes, vencendoNoMes, tendencia };
  }, [relatorioMes, data]);

  // Relatório Mensal em PDF: mesma técnica já usada nas demais páginas
  // (html2canvas do bloco de cards + gráficos Recharts renderizado no modal + addImage).
  const gerarRelatorioMensalPdf = async () => {
    if (!relatorioRef.current) return;
    setGerandoRelatorioPdf(true);
    try {
      await new Promise(r => setTimeout(r, 400));
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
      doc.save(`Relatorio_Mensal_AVCB_${relatorioMes}.pdf`);
      setShowRelatorioModal(false);
    } catch (err) {
      console.error(err);
      alert('Houve um erro ao gerar o PDF. Tente novamente.');
    } finally {
      setGerandoRelatorioPdf(false);
    }
  };

  const filteredData = data.filter((item) => {
    const term = searchTerm.toLowerCase();

    return (
      item.nomePredio?.toLowerCase().includes(term) ||
      item.codigoFde?.includes(searchTerm) ||
      item.statusContr?.toLowerCase().includes(term)
    );
  });

  function openSpreadsheet() {
    const match = SHEET_CSV_URL?.match(/\/d\/([a-zA-Z0-9-_]+)/);
    const id = match?.[1];
    if (id) window.open(`https://docs.google.com/spreadsheets/d/${id}/edit`, '_blank');
  }

  function exportPDF() {
    const doc = new jsPDF({ orientation: 'landscape' });
    doc.setFontSize(14);
    doc.text('Mapeamento AVCB — Controle de Regularização', 14, 16);
    doc.setFontSize(9);
    doc.text(`Gerado em: ${new Date().toLocaleDateString('pt-BR')} às ${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}  |  ${filteredData.length} registro(s)`, 14, 23);
    autoTable(doc, {
      startY: 28,
      head: [['Código FDE', 'Escola', 'Área Construída', 'Validade AVCB', 'Status Contratual', 'Fase']],
      body: filteredData.map((item) => [
        item.codigoFde,
        item.nomePredio,
        item.areaConstruida,
        item.validade,
        item.statusContr,
        item.fase,
      ]),
      styles: { fontSize: 7 },
      headStyles: { fillColor: [220, 38, 38], textColor: 255, fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [248, 250, 252] },
    });
    doc.save('avcb-mapeamento.pdf');
  }

  function exportExcel() {
    const rows = filteredData.map((item) => ({
      'Código FDE': item.codigoFde,
      'Escola': item.nomePredio,
      'Área Construída': item.areaConstruida,
      'Pavimentos': item.pavimentos,
      'Emissão': item.emissao,
      'Validade AVCB': item.validade,
      'Status Contratual': item.statusContr,
      'Fase': item.fase,
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    ws['!cols'] = [{ wch: 14 }, { wch: 45 }, { wch: 16 }, { wch: 12 }, { wch: 14 }, { wch: 16 }, { wch: 20 }, { wch: 25 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'AVCB');
    XLSX.writeFile(wb, 'avcb-mapeamento.xlsx');
  }

  return (
    <div className="space-y-6 pb-20 relative">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-red-600 rounded-2xl text-white shadow-lg shadow-red-100">
            <Flame size={24} />
          </div>

          <div>
            <h1 className="text-2xl font-black text-slate-900 tracking-tight uppercase">
              Mapeamento AVCB
            </h1>
            <p className="text-slate-500 text-sm font-medium">
              Controle de regularização e vistorias dos bombeiros.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button onClick={openSpreadsheet} title="Abrir planilha de origem" className="flex items-center gap-2 px-4 py-2.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-xl text-xs font-black uppercase hover:bg-emerald-100 transition-all active:scale-95">
            <ExternalLink size={15} /> Planilha
          </button>
          <button onClick={() => setShowRelatorioModal(true)} disabled={loading} title="Relatório mensal com métricas de evolução" className="flex items-center gap-2 px-4 py-2.5 bg-blue-50 text-blue-700 border border-blue-200 rounded-xl text-xs font-black uppercase hover:bg-blue-100 transition-all active:scale-95 disabled:opacity-40">
            <ClipboardList size={15} /> Relatório Mensal
          </button>
          <button onClick={exportPDF} disabled={loading || data.length === 0} title="Exportar como PDF" className="flex items-center gap-2 px-4 py-2.5 bg-red-50 text-red-700 border border-red-200 rounded-xl text-xs font-black uppercase hover:bg-red-100 transition-all active:scale-95 disabled:opacity-40">
            <FileText size={15} /> PDF
          </button>
          <button onClick={exportExcel} disabled={loading || data.length === 0} title="Exportar como Excel" className="flex items-center gap-2 px-4 py-2.5 bg-green-50 text-green-700 border border-green-200 rounded-xl text-xs font-black uppercase hover:bg-green-100 transition-all active:scale-95 disabled:opacity-40">
            <Table2 size={15} /> Excel
          </button>
          <button onClick={fetchAvcbData} disabled={loading} className="bg-slate-900 text-white px-5 py-2.5 rounded-xl font-bold flex items-center justify-center gap-2 shadow-lg hover:bg-slate-800 transition-all active:scale-95 disabled:opacity-50">
            {loading ? <Loader2 className="animate-spin" size={18} /> : <RefreshCw size={18} />}
            {loading ? 'SINCRONIZANDO...' : 'ATUALIZAR DADOS'}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-xl shadow-slate-200/50 flex items-center gap-4">
          <div className="p-4 bg-blue-50 text-blue-600 rounded-2xl">
            <Building2 size={24} />
          </div>
          <div>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
              Total Mapeado
            </p>
            <h3 className="text-2xl font-black text-slate-800">
              {loading ? '...' : stats.total}{' '}
              <span className="text-xs text-slate-400 font-bold uppercase">
                Escolas
              </span>
            </h3>
          </div>
        </div>

        <div className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-xl shadow-slate-200/50 flex items-center gap-4">
          <div className="p-4 bg-emerald-50 text-emerald-600 rounded-2xl">
            <ShieldCheck size={24} />
          </div>
          <div>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
              AVCB Vigente
            </p>
            <h3 className="text-2xl font-black text-slate-800">
              {loading ? '...' : stats.regulares}{' '}
              <span className="text-xs text-slate-400 font-bold uppercase">
                Unidades
              </span>
            </h3>
          </div>
        </div>

        <div className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-xl shadow-slate-200/50 flex items-center gap-4">
          <div className="p-4 bg-amber-50 text-amber-600 rounded-2xl">
            <ShieldAlert size={24} />
          </div>
          <div>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
              Em Regularização
            </p>
            <h3 className="text-2xl font-black text-slate-800">
              {loading ? '...' : stats.pendentes}{' '}
              <span className="text-xs text-slate-400 font-bold uppercase">
                Pendentes
              </span>
            </h3>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-xl shadow-slate-200/40">
          <h3 className="text-sm font-black text-slate-800 uppercase tracking-tight mb-8 flex items-center gap-2">
            <BarChart3 size={18} className="text-blue-600" />
            Distribuição por Status Contratual
          </h3>

          <div style={{ width: '100%', height: 250 }}>
            {isMounted && statusChartData.length > 0 ? (
              <ResponsiveContainer width="100%" height={250}>
                <BarChart
                  data={statusChartData}
                  margin={{ left: -20, bottom: -10 }}
                >
                  <CartesianGrid
                    strokeDasharray="3 3"
                    vertical={false}
                    stroke="#f1f5f9"
                  />
                  <XAxis
                    dataKey="name"
                    axisLine={false}
                    tickLine={false}
                    tick={{
                      fontSize: 9,
                      fontWeight: 700,
                      fill: '#94a3b8'
                    }}
                    interval={0}
                    angle={-15}
                    textAnchor="end"
                  />
                  <YAxis
                    axisLine={false}
                    tickLine={false}
                    tick={{
                      fontSize: 10,
                      fontWeight: 700,
                      fill: '#94a3b8'
                    }}
                  />
                  <RechartsTooltip
                    cursor={{ fill: '#f8fafc' }}
                    contentStyle={{
                      borderRadius: '12px',
                      border: 'none',
                      boxShadow: '0 10px 15px rgba(0,0,0,0.1)'
                    }}
                  />
                  <Bar dataKey="quantidade" radius={[6, 6, 0, 0]}>
                    {statusChartData.map((entry, index) => (
                      <Cell
                        key={`cell-${index}`}
                        fill={
                          entry.name.toLowerCase().includes('sem')
                            ? '#f87171'
                            : '#3b82f6'
                        }
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full w-full flex items-center justify-center text-slate-300 text-xs font-bold uppercase tracking-widest text-center px-4 border-2 border-dashed border-slate-100 rounded-2xl">
                Nenhum dado<br />para gerar gráfico
              </div>
            )}
          </div>
        </div>

        <div className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-xl shadow-slate-200/40">
          <h3 className="text-sm font-black text-slate-800 uppercase tracking-tight mb-8 flex items-center gap-2">
            <PieIcon size={18} className="text-emerald-600" />
            Visão Geral de Regularidade
          </h3>

          <div style={{ width: '100%', height: 250 }}>
            {isMounted && regularizacaoChartData.length > 0 ? (
              <ResponsiveContainer width="100%" height={250}>
                <PieChart>
                  <Pie
                    data={regularizacaoChartData}
                    innerRadius={60}
                    outerRadius={80}
                    paddingAngle={5}
                    dataKey="value"
                  >
                    {regularizacaoChartData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <RechartsTooltip
                    contentStyle={{
                      borderRadius: '12px',
                      border: 'none',
                      boxShadow: '0 10px 15px rgba(0,0,0,0.1)'
                    }}
                  />
                  <Legend
                    iconType="circle"
                    wrapperStyle={{
                      fontSize: '11px',
                      fontWeight: 700,
                      paddingTop: '20px'
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full w-full flex items-center justify-center text-slate-300 text-xs font-bold uppercase tracking-widest text-center px-4 border-2 border-dashed border-slate-100 rounded-2xl">
                Nenhum dado<br />para gerar gráfico
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm">
        <div className="relative w-full max-w-2xl">
          <Search
            className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
            size={18}
          />
          <input
            type="text"
            placeholder="Filtrar por escola, código FDE ou status..."
            className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium transition-all"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 border-b border-slate-100">
              <tr>
                <th className="px-6 py-4 font-bold text-slate-500 uppercase text-[10px] tracking-wider">
                  Escola / FDE
                </th>
                <th className="px-6 py-4 font-bold text-slate-500 uppercase text-[10px] tracking-wider">
                  Área Construída
                </th>
                <th className="px-6 py-4 font-bold text-slate-500 uppercase text-[10px] tracking-wider">
                  Validade AVCB
                </th>
                <th className="px-6 py-4 font-bold text-slate-500 uppercase text-[10px] tracking-wider">
                  Status Atual
                </th>
                <th className="px-6 py-4 font-bold text-slate-500 uppercase text-[10px] tracking-wider">
                  Fase do Projeto
                </th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
              {loading && data.length === 0 ? (
                <tr>
                  <td
                    colSpan={5}
                    className="px-6 py-12 text-center text-slate-400 font-bold uppercase tracking-widest"
                  >
                    <Loader2 className="animate-spin inline mr-2 text-red-600" />
                    Lendo dados da planilha...
                  </td>
                </tr>
              ) : filteredData.length === 0 && !loading ? (
                <tr>
                  <td
                    colSpan={5}
                    className="px-6 py-12 text-center text-slate-400 font-bold uppercase tracking-widest"
                  >
                    Nenhum registro encontrado.
                  </td>
                </tr>
              ) : (
                filteredData.map((item, idx) => {
                  const isRegular = item.validade && item.validade !== '-';

                  return (
                    <tr
                      key={idx}
                      className="hover:bg-slate-50/80 transition-colors group"
                    >
                      <td className="px-6 py-4">
                        <div className="font-bold text-slate-900 truncate max-w-[250px] uppercase text-xs">
                          {item.nomePredio}
                        </div>
                        <div className="flex items-center gap-1.5 mt-1 font-mono text-[10px] text-slate-400">
                          <FileText size={12} />
                          {item.codigoFde}
                        </div>
                      </td>

                      <td className="px-6 py-4">
                        <div className="font-bold text-slate-700 text-xs">
                          {item.areaConstruida}
                        </div>
                        {item.pavimentos !== '-' && (
                          <div className="text-[10px] text-slate-400 mt-0.5">
                            {item.pavimentos} Pavimento(s)
                          </div>
                        )}
                      </td>

                      <td className="px-6 py-4">
                        <span
                          className={`text-xs font-black ${
                            isRegular ? 'text-emerald-600' : 'text-slate-400'
                          }`}
                        >
                          {item.validade}
                        </span>
                      </td>

                      <td className="px-6 py-4">
                        <span
                          className={`text-[10px] px-2 py-1 inline-block rounded-md font-black uppercase tracking-tight w-max ${
                            isRegular
                              ? 'bg-emerald-100 text-emerald-700'
                              : 'bg-amber-100 text-amber-700'
                          }`}
                        >
                          {item.statusContr}
                        </span>
                      </td>

                      <td className="px-6 py-4">
                        <div
                          className="font-bold text-xs text-slate-500 max-w-[200px] truncate"
                          title={item.fase}
                        >
                          {item.fase}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal: Relatório Mensal (PDF) */}
      {showRelatorioModal && (
        <div className="fixed inset-0 z-[110] bg-slate-900/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between p-5 border-b border-slate-100">
              <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                <ClipboardList size={20} className="text-blue-600" /> Relatório Mensal
              </h2>
              <button onClick={() => setShowRelatorioModal(false)} className="p-2 hover:bg-slate-100 rounded-lg transition-colors">
                <X size={18} className="text-slate-500" />
              </button>
            </div>

            <div className="px-5 py-3 border-b border-slate-100 flex items-center gap-3">
              <label className="text-sm font-medium text-slate-600 flex items-center gap-1.5"><CalendarDays size={15} /> Mês de referência:</label>
              <select
                value={relatorioMes}
                onChange={e => setRelatorioMes(e.target.value)}
                className="px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {opcoesMesRelatorio.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
              </select>
            </div>

            <div className="overflow-y-auto flex-1 p-5">
              <div ref={relatorioRef} className="space-y-5 bg-white p-1">
                <div>
                  <h3 className="text-base font-bold text-slate-800">Relatório Mensal — Mapeamento AVCB</h3>
                  <p className="text-xs text-slate-500">Referência: {mesLabel(relatorioMes)} • Gerado em {new Date().toLocaleString('pt-BR')}</p>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div className="border border-slate-100 rounded-xl p-3">
                    <p className="text-xs text-slate-500 font-medium">AVCB Emitidos no Mês</p>
                    <p className="text-2xl font-bold text-emerald-600 mt-1">{relatorioMetrics.emitidosNoMes}</p>
                  </div>
                  <div className="border border-slate-100 rounded-xl p-3">
                    <p className="text-xs text-slate-500 font-medium">Vencendo no Mês</p>
                    <p className="text-2xl font-bold text-red-600 mt-1">{relatorioMetrics.vencendoNoMes}</p>
                  </div>
                  <div className="border border-slate-100 rounded-xl p-3">
                    <p className="text-xs text-slate-500 font-medium">AVCB Vigente (hoje)</p>
                    <p className="text-2xl font-bold text-slate-800 mt-1">{stats.regulares}</p>
                  </div>
                  <div className="border border-slate-100 rounded-xl p-3 bg-slate-50">
                    <p className="text-xs text-slate-500 font-medium">Total Mapeado</p>
                    <p className="text-2xl font-bold text-slate-800 mt-1">{stats.total}</p>
                  </div>
                </div>

                <div>
                  <h4 className="text-xs font-semibold text-slate-500 mb-2">Emitidos x Vencendo (últimos 6 meses)</h4>
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={relatorioMetrics.tendencia} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                      <XAxis dataKey="mes" tick={{ fontSize: 10 }} />
                      <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                      <RechartsTooltip />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      <Bar dataKey="Emitidos" fill="#10b981" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="Vencendo" fill="#ef4444" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                <div>
                  <h4 className="text-xs font-semibold text-slate-500 mb-2">Visão Geral de Regularidade (situação atual)</h4>
                  <ResponsiveContainer width="100%" height={220}>
                    <PieChart>
                      <Pie data={regularizacaoChartData} dataKey="value" nameKey="name" innerRadius={50} outerRadius={80} paddingAngle={3} stroke="#fff" strokeWidth={2}>
                        {regularizacaoChartData.map(entry => <Cell key={entry.name} fill={entry.color} />)}
                      </Pie>
                      <RechartsTooltip formatter={(v, n) => [v, n]} />
                      <Legend verticalAlign="bottom" height={36} iconType="circle" formatter={(value: string) => <span className="text-[11px] font-medium text-slate-600">{value}</span>} />
                    </PieChart>
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
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-60 transition-colors"
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
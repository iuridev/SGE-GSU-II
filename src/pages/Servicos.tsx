import { useState, useEffect, useMemo } from 'react';
import {
  HardHat, FileText, AlertCircle, Clock, CheckCircle,
  Search, X, FileDown, Lock,
  TrendingUp, BarChart3, FileSpreadsheet,
  DollarSign, XCircle, PlayCircle, ExternalLink
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { resolveViewRole } from '../lib/roles';

const SHEETS_CSV_URL = import.meta.env.VITE_SHEETS_CSV_URL as string;
const SHEETS_VIEW_URL = import.meta.env.VITE_SHEETS_VIEW_URL as string;

interface Escola {
  id: string;
  name: string;
}

interface Servico {
  id: string;
  escola_id: string;
  escolaNome: string;
  descricao: string;
  empresa?: string;
  valor?: number;
  status: string;
  data_inicio?: string;
  data_previsao_termino?: string;
  created_at: string;
  updated_at: string;
}

function parseCSVRow(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    if (line[i] === '"') {
      inQuotes = !inQuotes;
    } else if (line[i] === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += line[i];
    }
  }
  result.push(current);
  return result;
}

function parseBRLValue(str: string): number | undefined {
  if (!str) return undefined;
  const cleaned = str.replace(/R\$\s*/g, '').replace(/\./g, '').replace(',', '.').trim();
  const val = parseFloat(cleaned);
  return isNaN(val) ? undefined : val;
}

function parseBRDate(str: string): string | undefined {
  if (!str) return undefined;
  const match = str.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (!match) return undefined;
  return `${match[3]}-${match[2].padStart(2, '0')}-${match[1].padStart(2, '0')}`;
}

export default function Servicos() {
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [userRole, setUserRole] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);
  const [escolas, setEscolas] = useState<Escola[]>([]);
  const [servicos, setServicos] = useState<Servico[]>([]);

  const [searchTerm, setSearchTerm] = useState('');
  const [filterEscola, setFilterEscola] = useState('');
  const [filterStatus, setFilterStatus] = useState('');

  const [showExportModal, setShowExportModal] = useState(false);
  const [exportMonth, setExportMonth] = useState(new Date().getMonth() + 1);
  const [exportYear, setExportYear] = useState(new Date().getFullYear());

  useEffect(() => {
    async function loadData() {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        const { data: profile } = await supabase
          .from('profiles')
          .select('role')
          .eq('id', user.id)
          .single();

        const allowedRoles = ['manage_admin', 'admin', 'regional_admin'];
        const role = resolveViewRole((profile as any)?.role ?? '');
        const userIsAdmin = allowedRoles.includes(role);
        setIsAdmin(userIsAdmin);
        setUserRole(role);

        if (!userIsAdmin) {
          setIsLoading(false);
          return;
        }

        await fetchFromGoogleSheets();
      } catch (error) {
        console.error("Erro ao inicializar:", error);
      } finally {
        setIsLoading(false);
      }
    }
    loadData();
  }, []);

  const fetchFromGoogleSheets = async () => {
    try {
      const response = await fetch(SHEETS_CSV_URL);
      const text = await response.text();
      const lines = text.split(/\r?\n/).filter(line => line.trim());

      let dataStartIndex = 0;
      for (let i = 0; i < lines.length; i++) {
        const cols = parseCSVRow(lines[i]);
        if (cols[0]?.trim().toLowerCase() === 'unidade') {
          dataStartIndex = i + 1;
          break;
        }
      }

      const dados: Servico[] = [];
      const escolasSet = new Set<string>();
      let currentEscola = '';

      for (let i = dataStartIndex; i < lines.length; i++) {
        const cols = parseCSVRow(lines[i]);
        const rawUnidade = cols[0]?.trim();
        const unidade = rawUnidade || currentEscola;
        if (!unidade) continue;
        currentEscola = unidade;

        const descricao = cols[1]?.trim();
        if (!descricao) continue;

        const dateStr =
          parseBRDate(cols[2]?.trim()) ||
          parseBRDate(cols[3]?.trim()) ||
          parseBRDate(cols[4]?.trim());
        const createdAt = dateStr ? `${dateStr}T00:00:00Z` : new Date().toISOString();

        dados.push({
          id: `row-${i}`,
          escola_id: unidade,
          escolaNome: unidade,
          descricao,
          empresa: cols[6]?.trim() || undefined,
          valor: parseBRLValue(cols[5]?.trim()),
          status: cols[7]?.trim() || 'Sem status',
          data_inicio: dateStr,
          data_previsao_termino: undefined,
          created_at: createdAt,
          updated_at: new Date().toISOString()
        });

        escolasSet.add(unidade);
      }

      setServicos(dados);
      setEscolas([...escolasSet].sort().map(name => ({ id: name, name })));
    } catch (error) {
      console.error("Erro ao buscar dados da planilha:", error);
    }
  };

  const servicosFiltrados = useMemo(() => {
    return servicos.filter(s => {
      const matchSearch = searchTerm === '' ||
        s.escolaNome.toLowerCase().includes(searchTerm.toLowerCase()) ||
        s.descricao.toLowerCase().includes(searchTerm.toLowerCase());
      const matchEscola = filterEscola === '' || s.escola_id === filterEscola;
      const matchStatus = filterStatus === '' || s.status === filterStatus;
      return matchSearch && matchEscola && matchStatus;
    });
  }, [servicos, searchTerm, filterEscola, filterStatus]);

  const { chartData, top5Escolas, statusCounts, uniqueStatuses } = useMemo(() => {
    const meses = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
    const ultimos12MesesData: { name: string; count: number }[] = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date();
      d.setMonth(d.getMonth() - i);
      ultimos12MesesData.push({ name: `${meses[d.getMonth()]} ${d.getFullYear().toString().substring(2)}`, count: 0 });
    }

    const contagemEscolas: Record<string, number> = {};
    const contagemStatus: Record<string, number> = {};
    const allStatuses = new Set<string>();

    servicos.forEach(s => {
      const dataCriacao = new Date(s.created_at);
      const label = `${meses[dataCriacao.getMonth()]} ${dataCriacao.getFullYear().toString().substring(2)}`;
      const chartItem = ultimos12MesesData.find(item => item.name === label);
      if (chartItem) chartItem.count += 1;

      allStatuses.add(s.status);
      contagemStatus[s.status] = (contagemStatus[s.status] || 0) + 1;

      const umAnoAtras = new Date();
      umAnoAtras.setFullYear(umAnoAtras.getFullYear() - 1);
      if (dataCriacao >= umAnoAtras) {
        contagemEscolas[s.escolaNome] = (contagemEscolas[s.escolaNome] || 0) + 1;
      }
    });

    const top5 = Object.entries(contagemEscolas)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    return {
      chartData: ultimos12MesesData,
      top5Escolas: top5,
      statusCounts: contagemStatus,
      uniqueStatuses: [...allStatuses].sort()
    };
  }, [servicos]);

  const maxChartValue = Math.max(...chartData.map(d => d.count), 1);

  const getStatusCardStyle = (status: string) => {
    const s = status.toLowerCase();
    if (s.includes('conclu') || s.includes('realiz'))
      return { icon: <CheckCircle className="w-6 h-6 text-green-600" />, bg: 'bg-green-50', border: 'border-green-200', text: 'text-green-700' };
    if (s.includes('retific') || s.includes('aguard') || s.includes('orçam') || s.includes('orcam'))
      return { icon: <Clock className="w-6 h-6 text-slate-500" />, bg: 'bg-slate-50', border: 'border-slate-200', text: 'text-slate-700' };
    if (s.includes('início') || s.includes('inicio') || s.includes('andament') || s.includes('execu'))
      return { icon: <PlayCircle className="w-6 h-6 text-blue-500" />, bg: 'bg-blue-50', border: 'border-blue-200', text: 'text-blue-700' };
    if (s.includes('financ') || s.includes('suplementa') || s.includes('empenho') || s.includes('pedido'))
      return { icon: <DollarSign className="w-6 h-6 text-amber-500" />, bg: 'bg-amber-50', border: 'border-amber-200', text: 'text-amber-700' };
    if (s.includes('não') || s.includes('nao') || s.includes('cancel') || s.includes('negad'))
      return { icon: <XCircle className="w-6 h-6 text-red-500" />, bg: 'bg-red-50', border: 'border-red-200', text: 'text-red-700' };
    return { icon: <FileText className="w-6 h-6 text-gray-500" />, bg: 'bg-gray-50', border: 'border-gray-200', text: 'text-gray-700' };
  };

  const getStatusBadgeClass = (status: string) => {
    const s = status.toLowerCase();
    if (s.includes('conclu') || s.includes('realiz')) return 'bg-green-100 text-green-700';
    if (s.includes('início') || s.includes('inicio') || s.includes('andament')) return 'bg-blue-100 text-blue-700';
    if (s.includes('não') || s.includes('nao') || s.includes('cancel')) return 'bg-gray-200 text-gray-700';
    return 'bg-amber-100 text-amber-700';
  };

  const handleExportExcel = () => {
    const dadosFiltrados = servicos.filter(s => {
      const data = new Date(s.created_at);
      return data.getMonth() + 1 === exportMonth && data.getFullYear() === exportYear;
    });

    if (dadosFiltrados.length === 0) {
      alert('Nenhum dado encontrado para o período selecionado.');
      return;
    }

    const cabecalho = ['Escola', 'Descricao', 'Empresa', 'Valor R$', 'Status', 'Data Solicitacao'];
    const linhas = dadosFiltrados.map(s => [
      `"${s.escolaNome}"`,
      `"${s.descricao}"`,
      `"${s.empresa || ''}"`,
      s.valor || 0,
      `"${s.status}"`,
      s.data_inicio ? new Date(s.data_inicio + 'T00:00:00').toLocaleDateString('pt-BR') : ''
    ]);
    const csvContent = 'data:text/csv;charset=utf-8,' + [cabecalho.join(';'), ...linhas.map(l => l.join(';'))].join('\n');
    const link = document.createElement('a');
    link.setAttribute('href', encodeURI(csvContent));
    link.setAttribute('download', `servicos_${exportMonth}_${exportYear}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setShowExportModal(false);
  };

  if (isLoading) return <div className="min-h-screen flex items-center justify-center">A carregar...</div>;

  if (isAdmin === false) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4">
        <Lock className="w-16 h-16 text-red-500 mb-4" />
        <h1 className="text-2xl font-bold text-gray-800 mb-2">Acesso Restrito</h1>
        <p className="text-gray-600 text-center max-w-md">
          Esta página é de uso exclusivo da administração para controle de Obras e Manutenções contratadas.
          Você não tem permissão para aceder a este módulo.
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans print:block print:min-h-0 print:bg-white">
      <style>{`
        @media print {
          html, body { background: white !important; }
          * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
          [class*="shadow"] { box-shadow: none !important; }
          [class*="bg-slate-50"], [class*="bg-gray-50"] { background-color: white !important; }
        }
      `}</style>

      {/* HEADER */}
      <header className="bg-slate-900 text-white p-5 shadow-lg flex flex-col md:flex-row justify-between items-center gap-4 print:hidden">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-blue-600 rounded-lg">
            <HardHat className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Gestão de Serviços e Obras</h1>
            <p className="text-slate-400 text-sm">Controle de contratos e manutenções da Regional</p>
          </div>
        </div>

        <div className="flex gap-2 flex-wrap justify-end">
          {userRole === 'regional_admin' && (
            <a
              href={SHEETS_VIEW_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
            >
              <ExternalLink className="w-4 h-4" /> Abrir Planilha de Origem
            </a>
          )}
          <button
            onClick={() => setShowExportModal(true)}
            className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
          >
            <FileSpreadsheet className="w-4 h-4" /> Exportar Excel
          </button>
          <button
            onClick={() => window.print()}
            className="flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
          >
            <FileDown className="w-4 h-4" /> Imprimir Relatório PDF
          </button>
        </div>
      </header>

      <main className="flex-1 p-6 max-w-7xl mx-auto w-full space-y-6 print:block print:flex-none print:p-4 print:bg-white">

        {/* TÍTULO APENAS PARA PDF */}
        <div className="hidden print:block mb-6 text-center border-b-2 border-slate-900 pb-4">
          <h1 className="text-2xl font-bold text-gray-900">Gestão de Serviços e Obras</h1>
          <p className="text-gray-500 text-sm mt-1">Relatório de Serviços Solicitados — URE Guarulhos Sul</p>
          <p className="text-gray-500 text-sm">Serviço de Obras e Manutenção Escolar - SEOM</p>
          <p className="text-gray-400 text-xs mt-2">{new Date().toLocaleString('pt-BR')}</p>
        </div>

        {/* CARDS DE STATUS DINÂMICOS */}
        {uniqueStatuses.length > 0 && (
          <section className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 print:grid print:grid-cols-3 print:gap-4 print:mb-8">
            {uniqueStatuses.map(status => {
              const style = getStatusCardStyle(status);
              return (
                <div
                  key={status}
                  className={`p-4 rounded-2xl border ${style.border} bg-white shadow-sm flex flex-col transition-all hover:shadow-md cursor-default print:rounded-lg print:shadow-none`}
                  title={`Total de serviços "${status}"`}
                >
                  <div className="flex items-center gap-3 mb-3">
                    <div className={`p-2.5 rounded-xl ${style.bg}`}>{style.icon}</div>
                    <span className="text-3xl font-black text-gray-800 tracking-tight">{statusCounts[status]}</span>
                  </div>
                  <h4 className="text-[11px] sm:text-xs font-bold text-gray-500 leading-tight uppercase pr-2 print:text-[10px]">
                    {status}
                  </h4>
                </div>
              );
            })}
          </section>
        )}

        {/* DASHBOARD */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 print:hidden">

          {/* Gráfico Mensal */}
          <div className="lg:col-span-2 bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
            <h3 className="text-lg font-bold text-gray-800 mb-6 flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-blue-500" /> Solicitações nos Últimos 12 Meses
            </h3>
            <div className="h-64 flex items-end gap-2 justify-between">
              {chartData.map((d, i) => {
                const heightPercentage = (d.count / maxChartValue) * 100;
                return (
                  <div key={i} className="flex flex-col items-center flex-1 group">
                    <div className="relative w-full flex justify-center h-48 items-end">
                      <div
                        className="w-full max-w-[40px] bg-blue-100 group-hover:bg-blue-200 rounded-t-md transition-all duration-500 relative flex justify-center"
                        style={{ height: `${heightPercentage}%`, minHeight: d.count > 0 ? '4px' : '0' }}
                      >
                        {d.count > 0 && (
                          <span className="absolute -top-6 text-xs font-bold text-gray-600 opacity-0 group-hover:opacity-100 transition-opacity">
                            {d.count}
                          </span>
                        )}
                      </div>
                    </div>
                    <span className="text-[10px] sm:text-xs text-gray-500 mt-2 truncate max-w-full text-center">
                      {d.name.split(' ')[0]}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Ranking Top 5 */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
            <h3 className="text-lg font-bold text-gray-800 mb-6 flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-amber-500" /> Top 5 Escolas (12 meses)
            </h3>
            <div className="space-y-4">
              {top5Escolas.length > 0 ? top5Escolas.map((escola, index) => {
                const pct = Math.round((escola.count / top5Escolas[0].count) * 100);
                return (
                  <div key={index}>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="font-medium text-gray-700 truncate pr-2">{index + 1}. {escola.name}</span>
                      <span className="text-gray-500 font-bold">{escola.count}</span>
                    </div>
                    <div className="w-full bg-gray-100 rounded-full h-2">
                      <div className="bg-amber-400 h-2 rounded-full" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              }) : (
                <p className="text-sm text-gray-500 text-center py-8">Sem dados suficientes para o ranking.</p>
              )}
            </div>
          </div>
        </div>

        {/* TABELA DE SERVIÇOS */}
        <section className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden print:rounded-none print:border print:shadow-none">

          {/* Filtros */}
          <div className="p-5 border-b border-gray-200 bg-gray-50 flex flex-col lg:flex-row gap-4 justify-between items-center print:hidden">
            <h3 className="font-bold text-gray-800 flex items-center gap-2 w-full lg:w-auto">
              <FileText className="w-5 h-5 text-gray-500" /> Lista de Serviços
              <span className="text-xs font-normal text-gray-500 ml-1">({servicosFiltrados.length} registros)</span>
            </h3>

            <div className="flex flex-col sm:flex-row gap-3 w-full lg:w-auto">
              <select
                value={filterEscola} onChange={e => setFilterEscola(e.target.value)}
                className="w-full sm:w-48 p-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-white"
              >
                <option value="">Todas as Escolas</option>
                {escolas.map(esc => <option key={esc.id} value={esc.id}>{esc.name}</option>)}
              </select>

              <select
                value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
                className="w-full sm:w-48 p-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-white"
              >
                <option value="">Todos os Status</option>
                {uniqueStatuses.map(s => <option key={s} value={s}>{s}</option>)}
              </select>

              <div className="relative w-full sm:w-64">
                <Search className="w-4 h-4 absolute left-3 top-2.5 text-gray-400" />
                <input
                  type="text" value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
                  placeholder="Buscar serviço ou escola..."
                  className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-gray-600 print:text-xs">
              <thead className="bg-gray-100 text-gray-700 font-semibold uppercase text-xs">
                <tr>
                  <th className="px-5 py-4">Escola / Serviço</th>
                  <th className="px-5 py-4">Status / Fase</th>
                  <th className="px-5 py-4 hidden md:table-cell">Empresa & Valor</th>
                  <th className="px-5 py-4">Data da Solicitação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {servicosFiltrados.length > 0 ? servicosFiltrados.map(servico => (
                  <tr key={servico.id} className="hover:bg-blue-50/30 transition-colors">
                    <td className="px-5 py-4">
                      <p className="font-bold text-gray-800 line-clamp-1">{servico.escolaNome}</p>
                      <p className="text-gray-500 text-xs mt-1 line-clamp-2" title={servico.descricao}>{servico.descricao}</p>
                    </td>
                    <td className="px-5 py-4">
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-xs font-semibold ${getStatusBadgeClass(servico.status)}`}>
                        <AlertCircle className="w-3.5 h-3.5" />
                        {servico.status}
                      </span>
                    </td>
                    <td className="px-5 py-4 hidden md:table-cell">
                      <p className="font-medium text-gray-700">{servico.empresa || '-'}</p>
                      <p className="text-gray-500 text-xs">
                        {servico.valor
                          ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(servico.valor)
                          : 'Sem valor'}
                      </p>
                    </td>
                    <td className="px-5 py-4">
                      {servico.data_inicio ? (
                        <span className="text-sm text-gray-600">
                          {new Date(servico.data_inicio + 'T00:00:00').toLocaleDateString('pt-BR')}
                        </span>
                      ) : (
                        <span className="text-xs text-gray-400">-</span>
                      )}
                    </td>
                  </tr>
                )) : (
                  <tr>
                    <td colSpan={4} className="px-5 py-10 text-center text-gray-500">
                      Nenhum serviço encontrado.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

      </main>

      {/* MODAL DE EXPORTAÇÃO */}
      {showExportModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4 print:hidden">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden animate-in zoom-in-95">
            <div className="p-4 text-white flex justify-between items-center bg-green-600">
              <h3 className="font-bold flex items-center gap-2">
                <FileSpreadsheet className="w-5 h-5" />
                Exportar Excel (CSV)
              </h3>
              <button onClick={() => setShowExportModal(false)} className="text-white/80 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <p className="text-sm text-gray-600">Selecione o mês e o ano para gerar o relatório de serviços do período.</p>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Mês</label>
                  <select
                    value={exportMonth} onChange={e => setExportMonth(Number(e.target.value))}
                    className="w-full p-2.5 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    {[1,2,3,4,5,6,7,8,9,10,11,12].map(m => (
                      <option key={m} value={m}>
                        {new Date(2000, m - 1, 1).toLocaleString('pt-BR', { month: 'long' }).toUpperCase()}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Ano</label>
                  <input
                    type="number" value={exportYear} onChange={e => setExportYear(Number(e.target.value))}
                    className="w-full p-2.5 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <button
                onClick={handleExportExcel}
                className="w-full py-3 mt-4 rounded-lg font-bold text-white transition-colors bg-green-600 hover:bg-green-700"
              >
                Confirmar e Gerar Excel (CSV)
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

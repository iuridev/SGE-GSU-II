import { useState, useEffect, useMemo } from 'react';
import Papa from 'papaparse';
import { 
  Search, FileText, Building2, 
  ShieldAlert, Loader2, BarChart3, PieChart as PieIcon, Flame, ShieldCheck, RefreshCw
} from 'lucide-react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, 
  ResponsiveContainer, Cell, PieChart, Pie, Legend
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

export default function Avcb() {
  const [data, setData] = useState<AvcbData[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  // Link mágico do Google Sheets para exportar a aba "avcb" como CSV
  const SHEET_CSV_URL = "https://docs.google.com/spreadsheets/d/1AaxxhCNUYJwI4xgsGsAmFkk0VDMoKIN0fpYjHmfSof8/gviz/tq?tqx=out:csv&sheet=avcb";

  useEffect(() => {
    fetchAvcbData();
  }, []);

const fetchAvcbData = () => {
    setLoading(true);
    Papa.parse(SHEET_CSV_URL, {
      download: true,
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const planData: any[] = results.data;
        
        const formattedData: AvcbData[] = planData.map((row) => {
          // Função inteligente para achar a coluna
          const getVal = (searchTerms: string[]) => {
            const key = Object.keys(row).find(k => {
              const cleanKey = k.toLowerCase()
                                .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
                                .replace(/\s+/g, '');
              return searchTerms.some(term => cleanKey.includes(term));
            });
            return key ? row[key]?.trim() : '-';
          };

          return {
            codigoFde: getVal(['codigofde']),
            // Deixei apenas 'nomedopredio' para evitar conflito com números de outras colunas de escola
            nomePredio: getVal(['nomedopredio']), 
            areaConstruida: getVal(['areaconstruida']),
            pavimentos: getVal(['pavimento']),
            emissao: getVal(['emissao']),
            validade: getVal(['validade']),
            statusContr: getVal(['statuscontr']),
            fase: getVal(['fase']),
          };
        }).filter(escola => escola.codigoFde !== '-' && escola.codigoFde !== ''); 

        setData(formattedData);
        setLoading(false);
      },
      error: (error) => {
        console.error("Erro ao ler a planilha:", error);
        setLoading(false);
      }
    });
  };

  // --- CÁLCULOS DE INDICADORES ---
  const stats = useMemo(() => {
    const total = data.length;
    // Considera com AVCB se tiver validade preenchida e não for um traço
    const regulares = data.filter(z => z.validade && z.validade !== '-').length;
    const pendentes = total - regulares;

    return { total, regulares, pendentes };
  }, [data]);

  // --- DADOS PARA GRÁFICOS ---
  const statusChartData = useMemo(() => {
    const statusCount: Record<string, number> = {};
    data.forEach(item => {
      const status = item.statusContr || 'Outros';
      statusCount[status] = (statusCount[status] || 0) + 1;
    });

    return Object.keys(statusCount)
      .map(key => ({ name: key, quantidade: statusCount[key] }))
      .sort((a, b) => b.quantidade - a.quantidade)
      .slice(0, 5); // Pega os 5 principais status
  }, [data]);

  const regularizacaoChartData = useMemo(() => {
    return [
      { name: 'AVCB Vigente', value: stats.regulares, color: '#10b981' },
      { name: 'Pendente/Projeto', value: stats.pendentes, color: '#f59e0b' }
    ];
  }, [stats]);

  // --- FILTRO DE BUSCA ---
  const filteredData = data.filter(item => 
    item.nomePredio?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    item.codigoFde?.includes(searchTerm) ||
    item.statusContr?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6 pb-20 relative">
      
      {/* CABEÇALHO */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-red-600 rounded-2xl text-white shadow-lg shadow-red-100">
            <Flame size={24}/>
          </div>
          <div>
            <h1 className="text-2xl font-black text-slate-900 tracking-tight uppercase">Mapeamento AVCB</h1>
            <p className="text-slate-500 text-sm font-medium">Controle de regularização e vistorias dos bombeiros.</p>
          </div>
        </div>
        
        <div className="flex gap-3">
          <button 
            onClick={fetchAvcbData}
            disabled={loading}
            className="bg-slate-900 text-white px-5 py-2.5 rounded-xl font-bold flex items-center justify-center gap-2 shadow-lg hover:bg-slate-800 transition-all active:scale-95 disabled:opacity-50"
          >
            {loading ? <Loader2 className="animate-spin" size={18}/> : <RefreshCw size={18} />}
            {loading ? 'SINCRONIZANDO...' : 'ATUALIZAR DADOS'}
          </button>
        </div>
      </div>

      {/* CARDS DE INDICADORES */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-xl shadow-slate-200/50 flex items-center gap-4 transition-all hover:scale-[1.02]">
          <div className="p-4 bg-blue-50 text-blue-600 rounded-2xl"><Building2 size={24} /></div>
          <div>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Total Mapeado</p>
            <h3 className="text-2xl font-black text-slate-800">{loading ? '...' : stats.total} <span className="text-xs text-slate-400 font-bold uppercase">Escolas</span></h3>
          </div>
        </div>
        <div className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-xl shadow-slate-200/50 flex items-center gap-4 transition-all hover:scale-[1.02]">
          <div className="p-4 bg-emerald-50 text-emerald-600 rounded-2xl"><ShieldCheck size={24} /></div>
          <div>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">AVCB Vigente</p>
            <h3 className="text-2xl font-black text-slate-800">{loading ? '...' : stats.regulares} <span className="text-xs text-slate-400 font-bold uppercase">Unidades</span></h3>
          </div>
        </div>
        <div className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-xl shadow-slate-200/50 flex items-center gap-4 transition-all hover:scale-[1.02]">
          <div className="p-4 bg-amber-50 text-amber-600 rounded-2xl"><ShieldAlert size={24} /></div>
          <div>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Em Regularização</p>
            <h3 className="text-2xl font-black text-slate-800">{loading ? '...' : stats.pendentes} <span className="text-xs text-slate-400 font-bold uppercase">Pendentes</span></h3>
          </div>
        </div>
      </div>

      {/* GRÁFICOS ANALÍTICOS */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-xl shadow-slate-200/40">
          <h3 className="text-sm font-black text-slate-800 uppercase tracking-tight mb-8 flex items-center gap-2">
            <BarChart3 size={18} className="text-blue-600" /> Distribuição por Status Contratual
          </h3>
          <div className="h-[250px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={statusChartData} margin={{ left: -20, bottom: -10 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fontSize: 9, fontWeight: 700, fill: '#94a3b8'}} interval={0} angle={-15} textAnchor="end" />
                <YAxis axisLine={false} tickLine={false} tick={{fontSize: 10, fontWeight: 700, fill: '#94a3b8'}} />
                <RechartsTooltip cursor={{fill: '#f8fafc'}} contentStyle={{borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px rgba(0,0,0,0.1)'}} />
                <Bar dataKey="quantidade" radius={[6, 6, 0, 0]}>
                  {statusChartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.name.includes('Sem AVCB') ? '#f87171' : '#3b82f6'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-xl shadow-slate-200/40">
          <h3 className="text-sm font-black text-slate-800 uppercase tracking-tight mb-8 flex items-center gap-2">
            <PieIcon size={18} className="text-emerald-600" /> Visão Geral de Regularidade
          </h3>
          <div className="h-[250px] w-full">
            <ResponsiveContainer width="100%" height="100%">
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
                <RechartsTooltip contentStyle={{borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px rgba(0,0,0,0.1)'}} />
                <Legend iconType="circle" wrapperStyle={{fontSize: '11px', fontWeight: 700, paddingTop: '20px'}} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* BUSCA E TABELA */}
      <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm">
        <div className="relative w-full max-w-2xl">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
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
                <th className="px-6 py-4 font-bold text-slate-500 uppercase text-[10px] tracking-wider">Unidade / FDE</th>
                <th className="px-6 py-4 font-bold text-slate-500 uppercase text-[10px] tracking-wider">Área Construída (m²)</th>
                <th className="px-6 py-4 font-bold text-slate-500 uppercase text-[10px] tracking-wider">Validade AVCB</th>
                <th className="px-6 py-4 font-bold text-slate-500 uppercase text-[10px] tracking-wider">Status Atual</th>
                <th className="px-6 py-4 font-bold text-slate-500 uppercase text-[10px] tracking-wider">Fase do Projeto</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
              {loading && data.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-slate-400 font-bold uppercase tracking-widest">
                    <Loader2 className="animate-spin inline mr-2 text-red-600"/> Lendo dados da planilha...
                  </td>
                </tr>
              ) : filteredData.length === 0 && !loading ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-slate-400 font-bold uppercase tracking-widest">
                    Nenhum registro encontrado.
                  </td>
                </tr>
              ) : filteredData.map((item, idx) => {
                const isRegular = item.validade && item.validade !== '-';
                
                return (
                  <tr key={idx} className="hover:bg-slate-50/80 transition-colors group">
                    <td className="px-6 py-4">
                      <div className="font-bold text-slate-900 truncate max-w-[250px] uppercase text-xs">{item.nomePredio}</div>
                      <div className="flex items-center gap-1.5 mt-1 font-mono text-[10px] text-slate-400">
                        <FileText size={12} /> {item.codigoFde}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="font-bold text-slate-700 text-xs">{item.areaConstruida}</div>
                      {item.pavimentos !== '-' && (
                        <div className="text-[10px] text-slate-400 mt-0.5">{item.pavimentos} Pavimento(s)</div>
                      )}
                    </td>
                    <td className="px-6 py-4">
                       <span className={`text-xs font-black ${isRegular ? 'text-emerald-600' : 'text-slate-400'}`}>
                        {item.validade}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-col gap-1.5">
                        <span className={`text-[10px] px-2 py-1 inline-block rounded-md font-black uppercase tracking-tight w-max ${isRegular ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                          {item.statusContr}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="font-bold text-xs text-slate-500 max-w-[200px] truncate" title={item.fase}>
                        {item.fase}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
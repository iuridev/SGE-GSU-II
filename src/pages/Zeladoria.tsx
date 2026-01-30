import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Search, Filter, AlertTriangle, CheckCircle, Clock, Home } from 'lucide-react';

export function ZeladoriaPage() {
  const [zeladorias, setZeladorias] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtro, setFiltro] = useState('');

  useEffect(() => {
    carregarDados();
  }, []);

  async function carregarDados() {
    // Busca tudo ordenado pela escola
    const { data } = await supabase.from('zeladorias').select('*').order('escola');
    if (data) setZeladorias(data);
    setLoading(false);
  }

  // Lógica para colorir o status (igual sua planilha)
  const getStatusColor = (status: string) => {
    const s = status?.toUpperCase() || '';
    if (s.includes('VENCIDO') || s.includes('NÃO HABITÁVEL')) return 'bg-red-100 text-red-700 border-red-200';
    if (s.includes('CASA CIVIL') || s.includes('ANÁLISE') || s.includes('PGE')) return 'bg-yellow-100 text-yellow-700 border-yellow-200';
    if (s === 'SIM' || s === 'OK') return 'bg-green-100 text-green-700 border-green-200';
    return 'bg-slate-100 text-slate-700 border-slate-200';
  };

  // Filtra a lista pelo que você digitar
  const listaFiltrada = zeladorias.filter(item => 
    item.escola?.toLowerCase().includes(filtro.toLowerCase()) ||
    item.ocupante_nome?.toLowerCase().includes(filtro.toLowerCase())
  );

  return (
    <div className="p-8 max-w-7xl mx-auto">
      
      {/* Cabeçalho */}
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <Home className="text-blue-600" />
            Gestão de Ocupação de Zeladorias
          </h1>
          <p className="text-slate-500">Controle de processos, validades e ocupantes (Base SEFISC)</p>
        </div>
        <div className="flex gap-2">
           <div className="bg-white border rounded-lg flex items-center px-3 py-2 w-64 shadow-sm">
              <Search size={18} className="text-slate-400 mr-2" />
              <input 
                placeholder="Buscar escola ou zelador..." 
                className="outline-none text-sm w-full"
                value={filtro}
                onChange={e => setFiltro(e.target.value)}
              />
           </div>
        </div>
      </div>

      {/* Tabela de Dados */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-slate-50 text-slate-600 font-semibold border-b">
              <tr>
                <th className="p-4">Escola / UE</th>
                <th className="p-4">Status</th>
                <th className="p-4">Ocupante (Zelador)</th>
                <th className="p-4">Processo SEI</th>
                <th className="p-4">Validade</th>
                <th className="p-4">Situação DARE</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr><td colSpan={6} className="p-8 text-center text-slate-500">Carregando dados...</td></tr>
              ) : listaFiltrada.map((item) => (
                <tr key={item.id} className="hover:bg-slate-50 transition-colors">
                  <td className="p-4">
                    <div className="font-bold text-slate-700">{item.escola}</div>
                    <div className="text-xs text-slate-400">UE: {item.ue}</div>
                  </td>
                  <td className="p-4">
                    <span className={`px-2 py-1 rounded-full text-xs font-bold border ${getStatusColor(item.status)}`}>
                      {item.status || 'N/A'}
                    </span>
                  </td>
                  <td className="p-4">
                    <div className="text-slate-700 font-medium">{item.ocupante_nome || '-'}</div>
                    <div className="text-xs text-slate-500">{item.ocupante_cargo}</div>
                  </td>
                  <td className="p-4 text-slate-600 font-mono text-xs">
                    {item.n_processo || '-'}
                  </td>
                  <td className="p-4">
                    <div className="flex items-center gap-1 text-slate-700">
                      <Clock size={14} className="text-slate-400" />
                      {item.data_validade ? new Date(item.data_validade).toLocaleDateString('pt-BR') : '-'}
                    </div>
                  </td>
                  <td className="p-4">
                     {item.pagamento_status?.includes('Isento') ? (
                        <span className="text-green-600 flex items-center gap-1 text-xs font-bold">
                           <CheckCircle size={12}/> Isento
                        </span>
                     ) : (
                        <span className="text-slate-500 text-xs">Paga DARE</span>
                     )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
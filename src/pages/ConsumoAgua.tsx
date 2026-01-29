import { Sidebar } from '../components/Sidebar';
import { Header } from '../components/Header';
import { Droplets, Plus, FileText, TrendingDown } from 'lucide-react';

export function ConsumoAgua() {
  // Dados falsos para visualizar
  const leituras = [
    { id: 1, data: '15/01/2026', leitura: '4520 m³', valor: 'R$ 1.250,00', status: 'Analise' },
    { id: 2, data: '15/12/2025', leitura: '4480 m³', valor: 'R$ 1.100,00', status: 'Pago' },
    { id: 3, data: '15/11/2025', leitura: '4450 m³', valor: 'R$ 1.050,00', status: 'Pago' },
  ];

  return (
    <div className="min-h-screen bg-slate-50">
      <Sidebar userRole="school_manager" />
      <Header userName="Gestor" userRole="school_manager" />

      <main className="ml-64 pt-24 p-8">
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
              <Droplets className="text-blue-500" /> Controle Hídrico
            </h1>
            <p className="text-slate-500">Registre a leitura do hidrômetro mensalmente.</p>
          </div>
          <button className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg flex items-center gap-2 transition-colors font-medium shadow-sm">
            <Plus size={18} /> Nova Leitura
          </button>
        </div>

        {/* Cards de Resumo */}
        <div className="grid grid-cols-3 gap-4 mb-8">
          <div className="bg-white p-4 rounded-xl border border-blue-100 shadow-sm flex items-center gap-4">
            <div className="p-3 bg-blue-50 rounded-full text-blue-600"><Droplets size={24} /></div>
            <div>
              <p className="text-sm text-slate-500">Consumo Mês Atual</p>
              <p className="text-xl font-bold text-slate-800">40 m³</p>
            </div>
          </div>
          <div className="bg-white p-4 rounded-xl border border-green-100 shadow-sm flex items-center gap-4">
             <div className="p-3 bg-green-50 rounded-full text-green-600"><TrendingDown size={24} /></div>
             <div>
              <p className="text-sm text-slate-500">Economia vs. Média</p>
              <p className="text-xl font-bold text-green-600">-5%</p>
            </div>
          </div>
        </div>

        {/* Tabela */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <table className="w-full text-sm text-left text-slate-600">
            <thead className="bg-slate-50 text-slate-700 font-semibold uppercase text-xs">
              <tr>
                <th className="px-6 py-4">Data da Leitura</th>
                <th className="px-6 py-4">Consumo (m³)</th>
                <th className="px-6 py-4">Valor Estimado</th>
                <th className="px-6 py-4">Status</th>
                <th className="px-6 py-4 text-right">Comprovante</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {leituras.map((item) => (
                <tr key={item.id} className="hover:bg-slate-50">
                  <td className="px-6 py-4 font-medium">{item.data}</td>
                  <td className="px-6 py-4">{item.leitura}</td>
                  <td className="px-6 py-4">{item.valor}</td>
                  <td className="px-6 py-4">
                    <span className={`px-2 py-1 rounded-full text-xs font-bold ${item.status === 'Pago' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
                      {item.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <button className="text-blue-600 hover:text-blue-800 flex items-center gap-1 justify-end w-full">
                      <FileText size={16} /> Ver Foto
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </main>
    </div>
  );
}
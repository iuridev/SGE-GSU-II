import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { 
  Droplets, Truck, History, History as HistoryIcon, Plus, 
  Calendar, AlertTriangle, Loader2, CheckCircle, Clock 
} from 'lucide-react';
import { WaterTruckModal } from '../components/WaterTruckModal';

export function ConsumoAgua() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [registros, setRegistros] = useState<any[]>([]);

  // Restaurando sua função de busca original
  async function fetchConsumo() {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('pedidos_pipa')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      setRegistros(data || []);
    } catch (err) {
      console.error('Erro ao buscar dados de consumo:', err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchConsumo();
  }, []);

  // Removido Sidebar/Header de dentro: Apenas o conteúdo
  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Consumo de Água</h1>
          <p className="text-slate-500">Monitoramento e pedidos de caminhão pipa.</p>
        </div>
        <button 
          onClick={() => setIsModalOpen(true)}
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 rounded-xl font-semibold flex items-center gap-2 shadow-lg shadow-blue-100 transition-all active:scale-95"
        >
          <Truck className="w-5 h-5" />
          Solicitar Caminhão Pipa
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm">
          <div className="flex items-center gap-4 mb-4">
            <div className="p-3 bg-blue-50 rounded-xl">
              <Droplets className="w-6 h-6 text-blue-600" />
            </div>
            <h3 className="font-bold text-slate-900 text-sm">Nível Reservatório</h3>
          </div>
          <div className="relative h-3 bg-slate-100 rounded-full overflow-hidden">
            <div className="absolute inset-y-0 left-0 bg-blue-500 rounded-full transition-all duration-1000" style={{ width: '72%' }}></div>
          </div>
          <p className="mt-2 text-right text-xs font-bold text-blue-600">72%</p>
        </div>

        <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm">
          <div className="flex items-center gap-4 mb-4">
            <div className="p-3 bg-amber-50 rounded-xl">
              <HistoryIcon className="w-6 h-6 text-amber-600" />
            </div>
            <h3 className="font-bold text-slate-900 text-sm">Último Pedido</h3>
          </div>
          <p className="text-xl font-bold text-slate-900">
            {registros[0] ? new Date(registros[0].created_at).toLocaleDateString() : '--/--/----'}
          </p>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-slate-100 bg-slate-50/50">
          <h2 className="text-lg font-bold text-slate-900">Histórico de Pedidos</h2>
        </div>
        
        {loading ? (
          <div className="p-12 flex justify-center"><Loader2 className="w-8 h-8 animate-spin text-blue-600" /></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-6 py-4 font-bold text-slate-500 uppercase text-[10px]">Data Solicitação</th>
                  <th className="px-6 py-4 font-bold text-slate-500 uppercase text-[10px]">Capacidade</th>
                  <th className="px-6 py-4 font-bold text-slate-500 uppercase text-[10px]">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {registros.map((reg) => (
                  <tr key={reg.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-6 py-4 text-slate-900">
                      {new Date(reg.created_at).toLocaleString()}
                    </td>
                    <td className="px-6 py-4 font-medium text-slate-700">{reg.capacidade}L</td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                        reg.status === 'entregue' ? 'bg-emerald-100 text-emerald-700' : 'bg-blue-100 text-blue-700'
                      }`}>
                        {reg.status === 'entregue' ? <CheckCircle className="w-3 h-3" /> : <Clock className="w-3 h-3" />}
                        {reg.status}
                      </span>
                    </td>
                  </tr>
                ))}
                {registros.length === 0 && (
                  <tr>
                    <td colSpan={3} className="px-6 py-12 text-center text-slate-400">Nenhum pedido registrado.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {isModalOpen && (
        <WaterTruckModal 
          onClose={() => setIsModalOpen(false)} 
          onSuccess={() => {
            setIsModalOpen(false);
            fetchConsumo();
          }}
        />
      )}
    </div>
  );
}
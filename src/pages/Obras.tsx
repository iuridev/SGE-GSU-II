import { Sidebar } from '../components/Sidebar';
import { Header } from '../components/Header';
import { Hammer, Clock, MoreHorizontal } from 'lucide-react';

export function Obras() {
  const obras = [
    { id: 1, titulo: 'Reforma do Telhado - Bloco B', progresso: 75, status: 'Em Execução', prazo: '15/02/2026' },
    { id: 2, titulo: 'Pintura da Quadra', progresso: 10, status: 'Iniciando', prazo: '30/03/2026' },
    { id: 3, titulo: 'Instalação de Ar Condicionado', progresso: 100, status: 'Concluído', prazo: '10/01/2026' },
  ];

  return (
    <div className="min-h-screen bg-slate-50">
      <Sidebar userRole="regional_admin" />
      <Header userName="Regional" userRole="regional_admin" />

      <main className="ml-64 pt-24 p-8">
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
              <Hammer className="text-orange-600" /> Obras e Reformas
            </h1>
            <p className="text-slate-500">Acompanhamento físico-financeiro.</p>
          </div>
          <button className="bg-orange-600 hover:bg-orange-700 text-white px-4 py-2 rounded-lg font-medium shadow-sm">
            Solicitar Intervenção
          </button>
        </div>

        <div className="space-y-6">
          {obras.map((obra) => (
            <div key={obra.id} className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
              <div className="flex justify-between items-start mb-4">
                <div>
                  <h3 className="text-lg font-bold text-slate-800">{obra.titulo}</h3>
                  <div className="flex items-center gap-4 mt-1 text-sm text-slate-500">
                    <span className="flex items-center gap-1"><Clock size={14} /> Prazo: {obra.prazo}</span>
                    <span className={`font-semibold ${obra.status === 'Concluído' ? 'text-green-600' : 'text-orange-600'}`}>
                      {obra.status}
                    </span>
                  </div>
                </div>
                <button className="text-slate-400 hover:text-slate-600"><MoreHorizontal /></button>
              </div>

              {/* Barra de Progresso */}
              <div className="mt-2">
                <div className="flex justify-between text-xs font-semibold text-slate-600 mb-1">
                  <span>Progresso</span>
                  <span>{obra.progresso}%</span>
                </div>
                <div className="w-full bg-slate-100 rounded-full h-2.5">
                  <div 
                    className={`h-2.5 rounded-full ${obra.progresso === 100 ? 'bg-green-500' : 'bg-orange-500'}`} 
                    style={{ width: `${obra.progresso}%` }}
                  ></div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
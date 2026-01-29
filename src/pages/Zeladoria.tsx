import { useState } from 'react';
import { Sidebar } from '../components/Sidebar';
import { Header } from '../components/Header';
import { Plus, Filter, Wrench, CheckCircle, Clock, AlertTriangle } from 'lucide-react';

export function Zeladoria() {
  // Dados fictícios para visualização imediata
  const [tickets] = useState([
    { 
      id: 1, 
      titulo: 'Vazamento no Banheiro Masculino', 
      descricao: 'Torneira da pia 2 não fecha completamente.', 
      prioridade: 'alta', 
      status: 'pendente',
      data: 'Hoje, 08:30'
    },
    { 
      id: 2, 
      titulo: 'Lâmpada Queimada - Sala 4', 
      descricao: 'Troca de lâmpada fluorescente necessária.', 
      prioridade: 'media', 
      status: 'em_andamento',
      data: 'Ontem, 14:00'
    },
    { 
      id: 3, 
      titulo: 'Fechadura Emperrada', 
      descricao: 'Porta da biblioteca difícil de abrir.', 
      prioridade: 'baixa', 
      status: 'concluido',
      data: '25/01/2026'
    },
  ]);

  return (
    <div className="min-h-screen bg-slate-50">
      <Sidebar userRole="school_manager" />
      <Header userName="Gestor" userRole="school_manager" />

      <main className="ml-64 pt-24 p-8">
        
        {/* Cabeçalho da Página */}
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
              <Wrench className="text-blue-600" /> Zeladoria
            </h1>
            <p className="text-slate-500">Gerencie manutenções e reparos da escola.</p>
          </div>
          <button className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg flex items-center gap-2 transition-colors font-medium shadow-sm">
            <Plus size={18} /> Novo Chamado
          </button>
        </div>

        {/* Estatísticas Rápidas */}
        <div className="grid grid-cols-3 gap-4 mb-8">
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center gap-3">
             <div className="p-2 bg-yellow-100 rounded-lg text-yellow-700"><Clock size={20} /></div>
             <div>
               <p className="text-xs text-slate-500 uppercase font-bold">Pendentes</p>
               <p className="text-xl font-bold text-slate-800">1</p>
             </div>
          </div>
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center gap-3">
             <div className="p-2 bg-blue-100 rounded-lg text-blue-700"><Wrench size={20} /></div>
             <div>
               <p className="text-xs text-slate-500 uppercase font-bold">Em Andamento</p>
               <p className="text-xl font-bold text-slate-800">1</p>
             </div>
          </div>
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center gap-3">
             <div className="p-2 bg-green-100 rounded-lg text-green-700"><CheckCircle size={20} /></div>
             <div>
               <p className="text-xs text-slate-500 uppercase font-bold">Concluídos</p>
               <p className="text-xl font-bold text-slate-800">14</p>
             </div>
          </div>
        </div>

        {/* Tabela de Chamados */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          
          {/* Barra de Filtros */}
          <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
            <div className="flex gap-2">
              <button className="flex items-center gap-2 px-3 py-1.5 bg-white border border-slate-200 rounded-md text-sm text-slate-600 hover:bg-slate-50 shadow-sm">
                <Filter size={16} /> Todos
              </button>
              <button className="px-3 py-1.5 hover:bg-slate-100 rounded-md text-sm text-slate-500">Pendentes</button>
              <button className="px-3 py-1.5 hover:bg-slate-100 rounded-md text-sm text-slate-500">Concluídos</button>
            </div>
            <span className="text-xs text-slate-400">Mostrando últimos 3 chamados</span>
          </div>

          <table className="w-full text-sm text-left text-slate-600">
            <thead className="bg-slate-50 text-slate-700 font-semibold uppercase text-xs">
              <tr>
                <th className="px-6 py-4">Ocorrência</th>
                <th className="px-6 py-4">Prioridade</th>
                <th className="px-6 py-4">Status</th>
                <th className="px-6 py-4">Data</th>
                <th className="px-6 py-4 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {tickets.map((ticket) => (
                <tr key={ticket.id} className="hover:bg-slate-50 transition-colors group">
                  <td className="px-6 py-4">
                    <div className="flex items-start gap-3">
                      <div className="mt-1">
                        {ticket.prioridade === 'alta' ? <AlertTriangle size={16} className="text-red-500" /> : <Wrench size={16} className="text-slate-400" />}
                      </div>
                      <div>
                        <p className="font-bold text-slate-800 group-hover:text-blue-600 transition-colors">{ticket.titulo}</p>
                        <p className="text-xs text-slate-500">{ticket.descricao}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <BadgePriority level={ticket.prioridade} />
                  </td>
                  <td className="px-6 py-4">
                    <BadgeStatus status={ticket.status} />
                  </td>
                  <td className="px-6 py-4 text-slate-500">
                    {ticket.data}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <button className="text-blue-600 hover:text-blue-800 font-medium text-xs hover:underline">
                      Gerenciar
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

// Pequenos componentes visuais (Badges)
function BadgeStatus({ status }: { status: string }) {
  const config: any = {
    pendente: { color: "bg-yellow-100 text-yellow-700", label: "Pendente" },
    em_andamento: { color: "bg-blue-100 text-blue-700", label: "Em Andamento" },
    concluido: { color: "bg-green-100 text-green-700", label: "Concluído" }
  };
  const item = config[status] || config.pendente;

  return (
    <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${item.color}`}>
      {item.label}
    </span>
  );
}

function BadgePriority({ level }: { level: string }) {
  const config: any = {
    baixa: "text-slate-500 bg-slate-100",
    media: "text-blue-600 bg-blue-50",
    alta: "text-red-600 bg-red-50"
  };
  
  return (
    <span className={`px-2 py-0.5 rounded text-xs font-bold uppercase tracking-wide ${config[level]}`}>
      {level}
    </span>
  );
}
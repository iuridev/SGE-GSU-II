import { Sidebar } from '../components/Sidebar';
import { Header } from '../components/Header';
import { Bell, Mail, Info, AlertCircle } from 'lucide-react';

export function Notificacoes() {
  const avisos = [
    { id: 1, tipo: 'urgente', titulo: 'Prazo do Censo Escolar', msg: 'O prazo final para envio dos dados é dia 30.', data: 'Hoje, 09:00' },
    { id: 2, tipo: 'info', titulo: 'Manutenção no Sistema', msg: 'O SGE-GSU ficará indisponível domingo das 02h às 04h.', data: 'Ontem' },
    { id: 3, tipo: 'normal', titulo: 'Novo Chamado Atribuído', msg: 'O chamado #492 foi respondido pela regional.', data: '28/01/2026' },
  ];

  return (
    <div className="min-h-screen bg-slate-50">
      <Sidebar userRole="school_manager" />
      <Header userName="Gestor" userRole="school_manager" />

      <main className="ml-64 pt-24 p-8">
        <h1 className="text-2xl font-bold text-slate-800 mb-6 flex items-center gap-2">
          <Bell className="text-slate-700" /> Central de Notificações
        </h1>

        <div className="bg-white rounded-xl shadow-sm border border-slate-200 divide-y divide-slate-100">
          {avisos.map((aviso) => (
            <div key={aviso.id} className="p-6 flex gap-4 hover:bg-slate-50 transition-colors cursor-pointer group">
              <div className={`mt-1 p-2 rounded-full h-fit 
                ${aviso.tipo === 'urgente' ? 'bg-red-100 text-red-600' : 
                  aviso.tipo === 'info' ? 'bg-blue-100 text-blue-600' : 'bg-slate-100 text-slate-500'}`}>
                {aviso.tipo === 'urgente' ? <AlertCircle size={20} /> : aviso.tipo === 'info' ? <Info size={20} /> : <Mail size={20} />}
              </div>
              <div className="flex-1">
                <div className="flex justify-between mb-1">
                  <h3 className="font-bold text-slate-800 group-hover:text-blue-600">{aviso.titulo}</h3>
                  <span className="text-xs text-slate-400">{aviso.data}</span>
                </div>
                <p className="text-slate-600 text-sm">{aviso.msg}</p>
              </div>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
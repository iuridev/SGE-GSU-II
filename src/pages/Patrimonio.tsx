import { Sidebar } from '../components/Sidebar';
import { Header } from '../components/Header';
import { Package, Search, Tag, AlertTriangle } from 'lucide-react';

export function Patrimonio() {
  const bens = [
    { id: 1, nome: 'Computador Desktop Dell', codigo: 'PAT-2024-001', local: 'Secretaria', estado: 'Bom' },
    { id: 2, nome: 'Cadeira Giratória', codigo: 'PAT-2023-089', local: 'Sala Direção', estado: 'Regular' },
    { id: 3, nome: 'Projetor Multimídia', codigo: 'PAT-2022-150', local: 'Sala 03', estado: 'Ruim' },
    { id: 4, nome: 'Armário de Aço', codigo: 'PAT-2020-012', local: 'Arquivo', estado: 'Bom' },
  ];

  return (
    <div className="min-h-screen bg-slate-50">
      <Sidebar userRole="school_manager" />
      <Header userName="Gestor" userRole="school_manager" />

      <main className="ml-64 pt-24 p-8">
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
              <Package className="text-purple-600" /> Patrimônio
            </h1>
            <p className="text-slate-500">Gestão de bens móveis e inventário.</p>
          </div>
          <div className="flex gap-2">
             <button className="bg-slate-200 hover:bg-slate-300 text-slate-700 px-4 py-2 rounded-lg flex items-center gap-2 transition-colors font-medium">
              <AlertTriangle size={18} /> Reportar Baixa
            </button>
            <button className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg flex items-center gap-2 transition-colors font-medium">
              <Tag size={18} /> Novo Item
            </button>
          </div>
        </div>

        {/* Barra de Busca */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 mb-6 flex gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-3 text-slate-400" size={20} />
            <input type="text" placeholder="Buscar por número da plaqueta ou nome..." className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg outline-none focus:border-purple-500" />
          </div>
        </div>

        {/* Grid de Itens */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {bens.map((item) => (
            <div key={item.id} className="bg-white p-5 rounded-xl shadow-sm border border-slate-200 hover:shadow-md transition-shadow relative">
              <div className="absolute top-4 right-4">
                 <span className={`px-2 py-1 rounded text-xs font-bold uppercase ${
                   item.estado === 'Bom' ? 'bg-green-50 text-green-700' : 
                   item.estado === 'Regular' ? 'bg-yellow-50 text-yellow-700' : 'bg-red-50 text-red-700'
                 }`}>
                   {item.estado}
                 </span>
              </div>
              <div className="w-12 h-12 bg-purple-50 rounded-lg flex items-center justify-center text-purple-600 mb-4">
                <Package size={24} />
              </div>
              <h3 className="font-bold text-slate-800 mb-1">{item.nome}</h3>
              <p className="text-xs text-slate-500 font-mono mb-3 bg-slate-100 inline-block px-2 py-1 rounded">{item.codigo}</p>
              <p className="text-sm text-slate-600 flex items-center gap-1">📍 {item.local}</p>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
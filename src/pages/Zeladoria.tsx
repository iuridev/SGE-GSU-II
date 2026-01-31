import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Search, Home, Filter, AlertTriangle, CheckCircle, Clock, FileText, Download, ChevronLeft, ChevronRight } from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

import { Sidebar } from '../components/Sidebar';
import { Header } from '../components/Header';

export function Zeladoria() {
  const [zeladorias, setZeladorias] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtro, setFiltro] = useState('');
  const [filtroStatus, setFiltroStatus] = useState('TODOS');
  const [paginaAtual, setPaginaAtual] = useState(1);
  const itensPorPagina = 100;

  useEffect(() => {
    carregarDados();
  }, []);

  async function carregarDados() {
    const { data } = await supabase.from('zeladorias').select('*').order('nome');
    if (data) setZeladorias(data);
    setLoading(false);
  }

  const getStatusColor = (ocupada: string, validade: string) => {
    const status = ocupada?.toUpperCase() || '';
    if (validade && new Date(validade) < new Date()) return 'bg-red-100 text-red-700 border-red-200';
    if (status.includes('VENCIDO')) return 'bg-red-100 text-red-700 border-red-200';
    if (status.includes('SIM') || status.includes('CIÊNCIA')) return 'bg-green-100 text-green-700 border-green-200';
    if (status.includes('NÃO') || status.includes('VAZIA') || status.includes('POSSUI')) return 'bg-slate-100 text-slate-500 border-slate-200';
    if (status.includes('CASA CIVIL') || status.includes('ANÁLISE') || status.includes('PGE')) return 'bg-yellow-100 text-yellow-700 border-yellow-200';
    return 'bg-blue-50 text-blue-700 border-blue-100';
  };

  const listaFiltrada = zeladorias.filter(item => {
    const termo = filtro.toLowerCase();
    const matchTexto = 
      item.nome?.toLowerCase().includes(termo) ||
      item.zelador?.toLowerCase().includes(termo) ||
      item.ue?.toLowerCase().includes(termo);

    if (filtroStatus === 'TODOS') return matchTexto;
    if (filtroStatus === 'VENCIDOS') {
        const dataVencida = item.validade && new Date(item.validade) < new Date();
        const statusVencido = item.ocupada?.toUpperCase().includes('VENCIDO');
        return matchTexto && (dataVencida || statusVencido);
    }
    return matchTexto;
  });

  const indexUltimoItem = paginaAtual * itensPorPagina;
  const indexPrimeiroItem = indexUltimoItem - itensPorPagina;
  const itensAtuais = listaFiltrada.slice(indexPrimeiroItem, indexUltimoItem);
  const totalPaginas = Math.ceil(listaFiltrada.length / itensPorPagina);

  const gerarPDF = () => {
    const doc = new jsPDF();
    doc.text("Relatório de Ocupação de Zeladorias - SGE-GSU", 14, 15);
    doc.setFontSize(10);
    doc.text(`Gerado em: ${new Date().toLocaleDateString('pt-BR')} | Total: ${listaFiltrada.length} registros`, 14, 22);
    autoTable(doc, {
      startY: 25,
      head: [['UE', 'Escola', 'Status', 'Ocupante', 'Processo SEI', 'Validade']],
      body: listaFiltrada.map(item => [
        item.ue,
        item.nome,
        item.ocupada,
        item.zelador || '-',
        item.sei_numero || '-',
        item.validade ? new Date(item.validade).toLocaleDateString('pt-BR') : '-'
      ]),
      styles: { fontSize: 8 },
      headStyles: { fillColor: [41, 128, 185] },
    });
    doc.save('relatorio-zeladorias.pdf');
  };

  return (
    <div className="flex h-screen w-screen bg-slate-50 overflow-hidden">
      
      {/* Sidebar à Esquerda */}
      <Sidebar userRole="admin" />

      {/* Container Direita */}
      <div className="flex-1 flex flex-col h-full relative overflow-hidden">
        
        {/* Header no Topo (Se for fixed, ele flutua aqui) */}
        <Header userName="Iuri Barreto" userRole="admin" />

        {/* CORREÇÃO AQUI: Adicionei 'pt-24' (padding-top 96px) 
            Isso empurra o conteúdo para baixo, saindo de trás do Header 
        */}
        <main className="flex-1 overflow-y-auto p-4 md:p-8 pt-24 scroll-smooth">
          <div className="max-w-[1920px] mx-auto">
            
            {/* Título e Botões */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4 bg-white p-4 rounded-xl border border-slate-100 shadow-sm">
              <div>
                <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
                  <Home className="text-blue-600" />
                  Painel de Zeladorias
                </h1>
                <p className="text-slate-500 text-sm mt-1">Gestão de Ocupação e Contratos (Base SEFISC)</p>
              </div>

              <div className="flex flex-wrap gap-3 items-center w-full md:w-auto">
                <button 
                  onClick={gerarPDF}
                  className="flex items-center justify-center gap-2 bg-red-600 hover:bg-red-700 text-white px-4 py-2.5 rounded-lg text-sm font-medium transition-colors shadow-sm w-full md:w-auto"
                >
                  <Download size={16} />
                  <span>PDF</span>
                </button>

                <div className="bg-slate-50 border rounded-lg flex items-center px-3 py-2.5 w-full md:w-72 shadow-inner focus-within:ring-2 ring-blue-100 transition-all">
                    <Search size={18} className="text-slate-400 mr-2" />
                    <input 
                      placeholder="Buscar escola, zelador ou UE..." 
                      className="outline-none text-sm w-full bg-transparent"
                      value={filtro}
                      onChange={e => {
                          setFiltro(e.target.value);
                          setPaginaAtual(1);
                      }}
                    />
                </div>
              </div>
            </div>

            {/* Tabela */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden flex flex-col">
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left whitespace-nowrap">
                  <thead className="bg-slate-50 text-slate-600 font-bold border-b text-xs uppercase tracking-wider">
                    <tr>
                      <th className="p-4 w-16 text-center">UE</th>
                      <th className="p-4">Escola / Unidade</th>
                      <th className="p-4">Status</th>
                      <th className="p-4">Zelador (Ocupante)</th>
                      <th className="p-4">Processo SEI</th>
                      <th className="p-4">Validade</th>
                      <th className="p-4">DARE</th>
                      <th className="p-4">Observações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {loading ? (
                      <tr><td colSpan={8} className="p-12 text-center text-slate-500 animate-pulse">Carregando dados do sistema...</td></tr>
                    ) : itensAtuais.length === 0 ? (
                      <tr><td colSpan={8} className="p-12 text-center text-slate-500">Nenhum registro encontrado para a busca.</td></tr>
                    ) : itensAtuais.map((item) => (
                      <tr key={item.id} className="hover:bg-blue-50/50 transition-colors group">
                        <td className="p-4 font-mono text-slate-500 text-xs text-center border-r border-slate-50">{item.ue}</td>
                        <td className="p-4"><div className="font-bold text-slate-800">{item.nome}</div></td>
                        <td className="p-4">
                          <span className={`px-2 py-1 rounded border text-[10px] font-bold uppercase tracking-wider inline-block min-w-[80px] text-center ${getStatusColor(item.ocupada, item.validade)}`}>
                            {item.ocupada || 'N/A'}
                          </span>
                        </td>
                        <td className="p-4">
                          <div className="text-slate-700 font-medium">{item.zelador || '-'}</div>
                          {item.cargo && <div className="text-[10px] text-slate-400 uppercase mt-0.5">{item.cargo} {item.rg ? `• RG: ${item.rg}` : ''}</div>}
                        </td>
                        <td className="p-4">
                          {item.sei_numero ? (
                            <div className="flex items-center gap-1 bg-slate-100 w-fit px-2 py-1 rounded text-xs font-mono text-slate-600 border border-slate-200">
                                <FileText size={12}/>{item.sei_numero}
                            </div>
                          ) : <span className="text-slate-300">-</span>}
                        </td>
                        <td className="p-4">
                          {item.validade ? (
                              <div className={`flex items-center gap-1 font-medium ${new Date(item.validade) < new Date() ? 'text-red-600 bg-red-50 px-2 py-1 rounded' : 'text-slate-600'}`}>
                                  {new Date(item.validade) < new Date() && <AlertTriangle size={14} />}
                                  {new Date(item.validade).toLocaleDateString('pt-BR')}
                              </div>
                          ) : (<span className="text-slate-300">-</span>)}
                        </td>
                        <td className="p-4 text-xs">
                          {item.dare?.includes('Isento') ? (
                              <span className="text-green-600 font-bold flex items-center gap-1 bg-green-50 px-2 py-1 rounded w-fit"><CheckCircle size={12}/> Isento</span>
                          ) : (<span className="text-slate-500">{item.dare || '-'}</span>)}
                        </td>
                        <td className="p-4 max-w-[200px] truncate text-xs text-slate-500" title={item.obs_sefisc}>{item.obs_sefisc || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Paginação */}
              <div className="bg-white p-4 border-t flex items-center justify-between text-xs text-slate-500 sticky bottom-0 z-10">
                  <div>
                      Mostrando <span className="font-bold text-slate-800">{indexPrimeiroItem + 1}</span> a <span className="font-bold text-slate-800">{Math.min(indexUltimoItem, listaFiltrada.length)}</span> de <span className="font-bold text-slate-800">{listaFiltrada.length}</span>
                  </div>
                  
                  {totalPaginas > 1 && (
                      <div className="flex items-center gap-2">
                          <button 
                              onClick={() => setPaginaAtual(p => Math.max(1, p - 1))}
                              disabled={paginaAtual === 1}
                              className="p-2 rounded-lg border hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                          >
                              <ChevronLeft size={16} />
                          </button>
                          <span className="font-medium px-2">Página {paginaAtual} de {totalPaginas}</span>
                          <button 
                              onClick={() => setPaginaAtual(p => Math.min(totalPaginas, p + 1))}
                              disabled={paginaAtual === totalPaginas}
                              className="p-2 rounded-lg border hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                          >
                              <ChevronRight size={16} />
                          </button>
                      </div>
                  )}
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
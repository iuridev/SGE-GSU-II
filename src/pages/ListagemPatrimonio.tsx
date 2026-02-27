import { useState, useEffect } from 'react';
import { Search, FileSpreadsheet, FileText, Building, Package, Hash, Loader2, AlertCircle, FilterX } from 'lucide-react';
import { supabase } from '../lib/supabase';
import Papa from 'papaparse';

// Definimos o formato do item de patrimônio
interface ItemPatrimonio {
  id: string; // Ex: GSU-1
  descricao: string;
  escola: string;
  nf: string;
  valor: string;
}

export default function ListagemPatrimonio() {
  const [itens, setItens] = useState<ItemPatrimonio[]>([]);
  const [escolas, setEscolas] = useState<string[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [buscaRealizada, setBuscaRealizada] = useState(false);

  // Estados dos Filtros
  const [filtroId, setFiltroId] = useState('');
  const [filtroDescricao, setFiltroDescricao] = useState('');
  const [filtroEscola, setFiltroEscola] = useState('');

  // Carrega apenas os nomes das escolas do Supabase ao abrir a tela (para o dropdown)
  useEffect(() => {
    async function fetchEscolas() {
      try {
        const { data: escolasData } = await supabase.from('schools').select('name').order('name');
        if (escolasData) {
          setEscolas(escolasData.map((e: any) => e.name));
        }
      } catch (err) {
        console.error("Erro ao carregar lista de escolas:", err);
      }
    }
    fetchEscolas();
  }, []);

  // ---------------------------------------------------------
  // MÁGICA DE ALTA PERFORMANCE: Filtragem durante a leitura
  // ---------------------------------------------------------
  const buscarDados = () => {
    // 1. Obriga o preenchimento de pelo menos um filtro
    if (!filtroId.trim() && !filtroDescricao.trim() && !filtroEscola.trim()) {
      setErro("Por favor, preencha pelo menos um dos filtros (Nº, Item ou Escola) para realizar a busca.");
      return;
    }

    setErro(null);
    setCarregando(true);
    setBuscaRealizada(true);
    setItens([]); // Limpa a tabela antes de começar a nova busca

    const GOOGLE_SHEET_CSV_URL = "https://docs.google.com/spreadsheets/d/12y3vNtkcw34T6t1mafdFvuBG--vDZM4dDXlaQ5dvvRE/export?format=csv";

    let itensEncontrados: ItemPatrimonio[] = [];

    Papa.parse(GOOGLE_SHEET_CSV_URL, {
      download: true,
      header: true,
      skipEmptyLines: true,
      worker: true, // Usa um núcleo separado do processador para não travar a tela
      
      // O 'chunk' lê o arquivo gigante em pequenos lotes
      chunk: (results) => {
        const dados = results.data as any[];
        
        // FILTRA IMEDIATAMENTE e descarta o que não serve para poupar memória
        const filtrados = dados.filter((row) => {
          const idStr = (row['Nº PATRIMÔNIO'] || '').toString().toLowerCase();
          const descStr = (row['DESCRIÇÃO ITEM'] || '').toString().toLowerCase();
          const escStr = (row['ESCOLA'] || '').toString();

          const bateId = filtroId ? idStr.includes(filtroId.toLowerCase()) : true;
          const bateDesc = filtroDescricao ? descStr.includes(filtroDescricao.toLowerCase()) : true;
          const bateEscola = filtroEscola ? escStr === filtroEscola : true;

          return bateId && bateDesc && bateEscola;
        }).map((row) => ({
          id: row['Nº PATRIMÔNIO'] || '-',
          descricao: row['DESCRIÇÃO ITEM'] || '-',
          escola: row['ESCOLA'] || 'Não informada',
          nf: row['NF'] || '-',
          valor: row['VALOR AQUISIÇÃO'] || '0'
        }));

        // Adiciona apenas os itens que bateram com o filtro na memória
        itensEncontrados = [...itensEncontrados, ...filtrados];
      },
      complete: () => {
        setItens(itensEncontrados.reverse()); // Exibe o resultado final
        setCarregando(false);
      },
      error: (error) => {
        console.error("Erro de conexão:", error);
        setErro("Não foi possível acessar a planilha do Google. Verifique sua conexão.");
        setCarregando(false);
      }
    });
  };

  const limparFiltros = () => {
    setFiltroId('');
    setFiltroDescricao('');
    setFiltroEscola('');
    setItens([]);
    setBuscaRealizada(false);
    setErro(null);
  };

  // Exportar para Excel (CSV)
  const exportarExcel = () => {
    if (itens.length === 0) return alert("Não há itens para exportar!");
    
    const cabecalho = "Nº PATRIMÔNIO;DESCRIÇÃO;ESCOLA;NF;VALOR\n";
    const linhas = itens.map(i => `${i.id};${i.descricao};${i.escola};${i.nf};${i.valor}`).join("\n");
    
    const blob = new Blob(["\uFEFF" + cabecalho + linhas], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = filtroEscola ? `Patrimonio_${filtroEscola}.csv` : "Patrimonio_Geral.csv";
    link.click();
  };

  // Exportar para PDF
  const exportarPDF = () => {
    window.print();
  };

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 max-w-6xl mx-auto mt-8 print:shadow-none print:border-none print:m-0 print:p-0">
      
      {/* CABEÇALHO */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end mb-6 pb-4 border-b border-slate-100 print:hidden gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <Package className="text-blue-600" /> Consulta de Patrimônio
          </h2>
          <p className="text-sm text-slate-500 mt-1">Busca otimizada conectada à Planilha Geral GSU.</p>
        </div>
        <div className="flex gap-3">
          <button onClick={exportarExcel} disabled={itens.length === 0} className="flex items-center gap-2 bg-green-600 hover:bg-green-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white px-4 py-2 rounded-lg font-semibold transition-colors">
            <FileSpreadsheet size={18} /> Excel
          </button>
          <button onClick={exportarPDF} disabled={itens.length === 0} className="flex items-center gap-2 bg-red-600 hover:bg-red-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white px-4 py-2 rounded-lg font-semibold transition-colors">
            <FileText size={18} /> PDF
          </button>
        </div>
      </div>

      {erro && (
        <div className="mb-6 p-4 bg-red-50 text-red-600 rounded-xl flex items-center gap-3 font-semibold print:hidden">
          <AlertCircle size={20} /> {erro}
        </div>
      )}

      {/* TÍTULO PARA O PDF */}
      <div className="hidden print:block mb-6 text-center">
        <h1 className="text-2xl font-bold">Relatório de Patrimônio GSU</h1>
        <p className="text-gray-600">{filtroEscola ? `Escola: ${filtroEscola}` : 'Relatório Filtrado'}</p>
      </div>

      {/* ÁREA DE FILTROS E BUSCA */}
      <div className="bg-slate-50 p-6 rounded-xl border border-slate-100 mb-6 print:hidden">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-5">
          <div>
            <label className="text-xs font-bold text-slate-600 uppercase flex items-center gap-1 mb-2">
              <Hash size={14} className="text-blue-500"/> Buscar por Nº Patrimônio
            </label>
            <input 
              type="text" placeholder="Ex: GSU-3788746"
              value={filtroId} onChange={(e) => setFiltroId(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && buscarDados()}
              className="w-full p-3 bg-white border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 transition-all font-medium text-slate-700"
            />
          </div>
          <div>
            <label className="text-xs font-bold text-slate-600 uppercase flex items-center gap-1 mb-2">
              <Search size={14} className="text-blue-500"/> Buscar por Item
            </label>
            <input 
              type="text" placeholder="Ex: Arquivo de Aço"
              value={filtroDescricao} onChange={(e) => setFiltroDescricao(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && buscarDados()}
              className="w-full p-3 bg-white border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 transition-all font-medium text-slate-700"
            />
          </div>
          <div>
            <label className="text-xs font-bold text-slate-600 uppercase flex items-center gap-1 mb-2">
              <Building size={14} className="text-blue-500"/> Filtrar por Escola
            </label>
            <select 
              value={filtroEscola} onChange={(e) => setFiltroEscola(e.target.value)}
              className="w-full p-3 bg-white border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 transition-all font-medium text-slate-700"
            >
              <option value="">Selecione uma Unidade...</option>
              {escolas.map((nome, i) => <option key={i} value={nome}>{nome}</option>)}
            </select>
          </div>
        </div>
        
        <div className="flex justify-end gap-3 pt-4 border-t border-slate-200/60">
          <button 
            onClick={limparFiltros} 
            className="flex items-center gap-2 px-6 py-3 text-slate-500 hover:bg-slate-200 bg-slate-100 rounded-xl font-bold text-sm uppercase tracking-widest transition-all"
          >
            <FilterX size={16}/> Limpar
          </button>
          <button 
            onClick={buscarDados} 
            disabled={carregando}
            className="flex items-center gap-2 px-8 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-black text-sm uppercase tracking-widest shadow-lg shadow-blue-200 transition-all active:scale-95 disabled:opacity-70"
          >
            {carregando ? <Loader2 size={18} className="animate-spin" /> : <Search size={18} />} 
            {carregando ? "Pesquisando na Planilha..." : "Buscar Patrimônio"}
          </button>
        </div>
      </div>

      {/* RESULTADO DA BUSCA */}
      {buscaRealizada && !carregando && (
        <div className="mb-4 text-xs font-bold text-slate-400 uppercase tracking-widest print:hidden px-2">
          {itens.length} registros encontrados para esta busca
        </div>
      )}

      {/* TABELA DE DADOS */}
      <div className="overflow-x-auto rounded-xl border border-slate-200 print:border-none max-h-[600px] overflow-y-auto shadow-inner bg-slate-50/50">
        <table className="w-full text-left text-sm relative">
          <thead className="bg-slate-100 text-slate-700 sticky top-0 shadow-sm print:relative z-10">
            <tr>
              <th className="p-4 font-bold border-b border-slate-200 uppercase tracking-widest text-[10px]">Nº Patrimônio</th>
              <th className="p-4 font-bold border-b border-slate-200 uppercase tracking-widest text-[10px]">Descrição do Item</th>
              <th className="p-4 font-bold border-b border-slate-200 uppercase tracking-widest text-[10px]">Escola / Unidade</th>
              <th className="p-4 font-bold border-b border-slate-200 uppercase tracking-widest text-[10px]">NF</th>
              <th className="p-4 font-bold border-b border-slate-200 uppercase tracking-widest text-[10px]">Valor Aquisição</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-slate-100">
            {carregando ? (
              <tr>
                <td colSpan={5} className="p-20 text-center print:hidden">
                  <div className="flex flex-col items-center justify-center gap-4">
                    <Loader2 size={40} className="animate-spin text-blue-500" />
                    <p className="font-bold text-slate-500 uppercase tracking-widest text-xs">Analisando milhares de registros...</p>
                  </div>
                </td>
              </tr>
            ) : !buscaRealizada ? (
              <tr>
                <td colSpan={5} className="p-20 text-center text-slate-400 print:hidden font-medium">
                  <div className="flex flex-col items-center gap-3 opacity-60">
                    <Search size={48} className="text-slate-300" />
                    <p className="text-sm">Preencha um filtro e clique em <b>Buscar</b> para carregar os dados sem travar o sistema.</p>
                  </div>
                </td>
              </tr>
            ) : itens.length > 0 ? (
              itens.map((item, index) => (
                <tr key={index} className="hover:bg-blue-50/50 transition-colors group print:border-gray-300">
                  <td className="p-4 font-black text-blue-600 whitespace-nowrap">{item.id}</td>
                  <td className="p-4 text-slate-700 font-medium">{item.descricao}</td>
                  <td className="p-4 text-slate-600 text-xs font-bold uppercase">{item.escola}</td>
                  <td className="p-4 text-slate-500">{item.nf}</td>
                  <td className="p-4 font-black text-emerald-600 whitespace-nowrap">{item.valor}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={5} className="p-16 text-center text-slate-500 print:hidden font-medium">
                  Nenhum item de patrimônio encontrado para essa busca.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* RODAPÉ DO PDF */}
      <div className="hidden print:block mt-8 text-xs text-gray-500 text-center">
        Documento gerado pelo sistema SGE-GSU-II em {new Date().toLocaleDateString('pt-BR')}
      </div>

    </div>
  );
}
import { useState, useEffect } from 'react';
import { Search, FileSpreadsheet, FileText, Building, Package, Hash } from 'lucide-react';
import { supabase } from '../lib/supabase'; // Ajuste o caminho se necessário

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

  // Estados dos Filtros
  const [filtroId, setFiltroId] = useState('');
  const [filtroDescricao, setFiltroDescricao] = useState('');
  const [filtroEscola, setFiltroEscola] = useState('');

  // Carrega as escolas do banco para o filtro
  useEffect(() => {
    async function fetchDadosReais() {
      setCarregando(true);
      
      try {
        // 1. Carrega as escolas para o filtro
        const { data: escolasData } = await supabase.from('schools').select('name').order('name');
        if (escolasData) setEscolas(escolasData.map((e: any) => e.name));

        // 2. Chama a função de leitura
        const { data, error } = await supabase.functions.invoke('ler-patrimonio-planilha');
        
        if (error) throw error;
        
        // Se a função do Supabase devolver um erro interno detalhado
        if (data && data.erroReal) {
          alert("ERRO A DEVOLVER DADOS DA PLANILHA:\n" + data.erroReal);
          return;
        }

        if (data && data.itens) {
          // Inverte a lista (reverse) para mostrar os mais recentes no topo da tabela
          setItens(data.itens.reverse());
        }
      } catch (err: any) {
        console.error("Erro geral ao buscar dados:", err);
        alert("FALHA DE LIGAÇÃO:\n" + (err.message || JSON.stringify(err)));
      } finally {
        setCarregando(false);
      }
    }

    fetchDadosReais();
  }, []);
  // Aplica os filtros na lista de itens
  const itensFiltrados = itens.filter(item => {
    const bateId = item.id.toLowerCase().includes(filtroId.toLowerCase());
    const bateDescricao = item.descricao.toLowerCase().includes(filtroDescricao.toLowerCase());
    const bateEscola = filtroEscola === '' || item.escola === filtroEscola;
    return bateId && bateDescricao && bateEscola;
  });

  // Exportar para Excel (CSV)
  const exportarExcel = () => {
    if (itensFiltrados.length === 0) return alert("Não há itens para exportar!");
    
    // Cria o cabeçalho e as linhas separadas por ponto e vírgula
    const cabecalho = "Nº PATRIMÔNIO;DESCRIÇÃO;ESCOLA;NF;VALOR\n";
    const linhas = itensFiltrados.map(i => `${i.id};${i.descricao};${i.escola};${i.nf};${i.valor}`).join("\n");
    
    const blob = new Blob(["\uFEFF" + cabecalho + linhas], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = filtroEscola ? `Patrimonio_${filtroEscola}.csv` : "Patrimonio_Geral.csv";
    link.click();
  };

  // Exportar para PDF (Abre a tela de impressão do navegador limpa)
  const exportarPDF = () => {
    window.print();
  };

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 max-w-6xl mx-auto mt-8 print:shadow-none print:border-none print:m-0 print:p-0">
      
      {/* CABEÇALHO (Escondido na hora de imprimir o PDF) */}
      <div className="flex justify-between items-end mb-6 pb-4 border-b border-slate-100 print:hidden">
        <div>
          <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <Package className="text-blue-600" /> Relatório de Patrimônio
          </h2>
          <p className="text-sm text-slate-500 mt-1">Filtre e exporte os itens cadastrados.</p>
        </div>
        <div className="flex gap-3">
          <button onClick={exportarExcel} className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg font-semibold transition-colors">
            <FileSpreadsheet size={18} /> Excel
          </button>
          <button onClick={exportarPDF} className="flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg font-semibold transition-colors">
            <FileText size={18} /> PDF
          </button>
        </div>
      </div>

      {/* TÍTULO PARA O PDF (Só aparece na impressão) */}
      <div className="hidden print:block mb-6 text-center">
        <h1 className="text-2xl font-bold">Relatório de Patrimônio GSU</h1>
        <p className="text-gray-600">{filtroEscola ? `Escola: ${filtroEscola}` : 'Todas as Escolas'}</p>
      </div>

      {/* ÁREA DE FILTROS (Escondida no PDF) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6 print:hidden bg-slate-50 p-4 rounded-xl border border-slate-100">
        <div>
          <label className="text-xs font-semibold text-slate-500 uppercase flex items-center gap-1 mb-1">
            <Hash size={14}/> Buscar por Nº Chapa
          </label>
          <input 
            type="text" placeholder="Ex: GSU-10"
            value={filtroId} onChange={(e) => setFiltroId(e.target.value)}
            className="w-full p-2 bg-white border border-slate-200 rounded-lg outline-none focus:border-blue-500"
          />
        </div>
        <div>
          <label className="text-xs font-semibold text-slate-500 uppercase flex items-center gap-1 mb-1">
            <Search size={14}/> Buscar por Item
          </label>
          <input 
            type="text" placeholder="Ex: Computador"
            value={filtroDescricao} onChange={(e) => setFiltroDescricao(e.target.value)}
            className="w-full p-2 bg-white border border-slate-200 rounded-lg outline-none focus:border-blue-500"
          />
        </div>
        <div>
          <label className="text-xs font-semibold text-slate-500 uppercase flex items-center gap-1 mb-1">
            <Building size={14}/> Filtrar por Escola
          </label>
          <select 
            value={filtroEscola} onChange={(e) => setFiltroEscola(e.target.value)}
            className="w-full p-2 bg-white border border-slate-200 rounded-lg outline-none focus:border-blue-500"
          >
            <option value="">Todas as Escolas</option>
            {escolas.map((nome, i) => <option key={i} value={nome}>{nome}</option>)}
          </select>
        </div>
      </div>

      {/* TABELA DE DADOS */}
      <div className="overflow-x-auto rounded-lg border border-slate-200 print:border-none">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-slate-600 print:bg-gray-100">
            <tr>
              <th className="p-3 font-semibold border-b border-slate-200">Nº Patrimônio</th>
              <th className="p-3 font-semibold border-b border-slate-200">Descrição do Item</th>
              <th className="p-3 font-semibold border-b border-slate-200">Escola / Unidade</th>
              <th className="p-3 font-semibold border-b border-slate-200">NF</th>
              <th className="p-3 font-semibold border-b border-slate-200">Valor (R$)</th>
            </tr>
          </thead>
          <tbody>
            {itensFiltrados.length > 0 ? (
              itensFiltrados.map((item, index) => (
                <tr key={index} className="border-b border-slate-100 hover:bg-slate-50 print:border-gray-300">
                  <td className="p-3 font-medium text-blue-600">{item.id}</td>
                  <td className="p-3 text-slate-800">{item.descricao}</td>
                  <td className="p-3 text-slate-600">{item.escola}</td>
                  <td className="p-3 text-slate-600">{item.nf}</td>
                  <td className="p-3 text-slate-800">
                    R$ {parseFloat(item.valor).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={5} className="p-8 text-center text-slate-500 print:hidden">
                  {carregando ? "Sincronizando com a Planilha..." : "Nenhum item encontrado com esses filtros."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* RODAPÉ DO PDF (Só aparece na impressão) */}
      <div className="hidden print:block mt-8 text-xs text-gray-500 text-center">
        Documento gerado pelo sistema SGE-GSU-II em {new Date().toLocaleDateString('pt-BR')}
      </div>

    </div>
  );
}
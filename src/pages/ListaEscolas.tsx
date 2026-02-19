import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Download, Search, School, Loader2 } from 'lucide-react';

interface SchoolData {
  id: string;
  name: string;
  cie_code: string;
  fde_code: string;
}

export default function ListaEscolas() {
  const [schools, setSchools] = useState<SchoolData[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    fetchSchools();
  }, []);

  const fetchSchools = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('schools')
        .select('id, name, cie_code, fde_code')
        .order('name', { ascending: true });

      if (error) throw error;

      if (data) {
        setSchools(data);
      }
    } catch (error) {
      console.error('Erro ao buscar escolas:', error);
    } finally {
      setLoading(false);
    }
  };

  const filteredSchools = schools.filter(school =>
    school.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (school.cie_code && school.cie_code.includes(searchTerm)) ||
    (school.fde_code && school.fde_code.includes(searchTerm))
  );

  const exportToExcel = () => {
    // Cabeçalho do CSV
    const headers = ['Nome da Escola', 'CIE', 'Código FDE'];
    
    // Dados formatados
    const csvContent = [
      headers.join(';'), // Usando ponto e vírgula para melhor compatibilidade com Excel em PT-BR
      ...filteredSchools.map(school => 
        `"${school.name}";"${school.cie_code || ''}";"${school.fde_code || ''}"`
      )
    ].join('\n');

    // Criação do Blob e Download
    const blob = new Blob([`\ufeff${csvContent}`], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `lista_escolas_${new Date().toLocaleDateString('pt-BR').replace(/\//g, '-')}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="p-6">
      <div className="flex flex-col md:flex-row justify-between items-center mb-6 gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
            <School className="w-8 h-8 text-blue-600" />
            Lista Geral de Escolas
          </h1>
          <p className="text-gray-600 mt-1">
            Visualização administrativa de todas as unidades cadastradas.
          </p>
        </div>

        <button
          onClick={exportToExcel}
          className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg transition-colors shadow-sm"
          title="Exportar listagem atual para Excel"
        >
          <Download className="w-5 h-5" />
          Exportar Excel
        </button>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        {/* Barra de Pesquisa */}
        <div className="p-4 border-b border-gray-200 bg-gray-50">
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
            <input
              type="text"
              placeholder="Buscar por nome, CIE ou FDE..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
            />
          </div>
        </div>

        {/* Tabela */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-gray-100 text-gray-700 text-sm font-semibold uppercase tracking-wider">
                <th className="p-4 border-b border-gray-200">Nome da Escola</th>
                <th className="p-4 border-b border-gray-200 w-32">CIE</th>
                <th className="p-4 border-b border-gray-200 w-32">Código FDE</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {loading ? (
                <tr>
                  <td colSpan={3} className="p-8 text-center text-gray-500">
                    <div className="flex justify-center items-center gap-2">
                      <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
                      Carregando dados...
                    </div>
                  </td>
                </tr>
              ) : filteredSchools.length > 0 ? (
                filteredSchools.map((school) => (
                  <tr 
                    key={school.id} 
                    className="hover:bg-blue-50 transition-colors"
                  >
                    <td className="p-4 font-medium text-gray-900">{school.name}</td>
                    <td className="p-4 text-gray-600 font-mono text-sm">{school.cie_code || '-'}</td>
                    <td className="p-4 text-gray-600 font-mono text-sm">{school.fde_code || '-'}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={3} className="p-8 text-center text-gray-500">
                    Nenhuma escola encontrada.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        
        {/* Rodapé da Tabela */}
        <div className="p-4 border-t border-gray-200 bg-gray-50 text-sm text-gray-600 flex justify-between items-center">
          <span>
            Total de registros: <strong>{filteredSchools.length}</strong>
          </span>
          {!loading && filteredSchools.length !== schools.length && (
            <span className="text-gray-400">
              (Filtrado de {schools.length} escolas)
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
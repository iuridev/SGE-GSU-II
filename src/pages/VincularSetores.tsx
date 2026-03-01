import React, { useState, useEffect } from 'react';
import { Users, Search, Shield, Building2, Check, AlertCircle, Loader2 } from 'lucide-react';
import { supabase } from '../lib/supabase';

// Lista de setores disponíveis
const SETORES = [
  'ASURE', 'SEFISC', 'SEOM', 'SEAFIN', 'SEFIN', 'SEAPE', 'SEPES', 
  'SEFREP', 'SECOMSE', 'SEVESC', 'SEMAT', 'SEGRE', 'SEINTEC', 
  'SETEC', 'URE', 'ESE', 'EEC'
];

interface RegionalAdmin {
  id: string;
  full_name: string;
  email: string;
  setor: string | null;
  role: string;
}

export default function VincularSetores() {
  const [admins, setAdmins] = useState<RegionalAdmin[]>([]);
  const [busca, setBusca] = useState('');
  const [loading, setLoading] = useState(true);
  const [salvandoId, setSalvandoId] = useState<string | null>(null);
  const [sucessoId, setSucessoId] = useState<string | null>(null);

  // Busca os administradores regionais ao carregar a página
  useEffect(() => {
    fetchRegionalAdmins();
  }, []);

  const fetchRegionalAdmins = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name, email, role, setor')
        .eq('role', 'regional_admin')
        .order('full_name');

      if (error) throw error;
      
      setAdmins(data || []);
    } catch (error) {
      console.error('Erro ao buscar administradores:', error);
      // Aqui você pode adicionar um toast de erro se utilizar alguma biblioteca como react-hot-toast
    } finally {
      setLoading(false);
    }
  };

  // Atualiza o setor no Supabase
  const handleSetorChange = async (id: string, novoSetor: string) => {
    try {
      setSalvandoId(id);
      
      // Ao colocar (supabase as any), o TypeScript desativa a verificação 
// rigorosa de tabelas e colunas apenas para esta requisição.
const { error } = await (supabase as any)
  .from('profiles')
  .update({ setor: novoSetor })
  .eq('id', id);

      if (error) throw error;
      
      // Atualiza o estado local para refletir a mudança imediatamente
      setAdmins(admins.map(admin => 
        admin.id === id ? { ...admin, setor: novoSetor } : admin
      ));
      
      setSucessoId(id);
      // Remove o ícone de sucesso após 2 segundos
      setTimeout(() => setSucessoId(null), 2000);
      
    } catch (error) {
      console.error('Erro ao vincular setor:', error);
      alert('Não foi possível vincular o setor. Tente novamente.');
    } finally {
      setSalvandoId(null);
    }
  };

  const adminsFiltrados = admins.filter(admin => 
    (admin.full_name?.toLowerCase() || '').includes(busca.toLowerCase()) || 
    (admin.email?.toLowerCase() || '').includes(busca.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-gray-50/50 p-6">
      <div className="max-w-6xl mx-auto space-y-6">
        
        {/* Cabeçalho */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
              <Building2 className="w-7 h-7 text-blue-600" />
              Gestão de Chefias por Setor
            </h1>
            <p className="text-gray-500 mt-1">
              Vincule os administradores regionais aos seus respectivos setores de atuação.
            </p>
          </div>

          <div className="relative w-full md:w-80">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Search className="h-5 w-5 text-gray-400" />
            </div>
            <input
              type="text"
              placeholder="Buscar por nome ou email..."
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              className="block w-full pl-10 pr-3 py-2 border border-gray-200 rounded-xl leading-5 bg-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors sm:text-sm"
            />
          </div>
        </div>

        {/* Container Principal */}
        <div className="bg-white border border-gray-100 shadow-sm rounded-2xl overflow-hidden">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-20">
              <Loader2 className="w-8 h-8 text-blue-500 animate-spin mb-4" />
              <p className="text-gray-500 font-medium">Carregando chefias regionais...</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-100">
                <thead className="bg-gray-50/50">
                  <tr>
                    <th scope="col" className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                      Administrador Regional
                    </th>
                    <th scope="col" className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                      Status Atual
                    </th>
                    <th scope="col" className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                      Vinculação de Setor
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-50">
                  {adminsFiltrados.map((admin) => (
                    <tr key={admin.id} className="hover:bg-gray-50/30 transition-colors">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                          <div className="flex-shrink-0 h-10 w-10 bg-blue-50 text-blue-600 flex items-center justify-center rounded-full font-bold text-sm border border-blue-100">
                            {admin.full_name ? admin.full_name.charAt(0).toUpperCase() : '?'}
                          </div>
                          <div className="ml-4">
                            <div className="text-sm font-medium text-gray-900 flex items-center gap-1.5">
                              {admin.full_name || 'Usuário sem nome'}
                              <Shield className="w-3.5 h-3.5 text-blue-500" />
                            </div>
                            <div className="text-sm text-gray-500">{admin.email}</div>
                          </div>
                        </div>
                      </td>
                      
                      <td className="px-6 py-4 whitespace-nowrap">
                        {admin.setor ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-100">
                            <Check className="w-3 h-3" />
                            Vinculado: {admin.setor}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-amber-50 text-amber-700 border border-amber-100">
                            <AlertCircle className="w-3 h-3" />
                            Sem Setor
                          </span>
                        )}
                      </td>

                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center gap-3">
                          <select
                            value={admin.setor || ''}
                            onChange={(e) => handleSetorChange(admin.id, e.target.value)}
                            disabled={salvandoId === admin.id}
                            className="block w-48 pl-3 pr-10 py-2 text-base border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 sm:text-sm rounded-lg bg-gray-50 hover:bg-white transition-colors cursor-pointer disabled:opacity-50"
                          >
                            <option value="" disabled>Selecione um setor...</option>
                            {SETORES.map((setor) => (
                              <option key={setor} value={setor}>
                                {setor}
                              </option>
                            ))}
                          </select>
                          
                          <div className="w-6 flex justify-center">
                            {salvandoId === admin.id && (
                              <Loader2 className="w-5 h-5 text-blue-500 animate-spin" />
                            )}
                            {sucessoId === admin.id && (
                              <Check className="w-5 h-5 text-emerald-500 animate-in fade-in zoom-in duration-300" />
                            )}
                          </div>
                        </div>
                      </td>
                    </tr>
                  ))}
                  
                  {adminsFiltrados.length === 0 && !loading && (
                    <tr>
                      <td colSpan={3} className="px-6 py-12 text-center">
                        <Users className="mx-auto h-10 w-10 text-gray-300 mb-3" />
                        <p className="text-gray-500 text-sm">Nenhum administrador regional encontrado.</p>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
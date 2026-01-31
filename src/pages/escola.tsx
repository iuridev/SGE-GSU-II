import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Sidebar } from '../components/Sidebar';
import { Header } from '../components/Header';
import { 
  School, 
  Save, 
  Loader2, 
  MapPin, 
  Users, 
  Zap, 
  Droplet, 
  FileText, 
  AlertTriangle,
  CheckCircle,
  Search,
  Plus,
  Edit,
  Trash2,
  ArrowLeft
} from 'lucide-react';

// Interface baseada na estrutura do banco de dados fornecida
interface SchoolForm {
  id?: string; // Opcional para novos, obrigatório para edição
  name: string;
  email: string;
  phone: string;
  address: string;
  zip_code: string;
  director_name: string;
  manager_name: string;
  fde_code: string;
  edp_installation_id: string;
  sabesp_supply_id: string;
  student_count: number;
  teacher_count: number;
}

export function Escola() {
  // Estados de Autenticação e UI
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [userRole, setUserRole] = useState<string>("");
  const [userName, setUserName] = useState<string>("Usuário");
  const [accessDenied, setAccessDenied] = useState(false);
  
  // Estado de Navegação (Lista vs Formulário)
  const [view, setView] = useState<'list' | 'form'>('list');
  const [schools, setSchools] = useState<SchoolForm[]>([]);
  const [searchTerm, setSearchTerm] = useState("");

  // Estado de Mensagens
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

  // Estado do Formulário
  const initialFormState: SchoolForm = {
    name: '',
    email: '',
    phone: '',
    address: '',
    zip_code: '',
    director_name: '',
    manager_name: '',
    fde_code: '',
    edp_installation_id: '',
    sabesp_supply_id: '',
    student_count: 0,
    teacher_count: 0
  };

  const [formData, setFormData] = useState<SchoolForm>(initialFormState);
  const [isEditing, setIsEditing] = useState(false);

  // Verificar permissões e carregar dados
  useEffect(() => {
    checkPermissionsAndFetch();
  }, []);

  async function checkPermissionsAndFetch() {
    try {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        setAccessDenied(true);
        setLoading(false);
        return;
      }

      setUserName(user.user_metadata?.full_name || user.email?.split('@')[0] || "Usuário");

      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single();

      // Cast 'as any' para evitar erro de propriedade 'role' inexistente
      const role = (profile as any)?.role || '';
      setUserRole(role);

      // Bloquear se não for admin
      if (role !== 'regional_admin') {
        setAccessDenied(true);
      } else {
        await fetchSchools(); // Carregar escolas se for admin
      }

    } catch (error) {
      console.error("Erro ao verificar permissões:", error);
      setAccessDenied(true);
    } finally {
      setLoading(false);
    }
  }

  async function fetchSchools() {
    try {
      // Cast 'as any' para evitar erro de tabela desconhecida
      const { data, error } = await (supabase
        .from('schools') as any)
        .select('*')
        .order('name', { ascending: true });

      if (error) throw error;
      setSchools(data || []);
    } catch (error) {
      console.error("Erro ao buscar escolas:", error);
    }
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: name.includes('count') ? Number(value) : value
    }));
  };

  const handleEdit = (school: SchoolForm) => {
    setFormData(school);
    setIsEditing(true);
    setView('form');
    setMessage(null);
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm("Tem certeza que deseja excluir esta escola?")) return;

    try {
      setLoading(true);
      // Cast 'as any' para delete
      const { error } = await (supabase
        .from('schools') as any)
        .delete()
        .eq('id', id);

      if (error) throw error;

      setMessage({ type: 'success', text: 'Escola excluída com sucesso!' });
      fetchSchools(); // Recarregar lista
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || "Erro ao excluir escola." });
    } finally {
      setLoading(false);
    }
  };

  const handleNewSchool = () => {
    setFormData(initialFormState);
    setIsEditing(false);
    setView('form');
    setMessage(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setMessage(null);

    try {
      if (!formData.name.trim()) {
        throw new Error("O nome da escola é obrigatório.");
      }

      let error;
      
      if (isEditing && formData.id) {
        // Atualizar - Cast 'as any'
        const { error: updateError } = await (supabase
          .from('schools') as any)
          .update(formData)
          .eq('id', formData.id);
        error = updateError;
      } else {
        // Criar Novo (Remover ID se existir vazio) - Cast 'as any'
        const { id, ...newSchoolData } = formData;
        const { error: insertError } = await (supabase
          .from('schools') as any)
          .insert([newSchoolData]);
        error = insertError;
      }

      if (error) throw error;

      setMessage({ type: 'success', text: `Escola ${isEditing ? 'atualizada' : 'cadastrada'} com sucesso!` });
      
      if (!isEditing) {
        setFormData(initialFormState);
      }
      
      // Voltar para o topo para ver a mensagem
      window.scrollTo(0, 0);

    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || "Erro ao salvar escola." });
    } finally {
      setSubmitting(false);
    }
  };

  // Filtragem da lista
  const filteredSchools = schools.filter(school => 
    school.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (school.director_name && school.director_name.toLowerCase().includes(searchTerm.toLowerCase())) ||
    (school.fde_code && school.fde_code.includes(searchTerm))
  );

  if (loading && schools.length === 0) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-50">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  // Tela de Acesso Negado
  if (accessDenied) {
    return (
      <div className="flex min-h-screen bg-gray-50">
        <Sidebar userRole={userRole} />
        <div className="flex-1 flex flex-col min-h-screen">
          <Header userName={userName} userRole={userRole} />
          <div className="flex-1 flex items-center justify-center p-6">
            <div className="text-center bg-white p-8 rounded-xl shadow-lg border border-red-100 max-w-md">
              <div className="bg-red-100 p-4 rounded-full w-16 h-16 flex items-center justify-center mx-auto mb-4">
                <AlertTriangle className="w-8 h-8 text-red-600" />
              </div>
              <h2 className="text-xl font-bold text-gray-800 mb-2">Acesso Restrito</h2>
              <p className="text-gray-600">
                Apenas administradores regionais podem acessar o cadastro de escolas.
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-gray-50 font-sans">
      <Sidebar userRole={userRole} />
      
      <div className="flex-1 flex flex-col min-h-screen overflow-hidden">
        <Header userName={userName} userRole={userRole} />
        
        <main className="flex-1 overflow-y-auto p-6 md:p-8">
          <div className="max-w-6xl mx-auto">
            
            {/* Cabeçalho da Página */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
              <div>
                <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
                  <School className="text-blue-600" />
                  Gestão de Escolas
                </h1>
                <p className="text-gray-500 mt-1">Administração das unidades escolares da regional</p>
              </div>
              
              {view === 'list' ? (
                <button 
                  onClick={handleNewSchool}
                  className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg shadow-sm flex items-center gap-2 transition-colors"
                >
                  <Plus size={20} /> Nova Escola
                </button>
              ) : (
                <button 
                  onClick={() => { setView('list'); fetchSchools(); }}
                  className="bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 px-4 py-2 rounded-lg shadow-sm flex items-center gap-2 transition-colors"
                >
                  <ArrowLeft size={20} /> Voltar para Lista
                </button>
              )}
            </div>

            {message && (
              <div className={`p-4 rounded-lg mb-6 flex items-center gap-3 ${
                message.type === 'success' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'
              }`}>
                {message.type === 'success' ? <CheckCircle size={20} /> : <AlertTriangle size={20} />}
                <span className="font-medium">{message.text}</span>
              </div>
            )}

            {/* CONTEÚDO PRINCIPAL: Alterna entre LISTA e FORMULÁRIO */}
            
            {view === 'list' ? (
              // --- VISTA: LISTA DE ESCOLAS ---
              <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                {/* Barra de Filtros */}
                <div className="p-4 border-b border-gray-100 flex flex-col sm:flex-row gap-4 justify-between items-center bg-gray-50">
                  <div className="relative w-full sm:w-96">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={18} />
                    <input 
                      type="text" 
                      placeholder="Buscar por nome, diretor ou código FDE..." 
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                  <div className="text-sm text-gray-500">
                    <strong>{filteredSchools.length}</strong> escolas encontradas
                  </div>
                </div>

                {/* Tabela */}
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-gray-50 text-xs font-semibold tracking-wide text-gray-500 uppercase border-b border-gray-200">
                        <th className="px-6 py-4">Nome da Escola</th>
                        <th className="px-6 py-4">Cód. FDE</th>
                        <th className="px-6 py-4">Diretor</th>
                        <th className="px-6 py-4">Contato</th>
                        <th className="px-6 py-4 text-center">Ações</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {filteredSchools.length > 0 ? (
                        filteredSchools.map((school) => (
                          <tr key={school.id} className="hover:bg-blue-50/50 transition-colors group">
                            <td className="px-6 py-4">
                              <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded bg-blue-100 text-blue-600 flex items-center justify-center font-bold text-xs">
                                  {school.name.charAt(0)}
                                </div>
                                <div>
                                  <p className="font-medium text-gray-900 line-clamp-1">{school.name}</p>
                                  <p className="text-xs text-gray-500 truncate max-w-[200px]">{school.address || "Sem endereço"}</p>
                                </div>
                              </div>
                            </td>
                            <td className="px-6 py-4 text-sm text-gray-600 font-mono">
                              {school.fde_code || "-"}
                            </td>
                            <td className="px-6 py-4 text-sm text-gray-700">
                              {school.director_name || "-"}
                            </td>
                            <td className="px-6 py-4 text-sm text-gray-600">
                              <div>{school.email}</div>
                              <div className="text-xs text-gray-400">{school.phone}</div>
                            </td>
                            <td className="px-6 py-4 text-center">
                              <div className="flex items-center justify-center gap-2">
                                <button 
                                  onClick={() => handleEdit(school)}
                                  className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-full transition-colors"
                                  title="Editar"
                                >
                                  <Edit size={18} />
                                </button>
                                <button 
                                  onClick={() => school.id && handleDelete(school.id)}
                                  className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-full transition-colors"
                                  title="Excluir"
                                >
                                  <Trash2 size={18} />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={5} className="px-6 py-12 text-center text-gray-500">
                            {searchTerm ? "Nenhuma escola encontrada para a busca." : "Nenhuma escola cadastrada ainda."}
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              // --- VISTA: FORMULÁRIO (Cadastro/Edição) ---
              <form onSubmit={handleSubmit} className="space-y-6">
                
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6 flex items-center justify-between">
                  <div>
                    <h3 className="text-blue-800 font-bold text-lg">{isEditing ? 'Editar Escola' : 'Nova Escola'}</h3>
                    <p className="text-blue-600 text-sm">Preencha os dados abaixo para {isEditing ? 'atualizar' : 'cadastrar'} a unidade.</p>
                  </div>
                  <School className="text-blue-300 w-12 h-12 opacity-50" />
                </div>

                {/* Seção 1: Informações Básicas */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                  <div className="bg-gray-50 px-6 py-3 border-b border-gray-100 flex items-center gap-2">
                    <FileText className="w-4 h-4 text-gray-500" />
                    <h3 className="font-semibold text-gray-700 text-sm uppercase tracking-wide">Dados Básicos</h3>
                  </div>
                  <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="md:col-span-2">
                      <label className="block text-sm font-medium text-gray-700 mb-1">Nome da Escola *</label>
                      <input
                        type="text"
                        name="name"
                        required
                        value={formData.name}
                        onChange={handleChange}
                        placeholder="Ex: E.E. PROFESSOR JOÃO DA SILVA"
                        className="w-full p-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">E-mail Institucional</label>
                      <input
                        type="email"
                        name="email"
                        value={formData.email}
                        onChange={handleChange}
                        placeholder="escola@educacao.sp.gov.br"
                        className="w-full p-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Telefone</label>
                      <input
                        type="text"
                        name="phone"
                        value={formData.phone}
                        onChange={handleChange}
                        placeholder="(11) 0000-0000"
                        className="w-full p-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                      />
                    </div>
                  </div>
                </div>

                {/* Seção 2: Localização */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                  <div className="bg-gray-50 px-6 py-3 border-b border-gray-100 flex items-center gap-2">
                    <MapPin className="w-4 h-4 text-gray-500" />
                    <h3 className="font-semibold text-gray-700 text-sm uppercase tracking-wide">Localização</h3>
                  </div>
                  <div className="p-6 grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="md:col-span-2">
                      <label className="block text-sm font-medium text-gray-700 mb-1">Endereço Completo</label>
                      <input
                        type="text"
                        name="address"
                        value={formData.address}
                        onChange={handleChange}
                        placeholder="Rua, Número, Bairro"
                        className="w-full p-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">CEP</label>
                      <input
                        type="text"
                        name="zip_code"
                        value={formData.zip_code}
                        onChange={handleChange}
                        placeholder="00000-000"
                        className="w-full p-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                      />
                    </div>
                  </div>
                </div>

                {/* Seção 3: Gestão e Estatísticas */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                    <div className="bg-gray-50 px-6 py-3 border-b border-gray-100 flex items-center gap-2">
                      <Users className="w-4 h-4 text-gray-500" />
                      <h3 className="font-semibold text-gray-700 text-sm uppercase tracking-wide">Equipe Gestora</h3>
                    </div>
                    <div className="p-6 space-y-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Nome do Diretor</label>
                        <input
                          type="text"
                          name="director_name"
                          value={formData.director_name}
                          onChange={handleChange}
                          className="w-full p-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Nome do Gerente</label>
                        <input
                          type="text"
                          name="manager_name"
                          value={formData.manager_name}
                          onChange={handleChange}
                          className="w-full p-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                    <div className="bg-gray-50 px-6 py-3 border-b border-gray-100 flex items-center gap-2">
                      <Users className="w-4 h-4 text-gray-500" />
                      <h3 className="font-semibold text-gray-700 text-sm uppercase tracking-wide">Estatísticas</h3>
                    </div>
                    <div className="p-6 grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Qtd. Alunos</label>
                        <input
                          type="number"
                          name="student_count"
                          min="0"
                          value={formData.student_count}
                          onChange={handleChange}
                          className="w-full p-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Qtd. Professores</label>
                        <input
                          type="number"
                          name="teacher_count"
                          min="0"
                          value={formData.teacher_count}
                          onChange={handleChange}
                          className="w-full p-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Seção 4: Códigos Técnicos */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                  <div className="bg-gray-50 px-6 py-3 border-b border-gray-100 flex items-center gap-2">
                    <Zap className="w-4 h-4 text-gray-500" />
                    <h3 className="font-semibold text-gray-700 text-sm uppercase tracking-wide">Dados Técnicos</h3>
                  </div>
                  <div className="p-6 grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Código FDE</label>
                      <input
                        type="text"
                        name="fde_code"
                        value={formData.fde_code}
                        onChange={handleChange}
                        className="w-full p-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center gap-1">
                        <Zap className="w-3 h-3 text-yellow-500" /> Instalação EDP
                      </label>
                      <input
                        type="text"
                        name="edp_installation_id"
                        value={formData.edp_installation_id}
                        onChange={handleChange}
                        className="w-full p-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center gap-1">
                        <Droplet className="w-3 h-3 text-blue-500" /> Fornecimento SABESP
                      </label>
                      <input
                        type="text"
                        name="sabesp_supply_id"
                        value={formData.sabesp_supply_id}
                        onChange={handleChange}
                        className="w-full p-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                      />
                    </div>
                  </div>
                </div>

                {/* Botões de Ação */}
                <div className="flex justify-end pt-4 pb-12 gap-4">
                  <button
                    type="button"
                    onClick={() => setView('list')}
                    className="px-6 py-3 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 font-medium transition-colors"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-8 rounded-lg shadow-md transition-colors flex items-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed"
                  >
                    {submitting ? <Loader2 size={20} className="animate-spin" /> : <Save size={20} />}
                    {isEditing ? 'Salvar Alterações' : 'Salvar Cadastro'}
                  </button>
                </div>

              </form>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
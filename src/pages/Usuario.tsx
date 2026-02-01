import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Sidebar } from '../components/Sidebar';
import { Header } from '../components/Header';
import { 
  Users, 
  Search, 
  Plus, 
  Edit, 
  Trash2, 
  ArrowLeft, 
  Loader2, 
  Shield, 
  School,
  CheckCircle,
  AlertTriangle,
  User,
  Mail,
  Lock
} from 'lucide-react';

// Interfaces
interface UserProfile {
  id: string;
  full_name: string;
  role: 'regional_admin' | 'school_manager';
  school_id: string | null;
  created_at: string;
  email?: string;
  schools?: {
    name: string;
  };
}

interface SchoolOption {
  id: string;
  name: string;
}

export function Usuario() {
  // --- Estados ---
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [accessDenied, setAccessDenied] = useState(false);
  
  // Dados do Usuário Logado
  const [currentUserRole, setCurrentUserRole] = useState<string>("");
  const [currentUserName, setCurrentUserName] = useState<string>("Usuário");

  // Dados da Lista
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [schools, setSchools] = useState<SchoolOption[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  
  // Navegação e Mensagens
  const [view, setView] = useState<'list' | 'form'>('list');
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

  // Formulário
  const initialFormState = {
    id: '',
    full_name: '',
    email: '',
    password: '',
    role: 'school_manager', 
    school_id: ''
  };
  const [formData, setFormData] = useState(initialFormState);
  const [isEditing, setIsEditing] = useState(false);

  // --- Efeitos ---
  useEffect(() => {
    checkPermissionsAndInit();
  }, []);

  // --- Funções de Dados ---

  async function checkPermissionsAndInit() {
    try {
      setLoading(true);
      
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setAccessDenied(true);
        setLoading(false);
        return;
      }

      setCurrentUserName(user.user_metadata?.full_name || user.email?.split('@')[0] || "Usuário");

      // Busca perfil diretamente (agora sem RLS bloqueando)
      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single();

      // REGRA DE NEGÓCIO NO CÓDIGO: Verifica se é admin
      const role = (profile as any)?.role || '';
      setCurrentUserRole(role);

      if (role !== 'regional_admin') {
        setAccessDenied(true); // Bloqueia visualização via React
      } else {
        await Promise.all([fetchUsers(), fetchSchools()]);
      }

    } catch (error) {
      console.error("Erro na inicialização:", error);
      setAccessDenied(true);
    } finally {
      setLoading(false);
    }
  }

  async function fetchUsers() {
    try {
      // Cast 'as any' para evitar erros de tipo se as definições locais estiverem desatualizadas
      const { data, error } = await (supabase
        .from('profiles') as any)
        .select('*, schools:school_id (name)')
        .order('full_name', { ascending: true });

      if (error) throw error;
      setUsers(data || []);
    } catch (error) {
      console.error("Erro ao buscar usuários:", error);
      setMessage({ type: 'error', text: "Erro ao carregar lista de usuários." });
    }
  }

  async function fetchSchools() {
    try {
      const { data, error } = await (supabase
        .from('schools') as any)
        .select('id, name')
        .order('name', { ascending: true });

      if (error) throw error;
      setSchools(data || []);
    } catch (error) {
      console.error("Erro ao buscar escolas:", error);
    }
  }

  // --- Handlers ---

  const handleNewUser = () => {
    setFormData(initialFormState);
    setIsEditing(false);
    setView('form');
    setMessage(null);
  };

  const handleEditUser = (user: UserProfile) => {
    setFormData({
      id: user.id,
      full_name: user.full_name,
      email: '', 
      password: '', 
      role: user.role,
      school_id: user.school_id || ''
    });
    setIsEditing(true);
    setView('form');
    setMessage(null);
  };

  const handleDeleteUser = async (id: string) => {
    if (!window.confirm("Deseja excluir este usuário? O acesso dele será revogado.")) return;

    try {
      setLoading(true);
      // Remove da tabela profiles
      const { error } = await (supabase
        .from('profiles') as any)
        .delete()
        .eq('id', id);

      if (error) throw error;

      setMessage({ type: 'success', text: 'Usuário removido!' });
      fetchUsers();
    } catch (err: any) {
      console.error(err);
      setMessage({ type: 'error', text: "Erro ao excluir." });
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setMessage(null);

    try {
      if (!formData.full_name.trim()) throw new Error("Nome é obrigatório.");
      if (formData.role === 'school_manager' && !formData.school_id) {
        throw new Error("Gestor deve ter escola vinculada.");
      }

      if (isEditing) {
        // --- ATUALIZAÇÃO (Só Perfil) ---
        const payload: any = {
          full_name: formData.full_name,
          role: formData.role,
          school_id: formData.role === 'school_manager' ? formData.school_id : null
        };

        const { error: updateError } = await (supabase
          .from('profiles') as any)
          .update(payload)
          .eq('id', formData.id);

        if (updateError) throw updateError;
        setMessage({ type: 'success', text: 'Usuário atualizado!' });

      } else {
        // --- CRIAÇÃO NO CÓDIGO (SignUp + Insert) ---
        if (!formData.email || !formData.password) throw new Error("Email e Senha obrigatórios.");
        
        // 1. Cria usuário no Auth (Isso pode logar o usuário atual no frontend, cuidado!)
        const { data: authData, error: authError } = await supabase.auth.signUp({
          email: formData.email,
          password: formData.password,
          options: {
            data: { full_name: formData.full_name, role: formData.role }
          }
        });

        if (authError) throw authError;

        if (authData.user) {
          // 2. Insere manualmente na tabela profiles (já que removemos triggers)
          const { error: profileError } = await (supabase
            .from('profiles') as any)
            .insert([{
              id: authData.user.id,
              full_name: formData.full_name,
              role: formData.role,
              school_id: formData.role === 'school_manager' ? formData.school_id : null
            }]);

          if (profileError) {
            // Se falhar o perfil, seria bom limpar o auth, mas vamos apenas avisar
            throw new Error("Erro ao criar perfil de dados: " + profileError.message);
          }

          setMessage({ type: 'success', text: 'Usuário criado com sucesso!' });
          setFormData(initialFormState);
        }
      }
      
      window.scrollTo(0, 0);

    } catch (err: any) {
      console.error(err);
      setMessage({ type: 'error', text: err.message || "Erro ao processar." });
    } finally {
      setSubmitting(false);
    }
  };

  // --- Renderização (Igual, apenas garantindo acesso às variáveis) ---

  const filteredUsers = users.filter(user => 
    user.full_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (user.role === 'regional_admin' ? 'administrador' : 'gestor').includes(searchTerm.toLowerCase())
  );

  if (loading && users.length === 0) {
    return <div className="flex h-screen items-center justify-center bg-gray-50"><Loader2 className="w-8 h-8 animate-spin text-blue-600" /></div>;
  }

  if (accessDenied) {
    return (
      <div className="flex min-h-screen bg-gray-50">
        <Sidebar userRole={currentUserRole} />
        <div className="flex-1 flex flex-col min-h-screen">
          <Header userName={currentUserName} userRole={currentUserRole} />
          <div className="flex-1 flex items-center justify-center p-6">
            <div className="text-center bg-white p-8 rounded-xl shadow-lg border border-red-100 max-w-md">
              <div className="bg-red-100 p-4 rounded-full w-16 h-16 flex items-center justify-center mx-auto mb-4">
                <AlertTriangle className="w-8 h-8 text-red-600" />
              </div>
              <h2 className="text-xl font-bold text-gray-800 mb-2">Acesso Negado</h2>
              <p className="text-gray-600">Apenas Administradores Regionais.</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-gray-50 font-sans">
      <Sidebar userRole={currentUserRole} />
      
      <div className="flex-1 flex flex-col min-h-screen overflow-hidden">
        <Header userName={currentUserName} userRole={currentUserRole} />
        
        <main className="flex-1 overflow-y-auto p-6 md:p-8">
          <div className="max-w-6xl mx-auto">
            
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
              <div>
                <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
                  <Users className="text-blue-600" />
                  Gestão de Usuários
                </h1>
                <p className="text-gray-500 mt-1">Controle de acesso e atribuição de escolas</p>
              </div>
              
              {view === 'list' ? (
                <button onClick={handleNewUser} className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg shadow-sm flex items-center gap-2 transition-colors">
                  <Plus size={20} /> Novo Usuário
                </button>
              ) : (
                <button onClick={() => { setView('list'); fetchUsers(); }} className="bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 px-4 py-2 rounded-lg shadow-sm flex items-center gap-2 transition-colors">
                  <ArrowLeft size={20} /> Voltar
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

            {view === 'list' ? (
              <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="p-4 border-b border-gray-100 flex items-center justify-between bg-gray-50 gap-4">
                  <div className="relative w-full sm:w-96">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={18} />
                    <input 
                      type="text" 
                      placeholder="Buscar..." 
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-gray-50 text-xs font-semibold tracking-wide text-gray-500 uppercase border-b border-gray-200">
                        <th className="px-6 py-4">Usuário</th>
                        <th className="px-6 py-4">Perfil</th>
                        <th className="px-6 py-4">Escola</th>
                        <th className="px-6 py-4 text-center">Ações</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {filteredUsers.map((user) => (
                        <tr key={user.id} className="hover:bg-blue-50/50 transition-colors">
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center font-bold text-xs">
                                {user.full_name?.charAt(0) || 'U'}
                              </div>
                              <span className="font-medium text-gray-900">{user.full_name}</span>
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            {user.role === 'regional_admin' ? 
                              <span className="text-xs font-medium bg-purple-100 text-purple-800 px-2 py-0.5 rounded">Admin</span> : 
                              <span className="text-xs font-medium bg-blue-100 text-blue-800 px-2 py-0.5 rounded">Gestor</span>}
                          </td>
                          <td className="px-6 py-4 text-sm text-gray-600">
                            {user.schools?.name || '-'}
                          </td>
                          <td className="px-6 py-4 text-center flex justify-center gap-2">
                            <button onClick={() => handleEditUser(user)} className="p-2 text-gray-400 hover:text-blue-600"><Edit size={18} /></button>
                            <button onClick={() => handleDeleteUser(user.id)} className="p-2 text-gray-400 hover:text-red-600"><Trash2 size={18} /></button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-6 max-w-2xl mx-auto">
                <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 space-y-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Nome Completo</label>
                    <input type="text" required value={formData.full_name} onChange={(e) => setFormData({...formData, full_name: e.target.value})} className="w-full p-2.5 border rounded-lg" />
                  </div>

                  {!isEditing && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">E-mail</label>
                        <input type="email" required value={formData.email} onChange={(e) => setFormData({...formData, email: e.target.value})} className="w-full p-2.5 border rounded-lg" />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Senha</label>
                        <input type="password" required minLength={6} value={formData.password} onChange={(e) => setFormData({...formData, password: e.target.value})} className="w-full p-2.5 border rounded-lg" />
                      </div>
                    </div>
                  )}

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Perfil</label>
                    <div className="flex gap-4">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input type="radio" checked={formData.role === 'regional_admin'} onChange={() => setFormData({...formData, role: 'regional_admin', school_id: ''})} /> Admin Regional
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input type="radio" checked={formData.role === 'school_manager'} onChange={() => setFormData({...formData, role: 'school_manager'})} /> Gestor Escolar
                      </label>
                    </div>
                  </div>

                  {formData.role === 'school_manager' && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Escola</label>
                      <select required value={formData.school_id} onChange={(e) => setFormData({...formData, school_id: e.target.value})} className="w-full p-2.5 border rounded-lg bg-white">
                        <option value="">Selecione...</option>
                        {schools.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                      </select>
                    </div>
                  )}

                  <div className="flex justify-end gap-3 pt-4">
                    <button type="button" onClick={() => setView('list')} className="px-4 py-2 border rounded-lg">Cancelar</button>
                    <button type="submit" disabled={submitting} className="px-6 py-2 bg-blue-600 text-white rounded-lg flex items-center gap-2">
                      {submitting && <Loader2 size={16} className="animate-spin" />} Salvar
                    </button>
                  </div>
                </div>
              </form>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
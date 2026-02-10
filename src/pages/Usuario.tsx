import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { 
  Users, Mail, 
  Search, UserPlus, X, 
  Trash2, Edit, Save, Building2, Lock,
  ShieldAlert, ShieldCheck, UserCheck, Loader2,
  AlertCircle, } from 'lucide-react';

interface Profile {
  id: string;
  full_name: string;
  email?: string; // Campo opcional para carregar o email existente na tabela profiles
  role: 'regional_admin' | 'school_manager';
  school_id: string | null;
  created_at: string;
}

interface School {
  id: string;
  name: string;
}

export function Usuario() {
  const [users, setUsers] = useState<Profile[]>([]);
  const [schools, setSchools] = useState<School[]>([]);
  const [loading, setLoading] = useState(true);
  const [saveLoading, setSaveLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<Profile | null>(null);
  
  const [formData, setFormData] = useState({
    full_name: '',
    email: '',
    password: '',
    role: 'school_manager' as 'regional_admin' | 'school_manager',
    school_id: ''
  });

  const [errors, setErrors] = useState<string[]>([]);

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    setLoading(true);
    try {
      // Busca perfis. Se a coluna 'email' existir na tabela profiles, ela virá aqui.
      const { data: profilesData, error: profilesError } = await (supabase as any)
        .from('profiles')
        .select('*')
        .order('full_name');
      
      if (profilesError) throw profilesError;

      const { data: schoolsData, error: schoolsError } = await (supabase as any)
        .from('schools')
        .select('id, name')
        .order('name');

      if (schoolsError) throw schoolsError;

      setUsers(profilesData || []);
      setSchools(schoolsData || []);
    } catch (error) {
      console.error('Erro ao carregar dados:', error);
    } finally {
      setLoading(false);
    }
  }

  function validateForm() {
    const newErrors: string[] = [];

    if (formData.full_name.trim().split(' ').length < 2) {
      newErrors.push("Informe o nome completo (nome e sobrenome).");
    }

    // E-mail obrigatório apenas na criação. Na edição, usamos o que já existe ou o que foi carregado.
    if (!editingUser && !formData.email.includes('@')) {
      newErrors.push("Informe um e-mail válido.");
    }

    // Senha obrigatória na criação (min 6 chars). Na edição é opcional.
    if (!editingUser) {
      if (formData.password.length < 6) {
        newErrors.push("A senha deve ter pelo menos 6 caracteres.");
      }
    } else {
      if (formData.password && formData.password.length < 6) {
        newErrors.push("A nova senha deve ter pelo menos 6 caracteres.");
      }
    }

    if (formData.role === 'school_manager' && !formData.school_id) {
      newErrors.push("Gestores devem ser vinculados a uma unidade escolar.");
    }

    setErrors(newErrors);
    return newErrors.length === 0;
  }

  function handleOpenModal(user: Profile | null = null) {
    setErrors([]);
    if (user) {
      setEditingUser(user);
      setFormData({
        full_name: user.full_name,
        // Tenta pegar o email do perfil carregado. Se estiver vazio, deixa string vazia.
        email: user.email || '', 
        password: '', // Senha sempre começa vazia na edição
        role: user.role,
        school_id: user.school_id || ''
      });
    } else {
      setEditingUser(null);
      setFormData({
        full_name: '',
        email: '',
        password: '',
        role: 'school_manager',
        school_id: ''
      });
    }
    setIsModalOpen(true);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!validateForm()) return;

    setSaveLoading(true);
    setErrors([]);

    try {
      if (editingUser) {
        // --- ATUALIZAÇÃO ---
        const updatePayload: any = {
            full_name: formData.full_name,
            role: formData.role,
            school_id: formData.role === 'school_manager' ? formData.school_id : null
        };

        // Se o campo de email não estiver vazio (e existir a coluna no banco), tentamos atualizar para manter sincronia
        if (formData.email) {
            updatePayload.email = formData.email;
        }

        const { error: profileError } = await (supabase as any)
          .from('profiles')
          .update(updatePayload)
          .eq('id', editingUser.id);

        if (profileError) throw profileError;

        // Se houve preenchimento de senha, avisa (requer Edge Function para funcionar de verdade para terceiros)
        if (formData.password) {
            alert("Aviso: A senha foi preenchida, mas por segurança o Supabase não permite alterar senha de terceiros via Frontend. Configure uma Edge Function ou use o painel Admin do Supabase para resetar senhas.");
        }

      } else {
        // --- CRIAÇÃO ---
        // 1. Criar no Auth
        const { data: authData, error: authError } = await supabase.auth.signUp({
          email: formData.email,
          password: formData.password,
          options: {
            data: {
              full_name: formData.full_name,
              role: formData.role,
            }
          }
        });

        if (authError) throw authError;

        if (authData.user) {
          // 2. Criar no Profiles (incluindo o email para facilitar visualização futura)
          const { error: profileError } = await (supabase as any)
            .from('profiles')
            .upsert({
              id: authData.user.id,
              full_name: formData.full_name,
              email: formData.email, // Importante: requer coluna 'email' na tabela profiles
              role: formData.role,
              school_id: formData.role === 'school_manager' ? formData.school_id : null,
              created_at: new Date().toISOString()
            });
          
          if (profileError) throw profileError;
        }
      }

      setIsModalOpen(false);
      fetchData();
      
      if (!editingUser) alert("Usuário criado com sucesso!");

    } catch (error: any) {
      console.error('Erro:', error);
      if (error.message?.includes('column "email" does not exist')) {
        setErrors(["Erro de Banco de Dados: A coluna 'email' não existe na tabela 'profiles'. Execute o SQL sugerido."]);
      } else {
        setErrors([error.message || "Erro ao salvar dados."]);
      }
    } finally {
      setSaveLoading(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Deseja remover este perfil? (Nota: O login Auth permanecerá, apenas o perfil de acesso será removido)')) return;

    try {
      const { error } = await (supabase as any).from('profiles').delete().eq('id', id);
      if (error) throw error;
      fetchData();
    } catch (error) {
      console.error(error);
      alert('Erro ao remover perfil.');
    }
  }

  const filteredUsers = users.filter(u => 
    u.full_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (u.email && u.email.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Gestão de Usuários</h1>
          <p className="text-slate-500">Administre os acessos regionais e das unidades escolares.</p>
        </div>
        <button 
          onClick={() => handleOpenModal()}
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 rounded-xl font-semibold flex items-center gap-2 shadow-lg shadow-blue-100 transition-all active:scale-95"
        >
          <UserPlus className="w-5 h-5" />
          Novo Usuário
        </button>
      </div>

      <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm flex flex-col md:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-5 h-5" />
          <input 
            type="text" 
            placeholder="Buscar por nome ou e-mail..." 
            className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-2 text-sm text-slate-500 px-2 font-bold">
            <Users size={16} className="text-blue-500" />
            <span>{filteredUsers.length} usuários</span>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 border-b border-slate-100">
              <tr>
                <th className="px-6 py-4 font-bold text-slate-500 uppercase text-[10px]">Usuário</th>
                <th className="px-6 py-4 font-bold text-slate-500 uppercase text-[10px]">E-mail (Cadastro)</th>
                <th className="px-6 py-4 font-bold text-slate-500 uppercase text-[10px]">Perfil de Acesso</th>
                <th className="px-6 py-4 font-bold text-slate-500 uppercase text-[10px]">Vínculo</th>
                <th className="px-6 py-4 font-bold text-slate-500 uppercase text-[10px] text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading && users.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-slate-400">
                    <div className="flex items-center justify-center gap-2">
                        <Loader2 className="animate-spin" size={18} />
                        Carregando base de usuários...
                    </div>
                  </td>
                </tr>
              ) : filteredUsers.map((user) => (
                <tr key={user.id} className="hover:bg-slate-50/50 transition-colors group">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className={`w-9 h-9 rounded-full flex items-center justify-center font-bold text-xs shadow-sm ${
                        user.role === 'regional_admin' ? 'bg-blue-100 text-blue-600' : 'bg-emerald-100 text-emerald-600'
                      }`}>
                        {user.full_name.substring(0,2).toUpperCase()}
                      </div>
                      <div>
                          <div className="font-bold text-slate-900">{user.full_name}</div>
                          <div className="text-[10px] text-slate-400 font-mono uppercase tracking-tighter">ID: {user.id.substring(0,6)}...</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    {user.email ? (
                        <span className="text-slate-600 font-medium">{user.email}</span>
                    ) : (
                        <span className="text-slate-400 italic text-xs">Não sincronizado</span>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    {/* VISUALIZAÇÃO DO TIPO DE USUÁRIO RESTAURADA AQUI */}
                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase border ${
                      user.role === 'regional_admin' 
                        ? 'bg-blue-50 text-blue-700 border-blue-100' 
                        : 'bg-emerald-50 text-emerald-700 border-emerald-100'
                    }`}>
                      {user.role === 'regional_admin' ? <ShieldCheck size={12}/> : <UserCheck size={12}/>}
                      {user.role === 'regional_admin' ? 'Regional' : 'Gestor'}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    {user.role === 'school_manager' ? (
                      <div className="flex items-center gap-2 text-slate-600">
                        <Building2 size={14} className="text-slate-400" />
                        <span className="text-xs truncate max-w-[150px] font-medium">
                          {schools.find(s => s.id === user.school_id)?.name || 'Unidade não encontrada'}
                        </span>
                      </div>
                    ) : (
                      <span className="text-xs text-slate-400 italic">Gestão Global</span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button 
                        onClick={() => handleOpenModal(user)}
                        className="p-2 hover:bg-amber-50 text-slate-400 hover:text-amber-600 rounded-lg transition-colors"
                        title="Editar Perfil"
                      >
                        <Edit size={16} />
                      </button>
                      <button 
                        onClick={() => handleDelete(user.id)}
                        className="p-2 hover:bg-red-50 text-slate-400 hover:text-red-600 rounded-lg transition-colors"
                        title="Remover Acesso"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {filteredUsers.length === 0 && !loading && (
                  <tr>
                      <td colSpan={5} className="px-6 py-12 text-center text-slate-400 italic">Nenhum usuário encontrado.</td>
                  </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl animate-in fade-in zoom-in-95 duration-200 overflow-hidden">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-blue-100 rounded-lg text-blue-600 shadow-sm">
                  {editingUser ? <Edit size={20}/> : <UserPlus size={20}/>}
                </div>
                <div>
                  <h2 className="text-lg font-bold text-slate-800">
                    {editingUser ? 'Editar Perfil' : 'Novo Usuário'}
                  </h2>
                  <p className="text-xs text-slate-500">
                     {editingUser ? 'Atualize os dados ou senha' : 'Defina as credenciais e permissões'}
                  </p>
                </div>
              </div>
              <button onClick={() => setIsModalOpen(false)} className="p-2 hover:bg-slate-200 rounded-full transition-colors">
                <X size={20} className="text-slate-500" />
              </button>
            </div>

            <form onSubmit={handleSave} className="p-6 space-y-4">
              {errors.length > 0 && (
                <div className="bg-red-50 border border-red-200 p-3 rounded-xl space-y-2 animate-in slide-in-from-top-2">
                  {errors.map((err, i) => (
                    <div key={i} className="flex items-start gap-2 text-red-700 text-xs font-bold leading-tight">
                      <AlertCircle className="mt-0.5 shrink-0" size={14} />
                      <span>{err}</span>
                    </div>
                  ))}
                </div>
              )}

              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1 tracking-wider">Nome Completo</label>
                  <input 
                    required 
                    className="w-full p-2.5 border border-slate-300 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 transition-all font-medium"
                    placeholder="Ex: Pedro Alvares Cabral"
                    value={formData.full_name}
                    onChange={e => setFormData({...formData, full_name: e.target.value})}
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase mb-1 tracking-wider">E-mail de Acesso</label>
                      <div className="relative">
                        <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                        <input 
                          required={!editingUser}
                          disabled={!!editingUser && !!formData.email} // Desabilita se já tem email, para evitar confusão de Auth
                          type="email"
                          className={`w-full pl-10 pr-3 py-2.5 border border-slate-300 rounded-xl outline-none font-medium ${
                              editingUser ? 'bg-slate-50 text-slate-500' : 'focus:ring-2 focus:ring-blue-500'
                          }`}
                          placeholder="usuario@sge.sp.gov.br"
                          value={formData.email}
                          onChange={e => setFormData({...formData, email: e.target.value})}
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase mb-1 tracking-wider">
                          {editingUser ? 'Nova Senha (Opcional)' : 'Senha Provisória'}
                      </label>
                      <div className="relative">
                        <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                        <input 
                          required={!editingUser}
                          type="password"
                          className="w-full pl-10 pr-3 py-2.5 border border-slate-300 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 font-medium"
                          placeholder={editingUser ? "Vazio para manter" : "Mín. 6 caracteres"}
                          value={formData.password}
                          onChange={e => setFormData({...formData, password: e.target.value})}
                        />
                      </div>
                    </div>
                  </div>

                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1 tracking-wider">Perfil de Acesso</label>
                  <div className="grid grid-cols-2 gap-2">
                    <button 
                      type="button"
                      onClick={() => setFormData({...formData, role: 'school_manager'})}
                      className={`flex items-center justify-center gap-2 p-3 border rounded-xl text-sm font-bold transition-all ${
                        formData.role === 'school_manager' 
                          ? 'bg-emerald-50 border-emerald-500 text-emerald-700 shadow-inner' 
                          : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'
                      }`}
                    >
                      <UserCheck size={18} />
                      Gestor Escolar
                    </button>
                    <button 
                      type="button"
                      onClick={() => setFormData({...formData, role: 'regional_admin'})}
                      className={`flex items-center justify-center gap-2 p-3 border rounded-xl text-sm font-bold transition-all ${
                        formData.role === 'regional_admin' 
                          ? 'bg-blue-50 border-blue-500 text-blue-700 shadow-inner' 
                          : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'
                      }`}
                    >
                      <ShieldAlert size={18} />
                      Admin Regional
                    </button>
                  </div>
                </div>

                {formData.role === 'school_manager' && (
                  <div className="animate-in slide-in-from-top-2 duration-200">
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1 tracking-wider">Unidade Escolar Vinculada</label>
                    <div className="relative">
                      <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                      <select 
                        required
                        className="w-full pl-10 pr-3 py-2.5 border border-slate-300 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 appearance-none bg-white font-bold text-slate-700 shadow-sm"
                        value={formData.school_id}
                        onChange={e => setFormData({...formData, school_id: e.target.value})}
                      >
                        <option value="">Selecione a escola...</option>
                        {schools.map(school => (
                          <option key={school.id} value={school.id}>{school.name}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                )}
              </div>

              <div className="pt-6 flex justify-end gap-3 border-t border-slate-100 mt-6">
                <button 
                  type="button" 
                  onClick={() => setIsModalOpen(false)} 
                  className="px-5 py-2.5 text-slate-600 hover:bg-slate-100 rounded-xl font-bold transition-colors"
                >
                  Descartar
                </button>
                <button 
                  type="submit" 
                  disabled={saveLoading}
                  className="px-5 py-2.5 bg-blue-600 text-white rounded-xl hover:bg-blue-700 flex items-center gap-2 font-bold shadow-lg shadow-blue-200 transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {saveLoading ? (
                    <><Loader2 className="animate-spin" size={18} /> Processando...</>
                  ) : (
                    <><Save size={18} /> {editingUser ? 'Salvar Alterações' : 'Confirmar Cadastro'}</>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
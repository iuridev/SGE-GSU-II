import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { useNavigate } from 'react-router-dom';

export function Login() {
    const navigate = useNavigate();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);

const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg(null);

    try {
      // 1. Tenta logar
      const { data: { user }, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        throw error; // Joga para o 'catch' lá embaixo
      }

      if (user) {
        console.log("Login Auth SUCESSO. Buscando perfil...");

        // 2. Busca o perfil
        const { data: profileData, error: profileError } = await supabase
          .from('profiles')
          .select('role')
          .eq('id', user.id)
          .single();

        if (profileError) {
          console.error("Erro ao buscar perfil:", profileError);
          setErrorMsg("Usuário sem perfil cadastrado no sistema.");
          setLoading(false);
          return;
        }

        // Força a tipagem
        const profile = profileData as { role: string } | null;

        if (profile?.role === 'regional_admin') {
          navigate('/painel-regional');
        } else if (profile?.role === 'school_manager') {
          navigate('/painel-escola');
        } else {
          // Se não tiver role definida
          setErrorMsg("Seu usuário não tem permissão de acesso (Role indefinida).");
          setLoading(false); 
        }
      }
    } catch (error: any) {
      console.error("Erro no login:", error);
      setErrorMsg(error.message || 'Erro ao conectar com o servidor.');
      setLoading(false);
    }
  };

    return (
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-100 to-slate-200 font-sans p-4">
            <div className="bg-white p-8 md:p-10 rounded-xl shadow-2xl w-full max-w-md text-center transition-all">

                {/* Cabeçalho */}
                <div className="mb-8">
                    <div className="flex items-center justify-center gap-2 text-3xl font-bold text-blue-600 mb-2 tracking-tight">
                        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
                            <polyline points="9 22 9 12 15 12 15 22"></polyline>
                        </svg>
                        SGE-GSU
                    </div>
                    <p className="text-slate-500 text-sm">Gestão de Rede de Escolas</p>
                    <span className="inline-block mt-3 px-3 py-1 bg-blue-50 text-blue-600 rounded-full text-xs font-bold uppercase tracking-wider">
                        Acesso Unificado
                    </span>
                </div>

                {/* Formulário */}
                <form onSubmit={handleLogin} className="text-left space-y-5">
                    <div>
                        <label className="block mb-2 text-slate-700 text-sm font-semibold" htmlFor="email">
                            E-mail Institucional
                        </label>
                        <input
                            type="email"
                            id="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            className="w-full p-3 border-2 border-slate-200 rounded-lg outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition-all text-base text-slate-700"
                            placeholder="ex: diretor@escola.sp.gov.br"
                            required
                        />
                    </div>

                    <div>
                        <label className="block mb-2 text-slate-700 text-sm font-semibold" htmlFor="senha">
                            Senha
                        </label>
                        <input
                            type="password"
                            id="senha"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            className="w-full p-3 border-2 border-slate-200 rounded-lg outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition-all text-base text-slate-700"
                            placeholder="••••••••"
                            required
                        />
                    </div>

                    {errorMsg && (
                        <div className="p-3 bg-red-50 text-red-600 text-sm rounded-lg border border-red-100 flex items-center gap-2">
                            ⚠️ {errorMsg}
                        </div>
                    )}

                    <button
                        type="submit"
                        disabled={loading}
                        className={`w-full py-3.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-bold shadow-lg shadow-blue-600/30 transition-all active:scale-[0.98] ${loading ? 'opacity-70 cursor-not-allowed' : ''}`}
                    >
                        {loading ? 'Validando...' : 'Entrar no Sistema'}
                    </button>
                </form>

                {/* Footer */}
                <div className="mt-8 text-xs text-slate-400">
                    <p className="mb-2 hover:text-blue-600 cursor-pointer transition-colors">Esqueceu a senha?</p>
                    <p>Suporte Técnico: (11) 0000-0000</p>
                </div>
            </div>
        </div>
    );
}
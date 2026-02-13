import { useState } from 'react';
import { supabase } from '../lib/supabase';
//import { useNavigate } from 'react-router-dom';

export function Login() {
  //const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg(null);

    try {
      // 1. Autenticação via Supabase Auth
      const { data: { user }, error: authError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (authError) throw authError;

      if (user) {
        console.log("Login Auth SUCESSO. Validando perfil no código...");

        // 2. Busca o cargo (role) na tabela profiles
        // Como o RLS está desativado, esta consulta funcionará livremente para qualquer usuário logado
        const { data: profileData, error: profileError } = await (supabase as any)
          .from('profiles')
          .select('role')
          .eq('id', user.id)
          .single();

        if (profileError || !profileData) {
          console.error("Erro ou perfil inexistente:", profileError);
          await supabase.auth.signOut();
          throw new Error("Usuário autenticado, mas o perfil não foi encontrado na tabela 'profiles'.");
        }

        const role = profileData.role;

        // 3. Redirecionamento por Código
        // Forçamos o reload total da página para evitar conflitos de estado do React Router
        if (role === 'regional_admin' || role === 'school_manager') {
          window.location.href = '/painel-regional';
        } else {
          await supabase.auth.signOut();
          throw new Error("Seu perfil (" + role + ") não possui permissão de acesso ao painel.");
        }
      }
    } catch (error: any) {
      console.error("Falha no acesso:", error);
      
      // Tratamento para o Erro 500 do servidor Supabase
      if (error.message?.includes('schema') || error.status === 500) {
        setErrorMsg("Erro interno no banco (500). Verifique se as permissões do esquema 'public' estão corretas no Supabase.");
      } else if (error.message === 'Invalid login credentials') {
        setErrorMsg("E-mail ou senha incorretos.");
      } else {
        setErrorMsg(error.message || "Erro inesperado ao conectar.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-100 to-slate-200 font-sans p-4">
      <div className="bg-white p-8 md:p-10 rounded-xl shadow-2xl w-full max-w-md text-center border border-slate-100 transition-all">

        {/* Logo/Cabeçalho */}
        <div className="mb-8">
          <div className="flex items-center justify-center gap-2 text-3xl font-bold text-blue-600 mb-2 tracking-tight">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
              <polyline points="9 22 9 12 15 12 15 22"></polyline>
            </svg>
            SGE-GSU
          </div>
          <p className="text-slate-500 text-sm font-medium">Gestão de Unidades Escolares</p>
        </div>

        {/* Formulário */}
        <form onSubmit={handleLogin} className="text-left space-y-5">
          <div>
            <label className="block mb-1.5 text-slate-600 text-xs font-bold uppercase tracking-wider" htmlFor="email">
              E-mail Institucional
            </label>
            <input
              type="email"
              id="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full p-3 bg-slate-50 border-2 border-slate-200 rounded-lg outline-none focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-500/5 transition-all text-slate-700"
              placeholder="seu.email@educacao.sp.gov.br"
              required
            />
          </div>

          <div>
            <label className="block mb-1.5 text-slate-600 text-xs font-bold uppercase tracking-wider" htmlFor="senha">
              Senha
            </label>
            <input
              type="password"
              id="senha"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full p-3 bg-slate-50 border-2 border-slate-200 rounded-lg outline-none focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-500/5 transition-all text-slate-700"
              placeholder="••••••••"
              required
            />
          </div>

          {errorMsg && (
            <div className="p-3 bg-red-50 text-red-700 text-xs font-bold rounded-lg border border-red-100 flex items-start gap-2">
              <span className="mt-0.5">⚠️</span>
              <span>{errorMsg}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className={`w-full py-4 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold shadow-lg shadow-blue-600/20 transition-all flex justify-center items-center gap-2 active:scale-[0.98] ${loading ? 'opacity-70 cursor-not-allowed' : ''}`}
          >
            {loading ? (
              <>
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                Validando...
              </>
            ) : (
              'Entrar no Sistema'
            )}
          </button>
        </form>

        <div className="mt-8 pt-6 border-t border-slate-100 text-[11px] text-slate-400">
          <p>Suporte Técnico: <b>(11) gsu.sefisc@educacao.sp.gov.br</b></p>
        </div>
      </div>
    </div>
  );
}
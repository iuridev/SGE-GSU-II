import { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
//import { useNavigate } from 'react-router-dom';

export function Login() {
  //const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mouseRef = useRef({ x: -9999, y: -9999 });

  useEffect(() => {
    document.documentElement.style.overflow = 'auto';
    document.body.style.overflow = 'auto';
    return () => {
      document.documentElement.style.overflow = '';
      document.body.style.overflow = '';
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener('resize', resize);

    const onMouseMove = (e: MouseEvent) => {
      mouseRef.current = { x: e.clientX, y: e.clientY };
    };
    window.addEventListener('mousemove', onMouseMove);

    const onMouseLeave = () => {
      mouseRef.current = { x: -9999, y: -9999 };
    };
    window.addEventListener('mouseleave', onMouseLeave);

    const PARTICLE_COUNT = 90;
    const CONNECT_DIST = 140;
    const MOUSE_DIST = 130;
    const MOUSE_CONNECT_DIST = 180;

    type Particle = { x: number; y: number; vx: number; vy: number; r: number };

    const particles: Particle[] = Array.from({ length: PARTICLE_COUNT }, () => ({
      x: Math.random() * window.innerWidth,
      y: Math.random() * window.innerHeight,
      vx: (Math.random() - 0.5) * 0.45,
      vy: (Math.random() - 0.5) * 0.45,
      r: Math.random() * 1.8 + 0.8,
    }));

    let animId: number;

    const tick = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const mouse = mouseRef.current;

      for (const p of particles) {
        const dx = p.x - mouse.x;
        const dy = p.y - mouse.y;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d < MOUSE_DIST && d > 0) {
          const force = ((MOUSE_DIST - d) / MOUSE_DIST) * 0.025;
          p.vx += (dx / d) * force;
          p.vy += (dy / d) * force;
        }
        p.vx *= 0.98;
        p.vy *= 0.98;
        const speed = Math.sqrt(p.vx * p.vx + p.vy * p.vy);
        if (speed > 1.8) { p.vx = (p.vx / speed) * 1.8; p.vy = (p.vy / speed) * 1.8; }
        p.x += p.vx;
        p.y += p.vy;
        if (p.x < 0) p.x = canvas.width;
        if (p.x > canvas.width) p.x = 0;
        if (p.y < 0) p.y = canvas.height;
        if (p.y > canvas.height) p.y = 0;

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(148,197,253,0.75)';
        ctx.fill();
      }

      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const dx = particles[i].x - particles[j].x;
          const dy = particles[i].y - particles[j].y;
          const d = Math.sqrt(dx * dx + dy * dy);
          if (d < CONNECT_DIST) {
            ctx.beginPath();
            ctx.moveTo(particles[i].x, particles[i].y);
            ctx.lineTo(particles[j].x, particles[j].y);
            ctx.strokeStyle = `rgba(148,197,253,${(1 - d / CONNECT_DIST) * 0.35})`;
            ctx.lineWidth = 0.7;
            ctx.stroke();
          }
        }
        const dx = particles[i].x - mouse.x;
        const dy = particles[i].y - mouse.y;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d < MOUSE_CONNECT_DIST) {
          ctx.beginPath();
          ctx.moveTo(mouse.x, mouse.y);
          ctx.lineTo(particles[i].x, particles[i].y);
          ctx.strokeStyle = `rgba(96,165,250,${(1 - d / MOUSE_CONNECT_DIST) * 0.6})`;
          ctx.lineWidth = 1;
          ctx.stroke();
        }
      }

      animId = requestAnimationFrame(tick);
    };
    tick();

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', resize);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseleave', onMouseLeave);
    };
  }, []);

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
        if (role === 'regional_admin' || role === 'school_manager' || role === 'supervisor' || role === 'dirigente'|| role === 'ure_servico'|| role === 'ure_ecc') {
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
    <div className="min-h-screen flex font-sans relative bg-gradient-to-br from-blue-900 via-blue-800 to-indigo-900">

      {/* Canvas — rede de partículas interativa */}
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full pointer-events-none" />

      {/* Container centralizado */}
      <div className="relative z-10 flex items-center justify-center w-full min-h-screen px-6 py-12">
      <div className="flex w-full max-w-5xl gap-12 items-center">

      {/* Painel esquerdo — Apresentação */}
      <div className="hidden lg:flex flex-col justify-center flex-1 text-white">
        <div className="max-w-lg">
          <div className="flex items-center gap-3 mb-6">
            <div className="bg-white/15 backdrop-blur-sm p-3 rounded-2xl">
              <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                <polyline points="9 22 9 12 15 12 15 22" />
              </svg>
            </div>
            <div>
              <h1 className="text-3xl font-extrabold tracking-tight">SGE-GSU</h1>
              <p className="text-blue-200 text-sm font-medium">Sistema de Gestão Escolar</p>
              <p className="text-blue-200 text-sm font-medium">SEOM - SEFISC</p>
            </div>
          </div>

          <p className="text-white/80 text-base leading-relaxed mb-8">
            Plataforma integrada para gestão das unidades escolares da <strong className="text-white">Unidade Regional de Ensino Guarulhos Sul</strong>, centralizando relatórios e fiscalização de obras e utilidades públicas em um único lugar.
          </p>

          <div className="space-y-4">
            {[
              { icon: '📋', title: 'Agendamentos', desc: 'Gerenciar agendamentos de ambientes na URE.' },
              { icon: '📊', title: 'Relatórios e Gráficos', desc: 'Acompanhe indicadores de Obras, Patrimônio e histórico das unidades públicas em tempo real.' },
              { icon: '🔔', title: 'Alertas de Emergência', desc: 'Notificações imediatas para situações críticas nas escolas.' },
              { icon: '🏫', title: 'Cadastro de Escolas', desc: 'Base centralizada com dados e contatos de todas as UEs.' },
            ].map((item) => (
              <div key={item.title} className="flex items-start gap-4 bg-white/10 backdrop-blur-sm rounded-xl p-4 border border-white/10">
                <span className="text-2xl">{item.icon}</span>
                <div>
                  <p className="font-bold text-sm">{item.title}</p>
                  <p className="text-white/65 text-xs leading-relaxed">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>

          <p className="mt-10 text-white/40 text-xs">
            Serviço de Obras e Manutenção Escolar · Seção de Fiscalização · URE Guarulhos Sul
          </p>
        </div>
      </div>

      {/* Painel direito — Formulário */}
      <div className="flex items-center justify-center w-full lg:w-[480px] lg:min-w-[480px] px-6 py-12 relative z-10">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-8 md:p-10">

          {/* Logo mobile (visível só em telas menores que lg) */}
          <div className="lg:hidden text-center mb-8">
            <div className="flex items-center justify-center gap-2 text-2xl font-bold text-blue-600 mb-1">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                <polyline points="9 22 9 12 15 12 15 22" />
              </svg>
              SGE-GSU
            </div>
            <p className="text-slate-400 text-xs">URE Guarulhos Sul · Gestão de Unidades Escolares</p>
          </div>

          <div className="mb-7">
            <h2 className="text-xl font-bold text-slate-800">Acesso ao Painel</h2>
            <p className="text-slate-400 text-sm mt-1">Use suas credenciais institucionais para entrar.</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-5">
            <div>
              <label className="block mb-1.5 text-slate-600 text-xs font-bold uppercase tracking-wider" htmlFor="email">
                E-mail Institucional
              </label>
              <input
                type="email"
                id="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full p-3 bg-slate-50 border-2 border-slate-200 rounded-lg outline-none focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-500/10 transition-all text-slate-700"
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
                className="w-full p-3 bg-slate-50 border-2 border-slate-200 rounded-lg outline-none focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-500/10 transition-all text-slate-700"
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
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Validando...
                </>
              ) : (
                'Entrar no Sistema'
              )}
            </button>
          </form>

          <div className="mt-8 pt-6 border-t border-slate-100 text-[11px] text-slate-400 text-center space-y-0.5">
            <p>Suporte: <b>gsu.seom@educacao.sp.gov.br</b></p>
            <p>Suporte: <b>gsu.sefisc@educacao.sp.gov.br</b></p>
          </div>
        </div>
      </div>
      </div>
      </div>
    </div>
  );
}
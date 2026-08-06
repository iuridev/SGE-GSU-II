import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { resolveViewRole } from '../lib/roles';
import { Megaphone, X, ArrowRight, Clock } from 'lucide-react';

interface Janela {
  id: string;
  data_fim: string;
}

const REFORMA_FUNAP_PAGE_ID = 'reforma-funap';

function formatDateTime(d?: string | null): string {
  if (!d) return '-';
  const parsed = new Date(d);
  if (isNaN(parsed.getTime())) return d;
  return parsed.toLocaleString('pt-BR');
}

// Mostrado uma vez por acesso ao sistema (não a cada navegação interna) para
// escolas com prazo aberto e ainda sem resposta no levantamento de Reforma
// FUNAP. "Lembrar depois" grava um flag em sessionStorage por ID de janela,
// então volta a aparecer se abrir uma aba nova ou se o admin criar um prazo
// novo, mas não fica reaparecendo a cada clique dentro da mesma sessão.
export function FunapReminderModal({ currentPage, onNavigate }: { currentPage: string; onNavigate: (page: string) => void }) {
  const [visible, setVisible] = useState(false);
  const [janela, setJanela] = useState<Janela | null>(null);

  useEffect(() => {
    if (currentPage === REFORMA_FUNAP_PAGE_ID) return;
    checkLembrete();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function invoke(action: string, payload: Record<string, unknown> = {}) {
    const { data, error } = await supabase.functions.invoke('reforma-funap', { body: { action, ...payload } });
    if (error) throw error;
    if (data?.error) throw new Error(data.error);
    return data;
  }

  async function checkLembrete() {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: profile } = await (supabase as any)
        .from('profiles')
        .select('role, school_id')
        .eq('id', user.id)
        .single();
      const role = resolveViewRole(profile?.role || '');
      if (role !== 'school_manager' || !profile?.school_id) return;

      const [janelaData, respostas] = await Promise.all([
        invoke('obter_janela'),
        invoke('listar_respostas'),
      ]);
      if (!janelaData?.status?.aberta) return;

      const jaRespondeu = Array.isArray(respostas) && respostas.some((r: any) => r.escola_id === profile.school_id);
      if (jaRespondeu) return;

      const dismissKey = `sge_funap_lembrete_dismissado_${janelaData.janela?.id}`;
      if (sessionStorage.getItem(dismissKey)) return;

      setJanela(janelaData.janela);
      setVisible(true);
    } catch (e) {
      console.error('Erro ao verificar lembrete FUNAP:', e);
    }
  }

  const dismiss = () => {
    if (janela?.id) sessionStorage.setItem(`sge_funap_lembrete_dismissado_${janela.id}`, '1');
    setVisible(false);
  };

  const responder = () => {
    setVisible(false);
    onNavigate(REFORMA_FUNAP_PAGE_ID);
  };

  if (!visible) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[9999] p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 relative">
        <button onClick={dismiss} className="absolute top-4 right-4 text-slate-400 hover:text-slate-600">
          <X size={20} />
        </button>
        <div className="w-12 h-12 rounded-xl bg-amber-100 flex items-center justify-center mb-4">
          <Megaphone size={24} className="text-amber-600" />
        </div>
        <h2 className="text-lg font-bold text-slate-800">Levantamento FUNAP pendente</h2>
        <p className="text-sm text-slate-600 mt-2 leading-relaxed">
          Sua escola ainda não respondeu o levantamento de reforma de carteiras e cadeiras
          (conjuntos CJA-05 e CJA-06). Responda antes do prazo terminar.
        </p>
        {janela?.data_fim && (
          <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mt-3 flex items-center gap-1.5">
            <Clock size={13} /> Prazo até: {formatDateTime(janela.data_fim)}
          </p>
        )}
        <div className="flex gap-2 mt-5">
          <button onClick={dismiss} className="flex-1 px-4 py-2.5 text-slate-600 border border-slate-200 rounded-lg text-sm font-medium hover:bg-slate-50">
            Lembrar depois
          </button>
          <button onClick={responder} className="flex-1 flex items-center justify-center gap-1.5 px-4 py-2.5 bg-teal-600 text-white rounded-lg text-sm font-medium hover:bg-teal-700">
            Responder agora <ArrowRight size={15} />
          </button>
        </div>
      </div>
    </div>
  );
}

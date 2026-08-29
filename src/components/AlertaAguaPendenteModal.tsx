import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { resolveViewRole } from '../lib/roles';
import { WATER_REPORTING_HARD_START } from '../pages/Dashboard';
import { Droplets, X, ArrowRight, CalendarX2 } from 'lucide-react';

const CONSUMO_AGUA_PAGE_ID = 'consumo';

// Só alerta quando a escola acumula MAIS de 2 dias úteis sem registro de
// consumo de água (ou seja, 3+). Mesma janela usada na Dashboard: últimos 6
// meses, nunca antes do início obrigatório do registro (WATER_REPORTING_HARD_START).
const LIMITE_DIAS_PENDENTES = 2;

const MESES_PT = [
  'jan', 'fev', 'mar', 'abr', 'mai', 'jun',
  'jul', 'ago', 'set', 'out', 'nov', 'dez',
];

function formatDateToYMD(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

interface MesPendente { year: number; month: number; missingDays: number; }

// Pop-up global de pendência de consumo de água, montado sempre em App.tsx
// (mesmo padrão de FunapReminderModal.tsx): aparece independente da página em
// que a escola estiver. Mostrado uma vez por acesso/dia — "Lembrar depois"
// grava um flag em sessionStorage por data, então volta a aparecer numa aba
// nova ou no dia seguinte, mas não fica reaparecendo a cada navegação interna.
export function AlertaAguaPendenteModal({
  currentPage,
  onNavigate,
}: {
  currentPage: string;
  onNavigate: (page: string) => void;
}) {
  const [visible, setVisible] = useState(false);
  const [totalDias, setTotalDias] = useState(0);
  const [meses, setMeses] = useState<MesPendente[]>([]);

  const dismissKey = `sge_agua_pendente_dismissado_${formatDateToYMD(new Date())}`;

  useEffect(() => {
    if (currentPage === CONSUMO_AGUA_PAGE_ID) return;
    verificarPendencia();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function verificarPendencia() {
    try {
      if (sessionStorage.getItem(dismissKey)) return;

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: profile } = await (supabase as any)
        .from('profiles')
        .select('role, school_id')
        .eq('id', user.id)
        .single();

      const role = resolveViewRole(profile?.role || '');
      if (role !== 'school_manager' || !profile?.school_id) return;

      const hoje = new Date();
      const seisMesesAtras = new Date(hoje.getFullYear(), hoje.getMonth() - 5, 1);
      const windowStart = seisMesesAtras > WATER_REPORTING_HARD_START ? seisMesesAtras : WATER_REPORTING_HARD_START;

      const { data, error } = await (supabase as any).rpc('get_pending_water_schools', {
        p_window_start: formatDateToYMD(windowStart),
        p_today: formatDateToYMD(hoje),
      });
      if (error) throw error;

      const daEscola = (data || []).filter((row: any) => row.school_id === profile.school_id);
      const total = daEscola.reduce((soma: number, row: any) => soma + (row.missing_days || 0), 0);
      if (total <= LIMITE_DIAS_PENDENTES) return;

      setMeses(
        daEscola
          .map((row: any) => ({ year: row.year, month: row.month, missingDays: row.missing_days }))
          .sort((a: MesPendente, b: MesPendente) => a.year - b.year || a.month - b.month),
      );
      setTotalDias(total);
      setVisible(true);
    } catch (e) {
      console.error('Erro ao verificar pendência de consumo de água:', e);
    }
  }

  const dismiss = () => {
    try { sessionStorage.setItem(dismissKey, '1'); } catch { /* modo privado */ }
    setVisible(false);
  };

  const registrar = () => {
    dismiss();
    onNavigate(CONSUMO_AGUA_PAGE_ID);
  };

  if (!visible) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[9999] p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 relative">
        <button onClick={dismiss} className="absolute top-4 right-4 text-slate-400 hover:text-slate-600">
          <X size={20} />
        </button>
        <div className="w-12 h-12 rounded-xl bg-blue-100 flex items-center justify-center mb-4">
          <Droplets size={24} className="text-blue-600" />
        </div>
        <h2 className="text-lg font-bold text-slate-800">Consumo de água pendente</h2>
        <p className="text-sm text-slate-600 mt-2 leading-relaxed">
          Sua escola está com <strong>{totalDias} dia{totalDias === 1 ? '' : 's'} úteis</strong> sem
          registro de consumo de água. Registre a leitura para regularizar a pendência junto à URE.
        </p>

        {meses.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {meses.map((m) => (
              <span
                key={`${m.year}-${m.month}`}
                className="text-xs text-blue-700 bg-blue-50 border border-blue-200 rounded-lg px-2 py-1 flex items-center gap-1.5"
              >
                <CalendarX2 size={12} />
                {MESES_PT[m.month - 1]}/{String(m.year).slice(2)}: {m.missingDays} dia{m.missingDays === 1 ? '' : 's'}
              </span>
            ))}
          </div>
        )}

        <div className="flex gap-2 mt-5">
          <button onClick={dismiss} className="flex-1 px-4 py-2.5 text-slate-600 border border-slate-200 rounded-lg text-sm font-medium hover:bg-slate-50">
            Lembrar depois
          </button>
          <button onClick={registrar} className="flex-1 flex items-center justify-center gap-1.5 px-4 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700">
            Registrar agora <ArrowRight size={15} />
          </button>
        </div>
      </div>
    </div>
  );
}

export default AlertaAguaPendenteModal;

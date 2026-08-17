import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { resolveViewRole } from '../lib/roles';
import { Megaphone, ShieldCheck, Loader2 } from 'lucide-react';

interface PendingAlert {
  recipientId: string;
  mensagem: string;
  criadoPorNome: string;
  criadoEm: string;
}

// Pop-up global de aviso do fiscal/admin para a escola — montado sempre em
// App.tsx (mesmo padrão de FunapReminderModal.tsx), aparece independente da
// página em que a escola estiver. Só fecha confirmando "Estou ciente" (sem
// botão de fechar), porque o que o fiscal precisa é saber quem realmente
// tomou ciência, não só quem fechou a tela.
export function AlertaEscolaModal() {
  const [fila, setFila] = useState<PendingAlert[]>([]);
  const [confirmando, setConfirmando] = useState(false);

  useEffect(() => {
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let cancelado = false;

    (async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user || cancelado) return;
        const { data: profile } = await (supabase as any)
          .from('profiles').select('role, school_id').eq('id', user.id).single();
        const role = resolveViewRole(profile?.role || '');
        if (role !== 'school_manager' || !profile?.school_id || cancelado) return;

        await fetchPendentes(profile.school_id);
        if (cancelado) return;

        channel = supabase
          .channel(`admin-alerts-${profile.school_id}`)
          .on('postgres_changes', {
            event: 'INSERT', schema: 'public', table: 'admin_alert_recipients',
            filter: `school_id=eq.${profile.school_id}`,
          }, () => fetchPendentes(profile.school_id))
          .subscribe();
      } catch (err) {
        console.error('Erro ao verificar alertas pendentes:', err);
      }
    })();

    return () => {
      cancelado = true;
      if (channel) supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function fetchPendentes(schoolId: string) {
    try {
      const { data, error } = await (supabase as any)
        .from('admin_alert_recipients')
        .select('id, visualizado_em, admin_alerts(mensagem, criado_por_nome, criado_em)')
        .eq('school_id', schoolId)
        .is('visualizado_em', null)
        .order('created_at', { ascending: true });
      if (error) throw error;
      setFila((data || []).map((r: any) => ({
        recipientId: r.id,
        mensagem: r.admin_alerts?.mensagem || '',
        criadoPorNome: r.admin_alerts?.criado_por_nome || 'Fiscalização',
        criadoEm: r.admin_alerts?.criado_em || '',
      })));
    } catch (err) {
      console.error('Erro ao buscar alertas pendentes:', err);
    }
  }

  const confirmarCiencia = async () => {
    const atual = fila[0];
    if (!atual) return;
    setConfirmando(true);
    try {
      const { error } = await (supabase as any)
        .from('admin_alert_recipients')
        .update({ visualizado_em: new Date().toISOString() })
        .eq('id', atual.recipientId);
      if (error) throw error;
      setFila(prev => prev.slice(1));
    } catch (err) {
      console.error('Erro ao confirmar ciência do alerta:', err);
    } finally {
      setConfirmando(false);
    }
  };

  if (fila.length === 0) return null;
  const atual = fila[0];

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[9999] p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6">
        <div className="w-12 h-12 rounded-xl bg-red-100 flex items-center justify-center mb-4">
          <Megaphone size={24} className="text-red-600" />
        </div>
        <h2 className="text-lg font-bold text-slate-800">Aviso da Fiscalização</h2>
        <p className="text-sm text-slate-600 mt-2 leading-relaxed whitespace-pre-wrap">{atual.mensagem}</p>
        <p className="text-xs text-slate-400 mt-3">
          {atual.criadoPorNome}{atual.criadoEm ? ` · ${new Date(atual.criadoEm).toLocaleString('pt-BR')}` : ''}
        </p>
        {fila.length > 1 && (
          <p className="text-xs text-amber-600 mt-2 font-semibold">+ {fila.length - 1} outro(s) aviso(s) pendente(s)</p>
        )}
        <button
          onClick={confirmarCiencia} disabled={confirmando}
          className="w-full mt-5 flex items-center justify-center gap-2 px-4 py-3 bg-blue-600 text-white rounded-lg text-sm font-bold hover:bg-blue-700 disabled:opacity-60"
        >
          {confirmando ? <Loader2 className="animate-spin" size={16} /> : <ShieldCheck size={16} />} Estou ciente
        </button>
      </div>
    </div>
  );
}

export default AlertaEscolaModal;

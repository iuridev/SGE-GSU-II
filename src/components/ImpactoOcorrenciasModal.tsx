import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { resolveViewRole } from '../lib/roles';
import { AlertTriangle, CheckCircle2, Loader2 } from 'lucide-react';
import { getMesesPendentesDeAvaliacao, IMPACTO_OPTIONS, type GrauImpacto } from '../lib/fiscalizacaoTerceirizados';

const FUNCTION_NAME = 'google-sheets-fiscalizacao-terceirizados';

interface PendingMonth {
  mes: string;
  quantidade: number;
}

// Pop-up global de avaliação de impacto das ocorrências do mês — mesma
// pergunta que também aparece dentro da aba Satisfação da Fiscalização
// (src/pages/fiscalizacao.tsx). Os dois lugares leem a mesma fonte
// (Occurrences + OccurrenceImpactReviews via Edge Function), então
// responder em qualquer um dos dois já tira o mês da fila do outro. Só
// checa uma vez ao carregar o app (igual FunapReminderModal) — a
// planilha não tem canal de tempo real como as tabelas do Supabase.
export function ImpactoOcorrenciasModal() {
  const [fila, setFila] = useState<PendingMonth[]>([]);
  const [escolaId, setEscolaId] = useState<string | null>(null);
  const [escolaNome, setEscolaNome] = useState('');
  const [grau, setGrau] = useState<GrauImpacto | ''>('');
  const [comentario, setComentario] = useState('');
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        const { data: profile } = await (supabase as any)
          .from('profiles').select('role, school_id, full_name').eq('id', user.id).single();
        const role = resolveViewRole(profile?.role || '');
        if (role !== 'school_manager' || !profile?.school_id) return;

        const { data, error } = await supabase.functions.invoke(FUNCTION_NAME, { method: 'GET' });
        if (error) throw error;

        const occurrences = Array.isArray(data?.occurrences) ? data.occurrences : [];
        const reviews = Array.isArray(data?.occurrenceImpactReviews) ? data.occurrenceImpactReviews : [];
        const pendentes = getMesesPendentesDeAvaliacao(occurrences, reviews, profile.school_id);
        if (pendentes.length === 0) return;

        setEscolaId(profile.school_id);
        setEscolaNome(profile.full_name || '');
        setFila(pendentes);
      } catch (err) {
        console.error('Erro ao verificar avaliações de impacto pendentes:', err);
      }
    })();
  }, []);

  const atual = fila[0];

  const enviar = async () => {
    if (!atual || !escolaId) return;
    if (!grau) return;
    setEnviando(true);
    try {
      const { error } = await supabase.functions.invoke(FUNCTION_NAME, {
        body: {
          entity: 'occurrenceImpactReview', action: 'create',
          data: {
            id: `imp-${escolaId}-${atual.mes}-${Date.now()}`,
            escolaId,
            mesReferencia: atual.mes,
            quantidadeOcorrencias: String(atual.quantidade),
            grauImpacto: grau,
            comentario,
            registradoPor: escolaNome,
            criadoEm: new Date().toISOString(),
          },
        },
      });
      if (error) throw error;
      setFila(prev => prev.slice(1));
      setGrau('');
      setComentario('');
    } catch (err) {
      console.error('Erro ao registrar avaliação de impacto:', err);
    } finally {
      setEnviando(false);
    }
  };

  if (!atual) return null;

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[9999] p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6">
        <div className="w-12 h-12 rounded-xl bg-amber-100 flex items-center justify-center mb-4">
          <AlertTriangle size={24} className="text-amber-600" />
        </div>
        <h2 className="text-lg font-bold text-slate-800">Avaliação de impacto das ocorrências</h2>
        <p className="text-sm text-slate-600 mt-2 leading-relaxed">
          Em <strong>{new Date(`${atual.mes}-01T12:00:00`).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}</strong>, sua escola teve{' '}
          <strong>{atual.quantidade} ocorrência{atual.quantidade > 1 ? 's' : ''}</strong> de serviços terceirizados registrada{atual.quantidade > 1 ? 's' : ''}.
          O quanto isso impactou a qualidade do serviço?
        </p>

        <div className="flex gap-2 mt-4">
          {IMPACTO_OPTIONS.map(opt => (
            <button
              key={opt.valor}
              onClick={() => setGrau(opt.valor)}
              className={`flex-1 py-2.5 rounded-lg text-xs font-bold border-2 transition-colors ${grau === opt.valor ? opt.cor + ' border-transparent' : 'bg-white border-slate-200 text-slate-500'}`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        <textarea
          rows={2} placeholder="Comentário (opcional)"
          className="w-full mt-3 p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:border-blue-500 resize-none"
          value={comentario}
          onChange={e => setComentario(e.target.value)}
        />

        {fila.length > 1 && (
          <p className="text-xs text-amber-600 mt-2 font-semibold">+ {fila.length - 1} outro(s) mês(es) pendente(s)</p>
        )}

        <button
          onClick={enviar} disabled={!grau || enviando}
          className="w-full mt-5 flex items-center justify-center gap-2 px-4 py-3 bg-blue-600 text-white rounded-lg text-sm font-bold hover:bg-blue-700 disabled:opacity-60"
        >
          {enviando ? <Loader2 className="animate-spin" size={16} /> : <CheckCircle2 size={16} />} Enviar Avaliação
        </button>
      </div>
    </div>
  );
}

export default ImpactoOcorrenciasModal;

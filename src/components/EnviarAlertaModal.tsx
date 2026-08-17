import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import toast from 'react-hot-toast';
import { X, Send, Loader2, Megaphone, History, ChevronDown, CheckCircle2, Circle } from 'lucide-react';

export interface EscolaAlvo { id: string; nome: string; }

interface Props {
  escolasSugeridas: EscolaAlvo[];
  mensagemSugerida: string;
  onClose: () => void;
}

interface AlertaEnviado {
  id: string;
  mensagem: string;
  criadoPorNome: string;
  criadoEm: string;
}

interface DestinatarioStatus {
  escolaId: string;
  escolaNome: string;
  visualizadoEm: string | null;
}

// Compor + histórico de alertas enviados às escolas. Aberto pelo botão
// "Enviar Alerta" no banner de checklist da Fiscalização — a lista de
// escolas sugeridas vem pré-marcada com quem está devendo, mas dá pra
// ajustar antes de enviar.
export function EnviarAlertaModal({ escolasSugeridas, mensagemSugerida, onClose }: Props) {
  const [selecionadas, setSelecionadas] = useState<Set<string>>(new Set(escolasSugeridas.map(e => e.id)));
  const [mensagem, setMensagem] = useState(mensagemSugerida);
  const [enviando, setEnviando] = useState(false);

  const [historico, setHistorico] = useState<AlertaEnviado[]>([]);
  const [loadingHistorico, setLoadingHistorico] = useState(true);
  const [destinatariosPorAlerta, setDestinatariosPorAlerta] = useState<Record<string, DestinatarioStatus[]>>({});
  const [expandido, setExpandido] = useState<string | null>(null);

  useEffect(() => { fetchHistorico(); }, []);

  async function fetchHistorico() {
    setLoadingHistorico(true);
    try {
      const { data, error } = await (supabase as any)
        .from('admin_alerts')
        .select('id, mensagem, criado_por_nome, criado_em')
        .order('criado_em', { ascending: false })
        .limit(20);
      if (error) throw error;
      setHistorico((data || []).map((a: any) => ({
        id: a.id, mensagem: a.mensagem, criadoPorNome: a.criado_por_nome, criadoEm: a.criado_em,
      })));
    } catch (err) {
      console.error('Erro ao buscar histórico de alertas:', err);
      toast.error('Não foi possível carregar o histórico de alertas.');
    } finally {
      setLoadingHistorico(false);
    }
  }

  const toggleEscola = (id: string) => {
    setSelecionadas(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const handleEnviar = async () => {
    if (selecionadas.size === 0) { toast.error('Selecione ao menos uma escola.'); return; }
    if (!mensagem.trim()) { toast.error('Escreva a mensagem do alerta.'); return; }

    setEnviando(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Sessão expirada.');
      const { data: profile } = await (supabase as any).from('profiles').select('full_name').eq('id', user.id).single();

      const { data: alerta, error: alertaError } = await (supabase as any)
        .from('admin_alerts')
        .insert({ mensagem: mensagem.trim(), criado_por: user.id, criado_por_nome: profile?.full_name || user.email })
        .select().single();
      if (alertaError) throw alertaError;

      const recipients = Array.from(selecionadas).map(escolaId => ({ alert_id: alerta.id, school_id: escolaId }));
      const { error: recipientsError } = await (supabase as any).from('admin_alert_recipients').insert(recipients);
      if (recipientsError) throw recipientsError;

      toast.success(`Alerta enviado para ${recipients.length} escola${recipients.length > 1 ? 's' : ''}!`);
      setMensagem(mensagemSugerida);
      fetchHistorico();
    } catch (err) {
      console.error('Erro ao enviar alerta:', err);
      toast.error('Não foi possível enviar o alerta, tente novamente.');
    } finally {
      setEnviando(false);
    }
  };

  const toggleExpandir = async (alertaId: string) => {
    if (expandido === alertaId) { setExpandido(null); return; }
    setExpandido(alertaId);
    if (destinatariosPorAlerta[alertaId]) return;
    try {
      const { data, error } = await (supabase as any)
        .from('admin_alert_recipients')
        .select('school_id, visualizado_em, schools(name)')
        .eq('alert_id', alertaId);
      if (error) throw error;
      setDestinatariosPorAlerta(prev => ({
        ...prev,
        [alertaId]: (data || []).map((d: any) => ({
          escolaId: d.school_id, escolaNome: d.schools?.name || d.school_id, visualizadoEm: d.visualizado_em,
        })),
      }));
    } catch (err) {
      console.error('Erro ao buscar destinatários do alerta:', err);
      toast.error('Não foi possível carregar os destinatários.');
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/70 backdrop-blur-sm p-4" onClick={onClose}>
      <div
        className="bg-white rounded-3xl w-full max-w-2xl max-h-[90vh] shadow-2xl overflow-hidden flex flex-col animate-in zoom-in-95 duration-200"
        onClick={e => e.stopPropagation()}
      >
        <div className="p-6 border-b border-slate-100 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-red-600 rounded-2xl text-white shrink-0"><Megaphone size={22} /></div>
            <div>
              <h2 className="font-black text-slate-900 text-lg leading-none">Enviar Alerta às Escolas</h2>
              <p className="text-xs text-slate-400 mt-1">Pop-up obrigatório, com confirmação de leitura</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full text-slate-400"><X size={22} /></button>
        </div>

        <div className="p-6 overflow-y-auto flex-1 space-y-6">
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <label className="text-xs font-bold text-slate-500 uppercase">Escolas ({selecionadas.size} selecionada{selecionadas.size !== 1 ? 's' : ''})</label>
              <div className="flex items-center gap-3">
                <button type="button" onClick={() => setSelecionadas(new Set(escolasSugeridas.map(e => e.id)))} className="text-xs font-bold text-blue-600 hover:underline">
                  Selecionar todas
                </button>
                <button type="button" onClick={() => setSelecionadas(new Set())} className="text-xs font-bold text-slate-400 hover:underline">
                  Desmarcar todas
                </button>
              </div>
            </div>
            <div className="max-h-40 overflow-y-auto border border-slate-200 rounded-xl divide-y divide-slate-100">
              {escolasSugeridas.map(e => (
                <label key={e.id} className="flex items-center gap-3 px-3 py-2.5 text-sm cursor-pointer hover:bg-slate-50">
                  <input type="checkbox" className="accent-blue-600" checked={selecionadas.has(e.id)} onChange={() => toggleEscola(e.id)} />
                  {e.nome}
                </label>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-500 uppercase">Mensagem</label>
            <textarea
              rows={4}
              className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-medium outline-none focus:border-blue-500 resize-none"
              value={mensagem}
              onChange={e => setMensagem(e.target.value)}
            />
          </div>

          <button
            onClick={handleEnviar} disabled={enviando}
            className="w-full sm:w-auto px-8 py-3.5 bg-red-600 hover:bg-red-700 text-white rounded-xl font-bold shadow-md transition-all flex items-center justify-center gap-2 disabled:opacity-60"
          >
            {enviando ? <Loader2 className="animate-spin" size={18} /> : <Send size={18} />} Enviar Alerta
          </button>

          <div className="pt-4 border-t border-slate-100 space-y-2">
            <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest flex items-center gap-2"><History size={14} /> Histórico de Alertas Enviados</h3>
            {loadingHistorico ? (
              <div className="flex justify-center py-6"><Loader2 className="animate-spin text-blue-600" size={24} /></div>
            ) : historico.length === 0 ? (
              <p className="text-sm text-slate-400 py-4">Nenhum alerta enviado ainda.</p>
            ) : historico.map(a => (
              <div key={a.id} className="border border-slate-200 rounded-xl overflow-hidden">
                <button onClick={() => toggleExpandir(a.id)} className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left hover:bg-slate-50">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-700 truncate">{a.mensagem}</p>
                    <p className="text-xs text-slate-400">{a.criadoPorNome} · {new Date(a.criadoEm).toLocaleString('pt-BR')}</p>
                  </div>
                  <ChevronDown size={16} className={`shrink-0 text-slate-400 transition-transform ${expandido === a.id ? 'rotate-180' : ''}`} />
                </button>
                {expandido === a.id && (
                  <div className="px-4 pb-3 space-y-1.5 bg-slate-50">
                    {(destinatariosPorAlerta[a.id] || []).map(d => (
                      <div key={d.escolaId} className="flex items-center gap-2 text-xs">
                        {d.visualizadoEm ? <CheckCircle2 size={14} className="text-emerald-500 shrink-0" /> : <Circle size={14} className="text-slate-300 shrink-0" />}
                        <span className="text-slate-600">{d.escolaNome}</span>
                        {d.visualizadoEm && <span className="text-slate-400">— visualizado em {new Date(d.visualizadoEm).toLocaleString('pt-BR')}</span>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default EnviarAlertaModal;

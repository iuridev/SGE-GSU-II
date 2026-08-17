import { useState } from 'react';
import { supabase } from '../lib/supabase';
import toast from 'react-hot-toast';
import { X, ShieldOff, Loader2, Trash2 } from 'lucide-react';
import { isAtivo, type ServiceExemption } from '../lib/fiscalizacaoTerceirizados';

const FUNCTION_NAME = 'google-sheets-fiscalizacao-terceirizados';

interface Escola { id: string; name: string; }
interface Servico { id: string; nome: string; }

interface Props {
  schools: Escola[];
  serviceTypes: Servico[];
  exemptions: ServiceExemption[];
  currentUserName: string;
  onClose: () => void;
  onChanged: () => void;
}

// Gerenciar quais escolas o fiscal considera fora de um contrato/serviço —
// isentas não entram nos alertas de checklist obrigatório nem no painel de
// "escolas que precisam de atenção" daquele serviço específico. "Remover"
// só desativa a linha (ativo=nao), nunca apaga — mantém o histórico de quem
// foi isento, quando e por quê.
export function IsencaoServicoModal({ schools, serviceTypes, exemptions, currentUserName, onClose, onChanged }: Props) {
  const [escolaId, setEscolaId] = useState('');
  const [serviceTypeId, setServiceTypeId] = useState('');
  const [motivo, setMotivo] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [removendoId, setRemovendoId] = useState<string | null>(null);

  const escolaNome = (id: string) => schools.find(s => s.id === id)?.name || id;
  const servicoNome = (id: string) => serviceTypes.find(s => s.id === id)?.nome || id;

  const isentasAtivas = exemptions.filter(e => isAtivo(e.ativo));

  const handleIsentar = async () => {
    if (!escolaId) { toast.error('Selecione a escola.'); return; }
    if (!serviceTypeId) { toast.error('Selecione o serviço.'); return; }
    if (isentasAtivas.some(e => e.escolaId === escolaId && e.serviceTypeId === serviceTypeId)) {
      toast.error('Esta escola já está isenta deste serviço.');
      return;
    }

    setSalvando(true);
    try {
      const { error } = await supabase.functions.invoke(FUNCTION_NAME, {
        body: {
          entity: 'serviceExemption', action: 'create',
          data: {
            id: `isen-${Date.now()}`,
            escolaId, serviceTypeId,
            motivo: motivo.trim(),
            ativo: 'sim',
            isentoPor: currentUserName,
            criadoEm: new Date().toISOString(),
          },
        },
      });
      if (error) throw error;
      toast.success('Escola isentada deste serviço.');
      setEscolaId(''); setServiceTypeId(''); setMotivo('');
      onChanged();
    } catch (err) {
      console.error('Erro ao registrar isenção:', err);
      toast.error('Não foi possível registrar a isenção, tente novamente.');
    } finally {
      setSalvando(false);
    }
  };

  const handleRemover = async (isencao: ServiceExemption) => {
    setRemovendoId(isencao.id);
    try {
      const { error } = await supabase.functions.invoke(FUNCTION_NAME, {
        body: { entity: 'serviceExemption', action: 'update', id: isencao.id, data: { ativo: 'nao' } },
      });
      if (error) throw error;
      toast.success('Isenção removida.');
      onChanged();
    } catch (err) {
      console.error('Erro ao remover isenção:', err);
      toast.error('Não foi possível remover a isenção, tente novamente.');
    } finally {
      setRemovendoId(null);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/70 backdrop-blur-sm p-4" onClick={onClose}>
      <div
        className="bg-white rounded-3xl w-full max-w-lg max-h-[90vh] shadow-2xl overflow-hidden flex flex-col animate-in zoom-in-95 duration-200"
        onClick={e => e.stopPropagation()}
      >
        <div className="p-6 border-b border-slate-100 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-slate-700 rounded-2xl text-white shrink-0"><ShieldOff size={22} /></div>
            <div>
              <h2 className="font-black text-slate-900 text-lg leading-none">Isenções de Serviço</h2>
              <p className="text-xs text-slate-400 mt-1">Escolas fora do contrato de um serviço não entram nos alertas dele</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full text-slate-400"><X size={22} /></button>
        </div>

        <div className="p-6 overflow-y-auto flex-1 space-y-6">
          <div className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <select
                className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-medium outline-none focus:border-blue-500"
                value={escolaId} onChange={e => setEscolaId(e.target.value)}
              >
                <option value="">Selecione a escola...</option>
                {schools.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
              <select
                className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-medium outline-none focus:border-blue-500"
                value={serviceTypeId} onChange={e => setServiceTypeId(e.target.value)}
              >
                <option value="">Selecione o serviço...</option>
                {serviceTypes.map(s => <option key={s.id} value={s.id}>{s.nome}</option>)}
              </select>
            </div>
            <textarea
              rows={2} placeholder="Motivo (opcional)"
              className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-medium outline-none focus:border-blue-500 resize-none"
              value={motivo} onChange={e => setMotivo(e.target.value)}
            />
            <button
              onClick={handleIsentar} disabled={salvando}
              className="w-full sm:w-auto px-8 py-3 bg-slate-800 hover:bg-slate-900 text-white rounded-xl font-bold shadow-md transition-all flex items-center justify-center gap-2 disabled:opacity-60"
            >
              {salvando ? <Loader2 className="animate-spin" size={18} /> : <ShieldOff size={18} />} Isentar
            </button>
          </div>

          <div className="pt-4 border-t border-slate-100 space-y-2">
            <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest">Escolas isentas atualmente</h3>
            {isentasAtivas.length === 0 ? (
              <p className="text-sm text-slate-400 py-4">Nenhuma escola isenta no momento.</p>
            ) : isentasAtivas.map(e => (
              <div key={e.id} className="flex items-center justify-between gap-3 bg-slate-50 rounded-xl px-4 py-3 border border-slate-100">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-700 truncate">{escolaNome(e.escolaId)} — {servicoNome(e.serviceTypeId)}</p>
                  {e.motivo && <p className="text-xs text-slate-500 truncate">{e.motivo}</p>}
                </div>
                <button
                  onClick={() => handleRemover(e)} disabled={removendoId === e.id}
                  className="shrink-0 p-2 text-red-500 hover:bg-red-50 rounded-lg disabled:opacity-60"
                  title="Remover isenção"
                >
                  {removendoId === e.id ? <Loader2 className="animate-spin" size={16} /> : <Trash2 size={16} />}
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default IsencaoServicoModal;

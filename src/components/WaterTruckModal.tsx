import { useState } from 'react';
import { X, Droplets, Send, Loader2, CheckCircle2, ClipboardCheck } from 'lucide-react';
import { supabase } from '../lib/supabase';

interface WaterTruckModalProps {
  isOpen: boolean;
  onClose: () => void;
  schoolName: string;
  userName: string;
  sabespCode: string;
}

export function WaterTruckModal({ isOpen, onClose, schoolName, userName, sabespCode }: WaterTruckModalProps) {
  // Estado para as 7 perguntas técnicas obrigatórias do protocolo
  const [formData, setFormData] = useState({
    q1_registro: '',
    q2_reservatorio: '',
    q3_engate: '',
    q4_distancia: '',
    q5_altura: '',
    q6_capacidade: '',
    q7_funcionario: ''
  });

  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  if (!isOpen) return null;

  // Formatação do relatório para o corpo do e-mail
  const formatReport = () => {
    return `1 - Verificou se tem registro fechado? ${formData.q1_registro}
2 - Olhou no reservatório se realmente está sem água? ${formData.q2_reservatorio}
3 - A Caixa d'água tem engate de abastecimento? ${formData.q3_engate}
4 - Qual a distância entre o caminhão e o reservatório? ${formData.q4_distancia}
5 - Qual a altura do reservatório? ${formData.q5_altura}
6 - Qual a capacidade do reservatório? ${formData.q6_capacidade}
7 - Qual o nome do funcionário para auxiliar o motorista no abastecimento? ${formData.q7_funcionario}`;
  };

  const handleAutomaticSolicitation = async () => {
    // Validação de preenchimento obrigatório
    const isFormIncomplete = Object.values(formData).some(value => value.trim() === '');
    if (isFormIncomplete) {
      alert("Por favor, responda todas as 7 perguntas do checklist técnico antes de enviar.");
      return;
    }
    
    setLoading(true);
    try {
      // Invocação da Edge Function
      const { data, error } = await supabase.functions.invoke('send-outage-email', {
        body: { 
          type: 'WATER_TRUCK',
          schoolName,
          userName,
          data: { 
            notes: formatReport(),
            sabespCode 
          }
        }
      });

      // Tratamento de erro detalhado vindo do servidor
      if (error) {
        let errorMsg = error.message;
        // Tenta extrair a mensagem de erro que a nossa função enviou no JSON (ex: domínio não verificado)
        try {
          if (data && data.error) errorMsg = data.error;
        } catch (e) {
          // Mantém o erro original se falhar ao processar JSON
        }
        throw new Error(errorMsg);
      }

      setSent(true);
      setTimeout(onClose, 3000);
    } catch (error: any) {
      console.error("Erro no envio:", error);
      alert("FALHA NO ENVIO:\n" + error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/70 backdrop-blur-sm p-4">
      <div className="bg-white rounded-[2.5rem] w-full max-w-2xl shadow-2xl overflow-hidden border border-white animate-in zoom-in-95 duration-200">
        <div className="p-8 border-b border-slate-100 flex justify-between items-center bg-blue-50/50">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-blue-600 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-blue-200">
              <Droplets size={24} />
            </div>
            <div>
              <h2 className="text-xl font-black text-slate-800 uppercase tracking-tight">Solicitar Caminhão Pipa</h2>
              <p className="text-xs text-blue-600 font-bold uppercase tracking-widest">Protocolo GSU-SEOM</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-white rounded-full text-slate-400 transition-colors"><X size={24} /></button>
        </div>

        <div className="p-8 space-y-6 max-h-[75vh] overflow-y-auto custom-scrollbar">
          {sent ? (
            <div className="py-12 text-center space-y-4 animate-in fade-in">
              <div className="w-20 h-20 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto animate-bounce">
                <CheckCircle2 size={40} />
              </div>
              <h3 className="text-2xl font-black text-slate-800 tracking-tight">Solicitação Protocolada!</h3>
              <p className="text-slate-500 font-medium px-10">O checklist técnico e o código Sabesp foram enviados para <strong>gsu.seom@educacao.sp.gov.br</strong>.</p>
            </div>
          ) : (
            <>
              <div className="flex flex-col md:flex-row gap-4">
                <div className="flex-1 bg-slate-50 p-4 rounded-2xl border border-slate-100">
                  <p className="text-[10px] font-black text-slate-400 uppercase mb-1">Unidade Escolar</p>
                  <p className="text-[13px] font-bold text-slate-700 truncate">{schoolName}</p>
                </div>
                <div className="w-full md:w-48 bg-blue-50/50 p-4 rounded-2xl border border-blue-100">
                  <p className="text-[10px] font-black text-blue-400 uppercase mb-1">Cód. Sabesp</p>
                  <p className="text-[13px] font-bold text-blue-700">{sabespCode}</p>
                </div>
              </div>

              <div className="space-y-4">
                <div className="flex items-center gap-2 text-slate-800 font-black uppercase text-xs tracking-widest mb-2">
                  <ClipboardCheck size={16} className="text-blue-600" /> Checklist Técnico de Verificação
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <QuestionSelect label="1 - Registro fechado?" value={formData.q1_registro} onChange={(v) => setFormData({...formData, q1_registro: v})} />
                  <QuestionSelect label="2 - Reservatório sem água?" value={formData.q2_reservatorio} onChange={(v) => setFormData({...formData, q2_reservatorio: v})} />
                  <QuestionSelect label="3 - Tem engate de abastec.?" value={formData.q3_engate} onChange={(v) => setFormData({...formData, q3_engate: v})} />
                  <QuestionInput label="4 - Distância (Caminhão x Caixa)" placeholder="Ex: 15 metros" value={formData.q4_distancia} onChange={(v) => setFormData({...formData, q4_distancia: v})} />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <QuestionInput label="5 - Altura do Reservatório" placeholder="Ex: 10 metros" value={formData.q5_altura} onChange={(v) => setFormData({...formData, q5_altura: v})} />
                  <QuestionInput label="6 - Capacidade (Litros)" placeholder="Ex: 20.000 L" value={formData.q6_capacidade} onChange={(v) => setFormData({...formData, q6_capacidade: v})} />
                </div>

                <QuestionInput label="7 - Funcionário para auxiliar" placeholder="Nome completo do responsável na unidade" value={formData.q7_funcionario} onChange={(v) => setFormData({...formData, q7_funcionario: v})} />
              </div>

              <div className="pt-6">
                <button 
                  onClick={handleAutomaticSolicitation} 
                  disabled={loading} 
                  className="w-full py-4 bg-blue-600 text-white rounded-2xl font-black shadow-lg shadow-blue-200 hover:bg-blue-700 flex items-center justify-center gap-3 transition-all active:scale-95 disabled:opacity-50"
                >
                  {loading ? <><Loader2 className="animate-spin" size={20} /> ENVIANDO...</> : <><Send size={20} /> ENVIAR SOLICITAÇÃO POR E-MAIL</>}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// Componentes Auxiliares com Tipagem Correta
interface QuestionProps {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}

function QuestionSelect({ label, value, onChange }: QuestionProps) {
  return (
    <div className="space-y-1.5">
      <label className="text-[10px] font-black text-slate-500 uppercase ml-1">{label}</label>
      <select 
        className="w-full p-3 bg-slate-50 border-2 border-slate-100 rounded-xl focus:border-blue-500 outline-none text-sm font-bold text-slate-700 transition-all cursor-pointer"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">Selecione...</option>
        <option value="SIM">SIM</option>
        <option value="NÃO">NÃO</option>
      </select>
    </div>
  );
}

function QuestionInput({ label, value, placeholder, onChange }: QuestionProps) {
  return (
    <div className="space-y-1.5">
      <label className="text-[10px] font-black text-slate-500 uppercase ml-1">{label}</label>
      <input 
        type="text"
        placeholder={placeholder}
        className="w-full p-3 bg-slate-50 border-2 border-slate-100 rounded-xl focus:border-blue-500 outline-none text-sm font-bold text-slate-700 transition-all"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}
import { useState } from 'react';
import { X, Droplets, Send, Loader2, CheckCircle2, ClipboardCheck } from 'lucide-react';
import { supabase } from '../lib/supabase';

interface WaterTruckModalProps {
  isOpen: boolean;
  onClose: () => void;
  schoolName: string;
  schoolId: string | null;
  userName: string;
  sabespCode: string;
}

export function WaterTruckModal({ isOpen, onClose, schoolName, schoolId, userName, sabespCode }: WaterTruckModalProps) {
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

  const formatReport = () => {
    return `1 - Verificou se tem registro fechado? ${formData.q1_registro}
2 - Olhou no reservatório se realmente está sem água? ${formData.q2_reservatorio}
3 - A Caixa d'água tem engate de abastecimento? ${formData.q3_engate}
4 - Qual a distância entre o caminhão e o reservatório? ${formData.q4_distancia}
5 - Qual a altura do reservatório? ${formData.q5_altura}
6 - Qual a capacidade do reservatório? ${formData.q6_capacidade}
7 - Qual o nome do funcionário para auxiliar o motorista no abastecimento? ${formData.q7_funcionario}`;
  };

  const handleSend = async () => {
    const isFormIncomplete = Object.values(formData).some(value => value.trim() === '');
    if (isFormIncomplete) {
      alert("Por favor, responda todas as 7 perguntas do checklist.");
      return;
    }
    
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('send-outage-email', {
        body: { 
          type: 'WATER_TRUCK',
          schoolName,
          schoolId, // CORREÇÃO: Enviando o ID para o banco
          userName,
          data: { 
            notes: formatReport(),
            sabespCode 
          }
        }
      });

      if (error) {
        const errorMsg = data?.error || error.message || "Erro no servidor.";
        throw new Error(errorMsg);
      }

      setSent(true);
      setTimeout(onClose, 3000);
    } catch (error: any) {
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
            <div className="w-12 h-12 bg-blue-600 rounded-2xl flex items-center justify-center text-white shadow-lg"><Droplets size={24} /></div>
            <div>
              <h2 className="text-xl font-black text-slate-800 uppercase tracking-tight">Solicitar Caminhão Pipa</h2>
              <p className="text-xs text-blue-600 font-bold uppercase tracking-widest">Protocolo GSU-SEOM</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-white rounded-full text-slate-400"><X size={24} /></button>
        </div>

        <div className="p-8 space-y-6 max-h-[75vh] overflow-y-auto custom-scrollbar">
          {sent ? (
            <div className="py-12 text-center space-y-4 animate-in fade-in">
              <div className="w-20 h-20 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto animate-bounce"><CheckCircle2 size={40} /></div>
              <h3 className="text-2xl font-black text-slate-800 tracking-tight">Pedido Enviado!</h3>
              <p className="text-slate-500 font-medium">O checklist foi encaminhado e registrado com sucesso.</p>
            </div>
          ) : (
            <>
              <div className="flex flex-col md:flex-row gap-4">
                <div className="flex-1 bg-slate-50 p-4 rounded-2xl border border-slate-100">
                  <p className="text-[10px] font-black text-slate-400 uppercase mb-1">Unidade Escolar</p>
                  <p className="text-[13px] font-bold text-slate-700 truncate uppercase">{schoolName}</p>
                </div>
                <div className="w-full md:w-48 bg-blue-50/50 p-4 rounded-2xl border border-blue-100">
                  <p className="text-[10px] font-black text-blue-400 uppercase mb-1">Cód. Sabesp</p>
                  <p className="text-[13px] font-bold text-blue-700">{sabespCode}</p>
                </div>
              </div>

              <div className="space-y-5">
                <div className="flex items-center gap-2 text-slate-800 font-black uppercase text-xs tracking-widest mb-2">
                  <ClipboardCheck size={16} className="text-blue-600" /> Checklist Obrigatório
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <QuestionSelect label="1. Registro fechado?" value={formData.q1_registro} onChange={(v: string) => setFormData({...formData, q1_registro: v})} />
                  <QuestionSelect label="2. Está sem água?" value={formData.q2_reservatorio} onChange={(v: string) => setFormData({...formData, q2_reservatorio: v})} />
                  <QuestionSelect label="3. Tem engate?" value={formData.q3_engate} onChange={(v: string) => setFormData({...formData, q3_engate: v})} />
                  <QuestionInput label="4. Distância (m)" placeholder="Ex: 10 metros" value={formData.q4_distancia} onChange={(v: string) => setFormData({...formData, q4_distancia: v})} />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <QuestionInput label="5. Altura do Reservatório" placeholder="Ex: 6m" value={formData.q5_altura} onChange={(v: string) => setFormData({...formData, q5_altura: v})} />
                  <QuestionInput label="6. Capacidade (L)" placeholder="Ex: 10.000 L" value={formData.q6_capacidade} onChange={(v: string) => setFormData({...formData, q6_capacidade: v})} />
                </div>
                <QuestionInput label="7. Funcionário para auxílio" placeholder="Nome do responsável" value={formData.q7_funcionario} onChange={(v: string) => setFormData({...formData, q7_funcionario: v})} />
              </div>

              <div className="pt-6">
                <button onClick={handleSend} disabled={loading} className="w-full py-4 bg-blue-600 text-white rounded-2xl font-black shadow-lg hover:bg-blue-700 flex items-center justify-center gap-3 transition-all active:scale-95 disabled:opacity-50">
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

function QuestionSelect({ label, value, onChange }: { label: string, value: string, onChange: (v: string) => void }) {
  return (
    <div className="space-y-1.5">
      <label className="text-[10px] font-black text-slate-500 uppercase ml-1">{label}</label>
      <select className="w-full p-3 bg-slate-50 border-2 border-slate-100 rounded-xl focus:border-blue-500 outline-none text-sm font-bold text-slate-700 cursor-pointer" value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">Selecione...</option>
        <option value="SIM">SIM</option>
        <option value="NÃO">NÃO</option>
      </select>
    </div>
  );
}

function QuestionInput({ label, value, placeholder, onChange }: { label: string, value: string, placeholder: string, onChange: (v: string) => void }) {
  return (
    <div className="space-y-1.5">
      <label className="text-[10px] font-black text-slate-500 uppercase ml-1">{label}</label>
      <input type="text" placeholder={placeholder} className="w-full p-3 bg-slate-50 border-2 border-slate-100 rounded-xl focus:border-blue-500 outline-none text-sm font-bold text-slate-700" value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}
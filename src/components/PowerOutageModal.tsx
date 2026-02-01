import { useState } from 'react';
import { X, Zap, Send, Loader2, CheckCircle2, ClipboardCheck } from 'lucide-react';
import { supabase } from '../lib/supabase';

interface PowerOutageModalProps {
  isOpen: boolean;
  onClose: () => void;
  schoolName: string;
  userName: string;
  edpCode: string;
}

export function PowerOutageModal({ isOpen, onClose, schoolName, userName, edpCode }: PowerOutageModalProps) {
  const [formData, setFormData] = useState({
    q1_disjuntor: '',
    q2_vizinhanca: '',
    q3_descricao: ''
  });

  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  if (!isOpen) return null;

  // Formatação organizada com quebras de linha para o e-mail
  const formatReport = () => {
    return `1 - Verificou o Disjuntor (ligou/desligou)? ${formData.q1_disjuntor}
    
2 - Verificou a Vizinhança (vizinhos sem luz)? ${formData.q2_vizinhanca}

3 - Descrição da Situação:
${formData.q3_descricao}`.trim();
  };

  const handleSendNotification = async () => {
    if (!formData.q1_disjuntor || !formData.q2_vizinhanca || !formData.q3_descricao.trim()) {
      alert("Por favor, responda todas as perguntas do checklist antes de enviar.");
      return;
    }
    
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('send-outage-email', {
        body: { 
          type: 'POWER_OUTAGE',
          schoolName,
          userName,
          data: { 
            notes: formatReport(),
            edpCode // Envia o código capturado do Dashboard
          }
        }
      });

      if (error) {
        let msg = error.message;
        if (data && data.error) msg = data.error;
        throw new Error(msg);
      }

      setSent(true);
      setTimeout(onClose, 3000);
    } catch (error: any) {
      alert("ERRO NO ENVIO:\n" + error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/70 backdrop-blur-sm p-4">
      <div className="bg-white rounded-[2.5rem] w-full max-w-2xl shadow-2xl overflow-hidden border border-white animate-in zoom-in-95 duration-200">
        
        {/* Cabeçalho */}
        <div className="p-8 border-b border-slate-100 flex justify-between items-center bg-slate-900 text-white">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-amber-400 rounded-2xl flex items-center justify-center text-slate-900 shadow-lg">
              <Zap size={24} />
            </div>
            <div>
              <h2 className="text-xl font-black uppercase tracking-tight leading-none">Queda de Energia</h2>
              <p className="text-[10px] text-amber-400 font-bold uppercase tracking-widest mt-1">Notificação de Manutenção</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full transition-colors text-slate-400"><X size={24} /></button>
        </div>

        <div className="p-8 space-y-6 max-h-[75vh] overflow-y-auto custom-scrollbar">
          {sent ? (
            <div className="py-12 text-center space-y-4 animate-in fade-in">
              <div className="w-20 h-20 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto animate-bounce"><CheckCircle2 size={40} /></div>
              <h3 className="text-2xl font-black text-slate-800 tracking-tight">Relato Enviado!</h3>
              <p className="text-slate-500 font-medium px-10">O chamado foi encaminhado para <strong>gsu.seom@educacao.sp.gov.br</strong>.</p>
            </div>
          ) : (
            <>
              {/* Info Unidade */}
              <div className="flex flex-col md:flex-row gap-4">
                <div className="flex-1 bg-slate-50 p-4 rounded-2xl border border-slate-100">
                  <p className="text-[10px] font-black text-slate-400 uppercase mb-1">Unidade Escolar</p>
                  <p className="text-[13px] font-bold text-slate-700 truncate uppercase">{schoolName}</p>
                </div>
                <div className="w-full md:w-48 bg-amber-50 p-4 rounded-2xl border border-amber-100 text-center">
                  <p className="text-[10px] font-black text-amber-600 uppercase mb-1">Instalação EDP</p>
                  <p className="text-[13px] font-bold text-slate-700 font-mono">{edpCode}</p>
                </div>
              </div>

              <div className="space-y-5">
                <div className="flex items-center gap-2 text-slate-800 font-black uppercase text-[10px] tracking-[0.2em] mb-2">
                  <ClipboardCheck size={14} className="text-amber-500" /> Procedimentos de Segurança
                </div>

                <div className="space-y-4">
                  <QuestionCard 
                    number="1"
                    title="Verifique o Disjuntor"
                    desc="Confira se o disjuntor no quadro ou no relógio não caiu. Desligue-o e ligue-o novamente. O problema foi resolvido?"
                    value={formData.q1_disjuntor}
                    onChange={(v) => setFormData({...formData, q1_disjuntor: v})}
                  />

                  <QuestionCard 
                    number="2"
                    title="Verifique a Vizinhança"
                    desc="Os postes da rua e os vizinhos também estão sem luz? (Se sim, o problema é na rede externa da distribuidora)."
                    value={formData.q2_vizinhanca}
                    onChange={(v) => setFormData({...formData, q2_vizinhanca: v})}
                  />

                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-500 uppercase ml-1">3 - Descrição Detalhada do Ocorrido:</label>
                    <textarea 
                      className="w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl focus:border-amber-500 focus:bg-white outline-none transition-all text-sm font-medium min-h-[120px] placeholder:text-slate-300"
                      placeholder="Descreva se o problema é em toda a escola, apenas em um bloco, se houve estouro no poste, etc..."
                      value={formData.q3_descricao}
                      onChange={(e) => setFormData({...formData, q3_descricao: e.target.value})}
                    />
                  </div>
                </div>
              </div>

              <div className="pt-4">
                <button 
                  onClick={handleSendNotification} 
                  disabled={loading} 
                  className="w-full py-4 bg-slate-900 text-white rounded-2xl font-black shadow-xl hover:bg-black flex items-center justify-center gap-3 transition-all active:scale-95 disabled:opacity-50"
                >
                  {loading ? <><Loader2 className="animate-spin" size={20} /> NOTIFICANDO...</> : <><Send size={20} /> ENVIAR NOTIFICAÇÃO POR E-MAIL</>}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// Componente Interno para as Perguntas do Checklist
function QuestionCard({ number, title, desc, value, onChange }: { number: string, title: string, desc: string, value: string, onChange: (v: string) => void }) {
  return (
    <div className="p-5 bg-slate-50 rounded-2xl border border-slate-100 space-y-3">
      <div className="flex items-start gap-3">
        <span className="w-6 h-6 bg-slate-900 text-white rounded-lg flex items-center justify-center text-[10px] font-black shrink-0">{number}</span>
        <div>
          <p className="text-sm font-black text-slate-800 uppercase leading-none mb-1">{title}</p>
          <p className="text-xs text-slate-500 font-medium leading-relaxed">{desc}</p>
        </div>
      </div>
      <div className="flex gap-2 pl-9">
        <button
          onClick={() => onChange('SIM')}
          className={`px-6 py-2 rounded-xl text-[10px] font-black transition-all border-2 ${value === 'SIM' ? 'bg-blue-600 border-blue-600 text-white shadow-md' : 'bg-white border-slate-200 text-slate-400 hover:border-slate-300'}`}
        >SIM</button>
        <button
          onClick={() => onChange('NÃO')}
          className={`px-6 py-2 rounded-xl text-[10px] font-black transition-all border-2 ${value === 'NÃO' ? 'bg-red-500 border-red-500 text-white shadow-md' : 'bg-white border-slate-200 text-slate-400 hover:border-slate-300'}`}
        >NÃO</button>
      </div>
    </div>
  );
}
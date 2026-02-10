import React, { useState, useEffect } from 'react';
import { X, Droplets, Send, Loader2, CheckCircle2, ClipboardCheck, Building2 } from 'lucide-react';
import { supabase } from '../lib/supabase';

interface WaterTruckModalProps {
  isOpen: boolean;
  onClose: () => void;
  schoolName: string;
  schoolId: string | null; // Pode ser null se for Admin
  userName: string;
  sabespCode: string;
}

interface SchoolOption {
  id: string;
  name: string;
  sabesp_supply_id: string;
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
  
  // Estados para Admin selecionar escola
  const [schoolsList, setSchoolsList] = useState<SchoolOption[]>([]);
  const [selectedSchoolId, setSelectedSchoolId] = useState<string>(schoolId || '');
  const [selectedSchoolName, setSelectedSchoolName] = useState<string>(schoolName || '');
  const [selectedSabesp, setSelectedSabesp] = useState<string>(sabespCode || '');

  // Se não tiver ID (Admin), busca lista de escolas
  useEffect(() => {
    if (isOpen && !schoolId) {
      fetchSchools();
    }
  }, [isOpen, schoolId]);

  async function fetchSchools() {
    const { data } = await (supabase as any).from('schools').select('id, name, sabesp_supply_id').order('name');
    setSchoolsList(data || []);
  }

  // Atualiza dados quando o admin troca a escola no select
  const handleSchoolChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const sId = e.target.value;
    setSelectedSchoolId(sId);
    const school = schoolsList.find(s => s.id === sId);
    if (school) {
      setSelectedSchoolName(school.name);
      setSelectedSabesp(school.sabesp_supply_id || 'N/A');
    }
  };

  const formatReport = () => {
    return `
1 - Verificou se tem registro fechado? ${formData.q1_registro}
2 - Olhou no reservatório se realmente está sem água? ${formData.q2_reservatorio}
3 - A Caixa d'água tem engate de abastecimento? ${formData.q3_engate}
4 - Qual a distância entre o caminhão e o reservatório? ${formData.q4_distancia} metros
5 - Qual a altura do reservatório? ${formData.q5_altura} metros
6 - Qual a capacidade do reservatório? ${formData.q6_capacidade} litros
7 - Qual o nome do funcionário para auxiliar? ${formData.q7_funcionario}
    `.trim();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSchoolId) {
      alert("Erro: Nenhuma escola vinculada para o registro.");
      return;
    }
    
    setLoading(true);

    try {
      const reportDetails = formatReport();

      // 1. Dispara E-mail via Edge Function
      const emailRes = await fetch('https://crmihiulaxxwmzivfmsm.supabase.co/functions/v1/send-outage-email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`
        },
        body: JSON.stringify({
          type: 'WATER_TRUCK',
          schoolName: selectedSchoolName,
          userName: userName,
          data: {
            notes: reportDetails,
            sabespCode: selectedSabesp
          }
        })
      });

      if (!emailRes.ok) throw new Error('Falha no envio do e-mail');

      // 2. Salva no Banco de Dados (Tabela occurrences)
      const { error: dbError } = await (supabase as any).from('occurrences').insert({
        type: 'WATER_TRUCK',
        school_id: selectedSchoolId,
        school_name: selectedSchoolName, // Redundância útil para relatórios rápidos
        user_name: userName,
        details: reportDetails,
        created_at: new Date().toISOString()
      });

      if (dbError) throw dbError;

      setSent(true);
      setTimeout(() => {
        onClose();
        setSent(false);
        setFormData({
            q1_registro: '', q2_reservatorio: '', q3_engate: '',
            q4_distancia: '', q5_altura: '', q6_capacidade: '', q7_funcionario: ''
        });
      }, 2500);

    } catch (error: any) {
      console.error(error);
      alert("Erro ao processar solicitação: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
      <div className="bg-white rounded-[2.5rem] w-full max-w-2xl shadow-2xl animate-in zoom-in-95 duration-200 overflow-hidden border border-white">
        
        {/* Header */}
        <div className="bg-blue-600 p-8 text-white flex justify-between items-center">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-white/20 rounded-2xl backdrop-blur-sm"><Droplets size={28} /></div>
            <div>
              <h2 className="text-2xl font-black uppercase tracking-tight">Caminhão Pipa</h2>
              <p className="text-blue-100 text-xs font-bold uppercase tracking-widest mt-1">Solicitação Emergencial de Água</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-white/20 rounded-full transition-colors"><X size={24} /></button>
        </div>

        {sent ? (
          <div className="p-16 flex flex-col items-center justify-center text-center space-y-6">
            <div className="w-24 h-24 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center animate-bounce">
              <CheckCircle2 size={48} />
            </div>
            <div>
              <h3 className="text-2xl font-black text-slate-800 uppercase">Solicitação Enviada!</h3>
              <p className="text-slate-500 font-medium mt-2">O pedido foi registrado no sistema e a Regional foi notificada por e-mail.</p>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="p-8 space-y-6 max-h-[70vh] overflow-y-auto custom-scrollbar">
            
            {/* Seletor de Escola (Apenas se não vier schoolId - caso de Admin) */}
            {!schoolId && (
              <div className="p-6 bg-slate-50 rounded-3xl border-2 border-slate-100">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 mb-2 block flex items-center gap-2">
                  <Building2 size={12}/> Selecione a Escola Solicitante
                </label>
                <select 
                  required 
                  className="w-full p-4 rounded-2xl border-2 border-slate-200 font-bold text-slate-700 focus:border-blue-500 outline-none"
                  value={selectedSchoolId}
                  onChange={handleSchoolChange}
                >
                  <option value="">-- Selecione na lista --</option>
                  {schoolsList.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
            )}

            <div className="bg-amber-50 p-6 rounded-3xl border border-amber-100 flex gap-4">
               <ClipboardCheck className="text-amber-500 shrink-0" size={24}/>
               <div>
                 <h4 className="text-sm font-black text-amber-800 uppercase mb-1">Checklist Obrigatório</h4>
                 <p className="text-xs text-amber-700 font-medium">Responda todas as perguntas técnicas abaixo para que a solicitação seja aprovada pela logística.</p>
               </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <QuestionSelect label="1. Registro Geral Fechado?" value={formData.q1_registro} onChange={v => setFormData({...formData, q1_registro: v})} />
              <QuestionSelect label="2. Reservatório Vazio?" value={formData.q2_reservatorio} onChange={v => setFormData({...formData, q2_reservatorio: v})} />
              <QuestionSelect label="3. Possui Engate?" value={formData.q3_engate} onChange={v => setFormData({...formData, q3_engate: v})} />
              <QuestionInput label="4. Distância (metros)" value={formData.q4_distancia} placeholder="Ex: 15" onChange={v => setFormData({...formData, q4_distancia: v})} />
              <QuestionInput label="5. Altura (metros)" value={formData.q5_altura} placeholder="Ex: 5" onChange={v => setFormData({...formData, q5_altura: v})} />
              <QuestionInput label="6. Capacidade (litros)" value={formData.q6_capacidade} placeholder="Ex: 10000" onChange={v => setFormData({...formData, q6_capacidade: v})} />
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-500 uppercase ml-1">7. Nome do Funcionário Responsável no Local</label>
              <input required className="w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl font-bold focus:border-blue-500 outline-none" placeholder="Quem vai receber o caminhão?" value={formData.q7_funcionario} onChange={e => setFormData({...formData, q7_funcionario: e.target.value})} />
            </div>

            <div className="pt-4 border-t border-slate-100 flex justify-end gap-3">
               <button type="button" onClick={onClose} className="px-8 py-4 text-slate-400 font-black uppercase text-xs hover:bg-slate-50 rounded-2xl transition-all">Cancelar</button>
               <button type="submit" disabled={loading} className="bg-blue-600 hover:bg-blue-700 text-white px-10 py-4 rounded-2xl font-black uppercase text-xs shadow-xl shadow-blue-200 flex items-center gap-3 transition-all active:scale-95 disabled:opacity-70">
                 {loading ? <Loader2 className="animate-spin" size={18}/> : <Send size={18}/>}
                 Confirmar Solicitação
               </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

// Componentes Auxiliares
function QuestionSelect({ label, value, onChange }: { label: string, value: string, onChange: (v: string) => void }) {
  return (
    <div className="space-y-1.5">
      <label className="text-[10px] font-black text-slate-500 uppercase ml-1">{label}</label>
      <select required className="w-full p-3 bg-slate-50 border-2 border-slate-100 rounded-xl focus:border-blue-500 outline-none text-sm font-bold text-slate-700" value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">Selecione...</option><option value="SIM">SIM</option><option value="NÃO">NÃO</option>
      </select>
    </div>
  );
}

function QuestionInput({ label, value, placeholder, onChange }: { label: string, value: string, placeholder: string, onChange: (v: string) => void }) {
  return (
    <div className="space-y-1.5">
      <label className="text-[10px] font-black text-slate-500 uppercase ml-1">{label}</label>
      <input required type="number" className="w-full p-3 bg-slate-50 border-2 border-slate-100 rounded-xl focus:border-blue-500 outline-none text-sm font-bold text-slate-700" placeholder={placeholder} value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}
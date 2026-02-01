import { useState } from 'react';
import { X, Droplet, CheckCircle, Truck, ArrowRight } from 'lucide-react';
import { supabase } from '../lib/supabase';

interface WaterTruckModalProps {
  isOpen: boolean;
  onClose: () => void;
  schoolName: string;
  userName: string;
  sabespId?: string;
}

export function WaterTruckModal({ isOpen, onClose, schoolName, userName, sabespId }: WaterTruckModalProps) {
  const [step, setStep] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Estado do Formulário
  const [formData, setFormData] = useState({
    registroFechado: '',
    reservatorioVazio: '',
    engateAbastecimento: '',
    distanciaCaminhao: '',
    alturaReservatorio: '',
    capacidadeReservatorio: '',
    nomeFuncionario: ''
  });

  if (!isOpen) return null;

  const handleClose = () => {
    setStep(1);
    setFormData({
      registroFechado: '',
      reservatorioVazio: '',
      engateAbastecimento: '',
      distanciaCaminhao: '',
      alturaReservatorio: '',
      capacidadeReservatorio: '',
      nomeFuncionario: ''
    });
    setIsSubmitting(false);
    onClose();
  };

  const handleNext = () => {
    // Validação simples antes de avançar
    if (step === 1) {
      if (!formData.registroFechado || !formData.reservatorioVazio || !formData.engateAbastecimento) {
        alert("Por favor, responda todas as perguntas de verificação.");
        return;
      }
    }
    setStep(prev => prev + 1);
  };

  const handleSubmit = async () => {
    // Validação final
    if (!formData.distanciaCaminhao || !formData.alturaReservatorio || !formData.capacidadeReservatorio || !formData.nomeFuncionario) {
      alert("Por favor, preencha todas as informações técnicas e o nome do responsável.");
      return;
    }

    setIsSubmitting(true);

    try {
      console.log("Enviando solicitação de caminhão pipa...");

      // Chama a Edge Function
      const { data, error } = await supabase.functions.invoke('send-outage-email', {
        body: {
          type: 'water_truck', // IMPORTANTE: Define o tipo para o email correto
          schoolName: schoolName || "Escola não identificada",
          userName: userName || "Usuário não identificado",
          sabespId: sabespId || "Não informado",
          details: formData,
          requesterName: userName,
          timestamp: new Date().toISOString()
        }
      });

      if (error) throw error;

      if (data?.error) {
        throw new Error(data.error);
      }

      console.log("Sucesso no envio:", data);
      setStep(3); // Tela de Sucesso

    } catch (error: any) {
      console.error("Erro ao enviar solicitação:", error);
      alert("Erro ao enviar a solicitação. Por favor, tente novamente.\n\nDetalhe: " + error.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="bg-blue-50 p-4 border-b border-blue-100 flex justify-between items-center">
          <div className="flex items-center gap-2 text-blue-700 font-bold">
            <Truck size={24} />
            <span>Solicitar Caminhão Pipa</span>
          </div>
          <button onClick={handleClose} className="text-slate-400 hover:text-slate-600">
            <X size={24} />
          </button>
        </div>

        {/* Corpo */}
        <div className="p-6 overflow-y-auto">
          
          {/* PASSO 1: VERIFICAÇÕES INICIAIS */}
          {step === 1 && (
            <div className="space-y-6">
              <div className="bg-yellow-50 border border-yellow-200 p-4 rounded-lg text-sm text-yellow-800">
                <strong>Atenção!</strong> Antes de solicitar, verifique os itens abaixo para evitar deslocamentos desnecessários.
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">1. Verificou se tem registro fechado?</label>
                  <div className="flex gap-4">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="radio" name="registroFechado" value="Sim" checked={formData.registroFechado === 'Sim'} onChange={(e) => setFormData({...formData, registroFechado: e.target.value})} className="text-blue-600 focus:ring-blue-500" />
                      <span>Sim</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="radio" name="registroFechado" value="Não" checked={formData.registroFechado === 'Não'} onChange={(e) => setFormData({...formData, registroFechado: e.target.value})} className="text-blue-600 focus:ring-blue-500" />
                      <span>Não</span>
                    </label>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">2. Olhou no reservatório se realmente está sem água?</label>
                  <div className="flex gap-4">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="radio" name="reservatorioVazio" value="Sim" checked={formData.reservatorioVazio === 'Sim'} onChange={(e) => setFormData({...formData, reservatorioVazio: e.target.value})} className="text-blue-600 focus:ring-blue-500" />
                      <span>Sim</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="radio" name="reservatorioVazio" value="Não" checked={formData.reservatorioVazio === 'Não'} onChange={(e) => setFormData({...formData, reservatorioVazio: e.target.value})} className="text-blue-600 focus:ring-blue-500" />
                      <span>Não</span>
                    </label>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">3. A Caixa d'água tem engate de abastecimento?</label>
                  <div className="flex gap-4">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="radio" name="engateAbastecimento" value="Sim" checked={formData.engateAbastecimento === 'Sim'} onChange={(e) => setFormData({...formData, engateAbastecimento: e.target.value})} className="text-blue-600 focus:ring-blue-500" />
                      <span>Sim</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="radio" name="engateAbastecimento" value="Não" checked={formData.engateAbastecimento === 'Não'} onChange={(e) => setFormData({...formData, engateAbastecimento: e.target.value})} className="text-blue-600 focus:ring-blue-500" />
                      <span>Não</span>
                    </label>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* PASSO 2: DADOS TÉCNICOS */}
          {step === 2 && (
            <div className="space-y-4">
              <h3 className="text-lg font-bold text-slate-800 mb-4">Dados Técnicos para Abastecimento</h3>
              
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">4. Distância entre caminhão e reservatório (m)</label>
                <input 
                  type="text" 
                  value={formData.distanciaCaminhao}
                  onChange={(e) => setFormData({...formData, distanciaCaminhao: e.target.value})}
                  placeholder="Ex: 15 metros"
                  className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">5. Altura do reservatório (m)</label>
                <input 
                  type="text" 
                  value={formData.alturaReservatorio}
                  onChange={(e) => setFormData({...formData, alturaReservatorio: e.target.value})}
                  placeholder="Ex: 5 metros"
                  className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">6. Capacidade do reservatório (L)</label>
                <input 
                  type="text" 
                  value={formData.capacidadeReservatorio}
                  onChange={(e) => setFormData({...formData, capacidadeReservatorio: e.target.value})}
                  placeholder="Ex: 10.000 litros"
                  className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">7. Nome do funcionário responsável no local</label>
                <input 
                  type="text" 
                  value={formData.nomeFuncionario}
                  onChange={(e) => setFormData({...formData, nomeFuncionario: e.target.value})}
                  placeholder="Quem receberá o motorista?"
                  className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>
            </div>
          )}

          {/* PASSO 3: SUCESSO */}
          {step === 3 && (
            <div className="text-center py-8">
              <div className="w-20 h-20 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto mb-6 animate-bounce">
                <CheckCircle size={40} />
              </div>
              <h3 className="text-2xl font-bold text-slate-800 mb-2">Solicitação Enviada!</h3>
              <p className="text-slate-600 mb-6">
                O pedido de caminhão pipa foi registrado e a equipe do SEOM notificada.<br/>
                Código SABESP da escola: <strong>{sabespId || "N/A"}</strong>
              </p>
              <button onClick={handleClose} className="text-blue-600 font-bold hover:underline">
                Fechar Janela
              </button>
            </div>
          )}

        </div>

        {/* Footer */}
        {step < 3 && (
          <div className="p-4 border-t border-slate-200 bg-slate-50 flex justify-end gap-3">
            {step === 2 && (
              <button 
                onClick={() => setStep(1)} 
                className="px-4 py-2 text-slate-600 font-semibold hover:bg-slate-200 rounded-lg transition-colors"
              >
                Voltar
              </button>
            )}
            <button
              onClick={step === 1 ? handleNext : handleSubmit}
              disabled={isSubmitting}
              className="px-6 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg font-bold flex items-center gap-2 transition-colors shadow-sm"
            >
              {isSubmitting ? (
                <>Enviando...</>
              ) : (
                <>
                  {step === 1 ? "Próximo" : "Confirmar Solicitação"}
                  <ArrowRight size={18} />
                </>
              )}
            </button>
          </div>
        )}

      </div>
    </div>
  );
}
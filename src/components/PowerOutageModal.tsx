import { useState } from 'react';
import { X, Zap, CheckCircle, AlertTriangle, ArrowRight, Building2, MapPin } from 'lucide-react';
import { supabase } from '../lib/supabase';

export function PowerOutageModal({ isOpen, onClose, schoolName, userName }: any) {
    const [step, setStep] = useState(1);
    const [scope, setScope] = useState<'school' | 'region' | null>(null);
    const [description, setDescription] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    if (!isOpen) return null;

    // Reseta o modal ao fechar
    const handleClose = () => {
        setStep(1);
        setScope(null);
        setDescription('');
        setIsSubmitting(false);
        onClose();
    };

    // Lógica de Navegação
    const handleNext = () => {
        if (step === 1) {
            if (scope === 'region') {
                setStep(4);
            } else {
                setStep(2);
            }
        } else if (step === 2) {
            setStep(3);
        } else if (step === 3) {
            setStep(4);
        }
    };

    // Montagem do E-mail e "Envio"
    const handleSubmit = async () => {
        setIsSubmitting(true);

        // 1. Prepara os dados
        const ticketData = {
            title: `[QUEDA DE ENERGIA] - ${scope === 'school' ? 'Local' : 'Regional'}`,
            description: `
        REGISTRO AUTOMÁTICO DE QUEDA DE ENERGIA
        ---------------------------------------
        Origem: ${scope === 'school' ? 'Apenas na Escola' : 'Toda a Região'}
        Verificação Disjuntor: ${scope === 'region' ? 'N/A' : 'Realizada'}
        Relato do Usuário: ${description}
      `.trim(),
            priority: 'urgente' as const,
            status: 'pendente' as const,
        };

        try {
            // 2. Envia para o Banco de Dados (Com 'as any' para evitar erro de tipo)
            const { error: dbError } = await (supabase.from('maintenance_tickets') as any)
                .insert([ticketData]);

            if (dbError) throw dbError;

            // 3. Chama a Edge Function para enviar o E-mail
            console.log("Tentando enviar e-mail via Edge Function...");
            
            const { data, error: emailError } = await supabase.functions.invoke('send-outage-email', {
                body: {
                    schoolName: schoolName || "Escola (Nome não carregado)",
                    userName: userName || "Usuário (Nome não carregado)",
                    scope: scope,
                    description: description
                }
            });

            // --- BLOCO DE DIAGNÓSTICO DE ERRO (Alertas na tela) ---
            if (emailError) {
                console.error("Erro na conexão com Edge Function:", emailError);
                alert("O chamado foi salvo no banco, mas houve um erro ao conectar com o servidor de e-mail.\n\nDetalhe: " + JSON.stringify(emailError));
            } else if (data?.error) {
                console.error("O Resend recusou o envio:", data.error);
                alert("O chamado foi salvo, mas o e-mail não foi enviado.\n\nMotivo: " + JSON.stringify(data.error));
            } else {
                console.log("Sucesso no envio de e-mail:", data);
            }
            // -------------------------------------------------------

            // 4. Sucesso! Avança para a tela final
            setStep(5);

        } catch (error) {
            console.error("Erro crítico:", error);
            alert("Houve um erro ao registrar o chamado no sistema. Por favor, tente novamente.");
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]">

                {/* Header do Modal */}
                <div className="bg-slate-50 p-4 border-b border-slate-200 flex justify-between items-center">
                    <div className="flex items-center gap-2 text-orange-600 font-bold">
                        <Zap className="fill-orange-600" size={20} />
                        <span>Relatar Queda de Energia</span>
                    </div>
                    <button onClick={handleClose} className="text-slate-400 hover:text-slate-600">
                        <X size={24} />
                    </button>
                </div>

                {/* Corpo Variável (Wizard) */}
                <div className="p-6 overflow-y-auto">

                    {/* FASE 1: IDENTIFICAÇÃO */}
                    {step === 1 && (
                        <div className="space-y-6">
                            <div className="text-center">
                                <h3 className="text-xl font-bold text-slate-800 mb-2">Onde a energia caiu?</h3>
                                <p className="text-slate-500 text-sm">Selecione a abrangência do problema para agilizarmos o diagnóstico.</p>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <button
                                    onClick={() => setScope('school')}
                                    className={`p-6 border-2 rounded-xl flex flex-col items-center gap-3 transition-all ${scope === 'school' ? 'border-orange-500 bg-orange-50 text-orange-700' : 'border-slate-200 hover:border-orange-200'}`}
                                >
                                    <Building2 size={32} />
                                    <span className="font-bold text-sm">Apenas na Escola</span>
                                </button>
                                <button
                                    onClick={() => setScope('region')}
                                    className={`p-6 border-2 rounded-xl flex flex-col items-center gap-3 transition-all ${scope === 'region' ? 'border-orange-500 bg-orange-50 text-orange-700' : 'border-slate-200 hover:border-orange-200'}`}
                                >
                                    <MapPin size={32} />
                                    <span className="font-bold text-sm">Em toda a Região</span>
                                </button>
                            </div>
                        </div>
                    )}

                    {/* FASE 2: VERIFICAÇÃO TÉCNICA */}
                    {step === 2 && (
                        <div className="space-y-6 text-center">
                            <div className="w-16 h-16 bg-yellow-100 text-yellow-600 rounded-full flex items-center justify-center mx-auto mb-4">
                                <Zap size={32} />
                            </div>
                            <h3 className="text-xl font-bold text-slate-800">Confira o Quadro de Energia</h3>
                            <p className="text-slate-600">
                                Verifique se o <strong>disjuntor principal</strong> ou a chave geral da escola desarmou (está na posição "OFF").
                            </p>
                            <div className="bg-blue-50 p-4 rounded-lg text-sm text-blue-800 text-left border border-blue-100">
                                💡 Dica: Às vezes, o reestabelecimento é simples e depende apenas de religar a chave manualmente.
                            </div>
                        </div>
                    )}

                    {/* FASE 3: PREVENÇÃO */}
                    {step === 3 && (
                        <div className="space-y-6 text-center">
                            <div className="w-16 h-16 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto mb-4">
                                <AlertTriangle size={32} />
                            </div>
                            <h3 className="text-xl font-bold text-slate-800">Verifique Sobrecargas</h3>
                            <p className="text-slate-600">
                                Algum equipamento potente foi ligado recentemente? Sente cheiro de queimado?
                            </p>
                            <div className="bg-red-50 p-4 rounded-lg text-sm text-red-800 text-left border border-red-100">
                                ⚠️ <strong>Atenção:</strong> Desconecte aparelhos sensíveis das tomadas para evitar danos caso a energia volte com oscilação forte.
                            </div>
                        </div>
                    )}

                    {/* FASE 4: DETALHAMENTO */}
                    {step === 4 && (
                        <div className="space-y-4">
                            <div>
                                <h3 className="text-lg font-bold text-slate-800 mb-2">Detalhes da Ocorrência</h3>
                                <p className="text-slate-500 text-sm mb-4">Descreva o que aconteceu (ex: estouro no poste, fase meia-luz, chuva forte).</p>
                                <textarea
                                    className="w-full h-32 p-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-orange-500 outline-none resize-none"
                                    placeholder="Descreva aqui..."
                                    value={description}
                                    onChange={(e) => setDescription(e.target.value)}
                                />
                            </div>
                            <div className="bg-slate-100 p-3 rounded text-xs text-slate-500">
                                Ao clicar em enviar, um chamado será aberto para o SEOM e SEFISC.
                            </div>
                        </div>
                    )}

                    {/* FASE 5: SUCESSO */}
                    {step === 5 && (
                        <div className="text-center py-8">
                            <div className="w-20 h-20 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto mb-6 animate-bounce">
                                <CheckCircle size={40} />
                            </div>
                            <h3 className="text-2xl font-bold text-slate-800 mb-2">Chamado Aberto!</h3>
                            <p className="text-slate-600 mb-6">
                                O alerta foi registrado e enviado por e-mail automaticamente.<br />
                                As equipes de infraestrutura foram notificadas.
                            </p>
                            <button onClick={handleClose} className="text-blue-600 font-bold hover:underline">
                                Fechar Janela
                            </button>
                        </div>
                    )}
                </div>

                {/* Footer com Ações */}
                {step < 5 && (
                    <div className="p-4 border-t border-slate-200 bg-slate-50 flex flex-col gap-3">

                        <button
                            onClick={step === 4 ? handleSubmit : handleNext}
                            disabled={(step === 1 && !scope) || (step === 4 && !description) || isSubmitting}
                            className="w-full bg-orange-600 hover:bg-orange-700 disabled:opacity-50 disabled:cursor-not-allowed text-white py-3 rounded-lg font-bold flex items-center justify-center gap-2 transition-colors"
                        >
                            {step === 1 && "Continuar"}
                            {step === 2 && "Já verifiquei e o problema persiste"}
                            {step === 3 && "Tudo verificado, prosseguir"}
                            {step === 4 && (isSubmitting ? "Enviando e-mail..." : "Confirmar e Enviar Chamado")}
                            {step !== 4 && <ArrowRight size={18} />}
                        </button>

                        <button
                            onClick={handleClose}
                            disabled={isSubmitting}
                            className="w-full py-2 text-green-700 font-semibold hover:bg-green-50 rounded-lg transition-colors text-sm flex items-center justify-center gap-2"
                        >
                            <CheckCircle size={16} />
                            A energia voltou! (Cancelar Chamado)
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}
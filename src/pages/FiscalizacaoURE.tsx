import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  Map, CheckCircle, AlertTriangle,  
  Info, Calendar, Save, X, Star, Layers,
  Check, Image as ImageIcon, PenTool, Copy,
  ChevronLeft, ChevronRight, FileSignature, Printer, Wand2
} from 'lucide-react';
import { supabase } from '../lib/supabase';

// ============================================================================
// CONFIGURAÇÃO DAS IMAGENS DA PLANTA
// 1. Coloque as suas imagens (.jpg ou .png) dentro da pasta "public" do projeto.
// 2. Altere o imagemUrl para "/nome-da-sua-imagem.jpg" (precisa da / no início).
// ============================================================================
const PAVIMENTOS = [
  { nome: 'Entrada', imagemUrl: '/lot1.png' },
  { nome: 'Supervisão e Dirigente', imagemUrl: '/lot2.png' },
  { nome: 'SEOM - SEAFIN', imagemUrl: '/lot3.png' },
  { nome: 'SEINTEC - SEVESC', imagemUrl: '/lot4.png' },
  { nome: 'SEPES', imagemUrl: '/lot5.png' },
  { nome: 'ECC', imagemUrl: '/lot6.png' },
  { nome: 'ECC - auditorio', imagemUrl: '/lot7.png' }
];

interface Ambiente {
  id: string;
  name: string;
  pavimento: string;
  top: number;   
  left: number;  
  width: number; 
  height: number;
}

// ============================================================================
// COLE AQUI AS COORDENADAS QUE VOCÊ GEROU NO MODO "MAPEAR SALAS"
// ============================================================================
const PLANTA_URE_DEFINITIVA: Ambiente[] = [
  { id: 'almoxarifado_5197', name: 'Almoxarifado', pavimento: 'Entrada', top: 4.9, left: 2.9, width: 22, height: 42.6 },
  { id: 'deposito_limpeza_0504', name: 'Deposito Limpeza', pavimento: 'Entrada', top: 4.5, left: 25.5, width: 5.7, height: 18.6 },
  { id: 'cozinha_0268', name: 'Cozinha', pavimento: 'Entrada', top: 5.1, left: 31.5, width: 10.5, height: 18.2 },
  { id: 'despensa_9803', name: 'Despensa', pavimento: 'Entrada', top: 4.7, left: 42.4, width: 4.8, height: 18.6 },
  { id: 'refeit_rio_3732', name: 'Refeitório', pavimento: 'Entrada', top: 23.6, left: 25.7, width: 22, height: 24 },
  { id: 'plant_o_supervis_o_6868', name: 'Plantão Supervisão', pavimento: 'Entrada', top: 5.4, left: 70.1, width: 27.9, height: 17.8 },
  { id: 'arquivo_protocolo_1989', name: 'Arquivo protocolo', pavimento: 'Entrada', top: 24, left: 91.8, width: 6, height: 45.6 },
  { id: 'protocolo_6301', name: 'Protocolo', pavimento: 'Entrada', top: 23.1, left: 69.8, width: 21.4, height: 46.1 },
  { id: 'arquivo_1_3933', name: 'Arquivo 1', pavimento: 'Entrada', top: 70.1, left: 3.3, width: 4.6, height: 28.3 },
  { id: 'arquivo_2_6336', name: 'Arquivo 2', pavimento: 'Entrada', top: 69.9, left: 8.5, width: 16.9, height: 27.9 },
  { id: 'arquivo_3_1088', name: 'Arquivo 3', pavimento: 'Entrada', top: 70.1, left: 25.8, width: 5.2, height: 27.2 },
  { id: 'sanit_rio_masculino_funcionarios_8062', name: 'Sanitário Masculino Funcionarios', pavimento: 'Entrada', top: 70.5, left: 31.4, width: 10.7, height: 27 },
  { id: 'sanit_rio_feminino_funcionarias_7396', name: 'Sanitário Feminino Funcionarias', pavimento: 'Entrada', top: 70.7, left: 41.9, width: 10.4, height: 26.6 },
  { id: 'area_carros_oficiais_4630', name: 'Area Carros Oficiais', pavimento: 'Entrada', top: 48, left: 2.7, width: 44.9, height: 21.4 },
  { id: 'galpao_princial_2663', name: 'Galpao Princial', pavimento: 'Entrada', top: 5.1, left: 47.8, width: 21.6, height: 64.1 },
  { id: 'sala_sefrep_ii_8529', name: 'Sala SEFREP II', pavimento: 'Entrada', top: 70.7, left: 75.4, width: 16.5, height: 26.8 },
  { id: 'sanit_rio_feminino_publico_2973', name: 'Sanitário Feminino Publico', pavimento: 'Entrada', top: 88.7, left: 64.1, width: 10.8, height: 9.2 },
  { id: 'corredor_i_5967', name: 'Corredor I', pavimento: 'Entrada', top: 69.9, left: 53.3, width: 10.3, height: 28.9 },
  { id: 'supervis_o_3771', name: 'Supervisão', pavimento: 'Supervisão e Dirigente', top: 23.3, left: 67, width: 21.8, height: 49.8 },
  { id: 'supervis_o_ii_4640', name: 'Supervisão II', pavimento: 'Supervisão e Dirigente', top: 24.6, left: 56.3, width: 10.4, height: 48.5 },
  { id: 'asure_5960', name: 'ASURE', pavimento: 'Supervisão e Dirigente', top: 24.2, left: 45.3, width: 10.5, height: 48.9 },
  { id: 'sanit_rio_supervisores_1440', name: 'Sanitário Supervisores', pavimento: 'Supervisão e Dirigente', top: 25.1, left: 39.6, width: 5.3, height: 23.6 },
  { id: 'sanit_rio_dirigente_9504', name: 'Sanitário Dirigente', pavimento: 'Supervisão e Dirigente', top: 50.4, left: 39.6, width: 5.1, height: 23.6 },
  { id: 'copa__5194', name: 'Copa ', pavimento: 'Supervisão e Dirigente', top: 50.4, left: 34.5, width: 5.1, height: 24 },
  { id: 'asure_ii_8368', name: 'ASURE II', pavimento: 'Supervisão e Dirigente', top: 24.6, left: 10, width: 24.3, height: 49.3 },
  { id: 'hall_dirigente_0678', name: 'HALL Dirigente', pavimento: 'Supervisão e Dirigente', top: 24.6, left: 34.6, width: 4.8, height: 24.4 },
  { id: 'dirigente_0784', name: 'Dirigente', pavimento: 'Supervisão e Dirigente', top: 24.6, left: 1.4, width: 8.5, height: 48.5 },
  { id: 'corredor_supervis_o_6831', name: 'Corredor Supervisão', pavimento: 'Supervisão e Dirigente', top: 8, left: 1.1, width: 87.5, height: 14.8 },
  { id: 'circula__o_ii_7906', name: 'Circulação II', pavimento: 'Supervisão e Dirigente', top: 7.2, left: 88.8, width: 11, height: 90.4 },
  { id: 'sefin_1265', name: 'SEFIN', pavimento: 'SEOM - SEAFIN', top: 19.4, left: 0.6, width: 18.3, height: 59.8 },
  { id: 'seom_sefisc_2002', name: 'SEOM-SEFISC', pavimento: 'SEOM - SEAFIN', top: 19.4, left: 19.1, width: 9.1, height: 59.2 },
  { id: 'secomse_seafin_5740', name: 'SECOMSE-SEAFIN', pavimento: 'SEOM - SEAFIN', top: 20, left: 28.5, width: 28.1, height: 59.2 },
  { id: 'servidor_6698', name: 'SERVIDOR', pavimento: 'SEOM - SEAFIN', top: 19.4, left: 56.9, width: 9.4, height: 61 },
  { id: 'preg_o_3512', name: 'PREGÃO', pavimento: 'SEOM - SEAFIN', top: 19.4, left: 66.4, width: 16.8, height: 69.6 },
  { id: 'arquivo_ecc_4363', name: 'ARQUIVO ECC', pavimento: 'SEOM - SEAFIN', top: 19.4, left: 83.4, width: 7.9, height: 69.6 },
  { id: 'arquivo_seom_2733', name: 'Arquivo SEOM', pavimento: 'SEOM - SEAFIN', top: 20, left: 91.5, width: 8.2, height: 70.9 },
  { id: 'semat_segre_6748', name: 'SEMAT-SEGRE', pavimento: 'SEINTEC - SEVESC', top: 13.6, left: 67, width: 21.8, height: 37.2 },
  { id: 'seintec_setec_7405', name: 'SEINTEC-SETEC', pavimento: 'SEINTEC - SEVESC', top: 14.2, left: 45.2, width: 21.5, height: 36.2 },
  { id: 'sevesc_8580', name: 'SEVESC', pavimento: 'SEINTEC - SEVESC', top: 14.2, left: 23, width: 21.7, height: 36.2 },
  { id: 'arquivo_sepes_2260', name: 'ARQUIVO SEPES', pavimento: 'SEINTEC - SEVESC', top: 14.2, left: 1.8, width: 21.1, height: 36.8 },
  { id: 'corredor_vida_escolar_5523', name: 'CORREDOR VIDA ESCOLAR', pavimento: 'SEINTEC - SEVESC', top: 2.1, left: 1.4, width: 87.5, height: 11.5 },
  { id: 'circula__o_iii_7907', name: 'CIRCULAÇÃO III', pavimento: 'SEINTEC - SEVESC', top: 2.4, left: 89.1, width: 10.7, height: 96.7 },
  { id: 'conviva_6558', name: 'CONVIVA', pavimento: 'SEINTEC - SEVESC', top: 80.5, left: 75.5, width: 7.9, height: 18.9 },
  { id: 'mutiplica_4372', name: 'MUTIPLICA', pavimento: 'SEINTEC - SEVESC', top: 80.9, left: 66.8, width: 8.3, height: 18.9 },
  { id: 'multimidia_7161', name: 'MULTIMIDIA', pavimento: 'SEINTEC - SEVESC', top: 62.6, left: 67, width: 16.7, height: 17.6 },
  { id: 'sefrep_2232', name: 'SEFREP', pavimento: 'SEPES', top: 21.5, left: 1.5, width: 19.2, height: 58.6 },
  { id: 'seape_9182', name: 'SEAPE', pavimento: 'SEPES', top: 22.1, left: 21, width: 19.8, height: 56.8 },
  { id: 'sepes_6825', name: 'SEPES', pavimento: 'SEPES', top: 20.3, left: 40.8, width: 9.7, height: 58.6 },
  { id: 'arquivo_sepes_ii_1883', name: 'ARQUIVO SEPES II', pavimento: 'SEPES', top: 19.8, left: 50.7, width: 9.8, height: 58.6 },
  { id: 'auditorio_5911', name: 'AUDITORIO', pavimento: 'SEPES', top: 19.8, left: 60.7, width: 39, height: 59.1 },
  { id: 'corredor_vida_funcional_7479', name: 'CORREDOR VIDA FUNCIONAL', pavimento: 'SEPES', top: 2, left: 1.2, width: 98.7, height: 16.7 },
  { id: 'biblioteca_2027', name: 'BIBLIOTECA', pavimento: 'ECC', top: 21.2, left: 0.6, width: 27.8, height: 74.7 },
  { id: 'sanit_rio_masculino_p_blico_5553', name: 'SANITÁRIO MASCULINO PÚBLICO', pavimento: 'ECC', top: 22.2, left: 28.8, width: 7, height: 74.7 },
  { id: 'sanit_rio_feminino_p_blico_0079', name: 'SANITÁRIO FEMININO PÚBLICO', pavimento: 'ECC', top: 21.7, left: 35.9, width: 7.2, height: 75.8 },
  { id: 'copa_ecc_1222', name: 'COPA ECC', pavimento: 'ECC', top: 23.8, left: 43.6, width: 27.5, height: 35.8 },
  { id: 'sala_ecc_9128', name: 'SALA ECC', pavimento: 'ECC', top: 60.1, left: 43.4, width: 28.1, height: 35.3 },
  { id: 'sala_ecc_i_1234', name: 'SALA ECC I', pavimento: 'ECC', top: 21.2, left: 71.8, width: 27.4, height: 74.7 },
  { id: 'sala_35_9910', name: 'SALA 35', pavimento: 'ECC - auditorio', top: 56.2, left: 75.1, width: 24.5, height: 40.9 },
  { id: 'sala_34_8180', name: 'SALA 34', pavimento: 'ECC - auditorio', top: 54.5, left: 50.1, width: 24.2, height: 43.5 },
  { id: 'sala_33_ecc_6137', name: 'SALA 33 ECC', pavimento: 'ECC - auditorio', top: 55.8, left: 25.4, width: 24.2, height: 41.2 },
  { id: 'sala_32_ecc_5195', name: 'SALA 32 ECC', pavimento: 'ECC - auditorio', top: 55.2, left: 0.5, width: 24.2, height: 42.8 },
  { id: 'circula__o_ecc_ii_5038', name: 'CIRCULAÇÃO ECC II', pavimento: 'ECC - auditorio', top: 43.3, left: 0.2, width: 99.3, height: 11.2 },
  { id: 'rampa_audit_rio_6310', name: 'RAMPA AUDITÓRIO', pavimento: 'ECC - auditorio', top: 0.5, left: 75.3, width: 6.7, height: 42.8 },
  { id: 'corredor_ecc_7445', name: 'CORREDOR ECC', pavimento: 'ECC', top: 2.3, left: 1.2, width: 98.3, height: 17.4 }
];

interface Avaliacao {
  id?: string;
  mes_referencia: string;
  ambiente_id: string;
  q1_lavagem: boolean;
  q2_semanal: boolean;
  q3_lixo: boolean;
  q4_poeira: boolean;
  q5_ventilador: boolean;
  q6_vidro: boolean;
  nota_final: number;
}

const FORM_INITIAL_STATE = {
  q1_lavagem: false, q2_semanal: false, q3_lixo: false, 
  q4_poeira: false, q5_ventilador: false, q6_vidro: false,
};

export default function FiscalizacaoLimpeza() {
  const [isRegionalAdmin, setIsRegionalAdmin] = useState<boolean | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [userName, setUserName] = useState<string>('');

  // Estados Principais (Tempo e Navegação)
  const currentMonth = new Date().toISOString().substring(0, 7);
  const [selectedMonth, setSelectedMonth] = useState(currentMonth);
  const [pavimentoAtual, setPavimentoAtual] = useState<string>('Entrada');
  const [avaliacoes, setAvaliacoes] = useState<Avaliacao[]>([]);

  // Estados do Modal de Avaliação
  const [selectedAmbiente, setSelectedAmbiente] = useState<Ambiente | null>(null);
  const [formData, setFormData] = useState(FORM_INITIAL_STATE);
  const [isSaving, setIsSaving] = useState(false);

  // Estados do Modal de Relatório Final
  const [showReportModal, setShowReportModal] = useState(false);
  const [reportObservation, setReportObservation] = useState('');

  // ================= ESTADOS DO MODO EDITOR DE MAPA =================
  const [isMappingMode, setIsMappingMode] = useState(false);
  const [mappedRooms, setMappedRooms] = useState<Ambiente[]>(PLANTA_URE_DEFINITIVA);
  const [isDrawing, setIsDrawing] = useState(false);
  const [startPoint, setStartPoint] = useState({ x: 0, y: 0 });
  const [currentBox, setCurrentBox] = useState<{top: number, left: number, width: number, height: number} | null>(null);
  const imageRef = useRef<HTMLDivElement>(null);
  const [showExportModal, setShowExportModal] = useState(false);

  useEffect(() => {
    async function checkAccess() {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        setUserId(user.id);

        const { data: profile } = await supabase
          .from('profiles')
          .select('role, full_name')
          .eq('id', user.id)
          .single();

        if (profile) setUserName((profile as any).full_name || 'Administrador');

        const allowedRoles = ['regional_admin', 'manage_admin'];
        const hasAccess = allowedRoles.includes((profile as any)?.role);
        setIsRegionalAdmin(hasAccess);

        if (hasAccess) fetchAvaliacoes(currentMonth);
        else setIsLoading(false);
      } catch (error) {
        setIsLoading(false);
      }
    }
    checkAccess();
  }, []);

  const fetchAvaliacoes = async (mes: string) => {
    setIsLoading(true);
    try {
      const { data, error } = await (supabase as any)
        .from('fiscalizacao_limpeza')
        .select('*')
        .eq('mes_referencia', mes);
      if (error) throw error;
      setAvaliacoes(data || []);
    } catch (error) {
      console.error(error);
    } finally {
      setIsLoading(false);
    }
  };

  // Funções de Controlo de Data
  const handleMonthChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const mes = e.target.value;
    setSelectedMonth(mes);
    fetchAvaliacoes(mes);
  };

  const changeMonthByStep = (offset: number) => {
    if (isMappingMode) return;
    const [year, month] = selectedMonth.split('-');
    const date = new Date(parseInt(year), parseInt(month) - 1 + offset, 1);
    const newMonth = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    setSelectedMonth(newMonth);
    fetchAvaliacoes(newMonth);
  };

  // Funções de Avaliação (Formulário)
  const openEvaluationModal = (ambiente: Ambiente) => {
    if (isMappingMode) return; 
    setSelectedAmbiente(ambiente);
    const existing = avaliacoes.find(a => a.ambiente_id === ambiente.id);
    if (existing) {
      setFormData({
        q1_lavagem: existing.q1_lavagem, q2_semanal: existing.q2_semanal,
        q3_lixo: existing.q3_lixo, q4_poeira: existing.q4_poeira,
        q5_ventilador: existing.q5_ventilador, q6_vidro: existing.q6_vidro,
      });
    } else {
      setFormData(FORM_INITIAL_STATE);
    }
  };

  const closeModal = () => {
    setSelectedAmbiente(null);
    setFormData(FORM_INITIAL_STATE);
  };

  const handleCheckboxChange = (field: keyof typeof FORM_INITIAL_STATE) => {
    setFormData(prev => ({ ...prev, [field]: !prev[field] }));
  };

  // Memo para a nota calculada em tempo real no visual
  const notaAtual = useMemo(() => {
    let nota = 0;
    if (formData.q1_lavagem) nota += 2.0;
    if (formData.q2_semanal) nota += 2.0;
    if (formData.q3_lixo) nota += 1.5;
    if (!formData.q4_poeira) nota += 1.5; // Se NÃO estiver empoeirado, ganha os pontos
    if (formData.q5_ventilador) nota += 1.5;
    if (formData.q6_vidro) nota += 1.5;
    return Math.min(10, nota);
  }, [formData]);

  const saveEvaluation = async () => {
    if (!selectedAmbiente) return;
    setIsSaving(true);

    try {
      const payload = {
        mes_referencia: selectedMonth, 
        ambiente_id: selectedAmbiente.id,
        ...formData, 
        nota_final: notaAtual, 
        avaliador_id: userId, 
        updated_at: new Date().toISOString()
      };
      
      const existing = avaliacoes.find(a => a.ambiente_id === selectedAmbiente.id);
      
      if (existing && existing.id) {
        await (supabase as any).from('fiscalizacao_limpeza').update(payload).eq('id', existing.id);
      } else {
        await (supabase as any).from('fiscalizacao_limpeza').insert([payload]);
      }
      
      await fetchAvaliacoes(selectedMonth);
      closeModal();
    } catch (error) {
      alert("Erro ao gravar avaliação.");
    } finally {
      setIsSaving(false);
    }
  };

  // ================= FUNÇÕES DO EDITOR DE MAPA VISUAL =================
  const handlePointerDown = (e: React.PointerEvent) => {
    if (!isMappingMode || !imageRef.current) return;
    const rect = imageRef.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    setStartPoint({ x, y });
    setIsDrawing(true);
    setCurrentBox({ top: y, left: x, width: 0, height: 0 });
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDrawing || !isMappingMode || !imageRef.current || !currentBox) return;
    const rect = imageRef.current.getBoundingClientRect();
    let x = ((e.clientX - rect.left) / rect.width) * 100;
    let y = ((e.clientY - rect.top) / rect.height) * 100;
    
    x = Math.max(0, Math.min(100, x));
    y = Math.max(0, Math.min(100, y));

    setCurrentBox({
      top: Math.min(startPoint.y, y),
      left: Math.min(startPoint.x, x),
      width: Math.abs(x - startPoint.x),
      height: Math.abs(y - startPoint.y),
    });
  };

  const handlePointerUp = () => {
    if (!isDrawing || !isMappingMode || !currentBox) return;
    setIsDrawing(false);
    
    if (currentBox.width > 2 && currentBox.height > 2) {
      const nomeSala = window.prompt("Qual o nome desta sala?");
      if (nomeSala) {
        const idSala = nomeSala.toLowerCase().replace(/[^a-z0-9]/g, '_') + '_' + Date.now().toString().slice(-4);
        setMappedRooms(prev => [...prev, {
          id: idSala, name: nomeSala, pavimento: pavimentoAtual,
          top: parseFloat(currentBox.top.toFixed(1)), left: parseFloat(currentBox.left.toFixed(1)),
          width: parseFloat(currentBox.width.toFixed(1)), height: parseFloat(currentBox.height.toFixed(1)),
        }]);
      }
    }
    setCurrentBox(null);
  };

  const removeMappedRoom = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (window.confirm("Remover esta sala do mapa?")) {
      setMappedRooms(prev => prev.filter(r => r.id !== id));
    }
  };

  // ================= FUNÇÕES DE RENDERIZAÇÃO E INDICADORES =================
  const salasVisiveis = isMappingMode 
    ? mappedRooms.filter(amb => amb.pavimento === pavimentoAtual)
    : PLANTA_URE_DEFINITIVA.filter(amb => amb.pavimento === pavimentoAtual);

  const pavimentoAtualInfo = PAVIMENTOS.find(p => p.nome === pavimentoAtual) || PAVIMENTOS[0];

  const getAmbienteStatusInfo = (id: string) => {
    const aval = avaliacoes.find(a => a.ambiente_id === id);
    if (!aval) return { bgClass: 'bg-slate-300/40', borderClass: 'border-slate-500 border-dashed', textClass: 'text-slate-800', nota: null };
    if (aval.nota_final >= 8) return { bgClass: 'bg-green-400/60', borderClass: 'border-green-600 border-solid', textClass: 'text-green-900', nota: aval.nota_final };
    if (aval.nota_final >= 5) return { bgClass: 'bg-yellow-400/60', borderClass: 'border-yellow-600 border-solid', textClass: 'text-yellow-900', nota: aval.nota_final };
    return { bgClass: 'bg-red-400/60', borderClass: 'border-red-600 border-solid', textClass: 'text-red-900', nota: aval.nota_final };
  };

  // Cálculos de Estatísticas e Progresso
  const stats = useMemo(() => {
    const totalAmbientes = PLANTA_URE_DEFINITIVA.length;
    const concluidos = avaliacoes.length;
    const soma = avaliacoes.reduce((acc, curr) => acc + curr.nota_final, 0);
    const criticos = avaliacoes.filter(a => a.nota_final < 5).length;
    
    const media = concluidos > 0 ? soma / concluidos : 0;
    const percentual = totalAmbientes > 0 ? Math.round((concluidos / totalAmbientes) * 100) : 0;
    const isConcluido = concluidos === totalAmbientes && totalAmbientes > 0;

    return { media, concluidos, criticos, totalAmbientes, percentual, isConcluido };
  }, [avaliacoes]);

  // ================= TEXTO RESUMO INTELIGENTE (IA LOCAL) =================
  const geradorResumoTexto = useMemo(() => {
    if (avaliacoes.length === 0 || !stats.isConcluido) return "";
    
    const mediaStr = stats.media.toFixed(1);
    const criticos = avaliacoes.filter(a => a.nota_final < 5);
    const regulares = avaliacoes.filter(a => a.nota_final >= 5 && a.nota_final < 8);
    const excelentes = avaliacoes.filter(a => a.nota_final >= 8);

    const nomesCriticos = criticos.map(c => PLANTA_URE_DEFINITIVA.find(p => p.id === c.ambiente_id)?.name).join(", ");

    // Contabilizar as falhas mais comuns
    const falhas = {
      "falta de lavagem pesada": avaliacoes.filter(a => !a.q1_lavagem).length,
      "falha na limpeza semanal": avaliacoes.filter(a => !a.q2_semanal).length,
      "acúmulo de lixo": avaliacoes.filter(a => !a.q3_lixo).length,
      "excesso de poeira": avaliacoes.filter(a => a.q4_poeira).length,
      "ventiladores sujos": avaliacoes.filter(a => !a.q5_ventilador).length,
      "vidros e janelas sujos": avaliacoes.filter(a => !a.q6_vidro).length,
    };

    // Descobrir a pior falha
    const piorFalha = Object.entries(falhas).sort((a, b) => b[1] - a[1])[0];

    const mesFormatado = new Date(parseInt(selectedMonth.split('-')[0]), parseInt(selectedMonth.split('-')[1]) - 1).toLocaleString('pt-BR', { month: 'long', year: 'numeric' });

    let texto = `A fiscalização de limpeza referente a ${mesFormatado} foi concluída com sucesso, cobrindo 100% dos ${PLANTA_URE_DEFINITIVA.length} ambientes mapeados na unidade. A avaliação resultou numa média geral de ${mediaStr} (em 10 pontos possíveis).\n\n`;

    if (excelentes.length === PLANTA_URE_DEFINITIVA.length) {
      texto += `O desempenho da equipe de limpeza foi considerado excepcional neste período, com todos os ambientes avaliados com nota de Excelência.`;
    } else {
      texto += `Na distribuição global, observou-se que ${excelentes.length} ambiente(s) estão em estado Excelente, ${regulares.length} Regular(es) e ${criticos.length} classificado(s) como Ruim.\n\n`;
      
      if (criticos.length > 0) {
        texto += `É necessária intervenção imediata e notificação da equipe de limpeza responsável pelos seguintes locais com estado crítico: ${nomesCriticos}.\n\n`;
      }
      
      if (piorFalha && piorFalha[1] > 0) {
        texto += `A análise de dados aponta que a principal não-conformidade identificada na unidade foi referente a "${piorFalha[0]}", incidente em ${piorFalha[1]} ambiente(s).`;
      }
    }

    return texto;
  }, [avaliacoes, stats, selectedMonth]);

  const handleImprimirRelatorio = () => {
    window.print();
  };

  if (isLoading && !isRegionalAdmin) return <div className="min-h-screen flex items-center justify-center">A verificar...</div>;
  if (isRegionalAdmin === false) return <div className="min-h-screen flex items-center justify-center">Acesso Negado.</div>;

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans pb-10 print:bg-white print:pb-0">
      
      {/* HEADER PRINCIPAL (Oculto na impressão) */}
      <header className="bg-slate-900 text-white p-5 shadow-lg flex flex-col md:flex-row justify-between items-center gap-4 relative z-10 print:hidden">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-blue-600 rounded-lg"><Map className="w-6 h-6 text-white" /></div>
          <div>
            <h1 className="text-xl md:text-2xl font-bold">Fiscalização da URE</h1>
            <p className="text-slate-400 text-sm">Controle Visual de Zeladoria</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 justify-center">
          <button 
            onClick={() => setIsMappingMode(!isMappingMode)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-colors ${isMappingMode ? 'bg-amber-500 text-slate-900' : 'bg-slate-800 text-slate-300 hover:text-white border border-slate-700'}`}
          >
            <PenTool className="w-4 h-4" />
            {isMappingMode ? 'Sair do Editor' : 'Mapear Salas'}
          </button>
          
          {/* Controle de Data com Navegação Rápida */}
          <div className="flex items-center bg-slate-800 p-1 rounded-lg border border-slate-700">
            <button 
              onClick={() => changeMonthByStep(-1)} 
              disabled={isMappingMode}
              className="p-1.5 hover:bg-slate-700 rounded text-slate-400 hover:text-white transition-colors disabled:opacity-50"
            >
              <ChevronLeft className="w-5 h-5"/>
            </button>
            
            <div className="flex items-center gap-2 px-2 border-x border-slate-700">
              <Calendar className="w-4 h-4 text-slate-400" />
              <input 
                type="month" 
                value={selectedMonth} 
                onChange={handleMonthChange} 
                className="bg-transparent text-white outline-none font-medium cursor-pointer text-sm w-[110px]" 
                disabled={isMappingMode}
              />
            </div>
            
            <button 
              onClick={() => changeMonthByStep(1)} 
              disabled={isMappingMode}
              className="p-1.5 hover:bg-slate-700 rounded text-slate-400 hover:text-white transition-colors disabled:opacity-50"
            >
              <ChevronRight className="w-5 h-5"/>
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 p-4 md:p-6 max-w-6xl mx-auto w-full space-y-6 print:hidden">
        
        {/* AVISOS GLOBAIS DE CONCLUSÃO E MODO MAPEAMENTO */}
        {isMappingMode ? (
          <div className="bg-amber-100 border-l-4 border-amber-500 p-4 rounded-r-xl shadow-md flex flex-col md:flex-row justify-between items-center gap-4 animate-in slide-in-from-top-4">
            <div>
              <h3 className="font-bold text-amber-900 flex items-center gap-2"><PenTool className="w-5 h-5"/> Modo Editor de Planta Ativo</h3>
              <p className="text-amber-800 text-sm mt-1"><strong>1.</strong> Escolha o andar. <strong>2.</strong> Clique e arraste o rato sobre a imagem. <strong>3.</strong> Dê um nome. <strong>4.</strong> Quando terminar, gere o código.</p>
            </div>
            <button onClick={() => setShowExportModal(true)} className="bg-slate-900 text-white px-5 py-2.5 rounded-lg font-bold shadow-sm hover:bg-slate-800 whitespace-nowrap">
              Gerar Código do Mapa
            </button>
          </div>
        ) : (
          stats.isConcluido ? (
            <div className="bg-green-50 border border-green-200 text-green-800 px-5 py-4 rounded-xl flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 shadow-sm">
              <div className="flex items-center gap-3">
                <CheckCircle className="w-8 h-8 text-green-600 flex-shrink-0" />
                <div>
                  <p className="font-bold text-lg leading-tight">Fiscalização Mensal Concluída!</p>
                  <p className="text-sm text-green-700">Todos os {stats.totalAmbientes} ambientes foram avaliados com sucesso. O relatório já está disponível.</p>
                </div>
              </div>
              <button 
                onClick={() => setShowReportModal(true)}
                className="bg-green-600 hover:bg-green-700 text-white font-bold py-2.5 px-5 rounded-lg shadow-md transition-all flex items-center gap-2 whitespace-nowrap w-full sm:w-auto justify-center"
              >
                <FileSignature className="w-5 h-5" /> Emitir Relatório à Chefia
              </button>
            </div>
          ) : (
            <div className="bg-blue-50 border border-blue-200 text-blue-800 px-5 py-4 rounded-xl flex items-center gap-3 shadow-sm">
              <Info className="w-6 h-6 text-blue-600 flex-shrink-0" />
              <div>
                <p className="font-bold text-lg leading-tight">Mês em Andamento ({stats.percentual}%)</p>
                <p className="text-sm text-blue-700">Ainda faltam {stats.totalAmbientes - stats.concluidos} ambientes para finalizar a fiscalização e liberar o Relatório de {selectedMonth}.</p>
              </div>
            </div>
          )
        )}

        {/* CARDS DE RESUMO */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200 flex items-center gap-4">
            <div className={`p-3 rounded-xl ${stats.media >= 8 ? 'bg-green-100 text-green-600' : stats.media > 0 && stats.media < 5 ? 'bg-red-100 text-red-600' : stats.media >= 5 ? 'bg-yellow-100 text-yellow-600' : 'bg-slate-100 text-slate-600'}`}>
              <Star className="w-6 h-6" />
            </div>
            <div>
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Média da Qualidade</p>
              <p className="text-2xl font-black text-slate-800">{stats.media.toFixed(1)} <span className="text-sm font-medium text-slate-400">/ 10</span></p>
            </div>
          </div>

          <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200 flex items-center gap-4">
            {/* Gráfico SVG de Progresso (Pizza/Donut) */}
            <div className="relative w-12 h-12 flex-shrink-0 flex items-center justify-center">
              <svg viewBox="0 0 36 36" className="w-full h-full transform -rotate-90">
                <path className="text-slate-100" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="currentColor" strokeWidth="4" />
                <path 
                  className={stats.isConcluido ? "text-green-500" : "text-blue-500"} 
                  strokeDasharray={`${stats.percentual}, 100`} 
                  d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" 
                  fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" 
                  style={{ transition: "stroke-dasharray 0.5s ease-out" }}
                />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-[10px] font-bold text-slate-700">{stats.percentual}%</span>
              </div>
            </div>
            <div>
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Progresso Mensal</p>
              <p className="text-2xl font-black text-slate-800">{stats.concluidos} <span className="text-sm font-medium text-slate-400">/ {stats.totalAmbientes} salas</span></p>
            </div>
          </div>

          <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200 flex items-center gap-4">
            <div className="p-3 rounded-xl bg-red-100 text-red-600">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <div>
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Atenção Crítica (Nota &lt; 5)</p>
              <p className="text-2xl font-black text-slate-800">{stats.criticos} <span className="text-sm font-medium text-slate-400">ambientes</span></p>
            </div>
          </div>
        </div>

        {/* ÁREA DO MAPA */}
        <div className={`bg-white rounded-3xl shadow-lg border p-4 md:p-8 relative ${isMappingMode ? 'border-amber-300 ring-4 ring-amber-100' : 'border-slate-200'}`}>
          
          <div className="flex flex-col md:flex-row justify-between items-center mb-6 gap-4 border-b border-slate-100 pb-4">
            {/* Controle de Andares */}
            <div className="flex items-center gap-2 bg-slate-100 p-1.5 rounded-xl border border-slate-200 w-full md:w-auto overflow-x-auto">
              <div className="pl-3 pr-2 text-slate-500 hidden sm:block"><Layers className="w-5 h-5" /></div>
              {PAVIMENTOS.map((pav) => (
                <button
                  key={pav.nome} onClick={() => setPavimentoAtual(pav.nome)}
                  className={`whitespace-nowrap px-6 py-2 rounded-lg font-bold text-sm transition-all ${pavimentoAtual === pav.nome ? 'bg-white text-blue-600 shadow-sm border border-slate-200' : 'text-slate-500 hover:bg-slate-200/50'}`}
                >
                  {pav.nome}
                </button>
              ))}
            </div>

            {!isMappingMode && (
              <div className="flex flex-wrap gap-3 text-xs font-semibold bg-slate-50 p-2.5 rounded-xl border border-slate-100 justify-center">
                <div className="flex items-center gap-1"><div className="w-3 h-3 rounded-full bg-green-400 border border-green-600"></div> Excelente</div>
                <div className="flex items-center gap-1"><div className="w-3 h-3 rounded-full bg-yellow-400 border border-yellow-600"></div> Regular</div>
                <div className="flex items-center gap-1"><div className="w-3 h-3 rounded-full bg-red-400 border border-red-600"></div> Ruim</div>
              </div>
            )}
          </div>

          {/* CONTAINER DA IMAGEM */}
          <div 
            ref={imageRef}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerLeave={handlePointerUp}
            className={`relative w-full max-w-5xl mx-auto rounded-xl border-4 overflow-hidden shadow-inner bg-slate-100 select-none ${isMappingMode ? 'border-amber-400 cursor-crosshair touch-none' : 'border-slate-200'}`}
          >
            {/* Aviso de Imagem Ausente */}
            {pavimentoAtualInfo.imagemUrl.includes('placehold.co') && (
              <div className="absolute inset-x-0 top-0 bg-blue-100 text-blue-800 text-xs text-center p-2 z-30 font-bold flex items-center justify-center gap-2">
                <ImageIcon className="w-4 h-4" /> 
                Aviso: Coloque as suas imagens na pasta "public" e edite a variável PAVIMENTOS no código para as exibir aqui.
              </div>
            )}

            {/* A IMAGEM DE FUNDO */}
            <img src={pavimentoAtualInfo.imagemUrl} alt="Planta" className="w-full h-auto block pointer-events-none" draggable="false"/>

            {/* AS ZONAS CLICÁVEIS / SALAS */}
            {salasVisiveis.map(amb => {
              const statusInfo = getAmbienteStatusInfo(amb.id);
              return (
                <div 
                  key={amb.id}
                  onClick={() => !isMappingMode && openEvaluationModal(amb)}
                  className={`absolute flex flex-col items-center justify-center text-center p-1 border-2 rounded-lg backdrop-blur-[1px] transition-all 
                    ${isMappingMode ? 'bg-blue-500/40 border-blue-600 text-blue-900 hover:bg-blue-500/60 z-20' : `${statusInfo.bgClass} ${statusInfo.borderClass} ${statusInfo.textClass} hover:opacity-100 hover:scale-[1.02] hover:shadow-lg cursor-pointer z-10`}
                  `}
                  style={{ top: `${amb.top}%`, left: `${amb.left}%`, width: `${amb.width}%`, height: `${amb.height}%` }}
                >
                  <span className="font-bold text-[8px] md:text-xs leading-tight drop-shadow-md bg-white/50 px-1 rounded truncate max-w-full">
                    {amb.name}
                  </span>
                  
                  {!isMappingMode ? (
                    statusInfo.nota !== null && <div className="mt-1 font-black text-xs md:text-sm drop-shadow-md bg-white/60 px-1.5 rounded-md">★ {statusInfo.nota.toFixed(1)}</div>
                  ) : (
                    <button onClick={(e) => removeMappedRoom(amb.id, e)} className="absolute -top-2 -right-2 bg-red-600 text-white rounded-full p-1 shadow-lg hover:bg-red-700 pointer-events-auto">
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>
              )
            })}

            {/* A CAIXA QUE ESTÁ A SER DESENHADA NESTE MOMENTO */}
            {isDrawing && currentBox && isMappingMode && (
              <div 
                className="absolute bg-amber-400/50 border-2 border-amber-600 border-dashed rounded z-30 pointer-events-none"
                style={{ top: `${currentBox.top}%`, left: `${currentBox.left}%`, width: `${currentBox.width}%`, height: `${currentBox.height}%` }}
              />
            )}
          </div>
        </div>
      </main>

      {/* ================= MODAL RELATÓRIO FINAL / IMPRESSÃO ================= */}
      {(showReportModal || typeof window !== 'undefined' && window.matchMedia('print').matches) && (
        <div className="fixed inset-0 z-50 flex justify-center items-start overflow-y-auto p-4 bg-slate-900/80 backdrop-blur-sm print:bg-white print:relative print:block print:overflow-visible print:p-0">
          <div className="bg-white w-full max-w-3xl rounded-3xl shadow-2xl mt-10 mb-10 print:mt-0 print:mb-0 print:shadow-none print:rounded-none overflow-hidden">
            
            {/* Cabeçalho do Relatório */}
            <div className="bg-slate-900 text-white p-6 flex justify-between items-center print:bg-white print:text-slate-900 print:border-b-4 print:border-slate-800">
              <div className="flex items-center gap-3">
                <FileSignature className="w-8 h-8 print:text-slate-800" />
                <div>
                  <h2 className="text-2xl font-bold">Relatório de Fechamento</h2>
                  <p className="text-slate-400 print:text-slate-500">Mês de Referência: {new Date(parseInt(selectedMonth.split('-')[0]), parseInt(selectedMonth.split('-')[1]) - 1).toLocaleString('pt-BR', { month: 'long', year: 'numeric' }).toUpperCase()}</p>
                </div>
              </div>
              <div className="flex gap-2 print:hidden">
                <button onClick={handleImprimirRelatorio} className="bg-white/10 hover:bg-white/20 p-2.5 rounded-lg transition-colors" title="Imprimir / Exportar PDF">
                  <Printer className="w-6 h-6" />
                </button>
                <button onClick={() => setShowReportModal(false)} className="bg-white/10 hover:bg-white/20 p-2.5 rounded-lg transition-colors">
                  <X className="w-6 h-6" />
                </button>
              </div>
            </div>

            <div className="p-8 space-y-8">
              
              {/* Resumo da IA */}
              <div className="bg-blue-50/50 border border-blue-100 rounded-2xl p-6 relative">
                <div className="absolute -top-4 -right-2 bg-blue-600 text-white text-[10px] font-bold px-3 py-1 rounded-full uppercase tracking-wider flex items-center gap-1 shadow-md print:hidden">
                  <Wand2 className="w-3 h-3" /> Resumo Automático (Sistema)
                </div>
                <h3 className="font-bold text-slate-800 text-lg mb-3 flex items-center gap-2">
                  <CheckCircle className="w-5 h-5 text-blue-600" /> Parecer de Qualidade
                </h3>
                <p className="text-slate-700 leading-relaxed whitespace-pre-wrap text-justify">
                  {geradorResumoTexto}
                </p>
              </div>

              {/* Estatísticas Rápidas p/ Impressão */}
              <div className="grid grid-cols-3 gap-4 border-y border-slate-100 py-6">
                <div className="text-center">
                  <p className="text-sm font-bold text-slate-500 uppercase">Média Global</p>
                  <p className="text-3xl font-black text-slate-800">{stats.media.toFixed(1)}</p>
                </div>
                <div className="text-center border-x border-slate-100">
                  <p className="text-sm font-bold text-slate-500 uppercase">Ambientes Avaliados</p>
                  <p className="text-3xl font-black text-slate-800">{stats.concluidos}</p>
                </div>
                <div className="text-center">
                  <p className="text-sm font-bold text-slate-500 uppercase">Atenção Crítica</p>
                  <p className={`text-3xl font-black ${stats.criticos > 0 ? 'text-red-600' : 'text-slate-800'}`}>{stats.criticos}</p>
                </div>
              </div>

              {/* Observação Manual do Administrador */}
              <div>
                <h3 className="font-bold text-slate-800 text-lg mb-3 flex items-center gap-2">
                  <PenTool className="w-5 h-5 text-slate-500" /> Observações do Fiscal / Administrador
                </h3>
                
                <div className="print:hidden">
                  <textarea 
                    value={reportObservation}
                    onChange={(e) => setReportObservation(e.target.value)}
                    placeholder="Escreva aqui observações adicionais, apontamentos para a equipa de limpeza ou solicitações de materiais..."
                    className="w-full min-h-[150px] p-4 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-slate-700 resize-y bg-slate-50/50"
                  />
                  <p className="text-xs text-slate-400 mt-2">* Este texto será anexado ao documento impresso/PDF.</p>
                </div>

                <div className="hidden print:block min-h-[100px] text-slate-800 text-justify whitespace-pre-wrap pt-2">
                  {reportObservation || "Nenhuma observação adicional declarada pelo administrador neste mês."}
                </div>
              </div>

              {/* Assinaturas */}
              <div className="mt-16 pt-16 grid grid-cols-2 gap-8 print:grid">
                <div className="border-t border-slate-400 pt-4 text-center">
                  <p className="font-bold text-slate-800 uppercase">{userName}</p>
                  <p className="text-sm text-slate-500">Chefe de Seção</p>
                </div>
                <div className="border-t border-slate-400 pt-4 text-center">
                  <p className="font-bold text-slate-800 uppercase">THIAGO OLIVEIRA BARREIROS</p>
                  <p className="text-sm text-slate-500">Chefe de Serviço</p>
                </div>
              </div>

            </div>
          </div>
        </div>
      )}

      {/* MODAL DE EXPORTAÇÃO DO CÓDIGO (Só p/ Mapeamento) */}
      {showExportModal && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden">
            <div className="p-4 bg-slate-900 text-white flex justify-between items-center">
              <h3 className="font-bold flex items-center gap-2"><Copy className="w-5 h-5"/> Código da Planta Gerado</h3>
              <button onClick={() => setShowExportModal(false)}><X className="w-6 h-6 hover:text-red-400" /></button>
            </div>
            <div className="p-6">
              <p className="text-sm text-slate-600 mb-4">
                Excelente! Copie o código abaixo e cole no seu ficheiro <strong>src/pages/fiscalizacao.tsx</strong> substituindo a constante <code>PLANTA_URE_DEFINITIVA</code>.
              </p>
              <pre className="bg-slate-100 p-4 rounded-lg text-xs md:text-sm text-slate-800 overflow-auto max-h-96 border border-slate-300 select-all">
{`const PLANTA_URE_DEFINITIVA: Ambiente[] = [
${mappedRooms.map(r => `  { id: '${r.id}', name: '${r.name}', pavimento: '${r.pavimento}', top: ${r.top}, left: ${r.left}, width: ${r.width}, height: ${r.height} }`).join(',\n')}
];`}
              </pre>
              <div className="mt-6 flex justify-end">
                <button onClick={() => setShowExportModal(false)} className="bg-blue-600 text-white px-6 py-2.5 rounded-lg font-bold hover:bg-blue-700">Fechar e Concluir</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL DE AVALIAÇÃO (Só p/ Modo Normal) */}
      {selectedAmbiente && !isMappingMode && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 z-50">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden animate-in zoom-in-95 duration-200 max-h-[90vh] overflow-y-auto">
            <div className="bg-slate-900 text-white p-5 flex justify-between items-center relative overflow-hidden sticky top-0 z-20">
              <h3 className="text-xl font-bold relative z-10">{selectedAmbiente.name}</h3>
              <button onClick={closeModal} className="p-2 relative z-10"><X className="w-6 h-6 hover:text-red-400" /></button>
            </div>
            <div className="p-6 space-y-6">
              
              <div className="flex justify-between items-center bg-slate-50 p-4 rounded-xl border border-slate-200">
                <span className="font-bold text-slate-700">Nota Projetada:</span>
                <span className={`text-3xl font-black ${notaAtual >= 8 ? 'text-green-600' : notaAtual >= 5 ? 'text-yellow-500' : 'text-red-500'}`}>
                  {notaAtual.toFixed(1)} <span className="text-sm text-slate-400 font-medium">/ 10</span>
                </span>
              </div>

              <div className="space-y-3">
                <label className="flex items-center justify-between p-3 rounded-lg border border-slate-200 cursor-pointer">
                  <div className="flex items-center gap-3">
                    <div className={`w-6 h-6 rounded border flex items-center justify-center ${formData.q1_lavagem ? 'bg-blue-600 border-blue-600 text-white' : 'border-slate-300'}`}>{formData.q1_lavagem && <Check className="w-4 h-4"/>}</div>
                    <div><span className="font-medium">Houve lavagem pesada no mês?</span><p className="text-xs text-slate-400">+2.0 pts</p></div>
                  </div>
                  <input type="checkbox" className="hidden" checked={formData.q1_lavagem} onChange={() => handleCheckboxChange('q1_lavagem')} />
                </label>

                <label className="flex items-center justify-between p-3 rounded-lg border border-slate-200 cursor-pointer">
                  <div className="flex items-center gap-3">
                    <div className={`w-6 h-6 rounded border flex items-center justify-center ${formData.q2_semanal ? 'bg-blue-600 border-blue-600 text-white' : 'border-slate-300'}`}>{formData.q2_semanal && <Check className="w-4 h-4"/>}</div>
                    <div><span className="font-medium">Sala limpa com frequência semanal?</span><p className="text-xs text-slate-400">+2.0 pts</p></div>
                  </div>
                  <input type="checkbox" className="hidden" checked={formData.q2_semanal} onChange={() => handleCheckboxChange('q2_semanal')} />
                </label>

                <label className="flex items-center justify-between p-3 rounded-lg border border-slate-200 cursor-pointer">
                  <div className="flex items-center gap-3">
                    <div className={`w-6 h-6 rounded border flex items-center justify-center ${formData.q3_lixo ? 'bg-blue-600 border-blue-600 text-white' : 'border-slate-300'}`}>{formData.q3_lixo && <Check className="w-4 h-4"/>}</div>
                    <div><span className="font-medium">O lixo é recolhido adequadamente?</span><p className="text-xs text-slate-400">+1.5 pts</p></div>
                  </div>
                  <input type="checkbox" className="hidden" checked={formData.q3_lixo} onChange={() => handleCheckboxChange('q3_lixo')} />
                </label>

                <label className={`flex items-center justify-between p-3 rounded-lg border cursor-pointer ${formData.q4_poeira ? 'bg-red-50 border-red-200' : 'border-slate-200'}`}>
                  <div className="flex items-center gap-3">
                    <div className={`w-6 h-6 rounded border flex items-center justify-center ${formData.q4_poeira ? 'bg-red-600 border-red-600 text-white' : 'border-slate-300'}`}>{formData.q4_poeira && <X className="w-4 h-4"/>}</div>
                    <div>
                      <span className="font-medium">O lugar está visivelmente empoeirado?</span>
                      <p className={`text-xs ${formData.q4_poeira ? 'text-red-500 font-bold' : 'text-slate-400'}`}>{formData.q4_poeira ? 'Perde 1.5 pts' : '+1.5 pts se não estiver'}</p>
                    </div>
                  </div>
                  <input type="checkbox" className="hidden" checked={formData.q4_poeira} onChange={() => handleCheckboxChange('q4_poeira')} />
                </label>

                <label className="flex items-center justify-between p-3 rounded-lg border border-slate-200 cursor-pointer">
                  <div className="flex items-center gap-3">
                    <div className={`w-6 h-6 rounded border flex items-center justify-center ${formData.q5_ventilador ? 'bg-blue-600 border-blue-600 text-white' : 'border-slate-300'}`}>{formData.q5_ventilador && <Check className="w-4 h-4"/>}</div>
                    <div><span className="font-medium">Os ventiladores estão limpos?</span><p className="text-xs text-slate-400">+1.5 pts</p></div>
                  </div>
                  <input type="checkbox" className="hidden" checked={formData.q5_ventilador} onChange={() => handleCheckboxChange('q5_ventilador')} />
                </label>

                <label className="flex items-center justify-between p-3 rounded-lg border border-slate-200 cursor-pointer">
                  <div className="flex items-center gap-3">
                    <div className={`w-6 h-6 rounded border flex items-center justify-center ${formData.q6_vidro ? 'bg-blue-600 border-blue-600 text-white' : 'border-slate-300'}`}>{formData.q6_vidro && <Check className="w-4 h-4"/>}</div>
                    <div><span className="font-medium">Os vidros e janelas estão limpos?</span><p className="text-xs text-slate-400">+1.5 pts</p></div>
                  </div>
                  <input type="checkbox" className="hidden" checked={formData.q6_vidro} onChange={() => handleCheckboxChange('q6_vidro')} />
                </label>
              </div>

              <button 
                onClick={saveEvaluation} disabled={isSaving}
                className={`w-full py-3.5 rounded-xl font-bold text-white flex justify-center items-center gap-2 ${isSaving ? 'bg-slate-400' : 'bg-blue-600 hover:bg-blue-700'}`}
              >
                {isSaving ? 'A guardar...' : <><Save className="w-5 h-5" /> Confirmar Avaliação</>}
              </button>

            </div>
          </div>
        </div>
      )}

    </div>
  );
}
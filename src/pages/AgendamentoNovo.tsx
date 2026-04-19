// Importa bibliotecas essenciais do React para criar componentes, guardar estados e efeitos
import React, { useState, useEffect, useMemo } from 'react';
// Importa o cliente configurado do Supabase para conectar com o banco de dados
import { supabase } from '../lib/supabase';
// Importa a biblioteca de ícones para deixar a interface bonita
import { 
  Building2, Calendar, Clock, MapPin, Users, Plus, 
  Settings, AlertTriangle, CheckCircle2, ChevronLeft, ChevronRight,
  Trash2, FileDown, Loader2, X, RefreshCw, Check, XCircle, Edit3, History
} from 'lucide-react';

// Puxa a URL oficial do Google Apps Script que configuramos no arquivo .env
const GOOGLE_SCRIPT_URL = import.meta.env.VITE_GOOGLE_SCRIPT_URL_AGENDAMENTO;

// Define a "fôrma" (tipagem) dos dados de um Ambiente para o TypeScript não reclamar
interface Ambiente {
  id: string; // ID único do banco
  nome: string; // Nome da sala
  capacidade: number; // Quantidade de pessoas
}

// Define a "fôrma" (tipagem) dos dados de um Agendamento
interface Agendamento {
  id: string; // ID do agendamento
  ambiente_id: string; // ID da sala vinculada
  user_name: string; // Nome de quem pediu
  user_id: string; // ID de quem pediu
  titulo_evento: string; // Nome do evento
  data_agendamento: string; // Dia escolhido (YYYY-MM-DD)
  hora_inicio: string; // Hora que começa
  hora_fim: string; // Hora que termina
  quantidade_pessoas: number; // Lotação prevista
  observacao: string; // Notas extras
  status: 'pendente' | 'aprovado' | 'reprovado' | 'cancelado'; // Status do pedido
  motivo_reprovacao?: string; // Motivo caso o admin negue
  historico_edicao?: string; // Log de quem mudou o que
  ambientes?: Ambiente; // Os dados da sala em si (vindo do join do banco)
}

// Função auxiliar que gera os valores iniciais vazios/padrões para o formulário
const getFormDefaults = () => {
  const now = new Date(); // Pega a data e hora deste exato milissegundo
  // Formata o dia de hoje no padrão americano que o input type="date" exige
  const data_agendamento = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(now);
  // Formata a hora atual para o padrão de relógio do Brasil (HH:MM)
  const hora_inicio = now.toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' });
  
  // Retorna os campos prontos para preencher o state
  return {
    data_agendamento, // Vem com o dia de hoje
    hora_inicio, // Vem com a hora de agora
    hora_fim: '18:00', // Termina às 18h por padrão
    ambiente_id: '', // Sala em branco
    titulo_evento: '', // Título em branco
    quantidade_pessoas: '', // Lotação em branco
    observacao: '' // Notas em branco
  };
};

// COMPONENTE PRINCIPAL DA PÁGINA
export function AgendamentoNovo() {
  // === ESTADOS DE CONTROLE DE INTERFACE ===
  // Controla qual aba está visível: 'calendario', 'agendar' ou 'gerenciar'
  const [activeTab, setActiveTab] = useState<'calendario' | 'agendar' | 'gerenciar'>('calendario');
  // Controla se o calendário mostra o "dia" em detalhes ou a grade do "mes"
  const [viewMode, setViewMode] = useState<'dia' | 'mes'>('dia');
  
  // === ESTADOS DE USUÁRIO ===
  // Guarda o perfil da pessoa (ex: 'regional_admin' ou 'comum')
  const [userRole, setUserRole] = useState<string>('');
  // Guarda os dados brutos da conta logada no Supabase (email, id)
  const [currentUser, setCurrentUser] = useState<any>(null);
  
  // === ESTADOS DE DADOS DO BANCO ===
  // Guarda a lista de todas as salas
  const [ambientes, setAmbientes] = useState<Ambiente[]>([]);
  // Guarda a lista de todas as reservas cadastradas
  const [agendamentos, setAgendamentos] = useState<Agendamento[]>([]);
  // Guarda qual dia a pessoa clicou no calendário para inspecionar
  const [selectedDate, setSelectedDate] = useState(new Date());
  
  // === ESTADOS DE PROCESSAMENTO (LOADINGS) ===
  // Gira o botão ao salvar algo no banco
  const [loading, setLoading] = useState(false);
  // Gira o botão ao gerar o PDF
  const [exporting, setExporting] = useState(false);
  // Gira o botão ao sincronizar com o Google Sheets
  const [syncing, setSyncing] = useState(false);
  
  // === ESTADOS DE MENSAGENS ===
  // Guarda mensagens de erro para exibir alertas vermelhos
  const [errorMsg, setErrorMsg] = useState('');
  // Guarda mensagens de sucesso para exibir alertas verdes/amarelos
  const [successMsg, setSuccessMsg] = useState('');

  // === ESTADOS DE FORMULÁRIO (GERENCIAR) ===
  // Guarda o texto do nome da sala nova
  const [nomeAmbiente, setNomeAmbiente] = useState('');
  // Guarda o número de capacidade da sala nova
  const [capacidadeAmbiente, setCapacidadeAmbiente] = useState('');

  // === ESTADOS DE FORMULÁRIO (AGENDAR) ===
  // Guarda todos os campos que o usuário está digitando ao pedir uma sala
  const [agendamentoForm, setAgendamentoForm] = useState(getFormDefaults());

  // === ESTADOS DOS MODAIS FLUTUANTES ===
  // Controla se a janelinha de gerar PDF está aberta
  const [showPdfModal, setShowPdfModal] = useState(false);
  // Guarda o dia que o usuário escolheu gerar o PDF
  const [pdfDateStr, setPdfDateStr] = useState(() => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date()));
  // Guarda qual evento o Admin clicou para editar (se for nulo, o modal some)
  const [agendamentoEditando, setAgendamentoEditando] = useState<Agendamento | null>(null);
  // Guarda qual evento o usuário clicou para ver as edições antigas
  const [historicoModal, setHistoricoModal] = useState<Agendamento | null>(null);
  // NOVO: Controla se a janela gigante de aprovar/reprovar pendências está aberta
  const [showPendentesModal, setShowPendentesModal] = useState(false);

  // === ESTADO DE CONTROLE DO BACKUP DA PLANILHA ===
  // Guarda a data e hora exata de quando o Sheets foi sincronizado pela última vez
  const [ultimaSincronizacao, setUltimaSincronizacao] = useState<Date | null>(null);

  // Efeito que roda assim que o componente nasce na tela
  useEffect(() => {
    // Chama a função que busca quem está logado e puxa tudo do banco
    fetchSessionAndData();
    
    // Procura no disco do navegador se a gente já fez sincronização antes
    const syncSalva = localStorage.getItem('sge_gsu_last_sync');
    // Se achou um registro antigo...
    if (syncSalva) {
      // Salva essa data no estado para o sistema saber quando foi
      setUltimaSincronizacao(new Date(syncSalva));
    }
  }, []); // Array vazio garante que roda só na montagem

  // === LÓGICAS MEMORIZADAS (USEMEMO) ===
  
  // Calcula quantas horas se passaram desde a última exportação pro Google
  const horasDesdeUltimaSync = useMemo(() => {
    // Se não tiver registro, devolve 999 pra forçar o aviso de "Atrasado"
    if (!ultimaSincronizacao) return 999; 
    // Subtrai a data de agora pela data da última sincronização
    const diffMs = new Date().getTime() - ultimaSincronizacao.getTime();
    // Converte os milissegundos matematicamente para Horas
    return Math.floor(diffMs / (1000 * 60 * 60));
  }, [ultimaSincronizacao, activeTab]); // Recalcula se o usuário trocar de aba

  // Filtra e prepara a lista de pendências para o NOVO MODAL do Admin
  const agendamentosPendentesLista = useMemo(() => {
    return agendamentos
      // Pega só o que o status for literalmente 'pendente'
      .filter(a => a.status === 'pendente')
      // Organiza por data (do mais velho pro mais novo) e depois por hora
      .sort((a, b) => a.data_agendamento.localeCompare(b.data_agendamento) || a.hora_inicio.localeCompare(b.hora_inicio));
  }, [agendamentos]); // Recalcula toda vez que a lista global mudar

  // === FUNÇÕES DE ACESSO AO BANCO DE DADOS ===

  // Busca quem é a pessoa e os dados do painel
  async function fetchSessionAndData() {
    // Pede a sessão atual pro servidor do Supabase
    const { data: { session } } = await supabase.auth.getSession();
    if (session) {
      // Salva os dados brutos da pessoa
      setCurrentUser(session.user);
      // Puxa a tabela 'profiles' conectando pelo ID para saber a permissão dela
      const { data: profile } = await (supabase as any).from('profiles').select('role').eq('id', session.user.id).single();
      // Se achou, guarda a patente (ex: regional_admin)
      if (profile) setUserRole(profile.role);
    }
    // Dispara a busca simultânea de salas e de reservas
    fetchAmbientes();
    fetchAgendamentos();
  }

  // Puxa todas as salas que não foram excluídas
  async function fetchAmbientes() {
    // Traz de 'ambientes' tudo que ativo for true, organizado por nome
    const { data } = await (supabase as any).from('ambientes').select('*').eq('ativo', true).order('nome');
    if (data) setAmbientes(data); // Salva no state
  }

  // Puxa todas as reservas feitas
  async function fetchAgendamentos() {
    // Traz tudo da tabela, juntando com os dados da sala vinculada
    const { data } = await (supabase as any).from('agendamentos_ambientes').select('*, ambientes(*)').order('data_agendamento', { ascending: false });
    if (data) setAgendamentos(data); // Salva no state
  }

  // Lógica matemática para saber se uma sala já está ocupada naquele dia e hora
  const obterStatusAmbiente = (ambienteId: string, ignorarAgendamentoId?: string) => {
    // Se o cara nem terminou de preencher a hora no formulário, a gente diz que tá livre
    if (!agendamentoForm.data_agendamento || !agendamentoForm.hora_inicio || !agendamentoForm.hora_fim) return 'livre';

    // Cria datas de mentira (01-01-1970) só pra gente conseguir comparar matematicamente as horas
    const formInicio = new Date(`1970-01-01T${agendamentoForm.hora_inicio}`);
    const formFim = new Date(`1970-01-01T${agendamentoForm.hora_fim}`);

    // Vasculha o array de agendamentos pra ver se tem choque
    const conflito = agendamentos.some(ag => {
      // Ignora se for cancelado ou reprovado (porque esses não ocupam sala)
      if (ag.status === 'reprovado' || ag.status === 'cancelado') return false; 
      // Se o admin tá editando o evento, ignora o próprio evento pra não dar falso positivo
      if (ignorarAgendamentoId && ag.id === ignorarAgendamentoId) return false;
      // Se a sala for diferente ou o dia for diferente, tá liberado
      if (ag.ambiente_id !== ambienteId || ag.data_agendamento !== agendamentoForm.data_agendamento) return false;
      
      // Cria as datas de mentira dos eventos velhos pra comparar
      const agInicio = new Date(`1970-01-01T${ag.hora_inicio}`);
      const agFim = new Date(`1970-01-01T${ag.hora_fim}`);
      
      // Regra da intersecção: O que ele digitou começa antes do evento velho terminar E termina depois dele começar?
      return (formInicio < agFim && formFim > agInicio); // Se sim, BATEU!
    });

    // Devolve 'ocupado' se achou choque, senão 'livre'
    return conflito ? 'ocupado' : 'livre';
  };

  // Fica observando o usuário preencher o formulário
  useEffect(() => {
    // Se a pessoa trocar o horário de um evento e a sala escolhida ficar ocupada de repente
    if (!agendamentoEditando && agendamentoForm.ambiente_id && obterStatusAmbiente(agendamentoForm.ambiente_id) === 'ocupado') {
      // Limpa a sala pra ele ser forçado a escolher de novo
      setAgendamentoForm(prev => ({ ...prev, ambiente_id: '' }));
      // Pinta o aviso vermelho pra ele entender
      setErrorMsg('O horário foi alterado e o ambiente selecionado não está mais disponível.');
    } else {
      // Se tá tudo bem, limpa o erro
      setErrorMsg(''); 
    }
  }, [agendamentoForm.data_agendamento, agendamentoForm.hora_inicio, agendamentoForm.hora_fim]);

  // Pega apenas as reservas que caem no dia exato que o cara selecionou no form
  const agendamentosDoDiaSelecionado = useMemo(() => {
    if (!agendamentoForm.data_agendamento) return [];
    return agendamentos
      // Filtra pelo dia do formulário e tira os irrelevantes
      .filter(a => a.data_agendamento === agendamentoForm.data_agendamento && a.status !== 'reprovado' && a.status !== 'cancelado')
      // Organiza as caixinhas pelo horário mais cedo
      .sort((a, b) => a.hora_inicio.localeCompare(b.hora_inicio));
  }, [agendamentos, agendamentoForm.data_agendamento]);

  // Função do Administrador Regional: Aprova ou Reprova um pedido (Usada no calendário e no Modal novo)
  const alterarStatus = async (id: string, novoStatus: 'aprovado' | 'reprovado' | 'cancelado') => {
    let motivo = '';
    // Se apertou em reprovar, sobe uma caixa de texto simples do navegador pedindo a justificativa
    if (novoStatus === 'reprovado') {
      motivo = prompt('Qual o motivo da reprovação? (Opcional)') || 'Não informado';
    }

    try {
      // Manda a canetada pro Supabase
      const { error } = await (supabase as any).from('agendamentos_ambientes')
        .update({ status: novoStatus, motivo_reprovacao: motivo })
        .eq('id', id); // Usando o ID do evento clicado
      
      // Se o banco chorar, joga pro catch
      if (error) throw error; 
      
      // Avisa na tela que a operação foi um sucesso
      alert(`Agendamento ${novoStatus} com sucesso!`);
      // Puxa a lista de volta, o que vai fazer sumir do modal e pintar de cor nova no calendário
      fetchAgendamentos();
    } catch (err: any) {
      console.error(err);
      alert('Erro ao alterar status. Verifique as permissões do banco.');
    }
  };

  // Função de humildade: A própria pessoa desiste da reserva que fez
  const cancelarMeuAgendamento = async (ag: Agendamento) => {
    // Pede pra ter certeza
    if (!confirm('Deseja realmente cancelar o seu agendamento? Esta ação não pode ser desfeita.')) return;
    try {
      // Muda pra cancelado
      const { error } = await (supabase as any).from('agendamentos_ambientes')
        .update({ status: 'cancelado' })
        .eq('id', ag.id);
      
      if (error) throw error;
      alert('Agendamento cancelado com sucesso!');
      fetchAgendamentos(); // Atualiza
    } catch (err) {
      console.error(err);
      alert('Erro ao cancelar o agendamento.');
    }
  };

  // O Admin clica no lápis para consertar um evento que alguém errou
  const abrirModalEdicao = (ag: Agendamento) => {
    // Diz pro sistema qual item estamos "segurando"
    setAgendamentoEditando(ag);
    // Enfia os dados antigos nos campos do formulário para o admin ver o que estava antes
    setAgendamentoForm({
      data_agendamento: ag.data_agendamento,
      hora_inicio: ag.hora_inicio,
      hora_fim: ag.hora_fim,
      ambiente_id: ag.ambiente_id,
      titulo_evento: ag.titulo_evento,
      quantidade_pessoas: ag.quantidade_pessoas.toString(),
      observacao: ag.observacao || ''
    });
  };

  // O Admin aperta "Salvar Alterações" no modal do Lápis
  const salvarEdicao = async (e: React.FormEvent) => {
    e.preventDefault(); // Trava a tela pra não dar refresh (padrão HTML)
    if (!agendamentoEditando) return; // Se por milagre não tiver evento, aborta

    // O cara pode ter trocado a hora pra um momento que já tem reunião! Vamos checar:
    if (obterStatusAmbiente(agendamentoForm.ambiente_id, agendamentoEditando.id) === 'ocupado') {
      alert('⚠️ Este horário já está ocupado por outro agendamento!');
      return; // Trava e não deixa salvar
    }

    try {
      setLoading(true); // Gira engrenagem
      
      // SISTEMA DE AUDITORIA: Observa linha por linha o que o abençoado alterou
      const mudancas = [];
      if (agendamentoEditando.data_agendamento !== agendamentoForm.data_agendamento) mudancas.push(`Data: ${agendamentoEditando.data_agendamento} -> ${agendamentoForm.data_agendamento}`);
      if (agendamentoEditando.hora_inicio !== agendamentoForm.hora_inicio) mudancas.push(`Início: ${agendamentoEditando.hora_inicio} -> ${agendamentoForm.hora_inicio}`);
      if (agendamentoEditando.hora_fim !== agendamentoForm.hora_fim) mudancas.push(`Fim: ${agendamentoEditando.hora_fim} -> ${agendamentoForm.hora_fim}`);
      if (agendamentoEditando.ambiente_id !== agendamentoForm.ambiente_id) mudancas.push(`Sala alterada`);
      if (agendamentoEditando.titulo_evento !== agendamentoForm.titulo_evento) mudancas.push(`Título: ${agendamentoEditando.titulo_evento} -> ${agendamentoForm.titulo_evento}`);
      
      // Resgata o diário de bordo antigo (se existir)
      let novoHistorico = agendamentoEditando.historico_edicao || '';
      // Se ele de fato alterou coisas...
      if (mudancas.length > 0) {
        // Pega o timestamp de agora
        const dataAtual = new Date().toLocaleString('pt-BR');
        // Escreve a linha do crime
        const registro = `[${dataAtual}] Alterações: ${mudancas.join(' | ')}`;
        // Gruda a linha nova debaixo das antigas
        novoHistorico = novoHistorico ? `${novoHistorico}\n${registro}` : registro;
      }

      // Envia pro Supabase a sobreposição de dados
      const { error } = await (supabase as any).from('agendamentos_ambientes').update({
        ...agendamentoForm, // Espeja todos os campos preenchidos
        quantidade_pessoas: Number(agendamentoForm.quantidade_pessoas), // Força a ser número
        historico_edicao: novoHistorico // Coloca a nova ficha criminal
      }).eq('id', agendamentoEditando.id);

      if (error) throw error; // Tchau e bença

      alert('Agendamento editado com sucesso!');
      setAgendamentoEditando(null); // Esconde a janela flutuante
      setAgendamentoForm(getFormDefaults()); // Limpa o state do form
      fetchAgendamentos(); // Traz a nova realidade do banco pra tela
    } catch (err: any) {
      console.error(err);
      alert('Erro ao editar agendamento. Verifique as permissões do banco.');
    } finally {
      setLoading(false); // Para de girar
    }
  };

  // Botão principal do plebeu: Pedir uma sala
  const handleAgendar = async (e: React.FormEvent) => {
    e.preventDefault(); // Sem refresh na página
    setErrorMsg(''); // Some mensagens vermelhas
    setSuccessMsg(''); // Some mensagens verdes

    // Acha na memória a sala que o usuário selecionou no dropdown
    const ambienteSelecionado = ambientes.find(a => a.id === agendamentoForm.ambiente_id);
    // Compara a lotação. Se estourar a capacidade, xinga e barra!
    if (Number(agendamentoForm.quantidade_pessoas) > (ambienteSelecionado?.capacidade || 0)) {
      setErrorMsg(`A capacidade máxima deste ambiente é de ${ambienteSelecionado?.capacidade} pessoas.`);
      return;
    }

    setLoading(true); // Gira!
    try {
      // Pega o nome amigável do perfil, se o cara não tiver nome no banco, usa antes do @ do e-mail
      const userName = currentUser.user_metadata?.full_name || currentUser.email.split('@')[0];
      
      // INSERT na tabela principal
      const { error } = await (supabase as any).from('agendamentos_ambientes').insert([{
        ...agendamentoForm, // Despeja datas, horas, títulos...
        quantidade_pessoas: Number(agendamentoForm.quantidade_pessoas),
        user_id: currentUser.id, // Amarra na conta do Supabase Auth
        user_name: userName, // Põe o nomezinho ali
        status: 'pendente' // Começa sempre bloqueado pro chefe ver
      }]);

      if (error) throw error; // Erro vai pro log

      setSuccessMsg('Agendamento solicitado com sucesso! Aguarde a aprovação.');
      setAgendamentoForm(getFormDefaults()); // Limpa campos
      fetchAgendamentos(); // Atualiza painel invisivelmente
      
      // Transição mágica: Pula pra aba do calendário dps de 2 segundos pro cara se certificar que ta lá
      setTimeout(() => setActiveTab('calendario'), 2000);
    } catch (err: any) {
      setErrorMsg(err.message); // Se der erro exibe em vermelho
    } finally {
      setLoading(false);
    }
  };

  // Aba Gerenciar: O Admin constrói um novo império (Sala)
  const handleCriarAmbiente = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      // Manda pro banco só nome e número
      const { error } = await (supabase as any).from('ambientes').insert([{ nome: nomeAmbiente, capacidade: Number(capacidadeAmbiente) }]);
      if (error) throw error;
      // Zera as caixas
      setNomeAmbiente(''); setCapacidadeAmbiente(''); 
      // Busca de novo pra ele aparecer na listinha de baixo
      fetchAmbientes();
      alert('Ambiente cadastrado com sucesso!');
    } catch (err) {
      alert('Erro ao cadastrar ambiente.');
    } finally {
      setLoading(false);
    }
  };

  // Aba Gerenciar: Destruir sala
  const handleDeletarAmbiente = async (id: string) => {
    // Alerta pra não ter choro depois
    if(!confirm('Deseja realmente remover este ambiente?')) return;
    // O pulo do gato: Não apaga a sala de verdade, só esconde (`ativo = false`), assim o PDF antigo não quebra!
    await (supabase as any).from('ambientes').update({ ativo: false }).eq('id', id);
    fetchAmbientes(); // Recarrega
  };

  // ========================================================================
  // EXPORTAÇÃO PARA O GOOGLE SHEETS COM BYPASS DE CORS (AULA DE CIBERSEGURANÇA)
  // ========================================================================
  const handleSyncSheet = async () => {
    // Segurança pra não tentar enviar pro vazio
    if (!GOOGLE_SCRIPT_URL) {
      alert("URL da planilha não configurada no .env!");
      return;
    }
    
    setSyncing(true); // O icone de reciclar começa a girar
    try {
      // Mapeia o pacotão pesado do banco e transforma num pacotinho mastigado pro Excel
      const payload = agendamentos.map(ag => ({
        id: ag.id,
        data_agendamento: ag.data_agendamento.split('-').reverse().join('/'), // DD/MM/AAAA BR
        hora_inicio: ag.hora_inicio.slice(0, 5), // Corta os segundos inúteis (HH:MM)
        hora_fim: ag.hora_fim.slice(0, 5), 
        ambiente: ag.ambientes?.nome || 'Ambiente Excluído', // Se a sala foi apagada, diz isso
        titulo_evento: ag.titulo_evento,
        responsavel: ag.user_name,
        quantidade_pessoas: ag.quantidade_pessoas,
        observacao: ag.observacao || "", // Se não tiver, manda vazio pra não dar pau
        status: ag.status.toUpperCase(), // CAIXA ALTA PORQUE SIM
        motivo_reprovacao: ag.motivo_reprovacao || "",
        historico_edicao: ag.historico_edicao || "",
        criado_em: "Exportado via Sistema" // Aviso
      }));

      // A REQUISIÇÃO OFICIAL QUE VAI PRO GOOGLE
      await fetch(GOOGLE_SCRIPT_URL, {
        method: 'POST',
        mode: 'no-cors', 
        headers: { 
          'Content-Type': 'text/plain;charset=utf-8' 
        },
        body: JSON.stringify(payload)
      });

      // Se passou batido e enviou, salva a hora do sucesso
      const agora = new Date(); 
      // Grava no cérebro do navegador (F12 > Application > LocalStorage)
      localStorage.setItem('sge_gsu_last_sync', agora.toISOString());
      // Salva no State pra tirar a faixa amarela da tela do chefe na hora
      setUltimaSincronizacao(agora);

      alert("Planilha sincronizada com sucesso! Verifique o Google Sheets.");
    } catch (err) {
      console.error(err);
      alert("Erro ao enviar dados para a planilha. Verifique o console.");
    } finally {
      setSyncing(false); // Para de girar o treco
    }
  };

  // Variável que guarda o NÚMERO total de reservas com a palavra 'pendente'
  const agendamentosPendentesGeral = useMemo(() => {
    return agendamentos.filter(a => a.status === 'pendente').length;
  }, [agendamentos]);

  // Transforma a data que a pessoa clicou no calendário num formato legível pro banco
  const selectedDateTelaStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(selectedDate);
  
  // Lista de agendamentos só pra preencher a aba "Dia"
  const dateBookings = useMemo(() => {
    return agendamentos
      .filter(s => s.data_agendamento === selectedDateTelaStr)
      .sort((a, b) => a.hora_inicio.localeCompare(b.hora_inicio));
  }, [agendamentos, selectedDateTelaStr]);

  // ========================================================================
  // MATEMÁTICA AVANÇADA DE CALENDÁRIO: ACHAR O INÍCIO E FIM DA SEMANA
  // ========================================================================
  const { pdfStartOfWeek, pdfEndOfWeek, pdfStartStr, pdfEndStr } = useMemo(() => {
    // Quebra a data "2026-04-19" em Ano(2026), Mes(04), Dia(19)
    const [y, m, d] = pdfDateStr.split('-').map(Number);
    // O mês no JavaScript começa do zero (0=Jan, 1=Fev...), por isso o m - 1
    const refDate = new Date(y, m - 1, d); 
    // Descobre em qual dedo da semana cai (Domingo = 0, Seg = 1...)
    const day = refDate.getDay(); 
    
    const start = new Date(refDate);
    // Volta a data no tempo subtraindo o número da semana pra cair EXATAMENTE num Domingo
    start.setDate(refDate.getDate() - day); 
    
    const end = new Date(start);
    // Pula 6 dias pra frente pra cair num Sábado
    end.setDate(start.getDate() + 6); 

    // Formata tudo pra string de novo pra o banco entender
    const startStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(start);
    const endStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(end);

    // Devolve os 4 pedaços mágicos pro resto do código usar
    return { pdfStartOfWeek: start, pdfEndOfWeek: end, pdfStartStr: startStr, pdfEndStr: endStr };
  }, [pdfDateStr]); // Só roda de novo se ele trocar o dia no input de gerar PDF

  // Agrupa os eventos em "caixinhas" baseadas nos dias para montar as páginas do PDF
  const groupedPdfBookings = useMemo(() => {
    // Filtra de domingo a sábado
    const filtered = agendamentos.filter(a => a.data_agendamento >= pdfStartStr && a.data_agendamento <= pdfEndStr)
                                 .sort((a,b) => a.data_agendamento === b.data_agendamento ? a.hora_inicio.localeCompare(b.hora_inicio) : a.data_agendamento.localeCompare(b.data_agendamento));
    
    // Cria um objeto vazio parecendo um dicionário
    const grouped: Record<string, Agendamento[]> = {};
    // Enfia cada evento na página do seu dia correspondente
    filtered.forEach(ag => {
      if (!grouped[ag.data_agendamento]) grouped[ag.data_agendamento] = [];
      grouped[ag.data_agendamento].push(ag);
    });
    return grouped;
  }, [agendamentos, pdfStartStr, pdfEndStr]);

  // Função hacker que tira um "print invisível" do HTML oculto e cospe um PDF na mesa
  const handleExportPDF = async () => {
    setExporting(true); // Mostra que tá trabalhando
    try {
      // Injeta a biblioteca html2pdf sorrateiramente no projeto caso ela não esteja lá
      const loadScript = (src: string) => {
        return new Promise((resolve, reject) => {
          if (document.querySelector(`script[src="${src}"]`)) return resolve(true);
          const script = document.createElement('script');
          script.src = src;
          script.onload = resolve;
          script.onerror = reject;
          document.head.appendChild(script);
        });
      };

      // Chama a função injetora passando a CDN
      await loadScript('https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js');

      // Caça a div feiosa escondida que tem a tabela HTML
      const template = document.getElementById('weekly-report-template');
      if (!template) throw new Error("Template de relatório não encontrado.");

      // Suga a alma da Div (Pega o código cru HTML)
      const htmlContent = template.innerHTML;

      // Opções da impressora virtual
      const opt = {
        margin: [10, 10, 10, 10], // Bordinhas de 1cm
        filename: `Agenda_Semanal_${pdfStartStr.replace(/-/g, '_')}.pdf`, // Nome bonito
        image: { type: 'jpeg', quality: 1 }, 
        html2canvas: { 
          scale: 2, // 2x de zoom pra ficar HD na hora do print
          useCORS: true, // Autoriza imagens de fora 
          letterRendering: true
        },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'landscape' }, // Deita a folha A4 (Paisagem)
        pagebreak: { mode: ['css', 'legacy'] } // Corta os blocos direitinho se vazar a folha
      };

      // Mágica! A biblioteca mastiga o texto e tosse um arquivo .pdf pro navegador salvar
      await (window as any).html2pdf().set(opt).from(htmlContent).save();
      
      setExporting(false); // Acabou
      setShowPdfModal(false); // Some com a janela

    } catch (err) {
      console.error(err);
      alert("Erro ao gerar o PDF.");
      setExporting(false);
    }
  };

  // Função que devolve uma TAG de design com corzinhas dependendo da palavra "aprovado, reprovado..."
  const renderStatusBadge = (status: string) => {
    if (status === 'aprovado') return <span className="px-2 py-1 bg-emerald-100 text-emerald-700 rounded-md text-[10px] font-black uppercase flex items-center gap-1"><CheckCircle2 size={12}/> Aprovado</span>;
    if (status === 'reprovado') return <span className="px-2 py-1 bg-red-100 text-red-700 rounded-md text-[10px] font-black uppercase flex items-center gap-1"><XCircle size={12}/> Reprovado</span>;
    if (status === 'cancelado') return <span className="px-2 py-1 bg-slate-200 text-slate-600 rounded-md text-[10px] font-black uppercase flex items-center gap-1"><X size={12}/> Cancelado</span>;
    // O padrão é pintar de amarelinho se não for nenhum desses
    return <span className="px-2 py-1 bg-amber-100 text-amber-700 rounded-md text-[10px] font-black uppercase flex items-center gap-1"><Clock size={12}/> Pendente</span>;
  };

  // O Picasso do sistema: Desenha a grade de quadradinhos do modo "Mês"
  const renderCalendarioMes = () => {
    const year = selectedDate.getFullYear();
    const month = selectedDate.getMonth();
    // Descobre em que "casinha" (Domingo, Seg...) começa o dia 01 daquele mês
    const firstDay = new Date(year, month, 1).getDay(); 
    // Descobre se o mês morre no dia 28, 30 ou 31
    const daysInMonth = new Date(year, month + 1, 0).getDate(); 
    
    // Cria blocos mortos/fantasmas pro começo da grade antes do dia 01
    const blanks = Array(firstDay).fill(null); 
    // Cria um array só com números [1, 2, 3...]
    const days = Array.from({length: daysInMonth}, (_, i) => i + 1); 
    // Funde os blocos fantasmas com os blocos vivos
    const slots = [...blanks, ...days]; 

    const weekDays = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

    return (
      <div className="animate-in fade-in duration-300">
        {/* Renderiza o letreiro dos dias da semana no topo */}
        <div className="grid grid-cols-7 gap-1 md:gap-2 mb-2">
          {weekDays.map(wd => <div key={wd} className="text-center text-[10px] md:text-xs font-black text-slate-400 uppercase">{wd}</div>)}
        </div>
        {/* Renderiza a malha de slots (quadradinhos) */}
        <div className="grid grid-cols-7 gap-1 md:gap-2">
          {slots.map((day, idx) => {
            // Se for bloco fantasma, pinta de cinza claro e morre aí
            if (!day) return <div key={`blank-${idx}`} className="h-16 md:h-28 bg-slate-50/50 rounded-xl border border-slate-100/50"></div>;
            
            // Pega a data YYYY-MM-DD desse dia específico que o map tá desenhando agora
            const dateStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date(year, month, day));
            // Garimpa se tem evento nesse dia
            const dayEvents = agendamentos.filter(a => a.data_agendamento === dateStr && a.status !== 'reprovado' && a.status !== 'cancelado');
            // Checa se esse dia é exatemente o HOJE na vida real pra marcar a cor
            const isToday = dateStr === new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());

            return (
              <div 
                key={day} 
                // Se ele clicar no bloco, muda o state principal e chuta ele pra visão do "Dia"
                onClick={() => { setSelectedDate(new Date(year, month, day)); setViewMode('dia'); }}
                // CSS Dinâmico: Borda azul do dia, borda roxa se tiver evento, sombra se hover...
                className={`h-16 md:h-28 p-1 md:p-2 rounded-xl border cursor-pointer transition-all flex flex-col hover:border-indigo-400 hover:shadow-md ${isToday ? 'bg-indigo-50 border-indigo-200' : 'bg-white border-slate-200'} ${dayEvents.length > 0 ? 'border-l-4 border-l-indigo-500' : ''}`}
              >
                {/* Número do dia */}
                <div className="flex justify-between items-start">
                  <span className={`text-xs md:text-sm font-black ${isToday ? 'text-indigo-600' : 'text-slate-700'}`}>{day}</span>
                  {/* Se for mobile e tiver evento, põe a bolinha roxa com o número de reuniões */}
                  {dayEvents.length > 0 && (
                    <span className="bg-indigo-100 text-indigo-700 text-[9px] font-bold px-1.5 py-0.5 rounded-full md:hidden">
                      {dayEvents.length}
                    </span>
                  )}
                </div>
                
                {/* Barrinha dos eventinhos em miniatura (só aparece no PC/Tablet) */}
                <div className="flex-1 overflow-y-auto mt-1 space-y-1 custom-scrollbar hidden md:block">
                  {/* Corta nos 3 primeiros pra não estourar a caixa */}
                  {dayEvents.slice(0, 3).map(ev => (
                    <div key={ev.id} className={`text-[9px] font-bold px-1.5 py-0.5 rounded truncate ${ev.status === 'aprovado' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                      {ev.hora_inicio.slice(0,5)} - {ev.titulo_evento}
                    </div>
                  ))}
                  {/* Se tiver 4 ou mais, mostra "+ X eventos" */}
                  {dayEvents.length > 3 && (
                     <div className="text-[9px] text-slate-400 font-bold px-1 text-center">+{dayEvents.length - 3} eventos</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  // ==========================================
  // RETORNO VISUAL GERAL DO COMPONENTE (JSX)
  // O que vai de fato pra tela do HTML
  // ==========================================
  return (
    // Fundo da Tela
    <div className="space-y-8 pb-20 animate-in fade-in duration-500 relative">
      
      {/* ----------------------------------------------------- */}
      {/* SESSÃO DE MODAIS (CAIXAS FLUTUANTES)                  */}
      {/* ----------------------------------------------------- */}

      {/* 1. MODAL DE APROVAÇÃO RÁPIDA DE PENDÊNCIAS (A NOVIDADE!) */}
      {/* Se o state for true, desenha a janela escura no fundo */}
      {showPendentesModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-[2rem] p-8 max-w-4xl w-full max-h-[90vh] flex flex-col shadow-2xl animate-in zoom-in-95 duration-200">
            
            {/* Cabecera do Modal de Aprovações */}
            <div className="flex justify-between items-center mb-6 border-b border-slate-100 pb-4 shrink-0">
              <h3 className="text-xl font-black text-slate-800 uppercase tracking-tight flex items-center gap-2">
                <AlertTriangle size={24} className="text-amber-500"/> Fila de Aprovação
              </h3>
              {/* Botão X para fechar */}
              <button onClick={() => setShowPendentesModal(false)} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-all">
                <X size={24}/>
              </button>
            </div>

            {/* Listona com barra de rolagem (overflow-y-auto) */}
            <div className="overflow-y-auto space-y-4 custom-scrollbar pr-2 flex-1">
              {agendamentosPendentesLista.length > 0 ? (
                // Mapeia todos os que estão pendentes e cria um "Card" pra eles
                agendamentosPendentesLista.map(b => (
                  <div key={b.id} className="p-5 bg-slate-50 border border-slate-200 rounded-2xl flex flex-col md:flex-row md:items-center justify-between gap-4 transition-all hover:shadow-md hover:border-amber-300">
                    
                    {/* Lado esquerdo do Card: Dados */}
                    <div className="flex items-start gap-4">
                      {/* Ícone reloginho amarelo */}
                      <div className="w-12 h-12 rounded-2xl bg-amber-100 text-amber-600 flex items-center justify-center shrink-0">
                        <Clock size={20} />
                      </div>
                      <div>
                        <div className="flex flex-wrap items-center gap-2 mb-1">
                          <h3 className="font-black uppercase text-base text-slate-800">{b.titulo_evento}</h3>
                          {/* Printa a data certinha */}
                          <span className="bg-indigo-100 text-indigo-700 text-[10px] font-black px-2 py-0.5 rounded-md uppercase">
                            {b.data_agendamento.split('-').reverse().join('/')}
                          </span>
                        </div>
                        {/* Rodapézinho com os dados da sala e hora */}
                        <div className="flex flex-wrap items-center gap-3 mt-1 text-xs font-bold text-slate-500">
                          <span className="flex items-center gap-1"><Building2 size={12} className="text-indigo-500"/> {b.ambientes?.nome}</span>
                          <span className="flex items-center gap-1"><Clock size={12} className="text-indigo-500"/> {b.hora_inicio.slice(0,5)} às {b.hora_fim.slice(0,5)}</span>
                          <span className="flex items-center gap-1"><Users size={12} className="text-indigo-500"/> {b.quantidade_pessoas} pess.</span>
                        </div>
                        {/* Se o cara pedir microfone ou coisas extras */}
                        {b.observacao && (
                          <p className="text-[11px] text-slate-500 mt-2 font-medium italic border-l-2 border-slate-300 pl-2">Obs: {b.observacao}</p>
                        )}
                      </div>
                    </div>

                    {/* Lado Direito do Card: Botões da Guilhotina */}
                    <div className="flex flex-col items-end gap-2 shrink-0 border-t md:border-t-0 md:border-l border-slate-200 pt-3 md:pt-0 md:pl-4 mt-2 md:mt-0 w-full md:w-auto">
                      <div className="text-right w-full">
                        <p className="text-[9px] uppercase font-black text-slate-400 tracking-widest">Solicitante</p>
                        <p className="text-xs font-bold text-indigo-700">{b.user_name}</p>
                      </div>
                      <div className="flex items-center justify-end gap-2 mt-1 w-full">
                        {/* Botão de Dar O.K - Note que a função é a mesma alterarStatus */}
                        <button onClick={() => alterarStatus(b.id, 'aprovado')} className="flex-1 md:flex-none px-4 py-2 bg-emerald-50 text-emerald-600 hover:bg-emerald-600 hover:text-white rounded-xl transition-all flex items-center justify-center gap-1.5 text-[10px] font-black uppercase tracking-widest"><Check size={16}/> Aprovar</button>
                        {/* Botão de Negar */}
                        <button onClick={() => alterarStatus(b.id, 'reprovado')} className="flex-1 md:flex-none px-4 py-2 bg-red-50 text-red-600 hover:bg-red-600 hover:text-white rounded-xl transition-all flex items-center justify-center gap-1.5 text-[10px] font-black uppercase tracking-widest"><X size={16}/> Reprovar</button>
                      </div>
                    </div>

                  </div>
                ))
              ) : (
                // Quando o Admin aprovar o último e o array esvaziar, ele cai aqui mostrando tela de sucesso!
                <div className="text-center py-10 text-slate-400 flex flex-col items-center">
                  <CheckCircle2 size={48} className="mb-3 text-emerald-400 opacity-50" />
                  <p className="font-bold text-lg text-slate-600">Fila zerada!</p>
                  <p className="text-sm">Todos os agendamentos já foram analisados.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 2. MODAL: Histórico de Edições Antigas */}
      {historicoModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-[2rem] p-8 max-w-lg w-full shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="flex justify-between items-center mb-6 border-b border-slate-100 pb-4">
              <h3 className="text-xl font-black text-slate-800 uppercase tracking-tight flex items-center gap-2">
                <History size={24} className="text-indigo-600"/> Histórico de Edições
              </h3>
              <button onClick={() => setHistoricoModal(null)} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-all">
                <X size={24}/>
              </button>
            </div>
            
            <div className="max-h-[60vh] overflow-y-auto space-y-3 custom-scrollbar pr-2">
              {historicoModal.historico_edicao ? (
                // Quebra a stringão usando o \n e mapeia linha por linha
                historicoModal.historico_edicao.split('\n').map((linha, index) => (
                  <div key={index} className="p-4 bg-slate-50 rounded-2xl border border-slate-200 text-sm font-medium text-slate-700">
                    {linha}
                  </div>
                ))
              ) : (
                <p className="text-center text-slate-400 font-bold py-4">Nenhuma edição registrada.</p>
              )}
            </div>
            <button onClick={() => setHistoricoModal(null)} className="w-full mt-6 py-4 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-2xl font-black text-xs uppercase tracking-widest transition-all">
              Fechar
            </button>
          </div>
        </div>
      )}

      {/* 3. MODAL: O Editor de Agendamentos (Com os Inputs preenchidos) */}
      {agendamentoEditando && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-[2rem] p-8 max-w-2xl w-full shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-black text-slate-800 uppercase tracking-tight flex items-center gap-2"><Edit3 size={24} className="text-indigo-600"/> Editar Agendamento</h3>
              {/* Fecha e reseta o formulário */}
              <button onClick={() => { setAgendamentoEditando(null); setAgendamentoForm(getFormDefaults()); }} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-all">
                <X size={24}/>
              </button>
            </div>
            
            <form onSubmit={salvarEdicao} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-[10px] font-black text-slate-500 uppercase mb-1">Data</label>
                  <input type="date" required value={agendamentoForm.data_agendamento} onChange={e => setAgendamentoForm({...agendamentoForm, data_agendamento: e.target.value})} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 font-bold" />
                </div>
                <div>
                  <label className="block text-[10px] font-black text-slate-500 uppercase mb-1">Início</label>
                  <input type="time" required value={agendamentoForm.hora_inicio} onChange={e => setAgendamentoForm({...agendamentoForm, hora_inicio: e.target.value})} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 font-bold" />
                </div>
                <div>
                  <label className="block text-[10px] font-black text-slate-500 uppercase mb-1">Término</label>
                  <input type="time" required value={agendamentoForm.hora_fim} onChange={e => setAgendamentoForm({...agendamentoForm, hora_fim: e.target.value})} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 font-bold" />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-black text-slate-500 uppercase mb-1">Ambiente</label>
                  <select required value={agendamentoForm.ambiente_id} onChange={e => setAgendamentoForm({...agendamentoForm, ambiente_id: e.target.value})} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 font-bold">
                    {ambientes.map(a => <option key={a.id} value={a.id}>{a.nome}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-black text-slate-500 uppercase mb-1">Título do Evento</label>
                  <input type="text" required value={agendamentoForm.titulo_evento} onChange={e => setAgendamentoForm({...agendamentoForm, titulo_evento: e.target.value})} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 font-bold" />
                </div>
              </div>

              <div className="flex gap-3 mt-6">
                <button type="button" onClick={() => { setAgendamentoEditando(null); setAgendamentoForm(getFormDefaults()); }} className="flex-1 py-3 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl font-black text-xs uppercase tracking-widest">Cancelar</button>
                <button type="submit" disabled={loading} className="flex-1 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-black text-xs uppercase tracking-widest">{loading ? 'Salvando...' : 'Salvar Alterações'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 4. MODAL: O Painel pra Baixar o PDF */}
      {showPdfModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-[2rem] p-8 max-w-md w-full shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-black text-slate-800 uppercase tracking-tight">Exportar PDF Semanal</h3>
              <button onClick={() => setShowPdfModal(false)} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-all">
                <X size={24}/>
              </button>
            </div>
            
            <p className="text-sm text-slate-500 font-bold mb-6">
              Selecione qualquer data. O sistema gerará um PDF no formato Paisagem, do <span className="text-indigo-600">Domingo ao Sábado</span> daquela semana.
            </p>
            
            <div className="mb-8 p-6 bg-slate-50 rounded-[1.5rem] border border-slate-100">
              <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-3">Data de Referência</label>
              <input 
                type="date"
                value={pdfDateStr}
                onChange={e => setPdfDateStr(e.target.value)}
                className="w-full bg-white border border-slate-200 text-slate-800 rounded-2xl px-4 py-3 font-black focus:ring-2 focus:ring-indigo-500 outline-none text-lg text-center"
              />
            </div>

            <div className="flex gap-3">
              <button onClick={() => setShowPdfModal(false)} className="flex-1 py-4 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-2xl font-black text-xs uppercase tracking-widest transition-all">Cancelar</button>
              <button onClick={handleExportPDF} disabled={exporting} className="flex-1 py-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl font-black text-xs uppercase tracking-widest transition-all flex items-center justify-center gap-2 shadow-lg">
                {exporting ? <Loader2 className="animate-spin" size={18}/> : <FileDown size={18}/>}
                Baixar PDF
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ----------------------------------------------------- */}
      {/* O TEMPLATE DO PDF ESCONDIDO DA TELA */}
      {/* Esse div precisa ser invisivel pra não feiar o site, a biblioteca chupa ele */}
      {/* ----------------------------------------------------- */}
      <div id="weekly-report-template" style={{ display: 'none' }}>
         <div style={{ background: 'white', width: '1080px', padding: '40px', boxSizing: 'border-box', color: 'black', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
           <div style={{ borderBottom: '6px solid #4f46e5', paddingBottom: '25px', marginBottom: '40px', pageBreakInside: 'avoid' }}>
               <table style={{ width: '100%' }}>
                   <tbody>
                     <tr>
                         <td style={{ border: 'none' }}>
                             <h1 style={{ margin: 0, fontSize: '38px', fontWeight: 900, color: '#0f172a' }}>AGENDA DE AMBIENTES</h1>
                             <p style={{ margin: 0, fontSize: '16px', color: '#64748b', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '2px' }}>CRONOGRAMA SEMANAL DA REGIONAL</p>
                         </td>
                         <td style={{ border: 'none', textAlign: 'right' }}>
                             <p style={{ margin: 0, fontWeight: 900, fontSize: '22px', color: '#1e293b' }}>
                               {pdfStartOfWeek.toLocaleDateString('pt-BR')} a {pdfEndOfWeek.toLocaleDateString('pt-BR')}
                             </p>
                             <p style={{ margin: 0, fontSize: '14px', color: '#94a3b8', fontWeight: 800 }}>SGE-GSU INTELLIGENCE II</p>
                         </td>
                     </tr>
                   </tbody>
               </table>
           </div>

           {Object.keys(groupedPdfBookings).length === 0 ? (
             <div style={{ padding: '40px', textAlign: 'center', fontSize: '18px', color: '#94a3b8', fontWeight: 'bold' }}>Nenhum evento agendado para esta semana.</div>
           ) : (
             Object.keys(groupedPdfBookings).sort().map(dataStr => {
               const [y, m, d] = dataStr.split('-');
               const dateObj = new Date(Number(y), Number(m) - 1, Number(d));
               const dayOfWeek = dateObj.toLocaleDateString('pt-BR', { weekday: 'long' });
               const formattedDate = dateObj.toLocaleDateString('pt-BR');

               return (
                 <div key={dataStr} style={{ marginBottom: '40px', pageBreakInside: 'avoid' }}>
                   <h4 style={{ margin: '0 0 15px 0', fontSize: '20px', fontWeight: 900, color: '#4f46e5', textTransform: 'uppercase', borderBottom: '3px solid #e2e8f0', paddingBottom: '10px' }}>
                     {dayOfWeek}, {formattedDate}
                   </h4>
                   <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                       <thead>
                           <tr style={{ background: '#f8fafc', pageBreakInside: 'avoid' }}>
                               <th style={{ padding: '16px', border: '2px solid #cbd5e1', fontSize: '15px', textAlign: 'left', color: '#334155', width: '12%', fontWeight: 900 }}>HORÁRIO</th>
                               <th style={{ padding: '16px', border: '2px solid #cbd5e1', fontSize: '15px', textAlign: 'left', color: '#334155', width: '23%', fontWeight: 900 }}>AMBIENTE</th>
                               <th style={{ padding: '16px', border: '2px solid #cbd5e1', fontSize: '15px', textAlign: 'left', color: '#334155', width: '50%', fontWeight: 900 }}>EVENTO / OBSERVAÇÃO</th>
                               <th style={{ padding: '16px', border: '2px solid #cbd5e1', fontSize: '15px', textAlign: 'center', color: '#334155', width: '15%', fontWeight: 900 }}>LOTAÇÃO</th>
                           </tr>
                       </thead>
                       <tbody>
                           {groupedPdfBookings[dataStr].map(row => (
                               <tr key={row.id} style={{ pageBreakInside: 'avoid' }}>
                                   <td style={{ padding: '16px', border: '2px solid #cbd5e1', fontSize: '15px', fontWeight: 900, color: '#d97706' }}>
                                       {row.hora_inicio.slice(0,5)} às {row.hora_fim.slice(0,5)}
                                   </td>
                                   <td style={{ padding: '16px', border: '2px solid #cbd5e1', fontSize: '15px', fontWeight: 900, textTransform: 'uppercase', color: '#1e293b' }}>
                                       {row.ambientes?.nome}
                                   </td>
                                   <td style={{ padding: '16px', border: '2px solid #cbd5e1', fontSize: '15px' }}>
                                       <div style={{ fontWeight: 900, color: '#0f172a', textTransform: 'uppercase', marginBottom: '6px', fontSize: '16px' }}>{row.titulo_evento}</div>
                                       <div style={{ fontWeight: 800, color: '#4f46e5', fontSize: '13px', textTransform: 'uppercase' }}>RESPONSÁVEL: {row.user_name}</div>
                                       {row.observacao && <div style={{ color: '#64748b', fontSize: '13px', marginTop: '6px', fontStyle: 'italic', fontWeight: 600 }}>Obs: {row.observacao}</div>}
                                   </td>
                                   <td style={{ padding: '16px', border: '2px solid #cbd5e1', fontSize: '15px', textAlign: 'center', fontWeight: 900, color: '#059669' }}>
                                       {row.quantidade_pessoas} pessoas
                                   </td>
                               </tr>
                           ))}
                       </tbody>
                   </table>
                 </div>
               );
             })
           )}
           <div style={{ marginTop: '70px', paddingTop: '30px', borderTop: '3px solid #f1f5f9', textAlign: 'center', pageBreakInside: 'avoid' }}>
               <p style={{ fontSize: '14px', fontWeight: 900, color: '#cbd5e1', textTransform: 'uppercase', letterSpacing: '5px' }}>SGE-GSU INTELLIGENCE • DOCUMENTO OFICIAL</p>
           </div>
         </div>
      </div>

      {/* ----------------------------------------------------- */}
      {/* TELA PRINCIPAL (O QUE OS USUÁRIOS VÊM LOGO DE CARA) */}
      {/* ----------------------------------------------------- */}

      {/* CABEÇALHO (LOGO E NOME DO SISTEMA) */}
      {/* CABEÇALHO (LOGO E NOME DO SISTEMA) */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-4">
        <div className="flex items-center gap-5">
          <div className="p-4 bg-indigo-600 rounded-[2rem] text-white shadow-xl shadow-indigo-200">
            <Building2 size={36} />
          </div>
          <div>
            {/* NOVO SELO AMARELO AQUI */}
            <div className="mb-2">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-amber-100 text-amber-700 border border-amber-200 rounded-lg text-[9px] font-black uppercase tracking-widest shadow-sm">
                <AlertTriangle size={12} />
                Sincronização Planilha - não automática
              </span>
            </div>
            
            <h1 className="text-3xl font-black text-slate-900 tracking-tight uppercase leading-none">Agendamento de Ambientes (Novo)</h1>
            <p className="text-slate-500 font-medium mt-1">Gestão Inteligente de Salas da Unidade Regional de Ensino</p>
            <p className="text-slate-500 font-medium mt-1">Guarulhos Sul</p>
          </div>
        </div>

        {/* NAVEGADOR DE ABAS */}
        <div className="flex gap-2 p-2 bg-slate-100 rounded-[1.5rem] border border-slate-200">
          <TabButton active={activeTab === 'calendario'} onClick={() => setActiveTab('calendario')} icon={<Calendar size={16}/>} label="Calendário" />
          <TabButton active={activeTab === 'agendar'} onClick={() => setActiveTab('agendar')} icon={<Plus size={16}/>} label="Agendar" />
          {userRole === 'regional_admin' && (
            <TabButton active={activeTab === 'gerenciar'} onClick={() => setActiveTab('gerenciar')} icon={<Settings size={16}/>} label="Gerenciar" />
          )}
        </div>
      </div>

      {/* BANNERS DE ALERTA DO ADMINISTRADOR */}
      
      {/* BANNER 1: EVENTOS PENDENTES (A NOVIDADE AQUI!) */}
      {/* Se tiver evento amarelo (pendente), mostra o banner */}
      {userRole === 'regional_admin' && agendamentosPendentesGeral > 0 && (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 px-6 py-5 rounded-[2rem] flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-sm animate-in fade-in slide-in-from-top-2">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-amber-100 text-amber-600 rounded-full shrink-0">
              <AlertTriangle size={24} />
            </div>
            <div>
              <h4 className="font-black uppercase tracking-tight">Ação Necessária</h4>
              <p className="text-sm font-medium mt-1">
                Você tem <strong className="text-amber-600 bg-amber-100 px-2 py-0.5 rounded-md">{agendamentosPendentesGeral} agendamento(s)</strong> pendente(s) no sistema aguardando aprovação. Navegue pelas datas do calendário para avaliá-los.
              </p>
            </div>
          </div>
          {/* Este é o botão de "Acessar Calendário" que agora dispara a janela nova! */}
          <button 
            onClick={() => setShowPendentesModal(true)} 
            className="px-6 py-3 bg-amber-500 hover:bg-amber-600 text-white text-xs font-black uppercase tracking-widest rounded-xl transition-all shadow-md shrink-0"
          >
            Analisar Pendências
          </button>
        </div>
      )}

      {/* BANNER 2: REGRA DE BACKUP 48 HORAS PRO GOOGLE SHEETS */}
      {userRole === 'regional_admin' && horasDesdeUltimaSync >= 48 && (
        <div className="bg-blue-50 border border-blue-200 text-blue-800 px-6 py-5 rounded-[2rem] flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-sm animate-in fade-in slide-in-from-top-2">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-blue-100 text-blue-600 rounded-full shrink-0">
              <RefreshCw size={24} className={syncing ? "animate-spin" : ""} />
            </div>
            <div>
              <h4 className="font-black uppercase tracking-tight">Atualização da Planilha Recomendada</h4>
              <p className="text-sm font-medium mt-1">
                Faz <strong className="text-blue-600 bg-blue-100 px-2 py-0.5 rounded-md">{horasDesdeUltimaSync === 999 ? 'mais de 48' : horasDesdeUltimaSync} horas</strong> que os dados não são exportados para o Google Sheets.
              </p>
            </div>
          </div>
          <button 
            onClick={handleSyncSheet} 
            disabled={syncing}
            className="px-6 py-3 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:hover:bg-blue-600 text-white text-xs font-black uppercase tracking-widest rounded-xl transition-all shadow-md shrink-0 flex items-center justify-center gap-2"
          >
            {syncing ? 'Enviando...' : 'Sincronizar Agora'}
          </button>
        </div>
      )}

      {/* CONTEÚDO DA ABA 1: CALENDÁRIO */}
      {activeTab === 'calendario' && (
        <div className="bg-white p-8 rounded-[3rem] shadow-xl border border-slate-100 h-full">
          
          {/* Régua de Filtros (Setinhas e Botão de Mês/Dia) */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-8 pb-6 border-b border-slate-100 gap-4">
            <div className="flex items-center gap-4">
               <button onClick={() => setSelectedDate(new Date(selectedDate.getFullYear(), selectedDate.getMonth() - (viewMode === 'mes' ? 1 : 0), selectedDate.getDate() - (viewMode === 'dia' ? 1 : 0)))} className="p-2 bg-slate-100 hover:bg-slate-200 rounded-xl transition-all"><ChevronLeft size={20}/></button>
               <h2 className="text-xl font-black text-slate-800 uppercase tracking-tight w-48 text-center">
                 {viewMode === 'dia' 
                    ? selectedDate.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })
                    : selectedDate.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
                 }
               </h2>
               <button onClick={() => setSelectedDate(new Date(selectedDate.getFullYear(), selectedDate.getMonth() + (viewMode === 'mes' ? 1 : 0), selectedDate.getDate() + (viewMode === 'dia' ? 1 : 0)))} className="p-2 bg-slate-100 hover:bg-slate-200 rounded-xl transition-all"><ChevronRight size={20}/></button>
            </div>
            
            <div className="flex items-center gap-3">
               
               <div className="flex bg-slate-100 p-1 rounded-xl mr-2">
                 <button onClick={() => setViewMode('dia')} className={`px-4 py-1.5 text-xs font-black rounded-lg uppercase tracking-widest transition-all ${viewMode === 'dia' ? 'bg-white shadow text-indigo-600' : 'text-slate-500 hover:text-slate-700'}`}>Dia</button>
                 <button onClick={() => setViewMode('mes')} className={`px-4 py-1.5 text-xs font-black rounded-lg uppercase tracking-widest transition-all flex items-center gap-1 ${viewMode === 'mes' ? 'bg-white shadow text-indigo-600' : 'text-slate-500 hover:text-slate-700'}`}>
                   Mês
                 </button>
               </div>

               <button onClick={() => { setSelectedDate(new Date()); setViewMode('dia'); }} className="px-5 py-2.5 bg-indigo-50 text-indigo-600 font-black text-xs uppercase tracking-widest rounded-xl hover:bg-indigo-100 transition-all">Hoje</button>
               
               <button 
                  onClick={() => setShowPdfModal(true)}
                  className="bg-slate-900 hover:bg-black text-white px-5 py-2.5 rounded-xl font-black text-xs uppercase tracking-widest flex items-center justify-center gap-2 shadow-lg transition-all active:scale-95"
               >
                  <FileDown size={16} />
                  PDF
               </button>
            </div>
          </div>

          <div className="space-y-4 min-h-[400px]">
            {/* Ou a gente mostra a malha do mês... */}
            {viewMode === 'mes' ? (
              renderCalendarioMes()
            ) : (
              // Ou a gente mostra os Cards de Agendamentos do dia em questão
              dateBookings.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-64 text-slate-400">
                  <Calendar size={48} className="mb-4 opacity-50" />
                  <p className="font-bold">Nenhum ambiente reservado para este dia.</p>
                </div>
              ) : (
                dateBookings.map(b => (
                  <div key={b.id} className={`p-6 bg-slate-50 border rounded-3xl flex flex-col md:flex-row md:items-center justify-between gap-4 transition-all ${b.status === 'reprovado' || b.status === 'cancelado' ? 'border-red-200 opacity-60' : 'border-slate-100 hover:shadow-md'}`}>
                    <div className="flex items-start gap-5">
                      <div className={`w-14 h-14 rounded-2xl flex items-center justify-center shrink-0 ${b.status === 'aprovado' ? 'bg-emerald-100 text-emerald-600' : b.status === 'reprovado' ? 'bg-red-100 text-red-600' : b.status === 'cancelado' ? 'bg-slate-200 text-slate-500' : 'bg-amber-100 text-amber-600'}`}>
                        <MapPin size={24} />
                      </div>
                      <div>
                        <div className="flex flex-wrap items-center gap-3 mb-1">
                          <h3 className={`font-black uppercase text-lg ${b.status === 'reprovado' || b.status === 'cancelado' ? 'text-slate-400 line-through' : 'text-slate-800'}`}>{b.titulo_evento}</h3>
                          {renderStatusBadge(b.status || 'pendente')}
                        </div>
                        <div className="flex flex-wrap items-center gap-4 mt-2 text-sm font-bold text-slate-500">
                          <span className="flex items-center gap-1.5"><Building2 size={14} className="text-indigo-500"/> {b.ambientes?.nome}</span>
                          <span className="flex items-center gap-1.5"><Clock size={14} className="text-indigo-500"/> {b.hora_inicio.slice(0,5)} às {b.hora_fim.slice(0,5)}</span>
                          <span className="flex items-center gap-1.5"><Users size={14} className="text-indigo-500"/> {b.quantidade_pessoas} pess.</span>
                        </div>
                        
                        {b.status === 'reprovado' && b.motivo_reprovacao && (
                          <p className="text-xs text-red-500 mt-2 font-bold bg-red-50 p-2 rounded-lg inline-block">Motivo: {b.motivo_reprovacao}</p>
                        )}
                        
                        {b.historico_edicao && (
                          <button 
                            onClick={() => setHistoricoModal(b)} 
                            className="mt-3 px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-600 hover:text-indigo-700 text-[10px] font-black uppercase tracking-widest flex items-center gap-1.5 rounded-lg transition-all"
                          >
                            <History size={12}/> Ver Histórico de Edição
                          </button>
                        )}
                      </div>
                    </div>
                    
                    <div className="flex flex-col items-end gap-3 shrink-0">
                      <div className="text-right bg-white px-4 py-2 rounded-xl border border-slate-200 shadow-sm w-full md:w-auto">
                        <p className="text-[10px] uppercase font-black text-slate-400 tracking-widest mb-1">Responsável</p>
                        <p className="text-sm font-bold text-indigo-700">{b.user_name}</p>
                      </div>

                      <div className="flex flex-wrap items-center justify-end gap-2 w-full md:w-auto">
                        {currentUser?.id === b.user_id && b.status !== 'cancelado' && (
                           <button onClick={() => cancelarMeuAgendamento(b)} className="px-3 py-2 bg-red-50 text-red-600 hover:bg-red-600 hover:text-white rounded-lg text-[10px] font-black uppercase tracking-widest transition-all">
                              Cancelar Meu Agendamento
                           </button>
                        )}

                        {userRole === 'regional_admin' && (
                          <div className="flex items-center gap-2">
                            {b.status === 'pendente' && (
                              <>
                                <button onClick={() => alterarStatus(b.id, 'aprovado')} className="p-2 bg-emerald-50 text-emerald-600 hover:bg-emerald-600 hover:text-white rounded-lg transition-all" title="Aprovar"><Check size={18}/></button>
                                <button onClick={() => alterarStatus(b.id, 'reprovado')} className="p-2 bg-red-50 text-red-600 hover:bg-red-600 hover:text-white rounded-lg transition-all" title="Reprovar"><X size={18}/></button>
                              </>
                            )}
                            <button onClick={() => abrirModalEdicao(b)} className="p-2 bg-indigo-50 text-indigo-600 hover:bg-indigo-600 hover:text-white rounded-lg transition-all" title="Editar Agendamento"><Edit3 size={18}/></button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))
              )
            )}
          </div>
        </div>
      )}

      {/* CONTEÚDO DA ABA 2: AGENDAR (FORMULÁRIO PRINCIPAL DE PEDIR SALA) */}
      {activeTab === 'agendar' && (
        <div className="max-w-3xl mx-auto bg-white p-10 rounded-[3rem] shadow-xl border border-slate-100">
          <div className="mb-8">
            <h2 className="text-2xl font-black text-slate-800 uppercase tracking-tight">Novo Agendamento</h2>
            <p className="text-sm font-bold text-slate-400 mt-1">Seu pedido passará por aprovação da administração.</p>
          </div>

          {errorMsg && (
             <div className="mb-6 p-4 bg-red-50 text-red-700 border border-red-200 rounded-2xl flex items-center gap-3 font-bold text-sm">
               <AlertTriangle size={20} /> {errorMsg}
             </div>
          )}
          {successMsg && (
             <div className="mb-6 p-4 bg-amber-50 text-amber-700 border border-amber-200 rounded-2xl flex items-center gap-3 font-bold text-sm">
               <Clock size={20} /> {successMsg}
             </div>
          )}

          <form onSubmit={handleAgendar} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 p-6 bg-slate-50 border border-slate-100 rounded-3xl">
              <div>
                <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">Data do Evento *</label>
                <input 
                  type="date" required
                  value={agendamentoForm.data_agendamento}
                  onChange={e => setAgendamentoForm({...agendamentoForm, data_agendamento: e.target.value})}
                  className="w-full bg-white border border-slate-200 text-slate-800 rounded-2xl px-4 py-3 font-bold focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                />
              </div>
              <div>
                <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">Hora de Início *</label>
                <input 
                  type="time" required
                  value={agendamentoForm.hora_inicio}
                  onChange={e => setAgendamentoForm({...agendamentoForm, hora_inicio: e.target.value})}
                  className="w-full bg-white border border-slate-200 text-slate-800 rounded-2xl px-4 py-3 font-bold focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                />
              </div>
              <div>
                <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">Hora de Término *</label>
                <input 
                  type="time" required
                  value={agendamentoForm.hora_fim}
                  onChange={e => setAgendamentoForm({...agendamentoForm, hora_fim: e.target.value})}
                  className="w-full bg-white border border-slate-200 text-slate-800 rounded-2xl px-4 py-3 font-bold focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-xs font-black text-slate-500 uppercase tracking-widest mb-2">Ambiente Disponível *</label>
                <select 
                  required
                  value={agendamentoForm.ambiente_id}
                  onChange={e => setAgendamentoForm({...agendamentoForm, ambiente_id: e.target.value})}
                  className="w-full bg-slate-50 border border-slate-200 text-slate-800 rounded-2xl px-4 py-3 font-bold focus:ring-2 focus:ring-indigo-500 outline-none disabled:opacity-60 transition-all"
                  disabled={!agendamentoForm.data_agendamento || !agendamentoForm.hora_inicio || !agendamentoForm.hora_fim}
                >
                  <option value="">
                    {(!agendamentoForm.data_agendamento || !agendamentoForm.hora_inicio || !agendamentoForm.hora_fim) 
                      ? 'Preencha a data e hora acima primeiro' 
                      : 'Selecione a sala livre'}
                  </option>
                  {ambientes.map(a => {
                    // Impede o cara de selecionar sala que já tem gente dentro naquele horário
                    const status = obterStatusAmbiente(a.id); 
                    return (
                      <option key={a.id} value={a.id} disabled={status === 'ocupado'} className={status === 'ocupado' ? 'text-red-500 bg-red-50' : ''}>
                        {a.nome} (Até {a.capacidade} pess.) {status === 'ocupado' ? ' - ⚠️ OCUPADO' : ''}
                      </option>
                    );
                  })}
                </select>
              </div>
              <div>
                <label className="block text-xs font-black text-slate-500 uppercase tracking-widest mb-2">Título do Evento *</label>
                <input 
                  type="text" required
                  value={agendamentoForm.titulo_evento}
                  onChange={e => setAgendamentoForm({...agendamentoForm, titulo_evento: e.target.value})}
                  className="w-full bg-slate-50 border border-slate-200 text-slate-800 rounded-2xl px-4 py-3 font-bold focus:ring-2 focus:ring-indigo-500 outline-none"
                  placeholder="Ex: Reunião de Planejamento"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
              <div className="md:col-span-4">
                <label className="block text-xs font-black text-slate-500 uppercase tracking-widest mb-2">Qtd. de Pessoas *</label>
                <input 
                  type="number" min="1" required
                  value={agendamentoForm.quantidade_pessoas}
                  onChange={e => setAgendamentoForm({...agendamentoForm, quantidade_pessoas: e.target.value})}
                  className="w-full bg-slate-50 border border-slate-200 text-slate-800 rounded-2xl px-4 py-3 font-bold focus:ring-2 focus:ring-indigo-500 outline-none"
                  placeholder="Ex: 15"
                />
              </div>
              <div className="md:col-span-8">
                <label className="block text-xs font-black text-slate-500 uppercase tracking-widest mb-2">Observação (Opcional)</label>
                <input 
                  type="text"
                  value={agendamentoForm.observacao}
                  onChange={e => setAgendamentoForm({...agendamentoForm, observacao: e.target.value})}
                  className="w-full bg-slate-50 border border-slate-200 text-slate-800 rounded-2xl px-4 py-3 font-bold focus:ring-2 focus:ring-indigo-500 outline-none"
                  placeholder="Ex: Necessário projetor e caixa de som."
                />
              </div>
            </div>

            <button 
              type="submit" disabled={loading || !agendamentoForm.ambiente_id}
              className="w-full py-4 bg-amber-500 hover:bg-amber-600 text-white rounded-2xl font-black text-sm uppercase tracking-widest shadow-xl transition-all disabled:opacity-50 mt-4"
            >
              {loading ? 'Processando...' : 'Solicitar Agendamento'}
            </button>
          </form>

          {/* O "Mini Calendário" que dá um spoiler de como tá o dia no rodapé do formulário */}
          {agendamentoForm.data_agendamento && (
            <div className="mt-10 p-6 bg-slate-50 border border-slate-200 rounded-[2rem] animate-in slide-in-from-bottom-2">
              <h3 className="text-xs font-black text-slate-700 uppercase tracking-widest mb-4 flex items-center gap-2">
                <Calendar size={18} className="text-indigo-500"/>
                Agendamentos da Regional no dia {agendamentoForm.data_agendamento.split('-').reverse().join('/')}
              </h3>
              
              {agendamentosDoDiaSelecionado.length > 0 ? (
                <div className="space-y-3">
                  {agendamentosDoDiaSelecionado.map(ag => (
                    <div key={ag.id} className="flex items-center justify-between bg-white p-4 rounded-2xl border border-slate-100 shadow-sm text-sm font-bold text-slate-600">
                      <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
                        <div className="flex items-center gap-2 text-amber-600 bg-amber-50 px-3 py-1 rounded-lg">
                          <Clock size={14} />
                          <span>{ag.hora_inicio.slice(0,5)} às {ag.hora_fim.slice(0,5)}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Building2 size={16} className="text-indigo-400" />
                          <span className="uppercase text-indigo-700">{ag.ambientes?.nome}</span>
                        </div>
                      </div>
                      <span className="text-slate-400 truncate max-w-[150px] sm:max-w-[200px] text-xs uppercase hidden sm:block">
                        {ag.titulo_evento}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-6 text-slate-400">
                  <CheckCircle2 size={32} className="mx-auto mb-2 opacity-50 text-emerald-500" />
                  <p className="text-sm font-bold">Nenhum ambiente reservado para esta data ainda.</p>
                  <p className="text-xs mt-1">Todas as salas estão livres.</p>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* CONTEÚDO DA ABA 3: GERENCIAR AMBIENTES (SÓ PARA ADMIN) */}
      {activeTab === 'gerenciar' && userRole === 'regional_admin' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <div className="bg-white p-8 rounded-[3rem] shadow-xl border border-slate-100 relative">
            <h2 className="text-xl font-black text-slate-800 uppercase tracking-tight mb-6">Cadastrar Novo Ambiente</h2>
            <form onSubmit={handleCriarAmbiente} className="space-y-6">
              <div>
                <label className="block text-xs font-black text-slate-500 uppercase tracking-widest mb-2">Nome do Ambiente *</label>
                <input 
                  type="text" required
                  value={nomeAmbiente} onChange={e => setNomeAmbiente(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 font-bold focus:ring-2 focus:ring-indigo-500 outline-none"
                  placeholder="Ex: Auditório Principal"
                />
              </div>
              <div>
                <label className="block text-xs font-black text-slate-500 uppercase tracking-widest mb-2">Capacidade Máxima *</label>
                <input 
                  type="number" required min="1"
                  value={capacidadeAmbiente} onChange={e => setCapacidadeAmbiente(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 font-bold focus:ring-2 focus:ring-indigo-500 outline-none"
                  placeholder="Ex: 50"
                />
              </div>
              <button type="submit" disabled={loading} className="w-full py-3 bg-slate-900 hover:bg-black text-white rounded-xl font-black text-xs uppercase tracking-widest transition-all">
                Cadastrar Ambiente
              </button>
            </form>
          </div>
          
          <div className="bg-white p-8 rounded-[3rem] shadow-xl border border-slate-100 flex flex-col">
            <div className="flex items-center justify-between mb-6">
               <h2 className="text-xl font-black text-slate-800 uppercase tracking-tight">Ambientes Ativos</h2>
               
               {/* Botão de força-bruta pra enviar os dados pra planilha fora da janela de 48h */}
               <button 
                 onClick={handleSyncSheet}
                 disabled={syncing}
                 className="p-2 bg-emerald-50 text-emerald-600 hover:bg-emerald-100 hover:text-emerald-700 rounded-xl transition-all shadow-sm flex items-center gap-2 font-bold text-xs uppercase tracking-widest disabled:opacity-50"
                 title="Força a sincronização de todos os agendamentos para a Planilha do Google"
               >
                 {syncing ? <Loader2 className="animate-spin" size={16} /> : <RefreshCw size={16} />} 
                 {syncing ? 'Enviando...' : 'Sincronizar Planilha'}
               </button>
            </div>
            
            <div className="space-y-3 overflow-y-auto max-h-[300px] pr-2 custom-scrollbar">
              {/* Lista todas as salas que existem no banco */}
              {ambientes.map(a => (
                <div key={a.id} className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl border border-slate-100 transition-all hover:border-slate-300">
                  <div>
                    <p className="font-black text-slate-800 uppercase">{a.nome}</p>
                    <p className="text-xs font-bold text-slate-400">Capacidade: {a.capacidade} pessoas</p>
                  </div>
                  <button onClick={() => handleDeletarAmbiente(a.id)} className="p-2 text-red-400 hover:bg-red-50 hover:text-red-600 rounded-lg transition-colors" title="Remover Ambiente">
                    <Trash2 size={20} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

// Botão visual padronizado para as três abinhas de cima
function TabButton({ active, onClick, icon, label }: any) {
  return (
    <button onClick={onClick} className={`px-6 py-3 flex items-center gap-2 rounded-[1.2rem] text-xs font-black uppercase tracking-widest transition-all ${active ? 'bg-white text-indigo-600 shadow-xl shadow-indigo-100' : 'text-slate-400 hover:text-slate-600'}`}>
      {icon} {label}
    </button>
  );
}
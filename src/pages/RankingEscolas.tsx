// Importa o React e os hooks necessários (estado para variáveis, efeito colateral e memorização de performance)
import React, { useState, useEffect, useMemo } from 'react';
// Importa o cliente do Supabase para comunicação direta com o banco de dados
import { supabase } from '../lib/supabase';
// Importa todos os ícones visuais usados no painel (incluindo o Database para o selo roxo)
import { 
  Trophy, Medal, Target,  
  TrendingUp, TrendingDown, Settings2,
  ChevronRight, Search, Building2, Loader2,
  Droplets, AlertTriangle,
  X, Save, HelpCircle, Clock, BarChart3,
  CheckCircle2, TreePine, Home, ShieldAlert,
  MinusCircle, Lightbulb, Database
} from 'lucide-react';

// Define a estrutura de dados de uma escola processada para o Ranking
interface SchoolRanking {
  id: string; // Identificador único da escola
  name: string; // Nome da escola
  score: number; // Nota final calculada do GSU
  position: number; // Posição que ela ficou no ranking
  stats: { // Estatísticas individuais (0 a 100%) de cada critério
    water_compliance: number; // Porcentagem de dias que preencheu a água
    water_efficiency: number; // Porcentagem de dias que não estourou o teto
    demand_compliance: number; // Porcentagem de demandas concluídas no prazo
    tree_management: number; // Regularidade do manejo arbóreo
    zeladoria_status: number; // Status da ocupação da zeladoria (Ajustado pela nova regra)
    patrimonial_penalty: number; // Total de pontos descontados por vandalismo
  };
}

// Define a estrutura de dados das configurações dos Pesos
interface WeightConfig {
  water_reg: number; // Peso da leitura de água
  water_limit: number; // Peso do respeito ao teto
  demand_on_time: number; // Peso dos ofícios e demandas
  tree_management: number; // Peso das árvores
  zeladoria: number; // Peso do imóvel da zeladoria
  penalty_per_occurrence: number; // O valor descontado por cada vandalismo
  penalty_max: number; // O limite máximo de desconto para não zerar a escola de vez
}

// Interface básica para buscar a escola antes do cálculo
interface SchoolBase {
  id: string; // ID
  name: string; // Nome
}

// Função principal que desenha a tela inteira
export function RankingEscolas() {
  // Guarda a lista final de escolas já ordenadas
  const [schools, setSchools] = useState<SchoolRanking[]>([]);
  // Guarda quais escolas são consideradas prioritárias no Excel da Regional
  const [priorityNames, setPriorityNames] = useState<string[]>([]);
  // Controla se a tela inteira está no modo de carregamento giratório
  const [loading, setLoading] = useState(true);
  // Controla o carregamento específico do botão "Salvar Configuração"
  const [saveLoading, setSaveLoading] = useState(false); 
  // Armazena se o usuário é diretor, admin, etc.
  const [userRole, setUserRole] = useState('');
  // Se não for admin, guarda o ID da escola dele para ocultar as outras
  const [userSchoolId, setUserSchoolId] = useState<string | null>(null);
  // Armazena o que foi digitado na caixa de pesquisa
  const [searchTerm, setSearchTerm] = useState('');
  // Controla se o modal gigante de configurações está aberto ou não
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  // Controla qual escola foi clicada para abrir a "Análise Transparente"
  const [selectedSchool, setSelectedSchool] = useState<SchoolRanking | null>(null);
  // NOVO: Guarda o momento exato em que os dados chegaram do banco
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());
  
  // Estado que segura os pesos da matemática (começa com valores de backup)
  const [weights, setWeights] = useState<WeightConfig>({
    water_reg: 2.0, // Peso 2.0
    water_limit: 2.0, // Peso 2.0
    demand_on_time: 2.0, // Peso 2.0
    tree_management: 2.0, // Peso 2.0
    zeladoria: 2.0, // Peso 2.0
    penalty_per_occurrence: 0.5, // Perde meio ponto por vez
    penalty_max: 2.0 // Limite de 2 pontos
  });

  // Chaves para plugar a planilha de Escolas Prioritárias do Google Sheets
  const SPREADSHEET_ID = "1P6NIWUntGR_GNVCJmVEL22wznAV3XLB1vj9MDK6Q8L8";
  // O link mágico que transforma a planilha em um arquivo CSV legível
  const CSV_URL = `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/gviz/tq?tqx=out:csv`;

  // Calcula em tempo real a soma das barrinhas de peso na tela de configurações
  const currentPositiveSum = (weights.water_reg + weights.water_limit + weights.demand_on_time + weights.tree_management + weights.zeladoria);
  // Checa se as barrinhas batem 10 exato (margem de 0.01 por segurança matemática do JavaScript)
  const isSumValid = Math.abs(currentPositiveSum - 10) < 0.01;

  // Quando o usuário abre a página, dispara a iniciação
  useEffect(() => {
    initRanking(); // Chama o motor de arranque
  }, []);

  // Inteligência que arruma os pesos caso o banco de dados devolva uma soma que não é 10
  const normalizeWeights = (w: WeightConfig) => {
    // Array com o nome das 5 propriedades que devem somar 10
    const keys = ['water_reg', 'water_limit', 'demand_on_time', 'tree_management', 'zeladoria'] as const;
    // Descobre quanto é a soma real do que veio do banco
    let sum = keys.reduce((acc, k) => acc + w[k], 0);
    
    // Se a diferença for minúscula (já é 10), libera o objeto como está
    if (Math.abs(sum - 10) < 0.01) return w;

    // Se a soma for diferente, cria um objeto vazio para reconstruir os pesos
    let newW = { ...w };
    
    // Se por acaso vier 0 (banco corrompido), reseta tudo pra 2.0
    if (sum === 0) {
      keys.forEach(k => newW[k] = 2.0);
      return newW;
    }

    // Se for tipo 12, ele comprime todo mundo mantendo a proporção para caber em 10
    keys.forEach(k => {
      newW[k] = Number((w[k] * (10 / sum)).toFixed(1));
    });

    // Se sobrar uma dízima microscópica no final, ele joga essa diferença no registro de água
    let newSum = keys.reduce((acc, k) => acc + newW[k], 0);
    let diff = Number((10 - newSum).toFixed(1));
    if (diff !== 0) {
      newW['water_reg'] = Number((newW['water_reg'] + diff).toFixed(1));
    }
    return newW; // Retorna os pesos sanitizados
  };

  // Motor de Arranque do sistema
  async function initRanking() {
    setLoading(true); // Gira o loading
    try {
      // 1. Descobre quem é a pessoa mexendo no sistema
      const { data: { user } } = await supabase.auth.getUser();
      let role = ''; 
      
      if (user) {
        // Se achou, vai no banco buscar o cargo dele e qual escola ele chefia
        const { data: profile } = await (supabase as any)
          .from('profiles')
          .select('role, school_id') 
          .eq('id', user.id) 
          .single(); 
        
        role = profile?.role || ''; 
        setUserRole(role); // Memoriza cargo
        setUserSchoolId(profile?.school_id || null); // Memoriza escola
      }

      // 2. Se a pessoa for o Chefão Regional, vai na internet ler a planilha do Drive
      if (role === 'regional_admin') {
        await fetchExternalPriorities();
      }

      // 3. Puxa as regras matemáticas (pesos) salvas no Supabase
      const { data: settings } = await (supabase as any)
        .from('ranking_settings')
        .select('*')
        .eq('id', 'default-weights')
        .maybeSingle(); 

      // 4. Se encontrou no banco, usa. Se veio coluna vazia (??), usa os padrões
      let activeWeights = settings ? {
        water_reg: Number(settings.water_reg ?? 2),
        water_limit: Number(settings.water_limit ?? 2),
        demand_on_time: Number(settings.demand_on_time ?? 2),
        tree_management: Number(settings.tree_management ?? 2),
        zeladoria: Number(settings.zeladoria ?? 2),
        penalty_per_occurrence: Number(settings.penalty_per_occurrence ?? 0.5),
        penalty_max: Number(settings.penalty_max ?? 2.0)
      } : weights;

      // 5. Passa os pesos no filtro que garante a soma = 10
      activeWeights = normalizeWeights(activeWeights);

      // 6. Atualiza o React
      setWeights(activeWeights);
      
      // 7. Manda os pesos validados para a função que vai escanear todas as escolas
      await fetchData(activeWeights);
    } catch (err) {
      console.error("Erro na inicialização:", err); 
    } finally {
      setLoading(false); // Desliga a tela de carregamento, mesmo se o banco explodir
    }
  }

  // Leitor da planilha Google (Prioritárias)
  async function fetchExternalPriorities() {
    try {
      // Chama a URL
      const response = await fetch(CSV_URL);
      // Lê o resultado como texto cru
      const csvText = await response.text();
      // Transforma o texto em uma matriz (array de colunas e linhas), ignorando aspas duplas do CSV
      const rows = csvText.split('\n').map(row => {
        const matches = row.match(/(".*?"|[^",\r\n]+)(?=\s*,|\s*$)/g);
        return matches ? matches.map(m => m.replace(/^"|"$/g, '').trim()) : [];
      });

      // Pula o cabeçalho (slice 2) e filtra só as que têm "Escola Prioritária..." na coluna I (índice 8)
      const priorities = rows.slice(2)
        .filter(row => row[8] === 'Escola Prioritária SEOM - SEFISC')
        .map(row => row[0]); // Pega só o nome (coluna A)

      setPriorityNames(priorities); // Salva na memória
    } catch (error) {
      console.error("Erro ao carregar prioritárias:", error);
    }
  }

  // Compara o nome da escola atual com a lista de prioritárias
  const isSchoolPriority = (schoolName: string) => {
    // Escolas não podem ver se estão ou não na lista, só a Regional
    if (userRole !== 'regional_admin') return false;

    // Função de limpeza (tira acentos, EE, Prof, pontuação) para garantir que "EE JOAO" = "JOÃO"
    const normalize = (name: string) => {
      if (!name) return "";
      return name
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "") 
        .replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g, " ") 
        .replace(/\bee\b|\bprof(essor|a)?\b|\bdona\b|\bdr\b|\best\b/gi, "") 
        .replace(/\s+/g, " ") 
        .trim(); 
    };

    const normTarget = normalize(schoolName); 
    
    // Checa se as strings batem
    return priorityNames.some(pName => {
      const normPriority = normalize(pName);
      if (!normPriority || !normTarget) return false;
      return normTarget.includes(normPriority) || normPriority.includes(normTarget);
    });
  };

  // O Coração do Sistema: Escaneia o banco e dá as notas para as escolas
  async function fetchData(currentWeights: WeightConfig) {
    try {
      // 1. Busca os dados cruciais (id e nome) de todas as unidades
      const { data: schoolsData } = await (supabase as any).from('schools').select('id, name');
      
      const now = new Date(); // Data de hoje
      // Extrai o primeiro dia deste mês (YYYY-MM-01) para pegar só coisas recentes
      const firstDay = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
      
      // 2. Faz as 5 requisições ao Supabase ao mesmo tempo usando Promise.all (fica 5x mais rápido)
      const [water, demands, manejo, ocorrencias, zeladorias] = await Promise.all([
        (supabase as any).from('consumo_agua').select('*').gte('date', firstDay), // Água (do dia 1 até hoje)
        (supabase as any).from('demands').select('*'), // Demandas (todas)
        (supabase as any).from('manejo_arboreo').select('*'), // Árvores (todas)
        (supabase as any).from('patrimonial_occurrences').select('*').gte('created_at', firstDay), // Vandalismo (este mês)
        (supabase as any).from('zeladorias').select('*') // Zeladorias (todas)
      ]);

      // Tratamento de segurança: se vier null, vira array vazio []
      const allSchools: SchoolBase[] = schoolsData || [];
      const waterLogs = water.data || [];
      const allDemands = demands.data || [];
      const allManejo = manejo.data || [];
      const allOcorrencias = ocorrencias.data || [];
      const allZeladorias = zeladorias.data || [];
      
      // Descobre que dia é hoje (ex: dia 18) para base de divisão
      const currentDay = now.getDate();

      // 3. Roda uma repetição para avaliar escola por escola
      const ranking: SchoolRanking[] = allSchools.map((school: SchoolBase) => {
        
        // ---- CRITÉRIO 1: ÁGUA FREQUÊNCIA ----
        const schoolWater = waterLogs.filter((w: any) => w.school_id === school.id); // Isola a água da escola
        const waterRegPct = Math.min(1, schoolWater.length / currentDay); // Divisão: Entregues / Dias. Teto máximo é 1 (100%)
        
        // ---- CRITÉRIO 2: ÁGUA EFICIÊNCIA ----
        const exceededCount = schoolWater.filter((w: any) => w.limit_exceeded).length; // Quantas vezes estourou?
        const waterEffPct = schoolWater.length > 0 ? (1 - exceededCount / schoolWater.length) : 1; // 100% menos os estouros
        
        // ---- CRITÉRIO 3: DEMANDAS E OFÍCIOS ----
        const schoolDemands = allDemands.filter((d: any) => d.school_id === school.id); // Pega ofícios dela
        // Conta quantos foram concluídos E se a data de conclusão é antes do prazo final
        const onTimeDemands = schoolDemands.filter((d: any) => d.status === 'CONCLUÍDO' && d.completed_at <= d.deadline); 
        const demandPct = schoolDemands.length > 0 ? (onTimeDemands.length / schoolDemands.length) : 1; // % no prazo

        // ---- CRITÉRIO 4: MANEJO ARBÓREO ----
        const schoolManejo = allManejo.filter((m: any) => m.escola_id === school.id); 
        // Tem validade preenchida OU marcou que não se aplica?
        const hasValidManejo = schoolManejo.some((m: any) => m.nao_se_aplica || m.validade_autorizacao); 
        const treePct = hasValidManejo ? 1 : 0; // Ganha tudo (1) ou ganha nada (0)

        // ---- CRITÉRIO 5: ZELADORIA (ATUALIZADO) ----
        // Pega as linhas de zeladoria que pertencem a esta escola
        const schoolZeladoria = allZeladorias.filter((z: any) => z.school_id === school.id);
        
        // Começamos dando nota 100% por padrão.
        // Assim, escolas que não têm zeladoria (não existem nessa tabela ou tão 'NÃO POSSUI') mantêm a nota máxima.
        let zeladoriaPct = 1;
        
        // Se a escola tiver um registro formal na tabela de zeladorias, vamos inspecionar
        if (schoolZeladoria.length > 0) {
           // Procura se a coluna 'ocupada' está explicitamente escrita como "NÃO"
           // "NÃO" significa: a escola tem espaço de zeladoria, mas está VAZIO.
           const isDesocupada = schoolZeladoria.some((z: any) => z.ocupada && z.ocupada.trim().toUpperCase() === 'NÃO');
           
           // Se a inteligência achou o "NÃO", ela toma os pontos da escola
           if (isDesocupada) {
              zeladoriaPct = 0; // Penalizada: zeladoria está abandonada
           }
        }

        // ---- CRITÉRIO 6: PENALIDADE PATRIMONIAL (VANDALISMO) ----
        const schoolOccurrences = allOcorrencias.filter((o: any) => o.school_id === school.id); // Conta os BOs
        // Cálculo do desconto: Quantidade de ocorrências X peso.
        // O Math.min trava para não passar do limite máximo configurado pelo admin
        const penalty = Math.min(
          currentWeights.penalty_max, 
          schoolOccurrences.length * currentWeights.penalty_per_occurrence
        );

        // ---- FECHAMENTO MATEMÁTICO DA NOTA FINAL (GSU) ----
        // Cada porcentagem (0 a 1) é multiplicada por 10 e pelo peso estipulado, somadas, e divididas por 10.
        let finalScore = (
          (waterRegPct * 10 * currentWeights.water_reg) +
          (waterEffPct * 10 * currentWeights.water_limit) +
          (demandPct * 10 * currentWeights.demand_on_time) +
          (treePct * 10 * currentWeights.tree_management) +
          (zeladoriaPct * 10 * currentWeights.zeladoria)
        ) / 10;

        // Diminui a nota pelas ocorrências
        // O Math.max(0.01) não deixa a nota ficar negativa, o Math.min(10.0) garante que nunca ultrapasse 10
        finalScore = Math.max(0.01, Math.min(10.0, finalScore - penalty));

        // Empacota essa escola calculada e retorna pra lista
        return {
          id: school.id,
          name: school.name,
          score: finalScore,
          position: 0, // A Posição é preenchida no próximo passo (sort)
          stats: {
            water_compliance: waterRegPct * 100,
            water_efficiency: waterEffPct * 100,
            demand_compliance: demandPct * 100,
            tree_management: treePct * 100,
            zeladoria_status: zeladoriaPct * 100,
            patrimonial_penalty: penalty
          }
        };
      });

      // 4. Organiza do maior (b.score) para o menor (a.score) e preenche a chave position (1º, 2º, 3º...)
      const sortedRanking = ranking
        .sort((a, b) => b.score - a.score)
        .map((item, index) => ({ ...item, position: index + 1 }));

      setSchools(sortedRanking); // Joga no React
      setLastUpdated(new Date()); // ATUALIZA O RELÓGIO COM O SEGUNDO EXATO DO CARREGAMENTO
    } catch (error) {
      console.error(error); // Evita que a tela trave se algo der errado
    }
  }

  // Cérebro de IA Fixa: Cria parágrafos analisando o boletim estatístico da escola
  const generateRecommendations = (stats: SchoolRanking['stats']) => {
    const recs = []; // Caixinha que guarda os recados
    
    if (stats.water_compliance < 90) {
      recs.push({
        title: 'Baixa Frequência de Leitura',
        desc: 'Faltam leituras diárias de água no sistema. Organize a rotina para que o medidor seja lançado todos os dias, evitando perda de pontos no GSU.',
        color: 'text-blue-500', bg: 'bg-blue-50'
      });
    }
    if (stats.water_efficiency < 90) {
      recs.push({
        title: 'Consumo Hídrico Excessivo',
        desc: 'O consumo ultrapassou o teto estipulado. Verifique urgentemente possíveis vazamentos ou promova campanhas de conscientização na unidade.',
        color: 'text-cyan-600', bg: 'bg-cyan-50'
      });
    }
    if (stats.demand_compliance < 90) {
      recs.push({
        title: 'Atraso em Demandas Regionais',
        desc: 'Existem ofícios ou e-mails que foram respondidos fora do prazo. Monitore a caixa de entrada para não perder as datas de corte.',
        color: 'text-amber-600', bg: 'bg-amber-50'
      });
    }
    if (stats.tree_management === 0) {
      recs.push({
        title: 'Manejo Arbóreo Pendente',
        desc: 'A unidade está perdendo pontuação integral deste pilar. Insira a autorização válida no sistema ou declare que a escola não possui árvores (Não se aplica).',
        color: 'text-green-600', bg: 'bg-green-50'
      });
    }
    if (stats.zeladoria_status === 0) {
      recs.push({
        title: 'Irregularidade na Zeladoria',
        desc: 'O espaço de zeladoria consta como desocupado. Ocupar este ambiente garantirá a recuperação de pontuação vital para a escola.',
        color: 'text-indigo-500', bg: 'bg-indigo-50'
      });
    }
    if (stats.patrimonial_penalty > 0) {
      recs.push({
        title: 'Incidência de Vandalismo',
        desc: `Foram descontados ${stats.patrimonial_penalty.toFixed(2)} pontos devido a ocorrências. Reforce ações de Educação Patrimonial junto aos estudantes para mitigar dados.`,
        color: 'text-rose-600', bg: 'bg-rose-50'
      });
    }
    
    // Se passar em tudo e o array tiver vazio, solta a mensagem de parabéns
    if (recs.length === 0) {
      recs.push({
        title: 'Gestão de Excelência',
        desc: 'Sua unidade atende perfeitamente a todos os critérios do sistema GSU. Continue mantendo as boas práticas de gestão.',
        color: 'text-emerald-600', bg: 'bg-emerald-50'
      });
    }
    return recs; // Devolve as dicas pra tela
  };

  // Função matemática acionada quando o admin arrasta as barrinhas no menu Ajustes
  const handleWeightChange = (key: keyof WeightConfig, newValue: number) => {
    // Escudo: penalidades não entram nesse cálculo fechado de 10
    if (key === 'penalty_per_occurrence' || key === 'penalty_max') return;

    const totalCap = 10; // Soma obrigatória é 10
    const clampedValue = Math.min(10, Math.max(0, newValue)); // Limita arraste de 0 a 10
    
    setWeights(prev => {
      // Isola só as chaves dos pilares construtivos
      const positiveKeys = ['water_reg', 'water_limit', 'demand_on_time', 'tree_management', 'zeladoria'] as const;
      // Filtra as barrinhas que VOCÊ NÃO ARRASTOU (as outras)
      const otherKeys = positiveKeys.filter(k => k !== key); 
      
      let newWeights = { ...prev, [key]: clampedValue }; // Salva a que foi arrastada
      
      const sumOthers = otherKeys.reduce((acc, k) => acc + prev[k], 0); // Vê quanto espaço as outras ocupavam antes
      const targetOthers = totalCap - clampedValue; // Descobre quanto espaço SOBROU pra elas agora

      // Distribui o espaço que sobrou proporcionalmente pras outras
      if (sumOthers === 0) {
        const share = targetOthers / otherKeys.length;
        otherKeys.forEach(k => newWeights[k] = share);
      } else {
        const ratio = targetOthers / sumOthers;
        otherKeys.forEach(k => {
          newWeights[k] = prev[k] * ratio;
        });
      }

      // Arredonda pra matar casas decimais infinitas
      positiveKeys.forEach(k => {
        newWeights[k] = Math.round(newWeights[k] * 10) / 10;
      });

      // Checa a matemática novamente pra evitar 9.9
      const finalSum = positiveKeys.reduce((acc, k) => acc + newWeights[k], 0);
      const diff = Math.round((totalCap - finalSum) * 10) / 10;

      // Se sobrou 0.1, aplica de volta na primeira barrinha (que não foi a mexida)
      if (diff !== 0) {
        let maxKey = otherKeys[0];
        for (const k of otherKeys) {
          if (newWeights[k] > newWeights[maxKey]) {
            maxKey = k;
          }
        }
        newWeights[maxKey] = Math.round((newWeights[maxKey] + diff) * 10) / 10;
      }

      return newWeights; // Substitui o painel inteiro
    });
  };

  // Altera as penalidades independentemente
  const handlePenaltyChange = (key: 'penalty_per_occurrence' | 'penalty_max', newValue: number) => {
    const clampedValue = Math.max(0, newValue); // Não deixa o cara colocar número negativo
    setWeights(prev => ({ ...prev, [key]: clampedValue }));
  };

  // Ação de confirmar as alterações no BD
  async function handleSaveSettings() {
    // Regra de bloqueio da interface: não envia ao banco se a soma não der 10
    if (!isSumValid) {
      alert("A soma dos pesos deve ser exatamente 10.0!");
      return;
    }

    setSaveLoading(true); // Gira engrenagem
    try {
      // Upsert: comando SQL poderoso que insere, mas se o id existir, ele só atualiza
      const { error } = await (supabase as any)
        .from('ranking_settings')
        .upsert({
          id: 'default-weights',
          water_reg: weights.water_reg,
          water_limit: weights.water_limit,
          demand_on_time: weights.demand_on_time,
          tree_management: weights.tree_management,
          zeladoria: weights.zeladoria,
          penalty_per_occurrence: weights.penalty_per_occurrence,
          penalty_max: weights.penalty_max,
          updated_at: new Date().toISOString()
        });

      if (error) throw error; // Joga pra falha se o SQL xingar
      
      await fetchData(weights); // Reprocessa o ranking pra todos na hora
      setIsSettingsOpen(false); // Esconde a caixa
    } catch (error: any) {
      console.error("Erro SQL:", error);
      alert("Erro ao salvar! Detalhe: " + error.message);
    } finally {
      setSaveLoading(false); // Para engrenagem
    }
  }

  // Abreviação
  const isAdmin = userRole === 'regional_admin';

  // Peneira que filtra a lista final com base no cargo e no que foi digitado na barra de pesquisa superior
  // O "useMemo" é ótimo porque só processa a lista se ela sofrer alterações, economizando RAM do navegador
  const filteredRanking = useMemo(() => {
    let list = schools; 
    // Se for o gestor (nao é admin), limpa o array e deixa SÓ o da escola dele
    if (!isAdmin && userSchoolId) {
      list = schools.filter(s => s.id === userSchoolId);
    }
    // Faz a pesquisa textual (inclui o que tem escrito na barrinha)
    return list.filter(s => s.name.toLowerCase().includes(searchTerm.toLowerCase()));
  }, [schools, searchTerm, isAdmin, userSchoolId]);

  // ---------- RENDERIZAÇÃO DA PÁGINA (VISUAL/HTML) ----------
  return (
    <div className="min-h-screen space-y-8 pb-32 bg-[#f8fafc]">
      
      {/* -------------------- BARRA ROXA INFORMATIVA (TOPO DO SITE) -------------------- */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pt-6 px-2">
         {/* SELO DE BANCO DE DADOS */}
         <div className="bg-purple-600 text-white px-5 py-2.5 rounded-full flex items-center gap-3 shadow-lg shadow-purple-600/20 border border-purple-500">
            <Database size={18} className="animate-pulse" /> {/* Ícone piscando */}
            <span className="text-[11px] font-black uppercase tracking-widest leading-none">
               Informações do Banco de Dados <span className="opacity-70">(não em excel)</span>
            </span>
         </div>
         
         {/* SELO DE HORÁRIO/RECARGA */}
         <div className="flex items-center gap-2 text-slate-500 bg-white px-4 py-2 rounded-full border border-slate-200 shadow-sm">
            <Clock size={16} className="text-indigo-600" /> {/* Relógio */}
            <span className="text-[10px] font-bold uppercase tracking-widest">
               Atualizado em: <span className="text-indigo-600 font-black">{lastUpdated.toLocaleDateString('pt-BR')}</span> às <span className="text-indigo-600 font-black">{lastUpdated.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>
            </span>
         </div>
      </div>
      {/* ------------------------------------------------------------------------------- */}

      {/* TÍTULO DA PÁGINA (GSU) E BARRA DE BUSCA */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="flex items-center gap-5">
          <div className="p-4 bg-indigo-600 rounded-[2rem] text-white shadow-2xl">
            <Trophy size={36} /> 
          </div>
          <div>
            <h1 className="text-3xl font-black text-slate-900 tracking-tight uppercase leading-none">Ranking Regional</h1>
            <p className="text-slate-500 font-medium mt-1 uppercase text-xs tracking-widest italic">Desempenho e Conformidade da Rede</p>
          </div>
        </div>

        <div className="flex gap-3">
          {/* Campo de Busca Livre - Visível apenas para Administração */}
          {isAdmin && (
            <div className="bg-white p-2 rounded-2xl border-2 border-slate-100 shadow-sm flex items-center gap-3 w-full md:w-64">
              <Search size={18} className="text-slate-400 ml-2" />
              <input 
                type="text" 
                placeholder="Procurar Unidade..." 
                className="w-full bg-transparent border-none outline-none font-bold text-slate-700 text-xs py-2 uppercase"
                value={searchTerm} // Estado que envia as letras digitadas para a peneira
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          )}
          {/* Botão de Engrenagem do Painel de Pesos */}
          {isAdmin && (
            <button onClick={() => setIsSettingsOpen(true)} className="bg-slate-900 text-white p-4 rounded-2xl shadow-lg hover:bg-black transition-all active:scale-95">
              <Settings2 size={20} /> 
            </button>
          )}
        </div>
      </div>

      {/* DIVISOR DE LOADING: Se os cálculos estão sendo feitos, mostra rodinha */}
      {loading ? (
        <div className="py-40 flex flex-col items-center justify-center gap-4">
           <Loader2 className="animate-spin text-indigo-600" size={48} />
           <p className="text-xs font-black text-slate-400 uppercase tracking-widest">Calculando algoritmos GSU...</p>
        </div>
      ) : (
        <div className="space-y-12 animate-in fade-in duration-500">
          
          {/* -------------------- DESTAQUE PÓDIO (OS 3 PRIMEIROS) -------------------- */}
          {isAdmin && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
               {/* Fatiamos (slice) a lista processada pegando a posição [0], [1] e [2] */}
               {schools.slice(0, 3).map((school, idx) => (
                  <div 
                    key={school.id} 
                    onClick={() => setSelectedSchool(school)} // Habilita o clique pro modal transparente
                    // As cores mudam por causa do IDx (indexador do loop) onde 0 = Ouro, 1 = Prata, etc.
                    className={`relative p-8 rounded-[3rem] border-2 cursor-pointer transition-all hover:-translate-y-2 flex flex-col items-center text-center shadow-2xl ${
                      idx === 0 ? 'bg-amber-50 border-amber-200 ring-4 ring-amber-400/10' : 
                      idx === 1 ? 'bg-slate-50 border-slate-200' : 'bg-orange-50 border-orange-100'
                    }`}
                  >
                     {/* Ícone dourado e flutuante apenas para o Top 1 */}
                     {idx === 0 && <Medal size={32} className="text-amber-500 absolute -top-4 animate-bounce" />}
                     <div className={`w-16 h-16 rounded-[1.5rem] flex items-center justify-center text-2xl font-black mb-4 shadow-lg ${
                        idx === 0 ? 'bg-amber-400 text-white' : idx === 1 ? 'bg-slate-300 text-slate-700' : 'bg-orange-400 text-white'
                     }`}>
                        {idx + 1}º {/* Mostra pos */}
                     </div>
                     <h4 className="font-black text-slate-800 uppercase text-xs line-clamp-2 h-8 leading-tight mb-2">{school.name}</h4>
                     
                     <div className="flex items-center gap-2 bg-white px-4 py-2 rounded-2xl shadow-sm border border-slate-100 mt-2">
                        <TrendingUp size={12} className="text-emerald-500" />
                        <span className="text-xl font-black text-slate-900">{school.score.toFixed(2)}</span>
                     </div>
                  </div>
               ))}
            </div>
          )}

          {/* -------------------- LAYOUT DIVIDIDO EM 2 COLUNAS -------------------- */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            
            {/* LADO ESQUERDO: REGRAS E TÓPICOS (Ocupa 4 de 12 colunas) */}
            <div className="lg:col-span-4 space-y-6 lg:sticky lg:top-8">
              <div className="bg-white p-8 rounded-[3rem] border border-slate-100 shadow-2xl space-y-8">
                 <div>
                    <h3 className="text-sm font-black text-slate-800 uppercase tracking-tight flex items-center gap-2 mb-6 border-b border-slate-50 pb-4">
                       <HelpCircle size={18} className="text-indigo-600"/> Pilares da Nota
                    </h3>
                    <div className="space-y-6">
                       {/* Escreve os textos explicativos usando o mini componente 'RuleInfo' */}
                       <RuleInfo icon={<Droplets size={14}/>} title="Registos de Água" desc="Frequência diária de leitura no sistema." color="text-blue-500" />
                       <RuleInfo icon={<TrendingDown size={14}/>} title="Eficiência Hídrica" desc="Manutenção do consumo dentro do teto." color="text-cyan-500" />
                       <RuleInfo icon={<Clock size={14}/>} title="Prazos de Demandas" desc="Resposta a e-mails e ofícios regionais." color="text-red-500" />
                       <RuleInfo icon={<TreePine size={14}/>} title="Manejo Arbóreo" desc="Autorização de manejo em dia ou não se aplica." color="text-green-500" />
                       <RuleInfo icon={<Home size={14}/>} title="Zeladoria" desc="Se não possui zeladoria (Max Pts) ou se o imóvel está ocupado." color="text-indigo-500" />
                       <RuleInfo icon={<ShieldAlert size={14}/>} title="Educação Patrimonial" desc={`Penalização (Até -${weights.penalty_max} pts) por ocorrências de danos.`} color="text-rose-500" />
                    </div>
                 </div>

                 {/* MÉDIA DA DIRETORIA: Soma todas as notas e divide pela quantidade do array */}
                 {isAdmin && (
                   <div className="pt-6 border-t border-slate-100 text-center">
                      <div className="bg-indigo-50 p-6 rounded-[2.5rem] border border-indigo-100 inline-block w-full">
                         <div className="flex items-center justify-center gap-2 mb-2 text-indigo-600">
                            <BarChart3 size={16}/>
                            <h4 className="text-[10px] font-black uppercase tracking-widest">Média da Rede</h4>
                         </div>
                         <div className="flex items-end justify-center gap-2">
                            <span className="text-3xl font-black text-indigo-900">
                               {(schools.reduce((acc, s) => acc + s.score, 0) / (schools.length || 1)).toFixed(2)}
                            </span>
                            <span className="text-[10px] font-bold text-indigo-400 uppercase mb-1">GSU</span>
                         </div>
                      </div>
                   </div>
                 )}
              </div>
            </div>

            {/* LADO DIREITO: A GRANDE LISTA DE CARTÕES BRANCOS (Ocupa 8 de 12) */}
            <div className="lg:col-span-8 space-y-4">
              <div className="flex items-center gap-3 px-4 mb-2">
                 <Target className="text-indigo-600" size={18} />
                 {/* Nome adaptativo: Se é chefe vê a Rede, se for funcionário vê só o Painel de Gestão dele */}
                 <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest">
                    {isAdmin ? 'Classificação Completa da Rede' : 'Sua Pontuação de Gestão'}
                 </h3>
              </div>
              
              {/* Loop para desenhar cada escola */}
              {filteredRanking.map((school) => {
                 // Dispara flag verdadeira caso ela seja escola de atenção do SEOM-SEFISC
                 const isPriority = isAdmin && isSchoolPriority(school.name);

                 return (
                    <div 
                      key={school.id} 
                      onClick={() => setSelectedSchool(school)} // Botão gigantesco clicável
                      // A borda fica vermelha se ela for prioridade (isPriority)
                      className={`bg-white p-5 rounded-[2.5rem] border transition-all cursor-pointer shadow-xl flex items-center gap-4 group hover:border-indigo-400 active:scale-[0.99] overflow-hidden ${isPriority ? 'ring-2 ring-red-100 border-red-200' : 'border-slate-100'}`}
                    >
                       <div className="flex items-center gap-4 flex-1 min-w-0">
                          {/* Caixa esquerda: Posição */}
                          <div className={`w-12 h-12 rounded-2xl flex items-center justify-center font-black text-sm shrink-0 border-2 text-slate-400 group-hover:text-indigo-600 group-hover:bg-indigo-50 transition-all ${isPriority ? 'bg-red-50 border-red-100' : 'border-slate-50'}`}>#{school.position}</div>
                          
                          <div className="flex-1 min-w-0 pr-2">
                             <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                                {/* Nome grandão */}
                                <h4 className="font-black text-slate-800 uppercase text-xs truncate group-hover:text-indigo-600 transition-colors" title={school.name}>{school.name}</h4>
                                
                                {/* ALERTA VERMELHO DE EMERGÊNCIA (Só os admin enxergam) */}
                                {isAdmin && isPriority && (
                                  <div className="flex items-center gap-2 bg-gradient-to-r from-red-600 to-red-500 px-4 py-2 rounded-xl shadow-[0_4px_20px_rgba(220,38,38,0.4)] animate-in zoom-in-75 duration-300 relative group/alert overflow-hidden">
                                     {/* Brilho correndo pelo botão */}
                                     <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent -translate-x-full animate-[shimmer_2s_infinite] pointer-events-none" />
                                     <div className="relative flex items-center gap-2">
                                       <div className="animate-[bounce_2s_infinite]">
                                          <AlertTriangle size={14} className="text-white fill-white" />
                                       </div>
                                       <span className="text-[10px] font-black text-white uppercase tracking-[0.1em] whitespace-nowrap">
                                          Escola Prioritária SEOM-SEFISC
                                       </span>
                                     </div>
                                  </div>
                                )}
                             </div>

                             {/* Estatísticas pequenininhas desenhadas na tela */}
                             <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2">
                                {/* Mostra no html os componentes auxiliares formatados */}
                                <SmallStat label="Água" val={school.stats.water_compliance} icon={<Droplets size={12}/>} />
                                <SmallStat label="Demandas" val={school.stats.demand_compliance} icon={<Clock size={12}/>} />
                                <SmallStat label="Zeladoria" val={school.stats.zeladoria_status} icon={<Home size={12}/>} />
                                {/* Se ela sofreu vandalismo, avisa na tela do card */}
                                {school.stats.patrimonial_penalty > 0 && (
                                  <div className="flex items-center gap-1"><ShieldAlert size={12} className="text-rose-500"/><span className="text-[9px] font-black text-rose-500 uppercase tracking-tighter">Penalidade de Vandalismo</span></div>
                                )}
                             </div>
                          </div>
                       </div>

                       {/* Caixa direita: Caixa de nota final */}
                       <div className="flex items-center gap-4 shrink-0 border-l border-slate-50 pl-4 min-w-[140px] justify-end">
                          <div className="text-right">
                             <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-0.5">Índice GSU</p>
                             {/* As cores da nota mudam conforme a excelência. Verde (8+), Amarelo (6+), Vermelho (Menor que 6) */}
                             <div className={`px-5 py-2 rounded-xl font-black text-lg shadow-inner transition-all group-hover:scale-105 ${school.score >= 8 ? 'text-emerald-600 bg-emerald-50' : school.score >= 6 ? 'text-amber-600 bg-amber-50' : 'text-red-600 bg-red-50'}`}>
                                {school.score.toFixed(2)}
                             </div>
                          </div>
                          {/* Setinha transparente indicando interatividade */}
                          <div className="p-3 bg-slate-50 text-slate-300 rounded-xl group-hover:bg-indigo-600 group-hover:text-white transition-all hidden sm:block">
                            <ChevronRight size={18}/>
                          </div>
                       </div>
                    </div>
                 );
              })}
            </div>
          </div>
        </div>
      )}

      {/* -------------------- MODAL SOBREPOSTO 1: DETALHE TRANSPARENTE DA ESCOLA -------------------- */}
      {/* Esse modal só brota na tela quando a variável 'selectedSchool' estiver com alguma escola preenchida */}
      {selectedSchool && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-900/90 backdrop-blur-md p-4 overflow-hidden">
           <div className="bg-white rounded-[3.5rem] w-full max-w-2xl max-h-[90vh] shadow-2xl animate-in zoom-in-95 duration-200 border border-white flex flex-col overflow-hidden">
              
              {/* Topo: Informações Nome e Botão Cancelar */}
              <div className="p-8 border-b border-slate-100 flex justify-between items-center bg-slate-50/50 shrink-0">
                 <div className="flex items-center gap-5">
                    <div className={`w-14 h-14 rounded-2xl flex items-center justify-center text-white shadow-xl ${selectedSchool.score >= 8 ? 'bg-emerald-500' : 'bg-indigo-600'}`}>
                       <Building2 size={28}/>
                    </div>
                    <div className="pr-4">
                       <h2 className="text-xl font-black text-slate-800 uppercase tracking-tight leading-none truncate max-w-[300px]">{selectedSchool.name}</h2>
                       <p className="text-[10px] text-indigo-600 font-bold uppercase tracking-widest mt-2">Análise Transparente de Gestão</p>
                    </div>
                 </div>
                 {/* Clicando no X ele seta nulo, e o React remove o modal instantaneamente */}
                 <button onClick={() => setSelectedSchool(null)} className="p-3 hover:bg-white rounded-full transition-all text-slate-400"><X size={28}/></button>
              </div>

              {/* Miolo: Rolagem do detalhamento das notas */}
              <div className="p-8 space-y-8 overflow-y-auto custom-scrollbar flex-1 text-slate-800 bg-[#f8fafc]">
                 
                 {/* Resumo Pretão de Posição/Nota */}
                 <div className="bg-slate-900 p-8 rounded-[2.5rem] text-white flex items-center justify-between shadow-2xl relative overflow-hidden">
                    <Trophy size={100} className="absolute -right-8 -bottom-8 text-white/5 rotate-12" />
                    <div className="relative z-10">
                       <p className="text-[10px] font-black text-white/40 uppercase tracking-widest">Índice Final GSU</p>
                       <h3 className="text-5xl font-black mt-1">{selectedSchool.score.toFixed(2)}</h3>
                    </div>
                    <div className="text-right relative z-10">
                       <p className="text-[10px] font-black text-white/40 uppercase tracking-widest">Posição na Rede</p>
                       <h3 className="text-3xl font-black text-amber-400 mt-1">{selectedSchool.position}º</h3>
                    </div>
                 </div>

                 <div className="grid md:grid-cols-2 gap-8">
                    
                    {/* Exposição das Regras: Aqui ele lista de onde saiu aquela nota final */}
                    <div className="space-y-4">
                       <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em] flex items-center gap-2 px-2">
                          <BarChart3 size={14}/> Por que essa pontuação?
                       </h4>
                       <div className="grid gap-3">
                          {/* Dispara o componente gráfico para cada status */}
                          <BreakdownItem label="Registo de Água" value={selectedSchool.stats.water_compliance} weight={weights.water_reg} icon={<Droplets size={14} className="text-blue-500"/>} />
                          <BreakdownItem label="Eficiência Hídrica" value={selectedSchool.stats.water_efficiency} weight={weights.water_limit} icon={<TrendingDown size={14} className="text-cyan-500"/>} />
                          <BreakdownItem label="Demandas no Prazo" value={selectedSchool.stats.demand_compliance} weight={weights.demand_on_time} icon={<Clock size={14} className="text-red-500"/>} />
                          <BreakdownItem label="Manejo Arbóreo" value={selectedSchool.stats.tree_management} weight={weights.tree_management} icon={<TreePine size={14} className="text-green-500"/>} />
                          <BreakdownItem label="Zeladoria" value={selectedSchool.stats.zeladoria_status} weight={weights.zeladoria} icon={<Home size={14} className="text-indigo-500"/>} />
                          
                          {/* Renderiza o desconto de Patrimônio apenas se a escola estiver sofrendo ele */}
                          {selectedSchool.stats.patrimonial_penalty > 0 && (
                             <div className="bg-rose-50 p-5 rounded-2xl border border-rose-200 group transition-all">
                                <div className="flex justify-between items-center mb-2">
                                   <div className="flex items-center gap-2">
                                      <ShieldAlert size={14} className="text-rose-600" />
                                      <span className="text-[11px] font-black text-rose-800 uppercase tracking-tight">Penalidade (Vandalismo)</span>
                                   </div>
                                   <span className="text-sm font-black text-rose-700">-{selectedSchool.stats.patrimonial_penalty.toFixed(2)} pts</span>
                                </div>
                                <p className="text-[9px] font-black text-rose-600 uppercase mt-1">Pontuação foi subtraída por registros patrimoniais.</p>
                             </div>
                          )}
                       </div>
                    </div>

                    {/* Resposta do algoritmo de dicas/inteligência */}
                    <div className="space-y-4">
                       <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em] flex items-center gap-2 px-2">
                          <Lightbulb size={14} className="text-amber-500"/> Plano de Ação
                       </h4>
                       <div className="space-y-3">
                          {/* Dispara a função, ela devolve as frases e escreve no HTML da tela */}
                          {generateRecommendations(selectedSchool.stats).map((rec, index) => (
                            <div key={index} className={`p-5 rounded-2xl border border-slate-100 ${rec.bg}`}>
                               <h5 className={`text-[11px] font-black uppercase tracking-tight mb-2 flex items-center gap-2 ${rec.color}`}>
                                  {rec.title}
                               </h5>
                               <p className="text-[10px] text-slate-600 leading-relaxed">{rec.desc}</p>
                            </div>
                          ))}
                       </div>
                    </div>
                 </div>

              </div>

              {/* Botão de Rodapé para sair */}
              <div className="p-8 border-t border-slate-100 bg-white shrink-0 text-center">
                 <button onClick={() => setSelectedSchool(null)} className="px-12 py-4 bg-slate-900 text-white rounded-2xl font-black uppercase text-xs tracking-widest hover:bg-black transition-all">Fechar Análise</button>
              </div>
           </div>
        </div>
      )}

      {/* -------------------- MODAL SOBREPOSTO 2: PAINEL DE CONFIGURAÇÕES DE PESO (SÓ ADMIN) -------------------- */}
      {isSettingsOpen && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-900/80 backdrop-blur-sm p-4 overflow-hidden">
          <div className="bg-white rounded-[3rem] w-full max-w-xl max-h-[90vh] shadow-2xl overflow-hidden border border-white flex flex-col">
            
            {/* Topo e Título */}
            <div className="p-8 border-b border-slate-100 flex justify-between items-center bg-indigo-50/50 shrink-0">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-slate-900 rounded-2xl flex items-center justify-center text-white"><Settings2 size={24} /></div>
                <div><h2 className="text-xl font-black uppercase tracking-tight leading-none">Ajuste de Critérios</h2><p className="text-xs text-indigo-600 font-bold uppercase tracking-widest mt-1">Configure os pesos e descontos</p></div>
              </div>
              <button onClick={() => setIsSettingsOpen(false)} className="p-2 hover:bg-white rounded-full text-slate-400 transition-all"><X size={24} /></button>
            </div>
            
            <div className="p-8 space-y-8 overflow-y-auto custom-scrollbar flex-1">
               
               <div className="space-y-4">
                 {/* CARD DE SOMA: Inteligência visual que avisa se o cara arrastou a barra de forma errada */}
                 <div className={`p-5 rounded-[2rem] text-white flex items-center justify-between shadow-lg transition-colors ${isSumValid ? 'bg-indigo-900' : 'bg-rose-600'}`}>
                    <div>
                      <p className="text-[9px] font-black text-white/40 uppercase tracking-widest">Soma Operacional</p>
                      {/* O valor muda em tempo real enquanto o adm arrasta a barra */}
                      <h3 className="text-2xl font-black">{currentPositiveSum.toFixed(1)}</h3>
                    </div>
                    <div className="flex flex-col items-end">
                       {/* Efeito Condicional de renderização Verde x Vermelho */}
                       {isSumValid ? (
                         <>
                           <CheckCircle2 className="text-emerald-400 mb-1" size={24} />
                           <span className="text-[8px] uppercase tracking-widest text-indigo-300">Auto-Equilibrado</span>
                         </>
                       ) : (
                         <>
                           <AlertTriangle className="text-white mb-1" size={24} />
                           <span className="text-[8px] uppercase tracking-widest text-rose-200">Soma Incorreta</span>
                         </>
                       )}
                    </div>
                 </div>

                 <div className="space-y-4">
                    {/* Instâncias arrastáveis para cada uma das avaliações do painel */}
                    <WeightInput label="Registo de Água" val={weights.water_reg} onChange={(v) => handleWeightChange('water_reg', v)} icon={<Droplets size={14}/>}/>
                    <WeightInput label="Eficiência Hídrica" val={weights.water_limit} onChange={(v) => handleWeightChange('water_limit', v)} icon={<TrendingDown size={14}/>}/>
                    <WeightInput label="Demandas no Prazo" val={weights.demand_on_time} onChange={(v) => handleWeightChange('demand_on_time', v)} icon={<Clock size={14}/>}/>
                    <WeightInput label="Manejo Arbóreo" val={weights.tree_management} onChange={(v) => handleWeightChange('tree_management', v)} icon={<TreePine size={14}/>}/>
                    <WeightInput label="Zeladoria" val={weights.zeladoria} onChange={(v) => handleWeightChange('zeladoria', v)} icon={<Home size={14}/>}/>
                 </div>
               </div>

               <hr className="border-slate-100" />

               <div className="space-y-4">
                  <div className="flex items-center gap-2 px-2">
                     <ShieldAlert size={16} className="text-rose-500"/>
                     <h4 className="text-xs font-black text-slate-800 uppercase tracking-tight">Regras de Penalidade (Vandalismo)</h4>
                  </div>
                  
                  <div className="space-y-4">
                    {/* Instância com estilo de perigo (Cor Rose) por ser uma variável de Desconto */}
                    <WeightInput 
                      label="Desconto por Ocorrência" 
                      val={weights.penalty_per_occurrence} 
                      onChange={(v) => handlePenaltyChange('penalty_per_occurrence', v)} 
                      icon={<MinusCircle size={14}/>}
                      color="rose"
                      max={5}
                      step={0.1}
                    />
                    <WeightInput 
                      label="Limite Máximo de Desconto" 
                      val={weights.penalty_max} 
                      onChange={(v) => handlePenaltyChange('penalty_max', v)} 
                      icon={<AlertTriangle size={14}/>}
                      color="rose"
                      max={10}
                      step={0.5}
                    />
                  </div>
               </div>

            </div>

            {/* BOTÃO DE CONFIRMAR / TRAVAR BANCO */}
            <div className="p-8 border-t border-slate-100 bg-white shrink-0">
               <button 
                 onClick={handleSaveSettings} 
                 // Se o botão não for isSumValid, ele fica inoperante e cinza
                 disabled={saveLoading || !isSumValid} 
                 className={`w-full py-5 text-white rounded-2xl font-black shadow-xl transition-all flex items-center justify-center gap-3 uppercase tracking-widest text-[11px] ${!isSumValid ? 'bg-slate-300 cursor-not-allowed' : 'bg-indigo-600 hover:bg-indigo-700'}`}
               >
                  {saveLoading ? <Loader2 className="animate-spin" size={18}/> : <Save size={18}/>}
                  {/* Troca a mensagem dependendo se a conta fechou certa */}
                  {isSumValid ? 'SALVAR CONFIGURAÇÃO' : 'SOMA DEVE SER 10'}
               </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ======================== COMPONENTES REUTILIZÁVEIS / MINI FUNCIONAIS ========================

// É o item que mostra o percentual de performance na tela principal
function SmallStat({ label, val, icon }: { label: string, val: number, icon: React.ReactNode }) {
  // Cores semáforo (Verde, Amarelo, Vermelho)
  const color = val >= 90 ? 'text-emerald-600' : val >= 70 ? 'text-amber-600' : val > 0 ? 'text-amber-600' : 'text-red-500';
  return (
    <div className="flex items-center gap-1.5"><span className="text-slate-300 shrink-0">{icon}</span><span className="text-[9px] font-black text-slate-400 uppercase tracking-tighter">{label}:</span><span className={`text-[10px] font-black ${color}`}>{Math.round(val)}%</span></div>
  );
}

// Usado para listar e descrever as regras do painel principal lado esquerdo
function RuleInfo({ icon, title, desc, color }: { icon: React.ReactNode, title: string, desc: string, color: string }) {
  return (
    <div className="flex items-start gap-3">
       <div className={`p-2 rounded-lg bg-slate-50 ${color} shadow-sm shrink-0`}>{icon}</div>
       <div>
          <h5 className="text-[10px] font-black text-slate-700 uppercase leading-none mb-1">{title}</h5>
          <p className="text-[9px] text-slate-400 font-medium leading-tight uppercase">{desc}</p>
       </div>
    </div>
  );
}

// O componente de transparência, exibe no modal a barrinha visual de quanto a escola conquistou
function BreakdownItem({ label, value, weight, icon }: { label: string, value: number, weight: number, icon: React.ReactNode }) {
  // A matemática desmascarada para os Gestores (mostra quantos pontos absolutos vieram)
  const scoreContribution = (value / 100) * weight;
  
  return (
    <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm group transition-all hover:border-indigo-200">
       <div className="flex justify-between items-center mb-2">
          <div className="flex items-center gap-2">
             {icon}
             <span className="text-[11px] font-black text-slate-700 uppercase tracking-tight">{label}</span>
          </div>
          <div className="flex items-center gap-2">
             <span className="text-[9px] font-bold text-slate-500 uppercase bg-slate-100 px-2 py-0.5 rounded border border-slate-200">Peso Base: {weight.toFixed(1)}</span>
             <span className="text-sm font-black text-slate-900">{value.toFixed(1)}%</span>
          </div>
       </div>
       {/* Trilha de fundo da barrinha */}
       <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden mt-1 mb-3">
          {/* O preenchimento vai variar de 0 a 100% */}
          <div className={`h-full transition-all duration-1000 ${value >= 90 ? 'bg-emerald-500' : value >= 70 ? 'bg-amber-500' : value > 0 ? 'bg-amber-500' : 'bg-red-500'}`} style={{ width: `${value}%` }} />
       </div>
       <div className="flex items-center gap-1 mt-2 p-2 bg-slate-50 rounded-lg">
           <HelpCircle size={10} className="text-slate-400"/>
           <p className="text-[9px] font-black text-slate-500 uppercase">Cálculo: <span className="text-slate-400">{value.toFixed(0)}% de {weight.toFixed(1)} pts =</span> <span className="text-indigo-600 font-black text-[11px]">+{scoreContribution.toFixed(2)} Pontos Adquiridos</span></p>
       </div>
    </div>
  );
}

// Elemento padrão arrastável dentro das configurações do banco. Altera sua cor com base na propriedade color='rose'
function WeightInput({ label, val, onChange, icon, color = 'indigo', max = 5, step = 0.1 }: { label: string, val: number, onChange: (v: number) => void, icon: React.ReactNode, color?: 'indigo' | 'rose', max?: number, step?: number }) {
  const isRose = color === 'rose'; // Boolean que aplica estilos CSS tailwind apropriados
  return (
    <div className={`flex items-center justify-between p-4 bg-white rounded-2xl border border-slate-200 transition-all shadow-sm ${isRose ? 'hover:border-rose-300' : 'hover:border-indigo-300'}`}>
      <div className="flex items-center gap-3">
        <div className={isRose ? 'text-rose-500' : 'text-indigo-500'}>{icon}</div>
        <span className="text-[11px] font-black text-slate-700 uppercase tracking-tight">{label}</span>
      </div>
      <div className="flex items-center gap-4">
        {/* Componente <input range> é a barrinha interativa */}
        <input 
          type="range" 
          min="0" 
          max={max} 
          step={step} 
          className={`w-24 cursor-pointer ${isRose ? 'accent-rose-500' : 'accent-indigo-600'}`} 
          value={val} 
          onChange={(e) => onChange(Number(e.target.value))} 
        />
        <span className={`w-12 h-9 text-white rounded-xl flex items-center justify-center font-black text-xs shadow-md ${isRose ? 'bg-rose-500' : 'bg-indigo-600'}`}>
          {val.toFixed(1)}
        </span>
      </div>
    </div>
  );
}

export default RankingEscolas;
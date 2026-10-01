// Cálculo do Ranking de Escolas (nota GSU e percentuais de cada pilar).
// Fica fora da página para que o Ranking e as métricas dos Selos de
// Excelência (src/lib/selosMetricas.ts) usem exatamente os mesmos números.
import { supabase } from './supabase';
// Leitor de planilhas CSV (usado para cruzar o mapeamento de AVCB, igual à página de Bombeiros)
import Papa from 'papaparse';

// Link da planilha de mapeamento AVCB (mesma fonte usada na página "Mapeamento AVCB")
const AVCB_SHEET_CSV_URL = import.meta.env.VITE_AVCB_SHEET_CSV_URL as string;

// Limpa o cabeçalho do CSV (tira acento, espaço e underline) para bater com "codigofde" e "validade"
const normalizeAvcbText = (value: any) =>
  String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/_/g, '')
    .replace(/\s+/g, '')
    .trim();

// Deixa só os dígitos do código FDE, pra "123.456" e "123456" baterem igual
const normalizeAvcbCode = (value: any) => String(value || '').replace(/\D/g, '').trim();

// Converte "DD/MM/AAAA" (formato da planilha) em Date. Retorna null se vier vazio/"-"/inválido
const parseAvcbDate = (value: string): Date | null => {
  if (!value) return null;
  const parts = value.split(' ')[0].trim().split('/');
  if (parts.length !== 3) return null;
  const [d, m, y] = parts.map(Number);
  if (!d || !m || !y) return null;
  const date = new Date(y, m - 1, d);
  return isNaN(date.getTime()) ? null : date;
};

// Define a estrutura de dados de uma escola processada para o Ranking
export interface SchoolRanking {
  id: string; // Identificador único da escola
  name: string; // Nome da escola
  score: number; // Nota final calculada do GSU
  position: number; // Posição que ela ficou no ranking
  stats: { // Estatísticas individuais (0 a 100%) de cada critério
    water_compliance: number; // Porcentagem de dias que preencheu a água (últimos 12 meses, a partir de mai/2026)
    water_efficiency: number; // Porcentagem de dias que não estourou o teto (últimos 3 meses)
    demand_compliance: number; // Porcentagem de demandas em dia (só penaliza pendente E vencida)
    tree_management: number; // Regularidade do manejo arbóreo
    zeladoria_status: number; // Status da ocupação da zeladoria (Ajustado pela nova regra)
    patrimonial_penalty: number; // Total de pontos descontados por vandalismo
    avcb_status: number; // 100 = válido, 50 = sem registro, 0 = vencido
    avcb_label: string; // Texto amigável do status do AVCB
    water_exempt: boolean; // Escola dispensada do registro diário de água
    // Pesos EFETIVOS de cada pilar para esta escola (após redistribuir o peso do
    // Registo de Água quando ela é dispensada). Somam 10, iguais aos pesos base
    // para escolas não dispensadas.
    weights: {
      water_reg: number;
      water_limit: number;
      demand_on_time: number;
      tree_management: number;
      zeladoria: number;
      avcb: number;
    };
  };
  // Dados brutos por pilar, usados pelas métricas dos Selos de Excelência para
  // distinguir "100% porque cumpriu" de "100% porque não havia nada a cumprir".
  extras: {
    water_reg_days: number; // Leituras de água lançadas na janela de Registo
    water_eff_days: number; // Leituras na janela de Eficiência Hídrica
    demand_total: number; // Total de demandas da escola
    demand_overdue: number; // Demandas pendentes e vencidas
    manejo_autorizado: boolean; // Tem autorização de manejo com validade (não vale "não se aplica")
    zeladoria_concluida: boolean; // Tem processo de zeladoria na etapa CONCLUÍDO
  };
}

// Define a estrutura de dados das configurações dos Pesos
export interface WeightConfig {
  water_reg: number; // Peso da leitura de água
  water_limit: number; // Peso do respeito ao teto
  demand_on_time: number; // Peso dos ofícios e demandas
  tree_management: number; // Peso das árvores
  zeladoria: number; // Peso do imóvel da zeladoria
  avcb: number; // Peso do AVCB (Auto de Vistoria do Corpo de Bombeiros)
  penalty_per_occurrence: number; // O valor descontado por cada vandalismo
  penalty_max: number; // O limite máximo de desconto para não zerar a escola de vez
}

// Interface básica para buscar a escola antes do cálculo
export interface SchoolBase {
  id: string; // ID
  name: string; // Nome
  fde_code: string | null; // Código FDE, usado para cruzar com a planilha de AVCB
  water_exempt: boolean | null; // Escola dispensada do registro diário de água (marcado em Consumo de Água)
}

// Leitor da planilha do Corpo de Bombeiros (AVCB), monta um mapa código FDE -> data de validade
async function fetchAvcbMap(): Promise<Map<string, Date | null>> {
  return new Promise((resolve) => {
    if (!AVCB_SHEET_CSV_URL) { resolve(new Map()); return; }
    Papa.parse(AVCB_SHEET_CSV_URL, {
      download: true,
      header: true,
      skipEmptyLines: true,
      transformHeader: normalizeAvcbText,
      complete: (results) => {
        const map = new Map<string, Date | null>();
        (results.data as any[]).forEach((row) => {
          const codigoFde = normalizeAvcbCode(row.codigofde || row.codigo || row.fde || row.codigoescola || row.codigodaescola);
          if (codigoFde) map.set(codigoFde, parseAvcbDate(row.validade));
        });
        resolve(map);
      },
      error: (error) => {
        console.error("Erro ao carregar AVCB:", error);
        resolve(new Map());
      }
    });
  });
}

// O Coração do Sistema: Escaneia o banco e dá as notas para as escolas.
// Devolve a lista já ordenada da maior para a menor nota.
export async function calcularRanking(currentWeights: WeightConfig): Promise<SchoolRanking[]> {
  // 1. Busca os dados cruciais (id, nome, código FDE p/ cruzar com o AVCB e isenção de água) de todas as unidades
  const { data: schoolsData } = await (supabase as any).from('schools').select('id, name, fde_code, water_exempt');

  const now = new Date(); // Data de hoje
  const todayStr = now.toISOString().split('T')[0]; // Hoje em formato YYYY-MM-DD, usado para comparar prazos

  // ---- JANELAS DE TEMPO DA ÁGUA ----
  // Eficiência Hídrica (respeito ao teto de consumo): últimos 3 meses corridos
  const effWindowStart = new Date(now.getFullYear(), now.getMonth() - 3, now.getDate());
  // Registo de Água (frequência de lançamento): últimos 12 meses, mas nunca antes de maio/2026
  // (mês/ano em que o lançamento diário passou a ser exigido de fato)
  const REG_WATER_FLOOR = new Date(2026, 4, 1); // 1º de maio de 2026
  const twelveMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 12, now.getDate());
  const regWindowStart = twelveMonthsAgo > REG_WATER_FLOOR ? twelveMonthsAgo : REG_WATER_FLOOR;
  // Busca no banco a partir da janela mais antiga entre as duas, e filtra cada critério em memória
  const waterFetchStart = effWindowStart < regWindowStart ? effWindowStart : regWindowStart;
  const toISODate = (d: Date) => d.toISOString().split('T')[0];

  // 2. Faz as requisições ao Supabase (e a leitura do AVCB) ao mesmo tempo usando Promise.all
  const [water, demands, manejo, ocorrencias, zeladorias, exemptions, avcbMap] = await Promise.all([
    (supabase as any).from('consumo_agua').select('*').gte('date', toISODate(waterFetchStart)), // Água (janela mais ampla)
    (supabase as any).from('demands').select('*'), // Demandas (todas)
    (supabase as any).from('manejo_arboreo').select('*'), // Árvores (todas)
    (supabase as any).from('patrimonial_occurrences').select('*').gte('created_at', new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0]), // Vandalismo (este mês)
    (supabase as any).from('zeladorias').select('*'), // Zeladorias (todas)
    (supabase as any).from('school_water_exemptions').select('school_id, start_date, end_date'), // Períodos de dispensa do registro de água
    fetchAvcbMap() // Mapa: código FDE -> data de validade do AVCB (planilha do Corpo de Bombeiros)
  ]);

  // Tratamento de segurança: se vier null, vira array vazio []
  const allSchools: SchoolBase[] = schoolsData || [];
  const waterLogs = water.data || [];
  const allDemands = demands.data || [];
  const allManejo = manejo.data || [];
  const allOcorrencias = ocorrencias.data || [];
  const allZeladorias = zeladorias.data || [];

  const regWindowStartStr = toISODate(regWindowStart);
  const effWindowStartStr = toISODate(effWindowStart);
  // Quantos dias existem dentro da janela de Registo de Água (base da divisão da frequência)
  const daysInRegWindow = Math.max(1, Math.floor((now.getTime() - regWindowStart.getTime()) / 86400000) + 1);
  const todayISO = toISODate(now);

  // Dias de dispensa (isenção de registro de água) dentro da janela de Registo,
  // por escola. Um período (start_date .. end_date, null = em aberto) que
  // cobre parte da janela reduz o denominador da frequência daquela escola —
  // se cobre a janela inteira, o pilar sai do cálculo e o peso é redistribuído.
  const exemptDaysBySchool: Record<string, number> = {};
  ((exemptions.data as any[]) || []).forEach((e: any) => {
    const from = e.start_date > regWindowStartStr ? e.start_date : regWindowStartStr;
    const to = (e.end_date && e.end_date < todayISO) ? e.end_date : todayISO;
    if (to < from) return;
    const days = Math.floor((new Date(to + 'T12:00:00').getTime() - new Date(from + 'T12:00:00').getTime()) / 86400000) + 1;
    exemptDaysBySchool[e.school_id] = (exemptDaysBySchool[e.school_id] || 0) + days;
  });

  // 3. Roda uma repetição para avaliar escola por escola
  const ranking: SchoolRanking[] = allSchools.map((school: SchoolBase) => {

    // ---- CRITÉRIO 1: ÁGUA FREQUÊNCIA (Registo de Água - últimos 12 meses, piso maio/2026) ----
    const schoolWaterAll = waterLogs.filter((w: any) => w.school_id === school.id); // Isola a água da escola
    const schoolWaterReg = schoolWaterAll.filter((w: any) => w.date >= regWindowStartStr);
    // Escola dispensada do registro de água (Consumo de Água) não é cobrada
    // pelos dias em que esteve dispensada: o denominador da frequência é a
    // janela menos os dias de dispensa. Se ela esteve dispensada a janela
    // inteira, effectiveRegDays <= 0 e o pilar sai do cálculo (redistribuição
    // de peso abaixo) — sem essa checagem ela cairia pra perto de 0% injustamente.
    const effectiveRegDays = daysInRegWindow - (exemptDaysBySchool[school.id] || 0);
    const fullyWaterExempt = effectiveRegDays <= 0;
    const waterRegPct = fullyWaterExempt
      ? 1
      : Math.min(1, schoolWaterReg.length / effectiveRegDays); // Divisão: Entregues / Dias cobrados da janela. Teto máximo é 1 (100%)

    // ---- CRITÉRIO 2: ÁGUA EFICIÊNCIA (Eficiência Hídrica - últimos 3 meses) ----
    const schoolWaterEff = schoolWaterAll.filter((w: any) => w.date >= effWindowStartStr);
    const exceededCount = schoolWaterEff.filter((w: any) => w.limit_exceeded).length; // Quantas vezes estourou?
    const waterEffPct = schoolWaterEff.length > 0 ? (1 - exceededCount / schoolWaterEff.length) : 1; // 100% menos os estouros

    // ---- CRITÉRIO 3: DEMANDAS E OFÍCIOS ----
    const schoolDemands = allDemands.filter((d: any) => d.school_id === school.id); // Pega ofícios dela
    // Só penaliza a demanda que está PENDENTE (ainda não atendida) E cujo prazo já venceu.
    // Assim que a escola atende (conclui) a demanda, ela deixa de contar contra a nota - a pontuação volta a subir.
    const overdueOpenDemands = schoolDemands.filter((d: any) => d.status !== 'CONCLUÍDO' && d.deadline && d.deadline < todayStr);
    const demandPct = schoolDemands.length > 0 ? Math.max(0, 1 - (overdueOpenDemands.length / schoolDemands.length)) : 1; // % em dia

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

    // ---- CRITÉRIO 6: AVCB (AUTO DE VISTORIA DO CORPO DE BOMBEIROS) ----
    // Cruza o código FDE da escola com a planilha de mapeamento AVCB (mesma fonte da página "Mapeamento AVCB")
    const schoolFde = normalizeAvcbCode(school.fde_code);
    const avcbValidade = schoolFde ? avcbMap.get(schoolFde) : undefined;
    let avcbPct = 0.5; // Sem registro de AVCB encontrado: não pontua (nem ganha, nem perde)
    let avcbLabel = 'Sem AVCB';
    if (avcbValidade) {
      if (avcbValidade.getTime() >= now.getTime()) {
        avcbPct = 1; // AVCB válido: ganha ponto extra no pilar
        avcbLabel = 'AVCB Válido';
      } else {
        avcbPct = 0; // AVCB vencido: perde pontos no pilar
        avcbLabel = 'AVCB Vencido';
      }
    }

    // ---- CRITÉRIO 7: PENALIDADE PATRIMONIAL (VANDALISMO) ----
    const schoolOccurrences = allOcorrencias.filter((o: any) => o.school_id === school.id); // Conta os BOs
    // Cálculo do desconto: Quantidade de ocorrências X peso.
    // O Math.min trava para não passar do limite máximo configurado pelo admin
    const penalty = Math.min(
      currentWeights.penalty_max,
      schoolOccurrences.length * currentWeights.penalty_per_occurrence
    );

    // ---- REDISTRIBUIÇÃO DE PESO PARA ESCOLAS DISPENSADAS DO REGISTRO DE ÁGUA ----
    // Justiça do ranking: a escola dispensada não pode ganhar uma "nota grátis" no pilar de
    // Registo de Água enquanto a escola obrigada a registrar carrega o risco de perder pontos
    // ali todo dia. Em vez de dar 100% fixo com peso cheio (o que criava vantagem indevida),
    // o pilar é removido do cálculo da escola dispensada e seu peso é redistribuído
    // proporcionalmente entre os outros 5 pilares dela - ela ainda pode tirar nota 10, mas
    // deixa de "furar a fila" de quem realmente faz o registro diário.
    // Só sai do cálculo quem esteve dispensada a JANELA INTEIRA; dispensa
    // parcial já foi tratada acima reduzindo o denominador da frequência.
    const positiveKeys = ['water_reg', 'water_limit', 'demand_on_time', 'tree_management', 'zeladoria', 'avcb'] as const;
    const applicableKeys = fullyWaterExempt ? positiveKeys.filter(k => k !== 'water_reg') : positiveKeys;
    const applicableWeightSum = applicableKeys.reduce((acc, k) => acc + currentWeights[k], 0);
    const scaleFactor = applicableWeightSum > 0 ? 10 / applicableWeightSum : 0;
    const effectiveWeights = {
      water_reg: 0,
      water_limit: 0,
      demand_on_time: 0,
      tree_management: 0,
      zeladoria: 0,
      avcb: 0
    };
    applicableKeys.forEach(k => { effectiveWeights[k] = currentWeights[k] * scaleFactor; });

    // ---- FECHAMENTO MATEMÁTICO DA NOTA FINAL (GSU) ----
    // Cada porcentagem (0 a 1) é multiplicada por 10 e pelo peso EFETIVO (já redistribuído), somadas, e divididas por 10.
    let finalScore = (
      (waterRegPct * 10 * effectiveWeights.water_reg) +
      (waterEffPct * 10 * effectiveWeights.water_limit) +
      (demandPct * 10 * effectiveWeights.demand_on_time) +
      (treePct * 10 * effectiveWeights.tree_management) +
      (zeladoriaPct * 10 * effectiveWeights.zeladoria) +
      (avcbPct * 10 * effectiveWeights.avcb)
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
        avcb_status: avcbPct * 100,
        avcb_label: avcbLabel,
        zeladoria_status: zeladoriaPct * 100,
        patrimonial_penalty: penalty,
        water_exempt: fullyWaterExempt,
        weights: effectiveWeights
      },
      extras: {
        water_reg_days: schoolWaterReg.length,
        water_eff_days: schoolWaterEff.length,
        demand_total: schoolDemands.length,
        demand_overdue: overdueOpenDemands.length,
        manejo_autorizado: schoolManejo.some((m: any) => !!m.validade_autorizacao),
        zeladoria_concluida: schoolZeladoria.some((z: any) => z.ocupada && z.ocupada.trim().toUpperCase() === 'CONCLUÍDO')
      }
    };
  });

  // 4. Organiza do maior (b.score) para o menor (a.score) e preenche a chave position (1º, 2º, 3º...)
  const sortedRanking = ranking
    .sort((a, b) => b.score - a.score)
    .map((item, index) => ({ ...item, position: index + 1 }));

  return sortedRanking;
}

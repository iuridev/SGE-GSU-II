// Selos de Excelência: tipos das tabelas `selos` / `selos_escolas` e o
// registro das métricas que sugerem as escolas aptas a cada selo.
//
// Para criar uma categoria nova com sugestão automática: adicione o cálculo
// em METRICAS e cadastre o selo (pela tela ou por migration) apontando
// `metrica` para a chave. Selo sem métrica é de atribuição manual.
import { supabase } from './supabase';
import { fetchAcompanhamentoCSV } from './acompanhamentoObras';
import { fetchObrasSheet, matchSchool, normalizeStatus, type SheetSchool } from './obrasSheet';
import { calcularRanking, type SchoolRanking, type WeightConfig } from './rankingCalculo';

export interface Selo {
  id: string;
  slug: string;
  nome: string;
  descricao: string;
  icone: string;
  cor: string;
  formato: string;
  acabamento: string;
  metrica: string | null;
  criterio_minimo: number | null;
  ativo: boolean;
  ordem: number;
}

export interface SeloEscola {
  id: string;
  selo_id: string;
  school_id: string;
  ano: number;
  valor_metrica: number | null;
  detalhe_metrica: string | null;
  observacao: string | null;
  concedido_por: string | null;
  concedido_por_nome: string;
  concedido_em: string;
}

export interface ResultadoMetrica {
  valor: number;
  detalhe: string;
}

export interface MetricaSelo {
  label: string;
  // Texto do critério, ex.: "processo(s) no ano" → "mínimo de 1 processo(s) no ano"
  unidade: string;
  // Métrica de sim/não (ex.: AVCB válido): não tem mínimo ajustável, e este é
  // o texto do critério. O cálculo devolve valor 1 só para quem cumpre.
  criterioFixo?: string;
  // Métrica que retrata a situação de hoje (pilares do Ranking), sem histórico:
  // só sugere escolas quando o ano de referência é o ano corrente.
  somenteAnoCorrente?: boolean;
  calcular: (ano: number, schools: SheetSchool[]) => Promise<Map<string, ResultadoMetrica>>;
}

// Datas como número de dias (desde 1970), para contar semanas sem fuso horário.
function diaDeISO(iso: string): number | null {
  const m = iso?.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? Date.UTC(+m[1], +m[2] - 1, +m[3]) / 86400000 : null;
}

// dd/mm/aaaa (formato da planilha de Obras; aceita dia/mês com um dígito)
function diaDeBR(br: string | undefined): number | null {
  const m = br?.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  return m ? Date.UTC(+m[3], +m[2] - 1, +m[1]) / 86400000 : null;
}

// ── Pilares do Ranking de Escolas ──────────────────────────────────────
// Os percentuais de cada pilar não dependem dos pesos configurados no Ranking
// (os pesos só entram na nota final), então qualquer conjunto válido serve.
const PESOS_NEUTROS: WeightConfig = {
  water_reg: 1.7, water_limit: 1.7, demand_on_time: 1.7, tree_management: 1.6,
  zeladoria: 1.6, avcb: 1.7, penalty_per_occurrence: 0, penalty_max: 0,
};

// Vários selos usam o mesmo ranking: calcula uma vez e reaproveita por um minuto.
let rankingCache: { em: number; promessa: Promise<SchoolRanking[]> } | null = null;
function rankingAtual(): Promise<SchoolRanking[]> {
  if (!rankingCache || Date.now() - rankingCache.em > 60_000) {
    rankingCache = { em: Date.now(), promessa: calcularRanking(PESOS_NEUTROS) };
    rankingCache.promessa.catch(() => { rankingCache = null; });
  }
  return rankingCache.promessa;
}

// Monta uma métrica a partir do ranking: `avaliar` devolve o resultado da
// escola, ou null quando ela não concorre (ex.: dispensada, sem dados).
function metricaDoRanking(
  config: Pick<MetricaSelo, 'label' | 'unidade' | 'criterioFixo'>,
  avaliar: (escola: SchoolRanking) => ResultadoMetrica | null,
): MetricaSelo {
  return {
    ...config,
    somenteAnoCorrente: true,
    calcular: async (ano) => {
      const resultado = new Map<string, ResultadoMetrica>();
      if (ano !== new Date().getFullYear()) return resultado;
      (await rankingAtual()).forEach(escola => {
        const r = avaliar(escola);
        if (r) resultado.set(escola.id, r);
      });
      return resultado;
    },
  };
}

export const METRICAS: Record<string, MetricaSelo> = {
  // Processos de Doação de Material Permanente abertos pela escola no ano
  // (tabela asset_processes; é o processo que regulariza os itens a incorporar).
  patrimonio_doacao_mat_permanente: {
    label: 'Processos de Doação de Material Permanente',
    unidade: 'processo(s) no ano',
    calcular: async (ano) => {
      const { data, error } = await (supabase as any)
        .from('asset_processes')
        .select('school_id, status, process_date')
        .eq('type', 'DOACAO_MAT_PERMANENTE')
        .gte('process_date', `${ano}-01-01`)
        .lte('process_date', `${ano}-12-31`);
      if (error) throw error;

      const porEscola = new Map<string, { total: number; concluidos: number }>();
      (data || []).forEach((p: any) => {
        if (!p.school_id) return;
        const atual = porEscola.get(p.school_id) || { total: 0, concluidos: 0 };
        atual.total++;
        if (p.status === 'CONCLUÍDO') atual.concluidos++;
        porEscola.set(p.school_id, atual);
      });

      const resultado = new Map<string, ResultadoMetrica>();
      porEscola.forEach((v, schoolId) => {
        resultado.set(schoolId, {
          valor: v.total,
          detalhe: `${v.total} processo(s) em ${ano}, ${v.concluidos} concluído(s)`,
        });
      });
      return resultado;
    },
  },

  // Semanas do prazo da obra em que a escola registrou o acompanhamento
  // semanal. Ex.: obra com prazo de 90 dias tem 12 semanas; com critério de
  // 70% a escola precisa de registro em pelo menos 9 delas.
  //  - O prazo vem da planilha de Obras (coluna PRAZO (DIAS); na falta dela,
  //    previsão de término menos data de início).
  //  - A obra conta para o selo do ano em que o prazo termina.
  //  - Vários registros na mesma semana contam como uma semana só.
  //  - Semanas anteriores ao primeiro registro do formulário (quando ele ainda
  //    não existia) não são cobradas.
  //  - Obra paralisada ou ainda não iniciada fica de fora.
  //  - Escola com mais de uma obra no ano: somam-se as semanas de todas.
  // A planilha de acompanhamento só traz o nome da escola, então o vínculo é
  // por casamento de nome.
  obras_acompanhamento: {
    label: 'Acompanhamento de Obras – semanas registradas no prazo',
    unidade: '% das semanas do prazo da obra com registro',
    calcular: async (ano, schools) => {
      const [registros, obras] = await Promise.all([fetchAcompanhamentoCSV(), fetchObrasSheet(schools)]);

      const datasPorEscola = new Map<string, number[]>();
      let inicioFormulario = Infinity;
      registros.forEach(r => {
        const dia = diaDeISO(r.dataISO);
        if (dia === null) return;
        if (dia < inicioFormulario) inicioFormulario = dia;
        const escola = matchSchool(r.escola, schools);
        if (!escola) return;
        const lista = datasPorEscola.get(escola.id) || [];
        lista.push(dia);
        datasPorEscola.set(escola.id, lista);
      });

      const porEscola = new Map<string, { semanas: number; registradas: number; obras: number }>();
      obras.forEach(obra => {
        if (!obra.matchedSchoolId) return;
        const status = normalizeStatus(obra.status);
        if (status === 'PARALISADO' || status === 'OUTRO') return;

        const inicio = diaDeBR(obra.dataInicio);
        if (inicio === null) return;
        const prazo = parseInt((obra.prazoDias || '').replace(/\D/g, ''), 10);
        const termino = diaDeBR(obra.previsaoTermino);
        const fim = prazo > 0 ? inicio + prazo : termino;
        if (fim === null || new Date(fim * 86400000).getUTCFullYear() !== ano) return;

        const inicioCobrado = Math.max(inicio, inicioFormulario);
        if (fim - inicioCobrado < 7) return;
        const semanas = Math.floor((fim - inicioCobrado) / 7);

        const comRegistro = new Set<number>();
        (datasPorEscola.get(obra.matchedSchoolId) || []).forEach(dia => {
          if (dia < inicioCobrado || dia > fim) return;
          comRegistro.add(Math.min(semanas - 1, Math.floor((dia - inicioCobrado) / 7)));
        });

        const atual = porEscola.get(obra.matchedSchoolId) || { semanas: 0, registradas: 0, obras: 0 };
        atual.semanas += semanas;
        atual.registradas += comRegistro.size;
        atual.obras++;
        porEscola.set(obra.matchedSchoolId, atual);
      });

      const resultado = new Map<string, ResultadoMetrica>();
      porEscola.forEach((v, schoolId) => {
        const pct = Math.round((v.registradas / v.semanas) * 100);
        resultado.set(schoolId, {
          valor: pct,
          detalhe: `${v.registradas} de ${v.semanas} semanas com registro (${pct}%)${v.obras > 1 ? ` em ${v.obras} obras` : ''}`,
        });
      });
      return resultado;
    },
  },

  // Frequência de lançamento da leitura de água (últimos 12 meses). Escola
  // dispensada do registro não concorre.
  ranking_agua_registro: metricaDoRanking(
    { label: 'Ranking – Registro de Água', unidade: '% de dias com leitura de água registrada' },
    e => e.stats.water_exempt ? null : {
      valor: Math.round(e.stats.water_compliance),
      detalhe: `${Math.round(e.stats.water_compliance)}% de frequência de leitura (${e.extras.water_reg_days} lançamentos)`,
    },
  ),

  // Dias dentro do teto de consumo (últimos 3 meses). O percentual de dias
  // sozinho engana: a escola pode estourar muito em poucos dias, ou ter muitos
  // registros sem consumo, e ainda marcar perto de 100%. Por isso só concorre
  // quem também fechou o período com o consumo total dentro do limite total.
  // Sem consumo registrado no período também não há o que reconhecer.
  ranking_agua_eficiencia: metricaDoRanking(
    { label: 'Ranking – Eficiência Hídrica', unidade: '% dos dias dentro do teto, com o consumo total do período dentro do limite' },
    e => {
      const { water_eff_consumo: consumo, water_eff_limite: limite } = e.extras;
      if (limite <= 0 || consumo > limite) return null;
      return {
        valor: Math.round(e.stats.water_efficiency),
        detalhe: `${Math.round(e.stats.water_efficiency)}% dos dias dentro do teto · ${consumo.toFixed(1)} m³ consumidos para limite de ${limite.toFixed(1)} m³ em 3 meses`,
      };
    },
  ),

  // Demandas sem atraso. Escola que nunca recebeu demanda não concorre.
  ranking_demandas: metricaDoRanking(
    { label: 'Ranking – Demandas no Prazo', unidade: '% das demandas em dia' },
    e => e.extras.demand_total === 0 ? null : {
      valor: Math.round(e.stats.demand_compliance),
      detalhe: `${Math.round(e.stats.demand_compliance)}% em dia (${e.extras.demand_total} demandas, ${e.extras.demand_overdue} vencidas em aberto)`,
    },
  ),

  ranking_manejo: metricaDoRanking(
    { label: 'Ranking – Manejo Arbóreo', unidade: '', criterioFixo: 'Autorização de manejo arbóreo com validade registrada' },
    e => e.extras.manejo_autorizado ? { valor: 1, detalhe: 'Autorização de manejo com validade registrada' } : null,
  ),

  ranking_zeladoria: metricaDoRanking(
    { label: 'Ranking – Zeladoria', unidade: '', criterioFixo: 'Processo de zeladoria concluído' },
    e => e.extras.zeladoria_concluida ? { valor: 1, detalhe: 'Processo de zeladoria concluído' } : null,
  ),

  ranking_avcb: metricaDoRanking(
    { label: 'Ranking – AVCB', unidade: '', criterioFixo: 'AVCB dentro da validade' },
    e => e.stats.avcb_status === 100 ? { valor: 1, detalhe: 'AVCB dentro da validade' } : null,
  ),
};

export function textoCriterio(selo: Selo): string {
  const metrica = selo.metrica ? METRICAS[selo.metrica] : undefined;
  if (!metrica) return 'Atribuição pela equipe da Regional';
  if (metrica.criterioFixo) return metrica.criterioFixo;
  return `Mínimo de ${selo.criterio_minimo ?? 1} ${metrica.unidade}`;
}

// Dos selos que a escola já tem no ano, quais ela corre o risco de perder:
// pela métrica de hoje, o índice está abaixo do critério do selo. Devolve
// selo → situação atual da escola. Selo manual nunca entra, e uma métrica que
// falhe ao calcular é ignorada (na dúvida, não acusa risco).
export async function selosEmRisco(selosDaEscola: Selo[], schoolId: string, ano: number): Promise<Map<string, string>> {
  const emRisco = new Map<string, string>();
  const avaliaveis = selosDaEscola.filter(s => {
    const metrica = s.metrica ? METRICAS[s.metrica] : undefined;
    return !!metrica && !(metrica.somenteAnoCorrente && ano !== new Date().getFullYear());
  });
  if (avaliaveis.length === 0) return emRisco;

  const { data: schools } = await (supabase as any).from('schools').select('id, name');
  const chaves = Array.from(new Set(avaliaveis.map(s => s.metrica as string)));
  const calculos = await Promise.allSettled(chaves.map(c => METRICAS[c].calcular(ano, schools || [])));

  avaliaveis.forEach(selo => {
    const calculo = calculos[chaves.indexOf(selo.metrica as string)];
    if (calculo.status !== 'fulfilled') return;
    const atual = calculo.value.get(schoolId);
    if ((atual?.valor ?? 0) < (selo.criterio_minimo ?? 1)) {
      emRisco.set(selo.id, atual?.detalhe || 'sua escola não atende mais às condições do selo');
    }
  });
  return emRisco;
}

// BI Predial: resultado das vistorias prediais realizadas pela FDE.
// A planilha (aba BI-FDE) tem uma linha por vistoria e é a única fonte destes
// dados. O sistema só LÊ: nada é copiado para o banco, então não há importação
// manual nem limite de linhas por consulta.
import { parseCSV } from './obrasSheet';
import { normalizarCie, normalizarTexto } from './fdeEnvios';

const PLANILHA_ID = '1_mI7vCwlM_y3kJzWp_-dwYX2qtsaeCDf0iTcj2kYze8';
const ABA = 'BI-FDE';
export const PLANILHA_VISTORIAS_URL = `https://docs.google.com/spreadsheets/d/${PLANILHA_ID}/edit`;
// Endpoint gviz: é o que devolve CORS liberado para leitura direto do navegador.
const CSV_URL = `https://docs.google.com/spreadsheets/d/${PLANILHA_ID}/gviz/tq?tqx=out:csv&headers=1&sheet=${encodeURIComponent(ABA)}`;

const CACHE_MS = 5 * 60 * 1000;
const TEMPO_LIMITE_MS = 30 * 1000;

export type Conceito = 'MB' | 'B' | 'R' | 'MR';
export const CONCEITOS: Conceito[] = ['MB', 'B', 'R', 'MR'];
export const CONCEITO_NOME: Record<Conceito, string> = {
  MB: 'Muito bom',
  B: 'Bom',
  R: 'Ruim',
  MR: 'Muito ruim',
};

const AMBIENTE_NOME: Record<string, string> = {
  A1: 'Salas de aula',
  A2: 'Ambientes pedagógicos',
  A3BF: 'Banheiro feminino',
  A3BM: 'Banheiro masculino',
  A4: 'Ambientes de tecnologia',
  A5: 'Ambientes administrativos',
  A6: 'Cozinha e refeitório',
  A7: 'Áreas gerais',
};

const FATOR_NOME: Record<string, string> = {
  CONS: 'Conservação',
  MOB: 'Mobiliário',
  LIMP: 'Limpeza',
  REPO: 'Reposição de produtos',
  PREPA: 'Preparo de alimentos',
  QUALI: 'Qualidade do preparo',
  ARMZ: 'Armazenagem',
  EQUIP: 'Equipamentos',
  REFEIT: 'Refeitório',
  'A VERDES': 'Áreas verdes',
  JARDINAG: 'Jardinagem',
  ACESSO: 'Acessos',
  DEDET: 'Dedetização',
  PINT: 'Pintura',
  'LIMP EXT': 'Limpeza externa',
};

export interface ItemAvaliado {
  coluna: string;
  ambiente: string;
  ambienteNome: string;
  fator: string;
}

export interface Vistoria {
  id: string;
  data: string; // ISO yyyy-mm-dd
  cie: string; // sem zeros à esquerda
  escola: string;
  nota: number;
  conceitos: Record<string, Conceito>;
  pontosNegativos: number;
  textoNegativo: string;
  pontosPositivos: number;
  textoPositivo: string;
}

export interface BaseVistorias {
  vistorias: Vistoria[]; // da mais antiga para a mais recente
  itens: ItemAvaliado[];
  linhasIgnoradas: number;
  lidoEm: Date;
}

// ── Leitura ─────────────────────────────────────────────────────────────────

function dataBrParaIso(s: string): string | null {
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (!m) return null;
  return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
}

function paraNumero(s: string): number | null {
  if (!s.trim()) return null;
  const n = Number(s.replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

// Colunas de avaliação são lidas pelo padrão do cabeçalho ("A3Bf Cons"), então
// um item novo incluído pela FDE aparece sem precisar alterar o sistema.
function lerItem(coluna: string): ItemAvaliado | null {
  const m = coluna.trim().match(/^(A\d+[A-Za-z]*)\s+(.+)$/);
  if (!m) return null;
  const ambiente = m[1].toUpperCase();
  return {
    coluna: coluna.trim(),
    ambiente,
    ambienteNome: AMBIENTE_NOME[ambiente] ?? m[1],
    fator: FATOR_NOME[normalizarTexto(m[2])] ?? m[2],
  };
}

export function interpretarCsv(csv: string, lidoEm = new Date()): BaseVistorias {
  const linhas = parseCSV(csv.replace(/^\uFEFF/, ''));
  const cabecalho = (linhas[0] ?? []).map(normalizarTexto);
  const coluna = (nome: string) => cabecalho.indexOf(nome);

  const iData = coluna('DATA');
  const iCie = coluna('COD. UE');
  const iEscola = coluna('UNIDADE DE ENSINO');
  const iNota = coluna('NOTA');
  if ([iData, iCie, iEscola, iNota].includes(-1)) {
    throw new Error(`A aba ${ABA} mudou de formato: faltam as colunas Data, Cód. UE, Unidade de Ensino ou Nota.`);
  }
  const iPn = coluna('PN PONT');
  const iPnTexto = coluna('PN TEXTO');
  const iPp = coluna('PP PONT');
  const iPpTexto = coluna('PP TEXTO');

  const colunasItem = (linhas[0] ?? []).flatMap((nome, indice) => {
    const item = lerItem(nome);
    return item ? [{ indice, item }] : [];
  });

  const vistorias: Vistoria[] = [];
  const itensComConceito = new Set<string>();
  let linhasIgnoradas = 0;

  linhas.slice(1).forEach((l, n) => {
    if (l.every(c => !c)) return;
    const data = dataBrParaIso(l[iData] ?? '');
    const cie = normalizarCie(l[iCie]);
    const nota = paraNumero(l[iNota] ?? '');
    if (!data || !cie || nota === null) {
      linhasIgnoradas++;
      return;
    }

    // SIM/NÃO e N/A não são conceitos: ficam fora de contagens e percentuais.
    const conceitos: Record<string, Conceito> = {};
    colunasItem.forEach(({ indice, item }) => {
      const valor = (l[indice] ?? '').toUpperCase() as Conceito;
      if (CONCEITOS.includes(valor)) {
        conceitos[item.coluna] = valor;
        itensComConceito.add(item.coluna);
      }
    });

    vistorias.push({
      id: `${n}-${cie}-${data}`,
      data,
      cie,
      escola: (l[iEscola] ?? '').replace(/^EE\s+/i, ''),
      nota,
      conceitos,
      pontosNegativos: paraNumero(l[iPn] ?? '') ?? 0,
      textoNegativo: l[iPnTexto] ?? '',
      pontosPositivos: paraNumero(l[iPp] ?? '') ?? 0,
      textoPositivo: l[iPpTexto] ?? '',
    });
  });

  vistorias.sort((a, b) => a.data.localeCompare(b.data));

  return {
    vistorias,
    itens: colunasItem.map(c => c.item).filter(i => itensComConceito.has(i.coluna)),
    linhasIgnoradas,
    lidoEm,
  };
}

async function baixarCsv(): Promise<string> {
  const controle = new AbortController();
  const limite = setTimeout(() => controle.abort(), TEMPO_LIMITE_MS);
  try {
    const res = await fetch(CSV_URL, { cache: 'no-store', signal: controle.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const texto = await res.text();
    // Planilha sem acesso por link responde com a página de login, não com CSV.
    if (texto.trimStart().startsWith('<')) throw new Error('resposta não é CSV');
    return texto;
  } catch {
    throw new Error('Não foi possível ler a planilha da FDE. Verifique a conexão e se ela continua compartilhada por link.');
  } finally {
    clearTimeout(limite);
  }
}

let cache: { base: BaseVistorias; em: number } | null = null;
let emAndamento: Promise<BaseVistorias> | null = null;

export function carregarVistorias(forcar = false): Promise<BaseVistorias> {
  if (!forcar && cache && Date.now() - cache.em < CACHE_MS) return Promise.resolve(cache.base);
  if (emAndamento) return emAndamento;

  emAndamento = baixarCsv()
    .then(csv => {
      const base = interpretarCsv(csv);
      cache = { base, em: Date.now() };
      return base;
    })
    .finally(() => {
      emAndamento = null;
    });
  return emAndamento;
}

// ── Métricas ────────────────────────────────────────────────────────────────

function media(valores: number[]): number | null {
  if (!valores.length) return null;
  return Math.round((valores.reduce((s, v) => s + v, 0) / valores.length) * 10) / 10;
}

const MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

function chaveDoMes(ano: number, mes: number): string {
  return `${ano}-${String(mes + 1).padStart(2, '0')}`;
}

// Primeiro dia do período de N meses que termina no mês de `hoje` (inclusive).
export function inicioDoPeriodo(meses: number, hoje = new Date()): string {
  const d = new Date(hoje.getFullYear(), hoje.getMonth() - meses + 1, 1);
  return `${chaveDoMes(d.getFullYear(), d.getMonth())}-01`;
}

export interface PontoMensal {
  mes: string;
  rotulo: string;
  nota: number | null;
  vistorias: number;
}

// Meses sem vistoria entram com nota nula para o eixo representar o tempo real.
export function evolucaoMensal(vistorias: Vistoria[]): PontoMensal[] {
  if (!vistorias.length) return [];
  const porMes = new Map<string, number[]>();
  vistorias.forEach(v => {
    const mes = v.data.slice(0, 7);
    porMes.set(mes, [...(porMes.get(mes) ?? []), v.nota]);
  });

  const [anoIni, mesIni] = vistorias[0].data.split('-').map(Number);
  const [anoFim, mesFim] = vistorias[vistorias.length - 1].data.split('-').map(Number);
  const pontos: PontoMensal[] = [];
  for (let ano = anoIni, mes = mesIni - 1; ano < anoFim || (ano === anoFim && mes <= mesFim - 1); mes === 11 ? (ano++, mes = 0) : mes++) {
    const chave = chaveDoMes(ano, mes);
    const notas = porMes.get(chave) ?? [];
    pontos.push({ mes: chave, rotulo: `${MESES[mes]}/${String(ano).slice(2)}`, nota: media(notas), vistorias: notas.length });
  }
  return pontos;
}

export type Contagem = Record<Conceito, number>;

function contar(vistorias: Vistoria[], colunas: string[]): Contagem {
  const total: Contagem = { MB: 0, B: 0, R: 0, MR: 0 };
  vistorias.forEach(v => {
    colunas.forEach(c => {
      const conceito = v.conceitos[c];
      if (conceito) total[conceito]++;
    });
  });
  return total;
}

function totalDe(c: Contagem): number {
  return c.MB + c.B + c.R + c.MR;
}

function percentual(parte: number, total: number): number {
  return total ? Math.round((parte / total) * 1000) / 10 : 0;
}

export interface LinhaAmbiente {
  codigo: string;
  nome: string;
  total: number;
  contagem: Contagem;
  MB: number;
  B: number;
  R: number;
  MR: number;
}

export function distribuicaoPorAmbiente(vistorias: Vistoria[], itens: ItemAvaliado[]): LinhaAmbiente[] {
  const ambientes = [...new Set(itens.map(i => i.ambiente))];
  return ambientes.flatMap(codigo => {
    const doAmbiente = itens.filter(i => i.ambiente === codigo);
    const contagem = contar(vistorias, doAmbiente.map(i => i.coluna));
    const total = totalDe(contagem);
    if (!total) return [];
    return [{
      codigo,
      nome: doAmbiente[0].ambienteNome,
      total,
      contagem,
      MB: percentual(contagem.MB, total),
      B: percentual(contagem.B, total),
      R: percentual(contagem.R, total),
      MR: percentual(contagem.MR, total),
    }];
  });
}

export interface LinhaItem {
  item: ItemAvaliado;
  total: number;
  contagem: Contagem;
  percentualCritico: number; // % de R + MR
}

// Do item mais problemático para o menos.
export function desempenhoPorItem(vistorias: Vistoria[], itens: ItemAvaliado[]): LinhaItem[] {
  return itens
    .map(item => {
      const contagem = contar(vistorias, [item.coluna]);
      const total = totalDe(contagem);
      return { item, total, contagem, percentualCritico: percentual(contagem.R + contagem.MR, total) };
    })
    .filter(l => l.total > 0)
    .sort((a, b) => b.percentualCritico - a.percentualCritico || b.contagem.MR - a.contagem.MR);
}

export interface ResumoEscola {
  cie: string;
  escola: string;
  vistorias: number;
  media: number;
  ultimaData: string;
  ultimaNota: number;
  variacao: number | null; // última nota menos a nota da vistoria anterior
}

export function resumoPorEscola(vistorias: Vistoria[]): ResumoEscola[] {
  const grupos = new Map<string, Vistoria[]>();
  vistorias.forEach(v => grupos.set(v.cie, [...(grupos.get(v.cie) ?? []), v]));

  return [...grupos.entries()]
    .map(([cie, lista]) => {
      const ultima = lista[lista.length - 1];
      const anterior = lista[lista.length - 2];
      return {
        cie,
        escola: ultima.escola,
        vistorias: lista.length,
        media: media(lista.map(v => v.nota)) ?? 0,
        ultimaData: ultima.data,
        ultimaNota: ultima.nota,
        variacao: anterior ? ultima.nota - anterior.nota : null,
      };
    })
    .sort((a, b) => a.ultimaNota - b.ultimaNota);
}

export function notaMedia(vistorias: Vistoria[]): number | null {
  return media(vistorias.map(v => v.nota));
}

export function apontamentos(vistoria: Vistoria, itens: ItemAvaliado[]): { item: ItemAvaliado; conceito: Conceito }[] {
  return itens.flatMap(item => {
    const conceito = vistoria.conceitos[item.coluna];
    return conceito === 'R' || conceito === 'MR' ? [{ item, conceito }] : [];
  });
}

export function escolasDisponiveis(vistorias: Vistoria[]): { cie: string; escola: string }[] {
  const porCie = new Map<string, string>();
  vistorias.forEach(v => porCie.set(v.cie, v.escola));
  return [...porCie.entries()]
    .map(([cie, escola]) => ({ cie, escola }))
    .sort((a, b) => a.escola.localeCompare(b.escola, 'pt-BR'));
}

export function formatarData(iso: string): string {
  const [ano, mes, dia] = iso.split('-');
  return `${dia}/${mes}/${ano}`;
}

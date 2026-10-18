// Regularização de Imóveis: métricas sobre a planilha que o servidor responsável
// alimenta à mão (uma linha por unidade escolar, com matrículas/transcrições do
// terreno, ofícios enviados ao Cartório de Registro de Imóveis e o ano da última
// atualização da certidão). O sistema só LÊ a planilha — nunca escreve nela.
//
// A planilha não tem coluna de data por movimentação, então a evolução mês a mês
// vem de "fotografias" diárias gravadas em `regularizacao_imoveis_snapshots`
// (ver migration) sempre que alguém abre a página.
import { parseCSV } from './obrasSheet';

export const PLANILHA_ID = '1M16wgSQM1OErkbMArFUmEzGveTrsm1252JnRFpC2D3A';
export const PLANILHA_URL = `https://docs.google.com/spreadsheets/d/${PLANILHA_ID}/edit`;
// Endpoint gviz: é o que devolve CORS liberado para leitura direto do navegador
// (o /export?format=csv redireciona para um domínio sem CORS).
export const PLANILHA_CSV_URL = `https://docs.google.com/spreadsheets/d/${PLANILHA_ID}/gviz/tq?tqx=out:csv`;

// Ano a partir do qual uma certidão conta como "atualizada" no ciclo atual de
// regularização. Ajustar quando começar um novo ciclo de atualização.
export const ANO_CICLO_ATUAL = 2026;

export type StatusImovel =
  | 'atualizada'
  | 'desatualizada'
  | 'em_andamento'
  | 'aguardando_2cri'
  | 'nao_localizada'
  | 'nao_iniciada';

// Ordem fixa (do mais avançado ao menos) — é a ordem das pilhas nos gráficos
// e das legendas; as cores foram validadas para daltonismo nesta sequência.
export const STATUS_ORDEM: StatusImovel[] = [
  'atualizada', 'desatualizada', 'em_andamento', 'aguardando_2cri', 'nao_localizada', 'nao_iniciada',
];

export const STATUS_INFO: Record<StatusImovel, { label: string; descricao: string; cor: string }> = {
  atualizada: { label: 'Certidão atualizada', descricao: `Matrícula/transcrição com atualização em ${ANO_CICLO_ATUAL} ou depois`, cor: '#1baf7a' },
  desatualizada: { label: 'Certidão desatualizada', descricao: `Documento identificado, última atualização antes de ${ANO_CICLO_ATUAL}`, cor: '#eda100' },
  em_andamento: { label: 'Em andamento', descricao: 'Ofício emitido ou documento identificado, sem ano de atualização', cor: '#2a78d6' },
  aguardando_2cri: { label: 'Aguardando 2º CRI', descricao: 'Não consta no 1º CRI — depende de pesquisa no 2º Cartório', cor: '#eb6834' },
  nao_localizada: { label: 'Não localizada', descricao: 'Registro não localizado pelo cartório', cor: '#4a3aa7' },
  nao_iniciada: { label: 'Não iniciada', descricao: 'Nenhuma informação lançada na planilha ainda', cor: '#a8a7a0' },
};

// ── Situação por cartório ───────────────────────────────────────────────────
// Guarulhos tem dois Cartórios de Registro de Imóveis. Na planilha, o 1º CRI é
// o padrão (os ofícios "xxxx/26 RI" são respostas dele; "NÃO TEM 1º CRI" é a
// resposta negativa), e o 2º CRI aparece nas colunas "SOLICITAÇÃO 2º CRI"
// ("SOLICITAR" / "OK - OF") ou em registros marcados como "2º CRI"/"2º CARTÓRIO".
// A atribuição é feita linha a linha: uma unidade pode ter linhas nos dois.

export type StatusCri1 =
  | 'atualizada'
  | 'desatualizada'
  | 'em_pesquisa'
  | 'nao_consta'
  | 'nao_localizado'
  | 'nao_pesquisado';

export type StatusCri2 =
  | 'atualizada'
  | 'desatualizada'
  | 'aguardando'
  | 'a_solicitar'
  | 'nao_se_aplica';

// Mesma ordem/cores da situação geral (paleta validada nessa sequência).
export const STATUS_CRI1_ORDEM: StatusCri1[] = [
  'atualizada', 'desatualizada', 'em_pesquisa', 'nao_consta', 'nao_localizado', 'nao_pesquisado',
];
export const STATUS_CRI2_ORDEM: StatusCri2[] = [
  'atualizada', 'desatualizada', 'aguardando', 'a_solicitar', 'nao_se_aplica',
];

export const STATUS_CRI1_INFO: Record<StatusCri1, { label: string; descricao: string; cor: string }> = {
  atualizada: { label: 'Certidão atualizada', descricao: `Registro no 1º CRI com certidão de ${ANO_CICLO_ATUAL} ou depois`, cor: '#1baf7a' },
  desatualizada: { label: 'Certidão desatualizada', descricao: `Registro no 1º CRI com certidão anterior a ${ANO_CICLO_ATUAL}`, cor: '#eda100' },
  em_pesquisa: { label: 'Em pesquisa', descricao: 'Ofício emitido ou registro identificado, sem ano da certidão', cor: '#2a78d6' },
  nao_consta: { label: 'Não consta no 1º CRI', descricao: 'O 1º CRI respondeu que não há registro — imóvel encaminhado ao 2º CRI', cor: '#eb6834' },
  nao_localizado: { label: 'Não localizado', descricao: 'Registro não localizado pelo 1º CRI', cor: '#4a3aa7' },
  nao_pesquisado: { label: 'Não pesquisado', descricao: 'Nenhuma informação do 1º CRI lançada ainda', cor: '#a8a7a0' },
};

export const STATUS_CRI2_INFO: Record<StatusCri2, { label: string; descricao: string; cor: string }> = {
  atualizada: { label: 'Certidão atualizada', descricao: `Registro no 2º CRI com certidão de ${ANO_CICLO_ATUAL} ou depois`, cor: '#1baf7a' },
  desatualizada: { label: 'Certidão desatualizada', descricao: `Registro no 2º CRI com certidão anterior a ${ANO_CICLO_ATUAL}`, cor: '#eda100' },
  aguardando: { label: 'Aguardando certidão', descricao: 'Solicitação enviada ao 2º CRI (ou registro identificado), sem certidão ainda', cor: '#2a78d6' },
  a_solicitar: { label: 'A solicitar', descricao: 'Não consta no 1º CRI e a solicitação ao 2º CRI ainda não foi feita', cor: '#eb6834' },
  nao_se_aplica: { label: 'Sem demanda', descricao: 'Unidade sem pendência no 2º CRI', cor: '#a8a7a0' },
};

export interface DadosCartorio {
  documentos: string[];
  matriculas: string[];
  transcricoes: string[];
  outrosRegistros: string[];
  oficios: string[];
  anos: number[];
}

export interface ImovelEscola {
  chave: string;
  numero: string;
  escola: string;
  oficiosUre: string[];
  documentos: string[];
  matriculas: string[];
  transcricoes: string[];
  outrosRegistros: string[];
  oficiosCri: string[];
  anosAtualizacao: number[];
  proprietarias: string[];
  semRegistro1Cri: boolean;
  solicitar2Cri: boolean;
  solicitado2Cri: boolean;
  atualizacoesSei: string[];
  status: StatusImovel;
  cri1: DadosCartorio & { status: StatusCri1 };
  cri2: DadosCartorio & { status: StatusCri2 };
}

export interface ResumoCartorio<S extends string> {
  // Unidades com alguma demanda neste cartório (exclui "não pesquisado"/"sem demanda").
  unidades: number;
  porStatus: Record<S, number>;
  matriculas: number;
  transcricoes: number;
  oficios: number;
}

export interface ResumoRegularizacao {
  total: number;
  porStatus: Record<StatusImovel, number>;
  matriculas: number;
  transcricoes: number;
  oficiosUre: number;
  oficiosCri: number;
  solicitacoes2CriPendentes: number;
  solicitacoes2CriFeitas: number;
  // Ausentes nas fotografias gravadas antes da separação por cartório (out/2026).
  cri1?: ResumoCartorio<StatusCri1>;
  cri2?: ResumoCartorio<StatusCri2>;
}

export type ResumoCompleto = ResumoRegularizacao & Required<Pick<ResumoRegularizacao, 'cri1' | 'cri2'>>;

export interface Snapshot {
  data: string; // yyyy-mm-dd
  resumo: ResumoRegularizacao;
  por_escola: Record<string, { escola: string; status: StatusImovel; cri1?: StatusCri1; cri2?: StatusCri2 }>;
}

export function normalizar(txt: string): string {
  return (txt || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toUpperCase().replace(/\s+/g, ' ').trim();
}

const vazio = (v: string | undefined) => !v || !v.trim();

// Localiza as colunas pelo cabeçalho (tolerante a colunas novas inseridas),
// com as posições atuais da planilha como fallback. "SOLICITAÇÃO 2º CRI"
// aparece duas vezes: a primeira é o "SOLICITAR" (a fazer), a segunda o
// "OK - OF" (já solicitado).
function mapearColunas(cabecalho: string[]) {
  const norm = cabecalho.map(normalizar);
  const primeira = (pred: (h: string) => boolean, fallback: number) => {
    const i = norm.findIndex(pred);
    return i >= 0 ? i : fallback;
  };
  const todas = (pred: (h: string) => boolean) => norm.map((h, i) => (pred(h) ? i : -1)).filter(i => i >= 0);
  const sol2 = todas(h => h.includes('SOLICITACAO') && h.includes('CRI'));
  return {
    numero: primeira(h => h === 'Nº' || h === 'N' || h === 'NO', 0),
    escola: primeira(h => h.includes('ESCOLA'), 1),
    oficioUre: primeira(h => h.includes('OFICIO') && h.includes('URE'), 2),
    documentos: primeira(h => h.includes('MATRICULA') || h.includes('TRANSCRI'), 3),
    solicitar2Cri: sol2[0] ?? 5,
    oficioCri: primeira(h => h.includes('OFICIO') && h.includes('CRI'), 6),
    atualizacao: primeira(h => h === 'ATUALIZACAO', 7),
    proprietaria: primeira(h => h.includes('PROPRIET'), 8),
    solicitado2Cri: sol2.length > 1 ? sol2[sol2.length - 1] : 9,
    sei: primeira(h => h.includes('SEI'), 10),
  };
}

// Extrai números de matrícula/transcrição de textos livres como
// "MATRICULA 15.536 - TRANSCRIÇÃO 17.065 - 29.490" ou "2º CRI - 20.380/53.684".
// Cada número herda o último tipo citado antes dele; "1º"/"2º" (cartório) são
// ignorados.
export function extrairRegistros(texto: string): { matriculas: string[]; transcricoes: string[]; outros: string[] } {
  const res = { matriculas: [] as string[], transcricoes: [] as string[], outros: [] as string[] };
  const t = normalizar(texto);
  if (!t || t.includes('NAO TEM')) return res;
  let tipo: 'matriculas' | 'transcricoes' | 'outros' = 'matriculas';
  const re = /(MATRIC\w*|TRANSC?\w*|INSCRI\w*)|(\d{1,3}(?:\.\d{3})+|\d+)(?![º°O\d])/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(t))) {
    if (m[1]) {
      tipo = m[1].startsWith('MATRIC') ? 'matriculas' : m[1].startsWith('TRANS') ? 'transcricoes' : 'outros';
    } else if (m[2]) {
      // "Nº CRI" escrito como "2O CRI" já foi excluído pelo lookahead; aqui
      // descarta sobras de ano solto (ex.: "/2019") que não são registros.
      res[tipo].push(m[2]);
    }
  }
  return res;
}

export function normalizarProprietaria(txt: string): string[] {
  const t = normalizar(txt);
  if (!t) return [];
  const out = new Set<string>();
  if (t.includes('NAO LOCALIZ')) out.add('Não localizada');
  if (t.includes('PMG') || t.includes('PREFEITURA')) out.add('Prefeitura (PMG)');
  if (t.includes('FAZENDA')) out.add('Fazenda do Estado');
  if (t.includes('CDH')) out.add('CDHU');
  if (t.includes('PARTICULAR')) out.add('Particular');
  if (t.includes('DERSA')) out.add('DERSA');
  if (out.size === 0) out.add(txt.trim());
  return [...out];
}

// Linha pertence ao 2º CRI quando o texto do registro cita o 2º cartório
// ("2º CRI - 20.380", "MATRICULA 309 - 2º CARTORIO"); qualquer outra é do 1º.
export function cartorioDoTexto(texto: string): 1 | 2 {
  return /\b2\s*[º°O]?\s*(CRI\b|CARTORIO|OFICIAL|RI\b)/.test(normalizar(texto)) ? 2 : 1;
}

const temRegistro = (d: DadosCartorio) => d.matriculas.length + d.transcricoes.length + d.outrosRegistros.length > 0;

export function classificarCri1(d: DadosCartorio, o: { semRegistro: boolean; naoLocalizado: boolean; registroNo2: boolean; oficioUre: boolean }): StatusCri1 {
  if (temRegistro(d) && d.anos.some(a => a >= ANO_CICLO_ATUAL)) return 'atualizada';
  if (o.naoLocalizado) return 'nao_localizado';
  if (temRegistro(d) && d.anos.length > 0) return 'desatualizada';
  if (o.semRegistro || (o.registroNo2 && !temRegistro(d))) return 'nao_consta';
  if (temRegistro(d) || d.oficios.length > 0 || d.documentos.length > 0 || o.oficioUre) return 'em_pesquisa';
  return 'nao_pesquisado';
}

export function classificarCri2(d: DadosCartorio, o: { precisa: boolean; solicitado: boolean }): StatusCri2 {
  if (temRegistro(d) && d.anos.some(a => a >= ANO_CICLO_ATUAL)) return 'atualizada';
  if (temRegistro(d) && d.anos.length > 0) return 'desatualizada';
  if (temRegistro(d) || o.solicitado) return 'aguardando';
  if (o.precisa) return 'a_solicitar';
  return 'nao_se_aplica';
}

function classificar(e: Omit<ImovelEscola, 'status' | 'cri1' | 'cri2'>): StatusImovel {
  if (e.anosAtualizacao.some(a => a >= ANO_CICLO_ATUAL)) return 'atualizada';
  if (e.proprietarias.includes('Não localizada')) return 'nao_localizada';
  const temRegistro = e.matriculas.length + e.transcricoes.length + e.outrosRegistros.length > 0;
  if (temRegistro && e.anosAtualizacao.length > 0) return 'desatualizada';
  if (e.semRegistro1Cri && !temRegistro) return 'aguardando_2cri';
  if (temRegistro || e.oficiosUre.length > 0 || e.oficiosCri.length > 0 || e.documentos.length > 0) return 'em_andamento';
  return 'nao_iniciada';
}

export function parsePlanilha(csv: string): ImovelEscola[] {
  const linhas = parseCSV(csv);
  const idxCab = linhas.findIndex(l => l.some(c => normalizar(c) === 'ESCOLA'));
  if (idxCab < 0) throw new Error('Cabeçalho "Escola" não encontrado na planilha.');
  const col = mapearColunas(linhas[idxCab]);

  // Uma unidade pode ocupar várias linhas: a linha com o nome da escola abre o
  // registro e as linhas seguintes sem nome (mas com dados) são continuações
  // dela (ex.: 1º e 2º CRI em linhas separadas, proprietárias diferentes).
  type Bruto = { numero: string; escola: string; linhas: string[][] };
  const brutos: Bruto[] = [];
  for (const l of linhas.slice(idxCab + 1)) {
    const escola = (l[col.escola] || '').trim();
    const temDados = l.some((c, i) => i !== col.numero && i !== col.escola && !vazio(c));
    if (escola) brutos.push({ numero: (l[col.numero] || '').trim(), escola, linhas: [l] });
    else if (temDados && brutos.length) brutos[brutos.length - 1].linhas.push(l);
  }

  const extrairAnos = (vals: string[]) => vals
    .map(v => Number((v.match(/\b(19|20)\d{2}\b/) || [])[0]))
    .filter(n => Number.isFinite(n) && n > 0);

  const vistos = new Map<string, number>();
  return brutos.map(b => {
    const pegarDe = (ls: string[][], c: number) => ls.map(l => (l[c] || '').trim()).filter(Boolean);
    const pegar = (c: number) => pegarDe(b.linhas, c);
    const docs = pegar(col.documentos);
    const regs = docs.map(extrairRegistros);
    const anos = extrairAnos(pegar(col.atualizacao));
    const naoLocalizadaNoAno = pegar(col.atualizacao).some(v => normalizar(v).includes('NAO LOCALIZ'));

    const dadosCartorio = (n: 1 | 2): DadosCartorio => {
      const ls = b.linhas.filter(l => cartorioDoTexto(l[col.documentos] || '') === n);
      const ds = pegarDe(ls, col.documentos);
      const rs = ds.map(extrairRegistros);
      return {
        documentos: ds.filter(d => !normalizar(d).includes('NAO TEM')),
        matriculas: [...new Set(rs.flatMap(r => r.matriculas))],
        transcricoes: [...new Set(rs.flatMap(r => r.transcricoes))],
        outrosRegistros: [...new Set(rs.flatMap(r => r.outros))],
        oficios: pegarDe(ls, col.oficioCri),
        anos: extrairAnos(pegarDe(ls, col.atualizacao)),
      };
    };
    const linhas1 = b.linhas.filter(l => cartorioDoTexto(l[col.documentos] || '') === 1);
    const d1 = dadosCartorio(1);
    const d2 = dadosCartorio(2);
    const proprietarias = [...new Set([
      ...pegar(col.proprietaria).flatMap(normalizarProprietaria),
      ...(naoLocalizadaNoAno ? ['Não localizada'] : []),
    ])];

    let chave = normalizar(b.escola);
    const n = (vistos.get(chave) || 0) + 1;
    vistos.set(chave, n);
    if (n > 1) chave = `${chave} #${n}`;

    const base = {
      chave,
      // Algumas unidades têm o nº lançado na linha de continuação.
      numero: b.numero || pegar(col.numero)[0] || '',
      escola: b.escola,
      oficiosUre: pegar(col.oficioUre),
      documentos: docs,
      matriculas: [...new Set(regs.flatMap(r => r.matriculas))],
      transcricoes: [...new Set(regs.flatMap(r => r.transcricoes))],
      outrosRegistros: [...new Set(regs.flatMap(r => r.outros))],
      oficiosCri: pegar(col.oficioCri),
      anosAtualizacao: anos,
      proprietarias,
      semRegistro1Cri: docs.some(d => normalizar(d).includes('NAO TEM')),
      solicitar2Cri: pegar(col.solicitar2Cri).some(v => normalizar(v).includes('SOLICITAR')),
      solicitado2Cri: pegar(col.solicitado2Cri).some(v => normalizar(v).startsWith('OK')),
      atualizacoesSei: pegar(col.sei),
    };
    const naoLocalizado1 = linhas1.some(l => normalizar(`${l[col.atualizacao] || ''} ${l[col.proprietaria] || ''}`).includes('NAO LOCALIZ'));
    const cri1 = {
      ...d1,
      status: classificarCri1(d1, {
        semRegistro: base.semRegistro1Cri,
        naoLocalizado: naoLocalizado1,
        registroNo2: temRegistro(d2),
        oficioUre: pegarDe(linhas1, col.oficioUre).length > 0,
      }),
    };
    const cri2 = {
      ...d2,
      status: classificarCri2(d2, {
        precisa: base.semRegistro1Cri || base.solicitar2Cri,
        solicitado: base.solicitado2Cri,
      }),
    };
    return { ...base, status: classificar(base), cri1, cri2 };
  });
}

function resumirCartorio<S extends string>(
  imoveis: ImovelEscola[], ordem: S[], pegar: (i: ImovelEscola) => DadosCartorio & { status: S }, semDemanda: S,
): ResumoCartorio<S> {
  const porStatus = Object.fromEntries(ordem.map(s => [s, 0])) as Record<S, number>;
  imoveis.forEach(i => { porStatus[pegar(i).status]++; });
  return {
    unidades: imoveis.length - porStatus[semDemanda],
    porStatus,
    matriculas: imoveis.reduce((s, i) => s + pegar(i).matriculas.length, 0),
    transcricoes: imoveis.reduce((s, i) => s + pegar(i).transcricoes.length, 0),
    oficios: imoveis.reduce((s, i) => s + pegar(i).oficios.length, 0),
  };
}

export function resumir(imoveis: ImovelEscola[]): ResumoCompleto {
  const porStatus = Object.fromEntries(STATUS_ORDEM.map(s => [s, 0])) as Record<StatusImovel, number>;
  imoveis.forEach(i => { porStatus[i.status]++; });
  const precisa2Cri = imoveis.filter(i => i.semRegistro1Cri || i.solicitar2Cri);
  return {
    cri1: resumirCartorio(imoveis, STATUS_CRI1_ORDEM, i => i.cri1, 'nao_pesquisado'),
    cri2: resumirCartorio(imoveis, STATUS_CRI2_ORDEM, i => i.cri2, 'nao_se_aplica'),
    total: imoveis.length,
    porStatus,
    matriculas: imoveis.reduce((s, i) => s + i.matriculas.length, 0),
    transcricoes: imoveis.reduce((s, i) => s + i.transcricoes.length, 0),
    oficiosUre: imoveis.reduce((s, i) => s + i.oficiosUre.length, 0),
    oficiosCri: imoveis.reduce((s, i) => s + i.oficiosCri.length, 0),
    solicitacoes2CriFeitas: precisa2Cri.filter(i => i.solicitado2Cri).length,
    solicitacoes2CriPendentes: precisa2Cri.filter(i => !i.solicitado2Cri).length,
  };
}

export function montarSnapshot(imoveis: ImovelEscola[], data: string): Snapshot {
  return {
    data,
    resumo: resumir(imoveis),
    por_escola: Object.fromEntries(imoveis.map(i => [i.chave, {
      escola: i.escola, status: i.status, cri1: i.cri1.status, cri2: i.cri2.status,
    }])),
  };
}

// Ofícios do CRI vêm como "1549/26 RI": o sufixo é o ano (2 dígitos).
export function anoDoOficio(oficio: string): number | null {
  const m = oficio.match(/\/(\d{2,4})\b/);
  if (!m) return null;
  const a = Number(m[1]);
  return a < 100 ? 2000 + a : a;
}

export interface Movimentacao {
  chave: string;
  escola: string;
  de: StatusImovel | null;
  para: StatusImovel;
}

// Unidades cujo status mudou entre duas fotografias (null = unidade nova).
export function compararSnapshots(antes: Snapshot | null, depois: Snapshot): Movimentacao[] {
  const out: Movimentacao[] = [];
  Object.entries(depois.por_escola).forEach(([chave, v]) => {
    const anterior = antes?.por_escola[chave]?.status ?? null;
    if (antes && anterior !== v.status) out.push({ chave, escola: v.escola, de: anterior, para: v.status });
  });
  const rank = (s: StatusImovel) => STATUS_ORDEM.indexOf(s);
  return out.sort((a, b) => rank(a.para) - rank(b.para) || a.escola.localeCompare(b.escola));
}

export interface MovimentacaoCartorio<S extends string> {
  chave: string;
  escola: string;
  de: S | null;
  para: S;
}

// Mudanças de situação num cartório. Fotografias antigas (sem o campo) não
// entram na comparação para não acusar "mudança" que é só falta de dado.
export function compararCartorio(antes: Snapshot | null, depois: Snapshot, campo: 'cri1'): MovimentacaoCartorio<StatusCri1>[];
export function compararCartorio(antes: Snapshot | null, depois: Snapshot, campo: 'cri2'): MovimentacaoCartorio<StatusCri2>[];
export function compararCartorio(antes: Snapshot | null, depois: Snapshot, campo: 'cri1' | 'cri2'): MovimentacaoCartorio<string>[] {
  if (!antes) return [];
  const ordem: string[] = campo === 'cri1' ? STATUS_CRI1_ORDEM : STATUS_CRI2_ORDEM;
  const out: MovimentacaoCartorio<string>[] = [];
  Object.entries(depois.por_escola).forEach(([chave, v]) => {
    const para = v[campo];
    if (!para) return;
    const reg = antes.por_escola[chave];
    if (reg && !reg[campo]) return;
    const de = reg?.[campo] ?? null;
    if (de !== para) out.push({ chave, escola: v.escola, de, para });
  });
  return out.sort((a, b) => ordem.indexOf(a.para) - ordem.indexOf(b.para) || a.escola.localeCompare(b.escola));
}

// Matrículas/transcrições citadas em mais de uma unidade — normalmente terreno
// compartilhado (ex.: escola + extensão), às vezes erro de digitação.
export function registrosCompartilhados(imoveis: ImovelEscola[]): { registro: string; escolas: string[] }[] {
  const m = new Map<string, Set<string>>();
  imoveis.forEach(i => [...i.matriculas, ...i.transcricoes].forEach(r => {
    if (!m.has(r)) m.set(r, new Set());
    m.get(r)!.add(i.escola);
  }));
  const grupos = new Map<string, { registros: string[]; escolas: string[] }>();
  m.forEach((esc, reg) => {
    if (esc.size < 2) return;
    const escolas = [...esc].sort();
    const k = escolas.join('|');
    if (!grupos.has(k)) grupos.set(k, { registros: [], escolas });
    grupos.get(k)!.registros.push(reg);
  });
  return [...grupos.values()].map(g => ({
    registro: g.registros.length > 3 ? `${g.registros.slice(0, 3).join(', ')} e +${g.registros.length - 3}` : g.registros.join(', '),
    escolas: g.escolas,
  }));
}

// Ritmo médio mensal de certidões atualizadas e mês projetado para 100%,
// a partir da série mensal (ordem crescente). null = sem base para projetar.
export function projetarConclusao(serie: { ym: string; atualizadas: number; total: number }[]): { ritmo: number; conclusao: string | null } | null {
  if (serie.length < 2) return null;
  const pri = serie[0];
  const ult = serie[serie.length - 1];
  const [a0, m0] = pri.ym.split('-').map(Number);
  const [a1, m1] = ult.ym.split('-').map(Number);
  const meses = (a1 - a0) * 12 + (m1 - m0);
  if (meses <= 0) return null;
  const ritmo = (ult.atualizadas - pri.atualizadas) / meses;
  if (ritmo <= 0) return { ritmo, conclusao: null };
  const faltam = Math.ceil((ult.total - ult.atualizadas) / ritmo);
  const alvo = new Date(a1, m1 - 1 + faltam, 1);
  return { ritmo, conclusao: `${alvo.getFullYear()}-${String(alvo.getMonth() + 1).padStart(2, '0')}` };
}

// Última fotografia de cada mês (yyyy-mm) — base do gráfico de evolução.
export function ultimoSnapshotPorMes(snaps: Snapshot[]): Map<string, Snapshot> {
  const m = new Map<string, Snapshot>();
  [...snaps].sort((a, b) => a.data.localeCompare(b.data)).forEach(s => m.set(s.data.slice(0, 7), s));
  return m;
}

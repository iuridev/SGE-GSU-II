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
}

export interface Snapshot {
  data: string; // yyyy-mm-dd
  resumo: ResumoRegularizacao;
  por_escola: Record<string, { escola: string; status: StatusImovel }>;
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

function classificar(e: Omit<ImovelEscola, 'status'>): StatusImovel {
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

  const vistos = new Map<string, number>();
  return brutos.map(b => {
    const pegar = (c: number) => b.linhas.map(l => (l[c] || '').trim()).filter(Boolean);
    const docs = pegar(col.documentos);
    const regs = docs.map(extrairRegistros);
    const anos = pegar(col.atualizacao)
      .map(v => Number((v.match(/\b(19|20)\d{2}\b/) || [])[0]))
      .filter(n => Number.isFinite(n) && n > 0);
    const naoLocalizadaNoAno = pegar(col.atualizacao).some(v => normalizar(v).includes('NAO LOCALIZ'));
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
      numero: b.numero,
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
    return { ...base, status: classificar(base) };
  });
}

export function resumir(imoveis: ImovelEscola[]): ResumoRegularizacao {
  const porStatus = Object.fromEntries(STATUS_ORDEM.map(s => [s, 0])) as Record<StatusImovel, number>;
  imoveis.forEach(i => { porStatus[i.status]++; });
  const precisa2Cri = imoveis.filter(i => i.semRegistro1Cri || i.solicitar2Cri);
  return {
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
    por_escola: Object.fromEntries(imoveis.map(i => [i.chave, { escola: i.escola, status: i.status }])),
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

// Última fotografia de cada mês (yyyy-mm) — base do gráfico de evolução.
export function ultimoSnapshotPorMes(snaps: Snapshot[]): Map<string, Snapshot> {
  const m = new Map<string, Snapshot>();
  [...snaps].sort((a, b) => a.data.localeCompare(b.data)).forEach(s => m.set(s.data.slice(0, 7), s));
  return m;
}

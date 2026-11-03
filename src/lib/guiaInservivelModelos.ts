// Modelos do manual CEPAT "Arrolamento de Material Excedente e/ou Inservível –
// Doação para APM" (jul/2017), adaptados ao SEI e à URE Guarulhos Sul.
// A mesma definição em blocos alimenta a prévia na tela, o texto copiado, o
// .docx (lib docx) e o PDF com campos editáveis (pdf-lib / AcroForm).
import {
  AlignmentType, BorderStyle, Document, HeightRule, ImageRun, Packer, PageOrientation, Paragraph,
  ShadingType, Table, TableCell, TableRow, TextRun, VerticalAlign, WidthType,
} from 'docx';
import {
  PDFDocument, PDFFont, PDFForm, PDFImage, PDFPage, StandardFonts, TextAlignment, rgb,
} from 'pdf-lib';

export const URE = 'Unidade Regional de Ensino Guarulhos Sul';
export const DIRIGENTE = 'Coordenadora Geral – Dirigente Regional de Ensino';
export const ASSUNTO = 'Arrolamento de Material Inservível e/ou Excedente, com base na Resolução SE 41/00';
export const BRASAO_URL = `${import.meta.env.BASE_URL}brasao-sp.png`;

export type Alinh = 'left' | 'center' | 'right' | 'justify';

export type Bloco =
  // Brasão à esquerda + linhas centralizadas (documentos oficiais da escola/URE)
  | { t: 'cab-oficial'; linhas: string[]; escola?: string[] }
  // Faixa cinza "APM – Associação de Pais e Mestres / CNPJ / Endereço" (Modelos 10 e 11)
  | { t: 'cab-apm'; rotuloEndereco: string }
  | { t: 'titulo'; texto: string; alinh?: Alinh }
  | { t: 'par'; texto: string; recuo?: boolean; alinh?: Alinh }
  | { t: 'linhas-ass'; n: number; numeradas?: boolean };

export interface Modelo {
  n: number;
  titulo: string;
  etapa: string;
  tipo: string;
  assina: string;
  arquivo: string;
  blocos?: Bloco[];
  mapa?: boolean;
}

const CAB_INFO = (interessado = 'E.E. [NOME DA ESCOLA]') =>
  `INFORMAÇÃO Nº: [Nº]/[ANO]\nPROCESSO SEI Nº [Nº DO PROCESSO]\nINTERESSADO: ${interessado}\nASSUNTO: ${ASSUNTO}`;

export const MODELOS: Modelo[] = [
  {
    n: 1, titulo: 'Mapa de arrolamento', etapa: '1ª etapa', arquivo: 'Modelo-01-Mapa-de-Arrolamento',
    tipo: 'Tabela incluída no processo SEI', assina: 'Diretor (na escola) e 3 membros da EAMEX (na URE)',
    mapa: true,
  },
  {
    n: 2, titulo: 'Informação do Diretor', etapa: '1ª etapa', arquivo: 'Modelo-02-Informacao-do-Diretor',
    tipo: 'Documento “Informação” criado no SEI', assina: 'Diretor da escola',
    blocos: [
      {
        t: 'cab-oficial',
        linhas: ['Secretaria da Educação', URE],
        escola: ['Escola Estadual “[NOME DA ESCOLA]”', '[RUA, Nº, BAIRRO]', 'Fone/fax: [TELEFONE] – Guarulhos – SP – CEP [CEP]'],
      },
      { t: 'par', texto: 'Informação nº [Nº]/[ANO]\nProcesso SEI nº [Nº DO PROCESSO]' },
      {
        t: 'par', recuo: true, alinh: 'justify',
        texto: 'Encaminho relação de material considerado excedente e/ou inservível por esta Unidade Escolar, e face a solicitação de doação formulada pela Associação de Pais e Mestres - APM, documento anexo, com base no Decreto 40.645, de 31/01/96, publicado no DOE em 1º/02/96 e na Resolução SE 41, de 26 de abril de 2000, publicado no DOE em 27/04/2000, esta Direção nada tem a opor, uma vez que o referido material foi verificado e analisado pelos membros do Conselho de Escola, conforme Deliberação do Conselho (anexo).',
      },
      {
        t: 'par', recuo: true, alinh: 'justify',
        texto: `Isto posto, submetemos o assunto à apreciação da Senhora ${DIRIGENTE}, por intermédio da SEFISC-SGU, para manifestação da Equipe de Apoio de Material Excedente - EAMEX, da Supervisão de Ensino e do Centro de Administração, Finanças e Infraestrutura / Núcleo de Administração - NAD, e em não havendo impedimento legal, à sua deliberação.`,
      },
      { t: 'par', texto: 'Guarulhos, [DATA].' },
      { t: 'par', texto: 'Nome: [NOME DO DIRETOR]\nRG: [Nº DO RG]\nDiretor(a) da Escola' },
    ],
  },
  {
    n: 3, titulo: 'Ofício da APM solicitando a doação', etapa: '1ª etapa', arquivo: 'Modelo-03-Oficio-da-APM',
    tipo: 'Documento externo em papel timbrado da APM', assina: 'Diretor Executivo da APM',
    blocos: [
      { t: 'par', texto: '[PAPEL TIMBRADO DA APM]\nAssunto: Solicita Doação de Materiais Inservíveis' },
      { t: 'par', texto: 'Senhora Dirigente,' },
      {
        t: 'par', recuo: true, alinh: 'justify',
        texto: `A Associação de Pais e Mestres da E.E. [NOME DA ESCOLA] vem solicitar de Vossa Senhoria a doação do Material Inservível, pertencente à E.E. [NOME DA ESCOLA], Município de Guarulhos, da ${URE}, material esse que será de grande valia para esta Associação.`,
      },
      { t: 'par', recuo: true, alinh: 'justify', texto: 'Na oportunidade aproveitamos para apresentar a Vossa Senhoria os protestos de estima e consideração.' },
      { t: 'par', texto: 'Atenciosamente,' },
      { t: 'par', texto: 'Guarulhos, [DATA].\nDiretor Executivo da APM\nNome: [NOME]\nRG: [Nº DO RG]' },
      { t: 'par', texto: `À Senhora [NOME DA DIRIGENTE]\n${DIRIGENTE}\n${URE}` },
    ],
  },
  {
    n: 4, titulo: 'Ata de deliberação do Conselho de Escola', etapa: '1ª etapa', arquivo: 'Modelo-04-Ata-do-Conselho-de-Escola',
    tipo: 'Documento externo (ata)', assina: 'Secretário “ad hoc” e membros do Conselho, com visto do Diretor',
    blocos: [
      { t: 'titulo', texto: 'APRESENTAÇÃO E DELIBERAÇÃO DO CONSELHO DE ESCOLA\nSOBRE OS MATERIAIS INSERVÍVEIS' },
      { t: 'par', texto: 'Deliberação do Conselho de Escola sobre os materiais inservíveis que se encontram sem condições de recuperação.' },
      {
        t: 'par', alinh: 'justify',
        texto: `Aos [DIA] dias, do mês de [MÊS] do ano de [ANO] às [HORA] horas na E.E. [NOME DA ESCOLA], pertencente à ${URE}, em cumprimento ao Decreto Nº 40.645/96 e da Resolução SE 41/2000, procedeu-se a verificação dos materiais inservíveis. Todos estes materiais encontram-se relacionados no mapa de arrolamento e estão excedentes e/ou inservíveis, estando presentes os membros do Conselho de Escola ([NOME, RG E FUNÇÃO OU CARGO DE CADA MEMBRO]). Para testemunhar o fato acima relatado, eu [NOME COMPLETO] secretário “ad hoc” lavrei a presente Ata, que depois de lida e aprovada será assinada pelos demais membros.`,
      },
      { t: 'par', texto: 'Guarulhos, [DATA].\n(Assinatura do Secretário e dos demais membros do Conselho de Escola)' },
      { t: 'linhas-ass', n: 3, numeradas: true },
      { t: 'par', texto: 'Visto do Diretor da U.E.\nNome: [NOME DO DIRETOR]\nRG: [Nº DO RG]' },
    ],
  },
  {
    n: 10, titulo: 'Ata da APM de recebimento da doação', etapa: '3ª etapa', arquivo: 'Modelo-10-Ata-da-APM',
    tipo: 'Documento externo (ata)', assina: 'Secretário e membros da APM, com visto do Diretor',
    blocos: [
      { t: 'cab-apm', rotuloEndereco: 'Endereço' },
      {
        t: 'titulo',
        texto: 'ATA DA ASSOCIAÇÃO DE PAIS E MESTRES DA E.E. [NOME DA ESCOLA]\nDoação dos materiais inservíveis da E.E. [NOME DA ESCOLA]\nPara a Associação de Pais e Mestres desta Unidade Escolar.',
      },
      {
        t: 'par', alinh: 'justify',
        texto: `Aos [DIA] dias, do mês de [MÊS], do ano de [ANO] às [HORA] horas na E.E. [NOME DA ESCOLA], pertencente à ${URE}, nos termos do Decreto nº 40.645, de 31/01/96, e na Resolução SE 41, de 26/04/2000, recebeu em doação os materiais constantes no Mapa de Arrolamento do Processo SEI nº [Nº DO PROCESSO].\nPara testemunhar o fato acima relatado, eu [NOME COMPLETO] secretário “ad hoc” da presente Comissão dou fé, assino a presente Ata, que depois de lida e aprovada será assinada pelos demais membros.`,
      },
      { t: 'par', texto: 'Guarulhos, [DATA POR EXTENSO].\nAssinatura do secretário e dos demais membros:' },
      { t: 'linhas-ass', n: 4 },
      { t: 'par', texto: 'Visto do Diretor da E.E.\nNome: [NOME DO DIRETOR]\nRG: [Nº DO RG]' },
    ],
  },
  {
    n: 11, titulo: 'Recibo de retirada do material', etapa: '3ª etapa', arquivo: 'Modelo-11-Recibo-da-APM',
    tipo: 'Documento externo em papel timbrado da APM', assina: 'Diretor Executivo da APM',
    blocos: [
      { t: 'cab-apm', rotuloEndereco: 'Endereço completo' },
      { t: 'titulo', texto: 'ASSOCIAÇÃO DE PAIS E MESTRES DA E.E. [NOME DA ESCOLA]' },
      { t: 'titulo', texto: 'RECIBO', alinh: 'center' },
      {
        t: 'par', recuo: true, alinh: 'justify',
        texto: `A Associação de Pais e Mestres da E.E. [NOME DA ESCOLA] jurisdicionada à ${URE}, declara que foi retirado o material inservível e/ou excedente, recebido em doação, nos termos do Decreto nº 40.645/96, publicado no DOE de 1º/02/96 e da Resolução SE 41/00, publicada no DOE em 27/04/2000, objeto do Processo SEI nº [Nº DO PROCESSO], e devidamente retirado em tempo hábil, pelo Sr.(a) [NOME COMPLETO], portador(a) do RG [NÚMERO COMPLETO].`,
      },
      { t: 'par', texto: 'Guarulhos, [DATA].', alinh: 'center' },
      { t: 'par', texto: 'Diretor Executivo da APM\nNome: [NOME]\nRG: [Nº DO RG]' },
    ],
  },
  {
    n: 12, titulo: 'Informação de retorno à Dirigente', etapa: '3ª etapa', arquivo: 'Modelo-12-Informacao-de-Retorno',
    tipo: 'Documento “Informação” criado no SEI', assina: 'Diretor da escola',
    blocos: [
      { t: 'cab-oficial', linhas: ['Secretaria de Estado da Educação', URE] },
      { t: 'par', texto: CAB_INFO() },
      { t: 'par', texto: 'Sr.(a) Dirigente,' },
      {
        t: 'par', alinh: 'justify',
        texto: 'Atendido o contido no despacho (documento SEI nº [Nº]), com juntada da Ata de recebimento do material doado à APM da E.E. [NOME DA ESCOLA] (documento SEI nº [Nº]), bem como o recibo (documento SEI nº [Nº]), retorna o presente conforme solicitado.',
      },
      { t: 'par', texto: 'Guarulhos, [DATA].' },
      { t: 'par', texto: 'Nome e assinatura do Diretor da Unidade Escolar\n[NOME DO DIRETOR]' },
    ],
  },
];

// ---------- Mapa de arrolamento (Modelo 1) ----------

export const MAPA_CAMPOS: [string, string][] = [
  ['UNIDADE ORÇAMENTÁRIA:', 'Secretaria da Educação'],
  ['UNIDADE DE DESPESA:', URE],
  ['MATERIAL ARROLADO NA:', 'E.E. [NOME DA ESCOLA]'],
  ['ENDEREÇO:', '[RUA, Nº, BAIRRO] – Guarulhos – SP'],
];
export const MAPA_COLUNAS = [
  'Item', 'Especificação do Material', 'Quant.', 'Data da Aquisição', 'Nº de Patrimônio',
  'Nº de Fabricação', 'Valor Histórico', 'Estado de Conservação', 'Obs.:',
];
// Larguras relativas das colunas (somam 100), na proporção do manual
export const MAPA_LARGURAS = [5, 30, 6, 8, 9, 9, 8, 13, 12];
export const MAPA_EXEMPLO = ['01', 'Carteira escolar de madeira com estrutura de ferro', '10', '12/03/2008', '012345 a 012354', '—', 'R$ 850,00', 'Mau', ''];
export const MAPA_ASSINATURAS = ['Membro EAMEX', 'Membro EAMEX', 'Membro EAMEX', 'Diretor'];
// Quantidade de linhas de itens no mapa (o manual traz 5; ampliado para facilitar o preenchimento)
export const MAPA_LINHAS = 10;
export const numeroItem = (k: number) => String(k).padStart(2, '0');
export const MAPA_NOTA = 'Material deverá permanecer na Unidade de Guarda, até a sua retirada pelo órgão donatário.';

// ---------- Texto puro (botão Copiar) ----------

const LINHA_ASS = '______________________________';

export function textoModelo(m: Modelo): string {
  if (m.mapa) return mapaTSV();
  return (m.blocos ?? []).map(b => {
    switch (b.t) {
      case 'cab-oficial': return [...b.linhas, ...(b.escola ?? [])].join('\n');
      case 'cab-apm': return `APM – Associação de Pais e Mestres\nCNPJ nº [CNPJ DA APM]\n${b.rotuloEndereco}: [ENDEREÇO DA APM]`;
      case 'titulo':
      case 'par': return b.texto;
      case 'linhas-ass':
        return Array.from({ length: b.n }, (_, i) => (b.numeradas ? `${i + 1} ` : '') + LINHA_ASS).join('\n');
    }
  }).join('\n\n');
}

function mapaTSV(): string {
  const t = '\t';
  const linhas = [
    'GOVERNO DO ESTADO DE SÃO PAULO',
    'SECRETARIA DA EDUCAÇÃO',
    ...MAPA_CAMPOS.map(([r, v]) => r + t + v),
    '',
    MAPA_COLUNAS.join(t),
  ];
  for (let k = 1; k <= MAPA_LINHAS; k++) linhas.push(numeroItem(k) + t.repeat(MAPA_COLUNAS.length - 1));
  linhas.push('');
  linhas.push(MAPA_ASSINATURAS.join(t) + t + 'Nota:');
  linhas.push(Array(4).fill('Data .../.../....').join(t) + t + MAPA_NOTA);
  return linhas.join('\n');
}

// ---------- Utilidades ----------

async function carregarBrasao(): Promise<Uint8Array> {
  const resp = await fetch(BRASAO_URL);
  if (!resp.ok) throw new Error('Não foi possível carregar o brasão.');
  return new Uint8Array(await resp.arrayBuffer());
}

function baixar(blob: Blob, nome: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nome;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ---------- Word (.docx) ----------

const SEM_BORDA = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' };
const SEM_BORDAS = { top: SEM_BORDA, bottom: SEM_BORDA, left: SEM_BORDA, right: SEM_BORDA, insideHorizontal: SEM_BORDA, insideVertical: SEM_BORDA };
const BORDA = { style: BorderStyle.SINGLE, size: 4, color: '000000' };
const BORDAS = { top: BORDA, bottom: BORDA, left: BORDA, right: BORDA };
const BORDA_DUPLA = { style: BorderStyle.DOUBLE, size: 6, color: '000000' };

const ALINH_DOCX = {
  left: AlignmentType.LEFT,
  center: AlignmentType.CENTER,
  right: AlignmentType.RIGHT,
  justify: AlignmentType.JUSTIFIED,
};

function runs(texto: string, opts: { bold?: boolean; underline?: boolean; size?: number } = {}): TextRun[] {
  return texto.split('\n').map((parte, i) => new TextRun({
    text: parte,
    bold: opts.bold,
    underline: opts.underline ? {} : undefined,
    size: opts.size,
    break: i > 0 ? 1 : undefined,
  }));
}

function brasaoDocx(bytes: Uint8Array, largura = 62) {
  return new ImageRun({ type: 'png', data: bytes, transformation: { width: largura, height: Math.round(largura * 291 / 250) } });
}

function cabecalhoOficialDocx(bytes: Uint8Array, linhas: string[], escola?: string[]) {
  const texto: Paragraph[] = linhas.map(l => new Paragraph({ alignment: AlignmentType.CENTER, children: runs(l) }));
  if (escola?.length) {
    texto.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 160 }, children: runs(escola[0], { bold: true, underline: true }) }));
    escola.slice(1).forEach(l => texto.push(new Paragraph({ children: runs(l) })));
  }
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: SEM_BORDAS,
    rows: [new TableRow({
      children: [
        new TableCell({ width: { size: 16, type: WidthType.PERCENTAGE }, borders: semBordas(), verticalAlign: VerticalAlign.CENTER, children: [new Paragraph({ children: [brasaoDocx(bytes)] })] }),
        new TableCell({ width: { size: 84, type: WidthType.PERCENTAGE }, borders: semBordas(), verticalAlign: VerticalAlign.CENTER, children: texto }),
      ],
    })],
  });
}

function semBordas() {
  return { top: SEM_BORDA, bottom: SEM_BORDA, left: SEM_BORDA, right: SEM_BORDA };
}

function cabecalhoApmDocx(rotuloEndereco: string) {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [new TableRow({
      children: [new TableCell({
        borders: { top: BORDA_DUPLA, bottom: BORDA_DUPLA, left: BORDA_DUPLA, right: BORDA_DUPLA },
        shading: { type: ShadingType.CLEAR, fill: 'D9D9D9', color: 'auto' },
        children: [
          new Paragraph({ alignment: AlignmentType.CENTER, children: runs('APM – Associação de Pais e Mestres', { bold: true, size: 26 }) }),
          new Paragraph({ alignment: AlignmentType.CENTER, children: runs('CNPJ nº [CNPJ DA APM]', { bold: true, size: 26 }) }),
          new Paragraph({ alignment: AlignmentType.CENTER, children: runs(`${rotuloEndereco}: [ENDEREÇO DA APM]`, { bold: true }) }),
        ],
      })],
    })],
  });
}

function blocosDocx(blocos: Bloco[], brasao: Uint8Array) {
  const filhos: (Paragraph | Table)[] = [];
  const espaco = () => new Paragraph({ children: [] });
  blocos.forEach(b => {
    switch (b.t) {
      case 'cab-oficial':
        filhos.push(cabecalhoOficialDocx(brasao, b.linhas, b.escola), espaco(), espaco());
        break;
      case 'cab-apm':
        filhos.push(cabecalhoApmDocx(b.rotuloEndereco), espaco(), espaco());
        break;
      case 'titulo':
        filhos.push(new Paragraph({ alignment: ALINH_DOCX[b.alinh ?? 'left'], spacing: { after: 280 }, children: runs(b.texto, { bold: true }) }));
        break;
      case 'par':
        filhos.push(new Paragraph({
          alignment: ALINH_DOCX[b.alinh ?? 'left'],
          indent: b.recuo ? { firstLine: 2835 } : undefined,
          spacing: { after: 280, line: 300 },
          children: runs(b.texto),
        }));
        break;
      case 'linhas-ass':
        for (let i = 0; i < b.n; i++) {
          filhos.push(new Paragraph({ spacing: { before: 200 }, children: runs((b.numeradas ? `${i + 1} ` : '') + LINHA_ASS) }));
        }
        filhos.push(espaco());
        break;
    }
  });
  return filhos;
}

function celulaMapa(texto: string, opts: { bold?: boolean; center?: boolean; largura?: number; shading?: boolean; altura?: boolean } = {}) {
  return new TableCell({
    borders: BORDAS,
    width: opts.largura ? { size: opts.largura, type: WidthType.PERCENTAGE } : undefined,
    verticalAlign: VerticalAlign.CENTER,
    shading: opts.shading ? { type: ShadingType.CLEAR, fill: 'F2F2F2', color: 'auto' } : undefined,
    children: [new Paragraph({ alignment: opts.center ? AlignmentType.CENTER : AlignmentType.LEFT, children: runs(texto, { bold: opts.bold, size: 16 }) })],
  });
}

function mapaDocx(brasao: Uint8Array) {
  const cab = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: SEM_BORDAS,
    rows: [new TableRow({
      children: [
        new TableCell({ width: { size: 10, type: WidthType.PERCENTAGE }, borders: semBordas(), children: [new Paragraph({ children: [brasaoDocx(brasao, 48)] })] }),
        new TableCell({
          width: { size: 80, type: WidthType.PERCENTAGE }, borders: semBordas(), verticalAlign: VerticalAlign.CENTER,
          children: [
            new Paragraph({ alignment: AlignmentType.CENTER, children: runs('GOVERNO DO ESTADO DE SÃO PAULO', { bold: true, size: 24 }) }),
            new Paragraph({ alignment: AlignmentType.CENTER, children: runs('SECRETARIA DA EDUCAÇÃO', { bold: true, size: 24 }) }),
          ],
        }),
        new TableCell({ width: { size: 10, type: WidthType.PERCENTAGE }, borders: semBordas(), children: [new Paragraph({ children: [] })] }),
      ],
    })],
  });

  const campos = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: MAPA_CAMPOS.map(([rotulo, valor], i) => new TableRow({
      children: [
        new TableCell({
          width: { size: 22, type: WidthType.PERCENTAGE },
          borders: { top: i === 0 ? BORDA : SEM_BORDA, bottom: SEM_BORDA, left: BORDA, right: SEM_BORDA },
          children: [new Paragraph({ spacing: { before: 80, after: 80 }, children: runs(rotulo, { bold: true, size: 17 }) })],
        }),
        new TableCell({
          width: { size: 78, type: WidthType.PERCENTAGE },
          borders: { top: i === 0 ? BORDA : SEM_BORDA, bottom: BORDA, left: SEM_BORDA, right: BORDA },
          children: [new Paragraph({ spacing: { before: 80, after: 40 }, children: runs(valor, { bold: true, size: 20 }) })],
        }),
      ],
    })),
  });

  const linhas = [
    new TableRow({
      tableHeader: true,
      children: MAPA_COLUNAS.map((c, i) => celulaMapa(c, { center: true, largura: MAPA_LARGURAS[i] })),
    }),
    ...Array.from({ length: MAPA_LINHAS }, (_, j) => j + 1).map(k => new TableRow({
      height: { value: 400, rule: HeightRule.ATLEAST },
      children: MAPA_COLUNAS.map((_, i) => celulaMapa(i === 0 ? numeroItem(k) : '', { center: true, largura: MAPA_LARGURAS[i] })),
    })),
  ];
  const tabela = new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: linhas });

  const assinaturas = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [new TableRow({
      height: { value: 1500, rule: HeightRule.ATLEAST },
      children: [
        ...MAPA_ASSINATURAS.map(quem => new TableCell({
          borders: BORDAS, width: { size: 20, type: WidthType.PERCENTAGE },
          children: [
            new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 120 }, children: runs('Data', { size: 18 }) }),
            new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 120, after: 360 }, children: runs('.../.../....', { size: 18 }) }),
            new Paragraph({ alignment: AlignmentType.CENTER, children: runs('______________________', { size: 18 }) }),
            new Paragraph({ alignment: AlignmentType.CENTER, children: runs(quem, { size: 18 }) }),
          ],
        })),
        new TableCell({
          borders: BORDAS, width: { size: 20, type: WidthType.PERCENTAGE },
          children: [
            new Paragraph({ children: runs('Nota:', { size: 14 }) }),
            new Paragraph({ alignment: AlignmentType.JUSTIFIED, spacing: { before: 120 }, children: runs(MAPA_NOTA, { size: 14 }) }),
          ],
        }),
      ],
    })],
  });

  return [cab, new Paragraph({ children: [] }), campos, tabela, assinaturas];
}

export async function gerarWord(m: Modelo) {
  const brasao = await carregarBrasao();
  const doc = new Document({
    creator: 'SGE · SEFISC · URE Guarulhos Sul',
    title: `Modelo ${m.n} – ${m.titulo}`,
    styles: { default: { document: { run: { font: 'Verdana', size: 20 } } } },
    sections: [{
      properties: {
        page: {
          size: m.mapa ? { orientation: PageOrientation.LANDSCAPE } : undefined,
          margin: m.mapa
            ? { top: 720, bottom: 720, left: 720, right: 720 }
            : { top: 1134, bottom: 1134, left: 1418, right: 1134 },
        },
      },
      children: m.mapa ? mapaDocx(brasao) : blocosDocx(m.blocos ?? [], brasao),
    }],
  });
  baixar(await Packer.toBlob(doc), `${m.arquivo}.docx`);
}

// ---------- PDF editável ----------

const A4: [number, number] = [595.28, 841.89];
const MARGEM = 56;
const TAM = 10;

interface CtxPdf {
  doc: PDFDocument;
  form: PDFForm;
  page: PDFPage;
  y: number;
  n: number;
  reg: PDFFont;
  bold: PDFFont;
  brasao: PDFImage;
}

function quebrar(texto: string, font: PDFFont, size: number, largura: number): string[] {
  const saida: string[] = [];
  texto.split('\n').forEach(paragrafo => {
    let atual = '';
    paragrafo.split(' ').forEach(palavra => {
      const tentativa = atual ? `${atual} ${palavra}` : palavra;
      if (atual && font.widthOfTextAtSize(tentativa, size) > largura) {
        saida.push(atual);
        atual = palavra;
      } else {
        atual = tentativa;
      }
    });
    saida.push(atual);
  });
  return saida;
}

function garantirEspaco(ctx: CtxPdf, altura: number) {
  if (ctx.y - altura < MARGEM) {
    ctx.page = ctx.doc.addPage(A4);
    ctx.y = A4[1] - MARGEM;
  }
}

function campo(
  ctx: CtxPdf, texto: string, x: number, yTopo: number, largura: number, altura: number,
  opts: { multiline?: boolean; bold?: boolean; size?: number; align?: TextAlignment } = {},
) {
  const f = ctx.form.createTextField(`campo_${++ctx.n}`);
  f.setText(texto);
  if (opts.multiline) f.enableMultiline();
  f.setAlignment(opts.align ?? TextAlignment.Left);
  // Cores explícitas como undefined = campo transparente e sem moldura (o padrão do pdf-lib é fundo branco e borda preta)
  f.addToPage(ctx.page, {
    x, y: yTopo - altura, width: largura, height: altura, borderWidth: 0, backgroundColor: undefined, borderColor: undefined,
  });
  f.setFontSize(opts.size ?? TAM);
  f.updateAppearances(opts.bold ? ctx.bold : ctx.reg);
}

function textoCentral(ctx: CtxPdf, texto: string, cx: number, y: number, font: PDFFont, size: number) {
  ctx.page.drawText(texto, { x: cx - font.widthOfTextAtSize(texto, size) / 2, y, size, font, color: rgb(0, 0, 0) });
}

function paragrafoPdf(ctx: CtxPdf, texto: string, opts: { recuo?: boolean; bold?: boolean; align?: TextAlignment } = {}) {
  const largura = A4[0] - 2 * MARGEM;
  const font = opts.bold ? ctx.bold : ctx.reg;
  const conteudo = (opts.recuo ? ' '.repeat(18) : '') + texto;
  const linhas = quebrar(conteudo, font, TAM, largura - 8);
  const altura = linhas.length * TAM * 1.2 + 10;
  garantirEspaco(ctx, altura);
  campo(ctx, conteudo, MARGEM, ctx.y, largura, altura, { multiline: true, bold: opts.bold, align: opts.align });
  ctx.y -= altura + 12;
}

function blocosPdf(ctx: CtxPdf, blocos: Bloco[]) {
  const largura = A4[0] - 2 * MARGEM;
  blocos.forEach(b => {
    switch (b.t) {
      case 'cab-oficial': {
        const bw = 56, bh = bw * 291 / 250;
        ctx.page.drawImage(ctx.brasao, { x: MARGEM, y: ctx.y - bh, width: bw, height: bh });
        const cx = MARGEM + bw + (largura - bw) / 2;
        let y = ctx.y - 16;
        b.linhas.forEach(l => { textoCentral(ctx, l, cx, y, ctx.reg, 11); y -= 15; });
        if (b.escola?.length) {
          y -= 6;
          campo(ctx, b.escola[0], MARGEM + bw + 10, y + 11, largura - bw - 10, 15, { bold: true, size: 11, align: TextAlignment.Center });
          y -= 17;
          b.escola.slice(1).forEach(l => {
            campo(ctx, l, MARGEM + bw + 10, y + 11, largura - bw - 10, 15);
            y -= 15;
          });
        }
        ctx.y = Math.min(ctx.y - bh, y) - 28;
        break;
      }
      case 'cab-apm': {
        const h = 62;
        const p = ctx.page;
        p.drawRectangle({ x: MARGEM, y: ctx.y - h, width: largura, height: h, color: rgb(0.85, 0.85, 0.85), borderColor: rgb(0, 0, 0), borderWidth: 1.5 });
        p.drawRectangle({ x: MARGEM + 3, y: ctx.y - h + 3, width: largura - 6, height: h - 6, borderColor: rgb(0, 0, 0), borderWidth: 0.6 });
        textoCentral(ctx, 'APM – Associação de Pais e Mestres', A4[0] / 2, ctx.y - 18, ctx.bold, 12);
        campo(ctx, 'CNPJ nº [CNPJ DA APM]', MARGEM + 10, ctx.y - 23, largura - 20, 16, { bold: true, size: 11, align: TextAlignment.Center });
        campo(ctx, `${b.rotuloEndereco}: [ENDEREÇO DA APM]`, MARGEM + 10, ctx.y - 40, largura - 20, 15, { bold: true, align: TextAlignment.Center });
        ctx.y -= h + 30;
        break;
      }
      case 'titulo':
        paragrafoPdf(ctx, b.texto, { bold: true, align: b.alinh === 'center' ? TextAlignment.Center : TextAlignment.Left });
        break;
      case 'par':
        paragrafoPdf(ctx, b.texto, {
          recuo: b.recuo,
          align: b.alinh === 'center' ? TextAlignment.Center : b.alinh === 'right' ? TextAlignment.Right : TextAlignment.Left,
        });
        break;
      case 'linhas-ass':
        for (let i = 0; i < b.n; i++) {
          garantirEspaco(ctx, 28);
          ctx.y -= 22;
          if (b.numeradas) ctx.page.drawText(`${i + 1}`, { x: MARGEM, y: ctx.y + 2, size: TAM, font: ctx.reg });
          ctx.page.drawLine({ start: { x: MARGEM + 12, y: ctx.y }, end: { x: MARGEM + 240, y: ctx.y }, thickness: 0.6 });
        }
        ctx.y -= 24;
        break;
    }
  });
}

function mapaPdf(ctx: CtxPdf) {
  const [W, H] = [A4[1], A4[0]];
  ctx.page = ctx.doc.addPage([W, H]);
  const p = ctx.page;
  const m = 36;
  const largura = W - 2 * m;
  const preto = rgb(0, 0, 0);
  let y = H - m;

  const bw = 40, bh = bw * 291 / 250;
  p.drawImage(ctx.brasao, { x: m, y: y - bh, width: bw, height: bh });
  textoCentral(ctx, 'GOVERNO DO ESTADO DE SÃO PAULO', W / 2, y - 18, ctx.bold, 12);
  textoCentral(ctx, 'SECRETARIA DA EDUCAÇÃO', W / 2, y - 33, ctx.bold, 12);
  y -= bh + 8;

  // Quadro de identificação
  const hCampo = 20;
  const topoQuadro = y;
  MAPA_CAMPOS.forEach(([rotulo, valor]) => {
    p.drawText(rotulo, { x: m + 6, y: y - 14, size: 8.5, font: ctx.bold });
    p.drawLine({ start: { x: m + 150, y: y - 17 }, end: { x: m + largura - 6, y: y - 17 }, thickness: 0.6, color: preto });
    campo(ctx, valor, m + 150, y - 2, largura - 156, 15, { bold: true, size: 10 });
    y -= hCampo;
  });
  y -= 6;
  p.drawRectangle({ x: m, y, width: largura, height: topoQuadro - y, borderColor: preto, borderWidth: 0.8 });

  // Tabela de itens
  const xs: number[] = [m];
  MAPA_LARGURAS.forEach(l => xs.push(xs[xs.length - 1] + largura * l / 100));
  const hCab = 26, hLinha = 22;
  const desenharLinha = (yTopo: number, h: number) => {
    for (let i = 0; i < MAPA_COLUNAS.length; i++) {
      p.drawRectangle({ x: xs[i], y: yTopo - h, width: xs[i + 1] - xs[i], height: h, borderColor: preto, borderWidth: 0.6 });
    }
  };
  desenharLinha(y, hCab);
  MAPA_COLUNAS.forEach((c, i) => {
    const cx = (xs[i] + xs[i + 1]) / 2;
    const partes = quebrar(c, ctx.reg, 8, xs[i + 1] - xs[i] - 4);
    partes.forEach((t, j) => textoCentral(ctx, t, cx, y - 10 - j * 9 - (partes.length === 1 ? 5 : 0), ctx.reg, 8));
  });
  y -= hCab;
  for (let k = 1; k <= MAPA_LINHAS; k++) {
    desenharLinha(y, hLinha);
    textoCentral(ctx, numeroItem(k), (xs[0] + xs[1]) / 2, y - 14, ctx.reg, 8.5);
    for (let i = 1; i < MAPA_COLUNAS.length; i++) {
      campo(ctx, '', xs[i] + 1, y - 1, xs[i + 1] - xs[i] - 2, hLinha - 2, {
        size: 8, multiline: i === 1, align: i === 1 ? TextAlignment.Left : TextAlignment.Center,
      });
    }
    y -= hLinha;
  }

  // Assinaturas + nota
  const hAss = 92;
  const lc = largura / 5;
  for (let i = 0; i < 5; i++) {
    p.drawRectangle({ x: m + i * lc, y: y - hAss, width: lc, height: hAss, borderColor: preto, borderWidth: 0.6 });
  }
  MAPA_ASSINATURAS.forEach((quem, i) => {
    const cx = m + i * lc + lc / 2;
    textoCentral(ctx, 'Data', cx, y - 18, ctx.reg, 9);
    campo(ctx, '.../.../....', cx - 40, y - 26, 80, 14, { size: 9, align: TextAlignment.Center });
    p.drawLine({ start: { x: cx - 60, y: y - hAss + 18 }, end: { x: cx + 60, y: y - hAss + 18 }, thickness: 0.6, color: preto });
    textoCentral(ctx, quem, cx, y - hAss + 7, ctx.reg, 9);
  });
  const xn = m + 4 * lc + 5;
  p.drawText('Nota:', { x: xn, y: y - 12, size: 7, font: ctx.reg });
  quebrar(MAPA_NOTA, ctx.reg, 7, lc - 10).forEach((t, j) => {
    p.drawText(t, { x: xn, y: y - 26 - j * 9, size: 7, font: ctx.reg });
  });
}

export async function gerarPdfEditavel(m: Modelo) {
  const doc = await PDFDocument.create();
  doc.setTitle(`Modelo ${m.n} – ${m.titulo}`);
  doc.setCreator('SGE · SEFISC · URE Guarulhos Sul');
  const ctx: CtxPdf = {
    doc,
    form: doc.getForm(),
    page: undefined as unknown as PDFPage,
    y: A4[1] - MARGEM,
    n: 0,
    reg: await doc.embedFont(StandardFonts.Helvetica),
    bold: await doc.embedFont(StandardFonts.HelveticaBold),
    brasao: await doc.embedPng(await carregarBrasao()),
  };
  if (m.mapa) {
    mapaPdf(ctx);
  } else {
    ctx.page = doc.addPage(A4);
    blocosPdf(ctx, m.blocos ?? []);
  }
  // As aparências já foram geradas campo a campo (regular/negrito); não sobrescrever.
  const bytes = await doc.save({ updateFieldAppearances: false });
  baixar(new Blob([bytes as BlobPart], { type: 'application/pdf' }), `${m.arquivo}.pdf`);
}

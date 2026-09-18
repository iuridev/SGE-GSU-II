import React, { useState, useEffect, useMemo } from 'react';
import {
  Stamp, AlertTriangle, ChevronDown, ChevronRight, FileText, ClipboardList,
  Users, Receipt, CheckCircle2, Landmark, BookOpen
} from 'lucide-react';

type PathType = 'convenio' | 'terceiros';
type ItemPath = 'both' | PathType;

interface ChecklistItem {
  id: string;
  label: string;
  path: ItemPath;
}

interface DocSection {
  id: string;
  num: number;
  title: string;
  tag: string;
  intro: string;
  onlyPath?: PathType;
  checklist: ChecklistItem[];
  hasModel: boolean;
}

const DOCS: DocSection[] = [
  {
    id: 'oficio',
    num: 1,
    title: 'Ofício do Diretor à Unidade Regional de Ensino - Guarulhos Sul',
    tag: 'Abre o processo · assinado e carimbado pelo Diretor da Escola',
    intro: 'É o documento que abre o processo: o Diretor pede formalmente ao Coordenador Geral - Dirigente Regional de Ensino autorização para receber os bens em doação, com base no Decreto nº 57.141/2011 e na Resolução SE 45/2012.',
    checklist: [
      { id: 'oficio-1', label: 'Data do dia em que a escola vai protocolar', path: 'both' },
      { id: 'oficio-2c', label: 'Nome do convênio e ano (ex.: FNDE/MEC/PDDE/20__)', path: 'convenio' },
      { id: 'oficio-2t', label: 'Identificação do doador (pessoa física ou jurídica) ou indicação de recursos próprios da APM', path: 'terceiros' },
      { id: 'oficio-3', label: 'Assunto descrito corretamente conforme o caminho (convênio ou terceiros)', path: 'both' },
      { id: 'oficio-4', label: 'Fundamento legal citado: Decreto 57.141/2011, art. 80, VI, "b", item 2, e Resolução SE 45/2012', path: 'both' },
      { id: 'oficio-5', label: 'Assinatura e carimbo do Diretor da Unidade Escolar', path: 'both' },
      { id: 'oficio-6', label: 'Endereçado corretamente ao Coordenador Geral - Dirigente Regional de Ensino Guarulhos Sul', path: 'both' },
    ],
    hasModel: true,
  },
  {
    id: 'ata',
    num: 2,
    title: 'Ata da Reunião da APM',
    tag: 'Conselho Deliberativo + Diretoria Executiva · delibera a doação dos bens',
    intro: 'Registra a reunião extraordinária em que o Conselho Deliberativo e a Diretoria Executiva da APM decidem, por votação, doar os bens adquiridos para o patrimônio da escola.',
    checklist: [
      { id: 'ata-1c', label: 'Nome e número do convênio (ex.: FNDE/MEC/PDDE nº ___/___)', path: 'convenio' },
      { id: 'ata-2c', label: 'Valor da verba recebida, por extenso e em número', path: 'convenio' },
      { id: 'ata-1t', label: 'Origem dos recursos próprios ou identificação do doador', path: 'terceiros' },
      { id: 'ata-3', label: 'Relação de todos os bens adquiridos, descritos individualmente', path: 'both' },
      { id: 'ata-4', label: 'Número e valor de cada nota fiscal, com nome da empresa emissora', path: 'both' },
      { id: 'ata-5', label: 'Texto redigido com letra legível', path: 'both' },
      { id: 'ata-6', label: 'Observação registrada se a verba não foi usada por completo, ou foi completada com recursos próprios da APM', path: 'both' },
      { id: 'ata-7', label: 'Deliberação por voto unânime doando os bens, em caráter definitivo, ao patrimônio da escola', path: 'both' },
      { id: 'ata-8', label: 'Assinatura de todos os presentes e do(a) secretário(a) que lavrou a ata', path: 'both' },
    ],
    hasModel: true,
  },
  {
    id: 'termo',
    num: 3,
    title: 'Termo de Recebimento',
    tag: 'Formaliza a entrega dos bens: APM → Unidade Escolar',
    intro: 'É o recibo formal: o Diretor Executivo da APM entrega os equipamentos e o Diretor da Unidade Escolar os recebe, comprometendo-se a incorporá-los ao patrimônio via GEMAT/MCP.',
    checklist: [
      { id: 'termo-1', label: 'Relação completa de todos os bens doados (item, quantidade, especificação)', path: 'both' },
      { id: 'termo-2', label: 'Valor unitário e valor total de cada bem', path: 'both' },
      { id: 'termo-3', label: 'Total geral idêntico ao valor das notas fiscais e ao valor citado na Ata', path: 'both' },
      { id: 'termo-4', label: 'Assinatura e RG do Diretor Executivo da APM', path: 'both' },
      { id: 'termo-5', label: 'Carimbo e assinatura do Diretor da Unidade Escolar, atestando o recebimento para incorporação', path: 'both' },
    ],
    hasModel: true,
  },
  {
    id: 'notas',
    num: 4,
    title: 'Notas Fiscais',
    tag: '2ª via ou cópia legível de cada aquisição',
    intro: 'O manual não traz um modelo próprio para este item — são as próprias notas fiscais de compra dos materiais, anexadas em segunda via ou cópia legível.',
    checklist: [
      { id: 'notas-1', label: 'Valor total da nota e valor unitário discriminado de cada item (ex.: monitor, teclado, estabilizador, CPU separadamente)', path: 'both' },
      { id: 'notas-2', label: 'Atenção a descontos aplicados na nota — eles alteram o valor final de cada bem e precisam bater com a Ata e o Termo', path: 'both' },
      { id: 'notas-3c', label: 'Compras não misturam verbas de exercícios ou convênios diferentes num mesmo processo', path: 'convenio' },
    ],
    hasModel: false,
  },
  {
    id: 'fde',
    num: 5,
    title: 'Comprovante de Conferência da Prestação de Contas',
    tag: 'Apenas verba de convênio · não confundir com o Processo de Doação',
    intro: 'Antes de seguir para o Processo de Doação, a prestação de contas do convênio precisa já ter sido homologada pelo Dirigente Regional e conferida pela FDE/SE — essa prestação de contas é entregue no Setor de Finanças, e é um passo anterior e distinto da abertura do processo de doação.',
    onlyPath: 'convenio',
    checklist: [
      { id: 'fde-1', label: 'Homologação da prestação de contas pelo Coordenador Geral - Dirigente Regional já concluída', path: 'convenio' },
      { id: 'fde-2', label: 'Comprovante de conferência pela Prestação de Contas, anexado ao expediente enviado à URE', path: 'convenio' },
    ],
    hasModel: false,
  },
];

const FLOW_STEPS = [
  { title: 'Escola reúne', desc: 'Ofício, Ata da APM, Termo de Recebimento e Notas Fiscais (+ conferência da FDE, se for verba de convênio).' },
  { title: 'No SEI', desc: 'Expediente criado no SEI para o SEFISC.' },
  { title: 'SEFISC', desc: 'SEFISC analisa e monta proposta ao SEOM.' },
  { title: 'Despacho', desc: 'Coordenador Geral - Dirigente Regional autoriza o recebimento com fundamento na Resolução SE 45/2012.' },
  { title: 'Publicação no DOE', desc: 'É aqui que os bens passam a integrar o patrimônio do Estado.' },
  { title: 'Etiquetas e inventário', desc: 'URE incorpora, cadastra e envia etiquetas patrimoniais para a escola afixar.' },
];

const TIMELINE = [
  { title: 'No SEI', desc: 'Expediente criado no SEI para o SEFISC.' },
  { title: 'Instrução pelo SEFISC', desc: 'O SEFISC analisa a documentação, elabora a "Informação" com a proposta e encaminha ao SEOM.' },
  { title: 'Despacho', desc: 'O Coordenador Geral - Dirigente Regional autoriza o recebimento com fundamento na Resolução SE 45/2012.' },
  { title: 'Publicação no Diário Oficial do Estado', desc: 'Só a partir desta publicação os bens efetivamente passam a integrar o patrimônio do Estado — é o marco que protege a escola em caso de furto ou inservibilidade futura.', highlight: true },
  { title: 'Cadastro, incorporação e etiquetas', desc: 'A URE incorpora os bens, registra sequencialmente e envia à escola as etiquetas patrimoniais.' },
  { title: 'Escola afixa e atualiza o inventário', desc: 'A guarda e a ordem do inventário são responsabilidade da Unidade Escolar — as etiquetas devem ser afixadas nos bens e o cadastro atualizado no GEMAT/MCP.' },
];

const STORAGE_KEY = 'guia-doacao-checklist-v1';
const PATH_KEY = 'guia-doacao-path-v1';

function Fill({ w = 90 }: { w?: number }) {
  return <span className="inline-block border-b border-slate-400 h-4 align-baseline" style={{ width: w }} />;
}

function FacsimileWrap({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-amber-50/70 border border-amber-200 border-dashed rounded-xl px-5 py-5 overflow-x-auto">
      <div className="font-serif text-[13px] leading-7 text-slate-800 min-w-[420px]">
        {children}
      </div>
    </div>
  );
}

function OficioModel({ path }: { path: PathType }) {
  return (
    <FacsimileWrap>
      <div className="text-center mb-2">
        <div className="text-[11px] font-mono font-bold tracking-wide uppercase">Governo do Estado de São Paulo</div>
        <div className="text-[10.5px] font-mono text-slate-500 uppercase">Secretaria de Estado da Educação</div>
      </div>
      <hr className="border-t border-dashed border-amber-300 my-2" />
      <p className="text-right font-mono text-xs text-slate-600"><Fill w={110} />, <Fill w={22} /> de <Fill w={90} /> de 20<Fill w={20} />.</p>
      <p className="font-mono text-xs text-slate-600">Ofício nº <Fill w={60} /> /20<Fill w={20} /></p>
      {path === 'convenio' ? (
        <p className="font-mono text-xs text-slate-600">Assunto: Doação de Material Permanente/Convênio FNDE/MEC/PDDE/20<Fill w={20} />.</p>
      ) : (
        <p className="font-mono text-xs text-slate-600">Assunto: Doação de Material Permanente – Doação de Terceiros/Pessoa Física/Jurídica.</p>
      )}
      <p className="mt-3">Senhor(a) Dirigente,</p>
      {path === 'convenio' ? (
        <p>
          Encaminhamos a Vosso(a) Senhor(a) expediente contendo ata dos membros da Diretoria Executiva da APM;
          Termo de Recebimento do Diretor de Escola e Cópias das Notas Fiscais dos Materiais Permanentes adquiridos
          pela Associação de Pais e Mestres (APM) desta Unidade Escolar através do Convênio celebrado entre a
          Secretaria de Estado da Educação e o FNDE/MEC/PDDE/20<Fill w={20} />.
        </p>
      ) : (
        <p>
          Encaminhamos a Vossa Senhoria processo contendo Termo de Doação da <Fill w={170} />, permanente
          (<Fill w={150} />), adquiridos através de doação da Unidade citada.
        </p>
      )}
      <p>
        Tal procedimento tem como objetivo solicitar autorização para recebimento da referida doação, com
        fundamento no item 2 da alínea "b" do Inciso VI do Artigo 80 do Decreto nº 57.141/2011 e Resolução SE 45/12.
      </p>
      <p>No ensejo, reiteramos protestos de elevada estima e respeitosa consideração.</p>
      <p>Respeitosamente,</p>
      <div className="mt-6"><Fill w={220} /><div className="font-mono text-[10.5px] text-slate-500 mt-1">Carimbo/assinatura Diretor de Escola</div></div>
      <p className="mt-6">
        Ilmo.(a) Senhor(a)<br /><Fill w={260} /><br />
        DD. Dirigente Regional de Ensino.<br />
        Diretoria de Ensino Região <Fill w={160} />
      </p>
    </FacsimileWrap>
  );
}

function AtaModel({ path }: { path: PathType }) {
  return (
    <FacsimileWrap>
      <p className="text-center font-mono text-xs font-bold uppercase">APM – Doação de Materiais Permanentes</p>
      <hr className="border-t border-dashed border-amber-300 my-2" />
      <p>Ata da Reunião Extraordinária ao Conselho Deliberativo e Diretoria Executiva da APM da EE <Fill w={240} />.</p>
      <p>
        Aos <Fill w={50} /> dias do mês de <Fill w={70} /> de <Fill w={50} />, numa das salas da EE <Fill w={170} />,
        sob a coordenação do Diretor da Unidade Escolar, reuniram-se os membros do Conselho Deliberativo e Diretoria
        Executiva da Associação de Pais e Mestres, previamente convocados para tal reunião. Procedida a sua abertura,
        o Diretor explicou que o objetivo era apreciar e deliberar sobre a <strong>doação de materiais permanentes</strong> adquiridos{' '}
        {path === 'convenio' ? (
          <>com a verba do Convênio FNDE/MEC/PDDE nº <Fill w={45} />/<Fill w={45} />, no valor de R$ <Fill w={70} /> (<Fill w={150} />)</>
        ) : (
          <>com recursos próprios da APM ou recebidos em doação de terceiros</>
        )}, destinados à aquisição de materiais permanentes para uso dos alunos.
      </p>
      <p>
        Por decisão conjunta do Conselho de Escola e da APM, com esta importância foram adquiridos os seguintes
        materiais, conforme notas fiscais e datas especificadas: <Fill w={400} /> NF nº <Fill w={60} /> de <Fill w={70} />,
        da empresa <Fill w={200} />.
      </p>
      <p>
        Os materiais permanentes acima devem ser doados pela APM em favor do patrimônio do estabelecimento de
        ensino. Em seguida, pelo <strong>voto unânime</strong> dos presentes, ficou decidido que os materiais acima
        relacionados ficam doados, em caráter definitivo, passando a integrar o patrimônio da EE <Fill w={200} />.
        Nada mais a ser tratado, o senhor Diretor declarou encerrada a reunião, da qual eu, <Fill w={180} />,
        designado(a) secretário(a), lavrei a respectiva Ata que segue assinada pelos presentes:
      </p>
      <div className="flex flex-wrap gap-8 mt-6">
        <div><Fill w={180} /><div className="font-mono text-[10.5px] text-slate-500 mt-1">Diretor da Unidade Escolar</div></div>
        <div><Fill w={180} /><div className="font-mono text-[10.5px] text-slate-500 mt-1">Diretor Executivo da APM</div></div>
        <div><Fill w={180} /><div className="font-mono text-[10.5px] text-slate-500 mt-1">Membro do Conselho</div></div>
      </div>
    </FacsimileWrap>
  );
}

function TermoModel({ path }: { path: PathType }) {
  return (
    <FacsimileWrap>
      <p className="text-center font-mono text-xs font-bold uppercase">Termo de Recebimento</p>
      <hr className="border-t border-dashed border-amber-300 my-2" />
      <p className="font-mono text-xs text-slate-600">Ofício <Fill w={55} />/<Fill w={55} /></p>
      <p className="mt-2">Senhor Diretor,</p>
      <p>
        Este instrumento tem por finalidade proceder à entrega dos equipamentos adquiridos pela Associação de Pais
        e Mestres – APM da EE <Fill w={200} />, no município <Fill w={150} /> da Diretoria de Ensino Região <Fill w={150} />,
        com {path === 'convenio' ? 'recursos financeiros repassados do FNDE/MEC/PDDE' : 'recursos próprios da APM ou recebidos em doação de terceiros'}, para aquisição de materiais permanentes.
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-[11px] font-mono border-collapse my-3 min-w-[420px]">
          <thead>
            <tr className="bg-amber-100/60">
              <th className="border border-slate-400 px-2 py-1 text-left">Item</th>
              <th className="border border-slate-400 px-2 py-1 text-left">Qtde</th>
              <th className="border border-slate-400 px-2 py-1 text-left">Especificação</th>
              <th className="border border-slate-400 px-2 py-1 text-left">Valor unit.</th>
              <th className="border border-slate-400 px-2 py-1 text-left">Valor total</th>
            </tr>
          </thead>
          <tbody>
            {[0, 1, 2].map(i => (
              <tr key={i}>
                <td className="border border-slate-400 h-6" />
                <td className="border border-slate-400 h-6" />
                <td className="border border-slate-400 h-6" />
                <td className="border border-slate-400 h-6" />
                <td className="border border-slate-400 h-6" />
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap gap-8">
        <div><Fill w={160} /><div className="font-mono text-[10.5px] text-slate-500 mt-1">Local/Data</div></div>
        <div><Fill w={160} /><div className="font-mono text-[10.5px] text-slate-500 mt-1">Diretor Executivo APM</div></div>
      </div>
      <p className="mt-6">
        Recebi os equipamentos acima, a serem incorporados ao patrimônio da EE <Fill w={190} />, através do Módulo de
        Controle Patrimonial – MCP do GEMAT.
      </p>
      <div className="flex flex-wrap gap-8">
        <div><Fill w={160} /><div className="font-mono text-[10.5px] text-slate-500 mt-1">Local/Data</div></div>
        <div><Fill w={160} /><div className="font-mono text-[10.5px] text-slate-500 mt-1">Carimbo e assinatura do Diretor da UE</div></div>
      </div>
    </FacsimileWrap>
  );
}

function renderModel(docId: string, path: PathType) {
  switch (docId) {
    case 'oficio': return <OficioModel path={path} />;
    case 'ata': return <AtaModel path={path} />;
    case 'termo': return <TermoModel path={path} />;
    default: return null;
  }
}

const DOC_ICONS: Record<string, React.ReactNode> = {
  oficio: <FileText size={16} />,
  ata: <Users size={16} />,
  termo: <ClipboardList size={16} />,
  notas: <Receipt size={16} />,
  fde: <Landmark size={16} />,
};

export default function GuiaDoacaoPatrimonio() {
  const [path, setPath] = useState<PathType>(() => {
    try { return (localStorage.getItem(PATH_KEY) as PathType) || 'convenio'; } catch { return 'convenio'; }
  });
  const [checked, setChecked] = useState<Record<string, boolean>>(() => {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'); } catch { return {}; }
  });
  const [expanded, setExpanded] = useState<string | null>('oficio');
  const [modelTab, setModelTab] = useState<Record<string, 'how' | 'model'>>({});

  useEffect(() => {
    try { localStorage.setItem(PATH_KEY, path); } catch { /* ignore */ }
  }, [path]);

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(checked)); } catch { /* ignore */ }
  }, [checked]);

  const visibleDocs = useMemo(
    () => DOCS.filter(d => !d.onlyPath || d.onlyPath === path),
    [path]
  );

  const { total, done } = useMemo(() => {
    let total = 0, done = 0;
    visibleDocs.forEach(doc => {
      doc.checklist.forEach(item => {
        if (item.path === 'both' || item.path === path) {
          total += 1;
          if (checked[item.id]) done += 1;
        }
      });
    });
    return { total, done };
  }, [visibleDocs, path, checked]);

  const pct = total ? Math.round((done / total) * 100) : 0;

  function docProgress(doc: DocSection) {
    const items = doc.checklist.filter(i => i.path === 'both' || i.path === path);
    const doneCount = items.filter(i => checked[i.id]).length;
    return { total: items.length, done: doneCount, complete: items.length > 0 && doneCount === items.length };
  }

  function toggleItem(id: string) {
    setChecked(prev => ({ ...prev, [id]: !prev[id] }));
  }

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-5xl mx-auto">

      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <Stamp className="text-amber-600" size={28} />
            Guia de Doação de Material Permanente
          </h1>
          <p className="text-slate-500 text-sm mt-1 max-w-2xl">
            Passo a passo para a escola reunir e protocolar o processo de doação de material permanente à
            Unidade Regional de Ensino Guarulhos Sul — com base no Manual de Doação do Centro de Patrimônio (CEPAT), Resolução SE
            45/2012 e Decreto nº 57.141/2011.
          </p>
        </div>
      </div>

      {/* Progresso */}
      <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm flex items-center gap-4 sticky top-2 z-10">
        <span className="font-mono text-xs text-slate-500 whitespace-nowrap">{done} / {total} itens</span>
        <div className="flex-1 h-2.5 bg-slate-100 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-emerald-500 to-amber-500 rounded-full transition-all duration-300"
            style={{ width: `${pct}%` }}
          />
        </div>
        <span className="font-mono text-xs text-slate-500">{pct}%</span>
      </div>

      {/* Alerta crítico */}
      <div className="bg-red-50 border-2 border-red-100 p-5 rounded-2xl flex items-start gap-4">
        <AlertTriangle className="text-red-500 shrink-0 mt-0.5" size={22} />
        <div>
          <h2 className="text-sm font-bold text-red-800">A regra que mais gera processo travado</h2>
          <p className="text-xs text-red-700 mt-1">
            <strong>Enquanto o Processo de Doação não for publicado no Diário Oficial do Estado (DOE), os bens NÃO
            pertencem ao patrimônio do Estado.</strong> Se houver furto ou o material se tornar inservível antes
            dessa publicação, <strong>não será possível dar baixa patrimonial</strong> — o bem precisa ter
            "entrado" oficialmente antes de poder "sair".
          </p>
          <p className="text-xs text-red-700 mt-2">
            Consequência prática: não confunda a <em>prestação de contas</em> entregue a Seção de Finanças (SEFIN)
            com o <em>Processo de Doação</em> em si — são expedientes diferentes, e só o segundo, depois de
            publicado, incorpora os bens ao patrimônio.
          </p>
          <p className="text-[11px] font-mono text-red-400 mt-2">
            Decreto nº 12.983/1978, art. 46, parágrafo único · Manual de Doação CEPAT, itens 2.2.2.4 e 2.2.2.1
          </p>
        </div>
      </div>

      {/* Fluxo */}
      <div>
        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3">Fluxo do processo</h3>
        <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm">
          <div className="flex flex-col md:flex-row gap-4 md:gap-0">
            {FLOW_STEPS.map((step, i) => (
              <React.Fragment key={step.title}>
                <div className="flex-1 min-w-0 md:px-3">
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="w-7 h-7 rounded-full bg-slate-800 text-white text-xs font-mono font-bold flex items-center justify-center shrink-0">
                      {i + 1}
                    </span>
                    <span className="font-bold text-sm text-slate-700">{step.title}</span>
                  </div>
                  <p className="text-xs text-slate-500 leading-snug">{step.desc}</p>
                </div>
                {i < FLOW_STEPS.length - 1 && (
                  <div className="hidden md:flex items-center justify-center px-1 text-slate-300">
                    <ChevronRight size={16} />
                  </div>
                )}
              </React.Fragment>
            ))}
          </div>
        </div>
      </div>

      {/* Seletor de caminho */}
      <div>
        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3">Qual é o seu caminho</h3>
        <div className="bg-slate-100 p-1.5 rounded-2xl flex gap-1.5 w-full flex-col sm:flex-row">
          <button
            onClick={() => setPath('convenio')}
            className={`flex-1 text-left px-4 py-3 rounded-xl transition-all ${path === 'convenio' ? 'bg-white shadow-sm' : 'hover:bg-white/50'}`}
          >
            <div className="font-mono text-[10.5px] uppercase tracking-wider text-amber-600 font-bold">Caminho A</div>
            <div className="font-bold text-sm text-slate-800 mt-0.5">Verba de convênio (recursos públicos)</div>
            <div className="text-xs text-slate-500 mt-0.5">FNDE/MEC/PDDE e programas semelhantes — bens comprados pela APM com dinheiro público repassado à escola.</div>
          </button>
          <button
            onClick={() => setPath('terceiros')}
            className={`flex-1 text-left px-4 py-3 rounded-xl transition-all ${path === 'terceiros' ? 'bg-white shadow-sm' : 'hover:bg-white/50'}`}
          >
            <div className="font-mono text-[10.5px] uppercase tracking-wider text-amber-600 font-bold">Caminho B</div>
            <div className="font-bold text-sm text-slate-800 mt-0.5">Doação de terceiros / recursos próprios</div>
            <div className="text-xs text-slate-500 mt-0.5">Pessoa física, pessoa jurídica ou recursos próprios arrecadados pela própria APM.</div>
          </button>
        </div>
      </div>

      {/* Documentos */}
      <div>
        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3">Documentos do processo</h3>
        <div className="space-y-3">
          {visibleDocs.map(doc => {
            const isOpen = expanded === doc.id;
            const prog = docProgress(doc);
            const tab = modelTab[doc.id] || 'how';
            return (
              <div key={doc.id} className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                <button
                  onClick={() => setExpanded(isOpen ? null : doc.id)}
                  className="w-full flex items-center gap-4 px-5 py-4 text-left"
                >
                  <span className={`w-9 h-9 rounded-lg flex items-center justify-center font-mono font-bold text-sm shrink-0 transition-colors ${
                    prog.complete ? 'bg-emerald-500 text-white' : 'bg-slate-800 text-white'
                  }`}>
                    {prog.complete ? <CheckCircle2 size={18} /> : doc.num}
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="flex items-center gap-2 font-bold text-slate-800 text-[15px]">
                      {DOC_ICONS[doc.id]} {doc.title}
                    </span>
                    <span className="block font-mono text-[11px] text-slate-400 mt-0.5">{doc.tag}</span>
                  </span>
                  <span className="font-mono text-[11px] text-slate-400 shrink-0 hidden sm:inline">{prog.done}/{prog.total}</span>
                  <ChevronDown size={20} className={`text-slate-400 shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                </button>

                {isOpen && (
                  <div className="px-5 pb-5 border-t border-slate-100">
                    <div className="flex gap-1.5 mt-4 mb-4">
                      <button
                        onClick={() => setModelTab(prev => ({ ...prev, [doc.id]: 'how' }))}
                        className={`px-4 py-2 rounded-lg font-bold text-[11px] uppercase tracking-wider transition-all ${
                          tab === 'how' ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-500 hover:text-slate-700'
                        }`}
                      >
                        Como fazer
                      </button>
                      {doc.hasModel && (
                        <button
                          onClick={() => setModelTab(prev => ({ ...prev, [doc.id]: 'model' }))}
                          className={`px-4 py-2 rounded-lg font-bold text-[11px] uppercase tracking-wider transition-all ${
                            tab === 'model' ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-500 hover:text-slate-700'
                          }`}
                        >
                          Ver modelo
                        </button>
                      )}
                    </div>

                    {tab === 'how' ? (
                      <div>
                        <p className="text-sm text-slate-600 mb-4">{doc.intro}</p>
                        <div className="font-mono text-[10.5px] uppercase tracking-wider text-amber-600 font-bold mb-2">Deve conter</div>
                        <ul className="space-y-2.5">
                          {doc.checklist
                            .filter(item => item.path === 'both' || item.path === path)
                            .map(item => (
                              <li key={item.id} className="flex items-start gap-2.5">
                                <input
                                  type="checkbox"
                                  id={item.id}
                                  checked={!!checked[item.id]}
                                  onChange={() => toggleItem(item.id)}
                                  className="mt-0.5 w-4 h-4 accent-emerald-600 cursor-pointer shrink-0"
                                />
                                <label
                                  htmlFor={item.id}
                                  className={`text-sm cursor-pointer ${checked[item.id] ? 'text-slate-400 line-through decoration-emerald-500' : 'text-slate-700'}`}
                                >
                                  {item.label}
                                </label>
                              </li>
                            ))}
                        </ul>
                      </div>
                    ) : (
                      renderModel(doc.id, path)
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Depois do protocolo */}
      <div>
        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3">Depois do protocolo</h3>
        <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm">
          {TIMELINE.map((t, i) => (
            <div key={t.title} className="flex gap-4 relative pb-6 last:pb-0">
              {i < TIMELINE.length - 1 && (
                <div className="absolute left-[15px] top-8 bottom-0 w-px bg-slate-200" />
              )}
              <span className={`w-8 h-8 rounded-full flex items-center justify-center font-mono text-xs font-bold shrink-0 z-10 ${
                t.highlight ? 'bg-red-500 text-white' : 'bg-white border-2 border-amber-500 text-slate-700'
              }`}>
                {i + 1}
              </span>
              <div className="min-w-0">
                <h4 className="font-bold text-sm text-slate-800">{t.title}</h4>
                <p className="text-xs text-slate-500 mt-1">{t.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-center gap-2 text-[11px] font-mono text-slate-400 pt-2">
        <BookOpen size={13} />
        Manual de Doação · Centro de Patrimônio (CEPAT) · Departamento de Administração · SEE-SP, agosto/2015
      </div>
    </div>
  );
}

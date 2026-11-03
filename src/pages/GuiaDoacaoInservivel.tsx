import React, { useState, useEffect } from 'react';
import {
  Recycle, AlertTriangle, CheckCircle2, Copy, Check, BookOpen, Mail, Phone, Building2,
  School, Landmark, FileText, ShieldCheck, FileDown, Loader2
} from 'lucide-react';

import {
  ASSUNTO, BRASAO_URL, DIRIGENTE, MAPA_ASSINATURAS, MAPA_CAMPOS, MAPA_COLUNAS, MAPA_EXEMPLO,
  MAPA_LARGURAS, MAPA_LINHAS, MAPA_NOTA, MODELOS, numeroItem, gerarPdfEditavel, gerarWord, textoModelo,
} from '../lib/guiaInservivelModelos';
import type { Alinh, Bloco } from '../lib/guiaInservivelModelos';

const CHECKLIST_KEY = 'guia-inservivel-checklist-v1';

interface Etapa {
  nome: string;
  quem: 'Escola' | 'URE';
  resumo: string;
  onde: string;
  passos: { texto: React.ReactNode; modelos?: number[] }[];
}

const SEFISC = <span className="font-mono font-bold">SEFISC-SGU</span>;

const ETAPAS: Etapa[] = [
  {
    nome: '1ª etapa',
    quem: 'Escola',
    resumo: 'Monta o processo no SEI e envia à SEFISC-SGU.',
    onde: 'Feita pela Unidade Escolar, no SEI.',
    passos: [
      { texto: <><strong>Iniciar o processo no SEI</strong> com o assunto “{ASSUNTO}”.</> },
      { texto: <><strong>Elaborar o mapa de arrolamento</strong> com todos os bens, um estado de conservação por mapa.</>, modelos: [1] },
      { texto: <><strong>Incluir como documento externo</strong> o ofício da APM, a ata de deliberação do Conselho de Escola e as atas da última eleição da APM e do Conselho de Escola.</>, modelos: [3, 4] },
      { texto: <><strong>Elaborar e assinar eletronicamente a Informação do Diretor</strong>, que encaminha o mapa e os documentos.</>, modelos: [2] },
      { texto: <><strong>Enviar o processo</strong> à unidade {SEFISC}.</> },
    ],
  },
  {
    nome: '2ª etapa',
    quem: 'URE',
    resumo: 'Conferência, visita do Supervisor e autorização.',
    onde: 'Feita pela URE Guarulhos Sul. A escola só acompanha.',
    passos: [
      { texto: <><strong>A EAMEX confere a documentação e assina o mapa</strong>, conforme a Resolução SE 17/2017.</>, modelos: [5] },
      { texto: <><strong>O Supervisor responsável visita a escola</strong> e confirma que o material corresponde ao mapa.</>, modelos: [6, 7] },
      { texto: <><strong>SEOM e SEFISC se manifestam</strong> sobre a ausência de impedimento legal.</>, modelos: [8] },
      { texto: <><strong>A {DIRIGENTE} autoriza a doação</strong> e o processo volta à escola pelo SEI.</>, modelos: [9] },
    ],
  },
  {
    nome: '3ª etapa',
    quem: 'Escola',
    resumo: 'Retirada pela APM, ata, recibo e retorno.',
    onde: 'Feita pela Unidade Escolar, quando o processo volta pelo SEI.',
    passos: [
      { texto: <><strong>A APM retira o material em até 15 dias.</strong> Se não for possível, a escola justifica por escrito no processo.</> },
      { texto: <><strong>Juntar a Ata da APM</strong> de recebimento da doação <strong>e o recibo de retirada</strong> como documento externo.</>, modelos: [10, 11] },
      { texto: <><strong>Elaborar a Informação de retorno à Dirigente</strong> e enviar o processo à {SEFISC}.</>, modelos: [12] },
    ],
  },
  {
    nome: '4ª etapa',
    quem: 'URE',
    resumo: 'Confirmação da retirada, baixa contábil e arquivo.',
    onde: 'Feita pela URE Guarulhos Sul. A escola recebe a NL.',
    passos: [
      { texto: <><strong>O Supervisor confirma, em visita, a retirada total</strong> do material da escola.</>, modelos: [13, 14] },
      { texto: <><strong>SEOM e SEFISC autorizam a baixa contábil</strong> e a Nota de Lançamento (NL) é juntada ao processo.</>, modelos: [15] },
      { texto: <><strong>A escola retira os bens do inventário</strong> com base na NL, e o processo é arquivado.</> },
    ],
  },
];

const DOCS = [
  { id: 'mapa', label: 'Mapa de arrolamento (Modelo 1)', desc: 'Todos os bens com quantidade, nº de patrimônio e valor histórico, e um único estado de conservação.' },
  { id: 'info', label: 'Informação do Diretor (Modelo 2)', desc: 'Documento criado no SEI e assinado eletronicamente pelo Diretor da escola.' },
  { id: 'oficio', label: 'Ofício da APM (Modelo 3)', desc: 'Em papel timbrado da APM, assinado pelo Diretor Executivo e endereçado à Dirigente.' },
  { id: 'eleicao-apm', label: 'Ata da última eleição da APM', desc: 'Cópia legível, incluída no SEI como documento externo.' },
  { id: 'eleicao-conselho', label: 'Ata da última eleição do Conselho de Escola', desc: 'Cópia legível, incluída no SEI como documento externo.' },
  { id: 'deliberacao', label: 'Ata de deliberação do Conselho (Modelo 4)', desc: 'Com nome, RG e função de cada membro presente e o visto do Diretor.' },
];

const REGRAS = [
  { titulo: 'Só sem interesse de outra unidade da SEDUC', texto: 'A doação à APM é o último destino. Primeiro, a Dirigente verifica se outra escola precisa do material e pode remanejá-lo.' },
  { titulo: 'Um estado de conservação por mapa', texto: 'Siga a classificação do Decreto nº 50.179/68, art. 5º. Bens em estados diferentes (por exemplo, “Regular” e “Mau”) vão em mapas separados.' },
  { titulo: 'O material fica na escola até a autorização', texto: 'Nada sai da escola antes do despacho da Dirigente. O Supervisor precisa encontrar os bens na visita de conferência.' },
  { titulo: 'Retirada em até 15 dias', texto: 'Depois da autorização, a APM tem até 15 dias para retirar o material. Se não for possível, a escola justifica por escrito no processo.' },
  { titulo: 'Atas e recibo completos, com o CNPJ da APM', texto: 'Nome completo, RG e assinatura de todos os presentes. A ata da APM e o recibo precisam trazer o CNPJ e o endereço da associação.' },
  { titulo: 'Baixa só depois da confirmação do Supervisor e da NL', texto: 'A escola só retira os bens do inventário depois que o Supervisor confirmar a retirada total e a Nota de Lançamento (NL) estiver no processo.' },
];

const LEGISLACAO = [
  { nome: 'Resolução SE nº 41, de 26/04/2000', desc: 'Procedimentos para doação de material inservível e/ou excedente à APM.' },
  { nome: 'Decreto nº 40.645, de 31/01/1996', desc: 'Base da doação de material à APM, citado nas atas e informações.' },
  { nome: 'Decreto nº 50.179, de 07/08/1968', desc: 'Arrolamento, classificação e destinação de material excedente (art. 5º; Anexos I e II).' },
  { nome: 'Resoluções SE nº 17 e nº 23, de abril de 2017', desc: 'Grupo de Trabalho de Material Excedente (GTMEX) e designação de seus membros.' },
  { nome: 'Decreto nº 64.187/2019', desc: 'Reorganização da Secretaria da Educação.' },
];

// ---------- Prévia dos modelos (folha no formato do manual) ----------

function TextoComCampos({ texto }: { texto: string }) {
  const partes = texto.split(/(\[[^\]]+\])/g);
  return (
    <>
      {partes.map((p, i) =>
        p.startsWith('[') && p.endsWith(']')
          ? <span key={i} className="bg-orange-100 text-orange-800 rounded px-0.5 font-medium">{p}</span>
          : <React.Fragment key={i}>{p}</React.Fragment>
      )}
    </>
  );
}

const ALINH_CLASSE: Record<Alinh, string> = {
  left: 'text-left', center: 'text-center', right: 'text-right', justify: 'text-justify',
};

function Brasao({ className = 'w-14' }: { className?: string }) {
  return <img src={BRASAO_URL} alt="Brasão do Estado de São Paulo" className={`${className} h-auto shrink-0`} />;
}

function BlocoFolha({ b }: { b: Bloco }) {
  switch (b.t) {
    case 'cab-oficial':
      return (
        <div className="flex items-start gap-4 mb-10">
          <Brasao className="w-16" />
          <div className="flex-1 text-center">
            {b.linhas.map(l => <div key={l}>{l}</div>)}
            {b.escola && (
              <div className="mt-4">
                <div className="font-bold underline"><TextoComCampos texto={b.escola[0]} /></div>
                {b.escola.slice(1).map(l => <div key={l} className="text-left"><TextoComCampos texto={l} /></div>)}
              </div>
            )}
          </div>
        </div>
      );
    case 'cab-apm':
      return (
        <div className="bg-slate-300 border-4 border-double border-slate-900 text-center font-bold py-2 mb-10">
          <div className="text-[15px]">APM – Associação de Pais e Mestres</div>
          <div className="text-[15px]"><TextoComCampos texto="CNPJ nº [CNPJ DA APM]" /></div>
          <div><TextoComCampos texto={`${b.rotuloEndereco}: [ENDEREÇO DA APM]`} /></div>
        </div>
      );
    case 'titulo':
      return (
        <p className={`font-bold whitespace-pre-line mb-6 ${ALINH_CLASSE[b.alinh ?? 'left']}`}>
          <TextoComCampos texto={b.texto} />
        </p>
      );
    case 'par':
      return (
        <p className={`whitespace-pre-line mb-6 ${b.recuo ? 'indent-24 sm:indent-40' : ''} ${ALINH_CLASSE[b.alinh ?? 'left']}`}>
          <TextoComCampos texto={b.texto} />
        </p>
      );
    case 'linhas-ass':
      return (
        <div className="mb-8 space-y-5">
          {Array.from({ length: b.n }, (_, i) => (
            <div key={i} className="flex items-end gap-1">
              {b.numeradas && <span>{i + 1}</span>}
              <span className="block w-56 border-b border-slate-800" />
            </div>
          ))}
        </div>
      );
  }
}

function Folha({ blocos }: { blocos: Bloco[] }) {
  return (
    <div className="bg-slate-100 rounded-xl p-2 sm:p-5 overflow-x-auto">
      <div
        className="bg-white shadow-sm mx-auto max-w-[680px] min-w-[300px] px-6 sm:px-14 py-10 text-[13px] leading-relaxed text-slate-900"
        style={{ fontFamily: 'Verdana, Geneva, sans-serif' }}
      >
        {blocos.map((b, i) => <BlocoFolha key={i} b={b} />)}
      </div>
    </div>
  );
}

function MapaArrolamento() {
  const borda = 'border border-slate-800';
  return (
    <div>
      <div className="bg-slate-100 rounded-xl p-2 sm:p-5 overflow-x-auto">
        <div className="bg-white shadow-sm min-w-[900px] px-6 py-6 text-slate-900" style={{ fontFamily: 'Calibri, Carlito, Arial, sans-serif' }}>
          <div className="flex items-center mb-3">
            <Brasao className="w-12" />
            <div className="flex-1 text-center font-bold text-[15px] leading-tight pr-12">
              GOVERNO DO ESTADO DE SÃO PAULO<br />SECRETARIA DA EDUCAÇÃO
            </div>
          </div>
          <div className={`${borda} border-b-0 px-2 py-1`}>
            {MAPA_CAMPOS.map(([rotulo, valor]) => (
              <div key={rotulo} className="flex items-end gap-3 py-1 text-xs">
                <span className="font-bold w-44 shrink-0">{rotulo}</span>
                <span className="flex-1 border-b border-slate-800 font-bold text-sm"><TextoComCampos texto={valor} /></span>
              </div>
            ))}
          </div>
          <table className="w-full border-collapse text-xs">
            <colgroup>{MAPA_LARGURAS.map((l, i) => <col key={i} style={{ width: `${l}%` }} />)}</colgroup>
            <thead>
              <tr>
                {MAPA_COLUNAS.map(c => (
                  <th key={c} scope="col" className={`${borda} font-normal px-1 py-1 text-center align-bottom leading-tight`}>{c}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr className="bg-orange-50">
                {MAPA_EXEMPLO.map((c, i) => (
                  <td key={i} className={`${borda} px-1.5 py-1 ${i === 1 ? '' : 'text-center'}`}>{c}</td>
                ))}
              </tr>
              {Array.from({ length: MAPA_LINHAS - 1 }, (_, j) => j + 2).map(k => (
                <tr key={k}>
                  <td className={`${borda} text-center h-7`}>{numeroItem(k)}</td>
                  {MAPA_COLUNAS.slice(1).map((_, i) => <td key={i} className={borda} />)}
                </tr>
              ))}
            </tbody>
          </table>
          <div className="grid grid-cols-5 text-xs">
            {MAPA_ASSINATURAS.map((quem, i) => (
              <div key={i} className={`${borda} border-t-0 ${i > 0 ? 'border-l-0' : ''} text-center pt-3 pb-1 flex flex-col items-center`}>
                <span>Data</span>
                <span className="mt-2">.../.../....</span>
                <span className="block w-4/5 border-b border-slate-800 mt-8" />
                <span>{quem}</span>
              </div>
            ))}
            <div className={`${borda} border-t-0 border-l-0 p-1.5 text-[10px] leading-snug text-justify`}>
              Nota:<br /><br />{MAPA_NOTA}
            </div>
          </div>
        </div>
      </div>
      <p className="text-xs text-slate-500 mt-2 flex items-center gap-2">
        <span className="inline-block w-3 h-3 rounded-sm bg-orange-50 border border-orange-200" />
        Na tela, a linha 01 aparece preenchida como exemplo. No Word e no PDF as linhas vêm em branco.
      </p>
    </div>
  );
}

async function copiarTexto(texto: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(texto);
      return true;
    }
  } catch { /* tenta o método alternativo */ }
  try {
    const ta = document.createElement('textarea');
    ta.value = texto;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

const SECOES = [
  { id: 'gdi-caminho', label: 'Caminho do processo' },
  { id: 'gdi-checklist', label: 'Checklist' },
  { id: 'gdi-modelos', label: 'Modelos' },
  { id: 'gdi-regras', label: 'Regras' },
  { id: 'gdi-legislacao', label: 'Legislação' },
];

function TituloSecao({ id, num, titulo, intro }: { id: string; num: string; titulo: string; intro?: string }) {
  return (
    <div id={id} className="scroll-mt-4 mb-3">
      <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2">
        <span className="font-mono text-orange-600">{num}</span> {titulo}
      </h3>
      {intro && <p className="text-sm text-slate-500 mt-1 max-w-3xl">{intro}</p>}
    </div>
  );
}

export default function GuiaDoacaoInservivel() {
  const [etapaAtiva, setEtapaAtiva] = useState(0);
  const [modeloAtivo, setModeloAtivo] = useState(0);
  const [copiado, setCopiado] = useState(false);
  const [gerando, setGerando] = useState<'word' | 'pdf' | null>(null);
  const [checked, setChecked] = useState<Record<string, boolean>>(() => {
    try { return JSON.parse(localStorage.getItem(CHECKLIST_KEY) || '{}'); } catch { return {}; }
  });

  useEffect(() => {
    try { localStorage.setItem(CHECKLIST_KEY, JSON.stringify(checked)); } catch { /* ignore */ }
  }, [checked]);

  useEffect(() => {
    if (!copiado) return;
    const t = setTimeout(() => setCopiado(false), 2200);
    return () => clearTimeout(t);
  }, [copiado]);

  const feitos = DOCS.filter(d => checked[d.id]).length;
  const faltam = DOCS.length - feitos;
  const etapa = ETAPAS[etapaAtiva];
  const etapaEscola = etapa.quem === 'Escola';
  const modelo = MODELOS[modeloAtivo];

  function rolarPara(id: string) {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  async function copiarModelo() {
    const ok = await copiarTexto(textoModelo(modelo));
    if (ok) setCopiado(true);
  }

  async function baixarModelo(formato: 'word' | 'pdf') {
    setGerando(formato);
    try {
      if (formato === 'word') await gerarWord(modelo);
      else await gerarPdfEditavel(modelo);
    } catch (e) {
      console.error(e);
      alert('Não foi possível gerar o arquivo. Tente novamente.');
    } finally {
      setGerando(null);
    }
  }

  return (
    <div className="p-4 md:p-6 space-y-8 max-w-5xl mx-auto">

      {/* Cabeçalho */}
      <div>
        <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
          <Recycle className="text-orange-600" size={28} />
          Doação de Material Inservível à APM
        </h1>
        <p className="text-slate-500 text-sm mt-1 max-w-3xl">
          Manual para gestores escolares sobre o arrolamento de material inservível e/ou excedente e sua doação à
          Associação de Pais e Mestres da própria escola, com base na Resolução SE 41/2000 e no manual do Centro de
          Patrimônio (CEPAT), agora no SEI.
        </p>
        <div className="flex flex-wrap gap-2 mt-4">
          {SECOES.map(s => (
            <button
              key={s.id}
              onClick={() => rolarPara(s.id)}
              className="min-h-[36px] px-3.5 rounded-full bg-white border border-slate-200 text-xs font-bold text-slate-600 hover:border-slate-300 hover:text-slate-800 transition-colors"
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {/* Destaque + dados SEI */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <div className="md:col-span-3 bg-orange-50 border-2 border-orange-100 p-5 rounded-2xl flex items-start gap-4">
          <AlertTriangle className="text-orange-600 shrink-0 mt-0.5" size={22} />
          <div>
            <h2 className="text-sm font-bold text-orange-900">A doação à APM é o último destino do material</h2>
            <p className="text-sm text-orange-800 mt-1">
              A doação só acontece quando <strong>nenhuma outra unidade da SEDUC tiver interesse</strong> no material.
              Antes disso, a Dirigente pode remanejá-lo para outra escola que precise dele.
            </p>
          </div>
        </div>
        <div className="md:col-span-2 bg-slate-800 text-white p-5 rounded-2xl">
          <div className="font-mono text-[10.5px] uppercase tracking-wider text-orange-300 font-bold mb-3">Dados do processo no SEI</div>
          <dl className="space-y-2.5 text-sm">
            <div>
              <dt className="text-[11px] text-slate-400">Assunto</dt>
              <dd className="font-medium">{ASSUNTO}</dd>
            </div>
            <div className="flex gap-6 flex-wrap">
              <div>
                <dt className="text-[11px] text-slate-400">Quem inicia</dt>
                <dd className="font-medium">A Unidade Escolar</dd>
              </div>
              <div>
                <dt className="text-[11px] text-slate-400">Unidade de destino</dt>
                <dd className="font-mono font-bold text-orange-300">SEFISC-SGU</dd>
              </div>
            </div>
          </dl>
        </div>
      </div>

      {/* O que mudou */}
      <div>
        <TituloSecao id="gdi-mudou" num="01" titulo="O que mudou" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm">
            <div className="font-mono text-[10.5px] uppercase tracking-wider text-slate-400 font-bold">Antes</div>
            <h4 className="font-bold text-slate-800 mt-1">Processo em papel</h4>
            <p className="text-sm text-slate-500 mt-1">Mapa, ofício e atas eram enviados em papel à Diretoria de Ensino, que fazia a autuação do expediente.</p>
          </div>
          <div className="bg-white p-5 rounded-2xl border-2 border-orange-500 shadow-sm">
            <div className="font-mono text-[10.5px] uppercase tracking-wider text-orange-600 font-bold">Agora</div>
            <h4 className="font-bold text-slate-800 mt-1">A escola abre o processo no SEI</h4>
            <p className="text-sm text-slate-500 mt-1">
              A escola inicia o processo, assina eletronicamente, inclui os documentos da APM e do Conselho de Escola
              como “documento externo” e envia à {SEFISC}. Na 3ª etapa, o processo volta à escola pelo SEI.
            </p>
          </div>
          <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm">
            <div className="font-mono text-[10.5px] uppercase tracking-wider text-slate-400 font-bold">Quem autoriza</div>
            <h4 className="font-bold text-slate-800 mt-1">{DIRIGENTE}</h4>
            <p className="text-sm text-slate-500 mt-1">A autorização vem depois das manifestações da EAMEX, da Supervisão de Ensino e do SEOM/SEFISC.</p>
          </div>
        </div>
      </div>

      {/* Caminho */}
      <div>
        <TituloSecao
          id="gdi-caminho" num="02" titulo="O caminho do processo em 4 etapas"
          intro="Laranja: etapas feitas pela escola. Escuro: etapas feitas pela URE. Clique em uma etapa para ver os passos."
        />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {ETAPAS.map((e, i) => {
            const ativa = i === etapaAtiva;
            const escola = e.quem === 'Escola';
            const cor = escola
              ? (ativa ? 'bg-orange-600 border-orange-600 text-white' : 'bg-white border-slate-100 border-t-orange-500 hover:border-slate-200 hover:border-t-orange-500')
              : (ativa ? 'bg-slate-800 border-slate-800 text-white' : 'bg-white border-slate-100 border-t-slate-800 hover:border-slate-200 hover:border-t-slate-800');
            return (
              <button
                key={e.nome}
                onClick={() => setEtapaAtiva(i)}
                aria-pressed={ativa}
                className={`text-left p-4 rounded-2xl border border-t-4 shadow-sm transition-all ${cor}`}
              >
                <span className={`flex items-center gap-1.5 font-mono text-[10.5px] uppercase tracking-wider font-bold ${
                  ativa ? (escola ? 'text-orange-100' : 'text-slate-300') : (escola ? 'text-orange-600' : 'text-slate-500')
                }`}>
                  {escola ? <School size={13} /> : <Building2 size={13} />} {e.quem}
                </span>
                <span className={`block font-bold text-lg mt-1 ${ativa ? 'text-white' : 'text-slate-800'}`}>{e.nome}</span>
                <span className={`block text-xs mt-1 leading-snug ${ativa ? (escola ? 'text-orange-50' : 'text-slate-300') : 'text-slate-500'}`}>{e.resumo}</span>
              </button>
            );
          })}
        </div>
        <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm mt-3">
          <h4 className="font-bold text-slate-800">{etapa.nome} · {etapa.quem}</h4>
          <p className="text-xs text-slate-500 mt-0.5 mb-4">{etapa.onde}</p>
          <ol className="space-y-3">
            {etapa.passos.map((p, i) => (
              <li key={i} className="flex gap-3">
                <span className={`w-7 h-7 rounded-lg flex items-center justify-center font-mono font-bold text-xs shrink-0 ${
                  etapaEscola ? 'bg-orange-100 text-orange-700' : 'bg-slate-800 text-white'
                }`}>
                  {String(i + 1).padStart(2, '0')}
                </span>
                <span className="text-sm text-slate-700 pt-0.5">
                  {p.texto}
                  {p.modelos?.map(n => (
                    <span key={n} className="inline-block ml-1.5 font-mono text-[10.5px] font-bold bg-slate-100 text-slate-600 rounded px-1.5 py-0.5 whitespace-nowrap">
                      Modelo {n}
                    </span>
                  ))}
                </span>
              </li>
            ))}
          </ol>
        </div>
      </div>

      {/* Checklist */}
      <div>
        <TituloSecao
          id="gdi-checklist" num="03" titulo="Checklist da escola antes de enviar"
          intro="Confira se todos os documentos da 1ª etapa estão no processo SEI antes de enviá-lo à SEFISC-SGU. As marcações ficam salvas neste navegador."
        />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-start">
          <div className="md:col-span-2 space-y-2 order-2 md:order-1">
            {DOCS.map(d => (
              <label
                key={d.id}
                className={`flex items-start gap-3 bg-white p-4 rounded-2xl border shadow-sm cursor-pointer transition-colors ${
                  checked[d.id] ? 'border-emerald-200 bg-emerald-50/40' : 'border-slate-100 hover:border-slate-200'
                }`}
              >
                <input
                  type="checkbox"
                  checked={!!checked[d.id]}
                  onChange={() => setChecked(prev => ({ ...prev, [d.id]: !prev[d.id] }))}
                  className="mt-0.5 w-5 h-5 accent-emerald-600 cursor-pointer shrink-0"
                />
                <span>
                  <span className="block font-bold text-sm text-slate-800">{d.label}</span>
                  <span className="block text-xs text-slate-500 mt-0.5">{d.desc}</span>
                </span>
              </label>
            ))}
          </div>
          <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm md:sticky md:top-4 order-1 md:order-2">
            <div className="text-3xl font-bold text-slate-800">
              {feitos} <span className="text-base font-medium text-slate-400">de {DOCS.length}</span>
            </div>
            <div
              className="h-2.5 bg-slate-100 rounded-full overflow-hidden my-3"
              role="progressbar" aria-valuemin={0} aria-valuemax={DOCS.length} aria-valuenow={feitos}
            >
              <div
                className={`h-full rounded-full transition-all duration-300 ${faltam === 0 ? 'bg-emerald-500' : 'bg-orange-500'}`}
                style={{ width: `${(feitos / DOCS.length) * 100}%` }}
              />
            </div>
            {faltam === 0 ? (
              <p className="text-sm font-bold text-emerald-700 flex items-start gap-1.5">
                <CheckCircle2 size={18} className="shrink-0" /> Tudo certo. Pode enviar o processo à SEFISC-SGU.
              </p>
            ) : (
              <p className="text-sm font-bold text-orange-700">Faltam {faltam} documento{faltam > 1 ? 's' : ''}</p>
            )}
            {feitos > 0 && (
              <button
                onClick={() => setChecked({})}
                className="mt-3 text-xs font-bold text-slate-400 hover:text-slate-600"
              >
                Desmarcar tudo
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Modelos */}
      <div>
        <TituloSecao
          id="gdi-modelos" num="04" titulo="Modelos de texto para a escola"
          intro="Copie o texto, cole no editor do SEI ou no papel timbrado da APM e complete os campos entre [colchetes]. Os modelos 5 a 9 e 13 a 15 são feitos pela URE."
        />
        <div className="flex flex-wrap gap-1.5 mb-3" role="tablist" aria-label="Modelos">
          {MODELOS.map((m, i) => (
            <button
              key={m.n}
              role="tab"
              aria-selected={i === modeloAtivo}
              onClick={() => { setModeloAtivo(i); setCopiado(false); }}
              className={`min-h-[36px] px-4 rounded-full font-bold text-xs transition-all ${
                i === modeloAtivo ? 'bg-slate-800 text-white' : 'bg-white border border-slate-200 text-slate-500 hover:text-slate-700'
              }`}
            >
              Modelo {m.n}
            </button>
          ))}
        </div>
        <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm" role="tabpanel">
          <div className="flex items-start justify-between gap-4 flex-wrap mb-4">
            <div>
              <h4 className="font-bold text-slate-800 flex items-center gap-2">
                <FileText size={16} className="text-slate-400" /> Modelo {modelo.n} · {modelo.titulo}
              </h4>
              <p className="font-mono text-[11px] text-slate-400 mt-1">
                {modelo.etapa} · {modelo.tipo} · Assina: {modelo.assina}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => baixarModelo('word')}
                disabled={gerando !== null}
                className="min-h-[40px] px-4 rounded-xl font-bold text-xs flex items-center gap-1.5 bg-blue-700 text-white hover:bg-blue-800 disabled:opacity-60 transition-colors"
              >
                {gerando === 'word' ? <Loader2 size={14} className="animate-spin" /> : <FileDown size={14} />} Gerar Word
              </button>
              <button
                onClick={() => baixarModelo('pdf')}
                disabled={gerando !== null}
                className="min-h-[40px] px-4 rounded-xl font-bold text-xs flex items-center gap-1.5 bg-red-700 text-white hover:bg-red-800 disabled:opacity-60 transition-colors"
              >
                {gerando === 'pdf' ? <Loader2 size={14} className="animate-spin" /> : <FileDown size={14} />} PDF editável
              </button>
              <button
                onClick={copiarModelo}
                className={`min-h-[40px] px-4 rounded-xl font-bold text-xs flex items-center gap-1.5 transition-colors ${
                  copiado ? 'bg-emerald-600 text-white' : 'bg-slate-800 text-white hover:bg-slate-700'
                }`}
              >
                {copiado ? <><Check size={14} /> Copiado ✓</> : <><Copy size={14} /> Copiar texto</>}
              </button>
            </div>
          </div>
          {modelo.mapa ? <MapaArrolamento /> : <Folha blocos={modelo.blocos ?? []} />}
          <p className="text-xs text-slate-500 mt-3">
            Os campos destacados entre [colchetes] devem ser completados. No PDF editável, todo o texto pode ser
            alterado direto no leitor de PDF (Adobe Reader, navegador); no Word, edite normalmente.
          </p>
        </div>
      </div>

      {/* Regras */}
      <div>
        <TituloSecao id="gdi-regras" num="05" titulo="Regras que não podem ser esquecidas" intro="São os pontos que mais fazem o processo voltar para correção." />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {REGRAS.map((r, i) => (
            <div key={r.titulo} className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm">
              <span className="font-mono text-xs font-bold text-orange-600">{String(i + 1).padStart(2, '0')}</span>
              <h4 className="font-bold text-sm text-slate-800 mt-1">{r.titulo}</h4>
              <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">{r.texto}</p>
            </div>
          ))}
        </div>
        <div className="bg-slate-50 border-2 border-slate-200 p-5 rounded-2xl flex items-start gap-4 mt-4">
          <ShieldCheck className="text-slate-600 shrink-0 mt-0.5" size={22} />
          <div>
            <h4 className="text-sm font-bold text-slate-800">E se a APM não quiser o material?</h4>
            <p className="text-sm text-slate-600 mt-1">
              Nesse caso, a Resolução SE 41/2000 não se aplica. O material segue a rota do Fundo Social de
              Solidariedade do Estado de São Paulo (FUSSESP), com arrolamento pelo Decreto nº 50.179/68 nos formulários
              dos Anexos I e II e tramitação pelo CEPAT e pelo CMEX.
            </p>
            <p className="text-sm text-slate-600 mt-2">
              Essa rota tem documentos e prazos próprios. <strong>Fale com a SEFISC antes de abrir qualquer
              processo</strong> para saber qual caminho seguir.
            </p>
          </div>
        </div>
      </div>

      {/* Legislação e contato */}
      <div>
        <TituloSecao id="gdi-legislacao" num="06" titulo="Legislação e contato" />
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          <div className="md:col-span-3 bg-white p-5 rounded-2xl border border-slate-100 shadow-sm">
            <ul className="space-y-3">
              {LEGISLACAO.map(l => (
                <li key={l.nome} className="flex gap-3">
                  <Landmark size={16} className="text-slate-400 shrink-0 mt-0.5" />
                  <span>
                    <span className="block font-bold text-sm text-slate-800">{l.nome}</span>
                    <span className="block text-xs text-slate-500">{l.desc}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
          <div className="md:col-span-2 bg-slate-800 text-white p-5 rounded-2xl">
            <h4 className="font-bold">Ficou com dúvida?</h4>
            <ul className="space-y-3 mt-3 text-sm">
              <li className="flex items-center gap-2.5"><Mail size={16} className="text-slate-400 shrink-0" /> <span className="break-all">gsu.sefisc@educacao.sp.gov.br</span></li>
              <li className="flex items-center gap-2.5"><Phone size={16} className="text-slate-400 shrink-0" /> (11) 2442-2169</li>
              <li className="flex items-center gap-2.5">
                <Building2 size={16} className="text-slate-400 shrink-0" />
                <span>Unidade SEI <span className="font-mono font-bold text-orange-300">SEFISC-SGU</span></span>
              </li>
            </ul>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-center gap-2 text-[11px] font-mono text-slate-400 pt-2 text-center">
        <BookOpen size={13} className="shrink-0" />
        Baseado no manual CEPAT 2017, adaptado ao SEI · SEFISC · URE Guarulhos Sul
      </div>
    </div>
  );
}

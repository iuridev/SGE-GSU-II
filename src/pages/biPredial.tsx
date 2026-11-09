import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import {
  AlertCircle, ArrowLeft, ArrowDownRight, ArrowUpRight, Building, ExternalLink, Loader2, RefreshCw, Search,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { resolveViewRole } from '../lib/roles';
import { normalizarCie, normalizarTexto } from '../lib/fdeEnvios';
import {
  apontamentos,
  carregarVistorias,
  CONCEITO_NOME,
  CONCEITOS,
  desempenhoPorItem,
  distribuicaoPorAmbiente,
  escolasDisponiveis,
  evolucaoMensal,
  formatarData,
  inicioDoPeriodo,
  notaMedia,
  PLANILHA_VISTORIAS_URL,
  resumoPorEscola,
  type BaseVistorias,
  type Conceito,
  type LinhaAmbiente,
  type PontoMensal,
  type ResumoEscola,
} from '../lib/vistoriasFde';

interface Perfil {
  role: string;
  cie: string | null;
}

type Ordenacao = 'nota' | 'escola' | 'data' | 'variacao';

// Escala divergente: azul = adequado, vermelho = crítico. Separação validada para daltonismo.
const COR_CONCEITO: Record<Conceito, string> = {
  MB: '#256abf',
  B: '#86b6ef',
  R: '#f0a19c',
  MR: '#c93636',
};
const COR_LINHA = '#2a78d6';
const COR_GRADE = '#e5e7eb';
const COR_EIXO = '#6b7280';

const PERIODOS = [
  { valor: '0', rotulo: 'Todo o histórico' },
  { valor: '12', rotulo: 'Últimos 12 meses' },
  { valor: '6', rotulo: 'Últimos 6 meses' },
  { valor: '3', rotulo: 'Últimos 3 meses' },
];

const LIMITE_LISTA = 10;

const CARTAO = 'bg-white rounded-lg shadow-sm border border-gray-200';
const CAMPO = 'w-full p-2 border border-gray-300 rounded bg-white text-sm outline-none focus:ring-2 focus:ring-blue-500';

function nota(valor: number | null): string {
  return valor === null ? '-' : valor.toLocaleString('pt-BR', { maximumFractionDigits: 1 });
}

function Indicador({ titulo, valor, detalhe }: { titulo: string; valor: ReactNode; detalhe?: ReactNode }) {
  return (
    <div className={`${CARTAO} p-4`}>
      <p className="text-xs font-semibold text-gray-500 uppercase">{titulo}</p>
      <p className="text-2xl font-bold text-gray-900 mt-1">{valor}</p>
      {detalhe && <p className="text-xs text-gray-500 mt-1">{detalhe}</p>}
    </div>
  );
}

function Variacao({ valor }: { valor: number | null }) {
  if (valor === null) return <span className="text-gray-400">-</span>;
  if (valor === 0) return <span className="text-gray-500">Igual</span>;
  const subiu = valor > 0;
  const Icone = subiu ? ArrowUpRight : ArrowDownRight;
  return (
    <span className={`inline-flex items-center gap-0.5 font-semibold ${subiu ? 'text-green-700' : 'text-red-700'}`}>
      <Icone className="w-4 h-4" aria-hidden="true" />
      {subiu ? '+' : ''}{nota(valor)}
    </span>
  );
}

function Secao({ titulo, descricao, acoes, children }: { titulo: string; descricao?: string; acoes?: ReactNode; children: ReactNode }) {
  return (
    <section className={`${CARTAO} p-4 md:p-5`}>
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3 mb-4">
        <div>
          <h2 className="text-base font-bold text-gray-800">{titulo}</h2>
          {descricao && <p className="text-sm text-gray-500 mt-0.5">{descricao}</p>}
        </div>
        {acoes}
      </div>
      {children}
    </section>
  );
}

function BotaoMostrarTodos({ total, expandido, onAlternar }: { total: number; expandido: boolean; onAlternar: () => void }) {
  if (total <= LIMITE_LISTA) return null;
  return (
    <button type="button" onClick={onAlternar} className="mt-3 text-sm font-semibold text-blue-700 hover:underline">
      {expandido ? 'Mostrar menos' : `Mostrar todos (${total})`}
    </button>
  );
}

function DicaEvolucao({ active, payload }: { active?: boolean; payload?: readonly { payload?: PontoMensal }[] }) {
  const ponto = payload?.[0]?.payload;
  if (!active || !ponto) return null;
  return (
    <div className="bg-white border border-gray-200 rounded-md shadow-md px-3 py-2 text-sm">
      <p className="font-semibold text-gray-800">{ponto.rotulo}</p>
      <p className="text-gray-600">
        {ponto.nota === null ? 'Sem vistoria' : `Nota média: ${nota(ponto.nota)} · ${ponto.vistorias} vistoria(s)`}
      </p>
    </div>
  );
}

function DicaAmbiente({ active, payload }: { active?: boolean; payload?: readonly { payload?: LinhaAmbiente }[] }) {
  const linha = payload?.[0]?.payload;
  if (!active || !linha) return null;
  return (
    <div className="bg-white border border-gray-200 rounded-md shadow-md px-3 py-2 text-sm">
      <p className="font-semibold text-gray-800 mb-1">{linha.nome}</p>
      {CONCEITOS.map(c => (
        <p key={c} className="text-gray-600 flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: COR_CONCEITO[c] }} aria-hidden="true" />
          {CONCEITO_NOME[c]}: {linha.contagem[c]} ({nota(linha[c])}%)
        </p>
      ))}
    </div>
  );
}

export default function VistoriasPrediaisDashboard() {
  const [perfil, setPerfil] = useState<Perfil | null>(null);
  const [base, setBase] = useState<BaseVistorias | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [atualizando, setAtualizando] = useState(false);

  const [escolaFiltro, setEscolaFiltro] = useState('');
  const [periodo, setPeriodo] = useState('0');
  const [ambienteFiltro, setAmbienteFiltro] = useState('');
  const [busca, setBusca] = useState('');
  const [ordenacao, setOrdenacao] = useState<Ordenacao>('nota');
  const [todasEscolas, setTodasEscolas] = useState(false);
  const [todosItens, setTodosItens] = useState(false);

  const carregar = useCallback(async (forcar: boolean) => {
    setAtualizando(true);
    setErro(null);
    try {
      setBase(await carregarVistorias(forcar));
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Falha ao carregar as vistorias.');
    } finally {
      setAtualizando(false);
    }
  }, []);

  useEffect(() => {
    let ativo = true;

    (async () => {
      try {
        const { data: { user }, error: erroAuth } = await supabase.auth.getUser();
        if (erroAuth || !user) throw new Error('Sessão expirada. Entre novamente.');

        const { data: dadosPerfil, error: erroPerfil } = await supabase
          .from('profiles')
          .select('role, school_id')
          .eq('id', user.id)
          .single();
        if (erroPerfil || !dadosPerfil) throw new Error('Não foi possível carregar seu perfil.');

        const role = resolveViewRole(dadosPerfil.role);
        let cie: string | null = null;
        if (role === 'school_manager' && dadosPerfil.school_id) {
          const { data: escola, error: erroEscola } = await supabase
            .from('schools')
            .select('cie_code')
            .eq('id', dadosPerfil.school_id)
            .single();
          if (erroEscola) throw new Error('Não foi possível identificar sua escola.');
          cie = normalizarCie(escola?.cie_code) || null;
        }
        if (ativo) setPerfil({ role, cie });
      } catch (e) {
        if (ativo) setErro(e instanceof Error ? e.message : 'Não foi possível carregar seu perfil.');
      }
    })();
    void carregar(false);

    return () => {
      ativo = false;
    };
  }, [carregar]);

  const eEscola = perfil?.role === 'school_manager';
  const cieAtivo = eEscola ? perfil?.cie ?? '' : escolaFiltro;
  const vendoUmaEscola = !!cieAtivo;

  const escolas = useMemo(() => (base ? escolasDisponiveis(base.vistorias) : []), [base]);

  // O perfil de escola nunca recebe dados antes de o CIE dela ser conhecido.
  const filtradas = useMemo(() => {
    if (!base || !perfil || (eEscola && !perfil.cie)) return [];
    const desde = Number(periodo) ? inicioDoPeriodo(Number(periodo)) : '';
    return base.vistorias.filter(v => (!cieAtivo || v.cie === cieAtivo) && v.data >= desde);
  }, [base, perfil, eEscola, cieAtivo, periodo]);

  const evolucao = useMemo(() => evolucaoMensal(filtradas), [filtradas]);
  const ambientes = useMemo(() => distribuicaoPorAmbiente(filtradas, base?.itens ?? []), [filtradas, base]);
  const resumoEscolas = useMemo(() => resumoPorEscola(filtradas), [filtradas]);
  const itens = useMemo(() => desempenhoPorItem(filtradas, base?.itens ?? []), [filtradas, base]);

  const itensVisiveis = ambienteFiltro ? itens.filter(l => l.item.ambiente === ambienteFiltro) : itens;

  const escolasVisiveis = useMemo(() => {
    const termo = normalizarTexto(busca);
    const lista = resumoEscolas.filter(e => !termo || normalizarTexto(e.escola).includes(termo) || e.cie.includes(termo));
    const comparar: Record<Ordenacao, (a: ResumoEscola, b: ResumoEscola) => number> = {
      nota: (a, b) => a.ultimaNota - b.ultimaNota,
      escola: (a, b) => a.escola.localeCompare(b.escola, 'pt-BR'),
      data: (a, b) => b.ultimaData.localeCompare(a.ultimaData),
      // Maiores quedas primeiro; escola com uma só vistoria não tem comparação.
      variacao: (a, b) => (a.variacao ?? Infinity) - (b.variacao ?? Infinity),
    };
    return [...lista].sort(comparar[ordenacao]);
  }, [resumoEscolas, busca, ordenacao]);

  const ultimaVistoriaGeral = base?.vistorias[base.vistorias.length - 1]?.data;
  const historicoEscola = vendoUmaEscola ? [...filtradas].reverse() : [];
  const ultimaDaEscola = historicoEscola[0];
  const quedas = resumoEscolas.filter(e => (e.variacao ?? 0) < 0).length;
  const nomeEscola = escolas.find(e => e.cie === cieAtivo)?.escola;

  if (erro && (!base || !perfil)) {
    return (
      <div className="p-4 md:p-6">
        <div className={`${CARTAO} p-8 text-center max-w-lg mx-auto`}>
          <AlertCircle className="w-8 h-8 text-red-600 mx-auto mb-3" aria-hidden="true" />
          <p className="text-gray-800 font-medium">{erro}</p>
          <button type="button" onClick={() => window.location.reload()} className="mt-4 px-4 py-2 rounded-md bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700">
            Tentar novamente
          </button>
        </div>
      </div>
    );
  }

  if (!base || !perfil) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[50vh] text-gray-500 gap-2">
        <Loader2 className="w-5 h-5 animate-spin" aria-hidden="true" /> Carregando vistorias da FDE...
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-4 font-sans">
      <header className={`${CARTAO} p-4 md:p-5 flex flex-col md:flex-row md:items-center justify-between gap-4`}>
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-gray-800 flex items-center gap-2">
            <Building className="w-6 h-6 text-blue-600" aria-hidden="true" /> Vistorias Prediais
          </h1>
          <p className="text-sm text-gray-600 mt-1">Resultado das vistorias realizadas pela FDE.</p>
          <p className="text-xs text-gray-500 mt-1">
            {ultimaVistoriaGeral && <>Vistoria mais recente: {formatarData(ultimaVistoriaGeral)} · </>}
            Dados lidos às {base.lidoEm.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {perfil.role === 'regional_admin' && (
            <a href={PLANILHA_VISTORIAS_URL} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 px-3 py-2 rounded-md border border-gray-300 text-sm font-semibold text-gray-700 hover:bg-gray-50">
              <ExternalLink className="w-4 h-4" aria-hidden="true" /> Abrir planilha
            </a>
          )}
          <button type="button" onClick={() => void carregar(true)} disabled={atualizando} className="inline-flex items-center gap-2 px-3 py-2 rounded-md bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-60">
            <RefreshCw className={`w-4 h-4 ${atualizando ? 'animate-spin' : ''}`} aria-hidden="true" /> Atualizar
          </button>
        </div>
      </header>

      {erro && (
        <div role="alert" className="flex items-start gap-2 bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-lg text-sm">
          <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" aria-hidden="true" /> {erro} Exibindo a última leitura.
        </div>
      )}
      {base.linhasIgnoradas > 0 && perfil.role === 'regional_admin' && (
        <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 text-amber-900 px-4 py-3 rounded-lg text-sm">
          <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" aria-hidden="true" />
          {base.linhasIgnoradas} linha(s) da planilha foram ignoradas por não terem data, código da escola ou nota válidos.
        </div>
      )}

      <div className={`grid grid-cols-1 ${eEscola ? '' : 'md:grid-cols-2'} gap-4`}>
        {!eEscola && (
          <div className={`${CARTAO} p-4`}>
            <label htmlFor="bi-escola" className="text-xs font-bold text-gray-500 uppercase block mb-1">Escola</label>
            <select id="bi-escola" className={CAMPO} value={escolaFiltro} onChange={e => setEscolaFiltro(e.target.value)}>
              <option value="">Todas as escolas</option>
              {escolas.map(e => <option key={e.cie} value={e.cie}>{e.escola}</option>)}
            </select>
          </div>
        )}
        <div className={`${CARTAO} p-4`}>
          <label htmlFor="bi-periodo" className="text-xs font-bold text-gray-500 uppercase block mb-1">Período</label>
          <select id="bi-periodo" className={CAMPO} value={periodo} onChange={e => setPeriodo(e.target.value)}>
            {PERIODOS.map(p => <option key={p.valor} value={p.valor}>{p.rotulo}</option>)}
          </select>
        </div>
      </div>

      {eEscola && !perfil.cie ? (
        <div className={`${CARTAO} p-10 text-center text-gray-500`}>
          <AlertCircle className="w-8 h-8 mx-auto mb-2" aria-hidden="true" />
          Seu usuário não está vinculado a uma escola com código CIE cadastrado.
        </div>
      ) : filtradas.length === 0 ? (
        <div className={`${CARTAO} p-10 text-center text-gray-500`}>
          <AlertCircle className="w-8 h-8 mx-auto mb-2" aria-hidden="true" />
          Nenhuma vistoria da FDE encontrada para esta seleção.
        </div>
      ) : (
        <>
          {vendoUmaEscola && !eEscola && (
            <button type="button" onClick={() => setEscolaFiltro('')} className="inline-flex items-center gap-1 text-sm font-semibold text-blue-700 hover:underline">
              <ArrowLeft className="w-4 h-4" aria-hidden="true" /> Voltar para todas as escolas
            </button>
          )}

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <Indicador titulo="Nota média" valor={nota(notaMedia(filtradas))} detalhe="Escala de 0 a 100" />
            <Indicador titulo="Vistorias" valor={filtradas.length.toLocaleString('pt-BR')} detalhe={vendoUmaEscola ? nomeEscola : 'No período selecionado'} />
            {vendoUmaEscola && ultimaDaEscola ? (
              <>
                <Indicador titulo="Última nota" valor={nota(ultimaDaEscola.nota)} detalhe={formatarData(ultimaDaEscola.data)} />
                <Indicador titulo="Itens críticos" valor={apontamentos(ultimaDaEscola, base.itens).length} detalhe="Ruim ou muito ruim na última vistoria" />
              </>
            ) : (
              <>
                <Indicador titulo="Escolas vistoriadas" valor={resumoEscolas.length} detalhe="No período selecionado" />
                <Indicador titulo="Escolas em queda" valor={quedas} detalhe="Última nota menor que a anterior" />
              </>
            )}
          </div>

          <Secao titulo="Evolução da nota" descricao="Média das vistorias realizadas em cada mês.">
            <div className="h-64 md:h-72">
              <ResponsiveContainer width="100%" height="100%" debounce={50}>
                <LineChart data={evolucao} margin={{ top: 8, right: 12, bottom: 0, left: -20 }}>
                  <CartesianGrid vertical={false} stroke={COR_GRADE} />
                  <XAxis dataKey="rotulo" tick={{ fontSize: 12, fill: COR_EIXO }} axisLine={{ stroke: COR_GRADE }} tickLine={false} minTickGap={24} />
                  <YAxis domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} tick={{ fontSize: 12, fill: COR_EIXO }} axisLine={false} tickLine={false} />
                  <Tooltip content={<DicaEvolucao />} />
                  <Line type="linear" dataKey="nota" name="Nota média" stroke={COR_LINHA} strokeWidth={2} connectNulls dot={{ r: 4, strokeWidth: 2, stroke: '#fff', fill: COR_LINHA }} activeDot={{ r: 6, strokeWidth: 2, stroke: '#fff' }} isAnimationActive={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </Secao>

          <Secao titulo="Resultado por ambiente" descricao="Percentual de avaliações em cada conceito.">
            <div style={{ height: ambientes.length * 38 + 64 }}>
              <ResponsiveContainer width="100%" height="100%" debounce={50}>
                <BarChart data={ambientes} layout="vertical" margin={{ top: 0, right: 12, bottom: 0, left: 0 }} barCategoryGap="28%">
                  <CartesianGrid horizontal={false} stroke={COR_GRADE} />
                  <XAxis type="number" domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} tickFormatter={v => `${v}%`} tick={{ fontSize: 12, fill: COR_EIXO }} axisLine={false} tickLine={false} />
                  <YAxis type="category" dataKey="nome" width={150} tick={{ fontSize: 12, fill: '#374151' }} axisLine={false} tickLine={false} interval={0} />
                  <Tooltip content={<DicaAmbiente />} cursor={{ fill: '#f3f4f6' }} />
                  <Legend itemSorter={null} iconType="square" iconSize={10} wrapperStyle={{ fontSize: 13, paddingTop: 8 }} formatter={value => <span className="text-gray-700">{value}</span>} />
                  {CONCEITOS.map(c => (
                    <Bar key={c} dataKey={c} name={CONCEITO_NOME[c]} stackId="conceitos" fill={COR_CONCEITO[c]} stroke="#fff" strokeWidth={2} isAnimationActive={false} />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Secao>

          <Secao
            titulo="Itens que mais precisam de atenção"
            descricao="Ordenados pelo percentual de avaliações Ruim ou Muito ruim."
            acoes={(
              <div className="sm:w-60">
                <label htmlFor="bi-ambiente" className="sr-only">Ambiente</label>
                <select id="bi-ambiente" className={CAMPO} value={ambienteFiltro} onChange={e => setAmbienteFiltro(e.target.value)}>
                  <option value="">Todos os ambientes</option>
                  {ambientes.map(a => <option key={a.codigo} value={a.codigo}>{a.nome}</option>)}
                </select>
              </div>
            )}
          >
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[560px]">
                <thead>
                  <tr className="text-left text-xs uppercase text-gray-500 border-b border-gray-200">
                    <th className="py-2 pr-3 font-semibold">Item</th>
                    <th className="py-2 px-2 font-semibold text-right">Ruim + Muito ruim</th>
                    {CONCEITOS.map(c => <th key={c} className="py-2 pl-2 font-semibold text-right" title={CONCEITO_NOME[c]}>{c}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {(todosItens ? itensVisiveis : itensVisiveis.slice(0, LIMITE_LISTA)).map(l => (
                    <tr key={l.item.coluna} className="border-b border-gray-100">
                      <td className="py-2 pr-3">
                        <span className="text-gray-900 font-medium">{l.item.fator}</span>
                        <span className="block text-xs text-gray-500">{l.item.ambienteNome}</span>
                      </td>
                      <td className="py-2 px-2 text-right tabular-nums font-semibold text-gray-900">{nota(l.percentualCritico)}%</td>
                      {CONCEITOS.map(c => <td key={c} className="py-2 pl-2 text-right tabular-nums text-gray-700">{l.contagem[c]}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <BotaoMostrarTodos total={itensVisiveis.length} expandido={todosItens} onAlternar={() => setTodosItens(v => !v)} />
          </Secao>

          {vendoUmaEscola ? (
            <Secao titulo="Histórico de vistorias" descricao="Da mais recente para a mais antiga.">
              <ol className="space-y-3">
                {historicoEscola.map((v, i) => {
                  const anterior = historicoEscola[i + 1];
                  const criticos = apontamentos(v, base.itens);
                  return (
                    <li key={v.id} className="border border-gray-200 rounded-lg p-3 md:p-4">
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <span className="font-semibold text-gray-800">{formatarData(v.data)}</span>
                        <span className="text-sm text-gray-600">
                          Nota <strong className="text-lg text-gray-900">{nota(v.nota)}</strong>
                          {anterior && <span className="ml-2"><Variacao valor={v.nota - anterior.nota} /></span>}
                        </span>
                      </div>
                      {criticos.length > 0 && (
                        <div className="mt-2">
                          <p className="text-xs font-semibold uppercase text-gray-500 mb-1">Itens críticos</p>
                          <ul className="flex flex-wrap gap-1.5">
                            {criticos.map(({ item, conceito }) => (
                              <li key={item.coluna} className="text-xs bg-gray-100 text-gray-800 rounded px-2 py-1">
                                {item.ambienteNome}: {item.fator} <strong>({conceito})</strong>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {(v.pontosNegativos > 0 || v.textoNegativo) && (
                        <p className="text-sm text-gray-700 mt-2 whitespace-pre-line break-words">
                          <strong>Pontuação negativa ({v.pontosNegativos}):</strong> {v.textoNegativo || 'Sem observação'}
                        </p>
                      )}
                      {(v.pontosPositivos > 0 || v.textoPositivo) && (
                        <p className="text-sm text-gray-700 mt-2 whitespace-pre-line break-words">
                          <strong>Pontuação positiva ({v.pontosPositivos}):</strong> {v.textoPositivo || 'Sem observação'}
                        </p>
                      )}
                    </li>
                  );
                })}
              </ol>
            </Secao>
          ) : (
            <Secao
              titulo="Situação por escola"
              descricao="Clique em uma escola para ver o histórico de vistorias."
              acoes={(
                <div className="flex flex-col sm:flex-row gap-2">
                  <div className="relative sm:w-56">
                    <Search className="w-4 h-4 absolute left-2.5 top-2.5 text-gray-400" aria-hidden="true" />
                    <label htmlFor="bi-busca" className="sr-only">Buscar escola</label>
                    <input id="bi-busca" type="search" placeholder="Buscar escola ou CIE" className={`${CAMPO} pl-8`} value={busca} onChange={e => setBusca(e.target.value)} />
                  </div>
                  <div className="sm:w-52">
                    <label htmlFor="bi-ordem" className="sr-only">Ordenar escolas</label>
                    <select id="bi-ordem" className={CAMPO} value={ordenacao} onChange={e => setOrdenacao(e.target.value as Ordenacao)}>
                      <option value="nota">Menor última nota</option>
                      <option value="variacao">Maior queda</option>
                      <option value="data">Vistoria mais recente</option>
                      <option value="escola">Nome da escola</option>
                    </select>
                  </div>
                </div>
              )}
            >
              <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-[640px]">
                  <thead>
                    <tr className="text-left text-xs uppercase text-gray-500 border-b border-gray-200">
                      <th className="py-2 pr-3 font-semibold">Escola</th>
                      <th className="py-2 px-2 font-semibold text-right">Última nota</th>
                      <th className="py-2 px-2 font-semibold text-right">Variação</th>
                      <th className="py-2 px-2 font-semibold">Última vistoria</th>
                      <th className="py-2 px-2 font-semibold text-right">Média</th>
                      <th className="py-2 pl-2 font-semibold text-right">Vistorias</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(todasEscolas ? escolasVisiveis : escolasVisiveis.slice(0, LIMITE_LISTA)).map(e => (
                      <tr key={e.cie} className="border-b border-gray-100 hover:bg-blue-50">
                        <td className="py-2 pr-3">
                          <button type="button" onClick={() => setEscolaFiltro(e.cie)} className="text-left font-medium text-blue-700 hover:underline">{e.escola}</button>
                        </td>
                        <td className="py-2 px-2 text-right tabular-nums font-semibold text-gray-900">{nota(e.ultimaNota)}</td>
                        <td className="py-2 px-2 text-right tabular-nums"><Variacao valor={e.variacao} /></td>
                        <td className="py-2 px-2 tabular-nums text-gray-700">{formatarData(e.ultimaData)}</td>
                        <td className="py-2 px-2 text-right tabular-nums text-gray-700">{nota(e.media)}</td>
                        <td className="py-2 pl-2 text-right tabular-nums text-gray-700">{e.vistorias}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {escolasVisiveis.length === 0 && <p className="text-sm text-gray-500 py-4 text-center">Nenhuma escola encontrada.</p>}
              <BotaoMostrarTodos total={escolasVisiveis.length} expandido={todasEscolas} onAlternar={() => setTodasEscolas(v => !v)} />
            </Secao>
          )}
        </>
      )}
    </div>
  );
}

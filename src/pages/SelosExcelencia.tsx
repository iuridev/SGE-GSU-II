import { useState, useEffect, useCallback, useMemo, type ReactNode } from 'react';
import toast from 'react-hot-toast';
import { supabase } from '../lib/supabase';
import { resolveViewRole, isReadOnlyRole } from '../lib/roles';
import {
  METRICAS, textoCriterio, selosEmRisco, type Selo, type SeloEscola, type ResultadoMetrica,
} from '../lib/selosMetricas';
import { SeloBadge, SELO_ICONES, SELO_CORES, SELO_FORMATOS, SELO_ACABAMENTOS } from '../components/SeloBadge';
import { Award, Loader2, Plus, Pencil, X, Check, Undo2, AlertTriangle } from 'lucide-react';

// Selos de Excelência. Duas visões na mesma página:
//  - Regional: para cada selo, as escolas aptas segundo a métrica e as já
//    contempladas no ano; só o regional_admin concede/revoga e edita o catálogo.
//  - Escola (school_manager): galeria dos selos conquistados, por ano.
// Ver migration 20260930000000_selos_excelencia.sql.

interface SchoolRow { id: string; name: string }

type MetricasPorSelo = Record<string, Map<string, ResultadoMetrica>>;

const ANO_ATUAL = new Date().getFullYear();
// Primeiro ano de vigência dos selos.
const ANO_INICIAL = 2026;

const FORM_VAZIO = {
  nome: '', descricao: '', icone: 'award', cor: 'amber', formato: 'circulo', acabamento: 'gradiente', metrica: '', criterio_minimo: '1', ativo: true,
};

function slugify(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

const aparencia = (s: Pick<Selo, 'icone' | 'cor' | 'formato' | 'acabamento'>) => ({
  icone: s.icone, cor: s.cor, formato: s.formato, acabamento: s.acabamento,
});

const dataBR = (iso: string) => new Date(iso).toLocaleDateString('pt-BR');

export default function SelosExcelencia() {
  const [role, setRole] = useState('');
  const [somenteLeitura, setSomenteLeitura] = useState(false);
  const [usuario, setUsuario] = useState<{ id: string; nome: string } | null>(null);
  const [minhaEscolaId, setMinhaEscolaId] = useState<string | null>(null);

  const [schools, setSchools] = useState<SchoolRow[]>([]);
  const [selos, setSelos] = useState<Selo[]>([]);
  const [concessoes, setConcessoes] = useState<SeloEscola[]>([]);
  const [ano, setAno] = useState(ANO_ATUAL);
  const [metricas, setMetricas] = useState<MetricasPorSelo>({});
  const [metricasComErro, setMetricasComErro] = useState<string[]>([]);

  const [carregando, setCarregando] = useState(true);
  const [calculando, setCalculando] = useState(false);
  const [processando, setProcessando] = useState<string | null>(null);
  const [manualEscola, setManualEscola] = useState<Record<string, string>>({});

  const [editando, setEditando] = useState<Selo | 'novo' | null>(null);
  const [form, setForm] = useState(FORM_VAZIO);
  const [salvando, setSalvando] = useState(false);

  const podeGerenciar = role === 'regional_admin' && !somenteLeitura;
  const visaoEscola = role === 'school_manager';

  const carregar = useCallback(async () => {
    const [selosRes, concessoesRes] = await Promise.all([
      (supabase as any).from('selos').select('*').order('ordem').order('nome'),
      (supabase as any).from('selos_escolas').select('*').order('concedido_em', { ascending: false }),
    ]);
    if (selosRes.error || concessoesRes.error) {
      console.error('Erro ao carregar selos:', selosRes.error || concessoesRes.error);
      toast.error('Não foi possível carregar os selos.');
      return;
    }
    setSelos(selosRes.data || []);
    setConcessoes(concessoesRes.data || []);
  }, []);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: p } = await (supabase as any).from('profiles').select('role, school_id, full_name').eq('id', user.id).single();
        setRole(resolveViewRole(p?.role || ''));
        setSomenteLeitura(isReadOnlyRole(p?.role || ''));
        setMinhaEscolaId(p?.school_id || null);
        setUsuario({ id: user.id, nome: p?.full_name || user.email || '' });
      }
      const { data: sc } = await (supabase as any).from('schools').select('id, name').order('name');
      setSchools(sc || []);
      await carregar();
      setCarregando(false);
    })();
  }, [carregar]);

  // Recalcula as métricas dos selos automáticos sempre que muda o ano ou o
  // catálogo. Cada métrica é calculada uma única vez, mesmo que mais de um
  // selo a utilize.
  const chavesMetricas = useMemo(
    () => Array.from(new Set(selos.map(s => s.metrica).filter((m): m is string => !!m && !!METRICAS[m]))).sort().join(','),
    [selos],
  );

  useEffect(() => {
    if (visaoEscola || !chavesMetricas || schools.length === 0) return;
    let ativo = true;
    setCalculando(true);
    (async () => {
      const chaves = chavesMetricas.split(',');
      const resultados = await Promise.allSettled(chaves.map(c => METRICAS[c].calcular(ano, schools)));
      if (!ativo) return;
      const novo: MetricasPorSelo = {};
      const erros: string[] = [];
      resultados.forEach((r, i) => {
        if (r.status === 'fulfilled') novo[chaves[i]] = r.value;
        else { console.error(`Erro ao calcular métrica ${chaves[i]}:`, r.reason); erros.push(chaves[i]); }
      });
      setMetricas(novo);
      setMetricasComErro(erros);
      setCalculando(false);
    })();
    return () => { ativo = false; };
  }, [chavesMetricas, ano, schools, visaoEscola]);

  // Galeria da escola: selos do ano corrente que ela corre o risco de perder
  // (índice abaixo do critério hoje). Selos de anos anteriores são histórico.
  const [emRisco, setEmRisco] = useState<Map<string, string>>(new Map());
  useEffect(() => {
    if (!visaoEscola || !minhaEscolaId) return;
    let ativo = true;
    const ids = new Set(concessoes.filter(c => c.school_id === minhaEscolaId && c.ano === ANO_ATUAL).map(c => c.selo_id));
    selosEmRisco(selos.filter(s => ids.has(s.id)), minhaEscolaId, ANO_ATUAL)
      .then(risco => { if (ativo) setEmRisco(risco); })
      .catch(err => console.error('Erro ao avaliar risco dos selos:', err));
    return () => { ativo = false; };
  }, [visaoEscola, minhaEscolaId, selos, concessoes]);

  const nomeEscola = useMemo(() => new Map(schools.map(s => [s.id, s.name])), [schools]);

  const conceder = async (selo: Selo, schoolId: string) => {
    const resultado = selo.metrica ? metricas[selo.metrica]?.get(schoolId) : undefined;
    const minimo = selo.criterio_minimo ?? 1;
    const foraDoCriterio = !!selo.metrica && (resultado?.valor ?? 0) < minimo;
    if (foraDoCriterio && !window.confirm(
      `${nomeEscola.get(schoolId)} não atinge o critério deste selo em ${ano} (${textoCriterio(selo).toLowerCase()}). Conceder mesmo assim?`,
    )) return;

    setProcessando(`${selo.id}-${schoolId}`);
    try {
      const { error } = await (supabase as any).from('selos_escolas').insert([{
        selo_id: selo.id,
        school_id: schoolId,
        ano,
        valor_metrica: resultado?.valor ?? null,
        detalhe_metrica: resultado?.detalhe ?? null,
        concedido_por: usuario?.id ?? null,
        concedido_por_nome: usuario?.nome ?? '',
      }]);
      if (error) throw error;
      toast.success(`Selo ${selo.nome} concedido.`);
      setManualEscola(prev => ({ ...prev, [selo.id]: '' }));
      await carregar();
    } catch (err: any) {
      console.error('Erro ao conceder selo:', err);
      toast.error(err?.message || 'Não foi possível conceder o selo.');
    } finally {
      setProcessando(null);
    }
  };

  const revogar = async (selo: Selo, concessao: SeloEscola) => {
    if (!window.confirm(`Revogar o selo ${selo.nome} ${concessao.ano} de ${nomeEscola.get(concessao.school_id)}?`)) return;
    setProcessando(`${selo.id}-${concessao.school_id}`);
    try {
      const { error } = await (supabase as any).from('selos_escolas').delete().eq('id', concessao.id);
      if (error) throw error;
      toast.success('Selo revogado.');
      await carregar();
    } catch (err: any) {
      console.error('Erro ao revogar selo:', err);
      toast.error(err?.message || 'Não foi possível revogar o selo.');
    } finally {
      setProcessando(null);
    }
  };

  const abrirForm = (selo: Selo | 'novo') => {
    setEditando(selo);
    setForm(selo === 'novo' ? FORM_VAZIO : {
      nome: selo.nome,
      descricao: selo.descricao,
      icone: selo.icone,
      cor: selo.cor,
      formato: selo.formato || 'circulo',
      acabamento: selo.acabamento || 'gradiente',
      metrica: selo.metrica || '',
      criterio_minimo: String(selo.criterio_minimo ?? 1),
      ativo: selo.ativo,
    });
  };

  const salvarSelo = async () => {
    if (!form.nome.trim()) { toast.error('Informe o nome do selo.'); return; }
    const minimo = METRICAS[form.metrica]?.criterioFixo ? 1 : Number(form.criterio_minimo);
    if (form.metrica && !(minimo > 0)) { toast.error('Informe um critério mínimo maior que zero.'); return; }

    setSalvando(true);
    try {
      const payload = {
        nome: form.nome.trim(),
        descricao: form.descricao.trim(),
        icone: form.icone,
        cor: form.cor,
        formato: form.formato,
        acabamento: form.acabamento,
        metrica: form.metrica || null,
        criterio_minimo: form.metrica ? minimo : null,
        ativo: form.ativo,
      };
      const { error } = editando === 'novo'
        ? await (supabase as any).from('selos').insert([{
            ...payload,
            slug: slugify(form.nome),
            ordem: selos.reduce((max, s) => Math.max(max, s.ordem), 0) + 10,
          }])
        : await (supabase as any).from('selos').update(payload).eq('id', (editando as Selo).id);
      if (error) throw error;
      toast.success('Selo salvo.');
      setEditando(null);
      await carregar();
    } catch (err: any) {
      console.error('Erro ao salvar selo:', err);
      toast.error(err?.code === '23505' ? 'Já existe um selo com esse nome.' : (err?.message || 'Não foi possível salvar o selo.'));
    } finally {
      setSalvando(false);
    }
  };

  if (carregando) {
    return (
      <div className="flex items-center justify-center py-24 text-slate-400">
        <Loader2 size={28} className="animate-spin" />
      </div>
    );
  }

  const anos = Array.from({ length: ANO_ATUAL - ANO_INICIAL + 1 }, (_, i) => ANO_ATUAL - i);

  // ── Visão da escola: galeria ─────────────────────────────────────────
  if (visaoEscola) {
    const minhas = concessoes.filter(c => c.school_id === minhaEscolaId);
    const anosGaleria = Array.from(new Set(minhas.map(c => c.ano))).sort((a, b) => b - a);

    return (
      <div className="max-w-6xl mx-auto space-y-8">
        <Cabecalho subtitulo="Reconhecimentos conquistados pela sua escola" />

        {anosGaleria.length === 0 && (
          <div className="bg-white rounded-2xl border border-slate-200 py-16 px-6 text-center">
            <Award size={36} className="mx-auto text-slate-200 mb-3" />
            <p className="text-sm text-slate-500 font-medium">Sua escola ainda não possui selos.</p>
            <p className="text-xs text-slate-400 mt-1">Os selos concedidos pela Regional aparecerão aqui.</p>
          </div>
        )}

        {anosGaleria.map(anoGaleria => {
          const doAno = minhas.filter(c => c.ano === anoGaleria);
          return (
            <section key={anoGaleria}>
              <h2 className="text-sm font-black text-slate-400 uppercase tracking-[0.2em] mb-4">
                {anoGaleria} · {doAno.length} selo(s)
              </h2>
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {doAno.map(concessao => {
                  const selo = selos.find(s => s.id === concessao.selo_id);
                  if (!selo) return null;
                  const risco = anoGaleria === ANO_ATUAL ? emRisco.get(selo.id) : undefined;
                  return (
                    <div key={concessao.id} className="relative bg-white rounded-2xl border border-slate-200 p-6 flex flex-col items-center text-center shadow-sm">
                      {risco && <div className="absolute inset-0 rounded-2xl border-2 border-red-500 animate-pulse pointer-events-none" />}
                      <SeloBadge {...aparencia(selo)} tamanho="lg" />
                      <p className="mt-4 text-sm font-black text-slate-900 uppercase tracking-tight">{selo.nome}</p>
                      <p className="mt-1 text-xs text-slate-500 leading-snug">{selo.descricao}</p>
                      <p className="mt-3 text-[10px] font-bold text-emerald-600 uppercase tracking-widest">
                        Concedido em {dataBR(concessao.concedido_em)}
                      </p>
                      {risco && (
                        <div className="mt-3 w-full flex items-start gap-2 text-left text-[11px] text-red-700 bg-red-50 border border-red-200 rounded-lg p-2.5">
                          <AlertTriangle size={14} className="shrink-0 mt-0.5" />
                          <span>
                            <strong>Risco de perder o selo.</strong> Situação atual: {risco}. Critério: {textoCriterio(selo).toLowerCase()}.
                          </span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>
    );
  }

  // ── Visão da Regional: aptas e contempladas por selo ─────────────────

  // Escolas contempladas que, pela métrica de hoje, não atingem mais o critério
  // do selo (o índice caiu depois da concessão). Só dá para afirmar isso quando
  // a métrica foi calculada para o ano em tela; selo manual nunca entra.
  const foraDoCriterio = (selo: Selo): Set<string> => {
    const fora = new Set<string>();
    const metrica = selo.metrica ? METRICAS[selo.metrica] : undefined;
    const resultados = selo.metrica ? metricas[selo.metrica] : undefined;
    if (!metrica || !resultados || calculando) return fora;
    if (metrica.somenteAnoCorrente && ano !== ANO_ATUAL) return fora;
    const minimo = selo.criterio_minimo ?? 1;
    concessoes.forEach(c => {
      if (c.selo_id !== selo.id || c.ano !== ano) return;
      if ((resultados.get(c.school_id)?.valor ?? 0) < minimo) fora.add(c.school_id);
    });
    return fora;
  };
  const totalForaDoCriterio = selos.reduce((total, s) => total + foraDoCriterio(s).size, 0);

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <Cabecalho subtitulo="Escolas aptas e contempladas em cada categoria" />
        <div className="flex items-center gap-3">
          <select
            value={ano}
            onChange={e => setAno(Number(e.target.value))}
            className="px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-bold text-slate-700"
          >
            {anos.map(a => <option key={a} value={a}>Ano {a}</option>)}
          </select>
          {podeGerenciar && (
            <button onClick={() => abrirForm('novo')} className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-black uppercase tracking-widest shadow-sm transition-colors">
              <Plus size={16} /> Novo selo
            </button>
          )}
        </div>
      </div>

      {totalForaDoCriterio > 0 && (
        <div className="flex items-start gap-3 bg-red-50 border border-red-200 text-red-800 rounded-2xl p-4">
          <AlertTriangle size={18} className="shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-black">
              {totalForaDoCriterio} selo(s) de {ano} com a escola abaixo do critério
            </p>
            <p className="text-xs mt-0.5">
              O índice dessas escolas caiu depois da concessão. Elas estão destacadas em vermelho abaixo{podeGerenciar ? ', com o botão para revogar o selo' : ''}.
            </p>
          </div>
        </div>
      )}

      {selos.length === 0 && (
        <div className="bg-white rounded-2xl border border-slate-200 py-16 text-center text-sm text-slate-400">
          Nenhum selo cadastrado.
        </div>
      )}

      {selos.map(selo => {
        const doSelo = concessoes.filter(c => c.selo_id === selo.id && c.ano === ano);
        const contempladas = new Set(doSelo.map(c => c.school_id));
        const minimo = selo.criterio_minimo ?? 1;
        const resultados = selo.metrica ? metricas[selo.metrica] : undefined;
        const metricaDesconhecida = !!selo.metrica && !METRICAS[selo.metrica];
        const metricaFalhou = !!selo.metrica && metricasComErro.includes(selo.metrica);
        const aptas = resultados
          ? schools
              .filter(s => !contempladas.has(s.id) && (resultados.get(s.id)?.valor ?? 0) >= minimo)
              .sort((a, b) => (resultados.get(b.id)?.valor ?? 0) - (resultados.get(a.id)?.valor ?? 0))
          : [];
        const restantes = schools.filter(s => !contempladas.has(s.id));
        const fora = foraDoCriterio(selo);
        // Quem caiu abaixo do critério aparece primeiro na lista de contempladas.
        const doSeloOrdenado = [...doSelo].sort((a, b) => Number(fora.has(b.school_id)) - Number(fora.has(a.school_id)));

        return (
          <div key={selo.id} className={`bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden ${selo.ativo ? '' : 'opacity-60'}`}>
            <div className="p-6 flex items-start gap-4 border-b border-slate-100">
              <SeloBadge {...aparencia(selo)} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="text-base font-black text-slate-900 uppercase tracking-tight">{selo.nome}</h3>
                  {!selo.ativo && <span className="text-[9px] font-black uppercase tracking-widest bg-slate-100 text-slate-500 px-2 py-0.5 rounded">Inativo</span>}
                  {fora.size > 0 && (
                    <span className="flex items-center gap-1 text-[9px] font-black uppercase tracking-widest bg-red-100 text-red-700 px-2 py-0.5 rounded">
                      <AlertTriangle size={10} /> {fora.size} abaixo do critério
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-500 mt-1 leading-snug">{selo.descricao}</p>
                <p className={`text-[10px] font-bold uppercase tracking-widest mt-2 ${(SELO_CORES[selo.cor] || SELO_CORES.amber).texto}`}>
                  {textoCriterio(selo)}
                </p>
              </div>
              {podeGerenciar && (
                <button onClick={() => abrirForm(selo)} title="Editar selo" className="p-2 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors">
                  <Pencil size={16} />
                </button>
              )}
            </div>

            <div className="grid md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-slate-100">
              {/* APTAS */}
              <div className="p-6">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">
                  Escolas aptas{resultados ? ` (${aptas.length})` : ''}
                </p>
                {!selo.metrica ? (
                  <p className="text-xs text-slate-400">Selo de atribuição manual: escolha a escola abaixo.</p>
                ) : metricaDesconhecida ? (
                  <Aviso texto="A métrica deste selo não está disponível nesta versão do sistema." />
                ) : metricaFalhou ? (
                  <Aviso texto="Não foi possível calcular a métrica agora. Tente recarregar a página." />
                ) : METRICAS[selo.metrica].somenteAnoCorrente && ano !== ANO_ATUAL ? (
                  <p className="text-xs text-slate-400">Este selo usa a situação atual da escola no Ranking, então só há sugestão de aptas no ano corrente.</p>
                ) : calculando || !resultados ? (
                  <div className="flex items-center gap-2 text-xs text-slate-400"><Loader2 size={14} className="animate-spin" /> Calculando…</div>
                ) : aptas.length === 0 ? (
                  <p className="text-xs text-slate-400">Nenhuma escola apta aguardando concessão em {ano}.</p>
                ) : (
                  <ul className="space-y-2 max-h-80 overflow-y-auto custom-scrollbar pr-1">
                    {aptas.map(s => (
                      <li key={s.id} className="flex items-center gap-3 p-3 rounded-xl bg-slate-50">
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-bold text-slate-800 truncate">{s.name}</p>
                          <p className="text-[11px] text-slate-500">{resultados.get(s.id)?.detalhe}</p>
                        </div>
                        {podeGerenciar && (
                          <button
                            onClick={() => conceder(selo, s.id)}
                            disabled={processando === `${selo.id}-${s.id}`}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-white rounded-lg text-[10px] font-black uppercase tracking-widest transition-colors"
                          >
                            <Check size={12} /> Conceder
                          </button>
                        )}
                      </li>
                    ))}
                  </ul>
                )}

                {podeGerenciar && (
                  <div className="mt-4 flex items-center gap-2">
                    <select
                      value={manualEscola[selo.id] || ''}
                      onChange={e => setManualEscola(prev => ({ ...prev, [selo.id]: e.target.value }))}
                      className="flex-1 min-w-0 px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs text-slate-700"
                    >
                      <option value="">Conceder a outra escola…</option>
                      {restantes.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                    <button
                      onClick={() => conceder(selo, manualEscola[selo.id])}
                      disabled={!manualEscola[selo.id] || processando !== null}
                      className="px-3 py-2 bg-slate-800 hover:bg-slate-900 disabled:opacity-40 text-white rounded-lg text-[10px] font-black uppercase tracking-widest transition-colors"
                    >
                      Conceder
                    </button>
                  </div>
                )}
              </div>

              {/* CONTEMPLADAS */}
              <div className="p-6">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">
                  Contempladas em {ano} ({doSelo.length})
                </p>
                {doSelo.length === 0 ? (
                  <p className="text-xs text-slate-400">Nenhuma escola recebeu este selo em {ano}.</p>
                ) : (
                  <ul className="space-y-2 max-h-80 overflow-y-auto custom-scrollbar pr-1">
                    {doSeloOrdenado.map(c => {
                      const caiu = fora.has(c.school_id);
                      return (
                        <li key={c.id} className={`flex items-center gap-3 p-3 rounded-xl ${caiu ? 'bg-red-50 border border-red-200' : 'bg-slate-50'}`}>
                          <SeloBadge {...aparencia(selo)} tamanho="sm" />
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-bold text-slate-800 truncate">{nomeEscola.get(c.school_id) || 'Escola removida'}</p>
                            <p className="text-[11px] text-slate-500">
                              {c.detalhe_metrica ? `${c.detalhe_metrica} · ` : ''}
                              {dataBR(c.concedido_em)}{c.concedido_por_nome ? ` por ${c.concedido_por_nome}` : ''}
                            </p>
                            {caiu && (
                              <p className="flex items-start gap-1 text-[11px] font-bold text-red-700 mt-1">
                                <AlertTriangle size={12} className="shrink-0 mt-0.5" />
                                <span>Abaixo do critério hoje: {resultados?.get(c.school_id)?.detalhe || 'a escola não atende mais às condições do selo'}</span>
                              </p>
                            )}
                          </div>
                          {podeGerenciar && (caiu ? (
                            <button
                              onClick={() => revogar(selo, c)}
                              disabled={processando === `${selo.id}-${c.school_id}`}
                              className="flex items-center gap-1.5 px-3 py-1.5 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white rounded-lg text-[10px] font-black uppercase tracking-widest transition-colors"
                            >
                              <Undo2 size={12} /> Revogar
                            </button>
                          ) : (
                            <button
                              onClick={() => revogar(selo, c)}
                              disabled={processando === `${selo.id}-${c.school_id}`}
                              title="Revogar selo"
                              className="p-2 rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-50 transition-colors"
                            >
                              <Undo2 size={14} />
                            </button>
                          ))}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </div>
          </div>
        );
      })}

      {/* MODAL: NOVO / EDITAR SELO */}
      {editando && (
        <div className="fixed inset-0 z-[100] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto custom-scrollbar">
            <div className="p-6 border-b border-slate-100 flex items-center justify-between">
              <h2 className="text-lg font-black uppercase tracking-tight">{editando === 'novo' ? 'Novo selo' : 'Editar selo'}</h2>
              <button onClick={() => setEditando(null)} className="p-2 rounded-lg text-slate-400 hover:bg-slate-100"><X size={18} /></button>
            </div>

            <div className="p-6 space-y-5">
              <div className="flex items-center gap-4">
                <div className="flex items-end gap-2" title="Prévia: galeria, painel e barra do topo">
                  <SeloBadge {...aparencia(form)} tamanho="lg" />
                  <SeloBadge {...aparencia(form)} tamanho="md" />
                  <SeloBadge {...aparencia(form)} tamanho="sm" />
                </div>
                <div className="flex-1 space-y-3">
                  <Campo label="Nome">
                    <input value={form.nome} onChange={e => setForm({ ...form, nome: e.target.value })} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm" placeholder="Ex.: Gestão Patrimonial" />
                  </Campo>
                </div>
              </div>

              <Campo label="Descrição">
                <textarea value={form.descricao} onChange={e => setForm({ ...form, descricao: e.target.value })} rows={2} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm" placeholder="O que a escola faz para merecer este selo" />
              </Campo>

              <Campo label="Formato">
                <div className="flex flex-wrap gap-3">
                  {Object.entries(SELO_FORMATOS).map(([chave, { label }]) => (
                    <button key={chave} type="button" title={label} onClick={() => setForm({ ...form, formato: chave })}
                      className={`p-1.5 rounded-xl border transition-colors ${form.formato === chave ? 'border-blue-500 bg-blue-50' : 'border-slate-200 hover:bg-slate-50'}`}>
                      <SeloBadge {...aparencia(form)} formato={chave} tamanho="sm" />
                    </button>
                  ))}
                </div>
              </Campo>

              <Campo label="Acabamento">
                <div className="flex flex-wrap gap-2">
                  {Object.entries(SELO_ACABAMENTOS).map(([chave, label]) => (
                    <button key={chave} type="button" onClick={() => setForm({ ...form, acabamento: chave })}
                      className={`flex items-center gap-2 pl-1.5 pr-3 py-1.5 rounded-xl border text-xs font-bold transition-colors ${form.acabamento === chave ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
                      <SeloBadge {...aparencia(form)} acabamento={chave} tamanho="sm" /> {label}
                    </button>
                  ))}
                </div>
              </Campo>

              <Campo label="Ícone">
                <div className="flex flex-wrap gap-2">
                  {Object.entries(SELO_ICONES).map(([chave, { label, Icon }]) => (
                    <button key={chave} type="button" title={label} onClick={() => setForm({ ...form, icone: chave })}
                      className={`w-10 h-10 rounded-lg flex items-center justify-center border transition-colors ${form.icone === chave ? 'border-blue-500 bg-blue-50 text-blue-600' : 'border-slate-200 text-slate-500 hover:bg-slate-50'}`}>
                      <Icon size={18} />
                    </button>
                  ))}
                </div>
              </Campo>

              <Campo label="Cor">
                <div className="flex flex-wrap gap-2">
                  {Object.entries(SELO_CORES).map(([chave, { label, gradiente }]) => (
                    <button key={chave} type="button" title={label} onClick={() => setForm({ ...form, cor: chave })}
                      className={`w-8 h-8 rounded-full ${gradiente} ${form.cor === chave ? 'ring-2 ring-offset-2 ring-slate-800' : ''}`} />
                  ))}
                </div>
              </Campo>

              <Campo label="Como as escolas aptas são sugeridas">
                <select value={form.metrica} onChange={e => setForm({ ...form, metrica: e.target.value })} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white">
                  <option value="">Atribuição manual (sem sugestão automática)</option>
                  {Object.entries(METRICAS).map(([chave, m]) => <option key={chave} value={chave}>{m.label}</option>)}
                </select>
              </Campo>

              {form.metrica && METRICAS[form.metrica] && !METRICAS[form.metrica].criterioFixo && (
                <Campo label={`Critério mínimo — ${METRICAS[form.metrica].unidade}`}>
                  <input type="number" min={1} value={form.criterio_minimo} onChange={e => setForm({ ...form, criterio_minimo: e.target.value })} className="w-32 px-3 py-2 border border-slate-200 rounded-lg text-sm" />
                </Campo>
              )}

              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input type="checkbox" checked={form.ativo} onChange={e => setForm({ ...form, ativo: e.target.checked })} />
                Selo ativo (aparece na galeria das escolas)
              </label>
            </div>

            <div className="p-6 border-t border-slate-100 flex justify-end gap-3">
              <button onClick={() => setEditando(null)} className="px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest text-slate-500 hover:bg-slate-100">Cancelar</button>
              <button onClick={salvarSelo} disabled={salvando} className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-xl text-xs font-black uppercase tracking-widest">
                {salvando && <Loader2 size={14} className="animate-spin" />} Salvar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Cabecalho({ subtitulo }: { subtitulo: string }) {
  return (
    <div className="flex items-center gap-4">
      <div className="w-12 h-12 bg-amber-100 text-amber-600 rounded-2xl flex items-center justify-center shrink-0">
        <Award size={24} />
      </div>
      <div>
        <h1 className="text-2xl font-black text-slate-900 uppercase tracking-tight leading-none">Selos de Excelência</h1>
        <p className="text-xs text-slate-500 font-bold uppercase tracking-widest mt-1.5">{subtitulo}</p>
      </div>
    </div>
  );
}

function Campo({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5">{label}</p>
      {children}
    </div>
  );
}

function Aviso({ texto }: { texto: string }) {
  return (
    <div className="flex items-start gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-3">
      <AlertTriangle size={14} className="shrink-0 mt-0.5" /> {texto}
    </div>
  );
}

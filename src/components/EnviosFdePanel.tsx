import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { supabase } from '../lib/supabase';
import {
  carregarEnviosFde, chaveEnvioFde, normalizarCie, normalizarTexto,
  FDE_ENVIOS_CONFIGURADO, FDE_ENVIOS_SHEET_URL, type FdeEnvio,
} from '../lib/fdeEnvios';
import {
  Loader2, RefreshCw, ExternalLink, AlertTriangle,
  Building2, Package, PackageCheck, Clock, Truck,
  FileText, FileWarning, Link2, Unlink, X, Check,
} from 'lucide-react';

interface Props {
  isAdmin: boolean;
  userSchoolId: string | null;
  searchTerm: string;
  items: { code: string; name: string }[];
}

interface SchoolCie {
  id: string;
  name: string;
  cie_code: string | null;
}

// Item a incorporar (aba Incorporacoes_Pendentes, Atendimento Patrimônio). Quando o
// gestor manda a nota fiscal do que a FDE entregou, o item é cadastrado lá — o
// vínculo com o envio fica no próprio item (fde_envio_chave).
interface ItemIncorporar {
  id: string;
  escola_id: string;
  descricao: string;
  quantidade: string;
  nota_fiscal_link: string;
  status: string;
  origem_aquisicao: string;
  orgao_entrega: string;
  data_registro: string;
  fde_envio_chave: string;
}

const today = new Date().toISOString().slice(0, 10);

function situacao(e: FdeEnvio): 'ENTREGUE' | 'ATRASADO' | 'PENDENTE' {
  if (e.status === 'ENTREGUE') return 'ENTREGUE';
  if (e.dataLimite && e.dataLimite < today) return 'ATRASADO';
  return 'PENDENTE';
}

const fmtData = (iso: string | null) => (iso ? new Date(iso + 'T12:00:00').toLocaleDateString('pt-BR') : '—');

// Mesmo tratamento de erro do invoke em AtendimentoPatrimonio: a mensagem real da
// function vem em error.context quando o status não é 2xx.
async function invokePatrimonio(action: string, payload: Record<string, unknown> = {}) {
  const { data, error } = await supabase.functions.invoke('patrimonio-atendimento', {
    body: { action, ...payload },
  });
  if (error) {
    let message = error.message;
    const context = (error as any).context;
    if (context && typeof context.json === 'function') {
      try {
        const body = await context.clone().json();
        if (body?.error) message = body.error;
      } catch { /* corpo não é JSON, mantém mensagem padrão */ }
    }
    throw new Error(message);
  }
  if (data?.error) throw new Error(data.error);
  return data;
}

export function EnviosFdePanel({ isAdmin, userSchoolId, searchTerm, items }: Props) {
  const [envios, setEnvios] = useState<FdeEnvio[]>([]);
  const [schools, setSchools] = useState<SchoolCie[]>([]);
  const [incorporar, setIncorporar] = useState<ItemIncorporar[]>([]);
  const [erroIncorporar, setErroIncorporar] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [filtroProjeto, setFiltroProjeto] = useState('');
  const [filtroSituacao, setFiltroSituacao] = useState('');
  const [filtroNf, setFiltroNf] = useState('');
  const [vinculando, setVinculando] = useState<FdeEnvio | null>(null);

  async function carregarIncorporar() {
    try {
      const inc = await invokePatrimonio('listar_incorporacoes');
      setIncorporar(Array.isArray(inc) ? inc : []);
      setErroIncorporar(null);
    } catch (e: any) {
      setErroIncorporar(e?.message || 'Erro ao carregar os itens a incorporar.');
    }
  }

  async function carregar() {
    setLoading(true);
    setErro(null);
    try {
      const [dados, { data: sch }] = await Promise.all([
        carregarEnviosFde(),
        (supabase as any).from('schools').select('id, name, cie_code'),
        carregarIncorporar(),
      ]);
      setEnvios(dados);
      setSchools(sch || []);
    } catch (e: any) {
      setErro(e?.message || 'Erro ao carregar os envios da FDE.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (FDE_ENVIOS_CONFIGURADO) carregar();
    else setLoading(false);
  }, []);

  const schoolPorCie = useMemo(() => {
    const m = new Map<string, SchoolCie>();
    schools.forEach(s => { const c = normalizarCie(s.cie_code); if (c) m.set(c, s); });
    return m;
  }, [schools]);

  const itemPorCodigo = useMemo(() => {
    const m = new Map<string, string>();
    items.forEach(i => m.set(i.code.toUpperCase().trim(), i.name));
    return m;
  }, [items]);

  const incorporarPorChave = useMemo(() => {
    const m = new Map<string, ItemIncorporar[]>();
    incorporar.forEach(i => {
      if (!i.fde_envio_chave) return;
      m.set(i.fde_envio_chave, [...(m.get(i.fde_envio_chave) || []), i]);
    });
    return m;
  }, [incorporar]);

  // NF só é cobrada depois que a FDE entregou; antes disso não se aplica
  const situacaoNf = (e: FdeEnvio): 'RECEBIDA' | 'PENDENTE' | 'NA' => {
    if (incorporarPorChave.has(chaveEnvioFde(e))) return 'RECEBIDA';
    return situacao(e) === 'ENTREGUE' ? 'PENDENTE' : 'NA';
  };

  // Escola só enxerga o que vai para ela (casamento pelo CIE)
  const visiveis = useMemo(() => {
    if (isAdmin) return envios;
    const minha = schools.find(s => s.id === userSchoolId);
    const cie = normalizarCie(minha?.cie_code);
    return cie ? envios.filter(e => e.cie === cie) : [];
  }, [envios, schools, isAdmin, userSchoolId]);

  const projetos = useMemo(() => Array.from(new Set(visiveis.map(e => e.projeto).filter(Boolean))).sort(), [visiveis]);

  const filtrados = useMemo(() => {
    const q = normalizarTexto(searchTerm);
    return visiveis.filter(e => {
      if (filtroProjeto && e.projeto !== filtroProjeto) return false;
      if (filtroSituacao && situacao(e) !== filtroSituacao) return false;
      if (filtroNf && situacaoNf(e) !== filtroNf) return false;
      if (!q) return true;
      const nomeSistema = schoolPorCie.get(e.cie)?.name || '';
      const nomeItem = itemPorCodigo.get(e.codigo) || '';
      return [e.escola, nomeSistema, e.cie, e.codigo, nomeItem].some(t => normalizarTexto(t).includes(q));
    });
  }, [visiveis, filtroProjeto, filtroSituacao, filtroNf, searchTerm, schoolPorCie, itemPorCodigo, incorporarPorChave]);

  const kpis = useMemo(() => {
    const escolas = new Set(filtrados.map(e => e.cie || e.escola));
    const escolasSemNf = new Set<string>();
    let total = 0, entregue = 0, pendente = 0, atrasado = 0;
    filtrados.forEach(e => {
      total += e.qtde;
      const s = situacao(e);
      if (s === 'ENTREGUE') entregue += e.qtde;
      else if (s === 'ATRASADO') atrasado += e.qtde;
      else pendente += e.qtde;
      if (situacaoNf(e) === 'PENDENTE') escolasSemNf.add(e.cie || e.escola);
    });
    return { escolas: escolas.size, total, entregue, pendente, atrasado, semNf: escolasSemNf.size };
  }, [filtrados, incorporarPorChave]);

  const naoVinculadas = useMemo(() => {
    if (!isAdmin) return [];
    const m = new Map<string, string>();
    envios.forEach(e => { if (!schoolPorCie.has(e.cie)) m.set(e.cie || e.escola, e.escola); });
    return Array.from(m.entries());
  }, [envios, schoolPorCie, isAdmin]);

  const codigosSemCatalogo = useMemo(() => {
    if (!isAdmin) return [];
    return Array.from(new Set(envios.map(e => e.codigo).filter(c => c && !itemPorCodigo.has(c))));
  }, [envios, itemPorCodigo, isAdmin]);

  async function desvincular(item: ItemIncorporar) {
    if (!confirm(`Desvincular "${item.descricao}" deste envio da FDE?`)) return;
    try {
      await invokePatrimonio('vincular_incorporacao_fde', { ids: [item.id], chave: '' });
      await carregarIncorporar();
    } catch (e: any) {
      alert(e?.message || 'Erro ao desvincular.');
    }
  }

  if (!FDE_ENVIOS_CONFIGURADO) {
    return (
      <div className="bg-amber-50 border border-amber-200 rounded-[2rem] p-8 text-amber-800 text-sm font-medium">
        A planilha de envios da FDE não está configurada. Defina a variável <b>VITE_FDE_ENVIOS_SHEET_ID</b> no ambiente.
      </div>
    );
  }

  if (loading) {
    return <div className="py-40 flex justify-center"><Loader2 className="animate-spin text-emerald-600" size={48} /></div>;
  }

  if (erro) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-[2rem] p-8 text-red-700 text-sm font-medium flex items-center justify-between gap-4">
        <span>{erro}</span>
        <button onClick={carregar} className="px-4 py-2 bg-white rounded-xl border border-red-200 font-black text-[10px] uppercase">Tentar novamente</button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
        <Kpi icon={<Building2 size={18} />} label="Escolas" value={kpis.escolas} cor="text-slate-700" />
        <Kpi icon={<Package size={18} />} label="Itens a receber" value={kpis.total} cor="text-indigo-600" />
        <Kpi icon={<PackageCheck size={18} />} label="Entregues" value={kpis.entregue} cor="text-emerald-600" />
        <Kpi icon={<Clock size={18} />} label="No prazo" value={kpis.pendente} cor="text-blue-600" />
        <Kpi icon={<AlertTriangle size={18} />} label="Atrasados" value={kpis.atrasado} cor="text-red-600" />
        <Kpi icon={<FileWarning size={18} />} label="Escolas sem NF" value={kpis.semNf} cor="text-amber-600" onClick={() => setFiltroNf(filtroNf === 'PENDENTE' ? '' : 'PENDENTE')} ativo={filtroNf === 'PENDENTE'} />
      </div>

      <div className="bg-white p-4 rounded-[2rem] border border-slate-100 shadow-sm flex flex-wrap items-center gap-3">
        <select className="p-3 bg-slate-50 rounded-xl font-bold text-xs text-slate-700 outline-none" value={filtroProjeto} onChange={e => setFiltroProjeto(e.target.value)}>
          <option value="">Todos os projetos</option>
          {projetos.map(p => <option key={p} value={p}>{p}</option>)}
        </select>
        <select className="p-3 bg-slate-50 rounded-xl font-bold text-xs text-slate-700 outline-none" value={filtroSituacao} onChange={e => setFiltroSituacao(e.target.value)}>
          <option value="">Todas as situações</option>
          <option value="ENTREGUE">Entregue</option>
          <option value="PENDENTE">No prazo</option>
          <option value="ATRASADO">Atrasado</option>
        </select>
        <select className="p-3 bg-slate-50 rounded-xl font-bold text-xs text-slate-700 outline-none" value={filtroNf} onChange={e => setFiltroNf(e.target.value)}>
          <option value="">Nota fiscal: todas</option>
          <option value="PENDENTE">NF pendente (entregue sem NF)</option>
          <option value="RECEBIDA">NF recebida</option>
          <option value="NA">Aguardando entrega</option>
        </select>
        <div className="flex-1" />
        <button onClick={carregar} className="flex items-center gap-2 px-4 py-3 bg-slate-100 hover:bg-slate-200 rounded-xl font-black text-[10px] uppercase text-slate-600 transition-all"><RefreshCw size={14} /> Atualizar</button>
        {isAdmin && (
          <a href={FDE_ENVIOS_SHEET_URL} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 px-4 py-3 bg-emerald-600 hover:bg-emerald-700 rounded-xl font-black text-[10px] uppercase text-white transition-all"><ExternalLink size={14} /> Editar planilha FDE</a>
        )}
      </div>

      {isAdmin && erroIncorporar && (
        <div className="bg-red-50 border border-red-200 rounded-[2rem] p-6 text-red-700 text-xs font-medium">
          Não foi possível carregar os itens a incorporar (nota fiscal): {erroIncorporar}
        </div>
      )}

      {(naoVinculadas.length > 0 || codigosSemCatalogo.length > 0) && (
        <div className="bg-amber-50 border border-amber-200 rounded-[2rem] p-6 text-amber-800 text-xs space-y-2">
          {naoVinculadas.length > 0 && (
            <p><b>CIE não encontrado no cadastro de escolas ({naoVinculadas.length}):</b> {naoVinculadas.map(([cie, nome]) => `${cie} – ${nome}`).join('; ')}. Essas escolas não verão o envio até o CIE ser cadastrado.</p>
          )}
          {codigosSemCatalogo.length > 0 && (
            <p><b>Códigos sem item no Catálogo:</b> {codigosSemCatalogo.join(', ')}.</p>
          )}
        </div>
      )}

      <div className="bg-white rounded-[2rem] border border-slate-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-slate-50 text-[9px] font-black text-slate-400 uppercase tracking-widest">
              <tr>
                <th className="p-5 pl-8">Escola</th>
                <th className="p-5">Projeto</th>
                <th className="p-5">Código / Item</th>
                <th className="p-5 text-center">Qtde</th>
                <th className="p-5 text-center">Data Limite</th>
                <th className="p-5 text-center">Situação</th>
                <th className="p-5 pr-8">Nota Fiscal</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {filtrados.length === 0 && (
                <tr><td colSpan={7} className="p-10 text-center text-xs font-bold text-slate-400 uppercase">
                  {isAdmin ? 'Nenhum envio encontrado.' : 'Nenhum envio da FDE informado para a sua escola.'}
                </td></tr>
              )}
              {filtrados.map((e, i) => {
                const escolaSistema = schoolPorCie.get(e.cie);
                const nomeItem = itemPorCodigo.get(e.codigo);
                const s = situacao(e);
                const nf = situacaoNf(e);
                const vinculados = incorporarPorChave.get(chaveEnvioFde(e)) || [];
                return (
                  <tr key={`${e.cie}-${e.codigo}-${e.projeto}-${i}`} className="hover:bg-slate-50/50 align-top">
                    <td className="p-5 pl-8">
                      <p className="text-[11px] font-black text-slate-800 uppercase">{escolaSistema?.name || e.escola}</p>
                      <p className={`text-[9px] font-bold uppercase ${escolaSistema ? 'text-slate-400' : 'text-amber-600'}`}>CIE {e.cie || '—'}{!escolaSistema && ' · não vinculada'}</p>
                    </td>
                    <td className="p-5 text-[10px] font-black text-slate-600 uppercase">{e.projeto || '—'}</td>
                    <td className="p-5">
                      <span className="px-2 py-1 bg-slate-900 text-white rounded-lg font-black text-[10px]">{e.codigo || '—'}</span>
                      {nomeItem && <p className="text-[10px] font-bold text-slate-500 uppercase mt-1 line-clamp-1">{nomeItem}</p>}
                    </td>
                    <td className="p-5 text-center text-sm font-black text-slate-800">{e.qtde}</td>
                    <td className="p-5 text-center text-[11px] font-bold text-slate-600">{fmtData(e.dataLimite)}</td>
                    <td className="p-5 text-center">
                      <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-black text-[9px] uppercase ${
                        s === 'ENTREGUE' ? 'bg-emerald-50 text-emerald-700' : s === 'ATRASADO' ? 'bg-red-50 text-red-600' : 'bg-blue-50 text-blue-600'
                      }`}>
                        {s === 'ENTREGUE' ? <PackageCheck size={12} /> : s === 'ATRASADO' ? <AlertTriangle size={12} /> : <Truck size={12} />}
                        {s === 'PENDENTE' ? (e.status || 'No prazo') : s}
                      </span>
                    </td>
                    <td className="p-5 pr-8 min-w-[220px]">
                      {nf === 'RECEBIDA' ? (
                        <div className="space-y-1.5">
                          {vinculados.map(v => (
                            <div key={v.id} className="flex items-center gap-2">
                              <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-emerald-50 text-emerald-700 font-black text-[9px] uppercase shrink-0"><FileText size={11} /> NF</span>
                              {v.nota_fiscal_link
                                ? <a href={v.nota_fiscal_link} target="_blank" rel="noopener noreferrer" className="text-[10px] font-bold text-slate-600 hover:text-emerald-600 underline line-clamp-1" title={v.descricao}>{v.descricao} ({v.quantidade})</a>
                                : <span className="text-[10px] font-bold text-slate-600 line-clamp-1" title={v.descricao}>{v.descricao} ({v.quantidade})</span>}
                              {isAdmin && <button onClick={() => desvincular(v)} className="p-1 text-slate-300 hover:text-red-500 shrink-0" title="Desvincular"><Unlink size={13} /></button>}
                            </div>
                          ))}
                          {isAdmin && <button onClick={() => setVinculando(e)} className="text-[9px] font-black uppercase text-slate-400 hover:text-emerald-600">+ vincular outro item</button>}
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          {nf === 'PENDENTE'
                            ? <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-amber-50 text-amber-700 font-black text-[9px] uppercase"><FileWarning size={11} /> NF pendente</span>
                            : <span className="text-[9px] font-black uppercase text-slate-300 italic">Aguardando entrega</span>}
                          {isAdmin && escolaSistema && (
                            <button onClick={() => setVinculando(e)} className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-slate-100 hover:bg-emerald-600 hover:text-white text-slate-500 font-black text-[9px] uppercase transition-all"><Link2 size={11} /> Vincular</button>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {vinculando && (
        <VincularModal
          envio={vinculando}
          escola={schoolPorCie.get(vinculando.cie)!}
          nomeItem={itemPorCodigo.get(vinculando.codigo)}
          itens={incorporar}
          onClose={() => setVinculando(null)}
          onSaved={async () => { setVinculando(null); await carregarIncorporar(); }}
        />
      )}
    </div>
  );
}

function VincularModal({ envio, escola, nomeItem, itens, onClose, onSaved }: {
  envio: FdeEnvio;
  escola: SchoolCie;
  nomeItem?: string;
  itens: ItemIncorporar[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const chave = chaveEnvioFde(envio);
  // Só itens de Entrega FDE/SEDUC da mesma escola; os ainda sem envio vinculado primeiro
  const candidatos = useMemo(() => itens
    .filter(i => i.escola_id === escola.id && i.origem_aquisicao === 'Entrega FDE/SEDUC' && i.fde_envio_chave !== chave)
    .sort((a, b) => Number(!!a.fde_envio_chave) - Number(!!b.fde_envio_chave) || (b.data_registro || '').localeCompare(a.data_registro || '')),
  [itens, escola.id, chave]);
  const [selecionados, setSelecionados] = useState<string[]>([]);
  const [salvando, setSalvando] = useState(false);

  async function salvar() {
    if (selecionados.length === 0) return;
    setSalvando(true);
    try {
      await invokePatrimonio('vincular_incorporacao_fde', { ids: selecionados, chave });
      onSaved();
    } catch (e: any) {
      alert(e?.message || 'Erro ao vincular.');
      setSalvando(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-[2rem] shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col" onClick={ev => ev.stopPropagation()}>
        <div className="p-6 border-b border-slate-100 flex items-start justify-between gap-4">
          <div>
            <h3 className="text-sm font-black text-slate-900 uppercase">Vincular nota fiscal ao envio FDE</h3>
            <p className="text-[10px] font-bold text-slate-500 uppercase mt-1">{escola.name} · {envio.projeto} · {envio.codigo}{nomeItem ? ` – ${nomeItem}` : ''} · {envio.qtde} un.</p>
          </div>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-700"><X size={18} /></button>
        </div>
        <div className="p-6 overflow-y-auto flex-1 space-y-2">
          {candidatos.length === 0 ? (
            <p className="text-xs text-slate-500 font-medium">
              Nenhum item de <b>Entrega FDE/SEDUC</b> cadastrado para esta escola em <b>Atendimento Patrimônio › Itens a Incorporar</b>. Cadastre o item com a nota fiscal enviada pelo gestor e volte aqui para vincular.
            </p>
          ) : candidatos.map(i => {
            const marcado = selecionados.includes(i.id);
            return (
              <label key={i.id} className={`flex items-start gap-3 p-3 rounded-2xl border-2 cursor-pointer transition-all ${marcado ? 'border-emerald-500 bg-emerald-50/50' : 'border-slate-100 hover:border-slate-200'}`}>
                <input type="checkbox" className="mt-1 accent-emerald-600" checked={marcado} onChange={() => setSelecionados(prev => marcado ? prev.filter(x => x !== i.id) : [...prev, i.id])} />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-black text-slate-800">{i.descricao} <span className="text-slate-400">({i.quantidade})</span></p>
                  <p className="text-[10px] font-bold text-slate-400 uppercase mt-0.5">
                    {i.orgao_entrega || 'FDE/SEDUC'} · {i.status} · cadastrado em {i.data_registro ? new Date(i.data_registro).toLocaleDateString('pt-BR') : '—'}
                    {!i.nota_fiscal_link && ' · sem link da NF'}
                  </p>
                  {i.fde_envio_chave && <p className="text-[10px] font-bold text-amber-600 uppercase mt-0.5">Já vinculado a outro envio — será movido</p>}
                </div>
              </label>
            );
          })}
        </div>
        <div className="p-6 border-t border-slate-100 flex justify-end gap-3">
          <button onClick={onClose} className="px-5 py-3 rounded-xl font-black text-[10px] uppercase text-slate-500 hover:bg-slate-100">Cancelar</button>
          <button onClick={salvar} disabled={salvando || selecionados.length === 0} className="flex items-center gap-2 px-5 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white font-black text-[10px] uppercase">
            {salvando ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} Vincular {selecionados.length > 0 && `(${selecionados.length})`}
          </button>
        </div>
      </div>
    </div>
  );
}

function Kpi({ icon, label, value, cor, onClick, ativo }: { icon: ReactNode; label: string; value: number; cor: string; onClick?: () => void; ativo?: boolean }) {
  return (
    <div onClick={onClick} className={`bg-white p-5 rounded-[2rem] border shadow-sm ${onClick ? 'cursor-pointer hover:border-amber-300 transition-all' : ''} ${ativo ? 'border-amber-400 ring-2 ring-amber-100' : 'border-slate-100'}`}>
      <div className={`flex items-center gap-2 ${cor}`}>{icon}<span className="text-[9px] font-black uppercase tracking-widest text-slate-400">{label}</span></div>
      <p className={`text-3xl font-black mt-2 ${cor}`}>{value.toLocaleString('pt-BR')}</p>
    </div>
  );
}

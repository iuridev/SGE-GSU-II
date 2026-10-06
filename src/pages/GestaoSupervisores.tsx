import { useState, useEffect, useCallback, useMemo } from 'react';
import toast from 'react-hot-toast';
import { supabase } from '../lib/supabase';
import { isReadOnlyRole } from '../lib/roles';
import {
  UserCheck, Loader2, Search, X, Phone, Mail, School, Car, Bike, ParkingSquare,
  Plus, Trash2, Pencil, Check, AlertTriangle, MessageCircle,
} from 'lucide-react';

// Gestão de Supervisores (regional_admin). Ficha de cada supervisor com:
//  - contatos (WhatsApp e e-mail de contato; o e-mail de login é só exibido);
//  - escolas sob sua responsabilidade — cada escola tem um único supervisor,
//    regra garantida no banco (vincular uma escola a alguém a tira do antigo);
//  - veículos, cada um alocado em um estacionamento.
// Ver migration 20261005000000_gestao_supervisores.sql.

interface Supervisor {
  id: string;
  full_name: string | null;
  email: string | null;
  email_contato: string | null;
  whatsapp: string | null;
  supervisor_schools: string[] | null;
}

interface SchoolRow { id: string; name: string }

interface Estacionamento { id: string; nome: string; endereco: string | null }

interface Veiculo {
  id: string;
  supervisor_id: string;
  tipo: 'carro' | 'moto';
  placa: string;
  modelo: string;
  cor: string;
  estacionamento_id: string;
  vaga: string | null;
}

type Aba = 'contato' | 'escolas' | 'veiculos';

const VEICULO_VAZIO = { tipo: 'carro' as 'carro' | 'moto', placa: '', modelo: '', cor: '', estacionamento_id: '', vaga: '' };

const soDigitos = (s: string) => s.replace(/\D/g, '');

function formatarTelefone(digitos: string): string {
  const d = soDigitos(digitos).slice(0, 11);
  if (d.length <= 2) return d;
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

// Placa antiga (ABC-1234) ou Mercosul (ABC1D23), guardada sem hífen.
const normalizarPlaca = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 7);
const placaValida = (s: string) => /^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/.test(s);
const exibirPlaca = (s: string) => (/^[A-Z]{3}[0-9]{4}$/.test(s) ? `${s.slice(0, 3)}-${s.slice(3)}` : s);

const normalizar = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

const erroDuplicado = (e: any) => e?.code === '23505';

export default function GestaoSupervisores() {
  const [somenteLeitura, setSomenteLeitura] = useState(false);
  const [carregando, setCarregando] = useState(true);

  const [supervisores, setSupervisores] = useState<Supervisor[]>([]);
  const [schools, setSchools] = useState<SchoolRow[]>([]);
  const [estacionamentos, setEstacionamentos] = useState<Estacionamento[]>([]);
  const [veiculos, setVeiculos] = useState<Veiculo[]>([]);
  const [busca, setBusca] = useState('');

  const [fichaId, setFichaId] = useState<string | null>(null);
  const [aba, setAba] = useState<Aba>('contato');
  const [contato, setContato] = useState({ whatsapp: '', email_contato: '' });
  const [escolasSel, setEscolasSel] = useState<string[]>([]);
  const [buscaEscola, setBuscaEscola] = useState('');
  const [veiculoForm, setVeiculoForm] = useState(VEICULO_VAZIO);
  const [veiculoEditando, setVeiculoEditando] = useState<string | 'novo' | null>(null);
  const [salvando, setSalvando] = useState(false);

  const [gerenciarEstac, setGerenciarEstac] = useState(false);
  const [estacForm, setEstacForm] = useState({ nome: '', endereco: '' });
  const [estacEditando, setEstacEditando] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    const [supRes, schRes, estRes, veiRes] = await Promise.all([
      (supabase as any).from('profiles')
        .select('id, full_name, email, email_contato, whatsapp, supervisor_schools')
        .eq('role', 'supervisor').order('full_name'),
      (supabase as any).from('schools').select('id, name').order('name'),
      (supabase as any).from('estacionamentos').select('id, nome, endereco').order('nome'),
      (supabase as any).from('supervisor_veiculos').select('*').order('placa'),
    ]);
    const erro = supRes.error || schRes.error || estRes.error || veiRes.error;
    if (erro) {
      console.error('Erro ao carregar supervisores:', erro);
      toast.error('Não foi possível carregar os dados dos supervisores.');
      return;
    }
    setSupervisores(supRes.data || []);
    setSchools(schRes.data || []);
    setEstacionamentos(estRes.data || []);
    setVeiculos(veiRes.data || []);
  }, []);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: p } = await (supabase as any).from('profiles').select('role').eq('id', user.id).single();
        setSomenteLeitura(isReadOnlyRole(p?.role || ''));
      }
      await carregar();
      setCarregando(false);
    })();
  }, [carregar]);

  const nomeEscola = useMemo(() => new Map(schools.map(s => [s.id, s.name])), [schools]);
  const nomeEstac = useMemo(() => new Map(estacionamentos.map(e => [e.id, e.nome])), [estacionamentos]);

  // escola → supervisores que a têm (mais de um só em dados antigos, de antes
  // da regra de exclusividade existir no banco).
  const donosPorEscola = useMemo(() => {
    const m = new Map<string, Supervisor[]>();
    supervisores.forEach(s => (s.supervisor_schools || []).forEach(id => {
      m.set(id, [...(m.get(id) || []), s]);
    }));
    return m;
  }, [supervisores]);

  const escolasSemSupervisor = useMemo(() => schools.filter(s => !donosPorEscola.has(s.id)), [schools, donosPorEscola]);
  const escolasEmConflito = useMemo(
    () => schools.filter(s => (donosPorEscola.get(s.id)?.length || 0) > 1),
    [schools, donosPorEscola],
  );

  const veiculosPorSupervisor = useMemo(() => {
    const m = new Map<string, Veiculo[]>();
    veiculos.forEach(v => m.set(v.supervisor_id, [...(m.get(v.supervisor_id) || []), v]));
    return m;
  }, [veiculos]);

  const supervisoresFiltrados = useMemo(() => {
    const q = normalizar(busca.trim());
    if (!q) return supervisores;
    return supervisores.filter(s =>
      normalizar(s.full_name || '').includes(q) ||
      normalizar(s.email || '').includes(q) ||
      (s.supervisor_schools || []).some(id => normalizar(nomeEscola.get(id) || '').includes(q)) ||
      (veiculosPorSupervisor.get(s.id) || []).some(v => v.placa.includes(normalizarPlaca(busca))),
    );
  }, [busca, supervisores, nomeEscola, veiculosPorSupervisor]);

  const ficha = supervisores.find(s => s.id === fichaId) || null;

  const abrirFicha = (s: Supervisor, abaInicial: Aba = 'contato') => {
    setFichaId(s.id);
    setAba(abaInicial);
    setContato({ whatsapp: formatarTelefone(s.whatsapp || ''), email_contato: s.email_contato || '' });
    setEscolasSel(s.supervisor_schools || []);
    setBuscaEscola('');
    setVeiculoEditando(null);
    setVeiculoForm(VEICULO_VAZIO);
  };

  const fecharFicha = () => setFichaId(null);

  // ── Contato ─────────────────────────────────────────────────────────

  const salvarContato = async () => {
    if (!ficha) return;
    const whatsapp = soDigitos(contato.whatsapp);
    if (whatsapp && (whatsapp.length < 10 || whatsapp.length > 11)) {
      toast.error('Informe o WhatsApp com DDD (10 ou 11 dígitos).');
      return;
    }
    const email = contato.email_contato.trim();
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      toast.error('E-mail de contato inválido.');
      return;
    }
    setSalvando(true);
    const { error } = await (supabase as any).from('profiles')
      .update({ whatsapp: whatsapp || null, email_contato: email || null })
      .eq('id', ficha.id);
    setSalvando(false);
    if (error) {
      console.error(error);
      toast.error('Não foi possível salvar os contatos.');
      return;
    }
    toast.success('Contatos atualizados.');
    await carregar();
  };

  // ── Escolas ─────────────────────────────────────────────────────────

  // Escolas marcadas agora que hoje pertencem a outro supervisor: ao salvar,
  // o banco as transfere para este.
  const transferencias = useMemo(() => {
    if (!ficha) return [];
    return escolasSel
      .filter(id => !(ficha.supervisor_schools || []).includes(id))
      .map(id => ({ id, de: (donosPorEscola.get(id) || []).filter(d => d.id !== ficha.id) }))
      .filter(t => t.de.length > 0);
  }, [escolasSel, ficha, donosPorEscola]);

  const escolasFiltradas = useMemo(() => {
    const q = normalizar(buscaEscola.trim());
    const lista = q ? schools.filter(s => normalizar(s.name).includes(q)) : schools;
    // Carteira salva primeiro, para o admin vê-la sem rolar. Ordena pelo que
    // está salvo (e não pelo marcado) para a linha não pular ao clicar.
    const salvas = new Set(ficha?.supervisor_schools || []);
    return [...lista].sort((a, b) => Number(salvas.has(b.id)) - Number(salvas.has(a.id)));
  }, [buscaEscola, schools, ficha]);

  const alternarEscola = (id: string) =>
    setEscolasSel(sel => (sel.includes(id) ? sel.filter(x => x !== id) : [...sel, id]));

  const salvarEscolas = async () => {
    if (!ficha) return;
    if (transferencias.length > 0) {
      const lista = transferencias
        .map(t => `• ${nomeEscola.get(t.id)} (hoje com ${t.de.map(d => d.full_name).join(', ')})`)
        .join('\n');
      if (!window.confirm(`Estas escolas serão transferidas para ${ficha.full_name}:\n\n${lista}\n\nConfirmar?`)) return;
    }
    setSalvando(true);
    const { error } = await (supabase as any).from('profiles')
      .update({ supervisor_schools: escolasSel })
      .eq('id', ficha.id);
    setSalvando(false);
    if (error) {
      console.error(error);
      toast.error('Não foi possível salvar as escolas.');
      return;
    }
    toast.success('Escolas atualizadas.');
    await carregar();
  };

  // ── Veículos ────────────────────────────────────────────────────────

  const editarVeiculo = (v: Veiculo) => {
    setVeiculoEditando(v.id);
    setVeiculoForm({ tipo: v.tipo, placa: v.placa, modelo: v.modelo, cor: v.cor, estacionamento_id: v.estacionamento_id, vaga: v.vaga || '' });
  };

  const salvarVeiculo = async () => {
    if (!ficha || !veiculoEditando) return;
    const placa = normalizarPlaca(veiculoForm.placa);
    if (!placaValida(placa)) {
      toast.error('Placa inválida. Use o formato ABC1234 ou ABC1D23.');
      return;
    }
    if (!veiculoForm.modelo.trim()) {
      toast.error('Informe o modelo do veículo.');
      return;
    }
    if (!veiculoForm.estacionamento_id) {
      toast.error('Indique em qual estacionamento o veículo está alocado.');
      return;
    }
    const payload = {
      supervisor_id: ficha.id,
      tipo: veiculoForm.tipo,
      placa,
      modelo: veiculoForm.modelo.trim(),
      cor: veiculoForm.cor.trim(),
      estacionamento_id: veiculoForm.estacionamento_id,
      vaga: veiculoForm.vaga.trim() || null,
    };
    setSalvando(true);
    const { error } = veiculoEditando === 'novo'
      ? await (supabase as any).from('supervisor_veiculos').insert(payload)
      : await (supabase as any).from('supervisor_veiculos').update(payload).eq('id', veiculoEditando);
    setSalvando(false);
    if (error) {
      console.error(error);
      if (erroDuplicado(error)) {
        const dono = veiculos.find(v => v.placa === placa);
        const nomeDono = supervisores.find(s => s.id === dono?.supervisor_id)?.full_name;
        toast.error(`A placa ${exibirPlaca(placa)} já está cadastrada${nomeDono ? ` para ${nomeDono}` : ''}.`);
      } else {
        toast.error('Não foi possível salvar o veículo.');
      }
      return;
    }
    toast.success(veiculoEditando === 'novo' ? 'Veículo cadastrado.' : 'Veículo atualizado.');
    setVeiculoEditando(null);
    setVeiculoForm(VEICULO_VAZIO);
    await carregar();
  };

  const excluirVeiculo = async (v: Veiculo) => {
    if (!window.confirm(`Excluir o veículo ${exibirPlaca(v.placa)}?`)) return;
    const { error } = await (supabase as any).from('supervisor_veiculos').delete().eq('id', v.id);
    if (error) {
      console.error(error);
      toast.error('Não foi possível excluir o veículo.');
      return;
    }
    toast.success('Veículo excluído.');
    await carregar();
  };

  // ── Estacionamentos ────────────────────────────────────────────────

  const salvarEstacionamento = async () => {
    const nome = estacForm.nome.trim();
    if (!nome) {
      toast.error('Informe o nome do estacionamento.');
      return;
    }
    const payload = { nome, endereco: estacForm.endereco.trim() || null };
    const { data, error } = estacEditando
      ? await (supabase as any).from('estacionamentos').update(payload).eq('id', estacEditando).select('id').single()
      : await (supabase as any).from('estacionamentos').insert(payload).select('id').single();
    if (error) {
      console.error(error);
      toast.error(erroDuplicado(error) ? 'Já existe um estacionamento com esse nome.' : 'Não foi possível salvar o estacionamento.');
      return;
    }
    toast.success(estacEditando ? 'Estacionamento atualizado.' : 'Estacionamento cadastrado.');
    // Criado a partir do formulário de veículo: já deixa selecionado.
    if (!estacEditando && veiculoEditando && data?.id) {
      setVeiculoForm(f => ({ ...f, estacionamento_id: data.id }));
    }
    setEstacEditando(null);
    setEstacForm({ nome: '', endereco: '' });
    await carregar();
  };

  const excluirEstacionamento = async (e: Estacionamento) => {
    const emUso = veiculos.filter(v => v.estacionamento_id === e.id).length;
    if (emUso > 0) {
      toast.error(`Há ${emUso} veículo(s) alocado(s) em "${e.nome}". Realoque-os antes de excluir.`);
      return;
    }
    if (!window.confirm(`Excluir o estacionamento "${e.nome}"?`)) return;
    const { error } = await (supabase as any).from('estacionamentos').delete().eq('id', e.id);
    if (error) {
      console.error(error);
      toast.error('Não foi possível excluir o estacionamento.');
      return;
    }
    toast.success('Estacionamento excluído.');
    await carregar();
  };

  // ── Render ─────────────────────────────────────────────────────────

  if (carregando) {
    return (
      <div className="flex items-center justify-center py-24 text-slate-400">
        <Loader2 className="animate-spin" size={28} />
      </div>
    );
  }

  const podeEditar = !somenteLeitura;
  const inputCls = 'w-full px-3 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-slate-50 disabled:text-slate-500';
  const labelCls = 'block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1';

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2">
            <UserCheck className="text-indigo-600" /> Gestão de Supervisores
          </h1>
          <p className="text-sm text-slate-500 mt-1">Contatos, escolas sob responsabilidade e veículos de cada supervisor</p>
        </div>
        <button
          onClick={() => { setGerenciarEstac(true); setEstacEditando(null); setEstacForm({ nome: '', endereco: '' }); }}
          className="flex items-center gap-2 px-4 py-2 rounded-xl border border-slate-200 bg-white text-sm font-bold text-slate-700 hover:bg-slate-50"
        >
          <ParkingSquare size={16} /> Estacionamentos ({estacionamentos.length})
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { rotulo: 'Supervisores', valor: supervisores.length, cor: 'text-indigo-600' },
          { rotulo: 'Escolas com supervisor', valor: schools.length - escolasSemSupervisor.length, cor: 'text-emerald-600' },
          { rotulo: 'Escolas sem supervisor', valor: escolasSemSupervisor.length, cor: escolasSemSupervisor.length ? 'text-amber-600' : 'text-slate-400' },
          { rotulo: 'Veículos', valor: veiculos.length, cor: 'text-slate-700' },
        ].map(c => (
          <div key={c.rotulo} className="bg-white rounded-2xl border border-slate-200 p-4">
            <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">{c.rotulo}</p>
            <p className={`text-2xl font-black ${c.cor}`}>{c.valor}</p>
          </div>
        ))}
      </div>

      {escolasEmConflito.length > 0 && (
        <div className="flex items-start gap-3 bg-red-50 border border-red-200 text-red-800 rounded-2xl p-4 text-sm">
          <AlertTriangle size={18} className="shrink-0 mt-0.5" />
          <div>
            <p className="font-bold">Escolas com mais de um supervisor (cadastro antigo)</p>
            <ul className="mt-1 space-y-0.5 text-xs">
              {escolasEmConflito.map(s => (
                <li key={s.id}>
                  {s.name}: {(donosPorEscola.get(s.id) || []).map(d => d.full_name).join(', ')}
                </li>
              ))}
            </ul>
            <p className="mt-2 text-xs">Abra a ficha do supervisor correto e salve as escolas dele: o vínculo com os demais é removido.</p>
          </div>
        </div>
      )}

      {escolasSemSupervisor.length > 0 && (
        <details className="bg-amber-50 border border-amber-200 rounded-2xl p-4 text-sm text-amber-900">
          <summary className="cursor-pointer font-bold">{escolasSemSupervisor.length} escola(s) sem supervisor</summary>
          <ul className="mt-2 grid sm:grid-cols-2 gap-x-6 gap-y-0.5 text-xs">
            {escolasSemSupervisor.map(s => <li key={s.id}>{s.name}</li>)}
          </ul>
        </details>
      )}

      <div className="relative">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          value={busca}
          onChange={e => setBusca(e.target.value)}
          placeholder="Buscar por supervisor, e-mail, escola ou placa…"
          className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-slate-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
      </div>

      {supervisores.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-10 text-center text-sm text-slate-500">
          Nenhum usuário com perfil de supervisor. Cadastre-os em <strong>Gestão de Usuários</strong> com o perfil “Supervisor”.
        </div>
      ) : (
        <div className="grid md:grid-cols-2 gap-4">
          {supervisoresFiltrados.map(s => {
            const vs = veiculosPorSupervisor.get(s.id) || [];
            const escolas = s.supervisor_schools || [];
            return (
              <div key={s.id} className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm flex flex-col gap-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-black text-slate-900 truncate">{s.full_name || '(sem nome)'}</p>
                    <p className="text-xs text-slate-500 truncate">{s.email || 'sem e-mail de login'}</p>
                  </div>
                  <button
                    onClick={() => abrirFicha(s)}
                    className="shrink-0 px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-xs font-bold hover:bg-indigo-700"
                  >
                    Abrir ficha
                  </button>
                </div>

                <div className="flex flex-wrap gap-2 text-xs">
                  {s.whatsapp ? (
                    <a
                      href={`https://wa.me/55${s.whatsapp}`}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-1 px-2 py-1 rounded-lg bg-emerald-50 text-emerald-700 font-semibold hover:bg-emerald-100"
                    >
                      <MessageCircle size={12} /> {formatarTelefone(s.whatsapp)}
                    </a>
                  ) : (
                    <span className="flex items-center gap-1 px-2 py-1 rounded-lg bg-slate-50 text-slate-400"><Phone size={12} /> sem WhatsApp</span>
                  )}
                  {s.email_contato && (
                    <a href={`mailto:${s.email_contato}`} className="flex items-center gap-1 px-2 py-1 rounded-lg bg-slate-50 text-slate-600 hover:bg-slate-100">
                      <Mail size={12} /> {s.email_contato}
                    </a>
                  )}
                </div>

                <button onClick={() => abrirFicha(s, 'escolas')} className="text-left">
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-1">
                    <School size={12} /> {escolas.length} escola(s)
                  </p>
                  <p className="text-xs text-slate-600 line-clamp-2 mt-0.5">
                    {escolas.length ? escolas.map(id => nomeEscola.get(id) || '?').join(' · ') : 'Nenhuma escola vinculada'}
                  </p>
                </button>

                <button onClick={() => abrirFicha(s, 'veiculos')} className="text-left">
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-1">
                    <Car size={12} /> {vs.length} veículo(s)
                  </p>
                  {vs.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-1">
                      {vs.map(v => (
                        <span key={v.id} className="text-[11px] px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 font-mono">
                          {exibirPlaca(v.placa)} <span className="font-sans text-slate-500">· {nomeEstac.get(v.estacionamento_id)}</span>
                        </span>
                      ))}
                    </div>
                  )}
                </button>
              </div>
            );
          })}
          {supervisoresFiltrados.length === 0 && (
            <p className="text-sm text-slate-500 md:col-span-2 text-center py-8">Nenhum supervisor encontrado para “{busca}”.</p>
          )}
        </div>
      )}

      {/* ── Ficha do supervisor ── */}
      {ficha && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4" onClick={fecharFicha}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-3 p-5 border-b border-slate-100">
              <div className="min-w-0">
                <p className="text-[10px] font-black uppercase tracking-widest text-indigo-500">Ficha do supervisor</p>
                <h2 className="text-lg font-black text-slate-900 truncate">{ficha.full_name}</h2>
              </div>
              <button onClick={fecharFicha} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400"><X size={18} /></button>
            </div>

            <div className="flex gap-1 px-5 pt-3 border-b border-slate-100">
              {([
                ['contato', 'Contato', Phone],
                ['escolas', `Escolas (${escolasSel.length})`, School],
                ['veiculos', `Veículos (${(veiculosPorSupervisor.get(ficha.id) || []).length})`, Car],
              ] as const).map(([id, rotulo, Icone]) => (
                <button
                  key={id}
                  onClick={() => setAba(id)}
                  className={`flex items-center gap-1.5 px-3 py-2 text-xs font-bold border-b-2 -mb-px ${aba === id ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
                >
                  <Icone size={14} /> {rotulo}
                </button>
              ))}
            </div>

            <div className="p-5 overflow-y-auto flex-1">
              {aba === 'contato' && (
                <div className="space-y-4">
                  <div>
                    <label className={labelCls}>E-mail de login</label>
                    <input className={inputCls} value={ficha.email || ''} disabled />
                    <p className="text-[10px] text-slate-400 mt-1">Alterado apenas em Gestão de Usuários.</p>
                  </div>
                  <div>
                    <label className={labelCls}>WhatsApp</label>
                    <input
                      className={inputCls}
                      value={contato.whatsapp}
                      disabled={!podeEditar}
                      inputMode="tel"
                      placeholder="(11) 98765-4321"
                      onChange={e => setContato(c => ({ ...c, whatsapp: formatarTelefone(e.target.value) }))}
                    />
                  </div>
                  <div>
                    <label className={labelCls}>E-mail de contato</label>
                    <input
                      className={inputCls}
                      type="email"
                      value={contato.email_contato}
                      disabled={!podeEditar}
                      placeholder={ficha.email || 'nome@educacao.sp.gov.br'}
                      onChange={e => setContato(c => ({ ...c, email_contato: e.target.value }))}
                    />
                  </div>
                  {podeEditar && (
                    <div className="flex justify-end">
                      <button
                        onClick={salvarContato}
                        disabled={salvando}
                        className="flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 text-white text-sm font-bold hover:bg-indigo-700 disabled:opacity-50"
                      >
                        {salvando ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} Salvar contatos
                      </button>
                    </div>
                  )}
                </div>
              )}

              {aba === 'escolas' && (
                <div className="space-y-3">
                  <div className="relative">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      value={buscaEscola}
                      onChange={e => setBuscaEscola(e.target.value)}
                      placeholder="Filtrar escolas…"
                      className={`${inputCls} pl-8`}
                    />
                  </div>
                  <p className="text-[11px] text-slate-500">
                    Cada escola tem um único supervisor. Marcar uma escola que já é de outro supervisor a transfere para {ficha.full_name}.
                  </p>
                  <div className="border border-slate-200 rounded-xl divide-y divide-slate-100 max-h-[45vh] overflow-y-auto">
                    {escolasFiltradas.map(s => {
                      const outros = (donosPorEscola.get(s.id) || []).filter(d => d.id !== ficha.id);
                      const marcada = escolasSel.includes(s.id);
                      return (
                        <label key={s.id} className={`flex items-center gap-3 px-3 py-2 text-sm ${podeEditar ? 'cursor-pointer hover:bg-slate-50' : ''}`}>
                          <input
                            type="checkbox"
                            checked={marcada}
                            disabled={!podeEditar}
                            onChange={() => alternarEscola(s.id)}
                            className="rounded text-indigo-600"
                          />
                          <span className="flex-1 min-w-0 truncate text-slate-700">{s.name}</span>
                          {outros.length > 0 && (
                            <span className={`shrink-0 text-[10px] px-2 py-0.5 rounded-md ${marcada ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-500'}`}>
                              {marcada ? 'transferir de ' : ''}{outros.map(o => o.full_name).join(', ')}
                            </span>
                          )}
                        </label>
                      );
                    })}
                  </div>
                  {podeEditar && (
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-xs text-amber-700">
                        {transferencias.length > 0 && `${transferencias.length} escola(s) serão transferidas.`}
                      </p>
                      <button
                        onClick={salvarEscolas}
                        disabled={salvando}
                        className="flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 text-white text-sm font-bold hover:bg-indigo-700 disabled:opacity-50"
                      >
                        {salvando ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} Salvar escolas
                      </button>
                    </div>
                  )}
                </div>
              )}

              {aba === 'veiculos' && (
                <div className="space-y-3">
                  {(veiculosPorSupervisor.get(ficha.id) || []).map(v => (
                    <div key={v.id} className="flex items-center gap-3 border border-slate-200 rounded-xl p-3">
                      <div className="w-9 h-9 rounded-lg bg-slate-100 flex items-center justify-center text-slate-500">
                        {v.tipo === 'moto' ? <Bike size={18} /> : <Car size={18} />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-black text-slate-900">
                          <span className="font-mono">{exibirPlaca(v.placa)}</span>
                          <span className="font-semibold text-slate-600"> · {v.modelo}{v.cor ? ` · ${v.cor}` : ''}</span>
                        </p>
                        <p className="text-xs text-slate-500 flex items-center gap-1">
                          <ParkingSquare size={12} /> {nomeEstac.get(v.estacionamento_id)}{v.vaga ? ` · vaga ${v.vaga}` : ''}
                        </p>
                      </div>
                      {podeEditar && (
                        <div className="flex gap-1">
                          <button onClick={() => editarVeiculo(v)} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500" title="Editar"><Pencil size={14} /></button>
                          <button onClick={() => excluirVeiculo(v)} className="p-1.5 rounded-lg hover:bg-red-50 text-red-500" title="Excluir"><Trash2 size={14} /></button>
                        </div>
                      )}
                    </div>
                  ))}
                  {(veiculosPorSupervisor.get(ficha.id) || []).length === 0 && !veiculoEditando && (
                    <p className="text-sm text-slate-500 text-center py-4">Nenhum veículo cadastrado.</p>
                  )}

                  {podeEditar && !veiculoEditando && (
                    <button
                      onClick={() => { setVeiculoEditando('novo'); setVeiculoForm(VEICULO_VAZIO); }}
                      className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border-2 border-dashed border-slate-200 text-sm font-bold text-slate-500 hover:border-indigo-300 hover:text-indigo-600"
                    >
                      <Plus size={16} /> Cadastrar veículo
                    </button>
                  )}

                  {podeEditar && veiculoEditando && (
                    <div className="border border-indigo-200 bg-indigo-50/40 rounded-xl p-4 space-y-3">
                      <p className="text-xs font-black uppercase tracking-widest text-indigo-600">
                        {veiculoEditando === 'novo' ? 'Novo veículo' : 'Editar veículo'}
                      </p>
                      <div className="grid sm:grid-cols-2 gap-3">
                        <div>
                          <label className={labelCls}>Tipo</label>
                          <select className={inputCls} value={veiculoForm.tipo} onChange={e => setVeiculoForm(f => ({ ...f, tipo: e.target.value as 'carro' | 'moto' }))}>
                            <option value="carro">Carro</option>
                            <option value="moto">Moto</option>
                          </select>
                        </div>
                        <div>
                          <label className={labelCls}>Placa *</label>
                          <input
                            className={`${inputCls} font-mono uppercase`}
                            value={veiculoForm.placa}
                            placeholder="ABC1D23"
                            onChange={e => setVeiculoForm(f => ({ ...f, placa: normalizarPlaca(e.target.value) }))}
                          />
                        </div>
                        <div>
                          <label className={labelCls}>Modelo *</label>
                          <input className={inputCls} value={veiculoForm.modelo} placeholder="Ex.: Onix 1.0" onChange={e => setVeiculoForm(f => ({ ...f, modelo: e.target.value }))} />
                        </div>
                        <div>
                          <label className={labelCls}>Cor</label>
                          <input className={inputCls} value={veiculoForm.cor} placeholder="Ex.: Prata" onChange={e => setVeiculoForm(f => ({ ...f, cor: e.target.value }))} />
                        </div>
                        <div>
                          <label className={labelCls}>Estacionamento *</label>
                          <select className={inputCls} value={veiculoForm.estacionamento_id} onChange={e => setVeiculoForm(f => ({ ...f, estacionamento_id: e.target.value }))}>
                            <option value="">Selecione…</option>
                            {estacionamentos.map(e => <option key={e.id} value={e.id}>{e.nome}</option>)}
                          </select>
                          <button
                            type="button"
                            onClick={() => { setGerenciarEstac(true); setEstacEditando(null); setEstacForm({ nome: '', endereco: '' }); }}
                            className="text-[11px] font-bold text-indigo-600 hover:underline mt-1"
                          >
                            + cadastrar estacionamento
                          </button>
                        </div>
                        <div>
                          <label className={labelCls}>Vaga</label>
                          <input className={inputCls} value={veiculoForm.vaga} placeholder="Opcional" onChange={e => setVeiculoForm(f => ({ ...f, vaga: e.target.value }))} />
                        </div>
                      </div>
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={() => { setVeiculoEditando(null); setVeiculoForm(VEICULO_VAZIO); }}
                          className="px-4 py-2 rounded-xl text-sm font-bold text-slate-600 hover:bg-slate-100"
                        >
                          Cancelar
                        </button>
                        <button
                          onClick={salvarVeiculo}
                          disabled={salvando}
                          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 text-white text-sm font-bold hover:bg-indigo-700 disabled:opacity-50"
                        >
                          {salvando ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} Salvar veículo
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Cadastro de estacionamentos ── */}
      {gerenciarEstac && (
        <div className="fixed inset-0 z-[60] bg-slate-900/50 flex items-center justify-center p-4" onClick={() => setGerenciarEstac(false)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b border-slate-100">
              <h2 className="text-lg font-black text-slate-900 flex items-center gap-2"><ParkingSquare size={18} className="text-indigo-600" /> Estacionamentos</h2>
              <button onClick={() => setGerenciarEstac(false)} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400"><X size={18} /></button>
            </div>
            <div className="p-5 overflow-y-auto space-y-2">
              {estacionamentos.map(e => {
                const qtd = veiculos.filter(v => v.estacionamento_id === e.id).length;
                return (
                  <div key={e.id} className="flex items-center gap-3 border border-slate-200 rounded-xl p-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-slate-900">{e.nome}</p>
                      <p className="text-xs text-slate-500">{e.endereco || 'sem endereço'} · {qtd} veículo(s)</p>
                    </div>
                    {podeEditar && (
                      <div className="flex gap-1">
                        <button onClick={() => { setEstacEditando(e.id); setEstacForm({ nome: e.nome, endereco: e.endereco || '' }); }} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500" title="Editar"><Pencil size={14} /></button>
                        <button onClick={() => excluirEstacionamento(e)} className="p-1.5 rounded-lg hover:bg-red-50 text-red-500" title="Excluir"><Trash2 size={14} /></button>
                      </div>
                    )}
                  </div>
                );
              })}
              {estacionamentos.length === 0 && <p className="text-sm text-slate-500 text-center py-4">Nenhum estacionamento cadastrado.</p>}
            </div>
            {podeEditar && (
              <div className="p-5 border-t border-slate-100 space-y-3">
                <p className="text-xs font-black uppercase tracking-widest text-indigo-600">{estacEditando ? 'Editar estacionamento' : 'Novo estacionamento'}</p>
                <input className={inputCls} value={estacForm.nome} placeholder="Nome *" onChange={e => setEstacForm(f => ({ ...f, nome: e.target.value }))} />
                <input className={inputCls} value={estacForm.endereco} placeholder="Endereço (opcional)" onChange={e => setEstacForm(f => ({ ...f, endereco: e.target.value }))} />
                <div className="flex justify-end gap-2">
                  {estacEditando && (
                    <button onClick={() => { setEstacEditando(null); setEstacForm({ nome: '', endereco: '' }); }} className="px-4 py-2 rounded-xl text-sm font-bold text-slate-600 hover:bg-slate-100">
                      Cancelar
                    </button>
                  )}
                  <button onClick={salvarEstacionamento} className="flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 text-white text-sm font-bold hover:bg-indigo-700">
                    <Check size={14} /> Salvar
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

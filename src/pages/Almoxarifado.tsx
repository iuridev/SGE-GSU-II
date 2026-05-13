import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import {
  ShoppingCart, Package, Settings, Plus, Trash2,
  Check, Edit2, FileText, X, Save, History, ClipboardList,
  Clock, CheckCircle, XCircle, Layers, CalendarDays, AlertTriangle
} from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

interface Item {
  id: string;
  nome: string;
  quantidade: number;
  unidade: string;
}
interface CartItem { item: Item; quantidade_solicitada: number; }
interface SolicitacaoDetalhe {
  id: string; nome_solicitante: string; nome_evento: string;
  quantidade_pessoas: number; status: string; observacao: string; created_at: string;
  data_entrega: string | null;
  itens: { id: string; item_id: string; quantidade_solicitada: number; quantidade_aprovada: number; item_nome: string; item_unidade?: string }[];
}

const UNIDADES = ['Unidade', 'Pacote', 'Bloco', 'Kilo'];

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { cls: string; icon: React.ReactNode; label: string }> = {
    pendente:  { cls: 'bg-amber-50 text-amber-700 border-amber-200',    icon: <Clock size={12} />,        label: 'Pendente'  },
    aprovada:  { cls: 'bg-emerald-50 text-emerald-700 border-emerald-200', icon: <CheckCircle size={12} />, label: 'Aprovada'  },
    reprovada: { cls: 'bg-red-50 text-red-700 border-red-200',           icon: <XCircle size={12} />,     label: 'Reprovada' },
  };
  const c = map[status] || { cls: 'bg-gray-50 text-gray-600 border-gray-200', icon: null, label: status };
  return (
    <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border ${c.cls}`}>
      {c.icon}{c.label}
    </span>
  );
}

type Urgencia = 'atrasado' | 'hoje' | 'amanha' | 'proximo' | 'normal' | 'sem_data';
interface UrgenciaInfo { level: Urgencia; dias: number | null; cardCls: string; badgeCls: string; label: string }

function calcUrgencia(dataEntrega: string | null): UrgenciaInfo {
  if (!dataEntrega) return { level: 'sem_data', dias: null, cardCls: 'border-gray-100 bg-gray-50/50', badgeCls: '', label: '' };
  const [y, m, d] = dataEntrega.split('-').map(Number);
  const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
  const alvo = new Date(y, m - 1, d);
  const dias = Math.ceil((alvo.getTime() - hoje.getTime()) / 86400000);
  if (dias < 0)  return { level: 'atrasado', dias, cardCls: 'border-red-400 bg-red-50/50 shadow-red-100',    badgeCls: 'bg-red-100 text-red-700 border-red-300',    label: `${Math.abs(dias)}d atrasado` };
  if (dias === 0) return { level: 'hoje',     dias, cardCls: 'border-red-400 bg-red-50/40 shadow-red-100',    badgeCls: 'bg-red-100 text-red-700 border-red-300',    label: 'Hoje!' };
  if (dias === 1) return { level: 'amanha',   dias, cardCls: 'border-orange-300 bg-orange-50/40',             badgeCls: 'bg-orange-100 text-orange-700 border-orange-200', label: 'Amanhã' };
  if (dias <= 3)  return { level: 'proximo',  dias, cardCls: 'border-amber-300 bg-amber-50/30',               badgeCls: 'bg-amber-100 text-amber-700 border-amber-200', label: `em ${dias} dias` };
  return           { level: 'normal',   dias, cardCls: 'border-gray-100 bg-gray-50/50',                badgeCls: 'bg-blue-50 text-blue-600 border-blue-100',  label: `em ${dias} dias` };
}

export default function Almoxarifado() {
  const [isAdmin, setIsAdmin] = useState(false);
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [activeTab, setActiveTab] = useState<'solicitar' | 'minhas' | 'painel' | 'historico' | 'admin'>('solicitar');
  const [userId, setUserId] = useState('');
  const [userName, setUserName] = useState('');

  const [itens, setItens] = useState<Item[]>([]);
  const [itemEditando, setItemEditando] = useState<Item | null>(null);

  const [cart, setCart] = useState<CartItem[]>([]);
  const [evento, setEvento] = useState('');
  const [qtdPessoas, setQtdPessoas] = useState('');
  const [dataEntrega, setDataEntrega] = useState('');

  const [novoItemNome, setNovoItemNome] = useState('');
  const [novoItemQtd, setNovoItemQtd] = useState('');
  const [novoItemUnidade, setNovoItemUnidade] = useState('Unidade');

  const [solicitacoes, setSolicitacoes] = useState<SolicitacaoDetalhe[]>([]);
  const [historico, setHistorico] = useState<SolicitacaoDetalhe[]>([]);
  const [minhasSolicitacoes, setMinhasSolicitacoes] = useState<SolicitacaoDetalhe[]>([]);

  const [todosUsuarios, setTodosUsuarios] = useState<any[]>([]);
  const [responsaveis, setResponsaveis] = useState<string[]>([]);

  useEffect(() => {
    carregarUsuarioEPermissoes();
    carregarItens();
  }, []);

  useEffect(() => {
    if (activeTab === 'painel' && isAuthorized) carregarSolicitacoes();
    if (activeTab === 'historico' && isAuthorized) carregarHistorico();
  }, [activeTab, isAuthorized]);

  useEffect(() => {
    if (activeTab === 'minhas' && userId) carregarMinhasSolicitacoes();
  }, [activeTab, userId]);

  const carregarUsuarioEPermissoes = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    setUserId(user.id);

    const { data: profile } = await supabase.from('profiles').select('full_name, role').eq('id', user.id).single();
    if (profile) {
      setUserName(profile.full_name || user.email || 'Utilizador');
      if (profile.role === 'regional_admin') {
        setIsAdmin(true);
        carregarUsuariosEResponsaveis();
      }
    }

    const { data: auth } = await supabase.from('almoxarifado_responsaveis').select('id').eq('user_id', user.id).maybeSingle();
    if (auth || profile?.role === 'regional_admin') setIsAuthorized(true);
  };

  const carregarItens = async () => {
    const { data } = await supabase.from('almoxarifado_itens').select('*').order('nome');
    if (data) setItens(data);
  };

  const carregarSolicitacoes = async () => {
    const { data: solData, error } = await supabase
      .from('almoxarifado_solicitacoes').select('*').eq('status', 'pendente');
    if (error) { console.error(error.message); return; }
    if (solData) {
      const detalhes = await Promise.all(solData.map(async (s) => {
        const { data: itData } = await supabase.from('almoxarifado_solicitacao_itens')
          .select('*, item:almoxarifado_itens(nome, unidade)').eq('solicitacao_id', s.id);
        return { ...s, itens: itData?.map((i: any) => ({ ...i, item_nome: i.item?.nome || 'Item não encontrado', item_unidade: i.item?.unidade || 'Unidade' })) || [] };
      }));
      // Ordena por data de entrega: mais urgente primeiro; sem data vai pro fim
      detalhes.sort((a, b) => {
        if (!a.data_entrega && !b.data_entrega) return 0;
        if (!a.data_entrega) return 1;
        if (!b.data_entrega) return -1;
        return new Date(a.data_entrega).getTime() - new Date(b.data_entrega).getTime();
      });
      setSolicitacoes(detalhes);
    }
  };

  const carregarHistorico = async () => {
    const { data: solData, error } = await supabase
      .from('almoxarifado_solicitacoes').select('*').neq('status', 'pendente').order('created_at', { ascending: false });
    if (error) { console.error(error.message); return; }
    if (solData) {
      const detalhes = await Promise.all(solData.map(async (s) => {
        const { data: itData } = await supabase.from('almoxarifado_solicitacao_itens')
          .select('*, item:almoxarifado_itens(nome, unidade)').eq('solicitacao_id', s.id);
        return { ...s, itens: itData?.map((i: any) => ({ ...i, item_nome: i.item?.nome || 'Item não encontrado', item_unidade: i.item?.unidade || 'Unidade' })) || [] };
      }));
      setHistorico(detalhes);
    }
  };

  const carregarMinhasSolicitacoes = async () => {
    const { data: solData } = await supabase
      .from('almoxarifado_solicitacoes').select('*').eq('user_id', userId).order('created_at', { ascending: false });
    if (solData) {
      const detalhes = await Promise.all(solData.map(async (s) => {
        const { data: itData } = await supabase.from('almoxarifado_solicitacao_itens')
          .select('*, item:almoxarifado_itens(nome, unidade)').eq('solicitacao_id', s.id);
        return { ...s, itens: itData?.map((i: any) => ({ ...i, item_nome: i.item?.nome || 'Item não encontrado', item_unidade: i.item?.unidade || 'Unidade' })) || [] };
      }));
      setMinhasSolicitacoes(detalhes);
    }
  };

  const adicionarAoCarrinho = (item: Item, qtd: number) => {
    if (qtd <= 0) return;
    const existente = cart.find(c => c.item.id === item.id);
    if (existente) {
      setCart(cart.map(c => c.item.id === item.id ? { ...c, quantidade_solicitada: c.quantidade_solicitada + qtd } : c));
    } else {
      setCart([...cart, { item, quantidade_solicitada: qtd }]);
    }
  };

  const finalizarSolicitacao = async (e: React.FormEvent) => {
    e.preventDefault();
    if (cart.length === 0) return alert('O seu carrinho está vazio!');

    const { data: solData, error: solError } = await supabase.from('almoxarifado_solicitacoes').insert([{
      user_id: userId, nome_solicitante: userName, nome_evento: evento,
      quantidade_pessoas: parseInt(qtdPessoas), status: 'pendente',
      data_entrega: dataEntrega || null
    }]).select().single();

    if (solError) { alert('Erro ao enviar pedido: ' + solError.message); return; }

    if (solData) {
      const itensInsert = cart.map(c => ({
        solicitacao_id: solData.id, item_id: c.item.id,
        quantidade_solicitada: c.quantidade_solicitada, quantidade_aprovada: c.quantidade_solicitada
      }));
      await supabase.from('almoxarifado_solicitacao_itens').insert(itensInsert);
      alert('Solicitação enviada com sucesso!');
      setCart([]); setEvento(''); setQtdPessoas(''); setDataEntrega('');
    }
  };

  const cadastrarNovoItem = async (e: React.FormEvent) => {
    e.preventDefault();
    await supabase.from('almoxarifado_itens').insert([{ nome: novoItemNome, quantidade: parseInt(novoItemQtd), unidade: novoItemUnidade }]);
    setNovoItemNome(''); setNovoItemQtd(''); setNovoItemUnidade('Unidade');
    carregarItens();
  };

  const excluirItem = async (id: string) => {
    if (!confirm('Excluir este item permanentemente?')) return;
    await supabase.from('almoxarifado_itens').delete().eq('id', id);
    carregarItens();
  };

  const salvarEdicaoItem = async () => {
    if (!itemEditando) return;
    await supabase.from('almoxarifado_itens')
      .update({ nome: itemEditando.nome, quantidade: itemEditando.quantidade, unidade: itemEditando.unidade })
      .eq('id', itemEditando.id);
    setItemEditando(null);
    carregarItens();
  };

  const processarSolicitacao = async (solicitacaoId: string, itensAtuais: any[], obs: string, statusFinal: 'aprovada' | 'reprovada') => {
    if (statusFinal === 'aprovada') {
      for (const i of itensAtuais) {
        await supabase.from('almoxarifado_solicitacao_itens').update({ quantidade_aprovada: i.quantidade_aprovada }).eq('id', i.id);
        const { data: itemBanco } = await supabase.from('almoxarifado_itens').select('quantidade').eq('id', i.item_id).single();
        if (itemBanco) await supabase.from('almoxarifado_itens').update({ quantidade: itemBanco.quantidade - i.quantidade_aprovada }).eq('id', i.item_id);
      }
    } else {
      for (const i of itensAtuais) {
        await supabase.from('almoxarifado_solicitacao_itens').update({ quantidade_aprovada: 0 }).eq('id', i.id);
      }
    }
    await supabase.from('almoxarifado_solicitacoes').update({ status: statusFinal, observacao: obs }).eq('id', solicitacaoId);
    carregarSolicitacoes();
    carregarItens();
    alert(`Pedido ${statusFinal} com sucesso!`);
  };

  const gerarRelatorioPDF = () => {
    const doc = new jsPDF();
    doc.text("SGE-GSU-II - Relatório de Inventário (Almoxarifado)", 14, 15);
    doc.setFontSize(10);
    doc.text(`Gerado por: ${userName} em ${new Date().toLocaleString('pt-BR')}`, 14, 22);
    autoTable(doc, {
      startY: 28,
      head: [['Material', 'Unidade', 'Estoque']],
      body: itens.map(i => [i.nome, i.unidade || 'Unidade', i.quantidade.toString()]),
      headStyles: { fillColor: [37, 99, 235] },
    });
    doc.save(`estoque_${new Date().toISOString().split('T')[0]}.pdf`);
  };

  const carregarUsuariosEResponsaveis = async () => {
    const { data: usersData } = await supabase.from('profiles').select('id, full_name, email, role');
    if (usersData) setTodosUsuarios(usersData);
    const { data: respData } = await supabase.from('almoxarifado_responsaveis').select('user_id');
    if (respData) setResponsaveis(respData.map(r => r.user_id));
  };

  const toggleResponsavel = async (targetId: string, isCurrentlyResp: boolean) => {
    if (isCurrentlyResp) {
      const admins = todosUsuarios.filter(u => u.role === 'regional_admin').length;
      if (admins + responsaveis.length <= 3) return alert('Regra de segurança: Mínimo de 3 utilizadores autorizados exigido.');
      await supabase.from('almoxarifado_responsaveis').delete().eq('user_id', targetId);
      setResponsaveis(prev => prev.filter(id => id !== targetId));
    } else {
      await supabase.from('almoxarifado_responsaveis').insert([{ user_id: targetId }]);
      setResponsaveis(prev => [...prev, targetId]);
    }
  };

  const tabsConfig = [
    { key: 'solicitar' as const, label: 'Solicitar Material', icon: <ShoppingCart size={15} /> },
    { key: 'minhas' as const, label: 'Minhas Solicitações', icon: <ClipboardList size={15} /> },
    ...(isAuthorized ? [
      { key: 'painel' as const, label: 'Painel', icon: <Package size={15} /> },
      { key: 'historico' as const, label: 'Histórico', icon: <History size={15} /> },
    ] : []),
    ...(isAdmin ? [{ key: 'admin' as const, label: 'Acessos', icon: <Settings size={15} /> }] : []),
  ];

  const fmtData = (d: string) => new Date(d).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  const fmtDataEntrega = (d: string) => { const [y, m, day] = d.split('-'); return `${day}/${m}/${y}`; };
  const hoje = new Date().toISOString().split('T')[0];

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-6">
      <div className="max-w-7xl mx-auto space-y-5">

        {/* HEADER */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 flex flex-wrap gap-4 justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="bg-blue-600 p-2.5 rounded-xl shadow-md shadow-blue-200">
              <Package className="h-6 w-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900 leading-tight">Almoxarifado</h1>
              <p className="text-xs text-gray-400 mt-0.5">Gestão de materiais e estoque</p>
            </div>
          </div>
          {isAuthorized && (
            <button onClick={gerarRelatorioPDF}
              className="flex items-center gap-2 bg-red-50 text-red-600 border border-red-200 px-4 py-2 rounded-xl text-sm font-semibold hover:bg-red-600 hover:text-white hover:border-red-600 transition-all">
              <FileText size={16} /> Exportar PDF
            </button>
          )}
        </div>

        {/* TABS */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-1.5">
          <div className="flex gap-1 overflow-x-auto">
            {tabsConfig.map(tab => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-semibold text-sm whitespace-nowrap transition-all ${
                  activeTab === tab.key
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-gray-400 hover:text-gray-700 hover:bg-gray-100'
                }`}
              >
                {tab.icon} {tab.label}
                {tab.key === 'minhas' && minhasSolicitacoes.some(s => s.status === 'pendente') && (
                  <span className="w-2 h-2 rounded-full bg-amber-400 inline-block" />
                )}
                {tab.key === 'painel' && solicitacoes.length > 0 && (
                  <span className="bg-amber-400 text-white text-xs font-bold px-1.5 py-0.5 rounded-full leading-none">{solicitacoes.length}</span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* ABA: SOLICITAR */}
        {activeTab === 'solicitar' && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            <div className="md:col-span-2">
              <div className="flex items-center gap-2 mb-4">
                <Layers size={16} className="text-blue-500" />
                <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">Materiais Disponíveis</h2>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {itens.filter(i => i.quantidade > 0).map(item => (
                  <div key={item.id} className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm hover:shadow-md hover:border-blue-200 transition-all flex flex-col gap-3">
                    <div>
                      <p className="font-semibold text-gray-800 text-sm leading-snug">{item.nome}</p>
                      <p className="text-xs text-gray-400 mt-1">
                        Disponível: <span className="font-bold text-emerald-600">{item.quantidade}</span> {item.unidade || 'Unidade'}(s)
                      </p>
                    </div>
                    <div className="flex gap-2 mt-auto">
                      <input
                        type="number" min="1"
                        id={`qtd-${item.id}`}
                        defaultValue={1}
                        className="border border-gray-200 rounded-lg w-16 px-2 py-1.5 text-sm text-center outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                      />
                      <button
                        onClick={() => {
                          const input = document.getElementById(`qtd-${item.id}`) as HTMLInputElement;
                          adicionarAoCarrinho(item, parseInt(input.value));
                          input.value = '1';
                        }}
                        className="flex-1 bg-blue-600 text-white rounded-lg text-xs font-semibold hover:bg-blue-700 transition-colors flex items-center justify-center gap-1"
                      >
                        <Plus size={14} /> Adicionar
                      </button>
                    </div>
                  </div>
                ))}
                {itens.filter(i => i.quantidade > 0).length === 0 && (
                  <div className="col-span-full bg-white rounded-2xl border p-10 text-center">
                    <Package size={40} className="mx-auto text-gray-200 mb-3" />
                    <p className="text-gray-400 text-sm">Nenhum material disponível no momento.</p>
                  </div>
                )}
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 h-fit sticky top-6">
              <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4 flex items-center gap-2">
                <ShoppingCart size={16} className="text-blue-500" /> Seu Pedido
              </h2>
              {cart.length === 0 ? (
                <div className="py-8 text-center">
                  <ShoppingCart size={32} className="mx-auto text-gray-200 mb-2" />
                  <p className="text-gray-400 text-sm">Adicione itens ao lado para começar.</p>
                </div>
              ) : (
                <ul className="space-y-2 mb-5 max-h-56 overflow-y-auto">
                  {cart.map(c => (
                    <li key={c.item.id} className="flex justify-between items-center bg-blue-50 rounded-xl px-3 py-2 text-sm">
                      <div>
                        <p className="font-semibold text-gray-800 text-xs">{c.item.nome}</p>
                        <p className="text-xs text-gray-500">{c.quantidade_solicitada} {c.item.unidade || 'Unidade'}(s)</p>
                      </div>
                      <button onClick={() => setCart(cart.filter(x => x.item.id !== c.item.id))}
                        className="text-red-400 hover:text-red-600 p-1 rounded-lg hover:bg-red-50 transition-colors">
                        <Trash2 size={14} />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <form onSubmit={finalizarSolicitacao} className="space-y-3 pt-4 border-t border-gray-100">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1">Motivo / Evento</label>
                  <input required type="text" value={evento} onChange={e => setEvento(e.target.value)}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                    placeholder="Ex: Formação Setorial" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1">Nº de Participantes</label>
                  <input required type="number" min="1" value={qtdPessoas} onChange={e => setQtdPessoas(e.target.value)}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                    placeholder="Ex: 15" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1 flex items-center gap-1">
                    <CalendarDays size={12} /> Data de entrega / retirada
                  </label>
                  <input required type="date" min={hoje} value={dataEntrega} onChange={e => setDataEntrega(e.target.value)}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" />
                </div>
                <button disabled={cart.length === 0} type="submit"
                  className="w-full bg-emerald-600 text-white py-2.5 rounded-xl font-semibold hover:bg-emerald-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex justify-center items-center gap-2 text-sm">
                  <Check size={16} /> Confirmar Pedido
                </button>
              </form>
            </div>
          </div>
        )}

        {/* ABA: MINHAS SOLICITAÇÕES */}
        {activeTab === 'minhas' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ClipboardList size={16} className="text-blue-500" />
                <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">Minhas Solicitações</h2>
              </div>
              <button onClick={carregarMinhasSolicitacoes}
                className="text-xs text-blue-500 hover:text-blue-700 font-semibold flex items-center gap-1 bg-blue-50 px-3 py-1.5 rounded-lg hover:bg-blue-100 transition-colors">
                Atualizar
              </button>
            </div>

            {minhasSolicitacoes.length === 0 ? (
              <div className="bg-white rounded-2xl border p-12 text-center">
                <ClipboardList size={48} className="mx-auto text-gray-200 mb-3" />
                <p className="text-gray-400 font-medium">Nenhuma solicitação encontrada.</p>
                <p className="text-gray-300 text-sm mt-1">Seus pedidos aparecerão aqui após serem enviados.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {minhasSolicitacoes.map(sol => (
                  <div key={sol.id} className={`bg-white rounded-2xl border shadow-sm overflow-hidden transition-all hover:shadow-md ${
                    sol.status === 'aprovada' ? 'border-l-4 border-l-emerald-400' :
                    sol.status === 'reprovada' ? 'border-l-4 border-l-red-400' :
                    'border-l-4 border-l-amber-400'
                  }`}>
                    <div className="p-4">
                      <div className="flex justify-between items-start mb-3">
                        <div className="flex-1 min-w-0">
                          <p className="font-bold text-gray-800 truncate">{sol.nome_evento}</p>
                          <p className="text-xs text-gray-400 mt-0.5">{fmtData(sol.created_at)}</p>
                        </div>
                        <StatusBadge status={sol.status} />
                      </div>

                      <div className="space-y-1.5 mb-3">
                        {sol.itens.map(it => (
                          <div key={it.id} className="flex justify-between items-center bg-gray-50 rounded-xl px-3 py-2 text-sm">
                            <span className="font-medium text-gray-700 text-xs">{it.item_nome}</span>
                            <div className="text-xs text-gray-500 flex gap-2">
                              <span>Pediu: <b>{it.quantidade_solicitada} {it.item_unidade}</b></span>
                              {sol.status === 'aprovada' && (
                                <span className="text-emerald-600">| Aprovado: <b>{it.quantidade_aprovada}</b></span>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>

                      {sol.observacao && (
                        <div className="flex gap-2 p-2.5 bg-yellow-50 rounded-xl border border-yellow-100 text-xs text-gray-600 italic">
                          <span className="font-semibold not-italic text-yellow-600">Obs:</span> {sol.observacao}
                        </div>
                      )}

                      {sol.status === 'pendente' && (
                        <div className="mt-3 flex items-center gap-1.5 text-xs text-amber-600 font-medium">
                          <Clock size={12} /> Aguardando análise do almoxarife
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ABA: PAINEL DO ALMOXARIFE */}
        {activeTab === 'painel' && isAuthorized && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <div className="space-y-5">
              {/* Cadastro de novo item */}
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4 flex items-center gap-2">
                  <Plus size={15} className="text-blue-500" /> Nova Entrada de Estoque
                </h2>
                <form onSubmit={cadastrarNovoItem} className="space-y-3">
                  <input required type="text" value={novoItemNome} onChange={e => setNovoItemNome(e.target.value)}
                    placeholder="Nome do material"
                    className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" />
                  <div className="flex gap-3">
                    <div className="flex-1">
                      <select value={novoItemUnidade} onChange={e => setNovoItemUnidade(e.target.value)}
                        className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 bg-white">
                        {UNIDADES.map(u => <option key={u} value={u}>{u}</option>)}
                      </select>
                    </div>
                    <div className="w-28">
                      <input required type="number" min="0" value={novoItemQtd} onChange={e => setNovoItemQtd(e.target.value)}
                        placeholder="Qtd."
                        className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-center outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" />
                    </div>
                  </div>
                  <button type="submit"
                    className="w-full bg-blue-600 text-white py-2.5 rounded-xl text-sm font-semibold hover:bg-blue-700 transition-colors flex items-center justify-center gap-2">
                    <Plus size={16} /> Cadastrar Item
                  </button>
                </form>
              </div>

              {/* Inventário */}
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden flex flex-col" style={{ maxHeight: '460px' }}>
                <div className="p-4 border-b border-gray-100 flex justify-between items-center">
                  <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">Inventário Geral</h2>
                  <span className="text-xs bg-blue-100 text-blue-700 font-bold px-2.5 py-1 rounded-full">{itens.length} itens</span>
                </div>
                <div className="overflow-y-auto flex-1">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50/80 sticky top-0">
                      <tr>
                        <th className="p-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider">Material</th>
                        <th className="p-3 text-center text-xs font-semibold text-gray-400 uppercase tracking-wider">Unid.</th>
                        <th className="p-3 text-center text-xs font-semibold text-gray-400 uppercase tracking-wider">Estoque</th>
                        <th className="p-3 text-right text-xs font-semibold text-gray-400 uppercase tracking-wider w-20">Ações</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {itens.map(item => (
                        <tr key={item.id} className="hover:bg-blue-50/50 transition-colors">
                          <td className="p-3 font-medium text-gray-800 text-sm">{item.nome}</td>
                          <td className="p-3 text-center">
                            <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-lg">{item.unidade || 'Unidade'}</span>
                          </td>
                          <td className="p-3 text-center">
                            <span className={`px-2.5 py-1 rounded-lg text-xs font-bold ${item.quantidade > 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600'}`}>
                              {item.quantidade}
                            </span>
                          </td>
                          <td className="p-3 text-right space-x-1">
                            <button onClick={() => setItemEditando(item)}
                              className="text-blue-500 hover:bg-blue-100 p-1.5 rounded-lg transition-colors" title="Editar">
                              <Edit2 size={14} />
                            </button>
                            <button onClick={() => excluirItem(item.id)}
                              className="text-red-400 hover:bg-red-100 p-1.5 rounded-lg transition-colors" title="Excluir">
                              <Trash2 size={14} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            {/* Pedidos para deferir */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm flex flex-col" style={{ maxHeight: '630px' }}>
              <div className="p-4 border-b border-gray-100 flex justify-between items-center">
                <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">Pedidos para Deferir</h2>
                {solicitacoes.length > 0 && (
                  <span className="animate-pulse bg-amber-100 text-amber-700 text-xs font-bold px-2.5 py-1 rounded-full border border-amber-200">
                    {solicitacoes.length} pendente{solicitacoes.length > 1 ? 's' : ''}
                  </span>
                )}
              </div>
              <div className="p-4 overflow-y-auto flex-1">
                {solicitacoes.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full text-gray-300 gap-3 py-10">
                    <CheckCircle size={52} className="text-emerald-200" />
                    <p className="text-gray-400 font-medium">Tudo em dia! Nenhum pedido pendente.</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {solicitacoes.map(sol => {
                      const urg = calcUrgencia(sol.data_entrega);
                      return (
                      <div key={sol.id} className={`border rounded-2xl p-4 transition-all shadow-sm ${urg.cardCls}`}>
                        {/* Faixa de urgência no topo quando crítico */}
                        {(urg.level === 'atrasado' || urg.level === 'hoje' || urg.level === 'amanha') && (
                          <div className="flex items-center gap-1.5 text-xs font-bold text-red-600 mb-3 -mt-1">
                            <AlertTriangle size={13} className="shrink-0" />
                            {urg.level === 'atrasado' ? `Entrega atrasada há ${Math.abs(urg.dias!)} dia(s)!` : urg.level === 'hoje' ? 'Entrega deve ser feita HOJE!' : 'Entrega é AMANHÃ!'}
                          </div>
                        )}
                        <div className="mb-3 pb-3 border-b border-black/5">
                          <div className="flex justify-between items-start gap-2">
                            <p className="font-bold text-gray-800">{sol.nome_evento}</p>
                            {sol.data_entrega && (
                              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold border whitespace-nowrap ${urg.badgeCls}`}>
                                <CalendarDays size={11} /> {fmtDataEntrega(sol.data_entrega)} · {urg.label}
                              </span>
                            )}
                          </div>
                          <div className="flex gap-3 mt-1 text-xs text-gray-400">
                            <span>Solicitante: <b className="text-gray-600">{sol.nome_solicitante}</b></span>
                            <span>Pessoas: <b className="text-gray-600">{sol.quantidade_pessoas}</b></span>
                          </div>
                        </div>
                        <form id={`form-${sol.id}`}>
                          <div className="space-y-2 mb-3">
                            {sol.itens.map(it => (
                              <div key={it.id} className="flex items-center justify-between bg-white rounded-xl p-2.5 border border-gray-100">
                                <div>
                                  <p className="text-xs font-semibold text-gray-700">{it.item_nome}</p>
                                  <p className="text-xs text-gray-400">{it.item_unidade} · Pediu: {it.quantidade_solicitada}</p>
                                </div>
                                <div className="flex items-center gap-2">
                                  <span className="text-xs font-semibold text-blue-600">Aprovar:</span>
                                  <input type="number" min="0" name={`q-${it.id}`} defaultValue={it.quantidade_solicitada}
                                    className="w-16 border border-gray-200 rounded-lg text-center text-sm py-1 outline-none focus:border-blue-500 bg-white" />
                                </div>
                              </div>
                            ))}
                          </div>
                          <input type="text" name="obs" placeholder="Observações (opcional)"
                            className="w-full text-sm p-2.5 mb-3 border border-gray-200 rounded-xl outline-none focus:border-blue-500" />
                          <div className="flex gap-2">
                            <button type="button"
                              onClick={(e) => {
                                const form = e.currentTarget.closest('form') as HTMLFormElement;
                                const fd = new FormData(form);
                                const itA = sol.itens.map(i => ({ ...i, quantidade_aprovada: parseInt(fd.get(`q-${i.id}`) as string) }));
                                processarSolicitacao(sol.id, itA, fd.get('obs') as string, 'aprovada');
                              }}
                              className="flex-1 bg-blue-600 text-white py-2.5 rounded-xl text-sm font-bold hover:bg-blue-700 transition-colors flex items-center justify-center gap-2">
                              <Check size={16} /> Aprovar
                            </button>
                            <button type="button"
                              onClick={(e) => {
                                const form = e.currentTarget.closest('form') as HTMLFormElement;
                                const fd = new FormData(form);
                                processarSolicitacao(sol.id, sol.itens, fd.get('obs') as string, 'reprovada');
                              }}
                              className="flex-1 bg-red-50 text-red-600 border border-red-200 py-2.5 rounded-xl text-sm font-bold hover:bg-red-600 hover:text-white hover:border-red-600 transition-all flex items-center justify-center gap-2">
                              <X size={16} /> Reprovar
                            </button>
                          </div>
                        </form>
                      </div>
                    ); })}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ABA: HISTÓRICO */}
        {activeTab === 'historico' && isAuthorized && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <History size={16} className="text-blue-500" />
                <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">Histórico de Solicitações</h2>
              </div>
              <span className="text-xs text-gray-400 bg-gray-100 px-2.5 py-1 rounded-lg">{historico.length} registros</span>
            </div>
            {historico.length === 0 ? (
              <div className="bg-white rounded-2xl border p-12 text-center">
                <History size={48} className="mx-auto text-gray-200 mb-3" />
                <p className="text-gray-400">Nenhum histórico encontrado.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {historico.map(sol => (
                  <div key={sol.id} className={`bg-white rounded-2xl border shadow-sm overflow-hidden hover:shadow-md transition-all ${
                    sol.status === 'aprovada' ? 'border-l-4 border-l-emerald-400' : 'border-l-4 border-l-red-400'
                  }`}>
                    <div className="p-4">
                      <div className="flex justify-between items-start mb-3">
                        <div className="flex-1 min-w-0">
                          <p className="font-bold text-gray-800 truncate">{sol.nome_evento}</p>
                          <p className="text-xs text-gray-400 mt-0.5">{sol.nome_solicitante} · {fmtData(sol.created_at)}</p>
                        </div>
                        <StatusBadge status={sol.status} />
                      </div>

                      <div className="space-y-1.5 mb-3">
                        {sol.itens.map(it => (
                          <div key={it.id} className="flex justify-between items-center bg-gray-50 rounded-xl px-3 py-2 text-xs">
                            <span className="font-medium text-gray-700">{it.item_nome}</span>
                            <span className="text-gray-400">
                              {sol.status === 'aprovada'
                                ? <><b className="text-gray-600">{it.quantidade_solicitada}</b> → <b className="text-emerald-600">{it.quantidade_aprovada}</b> {it.item_unidade}</>
                                : <><b className="text-gray-600">{it.quantidade_solicitada}</b> {it.item_unidade}</>
                              }
                            </span>
                          </div>
                        ))}
                      </div>

                      {sol.observacao && (
                        <div className="p-2.5 bg-yellow-50 rounded-xl border border-yellow-100 text-xs text-gray-600 italic">
                          <span className="font-semibold not-italic text-yellow-600">Obs:</span> {sol.observacao}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ABA: ADMINISTRAÇÃO */}
        {activeTab === 'admin' && isAdmin && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="p-5 border-b border-gray-100 flex items-center gap-2">
              <Settings size={16} className="text-gray-400" />
              <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">Gestão de Acessos ao Almoxarifado</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50/80">
                  <tr>
                    <th className="p-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider">Colaborador</th>
                    <th className="p-3 text-center text-xs font-semibold text-gray-400 uppercase tracking-wider">Permissão</th>
                    <th className="p-3 text-center text-xs font-semibold text-gray-400 uppercase tracking-wider w-40">Ação</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {todosUsuarios.map(u => {
                    const isResp = responsaveis.includes(u.id);
                    const isAuto = u.role === 'regional_admin';
                    return (
                      <tr key={u.id} className="hover:bg-gray-50 transition-colors">
                        <td className="p-3">
                          <p className="font-semibold text-gray-800">{u.full_name}</p>
                          <p className="text-xs text-gray-400">{u.role}</p>
                        </td>
                        <td className="p-3 text-center">
                          {isAuto
                            ? <span className="bg-blue-50 text-blue-700 border border-blue-200 text-xs font-bold px-3 py-1 rounded-full">Admin</span>
                            : isResp
                            ? <span className="bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs font-bold px-3 py-1 rounded-full">Almoxarife</span>
                            : <span className="bg-gray-100 text-gray-400 text-xs font-bold px-3 py-1 rounded-full">Sem Acesso</span>
                          }
                        </td>
                        <td className="p-3 text-center">
                          {isAuto
                            ? <span className="text-xs text-gray-300 italic">Inamovível</span>
                            : (
                              <button onClick={() => toggleResponsavel(u.id, isResp)}
                                className={`px-4 py-1.5 rounded-xl text-xs font-bold transition-all border ${
                                  isResp
                                    ? 'bg-white border-red-200 text-red-500 hover:bg-red-50'
                                    : 'bg-white border-emerald-200 text-emerald-600 hover:bg-emerald-50'
                                }`}>
                                {isResp ? 'Revogar' : 'Autorizar'}
                              </button>
                            )
                          }
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* MODAL: EDITAR ITEM */}
      {itemEditando && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl">
            <div className="flex justify-between items-center mb-5">
              <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                <Edit2 size={18} className="text-blue-500" /> Editar Item
              </h3>
              <button onClick={() => setItemEditando(null)} className="text-gray-300 hover:text-gray-600 transition-colors p-1 rounded-lg hover:bg-gray-100">
                <X size={20} />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1.5">Nome do Material</label>
                <input type="text" value={itemEditando.nome}
                  onChange={e => setItemEditando({ ...itemEditando, nome: e.target.value })}
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1.5">Unidade de Medida</label>
                <select value={itemEditando.unidade || 'Unidade'}
                  onChange={e => setItemEditando({ ...itemEditando, unidade: e.target.value })}
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 bg-white">
                  {UNIDADES.map(u => <option key={u} value={u}>{u}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1.5">Quantidade em Estoque</label>
                <input type="number" min="0" value={itemEditando.quantidade}
                  onChange={e => setItemEditando({ ...itemEditando, quantidade: parseInt(e.target.value) })}
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" />
              </div>
            </div>
            <div className="flex gap-3 pt-5 mt-5 border-t border-gray-100">
              <button onClick={() => setItemEditando(null)}
                className="flex-1 px-4 py-2.5 border border-gray-200 rounded-xl text-gray-600 font-medium hover:bg-gray-50 transition-colors text-sm">
                Cancelar
              </button>
              <button onClick={salvarEdicaoItem}
                className="flex-1 px-4 py-2.5 bg-blue-600 text-white rounded-xl font-semibold hover:bg-blue-700 transition-colors flex items-center justify-center gap-2 text-sm">
                <Save size={16} /> Salvar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

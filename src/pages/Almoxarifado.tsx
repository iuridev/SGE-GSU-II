import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { 
  ShoppingCart, Package, Settings, Plus, Trash2, 
  Check, Edit2, FileText, X, Save, History 
} from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

// Tipagens
interface Item { id: string; nome: string; quantidade: number; }
interface CartItem { item: Item; quantidade_solicitada: number; }
interface Solicitacao {
  id: string; nome_solicitante: string; nome_evento: string; 
  quantidade_pessoas: number; status: string; observacao: string; created_at: string;
}
interface SolicitacaoDetalhe extends Solicitacao {
  itens: { id: string; item_id: string; quantidade_solicitada: number; 
  quantidade_aprovada: number; item_nome: string }[];
}

export default function Almoxarifado() {
  const [isAdmin, setIsAdmin] = useState(false);
  const [isAuthorized, setIsAuthorized] = useState(false);
  // Adicionada a aba 'historico'
  const [activeTab, setActiveTab] = useState<'solicitar' | 'painel' | 'admin' | 'historico'>('solicitar');
  const [userId, setUserId] = useState('');
  const [userName, setUserName] = useState('');

  // Estados Comuns
  const [itens, setItens] = useState<Item[]>([]);
  const [itemEditando, setItemEditando] = useState<Item | null>(null);
  
  // Estados: Solicitante (Carrinho)
  const [cart, setCart] = useState<CartItem[]>([]);
  const [evento, setEvento] = useState('');
  const [qtdPessoas, setQtdPessoas] = useState('');

  // Estados: Almoxarife e Pedidos
  const [novoItemNome, setNovoItemNome] = useState('');
  const [novoItemQtd, setNovoItemQtd] = useState('');
  const [solicitacoes, setSolicitacoes] = useState<SolicitacaoDetalhe[]>([]);
  const [historico, setHistorico] = useState<SolicitacaoDetalhe[]>([]); // Novo estado para o histórico

  // Estados: Admin
  const [todosUsuarios, setTodosUsuarios] = useState<any[]>([]);
  const [responsaveis, setResponsaveis] = useState<string[]>([]);

  // 1. Carregamento Inicial
  useEffect(() => {
    carregarUsuarioEPermissoes();
    carregarItens();
  }, []);

  // 2. Recarregar pedidos e histórico sempre que as abas do almoxarife forem abertas
  useEffect(() => {
    if (activeTab === 'painel' && isAuthorized) {
      carregarSolicitacoes();
    }
    if (activeTab === 'historico' && isAuthorized) {
      carregarHistorico();
    }
  }, [activeTab, isAuthorized]);

  const carregarUsuarioEPermissoes = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    setUserId(user.id);

    // Buscar nome e papel na tabela profiles
    const { data: profile } = await supabase.from('profiles').select('full_name, role').eq('id', user.id).single();
    if (profile) {
      setUserName(profile.full_name || user.email || 'Utilizador');
      if (profile.role === 'regional_admin') { 
        setIsAdmin(true);
        carregarUsuariosEResponsaveis(); 
      }
    }

    // Verificar autorização explícita usando maybeSingle() para evitar erro 406
    const { data: auth } = await supabase.from('almoxarifado_responsaveis').select('id').eq('user_id', user.id).maybeSingle();
    if (auth || profile?.role === 'regional_admin') { 
      setIsAuthorized(true);
    }
  };

  const carregarItens = async () => {
    const { data } = await supabase.from('almoxarifado_itens').select('*').order('nome');
    if (data) setItens(data);
  };

  const carregarSolicitacoes = async () => {
    const { data: solData, error: solError } = await supabase
      .from('almoxarifado_solicitacoes')
      .select('*')
      .eq('status', 'pendente')
      .order('created_at', { ascending: false });
    
    if (solError) {
      console.error("Erro ao buscar solicitações:", solError.message);
      return;
    }

    if (solData) {
      const detalhes = await Promise.all(solData.map(async (s) => {
        const { data: itData } = await supabase
          .from('almoxarifado_solicitacao_itens')
          .select('*, item:almoxarifado_itens(nome)')
          .eq('solicitacao_id', s.id);
        
        return { 
          ...s, 
          itens: itData?.map((i: any) => ({
            ...i, 
            item_nome: i.item?.nome || 'Item não encontrado'
          })) || [] 
        };
      }));
      setSolicitacoes(detalhes);
    }
  };

  // Nova função para carregar o histórico
  const carregarHistorico = async () => {
    const { data: solData, error: solError } = await supabase
      .from('almoxarifado_solicitacoes')
      .select('*')
      .neq('status', 'pendente') // Tudo que não for pendente entra no histórico
      .order('created_at', { ascending: false });
    
    if (solError) {
      console.error("Erro ao buscar histórico:", solError.message);
      return;
    }

    if (solData) {
      const detalhes = await Promise.all(solData.map(async (s) => {
        const { data: itData } = await supabase
          .from('almoxarifado_solicitacao_itens')
          .select('*, item:almoxarifado_itens(nome)')
          .eq('solicitacao_id', s.id);
        
        return { 
          ...s, 
          itens: itData?.map((i: any) => ({
            ...i, 
            item_nome: i.item?.nome || 'Item não encontrado'
          })) || [] 
        };
      }));
      setHistorico(detalhes);
    }
  };

  // --- FUNÇÕES DE GESTÃO DO CARRINHO E PEDIDOS ---
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

    // Forçar status 'pendente' na criação
    const { data: solData, error: solError } = await supabase.from('almoxarifado_solicitacoes').insert([{
      user_id: userId, 
      nome_solicitante: userName, 
      nome_evento: evento, 
      quantidade_pessoas: parseInt(qtdPessoas),
      status: 'pendente' 
    }]).select().single();

    if (solError) {
      alert('Erro ao enviar pedido: ' + solError.message);
      return;
    }

    if (solData) {
      const itensInsert = cart.map(c => ({
        solicitacao_id: solData.id,
        item_id: c.item.id,
        quantidade_solicitada: c.quantidade_solicitada,
        quantidade_aprovada: c.quantidade_solicitada 
      }));
      await supabase.from('almoxarifado_solicitacao_itens').insert(itensInsert);
      alert('Solicitação enviada com sucesso!');
      setCart([]); setEvento(''); setQtdPessoas('');
    }
  };

  // --- FUNÇÕES DE GESTÃO DE ITENS (ALMOXARIFE) ---
  const cadastrarNovoItem = async (e: React.FormEvent) => {
    e.preventDefault();
    await supabase.from('almoxarifado_itens').insert([{ nome: novoItemNome, quantidade: parseInt(novoItemQtd) }]);
    setNovoItemNome(''); setNovoItemQtd('');
    carregarItens();
  };

  const excluirItem = async (id: string) => {
    if (!confirm('Excluir este item permanentemente? Pode causar erros em relatórios antigos.')) return;
    await supabase.from('almoxarifado_itens').delete().eq('id', id);
    carregarItens();
  };

  const salvarEdicaoItem = async () => {
    if (!itemEditando) return;
    await supabase.from('almoxarifado_itens')
      .update({ nome: itemEditando.nome, quantidade: itemEditando.quantidade })
      .eq('id', itemEditando.id);
    setItemEditando(null);
    carregarItens();
  };

  // Atualizado para aceitar o status final (aprovada/reprovada)
  const processarSolicitacao = async (solicitacaoId: string, itensAtuais: any[], obs: string, statusFinal: 'aprovada' | 'reprovada') => {
    if (statusFinal === 'aprovada') {
      for (const i of itensAtuais) {
        await supabase.from('almoxarifado_solicitacao_itens').update({ quantidade_aprovada: i.quantidade_aprovada }).eq('id', i.id);
        const { data: itemBanco } = await supabase.from('almoxarifado_itens').select('quantidade').eq('id', i.item_id).single();
        if (itemBanco) await supabase.from('almoxarifado_itens').update({ quantidade: itemBanco.quantidade - i.quantidade_aprovada }).eq('id', i.item_id);
      }
    } else {
      // Se for reprovada, zeramos a quantidade aprovada nos itens
      for (const i of itensAtuais) {
        await supabase.from('almoxarifado_solicitacao_itens').update({ quantidade_aprovada: 0 }).eq('id', i.id);
      }
    }
    
    await supabase.from('almoxarifado_solicitacoes').update({ status: statusFinal, observacao: obs }).eq('id', solicitacaoId);
    carregarSolicitacoes(); 
    carregarItens();
    alert(`Pedido ${statusFinal} com sucesso!`);
  };

  // --- FUNÇÕES DE RELATÓRIO E ADMINISTRAÇÃO ---
  const gerarRelatorioPDF = () => {
    const doc = new jsPDF();
    doc.text("SGE-GSU-II - Relatorio de Inventario (Almoxarifado)", 14, 15);
    doc.setFontSize(10);
    doc.text(`Gerado por: ${userName} em ${new Date().toLocaleString('pt-BR')}`, 14, 22);

    autoTable(doc, {
      startY: 28,
      head: [['Nome do Material', 'Quantidade em Estoque']],
      body: itens.map(i => [i.nome, i.quantidade.toString()]),
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

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* HEADER DA PÁGINA */}
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
          <Package className="h-6 w-6 text-blue-600" /> Almoxarifado
        </h1>
        {isAuthorized && (
          <button onClick={gerarRelatorioPDF} className="bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 text-sm font-medium flex items-center gap-2 transition-colors">
            <FileText size={18} /> Exportar Inventário (PDF)
          </button>
        )}
      </div>

      {/* NAVEGAÇÃO DE ABAS */}
      <div className="flex gap-4 mb-6 border-b pb-2 overflow-x-auto">
        <button onClick={() => setActiveTab('solicitar')} className={`flex items-center gap-2 px-4 py-2 rounded-t-lg font-medium transition-colors ${activeTab === 'solicitar' ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50' : 'text-gray-500 hover:bg-gray-100'}`}>
          <ShoppingCart size={18}/> Solicitar Material
        </button>
        {isAuthorized && (
          <>
            <button onClick={() => setActiveTab('painel')} className={`flex items-center gap-2 px-4 py-2 rounded-t-lg font-medium transition-colors ${activeTab === 'painel' ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50' : 'text-gray-500 hover:bg-gray-100'}`}>
              <Package size={18}/> Painel Almoxarifado
            </button>
            <button onClick={() => setActiveTab('historico')} className={`flex items-center gap-2 px-4 py-2 rounded-t-lg font-medium transition-colors ${activeTab === 'historico' ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50' : 'text-gray-500 hover:bg-gray-100'}`}>
              <History size={18}/> Histórico
            </button>
          </>
        )}
        {isAdmin && (
           <button onClick={() => setActiveTab('admin')} className={`flex items-center gap-2 px-4 py-2 rounded-t-lg font-medium transition-colors ${activeTab === 'admin' ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50' : 'text-gray-500 hover:bg-gray-100'}`}>
           <Settings size={18}/> Gerenciar Acessos
         </button>
        )}
      </div>

      {/* ABA 1: SOLICITANTE */}
      {activeTab === 'solicitar' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="md:col-span-2">
            <h2 className="text-lg font-semibold mb-4 text-gray-700">Materiais Disponíveis</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {itens.filter(i => i.quantidade > 0).map(item => (
                <div key={item.id} className="border p-4 rounded-lg bg-white shadow-sm flex flex-col justify-between hover:shadow-md transition-shadow">
                  <span className="font-medium text-gray-800">{item.nome}</span>
                  <div className="flex gap-2 mt-4">
                    <input type="number" min="1" id={`qtd-${item.id}`} className="border border-gray-300 rounded w-16 px-2 py-1 text-sm outline-none focus:border-blue-500" defaultValue={1} />
                    <button onClick={() => {
                        const input = document.getElementById(`qtd-${item.id}`) as HTMLInputElement;
                        adicionarAoCarrinho(item, parseInt(input.value));
                        input.value = "1";
                      }} className="bg-blue-600 text-white px-3 py-1 rounded text-sm w-full hover:bg-blue-700 transition-colors flex items-center justify-center gap-1">
                      <Plus size={16} /> Adicionar
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
          
          <div className="bg-white p-5 rounded-lg border shadow-sm h-fit sticky top-6">
            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2"><ShoppingCart size={20} className="text-blue-600"/> O Seu Pedido</h2>
            {cart.length === 0 ? <p className="text-gray-500 text-sm italic">Adicione itens ao lado para começar.</p> : (
              <ul className="space-y-3 mb-6 max-h-60 overflow-y-auto pr-2">
                {cart.map(c => (
                  <li key={c.item.id} className="flex justify-between items-center text-sm border-b pb-2">
                    <span className="font-medium text-gray-700">{c.quantidade_solicitada}x {c.item.nome}</span>
                    <button onClick={() => setCart(cart.filter(x => x.item.id !== c.item.id))} className="text-red-500 hover:text-red-700 transition-colors p-1"><Trash2 size={16}/></button>
                  </li>
                ))}
              </ul>
            )}
            <form onSubmit={finalizarSolicitacao} className="space-y-4 pt-4 border-t">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Motivo / Evento</label>
                <input required type="text" value={evento} onChange={e => setEvento(e.target.value)} className="w-full border border-gray-300 rounded px-3 py-2 text-sm outline-none focus:border-blue-500" placeholder="Ex: Formação Setorial" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Nº de Participantes</label>
                <input required type="number" min="1" value={qtdPessoas} onChange={e => setQtdPessoas(e.target.value)} className="w-full border border-gray-300 rounded px-3 py-2 text-sm outline-none focus:border-blue-500" placeholder="Ex: 15" />
              </div>
              <button disabled={cart.length === 0} type="submit" className="w-full bg-green-600 text-white py-2.5 rounded-lg font-medium hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed mt-2 flex justify-center items-center gap-2">
                <Check size={18} /> Confirmar Pedido
              </button>
            </form>
          </div>
        </div>
      )}

      {/* ABA 2: PAINEL DO ALMOXARIFE */}
      {activeTab === 'painel' && isAuthorized && (
        <div className="space-y-8">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            
            <div className="space-y-6">
              <div className="bg-white p-5 rounded-lg border shadow-sm">
                <h2 className="text-lg font-semibold mb-4 text-gray-800">Nova Entrada de Estoque</h2>
                <form onSubmit={cadastrarNovoItem} className="flex gap-4">
                  <input required type="text" value={novoItemNome} onChange={e => setNovoItemNome(e.target.value)} placeholder="Nome do Material" className="border rounded px-3 py-2 flex-1 outline-none focus:border-blue-500" />
                  <input required type="number" min="0" value={novoItemQtd} onChange={e => setNovoItemQtd(e.target.value)} placeholder="Qtd" className="border rounded px-3 py-2 w-24 outline-none focus:border-blue-500" />
                  <button type="submit" className="bg-blue-600 text-white px-5 py-2 rounded hover:bg-blue-700 font-medium transition-colors">Salvar</button>
                </form>
              </div>
              
              <div className="bg-white rounded-lg border shadow-sm overflow-hidden flex flex-col" style={{ maxHeight: '500px' }}>
                <div className="p-5 border-b bg-gray-50 flex justify-between items-center">
                  <h2 className="text-lg font-semibold text-gray-800">Inventário Geral</h2>
                  <span className="text-xs bg-blue-100 text-blue-800 font-bold px-2 py-1 rounded-full">{itens.length} itens</span>
                </div>
                <div className="overflow-y-auto flex-1 p-0">
                  <table className="w-full text-sm text-left">
                    <thead className="bg-white sticky top-0 shadow-sm">
                      <tr>
                        <th className="p-3 border-b text-gray-600 font-semibold">Item</th>
                        <th className="p-3 border-b text-gray-600 font-semibold text-center w-24">Estoque</th>
                        <th className="p-3 border-b text-gray-600 font-semibold text-right w-24">Ações</th>
                      </tr>
                    </thead>
                    <tbody>
                      {itens.map(item => (
                        <tr key={item.id} className="border-b last:border-0 hover:bg-blue-50/50 transition-colors">
                          <td className="p-3 font-medium text-gray-800">{item.nome}</td>
                          <td className="p-3 text-center">
                            <span className={`px-2 py-1 rounded text-xs font-bold ${item.quantidade > 0 ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                              {item.quantidade}
                            </span>
                          </td>
                          <td className="p-3 text-right space-x-1">
                            <button onClick={() => setItemEditando(item)} className="text-blue-600 hover:bg-blue-100 p-1.5 rounded transition-colors" title="Editar item"><Edit2 size={16}/></button>
                            <button onClick={() => excluirItem(item.id)} className="text-red-500 hover:bg-red-100 p-1.5 rounded transition-colors" title="Excluir item"><Trash2 size={16}/></button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-lg border shadow-sm flex flex-col" style={{ maxHeight: '630px' }}>
              <div className="p-5 border-b bg-gray-50 flex justify-between items-center">
                <h2 className="text-lg font-semibold text-gray-800">Pedidos para Deferir</h2>
                {solicitacoes.length > 0 && <span className="animate-pulse bg-yellow-100 text-yellow-800 text-xs font-bold px-2 py-1 rounded-full">{solicitacoes.length} pendentes</span>}
              </div>
              <div className="p-5 overflow-y-auto flex-1">
                {solicitacoes.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full text-gray-400 gap-3 py-10">
                    <Check size={48} className="text-green-300" />
                    <p>Tudo em dia! Nenhum pedido pendente.</p>
                  </div>
                ) : (
                  <div className="space-y-5">
                    {solicitacoes.map(sol => (
                      <div key={sol.id} className="border border-gray-200 p-4 rounded-xl bg-white shadow-sm hover:border-blue-300 transition-colors">
                        <div className="mb-4 pb-3 border-b border-gray-100">
                          <p className="font-bold text-gray-800 text-base">{sol.nome_evento}</p>
                          <div className="flex gap-4 mt-1 text-xs text-gray-500 font-medium">
                            <span>👤 Solicitante: {sol.nome_solicitante}</span>
                            <span>👥 Pessoas: {sol.quantidade_pessoas}</span>
                          </div>
                        </div>
                        <form id={`form-${sol.id}`}>
                          <div className="space-y-2 mb-4">
                            {sol.itens.map(it => (
                              <div key={it.id} className="flex items-center justify-between bg-gray-50 p-2 rounded border border-gray-100">
                                <span className="text-sm font-medium text-gray-700 flex-1">{it.item_nome}</span>
                                <div className="flex items-center gap-2">
                                  <span className="text-xs text-gray-500">Pediu: {it.quantidade_solicitada}</span>
                                  <span className="text-gray-300">|</span>
                                  <span className="text-xs font-bold text-blue-600">Aprovar:</span>
                                  <input type="number" min="0" name={`q-${it.id}`} defaultValue={it.quantidade_solicitada} className="w-16 border border-gray-300 rounded text-center text-sm py-1 outline-none focus:border-blue-500 bg-white" />
                                </div>
                              </div>
                            ))}
                          </div>
                          <input type="text" name="obs" placeholder="Observações (opcional, ex: justificativa)" className="w-full text-sm p-2.5 mb-3 border border-gray-300 rounded outline-none focus:border-blue-500" />
                          <div className="flex gap-2">
                            <button 
                              type="button" 
                              onClick={(e) => {
                                const form = e.currentTarget.closest('form') as HTMLFormElement;
                                const fd = new FormData(form);
                                const itA = sol.itens.map(i => ({...i, quantidade_aprovada: parseInt(fd.get(`q-${i.id}`) as string)}));
                                processarSolicitacao(sol.id, itA, fd.get('obs') as string, 'aprovada');
                              }} 
                              className="flex-1 bg-blue-600 text-white py-2.5 rounded-lg text-sm font-bold hover:bg-blue-700 transition-colors flex items-center justify-center gap-2">
                              <Check size={18} /> Aprovar
                            </button>
                            <button 
                              type="button" 
                              onClick={(e) => {
                                const form = e.currentTarget.closest('form') as HTMLFormElement;
                                const fd = new FormData(form);
                                processarSolicitacao(sol.id, sol.itens, fd.get('obs') as string, 'reprovada');
                              }} 
                              className="flex-1 bg-red-500 text-white py-2.5 rounded-lg text-sm font-bold hover:bg-red-600 transition-colors flex items-center justify-center gap-2">
                              <X size={18} /> Reprovar
                            </button>
                          </div>
                        </form>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ABA 3: HISTÓRICO DE PEDIDOS */}
      {activeTab === 'historico' && isAuthorized && (
        <div className="bg-white rounded-lg border shadow-sm flex flex-col p-6">
          <div className="flex justify-between items-center border-b pb-4 mb-4">
            <h2 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
              <History className="text-blue-600" /> Histórico de Solicitações
            </h2>
            <span className="text-sm text-gray-500">{historico.length} registros</span>
          </div>
          
          {historico.length === 0 ? (
            <p className="text-gray-500 py-8 text-center bg-gray-50 rounded-lg">Nenhum histórico encontrado.</p>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {historico.map(sol => (
                <div key={sol.id} className="border border-gray-200 p-4 rounded-xl bg-gray-50 shadow-sm">
                  <div className="flex justify-between items-start mb-3 border-b border-gray-200 pb-3">
                    <div>
                      <p className="font-bold text-gray-800 text-base">{sol.nome_evento}</p>
                      <p className="text-xs text-gray-600 mt-1">👤 Solicitante: {sol.nome_solicitante}</p>
                      <p className="text-xs text-gray-600">👥 Participantes: {sol.quantidade_pessoas}</p>
                      <p className="text-xs text-gray-400 mt-1">Data: {new Date(sol.created_at).toLocaleDateString('pt-BR')} às {new Date(sol.created_at).toLocaleTimeString('pt-BR')}</p>
                    </div>
                    <span className={`px-3 py-1 rounded-full text-xs font-bold border ${sol.status === 'aprovada' ? 'bg-green-100 text-green-800 border-green-200' : 'bg-red-100 text-red-800 border-red-200'}`}>
                      {sol.status.toUpperCase()}
                    </span>
                  </div>
                  
                  <div className="space-y-1.5 mb-3">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Itens Solicitados</p>
                    {sol.itens.map(it => (
                      <div key={it.id} className="flex justify-between text-sm text-gray-700 bg-white p-2 rounded border border-gray-100">
                        <span className="font-medium">{it.item_nome}</span>
                        <span className="text-xs">
                          {sol.status === 'aprovada' ? (
                            <>Pediu: <b>{it.quantidade_solicitada}</b> | Aprovou: <b className="text-blue-600">{it.quantidade_aprovada}</b></>
                          ) : (
                            <>Pediu: <b>{it.quantidade_solicitada}</b></>
                          )}
                        </span>
                      </div>
                    ))}
                  </div>
                  
                  {sol.observacao && (
                    <div className="mt-3 p-3 text-sm text-gray-700 italic bg-white rounded border border-yellow-100 border-l-4 border-l-yellow-400">
                      <strong>Obs:</strong> {sol.observacao}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ABA 4: ADMINISTRAÇÃO DE ACESSOS */}
      {activeTab === 'admin' && isAdmin && (
        <div className="bg-white p-5 rounded-lg border shadow-sm">
          <h2 className="text-lg font-semibold mb-6 flex items-center gap-2 border-b pb-3"><Settings className="text-gray-500" /> Gestão de Acessos ao Almoxarifado</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left border-collapse">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="p-3 text-gray-600 font-semibold">Nome do Colaborador</th>
                  <th className="p-3 text-gray-600 font-semibold text-center">Permissão Atual</th>
                  <th className="p-3 text-gray-600 font-semibold text-center w-40">Ações de Acesso</th>
                </tr>
              </thead>
              <tbody>
                {todosUsuarios.map(u => {
                  const isResp = responsaveis.includes(u.id);
                  const isAuto = u.role === 'regional_admin';
                  return (
                    <tr key={u.id} className="border-b last:border-0 hover:bg-gray-50 transition-colors">
                      <td className="p-3 font-medium text-gray-800 flex flex-col">
                        <span>{u.full_name}</span>
                        <span className="text-xs text-gray-400 font-normal">{u.role}</span>
                      </td>
                      <td className="p-3 text-center">
                        {isAuto ? (
                          <span className="bg-blue-100 text-blue-800 text-xs font-bold px-3 py-1 rounded-full">Admin (Acesso Total)</span>
                        ) : isResp ? (
                          <span className="bg-green-100 text-green-800 text-xs font-bold px-3 py-1 rounded-full">Almoxarife Autorizado</span>
                        ) : (
                          <span className="bg-gray-100 text-gray-500 text-xs font-bold px-3 py-1 rounded-full">Sem Acesso</span>
                        )}
                      </td>
                      <td className="p-3 text-center">
                        {isAuto ? (
                          <span className="text-xs text-gray-400 italic">Inamovível</span>
                        ) : (
                          <button onClick={() => toggleResponsavel(u.id, isResp)} className={`w-full py-1.5 rounded text-xs font-bold transition-colors ${isResp ? 'bg-white border border-red-200 text-red-600 hover:bg-red-50' : 'bg-white border border-green-200 text-green-600 hover:bg-green-50'}`}>
                            {isResp ? 'Revogar Acesso' : 'Autorizar Acesso'}
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* MODAL DE EDIÇÃO DE ITEM */}
      {itemEditando && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-bold text-gray-800 flex items-center gap-2">
                <Edit2 className="text-blue-600" size={20} /> Editar Detalhes do Item
              </h3>
              <button onClick={() => setItemEditando(null)} className="text-gray-400 hover:text-gray-800 transition-colors"><X size={24} /></button>
            </div>
            <div className="space-y-5">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Nome do Material</label>
                <input type="text" value={itemEditando.nome} onChange={e => setItemEditando({...itemEditando, nome: e.target.value})} className="w-full border border-gray-300 rounded-lg px-4 py-2.5 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-all" />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Quantidade em Estoque</label>
                <input type="number" min="0" value={itemEditando.quantidade} onChange={e => setItemEditando({...itemEditando, quantidade: parseInt(e.target.value)})} className="w-full border border-gray-300 rounded-lg px-4 py-2.5 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-all" />
              </div>
              <div className="flex gap-3 pt-4 border-t mt-6">
                <button onClick={() => setItemEditando(null)} className="flex-1 px-4 py-2.5 border border-gray-300 rounded-lg text-gray-700 font-medium hover:bg-gray-50 transition-colors">Cancelar</button>
                <button onClick={salvarEdicaoItem} className="flex-1 px-4 py-2.5 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors flex items-center justify-center gap-2">
                  <Save size={18} /> Salvar Alterações
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
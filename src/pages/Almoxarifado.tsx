import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { 
  ShoppingCart, Package, Settings, Plus, Trash2, 
  Edit2, FileText, X, Save 
} from 'lucide-react';
// Importações para o PDF
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
  const [activeTab, setActiveTab] = useState<'solicitar' | 'painel' | 'admin'>('solicitar');
  const [userId, setUserId] = useState('');
  const [userName, setUserName] = useState('');

  // Estados Comuns
  const [itens, setItens] = useState<Item[]>([]);
  
  // Estados: Edição de Item
  const [itemEditando, setItemEditando] = useState<Item | null>(null);

  // Estados: Solicitante (Carrinho)
  const [cart, setCart] = useState<CartItem[]>([]);
  const [evento, setEvento] = useState('');
  const [qtdPessoas, setQtdPessoas] = useState('');

  // Estados: Almoxarife
  const [novoItemNome, setNovoItemNome] = useState('');
  const [novoItemQtd, setNovoItemQtd] = useState('');
  const [solicitacoes, setSolicitacoes] = useState<SolicitacaoDetalhe[]>([]);

  // Estados: Admin
  const [todosUsuarios, setTodosUsuarios] = useState<any[]>([]);
  const [responsaveis, setResponsaveis] = useState<string[]>([]);

  useEffect(() => {
    carregarUsuarioEPermissoes();
    carregarItens();
  }, []);

  const carregarUsuarioEPermissoes = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    setUserId(user.id);

    const { data: profile } = await supabase.from('profiles').select('full_name, role').eq('id', user.id).single();
    if (profile) {
      setUserName(profile.full_name || user.email);
      if (profile.role === 'regional_admin') { 
        setIsAdmin(true);
        carregarUsuariosEResponsaveis(); 
      }
    }

    const { data: auth } = await supabase.from('almoxarifado_responsaveis').select('id').eq('user_id', user.id).maybeSingle();
    if (auth || profile?.role === 'regional_admin') { 
      setIsAuthorized(true);
      carregarSolicitacoes();
    }
  };

  const carregarItens = async () => {
    const { data } = await supabase.from('almoxarifado_itens').select('*').order('nome');
    if (data) setItens(data);
  };

  // --- FUNÇÕES DE GESTÃO DE ITENS (EDITAR/EXCLUIR) ---
  const excluirItem = async (id: string) => {
    if (!confirm('Tem certeza que deseja excluir este item permanentemente?')) return;
    const { error } = await supabase.from('almoxarifado_itens').delete().eq('id', id);
    if (error) alert('Erro ao excluir: item pode estar vinculado a solicitações.');
    else carregarItens();
  };

  const salvarEdicaoItem = async () => {
    if (!itemEditando) return;
    await supabase.from('almoxarifado_itens')
      .update({ nome: itemEditando.nome, quantidade: itemEditando.quantidade })
      .eq('id', itemEditando.id);
    setItemEditando(null);
    carregarItens();
  };

  // --- FUNÇÃO GERAR PDF ---
  const gerarRelatorioPDF = () => {
    const doc = new jsPDF();
    const dataHora = new Date().toLocaleString('pt-BR');
    
    doc.text("SGE-GSU-II - Relatório de Estoque", 14, 15);
    doc.setFontSize(10);
    doc.text(`Gerado por: ${userName} em ${dataHora}`, 14, 22);

    autoTable(doc, {
      startY: 30,
      head: [['Item', 'Quantidade em Estoque']],
      body: itens.map(i => [i.nome, i.quantidade]),
      headStyles: { fillColor: [37, 99, 235] }, // Azul padrão do sistema
    });

    doc.save(`estoque_almoxarifado_${new Date().toISOString().split('T')[0]}.pdf`);
  };

  // --- FUNÇÕES DO ADMIN ---
  const carregarUsuariosEResponsaveis = async () => {
    const { data: usersData } = await supabase.from('profiles').select('id, full_name, email, role');
    if (usersData) setTodosUsuarios(usersData);
    const { data: respData } = await supabase.from('almoxarifado_responsaveis').select('user_id');
    if (respData) setResponsaveis(respData.map(r => r.user_id));
  };

  const toggleResponsavel = async (userIdTarget: string, isCurrentlyResp: boolean) => {
    if (isCurrentlyResp) {
      const adminsCount = todosUsuarios.filter(u => u.role === 'regional_admin').length;
      if (adminsCount + responsaveis.length <= 3) {
        alert('Segurança: Mínimo de 3 usuários autorizados necessário.');
        return;
      }
      await supabase.from('almoxarifado_responsaveis').delete().eq('user_id', userIdTarget);
      setResponsaveis(prev => prev.filter(id => id !== userIdTarget));
    } else {
      await supabase.from('almoxarifado_responsaveis').insert([{ user_id: userIdTarget }]);
      setResponsaveis(prev => [...prev, userIdTarget]);
    }
  };

  // --- FUNÇÕES DO SOLICITANTE ---
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
    const { data: solData } = await supabase.from('almoxarifado_solicitacoes').insert([{
      user_id: userId, nome_solicitante: userName, nome_evento: evento, quantidade_pessoas: parseInt(qtdPessoas)
    }]).select().single();

    if (solData) {
      const itensInsert = cart.map(c => ({
        solicitacao_id: solData.id,
        item_id: c.item.id,
        quantidade_solicitada: c.quantidade_solicitada,
        quantidade_aprovada: c.quantidade_solicitada 
      }));
      await supabase.from('almoxarifado_solicitacao_itens').insert(itensInsert);
      alert('Solicitação enviada!');
      setCart([]); setEvento(''); setQtdPessoas('');
    }
  };

  // --- FUNÇÕES DO ALMOXARIFE ---
  const cadastrarNovoItem = async (e: React.FormEvent) => {
    e.preventDefault();
    await supabase.from('almoxarifado_itens').insert([{ nome: novoItemNome, quantidade: parseInt(novoItemQtd) }]);
    setNovoItemNome(''); setNovoItemQtd('');
    carregarItens();
  };

  const carregarSolicitacoes = async () => {
    const { data: solData } = await supabase.from('almoxarifado_solicitacoes').select('*').eq('status', 'pendente').order('created_at', { ascending: false });
    if (solData) {
      const detalhes = await Promise.all(solData.map(async (s) => {
        const { data: itData } = await supabase.from('almoxarifado_solicitacao_itens').select('*, item:almoxarifado_itens(nome)').eq('solicitacao_id', s.id);
        return { ...s, itens: itData?.map((i: any) => ({...i, item_nome: i.item.nome})) || [] };
      }));
      setSolicitacoes(detalhes);
    }
  };

  const processarSolicitacao = async (solicitacaoId: string, itensAtuais: any[], obs: string) => {
    for (const i of itensAtuais) {
      await supabase.from('almoxarifado_solicitacao_itens').update({ quantidade_aprovada: i.quantidade_aprovada }).eq('id', i.id);
      const { data: itemBanco } = await supabase.from('almoxarifado_itens').select('quantidade').eq('id', i.item_id).single();
      if (itemBanco) await supabase.from('almoxarifado_itens').update({ quantidade: itemBanco.quantidade - i.quantidade_aprovada }).eq('id', i.item_id);
    }
    await supabase.from('almoxarifado_solicitacoes').update({ status: 'aprovada', observacao: obs }).eq('id', solicitacaoId);
    carregarSolicitacoes(); carregarItens();
  };

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
          <Package className="h-6 w-6 text-blue-600" /> Almoxarifado
        </h1>
        {isAuthorized && (
          <button 
            onClick={gerarRelatorioPDF}
            className="flex items-center gap-2 bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 transition-colors text-sm font-medium"
          >
            <FileText size={18} /> Exportar Inventário (PDF)
          </button>
        )}
      </div>

      <div className="flex gap-4 mb-6 border-b pb-2">
        <button onClick={() => setActiveTab('solicitar')} className={`flex items-center gap-2 font-medium px-4 py-2 rounded-t-lg ${activeTab === 'solicitar' ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50' : 'text-gray-500 hover:bg-gray-100'}`}>
          <ShoppingCart size={18}/> Solicitar Material
        </button>
        {isAuthorized && (
          <button onClick={() => setActiveTab('painel')} className={`flex items-center gap-2 font-medium px-4 py-2 rounded-t-lg ${activeTab === 'painel' ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50' : 'text-gray-500 hover:bg-gray-100'}`}>
            <Package size={18}/> Painel Almoxarifado
          </button>
        )}
        {isAdmin && (
           <button onClick={() => setActiveTab('admin')} className={`flex items-center gap-2 font-medium px-4 py-2 rounded-t-lg ${activeTab === 'admin' ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50' : 'text-gray-500 hover:bg-gray-100'}`}>
           <Settings size={18}/> Gerenciar Acessos
         </button>
        )}
      </div>

      {/* ABA: SOLICITANTE */}
      {activeTab === 'solicitar' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="md:col-span-2">
            <h2 className="text-lg font-semibold mb-4 text-gray-700">Materiais Disponíveis</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {itens.filter(i => i.quantidade > 0).map(item => (
                <div key={item.id} className="border p-4 rounded-lg bg-white shadow-sm flex flex-col justify-between">
                  <span className="font-medium text-gray-800">{item.nome}</span>
                  <span className="text-sm text-green-600 mb-3 italic">Disponível em estoque</span>
                  <div className="flex gap-2">
                    <input type="number" min="1" id={`qtd-${item.id}`} className="border rounded w-16 px-2 py-1 text-sm" defaultValue={1} />
                    <button onClick={() => {
                        const input = document.getElementById(`qtd-${item.id}`) as HTMLInputElement;
                        adicionarAoCarrinho(item, parseInt(input.value));
                        input.value = "1";
                      }} className="bg-blue-600 text-white px-3 py-1 rounded text-sm hover:bg-blue-700 w-full flex items-center justify-center gap-1">
                      <Plus size={14} /> Adicionar
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="bg-white p-5 rounded-lg border shadow-sm h-fit">
            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2"><ShoppingCart size={20}/> Carrinho</h2>
            {cart.length === 0 ? <p className="text-gray-500 text-sm">Seu carrinho está vazio.</p> : (
              <ul className="space-y-3 mb-6">
                {cart.map(c => (
                  <li key={c.item.id} className="flex justify-between items-center text-sm border-b pb-2">
                    <span>{c.quantidade_solicitada}x {c.item.nome}</span>
                    <button onClick={() => setCart(cart.filter(x => x.item.id !== c.item.id))} className="text-red-500 hover:text-red-700"><Trash2 size={16}/></button>
                  </li>
                ))}
              </ul>
            )}
            <form onSubmit={finalizarSolicitacao} className="space-y-4 border-t pt-4">
              <input required type="text" value={evento} onChange={e => setEvento(e.target.value)} className="w-full border rounded px-3 py-2 text-sm" placeholder="Nome do Evento" />
              <input required type="number" value={qtdPessoas} onChange={e => setQtdPessoas(e.target.value)} className="w-full border rounded px-3 py-2 text-sm" placeholder="Qtd de Pessoas" />
              <button disabled={cart.length === 0} type="submit" className="w-full bg-green-600 text-white py-2 rounded-lg font-medium hover:bg-green-700 disabled:opacity-50 transition-colors">Enviar Solicitação</button>
            </form>
          </div>
        </div>
      )}

      {/* ABA: PAINEL ALMOXARIFE */}
      {activeTab === 'painel' && isAuthorized && (
        <div className="space-y-8">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Cadastro e Tabela de Gestão */}
            <div className="space-y-6">
              <div className="bg-white p-5 rounded-lg border shadow-sm">
                <h2 className="text-lg font-semibold mb-4">Novo Item / Entrada de Estoque</h2>
                <form onSubmit={cadastrarNovoItem} className="flex gap-4">
                  <input required type="text" value={novoItemNome} onChange={e => setNovoItemNome(e.target.value)} placeholder="Nome" className="border rounded px-3 py-2 flex-1" />
                  <input required type="number" value={novoItemQtd} onChange={e => setNovoItemQtd(e.target.value)} placeholder="Qtd" className="border rounded px-3 py-2 w-24" />
                  <button type="submit" className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700">Adicionar</button>
                </form>
              </div>

              <div className="bg-white p-5 rounded-lg border shadow-sm">
                <h2 className="text-lg font-semibold mb-4">Gestão de Inventário (Estoque Real)</h2>
                <div className="max-h-96 overflow-y-auto">
                  <table className="w-full text-sm text-left">
                    <thead className="bg-gray-50 sticky top-0">
                      <tr>
                        <th className="p-2 border-b">Item</th>
                        <th className="p-2 border-b">Qtd Atual</th>
                        <th className="p-2 border-b text-right">Ações</th>
                      </tr>
                    </thead>
                    <tbody>
                      {itens.map(item => (
                        <tr key={item.id} className="hover:bg-gray-50">
                          <td className="p-2 border-b font-medium">{item.nome}</td>
                          <td className="p-2 border-b">{item.quantidade}</td>
                          <td className="p-2 border-b text-right space-x-2">
                            <button onClick={() => setItemEditando(item)} className="text-blue-600 hover:bg-blue-50 p-1 rounded"><Edit2 size={16}/></button>
                            <button onClick={() => excluirItem(item.id)} className="text-red-600 hover:bg-red-50 p-1 rounded"><Trash2 size={16}/></button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            {/* Solicitações Pendentes */}
            <div className="bg-white p-5 rounded-lg border shadow-sm">
              <h2 className="text-xl font-bold mb-4">Pedidos para Deferir</h2>
              {solicitacoes.length === 0 ? <p className="text-gray-500">Tudo em dia!</p> : (
                <div className="space-y-4">
                  {solicitacoes.map(sol => (
                    <div key={sol.id} className="border p-4 rounded-lg bg-gray-50">
                      <div className="flex justify-between mb-3">
                        <div>
                          <p className="font-bold">{sol.nome_evento}</p>
                          <p className="text-xs text-gray-500">Por: {sol.nome_solicitante}</p>
                        </div>
                      </div>
                      <form onSubmit={(e) => {
                        e.preventDefault();
                        const fd = new FormData(e.currentTarget);
                        const iat = sol.itens.map(i => ({...i, quantidade_aprovada: parseInt(fd.get(`q-${i.id}`) as string)}));
                        processarSolicitacao(sol.id, iat, fd.get('obs') as string);
                      }}>
                        {sol.itens.map(it => (
                          <div key={it.id} className="flex items-center gap-4 text-sm mb-2 border-b pb-1">
                            <span className="flex-1">{it.item_nome} (Pediu: {it.quantidade_solicitada})</span>
                            <input type="number" name={`q-${it.id}`} defaultValue={it.quantidade_solicitada} className="w-16 border rounded px-1" />
                          </div>
                        ))}
                        <input name="obs" placeholder="Obs (opcional)" className="w-full text-xs p-2 mb-2 border rounded" />
                        <button type="submit" className="w-full bg-green-600 text-white py-1 rounded text-sm hover:bg-green-700">Deferir / Retificar</button>
                      </form>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ABA: ADMINISTRAÇÃO */}
      {activeTab === 'admin' && isAdmin && (
        <div className="bg-white p-5 rounded-lg border shadow-sm">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2"><Settings className="text-gray-500" /> Controle de Acessos</h2>
          <table className="w-full text-sm text-left">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="p-3">Nome</th>
                <th className="p-3">Setor/Papel</th>
                <th className="p-3 text-center">Autorizado?</th>
              </tr>
            </thead>
            <tbody>
              {todosUsuarios.map(u => {
                const isResp = responsaveis.includes(u.id);
                const isAuto = u.role === 'regional_admin';
                return (
                  <tr key={u.id} className="border-b hover:bg-gray-50">
                    <td className="p-3">{u.full_name}</td>
                    <td className="p-3 text-xs">{u.role}</td>
                    <td className="p-3 text-center">
                      {isAuto ? <span className="text-blue-600 font-bold italic text-xs">Acesso Admin</span> : (
                        <button onClick={() => toggleResponsavel(u.id, isResp)} className={`px-3 py-1 rounded text-xs font-medium ${isResp ? 'bg-green-100 text-green-700 border border-green-200' : 'bg-white border border-gray-300'}`}>
                          {isResp ? 'Sim (Revogar)' : 'Não (Autorizar)'}
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* MODAL DE EDIÇÃO DE ITEM */}
      {itemEditando && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl p-6 w-full max-w-md shadow-2xl">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-bold text-gray-800">Editar Item</h3>
              <button onClick={() => setItemEditando(null)} className="text-gray-400 hover:text-gray-600"><X size={24} /></button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nome do Material</label>
                <input type="text" value={itemEditando.nome} onChange={e => setItemEditando({...itemEditando, nome: e.target.value})} className="w-full border border-gray-300 rounded-lg px-3 py-2" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Quantidade em Estoque</label>
                <input type="number" value={itemEditando.quantidade} onChange={e => setItemEditando({...itemEditando, quantidade: parseInt(e.target.value)})} className="w-full border border-gray-300 rounded-lg px-3 py-2" />
              </div>
              <div className="flex gap-3 pt-4">
                <button onClick={() => setItemEditando(null)} className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50">Cancelar</button>
                <button onClick={salvarEdicaoItem} className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center justify-center gap-2">
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
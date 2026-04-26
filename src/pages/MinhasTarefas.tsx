import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { 
  Plus, 
  LayoutDashboard, 
  Copy, 
  School, 
  CheckCircle2, 
  ArrowRight,
  Pencil,
  Trash2
} from 'lucide-react';
import NovaTarefaModal from '../components/NovaTarefaModal';
import EstatisticasTarefas from '../components/EstatisticasTarefas';

interface Tag {
  id: string;
  nome: string;
  cor: string;
}

interface Tarefa {
  id: string;
  titulo: string;
  descricao: string;
  status: 'pendente' | 'em_andamento' | 'concluido';
  prioridade: 'baixa' | 'media' | 'alta';
  data_vencimento: string;
  escola?: string;
  tag_id?: string;
  tags_pessoais?: Tag; 
}

export default function MinhasTarefas() {
  const [tarefas, setTarefas] = useState<Tarefa[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [tarefaEditando, setTarefaEditando] = useState<Tarefa | null>(null);
  const [filtroTempo, setFiltroTempo] = useState<'hoje' | 'semana' | 'todas'>('hoje');

  useEffect(() => {
    carregarTarefas();
  }, []);

  const carregarTarefas = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('tarefas_pessoais')
        .select('*, tags_pessoais(id, nome, cor)')
        .order('data_vencimento', { ascending: true });

      if (error) throw error;
      if (data) setTarefas(data as unknown as Tarefa[]);
    } catch (error) {
      console.error('Erro ao carregar demandas:', error);
    } finally {
      setLoading(false);
    }
  };

  const atualizarStatus = async (id: string, novoStatus: 'pendente' | 'em_andamento' | 'concluido') => {
    try {
      const dadosUpdate: any = { status: novoStatus };
      if (novoStatus === 'concluido') dadosUpdate.data_conclusao = new Date().toISOString();

      const { error } = await supabase.from('tarefas_pessoais').update(dadosUpdate).eq('id', id);
      if (error) throw error;
      carregarTarefas();
    } catch (error) {
      console.error('Erro ao atualizar status:', error);
    }
  };

  // NOVO: Alterna a prioridade rapidamente com 1 clique (Baixa -> Média -> Alta)
  const alternarPrioridade = async (id: string, prioridadeAtual: string) => {
    const proximaPrioridade = 
      prioridadeAtual === 'baixa' ? 'media' :
      prioridadeAtual === 'media' ? 'alta' : 'baixa';
    
    try {
      const { error } = await supabase.from('tarefas_pessoais').update({ prioridade: proximaPrioridade }).eq('id', id);
      if (error) throw error;
      carregarTarefas();
    } catch (error) {
      console.error('Erro ao mudar prioridade:', error);
    }
  };

  // NOVO: Excluir Tarefa
  const excluirTarefa = async (id: string) => {
    if (!window.confirm('Tem certeza que deseja excluir esta demanda definitivamente?')) return;
    try {
      const { error } = await supabase.from('tarefas_pessoais').delete().eq('id', id);
      if (error) throw error;
      carregarTarefas();
    } catch (error) {
      console.error('Erro ao excluir:', error);
      alert('Erro ao excluir a demanda.');
    }
  };

  const duplicarTarefa = async (tarefa: Tarefa) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { error } = await supabase.from('tarefas_pessoais').insert([{
        titulo: `${tarefa.titulo} (Cópia)`,
        descricao: tarefa.descricao,
        prioridade: tarefa.prioridade,
        escola: tarefa.escola,
        tag_id: tarefa.tag_id,
        usuario_id: user.id,
        status: 'pendente',
        data_vencimento: new Date().toISOString().split('T')[0]
      }]);

      if (error) throw error;
      carregarTarefas();
    } catch (error) {
      console.error('Erro ao duplicar:', error);
    }
  };

  const abrirModalCriar = () => {
    setTarefaEditando(null);
    setIsModalOpen(true);
  };

  const abrirModalEditar = (t: Tarefa) => {
    setTarefaEditando(t);
    setIsModalOpen(true);
  };

  const tarefasFiltradas = tarefas.filter(tarefa => {
    if (filtroTempo === 'todas') return true;
    if (!tarefa.data_vencimento) return false;
    const hoje = new Date().toISOString().split('T')[0];
    const dataLimite = new Date();
    dataLimite.setDate(dataLimite.getDate() + 7);
    const semanaStr = dataLimite.toISOString().split('T')[0];

    if (filtroTempo === 'hoje') return tarefa.data_vencimento <= hoje && tarefa.status !== 'concluido';
    if (filtroTempo === 'semana') return tarefa.data_vencimento <= semanaStr;
    return true;
  });

  const pendentes = tarefasFiltradas.filter(t => t.status === 'pendente');
  const emAndamento = tarefasFiltradas.filter(t => t.status === 'em_andamento');
  const concluidas = tarefasFiltradas.filter(t => t.status === 'concluido');

  // Função para renderizar os cartões (evita repetição de código)
  const renderCard = (t: Tarefa, coluna: 'pendente' | 'em_andamento' | 'concluido') => (
    <div key={t.id} className={`bg-white p-4 rounded-xl shadow-sm border-l-4 group relative hover:shadow-md transition duration-200 ${
      coluna === 'pendente' ? 'border-l-gray-300' : coluna === 'em_andamento' ? 'border-l-blue-500' : 'border-l-green-100 opacity-70 hover:opacity-100'
    }`}>
      {/* Botões de Ação no Topo (Aparecem no Hover) */}
      <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 flex gap-1 transition-opacity bg-white p-1 rounded-md shadow-sm border border-gray-100">
        <button onClick={() => abrirModalEditar(t)} title="Editar" className="p-1 hover:bg-blue-50 text-gray-400 hover:text-blue-600 rounded">
          <Pencil size={14} />
        </button>
        <button onClick={() => duplicarTarefa(t)} title="Duplicar" className="p-1 hover:bg-gray-100 text-gray-400 rounded">
          <Copy size={14} />
        </button>
        <button onClick={() => excluirTarefa(t.id)} title="Excluir" className="p-1 hover:bg-red-50 text-gray-400 hover:text-red-500 rounded">
          <Trash2 size={14} />
        </button>
      </div>

      {t.escola && (
        <div className="flex items-center gap-1 text-[10px] text-gray-400 font-black uppercase mb-1 pr-16">
          <School size={10} /> {t.escola}
        </div>
      )}
      
      <h3 className={`font-bold text-sm leading-snug pr-16 ${coluna === 'concluido' ? 'text-gray-400 line-through' : 'text-gray-800'}`}>
        {t.titulo}
      </h3>

      <div className="mt-3 flex flex-wrap gap-2 items-center">
        {t.tags_pessoais && (
          <span className="text-[9px] px-2 py-0.5 rounded-full text-white font-bold" style={{ backgroundColor: t.tags_pessoais.cor }}>
            {t.tags_pessoais.nome}
          </span>
        )}
        
        {/* A Etiqueta de Prioridade agora é um Botão Clicável */}
        <button 
          onClick={() => alternarPrioridade(t.id, t.prioridade)}
          title="Clique para mudar a prioridade"
          className={`text-[9px] px-2 py-0.5 rounded-full font-bold uppercase transition hover:opacity-80 active:scale-95 ${
          t.prioridade === 'alta' ? 'bg-red-100 text-red-600' : 
          t.prioridade === 'media' ? 'bg-amber-100 text-amber-600' : 'bg-gray-100 text-gray-500'
        }`}>
          {t.prioridade}
        </button>
      </div>

      <div className="mt-4 flex gap-3 justify-end items-center">
        {coluna === 'pendente' && (
          <button onClick={() => atualizarStatus(t.id, 'em_andamento')} className="text-xs text-blue-600 font-black hover:underline flex items-center gap-1">
            INICIAR <ArrowRight size={12} />
          </button>
        )}
        {coluna === 'em_andamento' && (
          <>
            <button onClick={() => atualizarStatus(t.id, 'pendente')} className="text-[11px] font-bold text-gray-400 hover:text-gray-600 transition">Pausar</button>
            <button onClick={() => atualizarStatus(t.id, 'concluido')} className="bg-green-600 text-white px-3 py-1.5 rounded-lg text-[11px] font-black shadow-md shadow-green-100 hover:bg-green-700 flex items-center gap-1">
              CONCLUIR <CheckCircle2 size={12} />
            </button>
          </>
        )}
        {coluna === 'concluido' && (
          <button onClick={() => atualizarStatus(t.id, 'em_andamento')} className="text-[10px] text-gray-400 font-bold hover:text-blue-500 transition">
            REABRIR
          </button>
        )}
      </div>
    </div>
  );

  return (
    <div className="p-6 max-w-7xl mx-auto min-h-screen bg-gray-50/30">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
            <LayoutDashboard className="text-blue-600" size={28} /> Assistente de Trabalho
          </h1>
          <p className="text-gray-500 text-sm mt-1">Gerencie suas demandas de Trabalho.</p>
          
          <div className="flex bg-gray-200/50 p-1 rounded-xl w-fit mt-4">
            {(['hoje', 'semana', 'todas'] as const).map((tipo) => (
              <button key={tipo} onClick={() => setFiltroTempo(tipo)}
                className={`px-5 py-1.5 rounded-lg text-sm font-semibold transition capitalize ${
                  filtroTempo === tipo ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                }`}>
                {tipo === 'semana' ? 'Próximos 7 dias' : tipo}
              </button>
            ))}
          </div>
        </div>

        <button onClick={abrirModalCriar}
          className="bg-blue-600 text-white px-6 py-3 rounded-xl hover:bg-blue-700 transition flex items-center gap-2 shadow-lg shadow-blue-200 font-bold">
          <Plus size={20} /> Nova Demanda
        </button>
      </div>

      {loading ? (
        <div className="flex flex-col justify-center items-center h-64 gap-3">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600"></div>
          <p className="text-gray-400 text-sm font-medium">Sincronizando com o SGE...</p>
        </div>
      ) : (
        <>
          <EstatisticasTarefas tarefas={tarefasFiltradas} />

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-gray-100/40 p-4 rounded-2xl border border-gray-200">
              <h2 className="font-bold text-gray-500 mb-4 flex items-center justify-between uppercase text-[11px] tracking-[0.1em]">
                Pendente <span>{pendentes.length}</span>
              </h2>
              <div className="space-y-4">{pendentes.map(t => renderCard(t, 'pendente'))}</div>
            </div>

            <div className="bg-blue-50/50 p-4 rounded-2xl border border-blue-100">
              <h2 className="font-bold text-blue-700 mb-4 flex items-center justify-between uppercase text-[11px] tracking-[0.1em]">
                Em Execução <span>{emAndamento.length}</span>
              </h2>
              <div className="space-y-4">{emAndamento.map(t => renderCard(t, 'em_andamento'))}</div>
            </div>

            <div className="bg-green-50/50 p-4 rounded-2xl border border-green-100">
              <h2 className="font-bold text-green-700 mb-4 flex items-center justify-between uppercase text-[11px] tracking-[0.1em]">
                Finalizado <span>{concluidas.length}</span>
              </h2>
              <div className="space-y-4">{concluidas.map(t => renderCard(t, 'concluido'))}</div>
            </div>
          </div>
        </>
      )}

      <NovaTarefaModal 
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)} 
        onSuccess={carregarTarefas}
        tarefaEditando={tarefaEditando} 
      />
    </div>
  );
}
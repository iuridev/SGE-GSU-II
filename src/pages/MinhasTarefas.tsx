import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { 
  Plus, 
  LayoutDashboard, 
  Copy, 
  School, 
  CheckCircle2, 
  ArrowRight
} from 'lucide-react';
import NovaTarefaModal from '../components/NovaTarefaModal';
import EstatisticasTarefas from '../components/EstatisticasTarefas';

// Interfaces para tipagem do TypeScript
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
  tags_pessoais?: Tag; // Relacionamento vindo do Supabase
}

export default function MinhasTarefas() {
  const [tarefas, setTarefas] = useState<Tarefa[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [filtroTempo, setFiltroTempo] = useState<'hoje' | 'semana' | 'todas'>('hoje');

  useEffect(() => {
    carregarTarefas();
  }, []);

  // Busca as tarefas trazendo junto os dados da tabela de tags (JOIN)
  const carregarTarefas = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('tarefas_pessoais')
        .select(`
          *,
          tags_pessoais (
            id,
            nome,
            cor
          )
        `)
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
      if (novoStatus === 'concluido') {
        dadosUpdate.data_conclusao = new Date().toISOString();
      }

      const { error } = await supabase
        .from('tarefas_pessoais')
        .update(dadosUpdate)
        .eq('id', id);

      if (error) throw error;
      carregarTarefas();
    } catch (error) {
      console.error('Erro ao atualizar status:', error);
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
      alert('Erro ao duplicar a demanda.');
    }
  };

  // Lógica de filtragem baseada no estado filtroTempo
  const tarefasFiltradas = tarefas.filter(tarefa => {
    if (filtroTempo === 'todas') return true;
    if (!tarefa.data_vencimento) return false;

    const hoje = new Date().toISOString().split('T')[0];
    const dataLimite = new Date();
    dataLimite.setDate(dataLimite.getDate() + 7);
    const semanaStr = dataLimite.toISOString().split('T')[0];

    if (filtroTempo === 'hoje') {
      // Mostra o que vence hoje ou o que está atrasado e não concluído
      return tarefa.data_vencimento <= hoje && tarefa.status !== 'concluido';
    }
    if (filtroTempo === 'semana') {
      return tarefa.data_vencimento <= semanaStr;
    }
    return true;
  });

  // Separação por colunas
  const pendentes = tarefasFiltradas.filter(t => t.status === 'pendente');
  const emAndamento = tarefasFiltradas.filter(t => t.status === 'em_andamento');
  const concluidas = tarefasFiltradas.filter(t => t.status === 'concluido');

  return (
    <div className="p-6 max-w-7xl mx-auto min-h-screen bg-gray-50/30">
      {/* Cabeçalho */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
            <LayoutDashboard className="text-blue-600" size={28} /> Assistente de Trabalho
          </h1>
          <p className="text-gray-500 text-sm mt-1">Gerencie suas demandas de Trabalho.</p>
          
          <div className="flex bg-gray-200/50 p-1 rounded-xl w-fit mt-4">
            {(['hoje', 'semana', 'todas'] as const).map((tipo) => (
              <button
                key={tipo}
                onClick={() => setFiltroTempo(tipo)}
                className={`px-5 py-1.5 rounded-lg text-sm font-semibold transition capitalize ${
                  filtroTempo === tipo ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {tipo === 'semana' ? 'Próximos 7 dias' : tipo}
              </button>
            ))}
          </div>
        </div>

        <button 
          onClick={() => setIsModalOpen(true)}
          className="bg-blue-600 text-white px-6 py-3 rounded-xl hover:bg-blue-700 transition flex items-center gap-2 shadow-lg shadow-blue-200 font-bold"
        >
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
          {/* Painel de Estatísticas Visual */}
          <EstatisticasTarefas tarefas={tarefasFiltradas} />

          {/* Quadro Kanban */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            
            {/* Coluna: A Fazer */}
            <div className="bg-gray-100/40 p-4 rounded-2xl border border-gray-200">
              <h2 className="font-bold text-gray-500 mb-4 flex items-center justify-between uppercase text-[11px] tracking-[0.1em]">
                Pendente <span>{pendentes.length}</span>
              </h2>
              <div className="space-y-4">
                {pendentes.map(t => (
                  <div key={t.id} className="bg-white p-4 rounded-xl shadow-sm border-l-4 border-l-gray-300 group relative hover:shadow-md transition duration-200">
                    <button onClick={() => duplicarTarefa(t)} title="Duplicar"
                      className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 p-1.5 hover:bg-gray-100 rounded-lg text-gray-400 transition">
                      <Copy size={14} />
                    </button>

                    {t.escola && (
                      <div className="flex items-center gap-1 text-[10px] text-gray-400 font-black uppercase mb-1">
                        <School size={10} /> {t.escola}
                      </div>
                    )}
                    
                    <h3 className="font-bold text-gray-800 text-sm leading-snug pr-6">{t.titulo}</h3>

                    <div className="mt-3 flex flex-wrap gap-2 items-center">
                      {t.tags_pessoais && (
                        <span className="text-[9px] px-2 py-0.5 rounded-full text-white font-bold" 
                          style={{ backgroundColor: t.tags_pessoais.cor }}>
                          {t.tags_pessoais.nome}
                        </span>
                      )}
                      <span className={`text-[9px] px-2 py-0.5 rounded-full font-bold uppercase ${
                        t.prioridade === 'alta' ? 'bg-red-100 text-red-600' : 'bg-gray-100 text-gray-400'
                      }`}>
                        {t.prioridade}
                      </span>
                    </div>

                    <div className="mt-4 flex justify-end">
                      <button onClick={() => atualizarStatus(t.id, 'em_andamento')} className="text-xs text-blue-600 font-black hover:underline flex items-center gap-1">
                        INICIAR <ArrowRight size={12} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Coluna: Em Andamento */}
            <div className="bg-blue-50/50 p-4 rounded-2xl border border-blue-100">
              <h2 className="font-bold text-blue-700 mb-4 flex items-center justify-between uppercase text-[11px] tracking-[0.1em]">
                Em Execução <span>{emAndamento.length}</span>
              </h2>
              <div className="space-y-4">
                {emAndamento.map(t => (
                  <div key={t.id} className="bg-white p-4 rounded-xl shadow-sm border-l-4 border-l-blue-500 hover:shadow-md transition">
                    {t.escola && (
                      <div className="flex items-center gap-1 text-[10px] text-blue-400 font-black uppercase mb-1">
                        <School size={10} /> {t.escola}
                      </div>
                    )}
                    <h3 className="font-bold text-gray-800 text-sm">{t.titulo}</h3>
                    <div className="mt-4 flex gap-3 justify-end items-center">
                      <button onClick={() => atualizarStatus(t.id, 'pendente')} className="text-[11px] font-bold text-gray-400 hover:text-gray-600 transition">Pausar</button>
                      <button onClick={() => atualizarStatus(t.id, 'concluido')} 
                        className="bg-green-600 text-white px-3 py-1.5 rounded-lg text-[11px] font-black shadow-md shadow-green-100 hover:bg-green-700 flex items-center gap-1">
                        CONCLUIR <CheckCircle2 size={12} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Coluna: Concluído */}
            <div className="bg-green-50/50 p-4 rounded-2xl border border-green-100">
              <h2 className="font-bold text-green-700 mb-4 flex items-center justify-between uppercase text-[11px] tracking-[0.1em]">
                Finalizado <span>{concluidas.length}</span>
              </h2>
              <div className="space-y-4">
                {concluidas.map(t => (
                  <div key={t.id} className="bg-white/60 p-4 rounded-xl border border-green-100 group relative">
                    <h3 className="font-bold text-gray-400 text-sm line-through decoration-2">{t.titulo}</h3>
                    <div className="mt-2 flex justify-between items-center">
                      <span className="text-[10px] text-green-600 font-bold flex items-center gap-1">
                         <CheckCircle2 size={12} /> Concluído
                      </span>
                      <button onClick={() => atualizarStatus(t.id, 'em_andamento')} className="text-[10px] text-gray-400 font-bold hover:text-blue-500 transition">REABRIR</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

          </div>
        </>
      )}

      {/* Modais */}
      <NovaTarefaModal 
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)} 
        onSuccess={carregarTarefas} 
      />
    </div>
  );
}
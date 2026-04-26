import {
  PieChart, 
  Pie, 
  Cell, 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  Tooltip, 
  ResponsiveContainer,
  CartesianGrid
} from 'recharts';

interface Tarefa {
  status: string;
  prioridade: string;
}

interface EstatisticasTarefasProps {
  tarefas: Tarefa[];
}

export default function EstatisticasTarefas({ tarefas }: EstatisticasTarefasProps) {
  if (tarefas.length === 0) return null;

  const concluidas = tarefas.filter(t => t.status === 'concluido').length;
  const total = tarefas.length;
  const taxaConclusao = Math.round((concluidas / total) * 100) || 0;

  const dadosStatus = [
    { name: 'A Fazer', value: tarefas.filter(t => t.status === 'pendente').length, color: '#9CA3AF' },
    { name: 'Em Andamento', value: tarefas.filter(t => t.status === 'em_andamento').length, color: '#3B82F6' },
    { name: 'Concluído', value: concluidas, color: '#10B981' },
  ].filter(d => d.value > 0); 

  const pendentes = tarefas.filter(t => t.status !== 'concluido');
  const dadosPrioridade = [
    { name: 'Alta', quantidade: pendentes.filter(t => t.prioridade === 'alta').length, fill: '#EF4444' },
    { name: 'Média', quantidade: pendentes.filter(t => t.prioridade === 'media').length, fill: '#F59E0B' },
    { name: 'Baixa', quantidade: pendentes.filter(t => t.prioridade === 'baixa').length, fill: '#6B7280' },
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
      {/* Card de Resumo Numérico */}
      <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm flex flex-col justify-center items-center">
        <h3 className="text-gray-500 font-medium mb-2">Taxa de Conclusão</h3>
        <span className="text-5xl font-bold text-gray-800">{taxaConclusao}%</span>
        <p className="text-sm text-gray-400 mt-2">
          {concluidas} de {total} demandas resolvidas
        </p>
      </div>

      {/* Gráfico de Status (Pizza) */}
      {/* Removemos o h-64 do pai e garantimos que o container tenha uma altura exata e segura */}
      <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm flex flex-col items-center">
        <h3 className="text-sm font-medium text-gray-600 mb-2 w-full text-center">Distribuição do Trabalho</h3>
        <div style={{ width: '100%', height: 220 }}>
          {/* Adicionado width 99% e aspect/minHeight para evitar bugs de resize do Recharts */}
          <ResponsiveContainer width="99%" height="100%" minHeight={200} minWidth={0}>
            <PieChart>
              <Pie
                data={dadosStatus}
                innerRadius={60}
                outerRadius={80}
                paddingAngle={5}
                dataKey="value"
              >
                {dadosStatus.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip formatter={(value: any) => [`${value} demandas`, 'Quantidade']} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Gráfico de Prioridades (Barras) */}
      <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm flex flex-col items-center">
        <h3 className="text-sm font-medium text-gray-600 mb-2 w-full text-center">Fila de Prioridades (Pendentes)</h3>
        <div style={{ width: '100%', height: 220 }}>
          <ResponsiveContainer width="99%" height="100%" minHeight={200} minWidth={0}>
            <BarChart data={dadosPrioridade} margin={{ top: 20, right: 30, left: -20, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
              <XAxis dataKey="name" tick={{ fontSize: 12 }} tickLine={false} axisLine={false} />
              <YAxis allowDecimals={false} tick={{ fontSize: 12 }} tickLine={false} axisLine={false} />
              <Tooltip cursor={{ fill: 'transparent' }} />
              <Bar dataKey="quantidade" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
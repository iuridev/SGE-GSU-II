// Importa a biblioteca principal do React e os hooks useState e useEffect
import React, { useState, useEffect } from 'react';
// Importa o cliente configurado do Supabase para fazer as operações no banco de dados
import { supabase } from '../lib/supabase';
// Importa os ícones da biblioteca lucide-react para enriquecer a interface visual
import { Users, BarChart3, Clock, Search } from 'lucide-react';

// Define uma constante com a lista de todos os setores disponíveis para seleção
const SETORES = [
  "Plantão", "Supervisão", 
  "SEOM - Serviço de Obras e Manuntenção Escolar", 
  "SEFISC - Seção de Fiscalização", 
  "SEGRE - Serviço de Gestão da Rede Escolar", 
  "SEMAT - Seção de Matrícula", 
  "SEVESC - Seção de Vida Escolar", 
  "SEAFIN - Serviço de Administração e Finanças ", 
  "SEFIN - Seção de Finanças ", 
  "SECOMSE - Seção de Compras e Serviços", 
  "SEPES - Serviço de Pessoas", 
  "SEFREP - Seção de Frequência e Pagamento", 
  "SEAPE - Seção de Administração de Pessoal", 
  "EEC - Equipe de Especialistas em Currículo", 
  "FORMAÇÃO",
  "PROTOCOLO", 
  "OUTRO"
];

// Declara e exporta por padrão o componente funcional Portaria
export default function Portaria() {
  // Define o estado 'nome' para armazenar o nome do visitante, iniciando vazio
  const [nome, setNome] = useState('');
  // Define o estado 'tipoDocumento' para alternar entre 'CPF' e 'RG', padrão é 'CPF'
  const [tipoDocumento, setTipoDocumento] = useState<'CPF' | 'RG'>('CPF');
  // Define o estado 'documento' para armazenar o número digitado pelo usuário
  const [documento, setDocumento] = useState('');
  // Define o estado 'setor' para armazenar o setor de destino, padrão é 'Plantão'
  const [setor, setSetor] = useState('Plantão');
  // Define o estado 'loading' para controlar o botão de carregamento ao enviar o formulário
  const [loading, setLoading] = useState(false);
  // Define o estado 'stats' para armazenar os registros retornados do banco de dados
  const [stats, setStats] = useState<any[]>([]);

  // useEffect para buscar automaticamente o nome do visitante baseado no documento digitado
  useEffect(() => {
    // Interrompe a execução caso o documento tenha menos de 8 caracteres (evita buscas desnecessárias)
    if (documento.length < 8) return;

    // Cria um temporizador de 600ms para aguardar o usuário parar de digitar antes de buscar
    const buscarNomeTimer = setTimeout(async () => {
      // Faz a consulta ao Supabase na tabela 'portaria_registros'
      const { data } = await (supabase
        .from('portaria_registros' as any)
        // Seleciona apenas a coluna 'nome'
        .select('nome')
        // Filtra para trazer onde a coluna 'cpf' seja igual ao 'documento' digitado
        .eq('cpf', documento)
        // Ordena pela data de criação em ordem decrescente (mais recente primeiro)
        .order('created_at', { ascending: false })
        // Limita o resultado a apenas 1 registro
        .limit(1)
        // Garante que retorne um objeto único em vez de um array
        .single() as any);

      // Se a consulta retornar dados e existir um nome associado
      if (data && data.nome) {
        // Preenche automaticamente o estado 'nome' com o valor encontrado
        setNome(data.nome);
      }
    }, 600);

    // Função de limpeza do useEffect: cancela o temporizador se o documento mudar antes dos 600ms
    return () => clearTimeout(buscarNomeTimer);
  // Array de dependências: este useEffect roda sempre que a variável 'documento' for alterada
  }, [documento]);

  // Função para lidar com a mudança no campo de input do documento
  const handleDocumentoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    // Pega o valor atual digitado no input
    let value = e.target.value;

    // Verifica se o tipo de documento selecionado é 'CPF'
    if (tipoDocumento === 'CPF') {
      // Remove tudo que não for número usando Regex
      value = value.replace(/\D/g, ""); 
      // Se o tamanho for menor ou igual a 11, aplica a máscara do CPF
      if (value.length <= 11) {
        // Coloca um ponto após os 3 primeiros dígitos
        value = value.replace(/(\d{3})(\d)/, "$1.$2");
        // Coloca outro ponto após os próximos 3 dígitos
        value = value.replace(/(\d{3})(\d)/, "$1.$2");
        // Coloca um traço antes dos últimos 2 dígitos
        value = value.replace(/(\d{3})(\d{1,2})$/, "$1-$2");
        // Atualiza o estado do documento com o valor mascarado
        setDocumento(value);
      }
    // Caso contrário (se for RG)
    } else {
      // Remove tudo que não for letra ou número e transforma em maiúscula (para o X do RG)
      value = value.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
      // Se o tamanho for menor ou igual a 9, aplica a máscara do RG
      if (value.length <= 9) {
        // Coloca um ponto após os 2 primeiros dígitos
        value = value.replace(/(\d{2})(\d)/, "$1.$2");
        // Coloca um ponto após os próximos 3 dígitos
        value = value.replace(/(\d{3})(\d)/, "$1.$2");
        // Coloca um traço antes dos dígitos ou letras finais
        value = value.replace(/(\d{3})([a-zA-Z0-9]{1,2})$/, "$1-$2");
      }
      // Atualiza o estado do documento com o valor mascarado
      setDocumento(value);
    }
  };

  // Função para lidar com a troca de tipo de documento (Radio buttons CPF/RG)
  const handleTipoChange = (tipo: 'CPF' | 'RG') => {
    // Atualiza o estado para o novo tipo escolhido
    setTipoDocumento(tipo);
    // Limpa o input de documento para evitar máscaras misturadas
    setDocumento(''); 
  };

  // Função assíncrona para buscar todos os registros (estatísticas e últimos acessos)
  const fetchStats = async () => {
    // Busca todos os dados da tabela 'portaria_registros'
    const { data } = await (supabase
      .from('portaria_registros' as any)
      .select('*') as any)
      // Ordena pela data de criação decrescente (mais recentes no topo)
      .order('created_at', { ascending: false });
    
    // Se a busca retornar dados, atualiza o estado 'stats'
    if (data) setStats(data);
  };

  // useEffect que roda apenas uma vez quando o componente é montado na tela
  useEffect(() => {
    // Chama a função para popular os dados na tabela e nos cards
    fetchStats();
  // Array de dependências vazio garante que rode só na montagem
  }, []);

  // Função assíncrona chamada ao enviar o formulário
  const handleSubmit = async (e: React.FormEvent) => {
    // Previne o comportamento padrão do navegador de recarregar a página
    e.preventDefault();
    // Ativa o estado de 'loading' para desabilitar o botão e mostrar feedback visual
    setLoading(true);

    // Faz a inserção de uma nova linha no banco de dados do Supabase
    const { error } = await (supabase
      .from('portaria_registros' as any)
      // Passa os dados do formulário como objeto
      .insert([{ 
        // Salva o nome sempre em maiúsculo
        nome: nome.toUpperCase(), 
        // Salva o documento na coluna 'cpf' (mesmo sendo RG, conforme sua lógica original)
        cpf: documento, 
        // Passa o setor selecionado
        setor,
        // Define quem registrou a entrada de forma fixa
        registrado_por: 'ure_servico' 
      }] as any) as any);

    // Se houver erro na inserção, exibe um alerta para o usuário
    if (error) {
      alert("Erro ao registrar entrada: " + error.message);
    // Caso seja sucesso
    } else {
      // Limpa o campo nome
      setNome('');
      // Limpa o campo documento
      setDocumento('');
      // Reseta o setor para o padrão
      setSetor('Plantão');
      // Recarrega os dados da tabela imediatamente para mostrar a nova entrada
      fetchStats();
      // Tenta focar no campo de nome para facilitar um novo registro (uso de optional chaining)
      document.getElementById('nome-input')?.focus();
    }
    // Desativa o estado de 'loading' ao final de tudo
    setLoading(false);
  };

  // Calcula a quantidade de visitantes registrados apenas no dia de hoje
  const totalHoje = stats.filter(s => 
    // Compara a data do registro formatada com a data atual formatada
    new Date(s.created_at).toLocaleDateString() === new Date().toLocaleDateString()
  ).length;

  // Início do render visual (JSX) do componente
  return (
    // Div principal que serve de container com classes Tailwind para espaçamento, fundo e altura
    <div className="p-6 max-w-7xl mx-auto space-y-8 bg-gray-50 min-h-screen">
      {/* Cabeçalho da página contendo título e relógio */}
      <header className="flex justify-between items-center bg-white p-4 rounded-lg shadow-sm border border-gray-200">
        {/* Bloco à esquerda do cabeçalho */}
        <div>
          {/* Título da página */}
          <h1 className="text-2xl font-bold text-gray-800">Registro de Acesso - Protocolo CONVIVA</h1>
          {/* Subtítulo da página */}
          <p className="text-sm text-gray-500">URE Guarulhos Sul</p>
        </div>
        {/* Bloco à direita do cabeçalho (Relógio) */}
        <div className="text-right flex flex-col items-end">
          {/* Container para o ícone e a hora */}
          <div className="flex items-center gap-2 text-lg font-semibold text-blue-600">
            {/* Ícone de relógio */}
            <Clock size={20} />
            {/* Exibe apenas o horário atual do sistema */}
            {new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
          </div>
          {/* Exibe a data atual do sistema logo abaixo da hora */}
          <span className="text-xs text-gray-400">{new Date().toLocaleDateString('pt-BR')}</span>
        </div>
      </header>

      {/* Grid principal que divide a tela: formulário à esquerda, gráficos/tabela à direita */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Coluna da esquerda (ocupa 1/3 em telas grandes) - Contém Formulário e Card */}
        <div className="lg:col-span-1 space-y-6">
          {/* Caixa visual do formulário de novo registro */}
          <div className="bg-white p-6 rounded-xl shadow-md border-t-4 border-blue-600">
            {/* Título do formulário */}
            <h2 className="text-lg font-bold mb-4 flex items-center gap-2 text-gray-700 uppercase">
              {/* Ícone de usuários */}
              <Users size={20} /> Novo Registro
            </h2>
            {/* Formulário chamando 'handleSubmit' no evento de envio */}
            <form onSubmit={handleSubmit} className="space-y-4">
              
              {/* Grupo do Documento */}
              <div>
                {/* Linha com Label e Radio buttons */}
                <div className="flex items-center justify-between mb-1">
                  {/* Label visual do campo documento */}
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-wider">Documento</label>
                  {/* Container dos radio buttons */}
                  <div className="flex gap-3">
                    {/* Opção para selecionar CPF */}
                    <label className="flex items-center gap-1 text-[10px] font-bold text-gray-500 cursor-pointer">
                      <input 
                        type="radio" 
                        name="tipoDoc" 
                        checked={tipoDocumento === 'CPF'} 
                        onChange={() => handleTipoChange('CPF')}
                        className="accent-blue-600"
                      /> CPF
                    </label>
                    {/* Opção para selecionar RG */}
                    <label className="flex items-center gap-1 text-[10px] font-bold text-gray-500 cursor-pointer">
                      <input 
                        type="radio" 
                        name="tipoDoc" 
                        checked={tipoDocumento === 'RG'} 
                        onChange={() => handleTipoChange('RG')}
                        className="accent-blue-600"
                      /> RG
                    </label>
                  </div>
                </div>
                {/* Input onde o usuário digita o documento */}
                <input
                  id="doc-input"
                  type="text"
                  required
                  className="w-full p-3 border rounded-lg bg-gray-50 focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                  value={documento}
                  onChange={handleDocumentoChange}
                  // Altera o placeholder dinamicamente com base no tipo escolhido
                  placeholder={tipoDocumento === 'CPF' ? "000.000.000-00" : "00.000.000-0"}
                  // Limita o tamanho dinamicamente com base no tipo
                  maxLength={tipoDocumento === 'CPF' ? 14 : 12}
                />
              </div>

              {/* Grupo do Nome do Visitante */}
              <div>
                {/* Label do Nome */}
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-wider">Nome do Visitante</label>
                {/* Input onde o usuário digita o nome */}
                <input
                  id="nome-input"
                  type="text"
                  required
                  // Força o texto ficar maiúsculo via CSS também
                  className="mt-1 w-full p-3 border rounded-lg bg-gray-50 focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none transition-all uppercase"
                  value={nome}
                  onChange={(e) => setNome(e.target.value)}
                />
              </div>

              {/* Grupo do Setor */}
              <div>
                {/* Label do Setor */}
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-wider">Setor de Destino</label>
                {/* Dropdown de seleção de setor */}
                <select
                  className="mt-1 w-full p-3 border rounded-lg bg-gray-50 focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none transition-all cursor-pointer"
                  value={setor}
                  onChange={(e) => setSetor(e.target.value)}
                >
                  {/* Faz um map no array SETORES para renderizar cada opção dinamicamente */}
                  {SETORES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>

              {/* Botão de Enviar */}
              <button
                type="submit"
                // Desabilita o botão se estiver carregando, se faltar documento ou nome
                disabled={loading || !documento || !nome}
                className="w-full bg-blue-600 text-white font-black py-4 rounded-lg hover:bg-blue-700 shadow-lg active:transform active:scale-95 transition-all uppercase tracking-widest disabled:opacity-50"
              >
                {/* Muda o texto do botão com base no estado de loading */}
                {loading ? 'Processando...' : 'Confirmar Entrada'}
              </button>
            </form>
          </div>

          {/* Card que mostra a métrica "Visitas Hoje" */}
          <div className="bg-gradient-to-br from-blue-600 to-indigo-700 p-6 rounded-xl text-white shadow-lg">
            {/* Título do Card */}
            <h3 className="text-xs font-bold opacity-80 uppercase tracking-widest text-blue-100">Visitas Hoje</h3>
            {/* Número grande processado pela constante totalHoje */}
            <p className="text-5xl font-black mt-2">{totalHoje}</p>
          </div>
        </div>

        {/* Coluna da Direita (ocupa 2/3 em telas grandes) - Contém Resumo e Tabela */}
        <div className="lg:col-span-2 space-y-6">
          
          {/* Bloco de "Resumo por Setor" (Top 8 setores) */}
          <div className="bg-white p-6 rounded-xl shadow-md border border-gray-100">
            {/* Título do Resumo */}
            <h2 className="text-lg font-bold mb-6 flex items-center gap-2 text-gray-700 uppercase">
              <BarChart3 size={20} /> Resumo por Setor
            </h2>
            {/* Grid de 2 colunas no celular e 4 colunas em monitores maiores */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {/* Faz um slice para pegar apenas os 8 primeiros setores e mapeá-los para cards */}
              {SETORES.slice(0, 8).map(s => {
                // Filtra nos status globais quantos registros pertencem ao setor atual da iteração
                const count = stats.filter(v => v.setor === s).length;
                return (
                  // Div que representa o mini-card de cada setor
                  <div key={s} className="border p-3 rounded-lg bg-gray-50 hover:bg-blue-50 transition-colors">
                    {/* Nome do setor truncado (com reticências se for muito grande) */}
                    <p className="text-[10px] font-bold text-gray-400 uppercase truncate">{s}</p>
                    {/* Valor numérico contando quantas visitas no setor */}
                    <p className="text-xl font-bold text-blue-900">{count}</p>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Bloco da Tabela de "Últimos Acessos" */}
          <div className="bg-white rounded-xl shadow-md overflow-hidden border border-gray-200">
            {/* Header preto/escuro da Tabela */}
            <div className="p-4 bg-gray-800 text-white font-bold flex justify-between items-center text-sm uppercase tracking-widest">
              <span>Últimos Acessos</span>
              <Search size={16} className="opacity-50" />
            </div>
            {/* Container responsivo caso a tabela quebre a tela horizontalmente */}
            <div className="overflow-x-auto">
              {/* A Tabela propriamente dita */}
              <table className="w-full text-left">
                {/* Cabeçalho das Colunas */}
                <thead className="bg-gray-50 text-[10px] font-black text-gray-500 border-b">
                  <tr>
                    {/* ALTERAÇÃO: Nome da coluna foi atualizado para indicar que tem data e horário */}
                    <th className="p-4 uppercase">Data / Horário</th>
                    <th className="p-4 uppercase">Nome do Visitante</th>
                    <th className="p-4 uppercase">Documento</th>
                    <th className="p-4 uppercase">Setor</th>
                  </tr>
                </thead>
                {/* Corpo da Tabela com os dados */}
                <tbody className="divide-y divide-gray-100">
                  {/* Pega apenas os últimos 8 registros para renderizar nas linhas da tabela */}
                  {stats.slice(0, 8).map((item, idx) => (
                    // Linha individual do visitante
                    <tr key={idx} className="hover:bg-blue-50/50 transition-colors">
                      {/* ALTERAÇÃO: Renderizando a data E o horário juntos na mesma célula */}
                      <td className="p-4 text-xs font-medium text-gray-400">
                        {/* Exibe a Data no formato pt-BR */}
                        <span>{new Date(item.created_at).toLocaleDateString('pt-BR')}</span>
                        {/* Texto de junção */}
                        <span className="mx-1">às</span>
                        {/* Exibe a Hora no formato pt-BR */}
                        <span>{new Date(item.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>
                      </td>
                      {/* Célula do Nome */}
                      <td className="p-4 text-sm font-bold text-gray-700">{item.nome}</td>
                      {/* Célula do Documento */}
                      <td className="p-4 text-xs font-bold text-gray-500">{item.cpf}</td>
                      {/* Célula do Setor */}
                      <td className="p-4">
                        {/* Tag/Badge visual para deixar o setor mais bonito */}
                        <span className="bg-blue-50 text-blue-600 text-[10px] font-black px-2 py-1 rounded-md uppercase">
                          {item.setor}
                        </span>
                      </td>
                    </tr>
                  ))}
                  
                  {/* Se o array de stats estiver vazio, exibe uma mensagem amigável no lugar das linhas */}
                  {stats.length === 0 && (
                    <tr>
                      {/* Colspan 4 faz a célula ocupar a largura de todas as 4 colunas */}
                      <td colSpan={4} className="p-10 text-center text-gray-400 text-sm italic">
                        Nenhum registro encontrado hoje.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
          
        </div>
      </div>
    </div>
  );
}
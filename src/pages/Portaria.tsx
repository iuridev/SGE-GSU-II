import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Users, BarChart3, Clock, Search } from 'lucide-react';

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

export default function Portaria() {
  const [nome, setNome] = useState('');
  const [tipoDocumento, setTipoDocumento] = useState<'CPF' | 'RG'>('CPF');
  const [documento, setDocumento] = useState('');
  const [setor, setSetor] = useState('Plantão');
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState<any[]>([]);

  // NOVA FUNÇÃO: Busca automática de nome pelo documento
  useEffect(() => {
    // Só tenta buscar se o documento tiver um tamanho razoável
    if (documento.length < 8) return;

    // Aguarda 600ms após o usuário parar de digitar para fazer a busca
    const buscarNomeTimer = setTimeout(async () => {
      const { data } = await (supabase
        .from('portaria_registros' as any)
        .select('nome')
        .eq('cpf', documento) // Como você salvou RG e CPF na mesma coluna, buscamos nela
        .order('created_at', { ascending: false })
        .limit(1)
        .single() as any);

      // Se achar um registro anterior com esse documento, preenche o nome automaticamente
      if (data && data.nome) {
        setNome(data.nome);
      }
    }, 600);

    return () => clearTimeout(buscarNomeTimer); // Limpa o timer se o usuário continuar digitando
  }, [documento]);

  const handleDocumentoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let value = e.target.value;

    if (tipoDocumento === 'CPF') {
      value = value.replace(/\D/g, ""); // Apenas números
      if (value.length <= 11) {
        value = value.replace(/(\d{3})(\d)/, "$1.$2");
        value = value.replace(/(\d{3})(\d)/, "$1.$2");
        value = value.replace(/(\d{3})(\d{1,2})$/, "$1-$2");
        setDocumento(value);
      }
    } else {
      // Máscara de RG (permite números e a letra X no final)
      value = value.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
      if (value.length <= 9) {
        value = value.replace(/(\d{2})(\d)/, "$1.$2");
        value = value.replace(/(\d{3})(\d)/, "$1.$2");
        value = value.replace(/(\d{3})([a-zA-Z0-9]{1,2})$/, "$1-$2");
      }
      setDocumento(value);
    }
  };

  const handleTipoChange = (tipo: 'CPF' | 'RG') => {
    setTipoDocumento(tipo);
    setDocumento(''); // Limpa o campo ao trocar o tipo
  };

  const fetchStats = async () => {
    const { data } = await (supabase
      .from('portaria_registros' as any)
      .select('*') as any)
      .order('created_at', { ascending: false });
    
    if (data) setStats(data);
  };

  useEffect(() => {
    fetchStats();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    const { error } = await (supabase
      .from('portaria_registros' as any)
      .insert([{ 
        nome: nome.toUpperCase(), 
        cpf: documento, // Salva o RG ou CPF na mesma coluna para não precisar alterar o banco
        setor,
        registrado_por: 'ure_servico' 
      }] as any) as any);

    if (error) {
      alert("Erro ao registrar entrada: " + error.message);
    } else {
      setNome('');
      setDocumento('');
      setSetor('Plantão');
      fetchStats();
      // Retorna o foco para o primeiro campo (ou de documento, se preferir)
      document.getElementById('nome-input')?.focus();
    }
    setLoading(false);
  };

  const totalHoje = stats.filter(s => 
    new Date(s.created_at).toLocaleDateString() === new Date().toLocaleDateString()
  ).length;

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-8 bg-gray-50 min-h-screen">
      <header className="flex justify-between items-center bg-white p-4 rounded-lg shadow-sm border border-gray-200">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Controle de Acesso</h1>
          <p className="text-sm text-gray-500">URE Guarulhos Sul</p>
        </div>
        <div className="text-right flex flex-col items-end">
          <div className="flex items-center gap-2 text-lg font-semibold text-blue-600">
            <Clock size={20} />
            {new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
          </div>
          <span className="text-xs text-gray-400">{new Date().toLocaleDateString('pt-BR')}</span>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-1 space-y-6">
          <div className="bg-white p-6 rounded-xl shadow-md border-t-4 border-blue-600">
            <h2 className="text-lg font-bold mb-4 flex items-center gap-2 text-gray-700 uppercase">
              <Users size={20} /> Novo Registro
            </h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              
              {/* CAMPO DE DOCUMENTO SUBIU PARA FACILITAR O PREENCHIMENTO AUTOMÁTICO */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-wider">Documento</label>
                  <div className="flex gap-3">
                    <label className="flex items-center gap-1 text-[10px] font-bold text-gray-500 cursor-pointer">
                      <input 
                        type="radio" 
                        name="tipoDoc" 
                        checked={tipoDocumento === 'CPF'} 
                        onChange={() => handleTipoChange('CPF')}
                        className="accent-blue-600"
                      /> CPF
                    </label>
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
                <input
                  id="doc-input"
                  type="text"
                  required
                  className="w-full p-3 border rounded-lg bg-gray-50 focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                  value={documento}
                  onChange={handleDocumentoChange}
                  placeholder={tipoDocumento === 'CPF' ? "000.000.000-00" : "00.000.000-0"}
                  maxLength={tipoDocumento === 'CPF' ? 14 : 12}
                />
              </div>

              <div>
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-wider">Nome do Visitante</label>
                <input
                  id="nome-input"
                  type="text"
                  required
                  className="mt-1 w-full p-3 border rounded-lg bg-gray-50 focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none transition-all uppercase"
                  value={nome}
                  onChange={(e) => setNome(e.target.value)}
                />
              </div>

              <div>
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-wider">Setor de Destino</label>
                <select
                  className="mt-1 w-full p-3 border rounded-lg bg-gray-50 focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none transition-all cursor-pointer"
                  value={setor}
                  onChange={(e) => setSetor(e.target.value)}
                >
                  {SETORES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <button
                type="submit"
                disabled={loading || !documento || !nome}
                className="w-full bg-blue-600 text-white font-black py-4 rounded-lg hover:bg-blue-700 shadow-lg active:transform active:scale-95 transition-all uppercase tracking-widest disabled:opacity-50"
              >
                {loading ? 'Processando...' : 'Confirmar Entrada'}
              </button>
            </form>
          </div>

          <div className="bg-gradient-to-br from-blue-600 to-indigo-700 p-6 rounded-xl text-white shadow-lg">
            <h3 className="text-xs font-bold opacity-80 uppercase tracking-widest text-blue-100">Visitas Hoje</h3>
            <p className="text-5xl font-black mt-2">{totalHoje}</p>
          </div>
        </div>

        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white p-6 rounded-xl shadow-md border border-gray-100">
            <h2 className="text-lg font-bold mb-6 flex items-center gap-2 text-gray-700 uppercase">
              <BarChart3 size={20} /> Resumo por Setor
            </h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {SETORES.slice(0, 8).map(s => {
                const count = stats.filter(v => v.setor === s).length;
                return (
                  <div key={s} className="border p-3 rounded-lg bg-gray-50 hover:bg-blue-50 transition-colors">
                    <p className="text-[10px] font-bold text-gray-400 uppercase truncate">{s}</p>
                    <p className="text-xl font-bold text-blue-900">{count}</p>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-md overflow-hidden border border-gray-200">
            <div className="p-4 bg-gray-800 text-white font-bold flex justify-between items-center text-sm uppercase tracking-widest">
              <span>Últimos Acessos</span>
              <Search size={16} className="opacity-50" />
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="bg-gray-50 text-[10px] font-black text-gray-500 border-b">
                  <tr>
                    <th className="p-4 uppercase">Horário</th>
                    <th className="p-4 uppercase">Nome do Visitante</th>
                    <th className="p-4 uppercase">Documento</th>
                    <th className="p-4 uppercase">Setor</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {stats.slice(0, 8).map((item, idx) => (
                    <tr key={idx} className="hover:bg-blue-50/50 transition-colors">
                      <td className="p-4 text-xs font-medium text-gray-400">
                        {new Date(item.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                      </td>
                      <td className="p-4 text-sm font-bold text-gray-700">{item.nome}</td>
                      <td className="p-4 text-xs font-bold text-gray-500">{item.cpf}</td>
                      <td className="p-4">
                        <span className="bg-blue-50 text-blue-600 text-[10px] font-black px-2 py-1 rounded-md uppercase">
                          {item.setor}
                        </span>
                      </td>
                    </tr>
                  ))}
                  {stats.length === 0 && (
                    <tr>
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
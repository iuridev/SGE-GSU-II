import React, { useState } from 'react';
import { supabase } from '../lib/supabase';
import { parseConsumoCSV } from '../lib/consumoParser';
import { Upload, Loader2, FileText, Info, Terminal } from 'lucide-react';

export default function ImportacaoFinanceiro() {
  const [loading, setLoading] = useState(false);
  const [logs, setLogs] = useState<{ tipo: 'sucesso' | 'erro' | 'info', msg: string }[]>([]);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setLoading(true);
    setLogs([{ tipo: 'info', msg: `Iniciando processamento: ${file.name}` }]);

    try {
      // 1. Extração inicial dos dados do CSV
      const dadosExtraidos = await parseConsumoCSV(file);
      setLogs(prev => [...prev, { tipo: 'sucesso', msg: `${dadosExtraidos.length} linhas lidas do arquivo.` }]);

      // 2. Mapeamento de Escolas (para resolver códigos vazios)
      const { data: escolasDB } = await supabase.from('consumo_agua_luz').select('codigo_predio, nome_escola');
      const mapaEscolas = new Map<string, string>();
      escolasDB?.forEach(esc => {
        if (esc.nome_escola && esc.codigo_predio) mapaEscolas.set(esc.nome_escola.trim().toUpperCase(), esc.codigo_predio);
      });

      // 3. Busca dados JÁ EXISTENTES para evitar sobrescrever com Zero
      const mesesNoArquivo = [...new Set(dadosExtraidos.map(d => d.mes_ano))];
      const { data: dadosAntigos } = await supabase
        .from('consumo_agua_luz')
        .select('*')
        .in('mes_ano', mesesNoArquivo);

      // 4. Inteligência de Mesclagem (Merge)
      const dadosSincronizados = dadosExtraidos.map(item => {
        let codigo = item.codigo_predio;
        const nomeUpper = item.nome_escola.trim().toUpperCase();

        // Recupera código pelo nome se estiver vazio
        if (!codigo || codigo === "") {
          codigo = mapaEscolas.get(nomeUpper) || `AUTO-${nomeUpper.substring(0, 6)}`;
        }

        // Procura se já existe esse registro no banco
        const existente = dadosAntigos?.find(d => d.codigo_predio === codigo && d.mes_ano === item.mes_ano);
        
        if (existente) {
          // Se o novo dado for 0 mas o antigo tiver valor, preserva o antigo (Intelligent Merge)
          if (item.agua_valor === 0 && existente.agua_valor > 0) {
            item.agua_valor = existente.agua_valor;
            item.agua_qtde_m3 = existente.agua_qtde_m3;
          }
          if (item.energia_valor === 0 && existente.energia_valor > 0) {
            item.energia_valor = existente.energia_valor;
            item.energia_qtde_kwh = existente.energia_qtde_kwh;
          }
        }

        return { ...item, codigo_predio: codigo };
      });

      // 5. Envio Final para o Banco
      const { error } = await supabase
        .from('consumo_agua_luz')
        .upsert(dadosSincronizados, { onConflict: 'codigo_predio,mes_ano' });

      if (error) throw error;
      setLogs(prev => [...prev, { tipo: 'sucesso', msg: "✅ Sincronização concluída com sucesso!" }]);

    } catch (err: any) {
      setLogs(prev => [...prev, { tipo: 'erro', msg: `Erro: ${err.message}` }]);
    } finally {
      setLoading(false);
      e.target.value = '';
    }
  };

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <header className="mb-10">
        <h1 className="text-3xl font-black text-slate-800 flex items-center gap-3">
          <FileText className="text-blue-600" size={36} /> Importação Financeira
        </h1>
        <p className="text-slate-500 mt-2">Atualize a base de dados de consumo sem perder informações históricas.</p>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-6">
          <div className="relative group h-72 bg-white border-4 border-dashed border-slate-200 rounded-[2.5rem] flex flex-col items-center justify-center hover:border-blue-400 transition-all cursor-pointer overflow-hidden">
            {loading ? (
              <div className="text-center">
                <Loader2 className="w-12 h-12 text-blue-500 animate-spin mx-auto mb-4" />
                <p className="font-bold text-slate-600">Mesclando dados...</p>
              </div>
            ) : (
              <>
                <Upload className="w-16 h-16 text-slate-300 group-hover:text-blue-500 mb-4 transition-colors" />
                <p className="text-lg font-bold text-slate-700">Arraste o arquivo CSV</p>
                <p className="text-sm text-slate-400">ou clique para selecionar</p>
                <input type="file" accept=".csv" className="absolute inset-0 opacity-0 cursor-pointer" onChange={handleUpload} disabled={loading} />
              </>
            )}
          </div>

          <div className="bg-blue-50 p-6 rounded-3xl border border-blue-100 flex gap-4 items-start">
            <Info className="text-blue-500 mt-1" />
            <div className="text-sm text-blue-900">
              <p className="font-bold mb-1">Tecnologia Smart-Merge Ativa:</p>
              <p>O sistema agora detecta se o arquivo contém apenas energia ou apenas água e preserva os valores opostos já salvos no banco.</p>
            </div>
          </div>
        </div>

        <div className="bg-slate-900 rounded-[2rem] p-6 shadow-2xl h-[450px] flex flex-col">
          <div className="flex items-center gap-2 text-white font-bold mb-4 border-b border-white/10 pb-4">
            <Terminal size={18} className="text-emerald-400" /> Terminal de Log
          </div>
          <div className="flex-1 overflow-y-auto space-y-2 pr-2 custom-scrollbar font-mono text-[11px]">
            {logs.map((log, i) => (
              <div key={i} className={`${log.tipo === 'erro' ? 'text-rose-400' : log.tipo === 'sucesso' ? 'text-emerald-400' : 'text-blue-300'}`}>
                {`> ${log.msg}`}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
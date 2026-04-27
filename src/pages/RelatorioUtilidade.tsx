import { useEffect, useState, useRef, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { Download, Filter, Droplets, Zap, TrendingDown, TrendingUp, Calendar, Activity, DollarSign, Database, Users } from 'lucide-react';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';

// Extrator Blindado de Códigos (Ignora casas decimais e zeros à esquerda)
const extractCIE = (val: any) => {
  if (val === null || val === undefined) return '';
  const numStr = String(val).split('.')[0].replace(/\D/g, '');
  const num = parseInt(numStr, 10);
  return isNaN(num) ? '' : num.toString();
};

// Função para ignorar o limite de 1000 linhas do Supabase (Paginação Automática)
const fetchAll = async (table: string) => {
  let allData: any[] = [];
  let from = 0;
  const step = 999;
  let hasMore = true;

  while (hasMore) {
    const { data, error } = await supabase.from(table).select('*').range(from, from + step);
    if (error) {
      console.error(`Erro ao buscar ${table}:`, error);
      break;
    }
    if (data && data.length > 0) {
      allData = [...allData, ...data];
      from += step + 1;
      if (data.length <= step) hasMore = false; // Parar se a página veio incompleta (Fim da tabela)
    } else {
      hasMore = false;
    }
  }
  return allData;
};

export default function DashboardConsumo() {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtroEscola, setFiltroEscola] = useState('todas');
  // Pega o ano atual do computador/servidor automaticamente
  const anoAtual = new Date().getFullYear();
  
  const [dataInicio, setDataInicio] = useState(`${anoAtual}-01`);
  const [dataFim, setDataFim] = useState(`${anoAtual}-12`);
  const [ultimaAtualizacao, setUltimaAtualizacao] = useState<string>('...');
  const [gerandoPDF, setGerandoPDF] = useState(false);
  const dashboardRef = useRef<HTMLDivElement>(null);

  useEffect(() => { fetchData(); }, []);

  async function fetchData() {
    setLoading(true);
    try {
      // Busca TODAS as linhas em paralelo, sem limite de 1000!
      const [resConta, resFiscal, escolasDB, indiceDB] = await Promise.all([
        fetchAll('consumo_agua_luz'),
        fetchAll('consumo_agua'),
        fetchAll('schools'),
        fetchAll('indice_escolas')
      ]);
      
      if (resConta && resConta.length > 0) {
        
        // Ordena os dados financeiros por data para garantir a linha de tempo do gráfico
        resConta.sort((a, b) => {
          if (!a.mes_ano || !b.mes_ano) return 0;
          const [mA, yA] = a.mes_ano.split('/').map(Number);
          const [mB, yB] = b.mes_ano.split('/').map(Number);
          return new Date(yA, mA - 1).getTime() - new Date(yB, mB - 1).getTime();
        });

        // 1. CONSTRUÇÃO DO DICIONÁRIO DE NOMES (ÍNDICE)
        const tradutorNomesParaCIE = new Map();
        if (indiceDB) {
          indiceDB.forEach(idx => {
            const cie = extractCIE(idx.cie || idx.CIE);
            if (cie) {
              const nomesParaMapear = [
                idx.nome_escola_novo || idx['NOME ESCOLA NOVO'], 
                idx.nome_escola_antigo || idx['NOME ESCOLA ANTIGO'], 
                idx.nome_no_banco_de_dados || idx['NOME NO BANCO DE DADOS']
              ];
              nomesParaMapear.forEach(n => {
                if (n) tradutorNomesParaCIE.set(n.trim().toUpperCase(), cie);
              });
            }
          });
        }

        // 2. MAPEAMENTO DE UUID -> CIE (Para os dados do Fiscal)
        const mapaIdFiscalParaCIE = new Map();
        if (escolasDB) {
          escolasDB.forEach(esc => {
            const cie = extractCIE(esc.cie_code || esc.fde_code);
            if (cie) mapaIdFiscalParaCIE.set(esc.id, cie);
          });
        }

        // 3. PROCESSAMENTO DOS DADOS DO FISCAL (Soma total dos meses agora funciona para +2800 linhas)
        const fiscalAgrupado = new Map();
        if (resFiscal) {
          resFiscal.forEach(f => {
            const cie = mapaIdFiscalParaCIE.get(f.school_id);
            if (!cie || !f.date) return;

            let mesAno = '';
            const dateStr = String(f.date).split('T')[0]; // Remove tempo
            
            // Garantia de formatação de data (Caso venha YYYY-MM-DD ou DD/MM/YYYY)
            if (dateStr.includes('-')) {
              const partes = dateStr.split('-');
              if (partes.length >= 2) mesAno = `${partes[1]}/${partes[0]}`; 
            } else if (dateStr.includes('/')) {
              const partes = dateStr.split('/');
              if (partes.length === 3) mesAno = `${partes[1]}/${partes[2]}`; 
            }
            if (!mesAno) return;

            const key = `${cie}-${mesAno}`;
            const consumoNoDia = Number(f.consumption_diff) || 0;
            const totalPessoasNoDia = (Number(f.student_count) || 0) + (Number(f.staff_count) || 0);

            if (fiscalAgrupado.has(key)) {
              const prev = fiscalAgrupado.get(key);
              fiscalAgrupado.set(key, {
                totalConsumo: prev.totalConsumo + consumoNoDia,
                somaPessoas: prev.somaPessoas + totalPessoasNoDia,
                registros: prev.registros + 1
              });
            } else {
              fiscalAgrupado.set(key, {
                totalConsumo: consumoNoDia,
                somaPessoas: totalPessoasNoDia,
                registros: 1
              });
            }
          });
        }

        // 4. CRUZAMENTO FINAL (JOIN)
        const dadosMesclados = resConta.map(conta => {
          let cieAlvo = extractCIE(conta.codigo_predio);
          if (!cieAlvo) {
            cieAlvo = tradutorNomesParaCIE.get(conta.nome_escola?.trim().toUpperCase()) || '';
          }

          const mesAnoLimpo = conta.mes_ano?.trim();
          const keyBusca = `${cieAlvo}-${mesAnoLimpo}`;
          const auditoria = fiscalAgrupado.get(keyBusca);

          return {
            ...conta,
            agua_fiscal_m3: auditoria ? auditoria.totalConsumo : null,
            media_pessoas_fiscal: auditoria && auditoria.registros > 0 
              ? Math.round(auditoria.somaPessoas / auditoria.registros) 
              : null
          };
        });

        setData(dadosMesclados);
        const maisRecente = [...resConta].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0];
        if (maisRecente) setUltimaAtualizacao(new Date(maisRecente.created_at).toLocaleDateString('pt-BR'));
      }
    } catch (error) {
      console.error("Falha ao recuperar dados:", error);
    } finally {
      setLoading(false);
    }
  }

  const parseDate = (str: string) => {
    const [m, y] = str.trim().split('/').map(Number);
    return new Date(y, m - 1);
  };

  const dadosFiltrados = useMemo(() => {
    return data.filter(d => {
      const matchEscola = filtroEscola === 'todas' || d.nome_escola === filtroEscola;
      if (!d.mes_ano || !d.mes_ano.includes('/')) return false;
      const dDate = parseDate(d.mes_ano);
      const start = new Date(dataInicio + "-01");
      const end = new Date(dataFim + "-01");
      return matchEscola && dDate >= start && dDate <= end;
    });
  }, [data, filtroEscola, dataInicio, dataFim]);

  const metricas = useMemo(() => {
    const atualFinanceiro = dadosFiltrados.reduce((acc, c) => acc + (Number(c.agua_valor) || 0) + (Number(c.energia_valor) || 0), 0);
    const atualAguaM3 = dadosFiltrados.reduce((acc, c) => acc + (Number(c.agua_qtde_m3) || 0), 0);
    const atualEnergiaKwh = dadosFiltrados.reduce((acc, c) => acc + (Number(c.energia_qtde_kwh) || 0), 0);

    const regComPessoas = dadosFiltrados.filter(d => d.media_pessoas_fiscal > 0);
    const mediaPessoas = regComPessoas.length > 0 
      ? Math.round(regComPessoas.reduce((acc, c) => acc + c.media_pessoas_fiscal, 0) / regComPessoas.length)
      : 0;

    const meses = [...new Set(dadosFiltrados.map(d => d.mes_ano))].sort((a, b) => {
      const [mA, yA] = a.split('/').map(Number);
      const [mB, yB] = b.split('/').map(Number);
      return new Date(yA, mA - 1).getTime() - new Date(yB, mB - 1).getTime();
    });

    let diffFin = 0, diffAgua = 0, diffLuz = 0;
    if (meses.length > 1) {
      const prim = dadosFiltrados.filter(d => d.mes_ano === meses[0]);
      const ult = dadosFiltrados.filter(d => d.mes_ano === meses[meses.length - 1]);
      
      const vPrimFin = prim.reduce((a, c) => a + (Number(c.agua_valor) || 0) + (Number(c.energia_valor) || 0), 0);
      const vUltFin = ult.reduce((a, c) => a + (Number(c.agua_valor) || 0) + (Number(c.energia_valor) || 0), 0);

      const vPrimAgua = prim.reduce((a, c) => a + (Number(c.agua_qtde_m3) || 0), 0);
      const vUltAgua = ult.reduce((a, c) => a + (Number(c.agua_qtde_m3) || 0), 0);

      const vPrimLuz = prim.reduce((a, c) => a + (Number(c.energia_qtde_kwh) || 0), 0);
      const vUltLuz = ult.reduce((a, c) => a + (Number(c.energia_qtde_kwh) || 0), 0);
      
      if (vPrimFin > 0) diffFin = ((vUltFin - vPrimFin) / vPrimFin) * 100;
      if (vPrimAgua > 0) diffAgua = ((vUltAgua - vPrimAgua) / vPrimAgua) * 100;
      if (vPrimLuz > 0) diffLuz = ((vUltLuz - vPrimLuz) / vPrimLuz) * 100;
    }

    return { 
      atualFinanceiro, diffFin, economizou: diffFin <= 0,
      atualAguaM3, diffAgua, economizouAgua: diffAgua <= 0,
      atualEnergiaKwh, diffLuz, economizouLuz: diffLuz <= 0,
      mediaPessoas, primMes: meses[0], ultMes: meses[meses.length-1]
    };
  }, [dadosFiltrados]);

  const exportarPDF = async () => {
    if (!dashboardRef.current) return;
    setGerandoPDF(true);
    try {
      const canvas = await html2canvas(dashboardRef.current, { scale: 2 });
      const pdf = new jsPDF('p', 'mm', 'a4');
      const marginX = 14; 
      
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(16);
      pdf.setTextColor(15, 23, 42); 
      pdf.text('Relatório de Consumo e Auditoria Física', marginX, 20);
      
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(12);
      pdf.setTextColor(71, 85, 105); 
      const nomeEscolaPDF = filtroEscola === 'todas' ? 'Rede Municipal (Visão Geral)' : filtroEscola;
      pdf.text(`Unidade Escolar: ${nomeEscolaPDF}`, marginX, 28);
      
      const dataEmissao = new Date().toLocaleString('pt-BR');
      pdf.setFontSize(10);
      pdf.setTextColor(100, 116, 139); 
      pdf.text(`Data de emissão: ${dataEmissao}`, marginX, 34);

      pdf.setDrawColor(226, 232, 240); 
      pdf.setLineWidth(0.5);
      pdf.line(marginX, 38, pdf.internal.pageSize.getWidth() - marginX, 38);
      
      const imgData = canvas.toDataURL('image/png');
      const imgWidth = pdf.internal.pageSize.getWidth() - (marginX * 2);
      const imgHeight = (canvas.height * imgWidth) / canvas.width;
      
      pdf.addImage(imgData, 'PNG', marginX, 44, imgWidth, imgHeight);
      pdf.save(`Relatorio_${nomeEscolaPDF.replace(/[^a-zA-Z0-9]/g, '_')}.pdf`);
    } finally {
      setGerandoPDF(false);
    }
  };

  if (loading) return <div className="p-20 text-center font-bold text-slate-400 animate-pulse">Carregando todos os registros do Banco de Dados...</div>;

  return (
    <div className="p-6 bg-[#F8FAFC] min-h-screen">
      <div className="mb-6 flex flex-col md:flex-row justify-between items-start md:items-end">
        <div>
          <h1 className="text-3xl font-black text-slate-800">Painel de Utilidades e Auditoria</h1>
          <div className="mt-2 flex gap-3">
            <div className="inline-flex items-center gap-2 bg-white px-3 py-1.5 rounded-lg border border-slate-200 shadow-sm text-sm text-slate-600">
              <Database size={16} className="text-blue-500" /> Atualizado em <strong>{ultimaAtualizacao}</strong>
            </div>
            {metricas.mediaPessoas > 0 && filtroEscola !== 'todas' && (
              <div className="inline-flex items-center gap-2 bg-indigo-50 px-3 py-1.5 rounded-lg border border-indigo-100 shadow-sm text-sm text-indigo-700">
                <Users size={16} /> Ocupação Média: <strong>{metricas.mediaPessoas} pessoas/dia</strong>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="bg-white p-5 rounded-3xl shadow-sm mb-8 flex flex-wrap items-center gap-6 border border-slate-100">
        <Filter size={20} className="text-blue-600" />
        <select className="bg-slate-50 border-none rounded-xl px-4 py-2 text-sm focus:ring-2 ring-blue-500 min-w-[250px] outline-none" value={filtroEscola} onChange={e => setFiltroEscola(e.target.value)}>
          <option value="todas">Rede Municipal (Geral)</option>
          {[...new Set(data.map(d => d.nome_escola))].sort().map(e => <option key={e} value={e}>{e}</option>)}
        </select>
        <div className="flex items-center gap-2 bg-slate-50 px-4 py-2 rounded-xl text-sm">
          <Calendar size={16} className="text-slate-400" />
          <input type="month" value={dataInicio} onChange={e => setDataInicio(e.target.value)} className="bg-transparent border-none p-0 outline-none" />
          <span className="text-slate-300">até</span>
          <input type="month" value={dataFim} onChange={e => setDataFim(e.target.value)} className="bg-transparent border-none p-0 outline-none" />
        </div>
        <button onClick={exportarPDF} disabled={gerandoPDF} className="ml-auto bg-slate-900 text-white px-6 py-2 rounded-xl flex items-center gap-2 hover:bg-blue-600 transition-all font-medium disabled:opacity-50">
          <Download size={18} /> {gerandoPDF ? 'Gerando...' : 'Exportar PDF'}
        </button>
      </div>

      <div ref={dashboardRef} className="space-y-8">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-slate-100">
            <p className="text-slate-400 text-sm font-bold uppercase mb-2">Gasto no Período</p>
            <h2 className="text-3xl font-black text-slate-800">{metricas.atualFinanceiro.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</h2>
            <div className={`mt-4 inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-black ${metricas.economizou ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>
              {metricas.economizou ? <TrendingDown size={14}/> : <TrendingUp size={14}/>} {Math.abs(metricas.diffFin).toFixed(1)}% vs Início
            </div>
            {metricas.primMes && metricas.primMes !== metricas.ultMes && <p className="mt-4 text-[10px] text-slate-400 border-t border-slate-100 pt-2 uppercase font-bold tracking-widest">Comparando {metricas.ultMes} com {metricas.primMes}</p>}
          </div>

          <div className="bg-blue-600 p-8 rounded-[2.5rem] shadow-xl text-white">
            <Droplets className="mb-4 opacity-50" size={32} />
            <p className="text-blue-100 text-sm font-bold uppercase mb-1">Volume de Água</p>
            <h2 className="text-4xl font-black">{metricas.atualAguaM3.toLocaleString('pt-BR')} <small className="text-lg">m³</small></h2>
            <div className={`mt-4 inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-black shadow-sm ${metricas.economizouAgua ? 'bg-white text-emerald-600' : 'bg-rose-500 text-white'}`}>
              {metricas.economizouAgua ? <TrendingDown size={14}/> : <TrendingUp size={14}/>} {Math.abs(metricas.diffAgua).toFixed(1)}% vs Início
            </div>
            {metricas.primMes && metricas.primMes !== metricas.ultMes && <p className="mt-4 text-[10px] opacity-70 border-t border-white/20 pt-2 uppercase font-bold tracking-widest">Comparando {metricas.ultMes} com {metricas.primMes}</p>}
          </div>

          <div className="bg-amber-400 p-8 rounded-[2.5rem] shadow-xl text-amber-950">
            <Zap className="mb-4 opacity-50" size={32} />
            <p className="text-amber-900/60 text-sm font-bold uppercase mb-1">Consumo de Energia</p>
            <h2 className="text-4xl font-black">{metricas.atualEnergiaKwh.toLocaleString('pt-BR')} <small className="text-lg">kWh</small></h2>
            <div className={`mt-4 inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-black shadow-sm ${metricas.economizouLuz ? 'bg-white text-emerald-600' : 'bg-rose-500 text-white'}`}>
              {metricas.economizouLuz ? <TrendingDown size={14}/> : <TrendingUp size={14}/>} {Math.abs(metricas.diffLuz).toFixed(1)}% vs Início
            </div>
            {metricas.primMes && metricas.primMes !== metricas.ultMes && <p className="mt-4 text-[10px] opacity-70 border-t border-amber-900/10 pt-2 uppercase font-bold tracking-widest">Comparando {metricas.ultMes} com {metricas.primMes}</p>}
          </div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
          <div className="bg-white p-8 rounded-[3rem] shadow-sm border border-slate-100">
            <div className="mb-8">
              <h3 className="text-xl font-black text-slate-800 flex items-center gap-3 mb-2">
                <div className="w-10 h-10 rounded-full bg-indigo-50 flex items-center justify-center">
                  <Activity className="text-indigo-600" size={20} />
                </div>
                Auditoria: Conta vs Leitura na Escola
              </h3>
              <p className="text-sm text-slate-500 ml-12">
                Linhas contínuas = Conta da Concessionária | <span className="border-b-2 border-dashed border-slate-400">Linha tracejada</span> = Soma do apontamento diário do Fiscal
              </p>
            </div>
            
            <div className="h-[350px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={dadosFiltrados} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" />
                  <XAxis dataKey="mes_ano" axisLine={false} tickLine={false} tick={{fill: '#94A3B8', fontSize: 12}} dy={10} />
                  <YAxis yAxisId="left" orientation="left" stroke="#3B82F6" axisLine={false} tickLine={false} tick={{fontSize: 12}} tickFormatter={v => `${v}m³`} width={60} />
                  <YAxis yAxisId="right" orientation="right" stroke="#F59E0B" axisLine={false} tickLine={false} tick={{fontSize: 12}} tickFormatter={v => `${v}kWh`} width={75} />
                  
                  <Tooltip 
                    cursor={{stroke: '#F1F5F9', strokeWidth: 2}} 
                    contentStyle={{borderRadius: '20px', border: 'none', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)'}}
                    formatter={(value: any, name: any, props: any) => {
                      if (name === 'media_pessoas_fiscal') return null;
                      if (value === null || value === undefined) return ['Não registrado pelo Fiscal', '📋 Água (Soma Leitura Fiscal)'];
                      
                      const pessoas = props.payload.media_pessoas_fiscal ? ` (~${props.payload.media_pessoas_fiscal} pessoas)` : '';
                      if (name === 'agua_fiscal_m3') return [`${Number(value).toLocaleString('pt-BR')} m³${pessoas}`, '📋 Água (Soma Leitura Fiscal)'];
                      if (name === 'agua_qtde_m3') return [`${Number(value).toLocaleString('pt-BR')} m³`, '💧 Água (Conta da Sabesp)'];
                      if (name === 'energia_qtde_kwh') return [`${Number(value).toLocaleString('pt-BR')} kWh`, '⚡ Energia (Conta da EDP)'];
                      return [value, name];
                    }}
                  />
                  <Legend wrapperStyle={{paddingTop: '20px'}} />
                  
                  <Line yAxisId="left" type="monotone" dataKey="agua_qtde_m3" name="Água (Conta)" stroke="#3B82F6" strokeWidth={4} dot={{r: 4, strokeWidth: 2}} activeDot={{r: 6}} />
                  <Line yAxisId="right" type="monotone" dataKey="energia_qtde_kwh" name="Energia (Conta)" stroke="#F59E0B" strokeWidth={4} dot={{r: 4, strokeWidth: 2}} activeDot={{r: 6}} />
                  <Line yAxisId="left" type="monotone" dataKey="agua_fiscal_m3" name="Água (Fiscal)" stroke="#3B82F6" strokeWidth={3} strokeDasharray="5 5" dot={{r: 4, fill: 'white'}} connectNulls={true} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="bg-white p-8 rounded-[3rem] shadow-sm border border-slate-100">
            <h3 className="text-xl font-black text-slate-800 mb-8 flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-emerald-50 flex items-center justify-center">
                <DollarSign className="text-emerald-600" size={20} />
              </div>
              Comparativo de Custos Financeiros
            </h3>
            <div className="h-[350px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={dadosFiltrados} barGap={8}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" />
                  <XAxis dataKey="mes_ano" axisLine={false} tickLine={false} tick={{fill: '#94A3B8', fontSize: 12}} dy={10} />
                  <YAxis axisLine={false} tickLine={false} tick={{fill: '#94A3B8', fontSize: 12}} tickFormatter={v => `R$ ${v.toLocaleString('pt-BR')}`} width={85} />
                  <Tooltip 
                    cursor={{fill: '#F8FAFC'}} 
                    contentStyle={{borderRadius: '20px', border: 'none', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)'}} 
                    formatter={(value: any, name: any) => {
                      const formatado = `R$ ${Number(value).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
                      return [formatado, name === 'agua_valor' ? 'Custo Água' : 'Custo Energia'];
                    }}
                  />
                  <Legend wrapperStyle={{paddingTop: '20px'}} />
                  <Bar dataKey="agua_valor" name="Custo Água" fill="#3B82F6" radius={[6, 6, 0, 0]} barSize={28} />
                  <Bar dataKey="energia_valor" name="Custo Energia" fill="#F59E0B" radius={[6, 6, 0, 0]} barSize={28} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
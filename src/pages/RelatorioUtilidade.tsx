import { useEffect, useState, useRef, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { Download, Filter, Droplets, Zap, TrendingDown, TrendingUp, AlertTriangle, Calendar, Activity, DollarSign, Database } from 'lucide-react';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';

// Super Normalizador
const normalizarNome = (nome: string) => {
  if (!nome) return '';
  let n = nome.toString().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
  n = n.replace(/\b(EE|E\.E\.|EMEF|PROF|PROFA|PROFESSOR|PROFESSORA|DE|DA|DO|DAS|DOS)\b/g, ' ');
  n = n.replace(/[^A-Z0-9]/g, '');
  return n;
};

export default function DashboardConsumo() {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtroEscola, setFiltroEscola] = useState('todas');
  const [dataInicio, setDataInicio] = useState('2024-01');
  const [dataFim, setDataFim] = useState('2026-12');
  const [ultimaAtualizacao, setUltimaAtualizacao] = useState<string>('...');
  const [gerandoPDF, setGerandoPDF] = useState(false); // Estado para o botão de PDF
  const dashboardRef = useRef<HTMLDivElement>(null);

  useEffect(() => { fetchData(); }, []);

  async function fetchData() {
    setLoading(true);
    try {
      const { data: resConta } = await supabase.from('consumo_agua_luz').select('*').order('mes_ano', { ascending: true });
      const { data: resFiscal } = await supabase.from('consumo_agua').select('*');
      const { data: escolasDB } = await supabase.from('schools').select('*'); 
      
      if (resConta && resConta.length > 0) {
        const mapaCodigos = new Map();
        const mapaNomes = new Map();
        
        if (escolasDB) {
          escolasDB.forEach(esc => {
            const codigoBruto = esc.fde_code || ''; 
            const codigoLimpo = String(codigoBruto).replace(/\D/g, '');
            if (codigoLimpo) mapaCodigos.set(esc.id, Number(codigoLimpo).toString());
            
            const nomeBruto = esc.name || '';
            if (nomeBruto) mapaNomes.set(esc.id, normalizarNome(nomeBruto));
          });
        }

        const fiscalAgrupadoCod = new Map();
        const fiscalAgrupadoNome = new Map();
        
        if (resFiscal) {
          resFiscal.forEach(f => {
            if (!f.date || !f.school_id) return;
            const dataApenas = f.date.substring(0, 10); 
            const partes = dataApenas.split('-');
            if (partes.length >= 2) {
              const mesAno = `${partes[1]}/${partes[0]}`; 
              const diffMensal = Number(f.consumption_diff) || 0;
              
              const codLimpo = mapaCodigos.get(f.school_id);
              if (codLimpo) {
                 const keyCod = `${codLimpo}-${mesAno}`;
                 fiscalAgrupadoCod.set(keyCod, (fiscalAgrupadoCod.get(keyCod) || 0) + diffMensal);
              }
              
              const nomeLimpo = mapaNomes.get(f.school_id);
              if (nomeLimpo) {
                 const keyNome = `${nomeLimpo}-${mesAno}`;
                 fiscalAgrupadoNome.set(keyNome, (fiscalAgrupadoNome.get(keyNome) || 0) + diffMensal);
              }
            }
          });
        }

        const dadosMesclados = resConta.map(conta => {
          const codContaLimpo = Number(String(conta.codigo_predio).replace(/\D/g, '')).toString();
          const nomeContaLimpo = normalizarNome(conta.nome_escola);
          const mesAnoLimpo = String(conta.mes_ano || '').replace(/\s/g, ''); 
          
          const keyCod = `${codContaLimpo}-${mesAnoLimpo}`;
          const keyNome = `${nomeContaLimpo}-${mesAnoLimpo}`;
          
          let totalAguaFiscal = fiscalAgrupadoCod.get(keyCod);
          if (totalAguaFiscal === undefined) {
             totalAguaFiscal = fiscalAgrupadoNome.get(keyNome);
          }
          if (totalAguaFiscal === undefined && nomeContaLimpo.length > 5) {
             for (const [key, val] of fiscalAgrupadoNome.entries()) {
               const separatorIndex = key.indexOf('-');
               if (separatorIndex !== -1) {
                 const nomeFiscal = key.substring(0, separatorIndex);
                 const mesFiscal = key.substring(separatorIndex + 1);
                 if (mesFiscal === mesAnoLimpo) {
                   if (nomeContaLimpo.includes(nomeFiscal) || nomeFiscal.includes(nomeContaLimpo)) {
                     totalAguaFiscal = val;
                     break;
                   }
                 }
               }
             }
          }
          return {
            ...conta,
            agua_fiscal_m3: totalAguaFiscal !== undefined ? totalAguaFiscal : null
          };
        });

        setData(dadosMesclados);
        const maisRecente = [...resConta].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0];
        if (maisRecente && maisRecente.created_at) {
          setUltimaAtualizacao(new Date(maisRecente.created_at).toLocaleDateString('pt-BR'));
        }
      }
    } catch (error) {
      console.error("Erro no cruzamento de dados:", error);
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

    const mesesUnicos = [...new Set(dadosFiltrados.map(d => d.mes_ano))].sort((a, b) => {
      const [mA, yA] = a.split('/').map(Number);
      const [mB, yB] = b.split('/').map(Number);
      return new Date(yA, mA - 1).getTime() - new Date(yB, mB - 1).getTime();
    });

    let diffFinanceiro = 0, diffAguaM3 = 0, diffEnergiaKwh = 0;
    let temBaseFinanceira = false, temBaseAgua = false, temBaseEnergia = false;
    let primeiroMesStr = '';
    let ultimoMesStr = '';

    if (mesesUnicos.length > 0) {
      primeiroMesStr = mesesUnicos[0];
      ultimoMesStr = mesesUnicos[mesesUnicos.length - 1];
    }

    if (mesesUnicos.length > 1) {
      const dadosPrimeiroMes = dadosFiltrados.filter(d => d.mes_ano === primeiroMesStr);
      const dadosUltimoMes = dadosFiltrados.filter(d => d.mes_ano === ultimoMesStr);

      const valPrimFinanceiro = dadosPrimeiroMes.reduce((acc, c) => acc + (Number(c.agua_valor) || 0) + (Number(c.energia_valor) || 0), 0);
      const valUltFinanceiro = dadosUltimoMes.reduce((acc, c) => acc + (Number(c.agua_valor) || 0) + (Number(c.energia_valor) || 0), 0);

      const valPrimAgua = dadosPrimeiroMes.reduce((acc, c) => acc + (Number(c.agua_qtde_m3) || 0), 0);
      const valUltAgua = dadosUltimoMes.reduce((acc, c) => acc + (Number(c.agua_qtde_m3) || 0), 0);

      const valPrimEnergia = dadosPrimeiroMes.reduce((acc, c) => acc + (Number(c.energia_qtde_kwh) || 0), 0);
      const valUltEnergia = dadosUltimoMes.reduce((acc, c) => acc + (Number(c.energia_qtde_kwh) || 0), 0);

      temBaseFinanceira = valPrimFinanceiro > 0;
      temBaseAgua = valPrimAgua > 0;
      temBaseEnergia = valPrimEnergia > 0;

      diffFinanceiro = temBaseFinanceira ? ((valUltFinanceiro - valPrimFinanceiro) / valPrimFinanceiro) * 100 : 0;
      diffAguaM3 = temBaseAgua ? ((valUltAgua - valPrimAgua) / valPrimAgua) * 100 : 0;
      diffEnergiaKwh = temBaseEnergia ? ((valUltEnergia - valPrimEnergia) / valPrimEnergia) * 100 : 0;
    }

    return { 
      atualFinanceiro, diffFinanceiro, economiaFinanceira: diffFinanceiro <= 0, temBaseFinanceira,
      atualAguaM3, diffAguaM3, economiaAgua: diffAguaM3 <= 0, temBaseAgua,
      atualEnergiaKwh, diffEnergiaKwh, economiaEnergia: diffEnergiaKwh <= 0, temBaseEnergia,
      primeiroMesStr, ultimoMesStr
    };
  }, [dadosFiltrados]);

  const exportarPDF = async () => {
    if (!dashboardRef.current) return;
    setGerandoPDF(true); // Muda o texto do botão

    try {
      const canvas = await html2canvas(dashboardRef.current, { scale: 2, useCORS: true });
      const pdf = new jsPDF('p', 'mm', 'a4');
      
      const pageWidth = pdf.internal.pageSize.getWidth();
      const marginX = 14; // Margem padrão (esquerda e direita)
      
      // ===== CABEÇALHO PROFISSIONAL DO PDF ===== //
      
      // Título
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(16);
      pdf.setTextColor(15, 23, 42); // slate-900
      pdf.text('Relatório de Consumo e Auditoria Física', marginX, 20);
      
      // Nome da Escola
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(12);
      pdf.setTextColor(71, 85, 105); // slate-600
      const nomeEscolaPDF = filtroEscola === 'todas' ? 'Rede Municipal (Visão Geral)' : filtroEscola;
      pdf.text(`Unidade Escolar: ${nomeEscolaPDF}`, marginX, 28);
      
      // Data de Emissão (Direita)
      const dataEmissao = new Date().toLocaleString('pt-BR');
      pdf.setFontSize(10);
      pdf.setTextColor(100, 116, 139); // slate-500
      pdf.text(`Data de emissão: ${dataEmissao}`, marginX, 34);

      // Linha Separadora Elegante
      pdf.setDrawColor(226, 232, 240); // slate-200
      pdf.setLineWidth(0.5);
      pdf.line(marginX, 38, pageWidth - marginX, 38);
      
      // ========================================== //

      // Ajusta a imagem abaixo do cabeçalho (posição Y: 44)
      const imgData = canvas.toDataURL('image/png');
      const imgWidth = pageWidth - (marginX * 2);
      const imgHeight = (canvas.height * imgWidth) / canvas.width;
      
      pdf.addImage(imgData, 'PNG', marginX, 44, imgWidth, imgHeight);
      pdf.save(`Auditoria_${nomeEscolaPDF.replace(/[^a-zA-Z0-9]/g, '_')}.pdf`);

    } catch (err) {
      console.error('Erro ao gerar PDF:', err);
    } finally {
      setGerandoPDF(false);
    }
  };

  if (loading) return <div className="p-20 text-center font-bold text-slate-400 animate-pulse">Cruzando dados de Contas e Auditoria Física...</div>;

  return (
    <div className="p-6 bg-[#F8FAFC] min-h-screen">
      
      {/* Cabeçalho */}
      <div className="mb-6 flex flex-col md:flex-row justify-between items-start md:items-end">
        <div>
          <h1 className="text-3xl font-black text-slate-800">Painel de Utilidades e Auditoria</h1>
          <div className="mt-2 inline-flex items-center gap-2 bg-white px-3 py-1.5 rounded-lg border border-slate-200 shadow-sm">
            <Database size={16} className="text-blue-500" />
            <span className="text-sm font-medium text-slate-600">
              Dados do Banco, atualizado em <strong className="text-slate-800">{ultimaAtualizacao}</strong>
            </span>
          </div>
        </div>
      </div>

      {/* Filtros */}
      <div className="bg-white p-5 rounded-3xl shadow-sm mb-8 flex flex-wrap items-center gap-6 border border-slate-100">
        <div className="flex items-center gap-2 text-blue-600 font-bold">
          <Filter size={20} /> Painel de Filtros
        </div>
        <select className="bg-slate-50 border-none rounded-xl px-4 py-2 text-sm focus:ring-2 ring-blue-500 min-w-[250px] outline-none" value={filtroEscola} onChange={e => setFiltroEscola(e.target.value)}>
          <option value="todas">Rede Municipal (Geral)</option>
          {[...new Set(data.map(d => d.nome_escola))].sort().map(e => <option key={e} value={e}>{e}</option>)}
        </select>
        <div className="flex items-center gap-2 bg-slate-50 px-4 py-2 rounded-xl text-sm">
          <Calendar size={16} className="text-slate-400" />
          <input type="month" value={dataInicio} onChange={e => setDataInicio(e.target.value)} className="bg-transparent border-none p-0 outline-none" />
          <span className="text-slate-300 mx-2">até</span>
          <input type="month" value={dataFim} onChange={e => setDataFim(e.target.value)} className="bg-transparent border-none p-0 outline-none" />
        </div>
        <button 
          onClick={exportarPDF} 
          disabled={gerandoPDF}
          className={`ml-auto text-white px-6 py-2 rounded-xl flex items-center gap-2 transition-all font-medium ${gerandoPDF ? 'bg-slate-600 cursor-not-allowed' : 'bg-slate-900 hover:bg-blue-600'}`}
        >
          <Download size={18} /> {gerandoPDF ? 'Gerando PDF...' : 'Exportar PDF'}
        </button>
      </div>

      <div ref={dashboardRef} className="space-y-8">
        {/* Alerta */}
        {!metricas.economiaFinanceira && metricas.temBaseFinanceira && filtroEscola !== 'todas' && (
          <div className="bg-rose-50 border-l-8 border-rose-500 p-6 rounded-[2rem] flex items-center gap-6">
            <div className="bg-rose-500 p-3 rounded-2xl text-white shadow-lg"><AlertTriangle size={30} /></div>
            <div>
              <h4 className="text-rose-900 font-black text-xl">Atenção Gestor!</h4>
              <p className="text-rose-700">Notamos um aumento de <strong>{metricas.diffFinanceiro.toFixed(1)}%</strong> nos custos no final deste período comparado ao mês inicial.</p>
            </div>
          </div>
        )}

        {/* Cards KPIs */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-slate-100 relative group flex flex-col justify-between">
            <div>
              <p className="text-slate-400 text-sm font-bold uppercase tracking-wider mb-2">Gasto no Período (R$)</p>
              <h2 className="text-3xl font-black text-slate-800">{metricas.atualFinanceiro.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</h2>
              <div className={`mt-4 inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-black ${!metricas.temBaseFinanceira ? 'bg-slate-100 text-slate-500' : metricas.economiaFinanceira ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>
                {!metricas.temBaseFinanceira ? <span>Filtre mais meses para evoluir</span> : <>{metricas.economiaFinanceira ? <TrendingDown size={14}/> : <TrendingUp size={14}/>} {Math.abs(metricas.diffFinanceiro).toFixed(1)}% vs Início</>}
              </div>
            </div>
            {metricas.primeiroMesStr && metricas.primeiroMesStr !== metricas.ultimoMesStr && <p className="mt-5 pt-3 border-t border-slate-100 text-[11px] text-slate-400">Comparando <strong>{metricas.ultimoMesStr}</strong> com <strong>{metricas.primeiroMesStr}</strong></p>}
          </div>

          <div className="bg-blue-600 p-8 rounded-[2.5rem] shadow-xl text-white relative flex flex-col justify-between">
            <div>
              <Droplets className="mb-4 opacity-50" size={32} />
              <p className="text-blue-100 text-sm font-bold uppercase mb-1">Volume de Água</p>
              <h2 className="text-4xl font-black">{metricas.atualAguaM3.toLocaleString('pt-BR')} <small className="text-lg">m³</small></h2>
              <div className={`mt-4 inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-black shadow-sm ${!metricas.temBaseAgua ? 'bg-blue-500 text-blue-100' : metricas.economiaAgua ? 'bg-white text-emerald-600' : 'bg-rose-500 text-white'}`}>
                {!metricas.temBaseAgua ? <span>Filtre mais meses para evoluir</span> : <>{metricas.economiaAgua ? <TrendingDown size={14}/> : <TrendingUp size={14}/>} {Math.abs(metricas.diffAguaM3).toFixed(1)}% de {metricas.economiaAgua ? 'Economia' : 'Aumento'}</>}
              </div>
            </div>
            {metricas.primeiroMesStr && metricas.primeiroMesStr !== metricas.ultimoMesStr && <p className="mt-5 pt-3 border-t border-blue-500/50 text-[11px] text-blue-200">Comparando <strong>{metricas.ultimoMesStr}</strong> com <strong>{metricas.primeiroMesStr}</strong></p>}
          </div>

          <div className="bg-amber-400 p-8 rounded-[2.5rem] shadow-xl text-amber-950 relative flex flex-col justify-between">
            <div>
              <Zap className="mb-4 opacity-50" size={32} />
              <p className="text-amber-900/60 text-sm font-bold uppercase mb-1">Consumo de Energia</p>
              <h2 className="text-4xl font-black">{metricas.atualEnergiaKwh.toLocaleString('pt-BR')} <small className="text-lg">kWh</small></h2>
              <div className={`mt-4 inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-black shadow-sm ${!metricas.temBaseEnergia ? 'bg-amber-500 text-amber-100' : metricas.economiaEnergia ? 'bg-white text-emerald-600' : 'bg-rose-500 text-white'}`}>
                {!metricas.temBaseEnergia ? <span>Filtre mais meses para evoluir</span> : <>{metricas.economiaEnergia ? <TrendingDown size={14}/> : <TrendingUp size={14}/>} {Math.abs(metricas.diffEnergiaKwh).toFixed(1)}% de {metricas.economiaEnergia ? 'Economia' : 'Aumento'}</>}
              </div>
            </div>
            {metricas.primeiroMesStr && metricas.primeiroMesStr !== metricas.ultimoMesStr && <p className="mt-5 pt-3 border-t border-amber-900/10 text-[11px] text-amber-900/60">Comparando <strong>{metricas.ultimoMesStr}</strong> com <strong>{metricas.primeiroMesStr}</strong></p>}
          </div>
        </div>

        {/* ÁREA DOS GRÁFICOS */}
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
                Linhas contínuas = Conta da Concessionária | <span className="border-b-2 border-dashed border-slate-400">Linha tracejada</span> = Soma do apontamento diário do Fiscal (Apenas Água)
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
                    formatter={(value: any, name: any) => {
                      if (value === null || value === undefined) return ['Não registrado pelo Fiscal', '📋 Água (Soma Leitura Fiscal)'];
                      if (name === 'agua_qtde_m3') return [`${Number(value).toLocaleString('pt-BR')} m³`, '💧 Água (Conta da Concessionária)'];
                      if (name === 'agua_fiscal_m3') return [`${Number(value).toLocaleString('pt-BR')} m³`, '📋 Água (Soma Leitura Fiscal)'];
                      if (name === 'energia_qtde_kwh') return [`${Number(value).toLocaleString('pt-BR')} kWh`, '⚡ Energia (Conta da Concessionária)'];
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
                <BarChart data={dadosFiltrados} margin={{ top: 10, right: 10, left: 10, bottom: 0 }} barGap={8}>
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
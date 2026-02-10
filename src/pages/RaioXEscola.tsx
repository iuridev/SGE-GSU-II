import { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { 
  Building2, Droplets, AlertTriangle,
  ShieldCheck, ArrowRightLeft, FileDown, 
  Loader2, MapPin, Hash, User, GraduationCap,
  ClipboardCheck,  Filter, LayoutGrid,
  ShoppingBag, Star, Package, History, 
  ArrowUpCircle, ZapOff 
} from 'lucide-react';

interface School {
  id: string;
  name: string;
  cie_code: string;
  sgi_code: string;
  fde_code: string;
  director_name: string;
  address: string;
  phone: string;
  email: string;
  has_elevator: boolean;
  is_elevator_operational: boolean;
}

const SERVICE_TYPES = ["LIMPEZA", "CUIDADOR", "MERENDA", "VIGILANTE", "TELEFONE"];

export function RaioXEscola() {
  const [schools, setSchools] = useState<School[]>([]);
  const [selectedSchoolId, setSelectedSchoolId] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [dataLoading, setDataLoading] = useState(false);
  const [exporting, setExporting] = useState(false);

  // Estados dos Dados Cruzados
  const [waterData, setWaterData] = useState<any[]>([]);
  const [demandsData, setDemandsData] = useState<any[]>([]);
  const [fiscalizationData, setFiscalizationData] = useState<any[]>([]);
  const [zeladoriaData, setZeladoriaData] = useState<any | null>(null);
  const [remanejamentoData, setRemanejamentoData] = useState<any[]>([]);
  const [acquisitionData, setAcquisitionData] = useState<any[]>([]);
  const [assetProcesses, setAssetProcesses] = useState<any[]>([]);
  
  // Ocorrências
  const [waterTruckRequests, setWaterTruckRequests] = useState<number>(0);
  const [powerOutageReports, setPowerOutageReports] = useState<number>(0);

  useEffect(() => {
    fetchSchools();
  }, []);

  useEffect(() => {
    if (selectedSchoolId) {
      fetchXRayData();
    }
  }, [selectedSchoolId]);

  async function fetchSchools() {
    setLoading(true);
    const { data } = await (supabase as any).from('schools').select('*').order('name');
    setSchools(data || []);
    setLoading(false);
  }

  async function fetchXRayData() {
    setDataLoading(true);
    const firstDayMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0];
    const firstDayYear = new Date(new Date().getFullYear(), 0, 1).toISOString();

    try {
      // 1. Água
      const { data: water } = await (supabase as any)
        .from('consumo_agua')
        .select('*')
        .eq('school_id', selectedSchoolId)
        .gte('date', firstDayMonth);
      setWaterData(water || []);

      // 2. Demandas
      const { data: demands } = await (supabase as any)
        .from('demands')
        .select('*')
        .eq('school_id', selectedSchoolId)
        .eq('status', 'PENDENTE');
      setDemandsData(demands || []);

      // 3. Fiscalização
      const { data: fisc } = await (supabase as any)
        .from('monitoring_submissions')
        .select(`
          rating,
          is_completed,
          is_dispensed,
          monitoring_events (
            service_type
          )
        `)
        .eq('school_id', selectedSchoolId);
      setFiscalizationData(fisc || []);

      // 4. Zeladoria
      const { data: zel } = await (supabase as any)
        .from('zeladorias')
        .select('*')
        .eq('school_id', selectedSchoolId)
        .maybeSingle();
      setZeladoriaData(zel || null);

      // 5. Remanejamento
      const { data: reman } = await (supabase as any)
        .from('inventory_items')
        .select('*')
        .eq('school_id', selectedSchoolId);
      setRemanejamentoData(reman || []);

      // 6. Aquisição
      const { data: acq } = await (supabase as any)
        .from('acquisition_responses')
        .select(`
          requested_qty, 
          planned_qty, 
          items:acquisition_items(code, name), 
          event:acquisition_events(title)
        `)
        .eq('school_id', selectedSchoolId);
      setAcquisitionData(acq || []);

      // 7. Processos de Patrimônio
      const { data: assetProcs } = await (supabase as any)
        .from('asset_processes')
        .select('*')
        .eq('school_id', selectedSchoolId)
        .not('status', 'eq', 'CONCLUÍDO');
      setAssetProcesses(assetProcs || []);

      // 8. Ocorrências
      const { count: wtCount } = await (supabase as any)
        .from('occurrences')
        .select('*', { count: 'exact', head: true })
        .eq('school_id', selectedSchoolId)
        .eq('type', 'WATER_TRUCK')
        .gte('created_at', firstDayYear);
      setWaterTruckRequests(wtCount || 0);

      const { count: poCount } = await (supabase as any)
        .from('occurrences')
        .select('*', { count: 'exact', head: true })
        .eq('school_id', selectedSchoolId)
        .eq('type', 'POWER_OUTAGE')
        .gte('created_at', firstDayYear);
      setPowerOutageReports(poCount || 0);

    } catch (err) {
      console.error(err);
    } finally {
      setDataLoading(false);
    }
  }

  const selectedSchool = schools.find(s => s.id === selectedSchoolId);

  const analysis = useMemo(() => {
    const today = new Date();
    const currentDay = today.getDate();
    const recordedDays = waterData.map(w => new Date(w.date + 'T12:00:00').getDate());
    const missingWaterDays: number[] = [];
    for (let i = 1; i <= currentDay; i++) {
      if (!recordedDays.includes(i)) missingWaterDays.push(i);
    }

    const overdueDemands = demandsData.filter(d => d.deadline < today.toISOString().split('T')[0]);

    const satisfactionPerService: Record<string, string> = {};
    SERVICE_TYPES.forEach(service => {
      const filtered = fiscalizationData.filter(f => 
        f.monitoring_events?.service_type === service && 
        f.is_completed && 
        f.rating !== null
      );
      if (filtered.length > 0) {
        const avg = filtered.reduce((acc, curr) => acc + curr.rating, 0) / filtered.length;
        satisfactionPerService[service] = avg.toFixed(1);
      } else {
        satisfactionPerService[service] = "N/D";
      }
    });

    const pendingFiscCount = fiscalizationData.filter(f => !f.is_completed && !f.is_dispensed).length;

    return {
      missingWaterDays,
      overdueDemands,
      pendingFisc: pendingFiscCount,
      activeAssetProcesses: assetProcesses.length,
      satisfactionPerService,
      isWaterCritical: missingWaterDays.length > 3 || waterData.some(w => w.limit_exceeded)
    };
  }, [waterData, demandsData, fiscalizationData, assetProcesses]);

  const handleExportPDF = async () => {
    setExporting(true);
    try {
      const loadScript = (src: string) => {
        return new Promise((resolve, reject) => {
          if (document.querySelector(`script[src="${src}"]`)) return resolve(true);
          const script = document.createElement('script');
          script.src = src;
          script.onload = resolve;
          script.onerror = reject;
          document.head.appendChild(script);
        });
      };
      await loadScript('https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js');

      const element = document.getElementById('xray-pdf-template');
      if (!element) throw new Error("Template não encontrado.");

      element.style.display = 'block';
      const opt = {
        margin: [10, 10, 10, 10],
        filename: `RAIO_X_${selectedSchool?.name?.replace(/\s+/g, '_')}.pdf`,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true, letterRendering: true },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
        pagebreak: { mode: ['css', 'legacy'] }
      };

      await (window as any).html2pdf().set(opt).from(element).save();
      element.style.display = 'none';
    } catch (err) {
      alert("Erro ao gerar PDF.");
    } finally {
      setExporting(false);
    }
  };

  if (loading) return <div className="flex items-center justify-center py-40"><Loader2 className="animate-spin text-indigo-600" size={48}/></div>;

  return (
    <div className="space-y-8 pb-20 relative">
      {/* Header com Seletor */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="flex items-center gap-4">
          <div className="p-4 bg-slate-900 rounded-[2rem] text-white shadow-2xl">
            <LayoutGrid size={32} />
          </div>
          <div>
            <h1 className="text-3xl font-black text-slate-900 tracking-tight uppercase leading-none">Raio-X da Escola</h1>
            <p className="text-slate-500 font-medium mt-1 uppercase text-xs tracking-widest">Painel de Auditoria 360º para Vistoria</p>
          </div>
        </div>

        <div className="flex gap-3">
          <div className="bg-white p-2 rounded-2xl border-2 border-slate-100 shadow-sm flex items-center gap-3 w-full md:w-80">
            <Filter size={18} className="text-slate-400 ml-2" />
            <select 
              className="w-full bg-transparent border-none outline-none font-bold text-slate-700 text-xs py-2 uppercase truncate"
              value={selectedSchoolId}
              onChange={(e) => setSelectedSchoolId(e.target.value)}
            >
              <option value="">Selecione a Unidade...</option>
              {schools.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          
          {selectedSchoolId && (
            <button 
              onClick={handleExportPDF}
              disabled={exporting || dataLoading}
              className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-4 rounded-2xl font-black flex items-center gap-3 shadow-xl transition-all active:scale-95 disabled:opacity-50 text-xs uppercase"
            >
              {exporting ? <Loader2 className="animate-spin" size={18}/> : <FileDown size={18} />}
              Ficha de Vistoria
            </button>
          )}
        </div>
      </div>

      {!selectedSchoolId ? (
        <div className="py-40 bg-white rounded-[3rem] border-2 border-dashed border-slate-100 flex flex-col items-center justify-center text-center">
           <Building2 size={64} className="text-slate-100 mb-4" />
           <h3 className="text-slate-400 font-black uppercase text-sm tracking-widest">Aguardando seleção de unidade escolar...</h3>
        </div>
      ) : dataLoading ? (
        <div className="py-40 flex flex-col items-center justify-center gap-4">
           <Loader2 className="animate-spin text-indigo-600" size={48} />
           <p className="text-xs font-black text-slate-400 uppercase tracking-widest">Escaneando base de dados...</p>
        </div>
      ) : (
        <div className="animate-in fade-in duration-500 space-y-8">
          
          {/* Identificação Rápida */}
          <div className="bg-white p-8 rounded-[3rem] border border-slate-100 shadow-xl flex flex-col md:flex-row gap-8 items-center">
             <div className="w-24 h-24 bg-indigo-50 rounded-3xl flex items-center justify-center text-indigo-600 shrink-0">
                <GraduationCap size={48} />
             </div>
             <div className="flex-1 text-center md:text-left">
                <h2 className="text-3xl font-black text-slate-900 uppercase tracking-tight">{selectedSchool?.name}</h2>
                <div className="flex flex-wrap gap-4 mt-2 justify-center md:justify-start">
                   <div className="flex items-center gap-2 text-xs font-bold text-slate-400"><Hash size={14}/> CIE: {selectedSchool?.cie_code}</div>
                   <div className="flex items-center gap-2 text-xs font-bold text-slate-400"><MapPin size={14}/> {selectedSchool?.address}</div>
                   <div className="flex items-center gap-2 text-xs font-bold text-indigo-500 uppercase"><User size={14}/> Diretor: {selectedSchool?.director_name}</div>
                </div>
             </div>
          </div>

          {/* Cards de Status Crítico */}
          <div className={`grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-6 gap-4`}>
             <AuditCard 
                title="Consumo de Água" 
                status={analysis.missingWaterDays.length > 0 ? 'ALERT' : 'OK'}
                desc={analysis.missingWaterDays.length > 0 ? `${analysis.missingWaterDays.length} dias pendentes` : 'Tudo em dia'}
                icon={<Droplets size={20}/>}
                color="blue"
             />
             <AuditCard 
                title="Demandas Adm." 
                status={analysis.overdueDemands.length > 0 ? 'ALERT' : 'OK'}
                desc={analysis.overdueDemands.length > 0 ? `${analysis.overdueDemands.length} tarefas atrasadas` : 'Sem pendências'}
                icon={<AlertTriangle size={20}/>}
                color="red"
             />
             <AuditCard 
                title="Prazos Terc." 
                status={analysis.pendingFisc > 0 ? 'ALERT' : 'OK'}
                desc={analysis.pendingFisc > 0 ? `${analysis.pendingFisc} forms. pendentes` : 'Conformidade OK'}
                icon={<ClipboardCheck size={20}/>}
                color="amber"
             />
             <AuditCard 
                title="Processos Patrimônio" 
                status={analysis.activeAssetProcesses > 3 ? 'ALERT' : 'OK'}
                desc={`${analysis.activeAssetProcesses} fluxos ativos`}
                icon={<Package size={20}/>}
                color="indigo"
             />
             <AuditCard 
                title="Zeladoria" 
                status={zeladoriaData?.ocupada === 'CONCLUÍDO' ? 'OK' : 'INFO'}
                desc={zeladoriaData ? `${zeladoriaData.ocupada}` : 'Não registrado'}
                icon={<ShieldCheck size={20}/>}
                color="emerald"
             />
             {selectedSchool?.has_elevator && (
                <AuditCard 
                  title="Elevador" 
                  status={selectedSchool.is_elevator_operational ? 'OK' : 'ALERT'}
                  desc={selectedSchool.is_elevator_operational ? 'Operante' : 'Parado'}
                  icon={<ArrowUpCircle size={20}/>}
                  color={selectedSchool.is_elevator_operational ? 'emerald' : 'red'}
                />
             )}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
             <div className="space-y-6">
                {/* Ocorrências Emergenciais */}
                <section className="bg-white p-8 rounded-[3.5rem] border border-slate-100 shadow-xl overflow-hidden relative group">
                   <div className="absolute top-0 right-0 p-6 opacity-5 pointer-events-none"><History size={100} /></div>
                   <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest flex items-center gap-2 mb-6"><History size={18} className="text-blue-500"/> Histórico de Solicitações (Ano Atual)</h3>
                   <div className="grid grid-cols-2 gap-4">
                      <div className="p-5 bg-blue-50 rounded-3xl border border-blue-100 flex flex-col items-center justify-center text-center">
                         <div className="w-10 h-10 bg-white rounded-full flex items-center justify-center text-blue-600 shadow-sm mb-2"><Droplets size={20}/></div>
                         <h4 className="text-2xl font-black text-blue-800">{waterTruckRequests}</h4>
                         <p className="text-[9px] font-black text-blue-400 uppercase tracking-widest">Caminhão Pipa</p>
                      </div>
                      <div className="p-5 bg-amber-50 rounded-3xl border border-amber-100 flex flex-col items-center justify-center text-center">
                         <div className="w-10 h-10 bg-white rounded-full flex items-center justify-center text-amber-600 shadow-sm mb-2"><ZapOff size={20}/></div>
                         <h4 className="text-2xl font-black text-amber-800">{powerOutageReports}</h4>
                         <p className="text-[9px] font-black text-amber-400 uppercase tracking-widest">Queda Energia</p>
                      </div>
                   </div>
                </section>

                {/* Qualidade por Serviço */}
                <section className="bg-white p-8 rounded-[3.5rem] border border-slate-100 shadow-xl overflow-hidden relative">
                   <div className="absolute top-0 right-0 p-6 opacity-5 pointer-events-none"><Star size={100} /></div>
                   <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest flex items-center gap-2 mb-6"><Star size={18} className="text-amber-500" fill="currentColor"/> Qualidade dos Contratos</h3>
                   <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                      {SERVICE_TYPES.map(service => {
                         const val = analysis.satisfactionPerService[service];
                         const isNumeric = val !== "N/D";
                         return (
                            <div key={service} className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
                               <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest truncate">{service}</p>
                               <div className="flex items-end gap-1 mt-1">
                                  <span className={`text-xl font-black ${isNumeric && parseFloat(val) >= 8 ? 'text-emerald-600' : isNumeric && parseFloat(val) >= 5 ? 'text-amber-600' : 'text-slate-600'}`}>{val}</span>
                                  {isNumeric && <span className="text-[8px] font-bold text-slate-300 mb-1">/10</span>}
                               </div>
                            </div>
                         );
                      })}
                   </div>
                </section>

                {/* Processos Patrimoniais */}
                <section className="bg-white p-8 rounded-[3.5rem] border border-slate-100 shadow-xl">
                   <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest flex items-center gap-2 mb-6"><Package size={18} className="text-indigo-500"/> Processos Patrimoniais Ativos</h3>
                   {assetProcesses.length === 0 ? (
                      <div className="text-xs font-bold text-slate-400 bg-slate-50 p-4 rounded-2xl border border-slate-100 uppercase">Nenhum processo em trâmite.</div>
                   ) : (
                      <div className="space-y-3">
                         {assetProcesses.map(p => (
                            <div key={p.id} className="p-4 border-2 border-indigo-50 bg-white rounded-2xl flex justify-between items-center group hover:border-indigo-200 transition-all">
                               <div>
                                  <div className="flex items-center gap-2">
                                     <span className="text-[9px] font-black text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-md uppercase">SEI {p.sei_number}</span>
                                     <span className="text-[8px] font-bold text-slate-400 uppercase">{p.type.replace('_', ' ')}</span>
                                  </div>
                                  <p className="text-xs font-black text-slate-700 uppercase mt-2 flex items-center gap-2"><History size={12} className="text-indigo-400"/> {p.current_step}</p>
                               </div>
                               <div className="text-right">
                                  <div className={`text-[8px] font-black px-2 py-0.5 rounded-full uppercase ${p.status === 'CORREÇÃO' ? 'bg-red-50 text-red-600' : 'bg-slate-100 text-slate-500'}`}>{p.status}</div>
                                  <p className="text-[8px] font-bold text-slate-300 mt-1">{new Date(p.process_date + 'T12:00:00').toLocaleDateString()}</p>
                               </div>
                            </div>
                         ))}
                      </div>
                   )}
                </section>
             </div>

             <div className="space-y-6">
                {/* Aquisições FDE */}
                <section className="bg-white p-8 rounded-[3rem] border border-slate-100 shadow-xl">
                   <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest flex items-center gap-2 mb-6"><ShoppingBag size={18} className="text-emerald-500"/> Aquisições FDE</h3>
                   {acquisitionData.length === 0 ? (
                      <div className="text-xs font-bold text-slate-400 bg-slate-50 p-4 rounded-2xl border border-slate-100 uppercase">Sem pedidos de itens.</div>
                   ) : (
                      <div className="space-y-3">
                         {acquisitionData.slice(0, 5).map((a, idx) => (
                            <div key={idx} className="p-4 border-2 border-emerald-50 bg-white rounded-2xl flex justify-between items-center">
                               <div className="min-w-0 flex-1">
                                  <p className="text-[9px] font-black text-slate-400 uppercase leading-none truncate">{a.event?.title}</p>
                                  <p className="text-xs font-black text-slate-800 uppercase mt-1 truncate">{a.items?.name}</p>
                               </div>
                               <div className="text-right ml-4 shrink-0">
                                  <p className="text-[9px] font-black text-slate-400 uppercase tracking-tighter">P / PL</p>
                                  <p className="text-sm font-black text-emerald-600">{a.requested_qty} / {a.planned_qty}</p>
                               </div>
                            </div>
                         ))}
                      </div>
                   )}
                </section>

                {/* Água */}
                <section className="bg-white p-8 rounded-[3rem] border border-slate-100 shadow-xl">
                   <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest flex items-center gap-2 mb-6"><Droplets size={18} className="text-blue-500"/> Auditoria de Água (Mês Atual)</h3>
                   {analysis.missingWaterDays.length > 0 ? (
                      <div className="p-4 bg-red-50 border border-red-100 rounded-2xl mb-4">
                         <p className="text-[10px] font-black text-red-600 uppercase">Dias Pendentes no Sistema:</p>
                         <div className="flex flex-wrap gap-2 mt-2">
                            {analysis.missingWaterDays.map(d => <span key={d} className="w-8 h-8 bg-white border border-red-200 rounded-lg flex items-center justify-center text-xs font-black text-red-500">{d}</span>)}
                         </div>
                      </div>
                   ) : <div className="text-xs font-bold text-emerald-600 bg-emerald-50 p-4 rounded-2xl border border-emerald-100 uppercase">✓ Registros em dia.</div>}
                   
                   {waterData.filter(w => w.limit_exceeded).length > 0 && (
                      <div className="mt-4 space-y-2">
                         <p className="text-[10px] font-black text-amber-600 uppercase">Excessos:</p>
                         {waterData.filter(w => w.limit_exceeded).map(w => (
                            <div key={w.date} className="flex justify-between items-center p-3 bg-amber-50 rounded-xl border border-amber-100">
                               <span className="text-[10px] font-bold">{new Date(w.date + 'T12:00:00').toLocaleDateString()}</span>
                               <span className="text-[10px] font-black text-amber-700">+{w.consumption_diff.toFixed(2)} m³</span>
                            </div>
                         ))}
                      </div>
                   )}
                </section>

                {/* Demandas */}
                <section className="bg-white p-8 rounded-[3rem] border border-slate-100 shadow-xl">
                   <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest flex items-center gap-2 mb-6"><AlertTriangle size={18} className="text-red-500"/> Demandas Pendentes</h3>
                   {demandsData.length === 0 ? (
                      <div className="text-xs font-bold text-slate-400 bg-slate-50 p-4 rounded-2xl border border-slate-100 uppercase">Tudo em dia.</div>
                   ) : (
                      <div className="space-y-4">
                         {demandsData.map(d => {
                            const isOverdue = d.deadline < new Date().toISOString().split('T')[0];
                            return (
                               <div key={d.id} className={`p-4 rounded-2xl border-2 flex flex-col gap-2 ${isOverdue ? 'bg-red-50 border-red-100' : 'bg-white border-slate-100'}`}>
                                  <div className="flex justify-between items-start">
                                     <h4 className="text-xs font-black uppercase text-slate-800">{d.title}</h4>
                                     {isOverdue && <span className="text-[8px] font-black px-2 py-0.5 rounded-full bg-red-600 text-white animate-pulse">ATRASADO</span>}
                                  </div>
                                  <p className="text-[10px] font-black text-slate-400 uppercase mt-1">Prazo: {new Date(d.deadline + 'T12:00:00').toLocaleDateString()}</p>
                               </div>
                            );
                         })}
                      </div>
                   )}
                </section>

                <section className="bg-white p-8 rounded-[3rem] border border-slate-100 shadow-xl">
                   <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest flex items-center gap-2 mb-6"><ArrowRightLeft size={18} className="text-indigo-500"/> Patrimônio e Remanejamento</h3>
                   <div className="grid grid-cols-2 gap-4">
                      <div className="p-4 bg-indigo-50 rounded-2xl border border-indigo-100 text-center">
                         <p className="text-[9px] font-black text-indigo-400 uppercase">Ofertados</p>
                         <h4 className="text-xl font-black text-indigo-700">{remanejamentoData.filter(r => r.status === 'DISPONÍVEL').length}</h4>
                      </div>
                      <div className="p-4 bg-emerald-50 rounded-2xl border border-emerald-100 text-center">
                         <p className="text-[9px] font-black text-emerald-400 uppercase">Transferidos</p>
                         <h4 className="text-xl font-black text-emerald-700">{remanejamentoData.filter(r => r.status === 'REMANEJADO').length}</h4>
                      </div>
                   </div>
                </section>
             </div>
          </div>
        </div>
      )}

      {/* --- TEMPLATE PARA PDF (OCULTO) --- */}
      {selectedSchool && (
        <div id="xray-pdf-template" style={{ display: 'none', background: 'white', width: '750px', padding: '40px', fontFamily: 'sans-serif' }}>
          <div style={{ borderBottom: '6px solid #1e293b', paddingBottom: '20px', marginBottom: '30px' }}>
              <table style={{ width: '100%' }}>
                  <tbody>
                    <tr>
                        <td>
                            <h1 style={{ margin: 0, fontSize: '24px', fontWeight: 900, color: '#0f172a' }}>FICHA ESTRATÉGICA DE VISTORIA</h1>
                            <p style={{ margin: 0, fontSize: '10px', color: '#64748b', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '2px' }}>Relatório Consolidado de Inteligência Regional</p>
                        </td>
                        <td style={{ textAlign: 'right' }}>
                            <div style={{ background: '#ef4444', color: 'white', padding: '5px 15px', borderRadius: '8px', fontWeight: 900, fontSize: '10px', display: 'inline-block' }}>CONFIDENCIAL / ADMIN</div>
                            <p style={{ margin: '5px 0 0', fontWeight: 900, fontSize: '12px' }}>{new Date().toLocaleDateString()}</p>
                        </td>
                    </tr>
                  </tbody>
              </table>
          </div>

          <div style={{ background: '#f1f5f9', padding: '20px', borderRadius: '15px', marginBottom: '30px' }}>
              <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 900, color: '#1e293b', textTransform: 'uppercase' }}>{selectedSchool.name}</h2>
              <p style={{ margin: '5px 0 0', fontSize: '11px', color: '#64748b', fontWeight: 700 }}>CIE: {selectedSchool.cie_code} | Diretor(a): {selectedSchool.director_name}</p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '15px', marginBottom: '30px' }}>
             <div style={{ border: '1px solid #e2e8f0', padding: '15px', borderRadius: '15px' }}>
                <h4 style={{ margin: '0 0 10px 0', fontSize: '9px', fontWeight: 900, color: '#ef4444', textTransform: 'uppercase' }}>⚠️ Ocorrências Ano</h4>
                <p style={{ margin: 0, fontSize: '11px', fontWeight: 700 }}>Pipa: {waterTruckRequests} | Energia: {powerOutageReports}</p>
             </div>
             <div style={{ border: '1px solid #e2e8f0', padding: '15px', borderRadius: '15px' }}>
                <h4 style={{ margin: '0 0 10px 0', fontSize: '9px', fontWeight: 900, color: '#4f46e5', textTransform: 'uppercase' }}>📋 Patrimônio</h4>
                <p style={{ margin: 0, fontSize: '11px', fontWeight: 700 }}>{analysis.activeAssetProcesses} processos SEI.</p>
             </div>
             <div style={{ border: '1px solid #e2e8f0', padding: '15px', borderRadius: '15px' }}>
                <h4 style={{ margin: '0 0 10px 0', fontSize: '9px', fontWeight: 900, color: '#059669', textTransform: 'uppercase' }}>✅ Zeladoria</h4>
                <p style={{ margin: 0, fontSize: '11px', fontWeight: 700 }}>{zeladoriaData?.ocupada || 'N/A'}</p>
             </div>
          </div>

          <div style={{ marginBottom: '30px' }}>
              <h3 style={{ fontSize: '12px', fontWeight: 900, color: '#1e293b', textTransform: 'uppercase', borderBottom: '2px solid #f1f5f9', paddingBottom: '8px', marginBottom: '15px' }}>Auditoria de Consumo de Água (Mês Atual)</h3>
              {analysis.missingWaterDays.length > 0 ? (
                <div style={{ padding: '15px', background: '#fef2f2', borderRadius: '10px', border: '1px solid #fee2e2', marginBottom: '15px' }}>
                  <p style={{ margin: 0, fontSize: '10px', fontWeight: 900, color: '#b91c1c', textTransform: 'uppercase' }}>DIAS SEM REGISTRO NO SISTEMA:</p>
                  <p style={{ margin: '5px 0 0', fontSize: '12px', fontWeight: 800, color: '#7f1d1d', letterSpacing: '1px' }}>
                    {analysis.missingWaterDays.join(', ')}
                  </p>
                </div>
              ) : (
                <p style={{ fontSize: '11px', color: '#059669', fontWeight: 700, marginBottom: '15px' }}>✓ Todos os registros de consumo foram realizados corretamente.</p>
              )}

              {waterData.filter(w => w.limit_exceeded).length > 0 && (
                <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '10px' }}>
                    <thead>
                        <tr style={{ background: '#fffbeb' }}>
                            <th style={{ padding: '10px', border: '1px solid #fde68a', fontSize: '9px', textAlign: 'left', fontWeight: 900 }}>DATA DO ALERTA</th>
                            <th style={{ padding: '10px', border: '1px solid #fde68a', fontSize: '9px', textAlign: 'center', fontWeight: 900 }}>EXCESSO DETECTADO</th>
                        </tr>
                    </thead>
                    <tbody>
                        {waterData.filter(w => w.limit_exceeded).map((w, idx) => (
                            <tr key={idx}>
                                <td style={{ padding: '8px', border: '1px solid #fde68a', fontSize: '10px', fontWeight: 700 }}>{new Date(w.date + 'T12:00:00').toLocaleDateString('pt-BR')}</td>
                                <td style={{ padding: '8px', border: '1px solid #fde68a', fontSize: '10px', textAlign: 'center', fontWeight: 900, color: '#b45309' }}>+{w.consumption_diff.toFixed(2)} m³</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
              )}
          </div>

          <div style={{ marginBottom: '30px' }}>
              <h3 style={{ fontSize: '12px', fontWeight: 900, color: '#1e293b', textTransform: 'uppercase', borderBottom: '2px solid #f1f5f9', paddingBottom: '8px', marginBottom: '15px' }}>Demandas Administrativas Pendentes</h3>
              {demandsData.length === 0 ? <p style={{ fontSize: '11px', color: '#94a3b8' }}>Nenhuma pendência administrativa em aberto.</p> : (
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                        <tr style={{ background: '#f8fafc' }}>
                            <th style={{ padding: '10px', border: '1px solid #e2e8f0', fontSize: '9px', textAlign: 'left' }}>TÍTULO DA DEMANDA</th>
                            <th style={{ padding: '10px', border: '1px solid #e2e8f0', fontSize: '9px', textAlign: 'center' }}>PRAZO</th>
                        </tr>
                    </thead>
                    <tbody>
                        {demandsData.map(d => (
                            <tr key={d.id}>
                                <td style={{ padding: '8px', border: '1px solid #e2e8f0', fontSize: '10px', fontWeight: 700 }}>{d.title}</td>
                                <td style={{ padding: '8px', border: '1px solid #e2e8f0', fontSize: '10px', textAlign: 'center', color: d.deadline < new Date().toISOString() ? '#ef4444' : '#1e293b' }}>{new Date(d.deadline + 'T12:00:00').toLocaleDateString()}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
              )}
          </div>

          {selectedSchool.has_elevator && (
            <div style={{ marginBottom: '30px' }}>
                <h3 style={{ fontSize: '12px', fontWeight: 900, color: '#1e293b', textTransform: 'uppercase', borderBottom: '2px solid #f1f5f9', paddingBottom: '8px', marginBottom: '15px' }}>Condição de Acessibilidade (Elevador)</h3>
                <div style={{ 
                  padding: '15px', 
                  borderRadius: '10px', 
                  background: selectedSchool.is_elevator_operational ? '#ecfdf5' : '#fef2f2',
                  border: `1px solid ${selectedSchool.is_elevator_operational ? '#a7f3d0' : '#fee2e2'}`
                }}>
                   <p style={{ margin: 0, fontSize: '11px', fontWeight: 900, color: selectedSchool.is_elevator_operational ? '#065f46' : '#b91c1c' }}>
                      STATUS: {selectedSchool.is_elevator_operational ? 'EQUIPAMENTO OPERANTE' : 'EQUIPAMENTO PARADO / EM MANUTENÇÃO'}
                   </p>
                </div>
            </div>
          )}

          <div style={{ marginBottom: '30px' }}>
              <h3 style={{ fontSize: '12px', fontWeight: 900, color: '#1e293b', textTransform: 'uppercase', borderBottom: '2px solid #f1f5f9', paddingBottom: '8px', marginBottom: '15px' }}>Processos Patrimoniais Pendentes (SEI)</h3>
              {assetProcesses.length === 0 ? <p style={{ fontSize: '11px', color: '#94a3b8' }}>Nenhum processo pendente identificado.</p> : (
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                        <tr style={{ background: '#f8fafc' }}>
                            <th style={{ padding: '10px', border: '1px solid #e2e8f0', fontSize: '9px', textAlign: 'left' }}>PROCESSO / TIPO</th>
                            <th style={{ padding: '10px', border: '1px solid #e2e8f0', fontSize: '9px', textAlign: 'left' }}>ETAPA ATUAL</th>
                            <th style={{ padding: '10px', border: '1px solid #e2e8f0', fontSize: '9px', textAlign: 'center' }}>DATA</th>
                        </tr>
                    </thead>
                    <tbody>
                        {assetProcesses.map((p) => (
                            <tr key={p.id}>
                                <td style={{ padding: '8px', border: '1px solid #e2e8f0', fontSize: '10px', fontWeight: 700 }}>SEI {p.sei_number}<br/><small style={{color:'#64748b'}}>{p.type.replace('_', ' ')}</small></td>
                                <td style={{ padding: '8px', border: '1px solid #e2e8f0', fontSize: '10px', fontWeight: 800 }}>{p.current_step}</td>
                                <td style={{ padding: '8px', border: '1px solid #e2e8f0', fontSize: '10px', textAlign: 'center' }}>{new Date(p.process_date + 'T12:00:00').toLocaleDateString()}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
              )}
          </div>

          <div style={{ marginBottom: '30px' }}>
              <h3 style={{ fontSize: '12px', fontWeight: 900, color: '#1e293b', textTransform: 'uppercase', borderBottom: '2px solid #f1f5f9', paddingBottom: '8px', marginBottom: '15px' }}>Solicitações de Itens (Aquisição FDE)</h3>
              {acquisitionData.length === 0 ? <p style={{ fontSize: '11px', color: '#94a3b8' }}>Nenhum item solicitado pela unidade.</p> : (
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                        <tr style={{ background: '#f8fafc' }}>
                            <th style={{ padding: '10px', border: '1px solid #e2e8f0', fontSize: '9px', textAlign: 'left' }}>EQUIPAMENTO / CÓDIGO</th>
                            <th style={{ padding: '10px', border: '1px solid #e2e8f0', fontSize: '9px', textAlign: 'center' }}>PEDIDA</th>
                            <th style={{ padding: '10px', border: '1px solid #e2e8f0', fontSize: '9px', textAlign: 'center' }}>PLANEJADO</th>
                        </tr>
                    </thead>
                    <tbody>
                        {acquisitionData.map((a, idx) => (
                            <tr key={idx}>
                                <td style={{ padding: '8px', border: '1px solid #e2e8f0', fontSize: '10px', fontWeight: 700 }}>{a.items?.name} <br/><small style={{color:'#64748b'}}>{a.items?.code}</small></td>
                                <td style={{ padding: '8px', border: '1px solid #e2e8f0', fontSize: '10px', textAlign: 'center' }}>{a.requested_qty}</td>
                                <td style={{ padding: '8px', border: '1px solid #e2e8f0', fontSize: '10px', textAlign: 'center', fontWeight: 900, color: '#059669' }}>{a.planned_qty}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
              )}
          </div>

          <div style={{ marginBottom: '30px' }}>
              <h3 style={{ fontSize: '12px', fontWeight: 900, color: '#1e293b', textTransform: 'uppercase', borderBottom: '2px solid #f1f5f9', paddingBottom: '8px', marginBottom: '15px' }}>Qualidade Percebida nos Serviços</h3>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                      <tr style={{ background: '#f8fafc' }}>
                          <th style={{ padding: '10px', border: '1px solid #e2e8f0', fontSize: '9px', textAlign: 'left' }}>CONTRATO</th>
                          <th style={{ padding: '10px', border: '1px solid #e2e8f0', fontSize: '9px', textAlign: 'center' }}>NOTA GSU</th>
                      </tr>
                  </thead>
                  <tbody>
                      {SERVICE_TYPES.map(service => (
                          <tr key={service}>
                              <td style={{ padding: '8px', border: '1px solid #e2e8f0', fontSize: '10px', fontWeight: 700 }}>{service}</td>
                              <td style={{ padding: '8px', border: '1px solid #e2e8f0', fontSize: '10px', textAlign: 'center', fontWeight: 900 }}>{analysis.satisfactionPerService[service]}</td>
                          </tr>
                      ))}
                  </tbody>
              </table>
          </div>

          <div style={{ marginTop: 'auto', paddingTop: '40px', textAlign: 'center', borderTop: '1px dashed #cbd5e1' }}>
              <p style={{ fontSize: '9px', color: '#94a3b8', fontWeight: 900, letterSpacing: '4px' }}>RELATÓRIO GERADO PARA USO EXCLUSIVO DA EQUIPE TÉCNICA REGIONAL</p>
          </div>
        </div>
      )}
    </div>
  );
}

function AuditCard({ title, status, desc, icon, color }: any) {
  const colors: any = {
    blue: "bg-blue-50 text-blue-600 border-blue-100",
    red: "bg-red-50 text-red-600 border-red-100",
    amber: "bg-amber-50 text-amber-600 border-amber-100",
    emerald: "bg-emerald-50 text-emerald-600 border-emerald-100",
    indigo: "bg-indigo-50 text-indigo-600 border-indigo-100"
  };

  return (
    <div className={`bg-white p-6 rounded-[2rem] border-2 transition-all shadow-xl hover:-translate-y-1 ${status === 'ALERT' ? 'border-red-300 ring-4 ring-red-50' : 'border-slate-100'}`}>
       <div className="flex justify-between items-start mb-4">
          <div className={`p-3 rounded-2xl ${colors[color]}`}>{icon}</div>
          {status === 'ALERT' && <div className="w-3 h-3 bg-red-500 rounded-full animate-ping"></div>}
       </div>
       <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{title}</p>
       <h4 className={`text-sm font-black mt-1 uppercase ${status === 'ALERT' ? 'text-red-600' : 'text-slate-700'}`}>{desc}</h4>
    </div>
  );
}

export default RaioXEscola;
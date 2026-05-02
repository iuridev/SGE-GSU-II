import { useState, useEffect, useMemo } from 'react';
import Papa from 'papaparse';
import { supabase } from '../lib/supabase';
import {
  Building2,
  Droplets,
  AlertTriangle,
  ShieldCheck,
  ArrowRightLeft,
  FileDown,
  Loader2,
  MapPin,
  Hash,
  User,
  GraduationCap,
  ClipboardCheck,
  Filter,
  LayoutGrid,
  ShoppingBag,
  Star,
  Package,
  History,
  ArrowUpCircle
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

const SERVICE_TYPES = ['LIMPEZA', 'CUIDADOR', 'MERENDA', 'VIGILANTE', 'TELEFONE'];

const SHEET_AVCB_URL =
  'https://docs.google.com/spreadsheets/d/1AaxxhCNUYJwI4xgsGsAmFkk0VDMoKIN0fpYjHmfSof8/gviz/tq?tqx=out:csv&sheet=avcb';

const normalizeText = (value: any) =>
  String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/_/g, '')
    .replace(/\s+/g, '')
    .trim();

const normalizeCode = (value: any) =>
  String(value || '')
    .replace(/\D/g, '')
    .trim();

export function RaioXEscola() {
  const [schools, setSchools] = useState<School[]>([]);
  const [selectedSchoolId, setSelectedSchoolId] = useState('');
  const [loading, setLoading] = useState(true);
  const [dataLoading, setDataLoading] = useState(false);
  const [exporting, setExporting] = useState(false);

  const [waterData, setWaterData] = useState<any[]>([]);
  const [demandsData, setDemandsData] = useState<any[]>([]);
  const [fiscalizationData, setFiscalizationData] = useState<any[]>([]);
  const [zeladoriaData, setZeladoriaData] = useState<any | null>(null);
  const [remanejamentoData, setRemanejamentoData] = useState<any[]>([]);
  const [acquisitionData, setAcquisitionData] = useState<any[]>([]);
  const [assetProcesses, setAssetProcesses] = useState<any[]>([]);

  const [waterTruckRequests, setWaterTruckRequests] = useState(0);
  const [powerOutageReports, setPowerOutageReports] = useState(0);

  const [avcbData, setAvcbData] = useState<any | null>(null);
  const [avcbLoading, setAvcbLoading] = useState(false);

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

    const { data } = await (supabase as any)
      .from('schools')
      .select('*')
      .order('name');

    setSchools(data || []);
    setLoading(false);
  }

  function fetchAvcbForSchool(school: School) {
    if (!school?.fde_code) {
      setAvcbData(null);
      return;
    }

    setAvcbLoading(true);

    Papa.parse(SHEET_AVCB_URL, {
      download: true,
      header: true,
      skipEmptyLines: true,
      transformHeader: normalizeText,

      complete: (results) => {
        const rows = results.data as any[];
        const schoolFde = normalizeCode(school.fde_code);

        const found = rows.find((row) => {
          const codigo = normalizeCode(
            row.codigofde ||
              row.codigo ||
              row.fde ||
              row.codigoescola ||
              row.codigodaescola
          );

          return codigo === schoolFde;
        });

        setAvcbData(found || null);
        setAvcbLoading(false);
      },

      error: (error) => {
        console.error('Erro ao carregar AVCB:', error);
        setAvcbData(null);
        setAvcbLoading(false);
      }
    });
  }

  async function fetchXRayData() {
    setDataLoading(true);

    const selected = schools.find((s) => s.id === selectedSchoolId);
    if (selected) fetchAvcbForSchool(selected);

    const firstDayMonth = new Date(
      new Date().getFullYear(),
      new Date().getMonth(),
      1
    )
      .toISOString()
      .split('T')[0];

    const firstDayYear = new Date(new Date().getFullYear(), 0, 1).toISOString();

    try {
      const { data: water } = await (supabase as any)
        .from('consumo_agua')
        .select('*')
        .eq('school_id', selectedSchoolId)
        .gte('date', firstDayMonth);

      setWaterData(water || []);

      const { data: demands } = await (supabase as any)
        .from('demands')
        .select('*')
        .eq('school_id', selectedSchoolId)
        .eq('status', 'PENDENTE');

      setDemandsData(demands || []);

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

      const { data: zel } = await (supabase as any)
        .from('zeladorias')
        .select('*')
        .eq('school_id', selectedSchoolId)
        .maybeSingle();

      setZeladoriaData(zel || null);

      const { data: reman } = await (supabase as any)
        .from('inventory_items')
        .select('*')
        .eq('school_id', selectedSchoolId);

      setRemanejamentoData(reman || []);

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

      const { data: assetProcs } = await (supabase as any)
        .from('asset_processes')
        .select('*')
        .eq('school_id', selectedSchoolId)
        .not('status', 'eq', 'CONCLUÍDO');

      setAssetProcesses(assetProcs || []);

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

  const selectedSchool = schools.find((s) => s.id === selectedSchoolId);

  const avcbDescription = useMemo(() => {
    if (avcbLoading) return 'Carregando...';
    if (!avcbData) return 'Sem Informação';

    if (avcbData.validade && avcbData.validade !== '-') {
      return `Válido até ${avcbData.validade}`;
    }

    return avcbData.statuscontr || avcbData.status || avcbData.fase || 'Com informação';
  }, [avcbData, avcbLoading]);

  const analysis = useMemo(() => {
    const today = new Date();
    const currentDay = today.getDate();

    const recordedDays = waterData.map((w: any) =>
      new Date(w.date + 'T12:00:00').getDate()
    );

    const missingWaterDays: number[] = [];

    for (let i = 1; i <= currentDay; i++) {
      if (!recordedDays.includes(i)) missingWaterDays.push(i);
    }

    const overdueDemands = demandsData.filter(
      (d: any) => d.deadline < today.toISOString().split('T')[0]
    );

    const satisfactionPerService: Record<string, string> = {};

    SERVICE_TYPES.forEach((service) => {
      const filtered = fiscalizationData.filter(
        (f: any) =>
          f.monitoring_events?.service_type === service &&
          f.is_completed &&
          f.rating !== null
      );

      if (filtered.length > 0) {
        const avg =
          filtered.reduce((acc: number, curr: any) => acc + curr.rating, 0) /
          filtered.length;

        satisfactionPerService[service] = avg.toFixed(1);
      } else {
        satisfactionPerService[service] = 'N/D';
      }
    });

    const pendingFiscCount = fiscalizationData.filter(
      (f: any) => !f.is_completed && !f.is_dispensed
    ).length;

    return {
      missingWaterDays,
      overdueDemands,
      pendingFisc: pendingFiscCount,
      activeAssetProcesses: assetProcesses.length,
      satisfactionPerService,
      isWaterCritical:
        missingWaterDays.length > 3 ||
        waterData.some((w: any) => w.limit_exceeded)
    };
  }, [waterData, demandsData, fiscalizationData, assetProcesses]);

  const handleExportPDF = async () => {
    setExporting(true);

    try {
      const loadScript = (src: string) => {
        return new Promise((resolve, reject) => {
          if (document.querySelector(`script[src="${src}"]`)) {
            return resolve(true);
          }

          const script = document.createElement('script');
          script.src = src;
          script.onload = resolve;
          script.onerror = reject;
          document.head.appendChild(script);
        });
      };

      await loadScript(
        'https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js'
      );

      const element = document.getElementById('xray-pdf-template');

      if (!element) throw new Error('Template não encontrado.');

      element.style.display = 'block';

      const opt = {
        margin: [10, 10, 10, 10],
        filename: `RAIO_X_${selectedSchool?.name?.replace(/\s+/g, '_')}.pdf`,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: {
          scale: 2,
          useCORS: true,
          letterRendering: true
        },
        jsPDF: {
          unit: 'mm',
          format: 'a4',
          orientation: 'portrait'
        },
        pagebreak: {
          mode: ['css', 'legacy']
        }
      };

      await (window as any).html2pdf().set(opt).from(element).save();

      element.style.display = 'none';
    } catch (err) {
      console.error(err);
      alert('Erro ao gerar PDF.');
    } finally {
      setExporting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="animate-spin text-blue-600" size={32} />
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-20">

      <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-6">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">

          <div>
            <h1 className="text-2xl font-black text-slate-900 uppercase tracking-tight flex items-center gap-2">
              <LayoutGrid className="text-blue-600" />
              Raio-X da Escola
            </h1>

            <p className="text-slate-500 text-sm font-medium mt-1">
              Painel de Auditoria 360º para Vistoria
            </p>
          </div>

          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative min-w-[300px]">
              <Filter
                size={18}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
              />

              <select
                value={selectedSchoolId}
                onChange={(e) => setSelectedSchoolId(e.target.value)}
                className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Selecione a Unidade...</option>

                {schools.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>

            {selectedSchoolId && (
              <button
                onClick={handleExportPDF}
                disabled={exporting}
                className="bg-slate-900 text-white px-5 py-3 rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-slate-800 transition-all disabled:opacity-50"
              >
                {exporting ? (
                  <Loader2 className="animate-spin" size={18} />
                ) : (
                  <FileDown size={18} />
                )}
                Ficha de Vistoria
              </button>
            )}
          </div>
        </div>
      </div>

      {!selectedSchoolId ? (
        <div className="bg-white rounded-3xl border border-dashed border-slate-200 p-16 text-center">
          <Building2 size={48} className="mx-auto text-slate-300 mb-4" />
          <h3 className="text-lg font-black text-slate-500 uppercase">
            Aguardando seleção de unidade escolar...
          </h3>
        </div>
      ) : dataLoading ? (
        <div className="bg-white rounded-3xl border border-slate-100 p-16 text-center">
          <Loader2 size={40} className="animate-spin mx-auto text-blue-600 mb-4" />
          <h3 className="text-lg font-black text-slate-700 uppercase">
            Escaneando base de dados...
          </h3>
        </div>
      ) : (
        <>
          <div className="bg-slate-900 rounded-3xl p-6 text-white shadow-xl">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
              <div>
                <h2 className="text-2xl font-black uppercase">
                  {selectedSchool?.name}
                </h2>

                <div className="flex flex-wrap gap-4 mt-3 text-sm text-slate-300">
                  <span className="flex items-center gap-1">
                    <Hash size={14} />
                    CIE: {selectedSchool?.cie_code}
                  </span>

                  <span className="flex items-center gap-1">
                    <MapPin size={14} />
                    {selectedSchool?.address}
                  </span>

                  <span className="flex items-center gap-1">
                    <User size={14} />
                    Diretor: {selectedSchool?.director_name}
                  </span>
                </div>
              </div>

              <div className="bg-white/10 rounded-2xl p-4 text-center">
                <GraduationCap className="mx-auto mb-1" />
                <p className="text-xs font-bold uppercase text-slate-300">
                  Código FDE
                </p>
                <p className="text-xl font-black">{selectedSchool?.fde_code}</p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
            <AuditCard
              title="Água"
              status={analysis.missingWaterDays.length > 0 ? 'ALERT' : 'OK'}
              desc={
                analysis.missingWaterDays.length > 0
                  ? `${analysis.missingWaterDays.length} dias pendentes`
                  : 'Tudo em dia'
              }
              icon={<Droplets />}
              color="blue"
            />

            <AuditCard
              title="Demandas"
              status={analysis.overdueDemands.length > 0 ? 'ALERT' : 'OK'}
              desc={
                analysis.overdueDemands.length > 0
                  ? `${analysis.overdueDemands.length} tarefas atrasadas`
                  : 'Sem pendências'
              }
              icon={<AlertTriangle />}
              color="red"
            />

            <AuditCard
              title="Fiscalização"
              status={analysis.pendingFisc > 0 ? 'ALERT' : 'OK'}
              desc={
                analysis.pendingFisc > 0
                  ? `${analysis.pendingFisc} forms. pendentes`
                  : 'Conformidade OK'
              }
              icon={<ClipboardCheck />}
              color="amber"
            />

            <AuditCard
              title="Patrimônio"
              status={analysis.activeAssetProcesses > 3 ? 'ALERT' : 'OK'}
              desc={`${analysis.activeAssetProcesses} fluxos ativos`}
              icon={<Package />}
              color="indigo"
            />

            <AuditCard
              title="AVCB"
              status={avcbData ? 'OK' : 'ALERT'}
              desc={avcbDescription}
              icon={<ShieldCheck />}
              color={avcbData ? 'emerald' : 'amber'}
            />

            {selectedSchool?.has_elevator && (
              <AuditCard
                title="Elevador"
                status={selectedSchool.is_elevator_operational ? 'OK' : 'ALERT'}
                desc={
                  selectedSchool.is_elevator_operational
                    ? 'Operante'
                    : 'Parado / Manutenção'
                }
                icon={<ArrowUpCircle />}
                color={selectedSchool.is_elevator_operational ? 'emerald' : 'red'}
              />
            )}
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">

            <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-6">
              <h3 className="font-black text-slate-800 uppercase text-sm flex items-center gap-2 mb-4">
                <History size={18} className="text-blue-600" />
                Histórico de Solicitações
              </h3>

              <div className="grid grid-cols-2 gap-4">
                <div className="bg-blue-50 rounded-2xl p-4 text-center">
                  <h4 className="text-2xl font-black text-blue-700">
                    {waterTruckRequests}
                  </h4>
                  <p className="text-[10px] font-black text-blue-500 uppercase">
                    Caminhão Pipa
                  </p>
                </div>

                <div className="bg-red-50 rounded-2xl p-4 text-center">
                  <h4 className="text-2xl font-black text-red-700">
                    {powerOutageReports}
                  </h4>
                  <p className="text-[10px] font-black text-red-500 uppercase">
                    Queda Energia
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-6 xl:col-span-2">
              <h3 className="font-black text-slate-800 uppercase text-sm flex items-center gap-2 mb-4">
                <Star size={18} className="text-amber-500" />
                Qualidade dos Contratos
              </h3>

              <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                {SERVICE_TYPES.map((service) => {
                  const val = analysis.satisfactionPerService[service];
                  const isNumeric = val !== 'N/D';

                  return (
                    <div key={service} className="bg-slate-50 rounded-2xl p-4 text-center">
                      <p className="text-[10px] font-black text-slate-400 uppercase">
                        {service}
                      </p>

                      <p
                        className={`text-xl font-black ${
                          isNumeric && parseFloat(val) >= 8
                            ? 'text-emerald-600'
                            : isNumeric && parseFloat(val) >= 5
                            ? 'text-amber-600'
                            : 'text-slate-600'
                        }`}
                      >
                        {val}
                        {isNumeric && <span className="text-xs">/10</span>}
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">

            <SectionCard title="Processos Patrimoniais Ativos" icon={<Package size={18} />}>
              {assetProcesses.length === 0 ? (
                <p className="text-sm font-bold text-slate-400">
                  Nenhum processo em trâmite.
                </p>
              ) : (
                <div className="space-y-3">
                  {assetProcesses.map((p: any) => (
                    <div key={p.id} className="bg-slate-50 rounded-2xl p-4">
                      <p className="font-black text-slate-800 text-sm">
                        SEI {p.sei_number} — {p.type?.replace('_', ' ')}
                      </p>
                      <p className="text-xs text-slate-500 mt-1">
                        {p.current_step}
                      </p>
                      <div className="flex justify-between mt-2 text-[10px] font-black uppercase text-slate-400">
                        <span>{p.status}</span>
                        <span>
                          {p.process_date
                            ? new Date(p.process_date + 'T12:00:00').toLocaleDateString()
                            : '-'}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </SectionCard>

            <SectionCard title="Aquisições FDE" icon={<ShoppingBag size={18} />}>
              {acquisitionData.length === 0 ? (
                <p className="text-sm font-bold text-slate-400">
                  Sem pedidos de itens.
                </p>
              ) : (
                <div className="space-y-3">
                  {acquisitionData.slice(0, 5).map((a: any, idx: number) => (
                    <div key={idx} className="bg-slate-50 rounded-2xl p-4">
                      <p className="text-[10px] font-black text-slate-400 uppercase">
                        {a.event?.title}
                      </p>

                      <p className="font-black text-slate-800 text-sm">
                        {a.items?.name}
                      </p>

                      <p className="text-xs text-slate-500 mt-1">
                        Pedido / Planejado: {a.requested_qty} / {a.planned_qty}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </SectionCard>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">

            <SectionCard title="Auditoria de Água - Mês Atual" icon={<Droplets size={18} />}>
              {analysis.missingWaterDays.length > 0 ? (
                <div>
                  <p className="text-sm font-black text-amber-600 mb-2">
                    Dias pendentes no sistema:
                  </p>

                  <div className="flex flex-wrap gap-2">
                    {analysis.missingWaterDays.map((d) => (
                      <span
                        key={d}
                        className="bg-amber-100 text-amber-700 text-xs font-black px-3 py-1 rounded-full"
                      >
                        {d}
                      </span>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="text-sm font-bold text-emerald-600">
                  ✓ Registros em dia.
                </p>
              )}

              {waterData.filter((w: any) => w.limit_exceeded).length > 0 && (
                <div className="mt-5">
                  <p className="text-sm font-black text-red-600 mb-2">
                    Excessos:
                  </p>

                  <div className="space-y-2">
                    {waterData
                      .filter((w: any) => w.limit_exceeded)
                      .map((w: any) => (
                        <div key={w.id} className="bg-red-50 rounded-xl p-3 text-sm font-bold text-red-700">
                          {new Date(w.date + 'T12:00:00').toLocaleDateString()} —
                          +{Number(w.consumption_diff || 0).toFixed(2)} m³
                        </div>
                      ))}
                  </div>
                </div>
              )}
            </SectionCard>

            <SectionCard title="Demandas Pendentes" icon={<AlertTriangle size={18} />}>
              {demandsData.length === 0 ? (
                <p className="text-sm font-bold text-emerald-600">
                  Tudo em dia.
                </p>
              ) : (
                <div className="space-y-3">
                  {demandsData.map((d: any) => {
                    const isOverdue =
                      d.deadline < new Date().toISOString().split('T')[0];

                    return (
                      <div key={d.id} className="bg-slate-50 rounded-2xl p-4">
                        <div className="flex items-center justify-between gap-2">
                          <h4 className="font-black text-slate-800 text-sm">
                            {d.title}
                          </h4>

                          {isOverdue && (
                            <span className="bg-red-100 text-red-700 text-[10px] font-black px-2 py-1 rounded-full">
                              ATRASADO
                            </span>
                          )}
                        </div>

                        <p className="text-xs text-slate-500 mt-1">
                          Prazo:{' '}
                          {d.deadline
                            ? new Date(d.deadline + 'T12:00:00').toLocaleDateString()
                            : '-'}
                        </p>
                      </div>
                    );
                  })}
                </div>
              )}
            </SectionCard>
          </div>

          <SectionCard title="Patrimônio e Remanejamento" icon={<ArrowRightLeft size={18} />}>
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-indigo-50 rounded-2xl p-5 text-center">
                <p className="text-[10px] font-black text-indigo-500 uppercase">
                  Ofertados
                </p>

                <h4 className="text-2xl font-black text-indigo-700">
                  {
                    remanejamentoData.filter(
                      (r: any) => r.status === 'DISPONÍVEL'
                    ).length
                  }
                </h4>
              </div>

              <div className="bg-emerald-50 rounded-2xl p-5 text-center">
                <p className="text-[10px] font-black text-emerald-500 uppercase">
                  Transferidos
                </p>

                <h4 className="text-2xl font-black text-emerald-700">
                  {
                    remanejamentoData.filter(
                      (r: any) => r.status === 'REMANEJADO'
                    ).length
                  }
                </h4>
              </div>
            </div>
          </SectionCard>
        </>
      )}

      {selectedSchool && (
        <div id="xray-pdf-template" style={{ display: 'none' }}>
          <div style={{ padding: 30, fontFamily: 'Arial' }}>
            <h1>FICHA ESTRATÉGICA DE VISTORIA</h1>
            <p>Relatório Consolidado de Inteligência Regional</p>

            <hr />

            <h2>{selectedSchool.name}</h2>
            <p>
              CIE: {selectedSchool.cie_code} | FDE: {selectedSchool.fde_code}
            </p>
            <p>Diretor(a): {selectedSchool.director_name}</p>
            <p>Endereço: {selectedSchool.address}</p>

            <h3>Ocorrências Ano</h3>
            <p>
              Pipa: {waterTruckRequests} | Energia: {powerOutageReports}
            </p>

            <h3>AVCB</h3>
            <p>{avcbDescription}</p>

            <h3>Patrimônio</h3>
            <p>{analysis.activeAssetProcesses} processos SEI.</p>

            <h3>Zeladoria</h3>
            <p>{zeladoriaData?.ocupada || 'N/A'}</p>

            <h3>Auditoria de Consumo de Água</h3>
            {analysis.missingWaterDays.length > 0 ? (
              <p>
                Dias sem registro: {analysis.missingWaterDays.join(', ')}
              </p>
            ) : (
              <p>Todos os registros de consumo foram realizados corretamente.</p>
            )}

            <h3>Demandas Administrativas Pendentes</h3>
            {demandsData.length === 0 ? (
              <p>Nenhuma pendência administrativa em aberto.</p>
            ) : (
              <ul>
                {demandsData.map((d: any) => (
                  <li key={d.id}>
                    {d.title} — Prazo:{' '}
                    {d.deadline
                      ? new Date(d.deadline + 'T12:00:00').toLocaleDateString()
                      : '-'}
                  </li>
                ))}
              </ul>
            )}

            {selectedSchool.has_elevator && (
              <>
                <h3>Condição de Acessibilidade</h3>
                <p>
                  Status:{' '}
                  {selectedSchool.is_elevator_operational
                    ? 'Equipamento operante'
                    : 'Equipamento parado / em manutenção'}
                </p>
              </>
            )}

            <h3>Qualidade Percebida nos Serviços</h3>
            <ul>
              {SERVICE_TYPES.map((service) => (
                <li key={service}>
                  {service}: {analysis.satisfactionPerService[service]}
                </li>
              ))}
            </ul>

            <p style={{ marginTop: 30, fontSize: 10 }}>
              RELATÓRIO GERADO PARA USO EXCLUSIVO DA EQUIPE TÉCNICA REGIONAL
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

function AuditCard({ title, status, desc, icon, color }: any) {
  const colors: any = {
    blue: 'bg-blue-50 text-blue-600 border-blue-100',
    red: 'bg-red-50 text-red-600 border-red-100',
    amber: 'bg-amber-50 text-amber-600 border-amber-100',
    emerald: 'bg-emerald-50 text-emerald-600 border-emerald-100',
    indigo: 'bg-indigo-50 text-indigo-600 border-indigo-100',
    purple: 'bg-purple-50 text-purple-600 border-purple-100'
  };

  return (
    <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm flex items-center gap-3">
      <div className={`p-3 rounded-xl ${colors[color] || colors.blue}`}>
        {icon}
      </div>

      <div>
        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
          {title}
        </p>

        <h4 className="text-sm font-black text-slate-800">
          {desc}
        </h4>
      </div>

      {status === 'ALERT' && (
        <AlertTriangle className="ml-auto text-amber-500" size={18} />
      )}
    </div>
  );
}

function SectionCard({ title, icon, children }: any) {
  return (
    <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-6">
      <h3 className="font-black text-slate-800 uppercase text-sm flex items-center gap-2 mb-4">
        <span className="text-blue-600">{icon}</span>
        {title}
      </h3>

      {children}
    </div>
  );
}

export default RaioXEscola;
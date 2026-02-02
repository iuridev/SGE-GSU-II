import { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { 
  Building2, Droplets, Zap, ShieldCheck, AlertTriangle, ArrowRight,
  Calendar, CheckCircle2, Waves, ZapOff, History, ChevronRight,
  ArrowRightLeft, ClipboardCheck, Map as MapIcon,
} from 'lucide-react';
import { WaterTruckModal } from '../components/WaterTruckModal';
import { PowerOutageModal } from '../components/PowerOutageModal';

// URLs do Leaflet via CDN
const LEAFLET_CSS = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
const LEAFLET_JS = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";

interface Stats {
  schools: number; 
  activeZeladorias: number; 
  waterAlerts: number; 
  activeWorks: number;
  avgConsumption: number; 
  exceededDays: number; 
  waterTruckRequests: number; 
  powerOutageRecords: number;
  inventoryItems: number;
  pendingFiscalizations: number;
}

interface MapSchool {
  id: string;
  name: string;
  latitude: number | null;
  longitude: number | null;
  periods: string[] | null;
  address: string | null;
}

export function Dashboard() {
  const [stats, setStats] = useState<Stats>({
    schools: 0, activeZeladorias: 0, waterAlerts: 0, activeWorks: 0,
    avgConsumption: 0, exceededDays: 0, waterTruckRequests: 0, powerOutageRecords: 0,
    inventoryItems: 0, pendingFiscalizations: 0
  });
  const [mapSchools, setMapSchools] = useState<MapSchool[]>([]);
  const [loading, setLoading] = useState(true);
  const [userRole, setUserRole] = useState<string>('');
  const [userName, setUserName] = useState('');
  const [schoolName, setSchoolName] = useState('');
  const [sabespCode, setSabespCode] = useState('');
  const [edpCode, setEdpCode] = useState('');
  const [schoolId, setSchoolId] = useState<string | null>(null);
  const [isWaterTruckModalOpen, setIsWaterTruckModalOpen] = useState(false);
  const [isPowerOutageModalOpen, setIsPowerOutageModalOpen] = useState(false);
  
  // Refs para o Leaflet
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const [leafletLoaded, setLeafletLoaded] = useState(false);

  useEffect(() => { 
    loadLeaflet();
    initDashboard(); 

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
      }
    };
  }, []);

  // Inicializa o mapa quando os dados das escolas e o Leaflet estiverem prontos
  useEffect(() => {
    if (leafletLoaded && mapSchools.length > 0 && mapContainerRef.current && !mapInstanceRef.current) {
      initMap();
    }
  }, [leafletLoaded, mapSchools]);

  function loadLeaflet() {
    // Injeta CSS
    if (!document.querySelector(`link[href="${LEAFLET_CSS}"]`)) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = LEAFLET_CSS;
      document.head.appendChild(link);
    }

    // Injeta JS
    if (!document.querySelector(`script[src="${LEAFLET_JS}"]`)) {
      const script = document.createElement('script');
      script.src = LEAFLET_JS;
      script.async = true;
      script.onload = () => setLeafletLoaded(true);
      document.head.appendChild(script);
    } else if ((window as any).L) {
      setLeafletLoaded(true);
    }
  }

  async function initDashboard() {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: profile } = await (supabase as any).from('profiles').select('full_name, role, school_id').eq('id', user.id).single();
      
      if (profile) {
        setUserRole(profile.role);
        setUserName(profile.full_name || 'Gestor');
        setSchoolId(profile.school_id);
        
        if (profile.school_id) {
          const { data: school } = await (supabase as any).from('schools').select('name, sabesp_supply_id, edp_installation_id').eq('id', profile.school_id).single();
          if (school) {
            setSchoolName(school.name);
            setSabespCode(school.sabesp_supply_id || 'N/A');
            setEdpCode(school.edp_installation_id || 'N/A');
          }
        }
        
        await fetchStats(profile.role, profile.school_id);
        await fetchMapData();
      }
    } catch (error) { console.error(error); } finally { setLoading(false); }
  }

  async function fetchMapData() {
    try {
      const { data } = await (supabase as any)
        .from('schools')
        .select('id, name, latitude, longitude, periods, address')
        .not('latitude', 'is', null)
        .not('longitude', 'is', null);
      
      setMapSchools(data || []);
    } catch (error) {
      console.error("Erro ao buscar dados do mapa:", error);
    }
  }

  async function fetchStats(role: string, sId: string | null) {
    const firstDayMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();
    const firstDayYear = new Date(new Date().getFullYear(), 0, 1).toISOString();
    
    try {
      const { count: ic } = await (supabase as any).from('inventory_items').select('*', { count: 'exact', head: true }).eq('status', 'DISPONÍVEL');

      let pendingFisc = 0;
      if (role === 'regional_admin') {
        const { data: submissions } = await (supabase as any).from('monitoring_submissions').select('is_completed');
        pendingFisc = (submissions || []).filter((s: any) => !s.is_completed).length;
      } else {
        const { data: submissions } = await (supabase as any).from('monitoring_submissions').select('is_completed').eq('school_id', sId);
        pendingFisc = (submissions || []).filter((s: any) => !s.is_completed).length;
      }

      if (role === 'regional_admin') {
        const { count: sc } = await (supabase as any).from('schools').select('*', { count: 'exact', head: true });
        const { count: zc } = await (supabase as any).from('zeladorias').select('*', { count: 'exact', head: true }).not('ocupada', 'in', '("NÃO POSSUI", "NÃO HABITÁVEL")');
        const { data: globalCons } = await (supabase as any).from('consumo_agua').select('consumption_diff').gte('date', firstDayMonth);
        const logsGlobal = globalCons || [];
        const globalAvg = logsGlobal.length > 0 ? logsGlobal.reduce((acc: number, curr: any) => acc + (curr.consumption_diff || 0), 0) / logsGlobal.length : 0;
        
        const { data: occsGlobal } = await (supabase as any).from('occurrences').select('type').gte('created_at', firstDayYear);
        const wtGlobal = (occsGlobal || []).filter((o: any) => o.type === 'WATER_TRUCK').length;
        const poGlobal = (occsGlobal || []).filter((o: any) => o.type === 'POWER_OUTAGE').length;

        setStats(prev => ({ 
          ...prev, 
          schools: sc || 0, activeZeladorias: zc || 0, avgConsumption: globalAvg,
          waterTruckRequests: wtGlobal, powerOutageRecords: poGlobal, inventoryItems: ic || 0,
          pendingFiscalizations: pendingFisc
        }));
      } else {
        const { data: cons } = await (supabase as any).from('consumo_agua').select('consumption_diff, limit_exceeded').eq('school_id', sId).gte('date', firstDayMonth);
        const logs = cons || [];
        const avg = logs.length > 0 ? logs.reduce((acc: number, curr: any) => acc + (curr.consumption_diff || 0), 0) / logs.length : 0;
        const exc = logs.filter((l: any) => l.limit_exceeded).length;
        
        const { data: occs } = await (supabase as any).from('occurrences').select('type').eq('school_id', sId).gte('created_at', firstDayYear);
        const wt = (occs || []).filter((o: any) => o.type === 'WATER_TRUCK').length;
        const po = (occs || []).filter((o: any) => o.type === 'POWER_OUTAGE').length;
        
        setStats(prev => ({ 
          ...prev, 
          avgConsumption: avg, exceededDays: exc, waterTruckRequests: wt, powerOutageRecords: po, inventoryItems: ic || 0,
          pendingFiscalizations: pendingFisc
        }));
      }
    } catch (error) { console.error(error); }
  }

  function initMap() {
    const L = (window as any).L;
    if (!L || !mapContainerRef.current) return;

    // Centro inicial baseado na primeira escola
    const firstSchool = mapSchools[0];
    const center: [number, number] = [firstSchool.latitude || -23.5505, firstSchool.longitude || -46.6333];

    const map = L.map(mapContainerRef.current, {
      center: center,
      zoom: 12,
      scrollWheelZoom: false
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(map);

    mapSchools.forEach(school => {
      if (school.latitude && school.longitude) {
        let color = '#f97316'; // Laranja (Padrão)
        if (school.periods?.includes('Integral 9h')) color = '#22c55e'; // Verde
        else if (school.periods?.includes('Integral 7h')) color = '#3b82f6'; // Azul

        const icon = L.divIcon({
          className: 'custom-div-icon',
          html: `<div style="background-color: ${color}; width: 24px; height: 24px; border-radius: 50%; border: 3px solid white; box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1);"></div>`,
          iconSize: [24, 24],
          iconAnchor: [12, 12]
        });

        const popupContent = `
          <div style="font-family: sans-serif; padding: 5px;">
            <h4 style="margin: 0 0 5px 0; font-weight: 900; text-transform: uppercase; font-size: 12px; color: #1e293b;">${school.name}</h4>
            <p style="margin: 0 0 8px 0; font-size: 10px; color: #64748b;">${school.address || 'Sem endereço'}</p>
            <div style="display: flex; flex-wrap: wrap; gap: 4px;">
              ${(school.periods || []).map(p => `<span style="background: #e0e7ff; color: #4338ca; padding: 2px 6px; border-radius: 4px; font-size: 8px; font-weight: 800; text-transform: uppercase;">${p}</span>`).join('')}
            </div>
            <a href="https://www.google.com/maps/dir/?api=1&destination=${school.latitude},${school.longitude}" 
               target="_blank" 
               style="display: block; margin-top: 10px; background: #4f46e5; color: white; text-align: center; padding: 6px; border-radius: 6px; text-decoration: none; font-size: 10px; font-weight: 800; text-transform: uppercase;">
               Ver Rota
            </a>
          </div>
        `;

        L.marker([school.latitude, school.longitude], { icon })
          .addTo(map)
          .bindPopup(popupContent);
      }
    });

    mapInstanceRef.current = map;
  }

  const getTimeGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Bom dia';
    if (hour < 18) return 'Boa tarde';
    return 'Boa noite';
  };

  return (
    <div className="space-y-8 pb-10">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black text-slate-900 tracking-tight">{getTimeGreeting()}, <span className="text-blue-600">{userName.split(' ')[0]}</span></h1>
          <p className="text-slate-500 font-medium mt-1 flex items-center gap-2"><Calendar size={16} /> Hoje é {new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
        </div>
        <div className="flex items-center gap-3 bg-white p-2 rounded-2xl border border-slate-100 shadow-sm">
          <div className="w-10 h-10 bg-emerald-50 rounded-xl flex items-center justify-center text-emerald-600"><CheckCircle2 size={20} /></div>
          <div className="pr-4">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider leading-none">Acesso</p>
            <p className="text-sm font-bold text-slate-700 truncate max-w-[200px] uppercase">
              {userRole === 'regional_admin' ? 'Regional Administrativo' : (schoolName || 'Gestão')}
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-6 gap-4">
        {userRole === 'regional_admin' ? (
          <>
            <StatCard title="Escolas" value={stats.schools} icon={<Building2 size={20} />} color="blue" loading={loading} label="Cadastradas" />
            <StatCard title="Zeladorias" value={stats.activeZeladorias} icon={<ShieldCheck size={20} />} color="emerald" loading={loading} label="Ativas" />
            <StatCard title="Média Rede" value={`${stats.avgConsumption.toFixed(2)} m³`} icon={<Waves size={20} />} color="blue" loading={loading} label="Consumo Mês" />
            <StatCard title="Fiscalizações" value={stats.pendingFiscalizations} icon={<ClipboardCheck size={20} />} color="amber" loading={loading} label="Pendentes Rede" alert={stats.pendingFiscalizations > 0} />
            <StatCard title="Falta Energia" value={stats.powerOutageRecords} icon={<ZapOff size={20} />} color="slate" loading={loading} label="Total Ano" />
            <StatCard title="Banco Remaneja" value={stats.inventoryItems} icon={<ArrowRightLeft size={20} />} color="indigo" loading={loading} label="Itens Livres" />
          </>
        ) : (
          <>
            <StatCard title="Média Consumo" value={`${stats.avgConsumption.toFixed(2)} m³`} icon={<Waves size={22} />} color="blue" loading={loading} label="Média diária" />
            <StatCard title="Dias Excesso" value={stats.exceededDays} icon={<AlertTriangle size={22} />} color="amber" loading={loading} label="No mês atual" alert={stats.exceededDays > 0} />
            <StatCard title="Fiscalização" value={stats.pendingFiscalizations} icon={<ClipboardCheck size={22} />} color="amber" loading={loading} label="Entregas Pendentes" alert={stats.pendingFiscalizations > 0} />
            <StatCard title="Falta Energia" value={stats.powerOutageRecords} icon={<ZapOff size={22} />} color="slate" loading={loading} label="Registros no ano" />
            <StatCard title="Caminhão Pipa" value={stats.waterTruckRequests} icon={<History size={22} />} color="blue" loading={loading} label="Pedidos no ano" />
            <StatCard title="Banco Remaneja" value={stats.inventoryItems} icon={<ArrowRightLeft size={22} />} color="indigo" loading={loading} label="Itens Disponíveis" />
          </>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        <div className="lg:col-span-8 space-y-6">
          <div className="flex items-center gap-3">
            <div className="w-1 h-6 bg-indigo-600 rounded-full"></div>
            <h2 className="text-xl font-black text-slate-800 uppercase tracking-tight flex items-center gap-2">
              <MapIcon size={20} className="text-indigo-600" /> Mapa da Rede Regional
            </h2>
          </div>
          
          <div className="bg-white p-4 rounded-[2.5rem] border border-slate-100 shadow-2xl overflow-hidden relative">
            <div className="absolute top-8 right-8 z-[50] flex flex-col gap-2">
                <div className="bg-white/90 backdrop-blur p-3 rounded-2xl shadow-xl border border-slate-100 space-y-2">
                   <div className="flex items-center gap-2 text-[9px] font-black uppercase text-slate-500">
                      <div className="w-2 h-2 rounded-full bg-blue-500"></div> Integral 7h
                   </div>
                   <div className="flex items-center gap-2 text-[9px] font-black uppercase text-slate-500">
                      <div className="w-2 h-2 rounded-full bg-green-500"></div> Integral 9h
                   </div>
                   <div className="flex items-center gap-2 text-[9px] font-black uppercase text-slate-500">
                      <div className="w-2 h-2 rounded-full bg-orange-500"></div> Parcial / Outros
                   </div>
                </div>
            </div>
            
            <div ref={mapContainerRef} className="h-[500px] w-full rounded-[2rem] overflow-hidden border border-slate-100 z-0">
               {(!leafletLoaded || mapSchools.length === 0) && (
                 <div className="h-full w-full bg-slate-50 flex flex-col items-center justify-center text-slate-300">
                    <MapIcon size={48} className="mb-2" />
                    <p className="text-xs font-black uppercase tracking-widest">
                      {!leafletLoaded ? 'Carregando Mapa...' : 'Aguardando Coordenadas...'}
                    </p>
                 </div>
               )}
            </div>
          </div>
        </div>

        <div className="lg:col-span-4 space-y-6">
          <div className="flex items-center gap-3"><div className="w-1 h-6 bg-blue-600 rounded-full"></div><h2 className="text-xl font-black text-slate-800 uppercase tracking-tight">Serviços de Emergência</h2></div>
          <div className="grid grid-cols-1 gap-4">
            <button onClick={() => setIsWaterTruckModalOpen(true)} className="group relative overflow-hidden bg-gradient-to-br from-blue-600 to-blue-800 p-6 rounded-[2rem] text-left shadow-xl transition-all hover:scale-[1.02] active:scale-95">
              <div className="relative z-10"><div className="w-12 h-12 bg-white/20 backdrop-blur-md rounded-2xl flex items-center justify-center text-white mb-4"><Droplets size={28} /></div><h3 className="text-xl font-black text-white leading-tight uppercase">Caminhão Pipa</h3><div className="mt-4 flex items-center gap-2 text-white/70 font-bold text-[10px] uppercase tracking-widest">Abrir Solicitação <ArrowRight size={14} /></div></div>
            </button>
            <button onClick={() => setIsPowerOutageModalOpen(true)} className="group relative overflow-hidden bg-gradient-to-br from-slate-800 to-slate-950 p-6 rounded-[2rem] text-left shadow-xl transition-all hover:scale-[1.02] active:scale-95">
              <div className="relative z-10"><div className="w-12 h-12 bg-white/10 backdrop-blur-md rounded-2xl flex items-center justify-center text-amber-400 mb-4"><Zap size={28} /></div><h3 className="text-xl font-black text-white leading-tight uppercase">Falta Energia</h3><div className="mt-4 flex items-center gap-2 text-white/70 font-bold text-[10px] uppercase tracking-widest">Notificar Regional <ArrowRight size={14} /></div></div>
            </button>
          </div>

          <div className="flex items-center gap-3 mt-8"><div className="w-1 h-6 bg-slate-400 rounded-full"></div><h2 className="text-xl font-black text-slate-800 uppercase tracking-tight">Controle</h2></div>
          <div className="bg-white rounded-[2.5rem] border border-slate-100 shadow-xl p-4 space-y-2">
            <QuickLink icon={<ClipboardCheck size={18}/>} title="Fiscalização Terceirizados" desc="Acompanhe entregas e prazos" href="/fiscalizacao" color="amber" />
            <QuickLink icon={<ArrowRightLeft size={18}/>} title="Remanejamento" desc="Banco regional de itens" href="/remanejamento" color="indigo" />
          </div>
        </div>
      </div>

      {isWaterTruckModalOpen && <WaterTruckModal isOpen={isWaterTruckModalOpen} onClose={() => { setIsWaterTruckModalOpen(false); initDashboard(); }} schoolName={schoolName} schoolId={schoolId} userName={userName} sabespCode={sabespCode} />}
      {isPowerOutageModalOpen && <PowerOutageModal isOpen={isPowerOutageModalOpen} onClose={() => { setIsPowerOutageModalOpen(false); initDashboard(); }} schoolName={schoolName} schoolId={schoolId} userName={userName} edpCode={edpCode} />}
    </div>
  );
}

function StatCard({ title, value, icon, color, loading, label, alert = false }: any) {
  const colorMap: any = { blue: "bg-blue-50 text-blue-600 border-blue-100", emerald: "bg-emerald-50 text-emerald-600 border-emerald-100", amber: "bg-amber-50 text-amber-600 border-amber-100", slate: "bg-slate-50 text-slate-600 border-slate-100", indigo: "bg-indigo-50 text-indigo-600 border-indigo-100" };
  return (
    <div className={`bg-white p-4 rounded-[1.8rem] border border-slate-100 shadow-xl transition-all hover:-translate-y-1 ${alert ? 'ring-2 ring-amber-400 ring-offset-4' : ''}`}>
      <div className="flex justify-between items-start mb-4"><div className={`p-2 rounded-xl ${colorMap[color]} shadow-sm`}>{icon}</div>{alert && <span className="flex h-3 w-3 relative"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span><span className="relative inline-flex rounded-full h-3 w-3 bg-amber-500"></span></span>}</div>
      {loading ? <div className="space-y-2"><div className="h-6 w-16 bg-slate-100 animate-pulse rounded-lg"></div><div className="h-3 w-20 bg-slate-50 animate-pulse rounded-lg"></div></div> : <><h3 className="text-2xl font-black text-slate-800 tracking-tighter">{value}</h3><p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mt-1">{title}</p><div className="mt-3 pt-3 border-t border-slate-50 flex items-center justify-between"><span className="text-[8px] font-bold text-slate-400 uppercase">{label}</span><ArrowRight size={10} className="text-slate-200" /></div></>}
    </div>
  );
}

function QuickLink({ icon, title, desc, href, color }: any) {
  const colorMap: any = {
    blue: "group-hover:bg-blue-600 group-hover:text-white text-blue-600 bg-blue-50",
    emerald: "group-hover:bg-emerald-600 group-hover:text-white text-emerald-600 bg-emerald-50",
    amber: "group-hover:bg-amber-600 group-hover:text-white text-amber-600 bg-amber-50",
    indigo: "group-hover:bg-indigo-600 group-hover:text-white text-indigo-600 bg-indigo-50",
  };
  return (
    <a href={href} className="group flex items-center gap-4 p-3 hover:bg-slate-50 rounded-2xl transition-all">
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all ${colorMap[color]}`}>{icon}</div>
      <div className="flex-1"><p className="text-xs font-bold text-slate-700 leading-none">{title}</p><p className="text-[10px] text-slate-400 mt-1 font-medium">{desc}</p></div>
      <ChevronRight size={16} className="text-slate-300 group-hover:text-slate-500 transition-colors" />
    </a>
  );
}
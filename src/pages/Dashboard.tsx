import { useState, useEffect, useRef, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { 
  Building2, Droplets, Zap, ShieldCheck, AlertTriangle, ArrowRight,
  Calendar, CheckCircle2, Waves, ZapOff, History, ChevronRight,
  ArrowRightLeft, ClipboardCheck, Map as MapIcon, Loader2
} from 'lucide-react';
import { WaterTruckModal } from '../components/WaterTruckModal';
import { PowerOutageModal } from '../components/PowerOutageModal';

// URLs do Leaflet via CDN para garantir funcionamento sem dependências locais de tipos
const LEAFLET_CSS = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
const LEAFLET_JS = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";

const PERIOD_OPTIONS = ['Manhã', 'Tarde', 'Noite', 'Integral 9h', 'Integral 7h'];

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
  has_elevator: boolean; // Novo campo
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
  
  // Filtros do Mapa
  const [selectedPeriods, setSelectedPeriods] = useState<string[]>(PERIOD_OPTIONS);
  const [filterOnlyElevator, setFilterOnlyElevator] = useState(false);

  // Refs para o Leaflet
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const markersLayerRef = useRef<any>(null); 
  const [leafletLoaded, setLeafletLoaded] = useState(false);

  useEffect(() => { 
    loadLeaflet();
    initDashboard(); 

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, []);

  // Filtra as escolas baseado nos períodos selecionados e no filtro de elevador
  const filteredMapSchools = useMemo(() => {
    let filtered = mapSchools;
    
    // Filtro de períodos (OR)
    if (selectedPeriods.length > 0) {
      filtered = filtered.filter(school => 
        school.periods?.some(p => selectedPeriods.includes(p))
      );
    } else {
      return [];
    }

    // Filtro de elevador (AND)
    if (filterOnlyElevator) {
      filtered = filtered.filter(school => school.has_elevator);
    }

    return filtered;
  }, [mapSchools, selectedPeriods, filterOnlyElevator]);

  // Inicializa o mapa base
  useEffect(() => {
    if (leafletLoaded && mapSchools.length > 0 && mapContainerRef.current && !mapInstanceRef.current) {
      const L = (window as any).L;
      const firstSchoolWithCoords = mapSchools.find(s => s.latitude && s.longitude) || mapSchools[0];
      const center: [number, number] = [firstSchoolWithCoords.latitude || -23.5505, firstSchoolWithCoords.longitude || -46.6333];

      const map = L.map(mapContainerRef.current, {
        center: center,
        zoom: 12,
        scrollWheelZoom: false
      });

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
      }).addTo(map);

      markersLayerRef.current = L.layerGroup().addTo(map);
      mapInstanceRef.current = map;
    }
  }, [leafletLoaded, mapSchools]);

  // Atualiza os marcadores sempre que a lista filtrada mudar
  useEffect(() => {
    if (mapInstanceRef.current && markersLayerRef.current) {
      renderMarkers();
    }
  }, [filteredMapSchools, leafletLoaded]);

  function loadLeaflet() {
    if (!document.querySelector(`link[href="${LEAFLET_CSS}"]`)) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = LEAFLET_CSS;
      document.head.appendChild(link);
    }

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
        .select('id, name, latitude, longitude, periods, address, has_elevator')
        .not('latitude', 'is', null)
        .not('longitude', 'is', null);
      
      setMapSchools(data || []);
    } catch (error) {
      console.error("Erro ao procurar dados do mapa:", error);
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

  function renderMarkers() {
    const L = (window as any).L;
    if (!L || !markersLayerRef.current) return;

    markersLayerRef.current.clearLayers();

    filteredMapSchools.forEach(school => {
      if (school.latitude && school.longitude) {
        let color = '#f97316'; 
        if (school.periods?.includes('Integral 9h')) color = '#22c55e'; 
        else if (school.periods?.includes('Integral 7h')) color = '#3b82f6'; 

        // Diferenciação de forma para elevador
        const borderRadius = school.has_elevator ? '6px' : '50%';
        const rotation = school.has_elevator ? 'rotate(45deg)' : 'rotate(0deg)';
        const size = school.has_elevator ? '24px' : '26px'; // Diamante parece maior que o círculo

        const icon = L.divIcon({
          className: 'custom-div-icon',
          html: `<div style="background-color: ${color}; width: ${size}; height: ${size}; border-radius: ${borderRadius}; border: 4px solid white; box-shadow: 0 4px 12px rgba(0,0,0,0.3); transform: ${rotation}; transition: transform 0.2s ease-in-out;"></div>`,
          iconSize: [26, 26],
          iconAnchor: [13, 13]
        });

        const popupContent = `
          <div style="font-family: 'Inter', sans-serif; padding: 10px; min-width: 200px;">
            <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 6px;">
              <h4 style="margin: 0; font-weight: 900; text-transform: uppercase; font-size: 13px; color: #1e293b; line-height: 1.2;">${school.name}</h4>
              ${school.has_elevator ? '<div title="Possui Elevador" style="color: #4f46e5; background: #eef2ff; padding: 4px; border-radius: 6px;"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="5"/><path d="m3 21 4-4"/><path d="m21 21-4-4"/></svg></div>' : ''}
            </div>
            <p style="margin: 0 0 12px 0; font-size: 11px; color: #64748b; font-weight: 500; line-height: 1.4;">${school.address || 'Sem morada registada'}</p>
            
            <div style="display: flex; flex-wrap: wrap; gap: 5px; margin-bottom: 10px;">
              ${(school.periods || []).map(p => `<span style="background: #f8fafc; color: #334155; padding: 4px 8px; border-radius: 6px; font-size: 9px; font-weight: 800; text-transform: uppercase; border: 1px solid #e2e8f0;">${p}</span>`).join('')}
              ${school.has_elevator ? '<span style="background: #4f46e5; color: white; padding: 4px 8px; border-radius: 6px; font-size: 9px; font-weight: 800; text-transform: uppercase;">Elevador OK</span>' : ''}
            </div>

            <a href="https://www.google.com/maps/dir/?api=1&destination=${school.latitude},${school.longitude}" 
               target="_blank" 
               style="display: flex; align-items: center; justify-content: center; background: #4f46e5; color: white; text-align: center; padding: 10px; border-radius: 10px; text-decoration: none; font-size: 10px; font-weight: 800; text-transform: uppercase; box-shadow: 0 4px 6px -1px rgba(79, 70, 229, 0.2);">
               Abrir Direções
            </a>
          </div>
        `;

        L.marker([school.latitude, school.longitude], { icon })
          .addTo(markersLayerRef.current)
          .bindPopup(popupContent, {
            className: 'modern-map-popup',
            maxWidth: 280
          });
      }
    });
  }

  const togglePeriodFilter = (period: string) => {
    setSelectedPeriods(prev => 
      prev.includes(period) 
        ? prev.filter(p => p !== period)
        : [...prev, period]
    );
  };

  const getTimeGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Bom dia';
    if (hour < 18) return 'Boa tarde';
    return 'Boa noite';
  };

  return (
    <div className="space-y-8 pb-10">
      {/* Cabeçalho */}
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

      {/* Estatísticas */}
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
        {/* MAPA COM FILTROS AMPLIADOS */}
        <div className="lg:col-span-8 space-y-6">
          <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-6">
            <div className="flex items-center gap-4">
              <div className="w-1.5 h-8 bg-indigo-600 rounded-full"></div>
              <h2 className="text-2xl font-black text-slate-800 uppercase tracking-tight flex items-center gap-3">
                <MapIcon size={24} className="text-indigo-600" /> Rede Geográfica
              </h2>
            </div>
            
            {/* Barra de Filtros Ampliada */}
            <div className="flex flex-wrap gap-2.5 p-2 bg-slate-100/80 rounded-[1.5rem] border border-slate-200">
               {PERIOD_OPTIONS.map(opt => (
                 <button 
                  key={opt}
                  onClick={() => togglePeriodFilter(opt)}
                  className={`px-5 py-3 rounded-2xl text-[11px] font-black uppercase transition-all flex items-center gap-3 shadow-sm active:scale-95 border-2 ${
                    selectedPeriods.includes(opt) 
                      ? 'bg-indigo-600 border-indigo-600 text-white shadow-indigo-200' 
                      : 'bg-white border-white text-slate-400 hover:text-slate-600 hover:border-slate-200'
                  }`}
                 >
                   <div className={`w-3 h-3 rounded-full border-2 border-white/20 ${
                     opt === 'Integral 9h' ? 'bg-green-400' :
                     opt === 'Integral 7h' ? 'bg-blue-400' :
                     'bg-orange-400'
                   } ${selectedPeriods.includes(opt) ? 'bg-white' : ''}`} />
                   {opt}
                 </button>
               ))}

               {/* Filtro Separador */}
               <div className="w-px h-8 bg-slate-200 self-center mx-1 hidden md:block"></div>

               {/* Filtro de Elevador */}
               <button 
                  onClick={() => setFilterOnlyElevator(!filterOnlyElevator)}
                  className={`px-5 py-3 rounded-2xl text-[11px] font-black uppercase transition-all flex items-center gap-3 shadow-sm active:scale-95 border-2 ${
                    filterOnlyElevator 
                      ? 'bg-amber-500 border-amber-500 text-white shadow-amber-200' 
                      : 'bg-white border-white text-slate-400 hover:text-amber-600 hover:border-amber-200'
                  }`}
               >
                 <div className={`w-4 h-4 flex items-center justify-center rounded-sm rotate-45 border-2 ${filterOnlyElevator ? 'bg-white' : 'bg-slate-300'}`}></div>
                 Com Elevador
               </button>
            </div>
          </div>
          
          <div className="bg-white p-4 rounded-[3rem] border border-slate-100 shadow-2xl overflow-hidden relative">
            {/* Legenda Flutuante */}
            <div className="absolute top-8 right-8 z-[40]">
                <div className="bg-white/95 backdrop-blur px-5 py-4 rounded-3xl shadow-2xl border border-slate-100 space-y-3">
                   <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest border-b pb-2">Legenda de Formas</p>
                   <div className="flex items-center gap-3 text-[10px] font-black text-slate-600 uppercase">
                      <div className="w-3 h-3 rounded-full bg-slate-400 border-2 border-white shadow-sm"></div>
                      Sem Elevador
                   </div>
                   <div className="flex items-center gap-3 text-[10px] font-black text-slate-600 uppercase">
                      <div className="w-3 h-3 rounded-sm rotate-45 bg-slate-400 border-2 border-white shadow-sm"></div>
                      Com Elevador
                   </div>
                </div>
            </div>

            {/* Overlay de Status */}
            <div className="absolute top-8 left-8 z-[40]">
                <div className="bg-slate-900 text-white px-5 py-2.5 rounded-2xl shadow-2xl border border-white/10 flex items-center gap-3">
                   <div className="w-2.5 h-2.5 rounded-full bg-indigo-400 animate-pulse"></div>
                   <span className="text-[11px] font-black uppercase tracking-widest">
                      {filteredMapSchools.length} Unidades Filtradas
                   </span>
                </div>
            </div>

            <div ref={mapContainerRef} className="h-[550px] w-full rounded-[2.5rem] overflow-hidden border border-slate-100 z-0">
               {(!leafletLoaded || mapSchools.length === 0) && (
                 <div className="h-full w-full bg-slate-50 flex flex-col items-center justify-center text-slate-300">
                    <Loader2 size={56} className="mb-4 animate-spin text-indigo-400" />
                    <p className="text-sm font-black uppercase tracking-widest">
                      {!leafletLoaded ? 'A carregar módulos de mapa...' : 'Sincronizando pontos geográficos...'}
                    </p>
                 </div>
               )}
            </div>
          </div>
        </div>

        {/* Lado Direito: Ações */}
        <div className="lg:col-span-4 space-y-6">
          <div className="flex items-center gap-3"><div className="w-1 h-6 bg-blue-600 rounded-full"></div><h2 className="text-xl font-black text-slate-800 uppercase tracking-tight">Serviços de Emergência</h2></div>
          <div className="grid grid-cols-1 gap-4">
            <button onClick={() => setIsWaterTruckModalOpen(true)} className="group relative overflow-hidden bg-gradient-to-br from-blue-600 to-blue-800 p-8 rounded-[2.5rem] text-left shadow-xl transition-all hover:scale-[1.02] active:scale-95 text-white">
              <div className="relative z-10"><div className="w-14 h-14 bg-white/20 backdrop-blur-md rounded-2xl flex items-center justify-center text-white mb-6"><Droplets size={32} /></div><h3 className="text-2xl font-black leading-tight uppercase">Caminhão Pipa</h3><div className="mt-6 flex items-center gap-2 text-white/70 font-bold text-xs uppercase tracking-widest">Abrir Solicitação <ArrowRight size={16} /></div></div>
            </button>
            <button onClick={() => setIsPowerOutageModalOpen(true)} className="group relative overflow-hidden bg-gradient-to-br from-slate-800 to-slate-950 p-8 rounded-[2.5rem] text-left shadow-xl transition-all hover:scale-[1.02] active:scale-95 text-white">
              <div className="relative z-10"><div className="w-14 h-14 bg-white/10 backdrop-blur-md rounded-2xl flex items-center justify-center text-amber-400 mb-6"><Zap size={32} /></div><h3 className="text-2xl font-black leading-tight uppercase">Falta Energia</h3><div className="mt-6 flex items-center gap-2 text-white/70 font-bold text-xs uppercase tracking-widest">Notificar Regional <ArrowRight size={16} /></div></div>
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
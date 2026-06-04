import { useState, useEffect, useRef, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import {
  Building2, Droplets, Zap, ShieldCheck, AlertTriangle, ArrowRight,
  Calendar, CheckCircle2, Waves, ZapOff, History, ChevronRight,
  ArrowRightLeft, Map as MapIcon, Loader2, Info, X,
  HardHat, Bell, ClipboardList, Truck, Clock
} from 'lucide-react';
import { WaterTruckModal } from '../components/WaterTruckModal';
import { PowerOutageModal } from '../components/PowerOutageModal';

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
  pendingFiscalizations?: number;
  openTickets: number;
}

interface MapSchool {
  id: string;
  name: string;
  latitude: number | null;
  longitude: number | null;
  periods: string[] | null;
  address: string | null;
  has_elevator: boolean;
}

interface UpcomingEvent {
  id: string;
  title: string;
  date: string;
  time: string;
  event_type: string;
  schools?: { name: string };
}

const EVENT_TYPE_STYLES: Record<string, { bar: string; bg: string; text: string; label: string }> = {
  REUNIAO:          { bar: 'bg-indigo-500',  bg: 'bg-indigo-50',  text: 'text-indigo-600',  label: 'Reunião' },
  VISITA_TECNICA:   { bar: 'bg-emerald-500', bg: 'bg-emerald-50', text: 'text-emerald-600', label: 'Visita Técnica' },
  ABERTURA_OBRA:    { bar: 'bg-orange-500',  bg: 'bg-orange-50',  text: 'text-orange-600',  label: 'Abert. Obra' },
  FINALIZACAO_OBRA: { bar: 'bg-green-500',   bg: 'bg-green-50',   text: 'text-green-600',   label: 'Final. Obra' },
  AVISO_ENERGIA:    { bar: 'bg-amber-500',   bg: 'bg-amber-50',   text: 'text-amber-600',   label: 'Falta Energia' },
  AVISO_AGUA:       { bar: 'bg-blue-500',    bg: 'bg-blue-50',    text: 'text-blue-600',    label: 'Falta Água' },
};

interface DashboardProps {
  onNavigate?: (page: string) => void;
}

export function Dashboard({ onNavigate }: DashboardProps) {
  const [stats, setStats] = useState<Stats>({
    schools: 0, activeZeladorias: 0, waterAlerts: 0, activeWorks: 0,
    avgConsumption: 0, exceededDays: 0, waterTruckRequests: 0, powerOutageRecords: 0,
    inventoryItems: 0, openTickets: 0
  });

  const [mapSchools, setMapSchools] = useState<MapSchool[]>([]);
  const [loading, setLoading] = useState(true);
  const [userRole, setUserRole] = useState<string>('');
  const [userName, setUserName] = useState('');
  const [schoolName, setSchoolName] = useState('');
  const [sabespCode, setSabespCode] = useState('');
  const [edpCode, setEdpCode] = useState('');
  const [schoolId, setSchoolId] = useState<string | null>(null);

  const [supervisorSchoolsList, setSupervisorSchoolsList] = useState<{id: string, name: string}[]>([]);
  const [selectedSupervisorSchool, setSelectedSupervisorSchool] = useState<string>('all');
  const [supervisorSchoolIds, setSupervisorSchoolIds] = useState<string[]>([]);

  const [isWaterTruckModalOpen, setIsWaterTruckModalOpen] = useState(false);
  const [isPowerOutageModalOpen, setIsPowerOutageModalOpen] = useState(false);
  const [showWelcomeBanner, setShowWelcomeBanner] = useState(true);
  const [upcomingEvents, setUpcomingEvents] = useState<UpcomingEvent[]>([]);

  const [selectedPeriods, setSelectedPeriods] = useState<string[]>(PERIOD_OPTIONS);
  const [filterOnlyElevator, setFilterOnlyElevator] = useState(false);

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

  const filteredMapSchools = useMemo(() => {
    let filtered = mapSchools;
    if (selectedPeriods.length > 0) {
      filtered = filtered.filter(school =>
        school.periods?.some(p => selectedPeriods.includes(p))
      );
    } else {
      return [];
    }
    if (filterOnlyElevator) {
      filtered = filtered.filter(school => school.has_elevator);
    }
    return filtered;
  }, [mapSchools, selectedPeriods, filterOnlyElevator]);

  useEffect(() => {
    if (leafletLoaded && mapSchools.length > 0 && mapContainerRef.current && !mapInstanceRef.current) {
      const L = (window as any).L;
      const firstSchoolWithCoords = mapSchools.find(s => s.latitude && s.longitude) || mapSchools[0];
      const center: [number, number] = [firstSchoolWithCoords.latitude || -23.5505, firstSchoolWithCoords.longitude || -46.6333];
      const map = L.map(mapContainerRef.current, { center, zoom: 12, scrollWheelZoom: false });
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
      }).addTo(map);
      markersLayerRef.current = L.layerGroup().addTo(map);
      mapInstanceRef.current = map;
    }
  }, [leafletLoaded, mapSchools]);

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

      const { data: profile } = await (supabase as any)
        .from('profiles')
        .select('full_name, role, school_id, supervisor_schools')
        .eq('id', user.id)
        .single();

      if (profile) {
        setUserRole(profile.role);
        setUserName(profile.full_name || 'Gestor');
        setSchoolId(profile.school_id);

        if (profile.role === 'supervisor') {
          const supSchools = profile.supervisor_schools || [];
          setSupervisorSchoolIds(supSchools);
          if (supSchools.length > 0) {
            const { data: sSchools } = await (supabase as any)
              .from('schools').select('id, name').in('id', supSchools).order('name');
            setSupervisorSchoolsList(sSchools || []);
          }
          await fetchStats('supervisor', null, supSchools);
          await fetchMapData();
        } else if (profile.school_id) {
          const { data: school } = await (supabase as any)
            .from('schools')
            .select('name, sabesp_supply_id, edp_installation_id')
            .eq('id', profile.school_id)
            .single();
          if (school) {
            setSchoolName(school.name);
            setSabespCode(school.sabesp_supply_id || 'N/A');
            setEdpCode(school.edp_installation_id || 'N/A');
          }
          await fetchStats(profile.role, profile.school_id);
          await fetchMapData(profile.school_id);
        } else {
          await fetchStats(profile.role, null);
          await fetchMapData();
        }

        await fetchUpcomingEvents();
      }
    } catch (error) { console.error(error); } finally { setLoading(false); }
  }

  async function fetchUpcomingEvents() {
    const today = new Date().toISOString().split('T')[0];
    const { data } = await (supabase as any)
      .from('meetings')
      .select('id, title, date, time, event_type, schools(name)')
      .gte('date', today)
      .order('date', { ascending: true })
      .order('time', { ascending: true })
      .limit(8);
    setUpcomingEvents(data || []);
  }

  function handleSupervisorFilterChange(value: string) {
    setSelectedSupervisorSchool(value);
    setSchoolId(value === 'all' ? null : value);
    setLoading(true);
    const idsToFetch = value === 'all' ? supervisorSchoolIds : [value];
    fetchStats('supervisor', null, idsToFetch).finally(() => setLoading(false));
  }

  async function fetchMapData(filterSchoolId?: string) {
    try {
      let query = (supabase as any)
        .from('schools')
        .select('id, name, latitude, longitude, periods, address, has_elevator')
        .not('latitude', 'is', null)
        .not('longitude', 'is', null);
      if (filterSchoolId) query = query.eq('id', filterSchoolId);
      const { data } = await query;
      setMapSchools(data || []);
    } catch (error) { console.error('Erro ao buscar dados do mapa:', error); }
  }

  async function fetchStats(role: string, sId: string | null, supervisorIds: string[] = []) {
    const firstDayMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();
    const firstDayYear = new Date(new Date().getFullYear(), 0, 1).toISOString();

    try {
      const { count: ic } = await (supabase as any)
        .from('inventory_items').select('*', { count: 'exact', head: true }).eq('status', 'DISPONÍVEL');

      let pendingFisc = 0;
      if (role === 'regional_admin' || role === 'dirigente') {
        const { data: submissions } = await (supabase as any).from('monitoring_submissions').select('is_completed');
        pendingFisc = (submissions || []).filter((s: any) => !s.is_completed).length;
      } else if (role === 'supervisor' && supervisorIds.length > 0) {
        const { data: submissions } = await (supabase as any).from('monitoring_submissions').select('is_completed').in('school_id', supervisorIds);
        pendingFisc = (submissions || []).filter((s: any) => !s.is_completed).length;
      } else if (sId) {
        const { data: submissions } = await (supabase as any).from('monitoring_submissions').select('is_completed').eq('school_id', sId);
        pendingFisc = (submissions || []).filter((s: any) => !s.is_completed).length;
      }

      let activeWorksCount = 0;
      let openTicketsCount = 0;
      try {
        if (role === 'regional_admin' || role === 'dirigente') {
          const { count: wc } = await (supabase as any).from('construction_works').select('*', { count: 'exact', head: true }).eq('status', 'EM ANDAMENTO');
          activeWorksCount = wc || 0;
          const { data: tickets } = await (supabase as any).from('internal_tickets').select('status');
          openTicketsCount = (tickets || []).filter((t: any) => !['RESOLVIDO', 'FECHADO', 'CONCLUÍDO'].includes(t.status)).length;
        } else if (role === 'supervisor' && supervisorIds.length > 0) {
          const { count: wc } = await (supabase as any).from('construction_works').select('*', { count: 'exact', head: true }).eq('status', 'EM ANDAMENTO').in('school_id', supervisorIds);
          activeWorksCount = wc || 0;
          const { data: tickets } = await (supabase as any).from('internal_tickets').select('status').in('school_id', supervisorIds);
          openTicketsCount = (tickets || []).filter((t: any) => !['RESOLVIDO', 'FECHADO', 'CONCLUÍDO'].includes(t.status)).length;
        } else if (sId) {
          const { count: wc } = await (supabase as any).from('construction_works').select('*', { count: 'exact', head: true }).eq('status', 'EM ANDAMENTO').eq('school_id', sId);
          activeWorksCount = wc || 0;
          const { data: tickets } = await (supabase as any).from('internal_tickets').select('status').eq('school_id', sId);
          openTicketsCount = (tickets || []).filter((t: any) => !['RESOLVIDO', 'FECHADO', 'CONCLUÍDO'].includes(t.status)).length;
        }
      } catch { /* tables may not exist yet */ }

      if (role === 'regional_admin' || role === 'dirigente') {
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
          pendingFiscalizations: pendingFisc, activeWorks: activeWorksCount, openTickets: openTicketsCount
        }));
      } else if (role === 'supervisor') {
        if (supervisorIds.length === 0) return;
        const { data: cons } = await (supabase as any).from('consumo_agua').select('consumption_diff, limit_exceeded').in('school_id', supervisorIds).gte('date', firstDayMonth);
        const logs = cons || [];
        const avg = logs.length > 0 ? logs.reduce((acc: number, curr: any) => acc + (curr.consumption_diff || 0), 0) / logs.length : 0;
        const exc = logs.filter((l: any) => l.limit_exceeded).length;
        const { data: occs } = await (supabase as any).from('occurrences').select('type').in('school_id', supervisorIds).gte('created_at', firstDayYear);
        const wt = (occs || []).filter((o: any) => o.type === 'WATER_TRUCK').length;
        const po = (occs || []).filter((o: any) => o.type === 'POWER_OUTAGE').length;
        setStats(prev => ({
          ...prev,
          avgConsumption: avg, exceededDays: exc, waterTruckRequests: wt, powerOutageRecords: po,
          inventoryItems: ic || 0, pendingFiscalizations: pendingFisc,
          activeWorks: activeWorksCount, openTickets: openTicketsCount
        }));
      } else if (sId) {
        const { data: cons } = await (supabase as any).from('consumo_agua').select('consumption_diff, limit_exceeded').eq('school_id', sId).gte('date', firstDayMonth);
        const logs = cons || [];
        const avg = logs.length > 0 ? logs.reduce((acc: number, curr: any) => acc + (curr.consumption_diff || 0), 0) / logs.length : 0;
        const exc = logs.filter((l: any) => l.limit_exceeded).length;
        const { data: occs } = await (supabase as any).from('occurrences').select('type').eq('school_id', sId).gte('created_at', firstDayYear);
        const wt = (occs || []).filter((o: any) => o.type === 'WATER_TRUCK').length;
        const po = (occs || []).filter((o: any) => o.type === 'POWER_OUTAGE').length;
        setStats(prev => ({
          ...prev,
          avgConsumption: avg, exceededDays: exc, waterTruckRequests: wt, powerOutageRecords: po,
          inventoryItems: ic || 0, pendingFiscalizations: pendingFisc,
          activeWorks: activeWorksCount, openTickets: openTicketsCount
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
        if (school.periods?.includes('Integral 9h')) color = '#10b981';
        else if (school.periods?.includes('Integral 7h')) color = '#3b82f6';

        const isSquare = school.has_elevator;
        const borderRadius = isSquare ? '8px' : '50%';
        const rotation = isSquare ? 'rotate(45deg)' : 'rotate(0deg)';
        const size = isSquare ? '22px' : '26px';

        const icon = L.divIcon({
          className: 'custom-div-icon',
          html: `<div style="background-color:${color};width:${size};height:${size};border-radius:${borderRadius};border:3px solid white;box-shadow:0 4px 10px rgba(0,0,0,0.25);transform:${rotation};transition:all 0.3s ease;"></div>`,
          iconSize: [26, 26],
          iconAnchor: [13, 13]
        });

        const popupContent = `
          <div style="font-family:'Inter',sans-serif;padding:6px;min-width:220px;">
            <div style="display:flex;justify-content:space-between;align-items:start;margin-bottom:8px;">
              <h4 style="margin:0;font-weight:800;text-transform:uppercase;font-size:13px;color:#0f172a;line-height:1.3;">${school.name}</h4>
              ${school.has_elevator ? '<div title="Possui Elevador" style="color:#4f46e5;background:#e0e7ff;padding:5px;border-radius:8px;flex-shrink:0;"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M8 12h8M12 8l4 4-4 4"/></svg></div>' : ''}
            </div>
            <p style="margin:0 0 12px 0;font-size:11px;color:#64748b;font-weight:500;line-height:1.4;">${school.address || 'Sem endereço registrado'}</p>
            <div style="display:flex;flex-wrap:wrap;gap:5px;margin-bottom:12px;">
              ${(school.periods || []).map(p => `<span style="background:#f1f5f9;color:#334155;padding:3px 8px;border-radius:6px;font-size:9px;font-weight:700;text-transform:uppercase;border:1px solid #e2e8f0;">${p}</span>`).join('')}
              ${school.has_elevator ? '<span style="background:#4f46e5;color:white;padding:3px 8px;border-radius:6px;font-size:9px;font-weight:700;text-transform:uppercase;">Elevador</span>' : ''}
            </div>
            <a href="https://www.google.com/maps/dir/?api=1&destination=${school.latitude},${school.longitude}"
               target="_blank"
               style="display:flex;align-items:center;justify-content:center;background:#4f46e5;color:white;padding:11px;border-radius:10px;text-decoration:none;font-size:11px;font-weight:700;text-transform:uppercase;box-shadow:0 4px 6px -1px rgba(79,70,229,0.25);">
              Abrir Direções GPS
            </a>
          </div>`;

        L.marker([school.latitude, school.longitude], { icon })
          .addTo(markersLayerRef.current)
          .bindPopup(popupContent, { className: 'modern-map-popup', maxWidth: 280 });
      }
    });
  }

  const togglePeriodFilter = (period: string) => {
    setSelectedPeriods(prev =>
      prev.includes(period) ? prev.filter(p => p !== period) : [...prev, period]
    );
  };

  const getTimeGreeting = () => {
    const h = new Date().getHours();
    if (h < 12) return 'Bom dia';
    if (h < 18) return 'Boa tarde';
    return 'Boa noite';
  };

  const isSchoolManager = userRole === 'school_manager';
  const isGlobal = userRole === 'regional_admin' || userRole === 'dirigente';
  const currentSchoolName = selectedSupervisorSchool !== 'all'
    ? supervisorSchoolsList.find(s => s.id === selectedSupervisorSchool)?.name || schoolName
    : schoolName;

  return (
    <div className="space-y-6 pb-10 max-w-7xl mx-auto">

      {/* ── CABEÇALHO ── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold text-slate-800 tracking-tight">
            {getTimeGreeting()}, <span className="text-indigo-600">{userName.split(' ')[0]}</span>
          </h1>
          <p className="text-slate-500 font-medium mt-1 flex items-center gap-2">
            <Calendar size={16} className="text-slate-400" />
            {new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })}
          </p>
        </div>

        <div className="flex items-center gap-3 bg-white/70 backdrop-blur-md px-5 py-3 rounded-2xl border border-slate-200/60 shadow-sm">
          <div className="w-11 h-11 bg-indigo-50 rounded-xl flex items-center justify-center text-indigo-600">
            <CheckCircle2 size={22} />
          </div>
          <div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-none mb-0.5">Acesso</p>
            <p className="text-sm font-extrabold text-slate-700 truncate max-w-[210px] uppercase">
              {isGlobal
                ? (userRole === 'dirigente' ? 'Dirigente Regional' : 'Administrativo')
                : userRole === 'supervisor' ? 'Supervisão Escolar'
                : schoolName || 'Gestão de Unidade'}
            </p>
            {isSchoolManager && schoolName && (
              <p className="text-[10px] text-indigo-500 font-semibold truncate max-w-[210px] mt-0.5">{schoolName}</p>
            )}
          </div>
        </div>
      </div>

      {/* ── BOTÕES DE EMERGÊNCIA ── sempre em destaque no topo ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Caminhão Pipa */}
        <button
          onClick={() => setIsWaterTruckModalOpen(true)}
          className="group relative overflow-hidden bg-gradient-to-br from-blue-500 via-blue-600 to-indigo-700 p-6 rounded-3xl text-left shadow-2xl shadow-blue-500/30 transition-all duration-300 hover:scale-[1.02] hover:shadow-blue-500/40 active:scale-[0.98] text-white border border-blue-400/20"
        >
          <div className="absolute top-0 right-0 w-48 h-48 bg-white opacity-5 rounded-full -translate-y-20 translate-x-20 group-hover:scale-125 transition-transform duration-700" />
          <div className="absolute bottom-0 left-0 w-32 h-32 bg-blue-300 opacity-10 rounded-full translate-y-12 -translate-x-10" />
          <div className="relative z-10 flex items-center gap-5">
            <div className="w-16 h-16 bg-white/20 backdrop-blur-sm rounded-2xl flex items-center justify-center shrink-0 shadow-inner border border-white/10">
              <Droplets size={32} strokeWidth={2} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-blue-200 text-[11px] font-bold uppercase tracking-[0.15em] mb-1">Serviço Emergencial</p>
              <h3 className="text-2xl font-black leading-tight tracking-tight">Caminhão Pipa</h3>
              <div className="mt-2 flex items-center gap-1.5 text-white/70 font-semibold text-xs uppercase tracking-wider">
                Solicitar agora
                <ArrowRight size={13} className="group-hover:translate-x-1 transition-transform" />
              </div>
            </div>
          </div>
        </button>

        {/* Falta de Energia */}
        <button
          onClick={() => setIsPowerOutageModalOpen(true)}
          className="group relative overflow-hidden bg-gradient-to-br from-slate-800 via-slate-900 to-slate-950 p-6 rounded-3xl text-left shadow-2xl shadow-slate-900/30 transition-all duration-300 hover:scale-[1.02] hover:shadow-slate-900/40 active:scale-[0.98] text-white border border-amber-400/15"
        >
          <div className="absolute top-0 right-0 w-48 h-48 bg-amber-400 opacity-5 rounded-full -translate-y-20 translate-x-20 group-hover:scale-125 transition-transform duration-700" />
          <div className="absolute bottom-0 left-0 w-32 h-32 bg-amber-300 opacity-10 rounded-full translate-y-12 -translate-x-10" />
          <div className="relative z-10 flex items-center gap-5">
            <div className="w-16 h-16 bg-amber-400/20 border border-amber-400/25 backdrop-blur-sm rounded-2xl flex items-center justify-center shrink-0 text-amber-400 shadow-inner">
              <Zap size={32} strokeWidth={2} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-amber-400/70 text-[11px] font-bold uppercase tracking-[0.15em] mb-1">Serviço Emergencial</p>
              <h3 className="text-2xl font-black leading-tight tracking-tight">Falta de Energia</h3>
              <div className="mt-2 flex items-center gap-1.5 text-white/70 font-semibold text-xs uppercase tracking-wider">
                Notificar URE
                <ArrowRight size={13} className="group-hover:translate-x-1 transition-transform" />
              </div>
            </div>
          </div>
        </button>
      </div>

      {/* ── CARD ESCOLA (school_manager) ── */}
      {isSchoolManager && schoolName && (
        <div className="bg-gradient-to-r from-indigo-50 to-blue-50 border border-indigo-100 p-5 rounded-2xl">
          <div className="flex flex-col sm:flex-row sm:items-center gap-4">
            <div className="p-3 bg-indigo-100/70 rounded-xl text-indigo-600 shrink-0">
              <Building2 size={26} />
            </div>
            <div className="flex-1">
              <p className="text-[10px] font-bold text-indigo-400 uppercase tracking-widest mb-1">Sua Unidade Escolar</p>
              <h3 className="text-lg font-extrabold text-slate-800 leading-tight">{schoolName}</h3>
            </div>
            <div className="flex gap-8">
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-0.5">SABESP</p>
                <p className="text-sm font-bold text-slate-700">{sabespCode}</p>
              </div>
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-0.5">EDP</p>
                <p className="text-sm font-bold text-slate-700">{edpCode}</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── BANNER DE BOAS-VINDAS ── */}
      {showWelcomeBanner && (
        <div className="bg-gradient-to-r from-slate-50 to-blue-50 border border-slate-200/70 p-4 rounded-2xl flex items-start justify-between gap-4 shadow-sm">
          <div className="flex items-start gap-3">
            <div className="p-2 bg-blue-100/60 rounded-xl text-blue-600 shrink-0">
              <Info size={18} />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-800">Sistema de Gestão SGE-GSU-II</h3>
              <p className="text-xs text-slate-500 font-medium mt-0.5 leading-relaxed max-w-3xl">
                Centro de controle integrado para monitoramento da rede, métricas de consumo, acionamento de serviços de emergência e gestão patrimonial.
              </p>
            </div>
          </div>
          <button
            onClick={() => setShowWelcomeBanner(false)}
            className="p-1.5 hover:bg-slate-200/60 rounded-lg text-slate-400 hover:text-slate-600 transition-colors shrink-0"
          >
            <X size={15} />
          </button>
        </div>
      )}

      {/* ── FILTRO SUPERVISOR ── */}
      {userRole === 'supervisor' && supervisorSchoolsList.length > 0 && (
        <div className="bg-gradient-to-r from-orange-50 to-white border border-orange-100/60 p-5 rounded-2xl flex flex-col md:flex-row md:items-center gap-4 justify-between shadow-sm">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-orange-100/50 rounded-xl text-orange-600 border border-orange-200/50">
              <Building2 size={22} />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-800">Painel de Supervisão</h3>
              <p className="text-sm text-slate-500 font-medium">Filtre por unidade ou veja o resumo geral</p>
            </div>
          </div>
          <select
            className="w-full md:w-auto min-w-[300px] bg-white border border-slate-200 text-slate-700 text-sm font-semibold rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-orange-400 focus:border-transparent shadow-sm cursor-pointer"
            value={selectedSupervisorSchool}
            onChange={(e) => handleSupervisorFilterChange(e.target.value)}
          >
            <option value="all">📊 Resumo Geral ({supervisorSchoolsList.length} escolas)</option>
            {supervisorSchoolsList.map(school => (
              <option key={school.id} value={school.id}>🏫 {school.name}</option>
            ))}
          </select>
        </div>
      )}

      {/* ── PRÓXIMOS EVENTOS ── */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-50 rounded-xl text-indigo-600">
              <Calendar size={18} />
            </div>
            <div>
              <h2 className="text-base font-extrabold text-slate-800 leading-none">Próximos Eventos</h2>
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1">
                Agenda Regional
                {upcomingEvents.length > 0 && (
                  <> · <span className="text-indigo-500">{upcomingEvents.length} agendado{upcomingEvents.length !== 1 ? 's' : ''}</span></>
                )}
              </p>
            </div>
          </div>
          <button
            onClick={() => onNavigate?.('reunioes')}
            className="flex items-center gap-1.5 text-xs font-bold text-indigo-600 hover:text-white bg-indigo-50 hover:bg-indigo-600 px-4 py-2.5 rounded-xl transition-all"
          >
            Ver agenda completa <ChevronRight size={14} />
          </button>
        </div>

        {upcomingEvents.length === 0 ? (
          <div className="py-12 flex flex-col items-center justify-center gap-3">
            <div className="w-14 h-14 bg-slate-50 rounded-2xl flex items-center justify-center">
              <Calendar size={24} className="text-slate-300" />
            </div>
            <div className="text-center">
              <p className="text-sm font-bold text-slate-400">Nenhum evento agendado</p>
              <p className="text-xs text-slate-300 font-medium mt-0.5">Eventos criados no Calendário aparecerão aqui</p>
            </div>
          </div>
        ) : (
          <div className="flex gap-4 overflow-x-auto px-6 py-5 pb-6">
            {upcomingEvents.map(event => {
              const style = EVENT_TYPE_STYLES[event.event_type] ?? EVENT_TYPE_STYLES['REUNIAO'];
              const isToday = event.date === new Date().toISOString().split('T')[0];
              return (
                <div
                  key={event.id}
                  className="flex-shrink-0 w-52 bg-slate-50 hover:bg-white border border-slate-100 hover:border-indigo-200 rounded-2xl overflow-hidden transition-all hover:shadow-lg group cursor-default"
                >
                  <div className={`h-1.5 ${style.bar}`} />
                  <div className="p-4 space-y-3">
                    <div className="flex items-start justify-between gap-2 min-h-[28px]">
                      <span className={`text-[9px] font-black uppercase tracking-wider px-2 py-1 rounded-lg ${style.bg} ${style.text}`}>
                        {style.label}
                      </span>
                      {isToday && (
                        <span className="text-[9px] font-black uppercase px-2 py-1 rounded-lg bg-slate-900 text-white flex-shrink-0">
                          Hoje
                        </span>
                      )}
                    </div>
                    <p className="text-[12px] font-extrabold text-slate-800 leading-tight line-clamp-2 group-hover:text-indigo-700 transition-colors min-h-[36px]">
                      {event.title}
                    </p>
                    <div className="space-y-1.5 pt-2 border-t border-slate-100">
                      <div className="flex items-center gap-1.5">
                        <Clock size={10} className="text-slate-400 flex-shrink-0" />
                        <span className="text-[10px] text-slate-500 font-semibold">{formatEventDate(event.date)} · {event.time}h</span>
                      </div>
                      {event.schools?.name && (
                        <div className="flex items-center gap-1.5">
                          <Building2 size={10} className="text-indigo-400 flex-shrink-0" />
                          <span className="text-[10px] text-indigo-500 font-semibold truncate">{event.schools.name}</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── GRADE DE MÉTRICAS ── */}
      {isGlobal ? (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <StatCard title="Escolas" value={stats.schools} icon={<Building2 size={20} />} color="indigo" loading={loading} label="Rede registrada" />
          <StatCard title="Zeladorias" value={stats.activeZeladorias} icon={<ShieldCheck size={20} />} color="emerald" loading={loading} label="Espaços ativos" />
          <StatCard title="Obras Ativas" value={stats.activeWorks} icon={<HardHat size={20} />} color="amber" loading={loading} label="Em andamento" />
          <StatCard title="Chamados" value={stats.openTickets} icon={<Bell size={20} />} color="rose" loading={loading} label="Em aberto" />
          <StatCard title="Consumo Médio" value={`${stats.avgConsumption.toFixed(1)} m³`} icon={<Waves size={20} />} color="blue" loading={loading} label="Diário este mês" />
          <StatCard title="Falta de Energia" value={stats.powerOutageRecords} icon={<ZapOff size={20} />} color="slate" loading={loading} label="Registros no ano" />
          <StatCard title="Caminhão Pipa" value={stats.waterTruckRequests} icon={<Truck size={20} />} color="blue" loading={loading} label="Solicitações no ano" />
          <StatCard title="Remanejamento" value={stats.inventoryItems} icon={<ArrowRightLeft size={20} />} color="indigo" loading={loading} label="Itens disponíveis" />
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-4">
          <StatCard title="Consumo Médio" value={`${stats.avgConsumption.toFixed(1)} m³`} icon={<Waves size={20} />} color="blue" loading={loading} label="Diário este mês" />
          <StatCard title="Limites Excedidos" value={stats.exceededDays} icon={<AlertTriangle size={20} />} color="amber" loading={loading} label="Neste mês" alert={stats.exceededDays > 0} />
          <StatCard title="Chamados" value={stats.openTickets} icon={<Bell size={20} />} color="rose" loading={loading} label="Em aberto" />
          <StatCard title="Obras Ativas" value={stats.activeWorks} icon={<HardHat size={20} />} color="amber" loading={loading} label="Em andamento" />
          <StatCard title="Falta de Energia" value={stats.powerOutageRecords} icon={<ZapOff size={20} />} color="slate" loading={loading} label="Registros no ano" />
          <StatCard title="Caminhão Pipa" value={stats.waterTruckRequests} icon={<History size={20} />} color="blue" loading={loading} label="Solicitações no ano" />
        </div>
      )}

      {/* ── ALERTA FISCALIZAÇÕES PENDENTES ── */}
      {(stats.pendingFiscalizations ?? 0) > 0 && !isSchoolManager && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-center gap-4">
          <div className="p-2.5 bg-amber-100 rounded-xl text-amber-600 shrink-0">
            <AlertTriangle size={20} />
          </div>
          <div className="flex-1">
            <p className="text-sm font-bold text-amber-800">
              <span className="text-amber-600 font-extrabold text-lg">{stats.pendingFiscalizations}</span> fiscalizações pendentes de conclusão
            </p>
          </div>
          <button onClick={() => onNavigate?.('fiscalizacao')} className="text-xs font-bold text-amber-700 bg-amber-100 hover:bg-amber-200 transition-colors px-3 py-2 rounded-lg whitespace-nowrap">
            Ver fiscalizações →
          </button>
        </div>
      )}

      {/* ── CONTEÚDO PRINCIPAL: MAPA + PAINEL LATERAL ── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">

        {/* MAPA */}
        <div className="lg:col-span-8 space-y-4">
          <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-1.5 h-7 bg-indigo-600 rounded-full" />
              <h2 className="text-xl font-bold text-slate-800 tracking-tight flex items-center gap-2">
                <MapIcon size={20} className="text-indigo-500" /> Cobertura Geográfica
              </h2>
            </div>

            {!isSchoolManager && (
              <div className="flex flex-wrap gap-1.5 bg-white/70 backdrop-blur-sm p-1.5 rounded-2xl border border-slate-200/80 shadow-sm">
                {PERIOD_OPTIONS.map(opt => {
                  const isSelected = selectedPeriods.includes(opt);
                  const isI9 = opt === 'Integral 9h';
                  const isI7 = opt === 'Integral 7h';
                  let activeClass = 'bg-orange-500 border-orange-500 text-white';
                  if (isI9) activeClass = 'bg-emerald-500 border-emerald-500 text-white';
                  if (isI7) activeClass = 'bg-blue-500 border-blue-500 text-white';
                  return (
                    <button
                      key={opt}
                      onClick={() => togglePeriodFilter(opt)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 active:scale-95 border ${isSelected ? activeClass : 'bg-white border-slate-200 text-slate-500 hover:text-slate-700 hover:bg-slate-50'}`}
                    >
                      <div className={`w-2 h-2 rounded-full ${isI9 ? 'bg-green-300' : isI7 ? 'bg-blue-300' : 'bg-orange-300'} ${isSelected ? '!bg-white' : ''}`} />
                      {opt}
                    </button>
                  );
                })}
                <div className="w-px h-5 bg-slate-200 self-center mx-1 hidden md:block" />
                <button
                  onClick={() => setFilterOnlyElevator(!filterOnlyElevator)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 active:scale-95 border ${filterOnlyElevator ? 'bg-slate-800 border-slate-800 text-white' : 'bg-white border-slate-200 text-slate-500 hover:text-slate-700 hover:bg-slate-50'}`}
                >
                  <div className={`w-2.5 h-2.5 rounded-[3px] rotate-45 border border-white/20 ${filterOnlyElevator ? 'bg-indigo-400' : 'bg-slate-300'}`} />
                  Com Elevador
                </button>
              </div>
            )}
          </div>

          <div className="bg-white p-2 rounded-3xl border border-slate-200 shadow-xl overflow-hidden relative group">
            {/* Legenda aprimorada com cores dos períodos */}
            <div className="absolute top-5 right-5 z-[400] opacity-90 group-hover:opacity-100 transition-opacity">
              <div className="bg-white/95 backdrop-blur-md px-4 py-3 rounded-2xl shadow-lg border border-slate-100 space-y-2">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest border-b border-slate-100 pb-1.5">Legenda</p>
                <div className="flex items-center gap-2.5 text-[11px] font-semibold text-slate-600">
                  <div className="w-3 h-3 rounded-full bg-orange-500 border-2 border-white shadow-sm flex-shrink-0" />
                  Manhã / Tarde / Noite
                </div>
                <div className="flex items-center gap-2.5 text-[11px] font-semibold text-slate-600">
                  <div className="w-3 h-3 rounded-full bg-emerald-500 border-2 border-white shadow-sm flex-shrink-0" />
                  Integral 9h
                </div>
                <div className="flex items-center gap-2.5 text-[11px] font-semibold text-slate-600">
                  <div className="w-3 h-3 rounded-full bg-blue-500 border-2 border-white shadow-sm flex-shrink-0" />
                  Integral 7h
                </div>
                <div className="flex items-center gap-2.5 text-[11px] font-semibold text-slate-600">
                  <div className="w-3 h-3 bg-slate-400 border-2 border-white shadow-sm flex-shrink-0" style={{ borderRadius: '3px', transform: 'rotate(45deg)' }} />
                  <span className="ml-1">Com Elevador</span>
                </div>
              </div>
            </div>

            {/* Contador de unidades */}
            <div className="absolute top-5 left-5 z-[400]">
              <div className="bg-slate-900/90 backdrop-blur-md text-white px-4 py-2 rounded-xl shadow-lg border border-white/10 flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                <span className="text-xs font-bold uppercase tracking-wide">
                  {filteredMapSchools.length} Unidades
                </span>
              </div>
            </div>

            <div ref={mapContainerRef} className="h-[540px] w-full rounded-[1.4rem] overflow-hidden bg-slate-50 z-0">
              {(!leafletLoaded || mapSchools.length === 0) && (
                <div className="h-full w-full flex flex-col items-center justify-center text-slate-400">
                  <Loader2 size={44} className="mb-4 animate-spin text-indigo-500" />
                  <p className="text-sm font-bold uppercase tracking-widest text-slate-500">
                    {!leafletLoaded ? 'Carregando módulo de mapa...' : 'Sincronizando dados geográficos...'}
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* PAINEL LATERAL */}
        <div className="lg:col-span-4 space-y-5">
          <div className="flex items-center gap-3">
            <div className="w-1.5 h-6 bg-slate-300 rounded-full" />
            <h2 className="text-lg font-bold text-slate-800 tracking-tight">Painéis de Controle</h2>
          </div>

          <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-3 space-y-1">
            <QuickLink icon={<ClipboardList size={19} />} title="Central de Chamados" desc="Tickets e solicitações internas" pageId="chamados" color="rose" onNavigate={onNavigate} />
            <QuickLink icon={<HardHat size={19} />} title="Obras e Reformas" desc="Acompanhe obras em andamento" pageId="obras" color="amber" onNavigate={onNavigate} />
            <QuickLink icon={<ArrowRightLeft size={19} />} title="Remanejamento" desc="Banco regional de materiais" pageId="remanejamento" color="indigo" onNavigate={onNavigate} />
            {!isSchoolManager && (
              <QuickLink icon={<Truck size={19} />} title="Carros Oficiais" desc="Agendamento de veículos" pageId="carros" color="blue" onNavigate={onNavigate} />
            )}
            <QuickLink icon={<Info size={19} />} title="Manuais e Tutoriais" desc="Aprenda a usar o sistema" pageId="tutoriais" color="blue" onNavigate={onNavigate} />
          </div>

          {/* Resumo extra para school_manager */}
          {isSchoolManager && (
            <div className="bg-slate-50 rounded-2xl border border-slate-200 p-4 space-y-3">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Resumo da Unidade</p>
              {[
                { label: 'Consumo médio (mês)', value: `${stats.avgConsumption.toFixed(1)} m³`, warn: false },
                { label: 'Dias com limite excedido', value: String(stats.exceededDays), warn: stats.exceededDays > 0 },
                { label: 'Chamados em aberto', value: String(stats.openTickets), warn: stats.openTickets > 0 },
                { label: 'Pipas solicitadas (ano)', value: String(stats.waterTruckRequests), warn: false },
                { label: 'Faltas de energia (ano)', value: String(stats.powerOutageRecords), warn: false },
              ].map(({ label, value, warn }) => (
                <div key={label} className="flex justify-between items-center border-b border-slate-100 pb-2 last:border-0 last:pb-0">
                  <span className="text-xs font-medium text-slate-500">{label}</span>
                  <span className={`text-sm font-bold ${warn ? 'text-amber-600' : 'text-slate-800'}`}>{value}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── MODAIS ── */}
      {isWaterTruckModalOpen && (
        <WaterTruckModal
          isOpen={isWaterTruckModalOpen}
          onClose={() => { setIsWaterTruckModalOpen(false); initDashboard(); }}
          schoolName={currentSchoolName}
          schoolId={schoolId}
          userName={userName}
          sabespCode={sabespCode}
        />
      )}
      {isPowerOutageModalOpen && (
        <PowerOutageModal
          isOpen={isPowerOutageModalOpen}
          onClose={() => { setIsPowerOutageModalOpen(false); initDashboard(); }}
          schoolName={currentSchoolName}
          schoolId={schoolId}
          userName={userName}
          edpCode={edpCode}
        />
      )}
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────
function formatEventDate(dateStr: string) {
  const months = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
  const [, month, day] = dateStr.split('-');
  return `${parseInt(day)} ${months[parseInt(month) - 1]}`;
}

// ── StatCard ──────────────────────────────────────────────
function StatCard({ title, value, icon, color, loading, label, alert = false }: any) {
  const colorMap: any = {
    blue: 'bg-blue-50 text-blue-600 border-blue-100',
    emerald: 'bg-emerald-50 text-emerald-600 border-emerald-100',
    amber: 'bg-amber-50 text-amber-600 border-amber-100',
    slate: 'bg-slate-50 text-slate-600 border-slate-200',
    indigo: 'bg-indigo-50 text-indigo-600 border-indigo-100',
    rose: 'bg-rose-50 text-rose-600 border-rose-100',
  };
  return (
    <div className={`relative bg-white p-5 rounded-3xl border border-slate-200 shadow-sm transition-all hover:shadow-md hover:-translate-y-0.5 overflow-hidden ${alert ? 'ring-2 ring-amber-400 ring-offset-2' : ''}`}>
      <div className={`absolute -right-4 -top-4 w-16 h-16 rounded-full opacity-20 blur-2xl ${colorMap[color].split(' ')[1]}`} />
      <div className="flex justify-between items-start mb-4 relative z-10">
        <div className={`p-2.5 rounded-xl border ${colorMap[color]} shadow-sm`}>{icon}</div>
        {alert && (
          <span className="flex h-3 w-3 relative">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-3 w-3 bg-amber-500" />
          </span>
        )}
      </div>
      {loading ? (
        <div className="space-y-3 relative z-10">
          <div className="h-8 w-20 bg-slate-100 animate-pulse rounded-lg" />
          <div className="h-3 w-24 bg-slate-50 animate-pulse rounded-md" />
        </div>
      ) : (
        <div className="relative z-10">
          <h3 className="text-2xl sm:text-3xl font-extrabold text-slate-800 tracking-tight leading-none">{value}</h3>
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-2">{title}</p>
          <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between">
            <span className="text-[10px] font-semibold text-slate-400 uppercase">{label}</span>
            <ArrowRight size={11} className="text-slate-300" />
          </div>
        </div>
      )}
    </div>
  );
}

// ── QuickLink ─────────────────────────────────────────────
function QuickLink({ icon, title, desc, pageId, color, onNavigate }: any) {
  const colorMap: any = {
    blue: 'group-hover:bg-blue-500 group-hover:text-white text-blue-500 bg-blue-50',
    emerald: 'group-hover:bg-emerald-500 group-hover:text-white text-emerald-500 bg-emerald-50',
    amber: 'group-hover:bg-amber-500 group-hover:text-white text-amber-500 bg-amber-50',
    indigo: 'group-hover:bg-indigo-500 group-hover:text-white text-indigo-500 bg-indigo-50',
    rose: 'group-hover:bg-rose-500 group-hover:text-white text-rose-500 bg-rose-50',
  };
  return (
    <button onClick={() => onNavigate?.(pageId)} className="group w-full flex items-center gap-3 p-3 hover:bg-slate-50 rounded-2xl transition-all border border-transparent hover:border-slate-100 text-left">
      <div className={`w-11 h-11 rounded-xl flex items-center justify-center transition-all duration-300 flex-shrink-0 ${colorMap[color]}`}>{icon}</div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-bold text-slate-700 leading-tight truncate">{title}</p>
        <p className="text-[11px] text-slate-400 mt-0.5 font-medium truncate">{desc}</p>
      </div>
      <ChevronRight size={16} className="text-slate-300 group-hover:text-slate-600 transition-colors group-hover:translate-x-0.5 flex-shrink-0" />
    </button>
  );
}

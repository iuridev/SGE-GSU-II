import { useState, useMemo, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { 
  TreePine, 
  TreeDeciduous, 
  Map as MapIcon, 
  List, 
  X, 
  CheckCircle, 
  AlertCircle, 
  HelpCircle,
  Triangle,
  Loader2,
  Star,
  Search
} from 'lucide-react';
// Importações do Mapa Real (Leaflet)
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// --- TIPAGENS ---
type StatusManejo = 'VALIDO' | 'VENCIDO' | 'NAO_RESPONDIDO' | 'NAO_SE_APLICA';

interface Escola {
  id: string;
  nome: string;
  endereco: string;
  latitude: number | null;
  longitude: number | null;
  manejo_id: string | null;
  validadeAutorizacao: string | null;
  qtdRemocao: number;
  qtdPoda: number;
  naoSeAplica: boolean;
}

// --- COMPONENTE AUXILIAR DO MAPA: Atualiza o Zoom/Foco automaticamente ---
function MapBoundsUpdater({ escolas }: { escolas: Escola[] }) {
  const map = useMap();
  
  useEffect(() => {
    if (escolas.length === 0) return;
    
    let minLat = Infinity, maxLat = -Infinity;
    let minLng = Infinity, maxLng = -Infinity;
    let valid = false;

    escolas.forEach(e => {
      if (e.latitude !== null && e.longitude !== null) {
        valid = true;
        if (e.latitude < minLat) minLat = e.latitude;
        if (e.latitude > maxLat) maxLat = e.latitude;
        if (e.longitude < minLng) minLng = e.longitude;
        if (e.longitude > maxLng) maxLng = e.longitude;
      }
    });

    if (valid) {
      if (minLat === maxLat && minLng === maxLng) {
        // Se houver apenas 1 escola, aplica uma margem para não dar um zoom extremo
        minLat -= 0.01; maxLat += 0.01;
        minLng -= 0.01; maxLng += 0.01;
      }
      map.flyToBounds([[minLat, minLng], [maxLat, maxLng]], { padding: [50, 50], duration: 1.5 });
    }
  }, [escolas, map]);

  return null;
}

// --- GERAÇÃO DE ÍCONES PARA O LEAFLET ---
const getMarkerIcon = (status: StatusManejo, isMinhaEscola: boolean) => {
  let iconColor = '';
  let borderColor = '';
  let svgContent = '';

  if (status === 'VALIDO') {
    iconColor = '#10b981'; borderColor = '#34d399';
    svgContent = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="#d1fae5" stroke="${iconColor}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m17 14 3 3.3a1 1 0 0 1-.7 1.7H4.7a1 1 0 0 1-.7-1.7L7 14h-.3a1 1 0 0 1-.7-1.7L9 9h-.2A1 1 0 0 1 8 7.3L12 3l4 4.3a1 1 0 0 1-.8 1.7H15l3 3.3a1 1 0 0 1-.8 1.7H17z"/><path d="M12 19v3"/></svg>`;
  } else if (status === 'VENCIDO') {
    iconColor = '#ef4444'; borderColor = '#f87171';
    svgContent = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="#fee2e2" stroke="${iconColor}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m17 14 3 3.3a1 1 0 0 1-.7 1.7H4.7a1 1 0 0 1-.7-1.7L7 14h-.3a1 1 0 0 1-.7-1.7L9 9h-.2A1 1 0 0 1 8 7.3L12 3l4 4.3a1 1 0 0 1-.8 1.7H15l3 3.3a1 1 0 0 1-.8 1.7H17z"/><path d="M12 19v3"/></svg>`;
  } else if (status === 'NAO_RESPONDIDO') {
    iconColor = '#94a3b8'; borderColor = '#cbd5e1';
    svgContent = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="#f1f5f9" stroke="${iconColor}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m17 14 3 3.3a1 1 0 0 1-.7 1.7H4.7a1 1 0 0 1-.7-1.7L7 14h-.3a1 1 0 0 1-.7-1.7L9 9h-.2A1 1 0 0 1 8 7.3L12 3l4 4.3a1 1 0 0 1-.8 1.7H15l3 3.3a1 1 0 0 1-.8 1.7H17z"/><path d="M12 19v3"/></svg>`;
  } else {
    iconColor = '#f97316'; borderColor = '#fb923c';
    svgContent = `
      <div style="position: relative; display: flex; align-items: center; justify-content: center;">
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="${iconColor}" stroke="${iconColor}" stroke-width="1" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/></svg>
        <svg style="position: absolute; margin-top: 2px;" xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
      </div>
    `;
  }

  const pulseHtml = isMinhaEscola 
    ? `<div style="position: absolute; top: -6px; right: -6px; bottom: -6px; left: -6px; background-color: rgba(59, 130, 246, 0.4); border-radius: 50%; animation: custom-pulse 2s infinite;"></div>` 
    : '';

  const html = `
    <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; transform: ${isMinhaEscola ? 'scale(1.2)' : 'scale(1)'}; position: relative; cursor: pointer;">
      ${pulseHtml}
      <div style="padding: 6px; border-radius: 50%; background-color: ${isMinhaEscola ? '#eff6ff' : 'rgba(255, 255, 255, 0.95)'}; border: 2px solid ${isMinhaEscola ? '#3b82f6' : borderColor}; box-shadow: 0 3px 6px rgba(0,0,0,0.15); display: flex; align-items: center; justify-content: center; position: relative; z-index: 10;">
        ${svgContent}
      </div>
    </div>
  `;

  return L.divIcon({
    html,
    className: 'custom-leaflet-icon',
    iconSize: [36, 36],
    iconAnchor: [18, 18],
    popupAnchor: [0, -20]
  });
};

export default function ManejoArboreo() {
  const [escolas, setEscolas] = useState<Escola[]>([]);
  const [loading, setLoading] = useState(true);
  const [modoVisao, setModoVisao] = useState<'MAPA' | 'LISTA'>('MAPA');
  const [termoBusca, setTermoBusca] = useState(''); 
  
  const [userRole, setUserRole] = useState<string | null>(null);
  const [userSchoolId, setUserSchoolId] = useState<string | null>(null);

  const carregarContextoEDados = async () => {
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('role, school_id')
          .eq('id', session.user.id)
          .single();
          
        if (profile) {
          setUserRole((profile as any).role);
          setUserSchoolId((profile as any).school_id);
        }
      }

      const { data, error } = await supabase
        .from('schools')
        .select(`
          id, name, address, latitude, longitude,
          manejo_arboreo ( id, validade_autorizacao, qtd_remocao, qtd_poda, nao_se_aplica )
        `);

      if (error) throw error;

      if (data) {
        const dadosFormatados: Escola[] = data.map((esc: any) => {
          const manejo = Array.isArray(esc.manejo_arboreo) ? esc.manejo_arboreo[0] : esc.manejo_arboreo;
          const lat = esc.latitude !== null && esc.latitude !== undefined ? parseFloat(esc.latitude.toString()) : null;
          const lng = esc.longitude !== null && esc.longitude !== undefined ? parseFloat(esc.longitude.toString()) : null;

          return {
            id: esc.id,
            nome: esc.name || 'Sem nome',
            endereco: esc.address || '',
            latitude: Number.isNaN(lat) ? null : lat,
            longitude: Number.isNaN(lng) ? null : lng,
            manejo_id: manejo?.id || null,
            validadeAutorizacao: manejo?.validade_autorizacao || null,
            qtdRemocao: manejo?.qtd_remocao || 0,
            qtdPoda: manejo?.qtd_poda || 0,
            naoSeAplica: manejo?.nao_se_aplica || false,
          };
        });
        setEscolas(dadosFormatados);
      }
    } catch (err) {
      console.error("Erro ao inicializar página:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    carregarContextoEDados();
  }, []);

  const determinarStatus = (escola: Escola): StatusManejo => {
    if (escola.naoSeAplica) return 'NAO_SE_APLICA';
    if (!escola.validadeAutorizacao) return 'NAO_RESPONDIDO';
    
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    
    const [ano, mes, dia] = escola.validadeAutorizacao.split('-');
    const dataCorrigida = new Date(Number(ano), Number(mes) - 1, Number(dia));

    if (dataCorrigida < hoje) return 'VENCIDO';
    return 'VALIDO';
  };

  const escolasFiltradas = useMemo(() => {
    if (!termoBusca.trim()) return escolas;
    const termo = termoBusca.toLowerCase();
    return escolas.filter(escola => 
      escola.nome.toLowerCase().includes(termo) || 
      escola.endereco.toLowerCase().includes(termo)
    );
  }, [escolas, termoBusca]);

  const estatisticas = useMemo(() => {
    const stats = { validos: 0, vencidos: 0, naoRespondidos: 0, naoSeAplica: 0 };
    escolasFiltradas.forEach(escola => {
      const status = determinarStatus(escola);
      if (status === 'VALIDO') stats.validos++;
      else if (status === 'VENCIDO') stats.vencidos++;
      else if (status === 'NAO_RESPONDIDO') stats.naoRespondidos++;
      else if (status === 'NAO_SE_APLICA') stats.naoSeAplica++;
    });
    return stats;
  }, [escolasFiltradas]);

  const IconeNaoSeAplica = () => (
    <div className="relative flex items-center justify-center w-8 h-8">
      <Triangle className="text-orange-500 w-8 h-8 absolute" fill="currentColor" strokeWidth={1} />
      <X className="text-white w-4 h-4 absolute mt-2" strokeWidth={4} />
    </div>
  );

  const renderIconeStatus = (status: StatusManejo, size: number = 24) => {
    switch (status) {
      case 'VALIDO': return <TreePine size={size} className="text-emerald-500 fill-emerald-100" />;
      case 'VENCIDO': return <TreePine size={size} className="text-red-500 fill-red-100" />;
      case 'NAO_RESPONDIDO': return <TreePine size={size} className="text-slate-400 fill-slate-100" />;
      case 'NAO_SE_APLICA': return <IconeNaoSeAplica />;
    }
  };

  if (loading && escolas.length === 0) {
    return (
      <div className="flex items-center justify-center min-h-[500px]">
        <Loader2 className="w-8 h-8 text-emerald-600 animate-spin" />
      </div>
    );
  }

  // Apenas as escolas que têm geolocalização para renderizar no mapa
  const escolasComCoordenadas = escolasFiltradas.filter(e => e.latitude !== null && e.longitude !== null);

  return (
    <div className="space-y-6">
      
      {/* Estilos injetados para corrigir Leaflet + Tailwind */}
      <style>{`
        .leaflet-container img { max-width: none !important; }
        .custom-leaflet-icon { background: transparent; border: none; }
        @keyframes custom-pulse {
          0% { transform: scale(0.95); opacity: 0.8; }
          50% { transform: scale(1.15); opacity: 0.3; }
          100% { transform: scale(0.95); opacity: 0.8; }
        }
      `}</style>

      {/* Cabeçalho e Filtros */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <TreeDeciduous className="text-emerald-600" />
            Manejo Arbóreo
          </h1>
          <p className="text-sm text-slate-500 mt-1">Gestão e controlo de podas e remoções nas unidades escolares</p>
        </div>
        
        <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto">
          <div className="relative w-full sm:w-64">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Search size={16} className="text-slate-400" />
            </div>
            <input
              type="text"
              placeholder="Pesquisar escola..."
              value={termoBusca}
              onChange={(e) => setTermoBusca(e.target.value)}
              className="w-full pl-9 pr-3 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:bg-white focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-all placeholder:text-slate-400"
            />
          </div>

          <div className="flex gap-2 bg-slate-100 p-1 rounded-lg w-full sm:w-auto">
            <button 
              onClick={() => setModoVisao('MAPA')}
              className={`flex-1 sm:flex-none flex items-center justify-center gap-2 px-6 py-2.5 rounded-md text-sm font-medium transition-all ${modoVisao === 'MAPA' ? 'bg-white shadow-sm text-emerald-600' : 'text-slate-500 hover:text-slate-700'}`}
            >
              <MapIcon size={18} /> Mapa Real
            </button>
            <button 
              onClick={() => setModoVisao('LISTA')}
              className={`flex-1 sm:flex-none flex items-center justify-center gap-2 px-6 py-2.5 rounded-md text-sm font-medium transition-all ${modoVisao === 'LISTA' ? 'bg-white shadow-sm text-emerald-600' : 'text-slate-500 hover:text-slate-700'}`}
            >
              <List size={18} /> Lista
            </button>
          </div>
        </div>
      </div>

      {/* Cartões de Contabilização */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 relative overflow-hidden group">
          <div className="absolute top-0 left-0 w-1 h-full bg-emerald-500"></div>
          <div className="flex justify-between items-start">
            <div>
              <p className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-1">Válidos</p>
              <h3 className="text-3xl font-black text-emerald-600">{estatisticas.validos}</h3>
            </div>
            <div className="p-3 bg-emerald-50 rounded-xl group-hover:scale-110 transition-transform"><CheckCircle className="text-emerald-500" size={24} /></div>
          </div>
        </div>
        
        <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 relative overflow-hidden group">
          <div className="absolute top-0 left-0 w-1 h-full bg-red-500"></div>
          <div className="flex justify-between items-start">
            <div>
              <p className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-1">Vencidos</p>
              <h3 className="text-3xl font-black text-red-600">{estatisticas.vencidos}</h3>
            </div>
            <div className="p-3 bg-red-50 rounded-xl group-hover:scale-110 transition-transform"><AlertCircle className="text-red-500" size={24} /></div>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 relative overflow-hidden group">
          <div className="absolute top-0 left-0 w-1 h-full bg-slate-400"></div>
          <div className="flex justify-between items-start">
            <div>
              <p className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-1">Não Respondidos</p>
              <h3 className="text-3xl font-black text-slate-600">{estatisticas.naoRespondidos}</h3>
            </div>
            <div className="p-3 bg-slate-50 rounded-xl group-hover:scale-110 transition-transform"><HelpCircle className="text-slate-400" size={24} /></div>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 relative overflow-hidden group">
          <div className="absolute top-0 left-0 w-1 h-full bg-orange-500"></div>
          <div className="flex justify-between items-start">
            <div>
              <p className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-1">Não se Aplica</p>
              <h3 className="text-3xl font-black text-orange-600">{estatisticas.naoSeAplica}</h3>
            </div>
            <div className="p-3 bg-orange-50 rounded-xl group-hover:scale-110 transition-transform relative">
               <Triangle className="text-orange-500 w-6 h-6" fill="currentColor" />
               <X className="text-white w-3 h-3 absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-[20%]" strokeWidth={4} />
            </div>
          </div>
        </div>
      </div>

      {/* Área Principal (Mapa Real ou Lista) */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden min-h-[600px] relative z-0">
        
        {modoVisao === 'MAPA' ? (
          <div className="w-full h-[600px] relative">
            
            {/* Legenda do Mapa Sobreposta */}
            <div className="absolute bottom-6 right-6 bg-white/95 backdrop-blur-sm p-4 rounded-xl shadow-xl text-sm space-y-3 z-[1000] border border-slate-200">
              <p className="font-bold text-slate-800 border-b border-slate-100 pb-2 mb-2">Legenda do Mapa</p>
              <div className="flex items-center gap-3"><TreePine size={18} className="text-emerald-500" /> <span className="text-slate-600 font-medium">Válido</span></div>
              <div className="flex items-center gap-3"><TreePine size={18} className="text-red-500" /> <span className="text-slate-600 font-medium">Vencido</span></div>
              <div className="flex items-center gap-3"><TreePine size={18} className="text-slate-400" /> <span className="text-slate-600 font-medium">Pendente</span></div>
              <div className="flex items-center gap-3 pl-1"><Triangle size={14} fill="currentColor" className="text-orange-500" /> <span className="text-slate-600 font-medium ml-[2px]">Não se Aplica</span></div>
              {userRole === 'school_manager' && (
                <div className="flex items-center gap-3 mt-4 pt-3 border-t border-slate-100">
                  <div className="w-4 h-4 rounded-full bg-blue-100 border-2 border-blue-500 flex items-center justify-center animate-pulse"><Star size={8} className="text-blue-600" /></div>
                  <span className="text-slate-800 font-bold">A sua Escola</span>
                </div>
              )}
            </div>

            {escolasComCoordenadas.length === 0 ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-50 z-20 text-center p-6">
                <div className="w-16 h-16 bg-blue-100 text-blue-500 rounded-full flex items-center justify-center mb-4 shadow-inner">
                  {termoBusca ? <Search size={32} /> : <MapIcon size={32} />}
                </div>
                <h3 className="text-xl font-black text-slate-800">
                  {termoBusca ? 'Nenhuma escola encontrada no mapa' : 'Mapa Indisponível'}
                </h3>
                <p className="text-slate-500 max-w-md mt-3 leading-relaxed">
                  {termoBusca 
                    ? `A pesquisa por "${termoBusca}" não encontrou escolas com coordenadas geográficas.` 
                    : 'Não foi possível encontrar escolas com coordenadas cadastradas para exibir no mapa.'}
                </p>
              </div>
            ) : (
              <MapContainer 
                center={[-23.4542, -46.5333]} // Centro padrão de Guarulhos/SP
                zoom={12} 
                style={{ height: '100%', width: '100%' }}
                scrollWheelZoom={true}
              >
                {/* Estilo Visual de Ruas (OpenStreetMap) */}
                <TileLayer
                  attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />
                
                {/* Componente Invisível que Ajusta o Zoom automaticamente para os Pins visíveis */}
                <MapBoundsUpdater escolas={escolasComCoordenadas} />

                {escolasComCoordenadas.map(escola => {
                  const isMinhaEscola = escola.id === userSchoolId;
                  const icon = getMarkerIcon(determinarStatus(escola), isMinhaEscola);

                  return (
                    <Marker 
                      key={escola.id} 
                      position={[escola.latitude!, escola.longitude!]}
                      icon={icon}
                    >
                      <Popup className="custom-popup" closeButton={false}>
                        <div className="text-center p-1 min-w-[180px]">
                          <p className="font-bold text-slate-800 text-[13px] mb-1">{escola.nome}</p>
                          {isMinhaEscola && <p className="text-blue-600 font-bold text-[11px] mb-1 flex items-center justify-center gap-1"><Star size={12} fill="currentColor"/> A sua Escola</p>}
                        </div>
                      </Popup>
                    </Marker>
                  );
                })}
              </MapContainer>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            {escolasFiltradas.length === 0 ? (
              <div className="flex flex-col items-center justify-center p-12 text-slate-500">
                <Search size={48} className="text-slate-200 mb-4" />
                <p>Nenhuma escola encontrada para a pesquisa "{termoBusca}".</p>
              </div>
            ) : (
              <table className="w-full text-left text-sm text-slate-600">
                <thead className="bg-slate-50 text-slate-700 font-semibold border-b border-slate-200">
                  <tr>
                    <th className="py-4 px-6">Unidade Escolar</th>
                    <th className="py-4 px-6">Estado</th>
                    <th className="py-4 px-6">Validade</th>
                    <th className="py-4 px-6 text-center">Remover</th>
                    <th className="py-4 px-6 text-center">Podar</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {escolasFiltradas.map(escola => {
                    const status = determinarStatus(escola);
                    const isMinhaEscola = escola.id === userSchoolId;

                    return (
                      <tr key={escola.id} className={`transition-colors ${isMinhaEscola ? 'bg-blue-50/40 hover:bg-blue-50/80' : 'hover:bg-slate-50/80'}`}>
                        <td className="py-4 px-6">
                          <div className="flex items-center gap-2">
                            <p className="font-bold text-slate-800">{escola.nome}</p>
                            {isMinhaEscola && (
                              <span className="flex items-center gap-1 text-[10px] font-bold bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full border border-blue-200">
                                <Star size={10} fill="currentColor" /> A sua Escola
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-slate-400 mt-0.5">{escola.endereco}</p>
                        </td>
                        <td className="py-4 px-6">
                          <div className="flex items-center gap-2">
                            {renderIconeStatus(status, 18)}
                            <span className="text-[11px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full bg-slate-100 text-slate-600">
                              {status.replace(/_/g, ' ')}
                            </span>
                          </div>
                        </td>
                        <td className="py-4 px-6">
                          {escola.naoSeAplica ? <span className="text-slate-400 font-medium">-</span> : (
                            escola.validadeAutorizacao ? (
                              <span className="font-medium text-slate-700">
                                {new Date(escola.validadeAutorizacao + 'T12:00:00Z').toLocaleDateString('pt-PT')}
                              </span>
                            ) : (
                              <span className="text-orange-500 font-medium">Pendente</span>
                            )
                          )}
                        </td>
                        <td className="py-4 px-6 text-center">
                          {escola.naoSeAplica ? '-' : <span className="font-bold text-slate-700 bg-slate-100/80 px-3 py-1 rounded-md">{escola.qtdRemocao}</span>}
                        </td>
                        <td className="py-4 px-6 text-center">
                          {escola.naoSeAplica ? '-' : <span className="font-bold text-slate-700 bg-slate-100/80 px-3 py-1 rounded-md">{escola.qtdPoda}</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
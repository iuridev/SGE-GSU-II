import { useState, useEffect, useMemo } from 'react';
import {
  ParkingSquare, Search, ExternalLink, Loader2,
  Car, Users, MapPin, RefreshCw, X, ChevronDown, ChevronUp,
  ImageOff
} from 'lucide-react';

interface VagaRow {
  timestamp: string;
  nome: string;
  placa: string;
  modelo: string;
  estacionamento: string;
  vaga: string;
  [key: string]: string;
}

const SHEET_URL =
  'https://docs.google.com/spreadsheets/d/e/2PACX-1vRYv6CtO7OTyaUSR4gf5SZbBOL0FEGcGK1dr10is9PYRZ69Tb69_K2i_h7iq4KBmt9d24ERXaDUSaK0/pubhtml?gid=577993019&single=true';

const CSV_URL =
  'https://docs.google.com/spreadsheets/d/e/2PACX-1vRYv6CtO7OTyaUSR4gf5SZbBOL0FEGcGK1dr10is9PYRZ69Tb69_K2i_h7iq4KBmt9d24ERXaDUSaK0/pub?gid=577993019&single=true&output=csv';

// Cache global entre re-renders
const imageCache: Record<string, string | null> = {};

// Mapeamento modelo → título exato no Wikipedia EN
// Cobre os modelos mais comuns no mercado brasileiro
const CAR_WIKI: Record<string, string> = {
  // Fiat
  'ARGO': 'Fiat_Argo', 'CRONOS': 'Fiat_Cronos', 'MOBY': 'Fiat_Moby',
  'TORO': 'Fiat_Toro', 'PULSE': 'Fiat_Pulse', 'STRADA': 'Fiat_Strada',
  'DOBLO': 'Fiat_Doblò', 'DOBLÔ': 'Fiat_Doblò', 'UNO': 'Fiat_Uno',
  'PALIO': 'Fiat_Palio', 'SIENA': 'Fiat_Siena', 'LINEA': 'Fiat_Linea',
  'BRAVO': 'Fiat_Bravo', 'PUNTO': 'Fiat_Punto', 'DUCATO': 'Fiat_Ducato',
  'IDEA': 'Fiat_Idea', 'STILO': 'Fiat_Stilo', 'TEMPRA': 'Fiat_Tempra',
  'MAREA': 'Fiat_Marea', 'BRAVA': 'Fiat_Brava',
  // Volkswagen
  'GOL': 'Volkswagen_Gol', 'POLO': 'Volkswagen_Polo', 'VIRTUS': 'Volkswagen_Virtus',
  'VOYAGE': 'Volkswagen_Voyage', 'UP': 'Volkswagen_up!',
  'T-CROSS': 'Volkswagen_T-Cross', 'TCROSS': 'Volkswagen_T-Cross', 'T CROSS': 'Volkswagen_T-Cross',
  'TIGUAN': 'Volkswagen_Tiguan', 'AMAROK': 'Volkswagen_Amarok', 'SAVEIRO': 'Volkswagen_Saveiro',
  'FOX': 'Volkswagen_Fox', 'GOLF': 'Volkswagen_Golf', 'JETTA': 'Volkswagen_Jetta',
  'NIVUS': 'Volkswagen_Nivus', 'TAOS': 'Volkswagen_Taos', 'T-ROC': 'Volkswagen_T-Roc',
  'CROSSFOX': 'Volkswagen_CrossFox', 'SPACEFOX': 'Volkswagen_SpaceFox',
  // Chevrolet / GM
  'ONIX': 'Chevrolet_Onix', 'TRACKER': 'Chevrolet_Tracker', 'CRUZE': 'Chevrolet_Cruze',
  'SPIN': 'Chevrolet_Spin', 'S10': 'Chevrolet_S-10_(Brazil)', 'S-10': 'Chevrolet_S-10_(Brazil)',
  'TRAILBLAZER': 'Chevrolet_TrailBlazer', 'EQUINOX': 'Chevrolet_Equinox',
  'MONTANA': 'Chevrolet_Montana', 'COBALT': 'Chevrolet_Cobalt',
  'BLAZER': 'Chevrolet_Blazer', 'PRISMA': 'Chevrolet_Prisma',
  'MERIVA': 'Chevrolet_Meriva', 'VECTRA': 'Chevrolet_Vectra', 'ZAFIRA': 'Opel_Zafira',
  'AGILE': 'Chevrolet_Agile', 'CLASSIC': 'Chevrolet_Classic',
  // Hyundai
  'HB20': 'Hyundai_HB20', 'HB20S': 'Hyundai_HB20', 'HB20X': 'Hyundai_HB20',
  'CRETA': 'Hyundai_Creta', 'TUCSON': 'Hyundai_Tucson', 'IX35': 'Hyundai_ix35',
  'SANTA FE': 'Hyundai_Santa_Fe', 'VELOSTER': 'Hyundai_Veloster',
  // Ford
  'KA': 'Ford_Ka', 'KA+': 'Ford_Ka',
  'ECOSPORT': 'Ford_EcoSport', 'ECOSPORTE': 'Ford_EcoSport', 'ECO SPORT': 'Ford_EcoSport',
  'RANGER': 'Ford_Ranger', 'FIESTA': 'Ford_Fiesta', 'FOCUS': 'Ford_Focus',
  'FUSION': 'Ford_Fusion_(Americas)', 'EDGE': 'Ford_Edge', 'TERRITORY': 'Ford_Territory',
  'MAVERICK': 'Ford_Maverick_(2021)', 'BRONCO': 'Ford_Bronco',
  // Toyota
  'COROLLA': 'Toyota_Corolla', 'HILUX': 'Toyota_Hilux', 'YARIS': 'Toyota_Yaris',
  'RAV4': 'Toyota_RAV4', 'SW4': 'Toyota_4Runner', 'PRIUS': 'Toyota_Prius',
  'CAMRY': 'Toyota_Camry',
  'ETIOS': 'Toyota_Etios', 'ETYOS': 'Toyota_Etios',  // variante de grafia
  // Honda
  'CIVIC': 'Honda_Civic', 'FIT': 'Honda_Fit', 'HR-V': 'Honda_HR-V',
  'HRV': 'Honda_HR-V', 'CR-V': 'Honda_CR-V', 'CRV': 'Honda_CR-V',
  'WR-V': 'Honda_WR-V', 'CITY': 'Honda_City',
  // Jeep
  'COMPASS': 'Jeep_Compass', 'RENEGADE': 'Jeep_Renegade', 'COMMANDER': 'Jeep_Commander',
  'WRANGLER': 'Jeep_Wrangler',
  // Renault
  'KWID': 'Renault_Kwid', 'SANDERO': 'Renault_Sandero', 'DUSTER': 'Renault_Duster',
  'LOGAN': 'Renault_Logan', 'CAPTUR': 'Renault_Captur', 'OROCH': 'Renault_Oroch',
  'STEPWAY': 'Renault_Sandero', 'MASTER': 'Renault_Master',
  'CLIO': 'Renault_Clio', 'MEGANE': 'Renault_Mégane', 'SCENIC': 'Renault_Scénic',
  // Nissan
  'KICKS': 'Nissan_Kicks', 'FRONTIER': 'Nissan_Frontier', 'VERSA': 'Nissan_Versa',
  'SENTRA': 'Nissan_Sentra', 'MARCH': 'Nissan_Micra',
  // Mitsubishi
  'OUTLANDER': 'Mitsubishi_Outlander', 'PAJERO': 'Mitsubishi_Pajero',
  'L200': 'Mitsubishi_Triton', 'ASX': 'Mitsubishi_ASX', 'ECLIPSE': 'Mitsubishi_Eclipse_Cross',
  // Citroën
  'C3': 'Citroën_C3', 'C4': 'Citroën_C4', 'AIRCROSS': 'Citroën_C3_Aircross',
  'BERLINGO': 'Citroën_Berlingo', 'JUMPER': 'Citroën_Jumper',
  // Peugeot
  '208': 'Peugeot_208', '2008': 'Peugeot_2008', '3008': 'Peugeot_3008',
  '408': 'Peugeot_408', 'PARTNER': 'Peugeot_Partner', 'BOXER': 'Peugeot_Boxer',
  // Outros
  'FORESTER': 'Subaru_Forester', 'IMPREZA': 'Subaru_Impreza',
  'GLA': 'Mercedes-Benz_GLA-Class', 'GLC': 'Mercedes-Benz_GLC-Class',
  'X1': 'BMW_X1', 'X3': 'BMW_X3', 'SERIE 1': 'BMW_1_Series',
};

function findWikiTitle(modelo: string): string | null {
  const words = modelo.toUpperCase().trim().split(/\s+/);
  // Tenta todas as subcombinações do maior para o menor
  for (let start = 0; start < words.length; start++) {
    for (let end = words.length; end > start; end--) {
      const phrase = words.slice(start, end).join(' ');
      if (CAR_WIKI[phrase]) return CAR_WIKI[phrase];
    }
  }
  return null;
}

async function fetchCarImage(modelo: string): Promise<string | null> {
  const key = modelo.trim().toLowerCase();
  if (key in imageCache) return imageCache[key];

  try {
    const title = findWikiTitle(modelo);
    if (title) {
      // Busca direta pelo artigo — muito mais precisa que search
      const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`;
      const resp = await fetch(url);
      if (resp.ok) {
        const data = await resp.json();
        if (data.thumbnail?.source) {
          imageCache[key] = data.thumbnail.source;
          return imageCache[key];
        }
      }
    }

    // Sem fallback de busca genérica: melhor "sem imagem" do que resultado errado
    imageCache[key] = null;
    return null;
  } catch {
    imageCache[key] = null;
    return null;
  }
}

function parseCSV(text: string): VagaRow[] {
  const lines = text.trim().split('\n');
  if (lines.length < 2) return [];
  const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));

  return lines.slice(1).map(line => {
    const values = splitCSVLine(line);
    const row: Record<string, string> = {};
    headers.forEach((h, i) => { row[h] = (values[i] ?? '').trim().replace(/^"|"$/g, ''); });

    const find = (...candidates: string[]) => {
      for (const c of candidates) {
        const key = headers.find(h => h.toLowerCase().includes(c.toLowerCase()));
        if (key) return row[key] ?? '';
      }
      return '';
    };

    return {
      timestamp:      find('timestamp', 'carimbo', 'data', 'hora'),
      nome:           find('nome', 'funcionário', 'solicitante', 'name'),
      placa:          find('placa', 'plate', 'veículo'),
      modelo:         find('modelo', 'carro', 'marca', 'vehicle'),
      estacionamento: find('estacionamento', 'local', 'parking', 'lot'),
      vaga:           find('vaga', 'número', 'spot', 'number'),
      ...row,
    } as VagaRow;
  }).filter(r => r.nome || r.placa);
}

function splitCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (ch === ',' && !inQuotes) {
      result.push(current); current = '';
    } else { current += ch; }
  }
  result.push(current);
  return result;
}

function normalizePlaca(p: string) {
  return p.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

// src === undefined → carregando | null → não encontrado | string → URL
function CarImage({ modelo }: { modelo: string }) {
  const key = modelo.trim().toLowerCase();
  const [src, setSrc] = useState<string | null | undefined>(
    key in imageCache ? imageCache[key] : undefined
  );

  useEffect(() => {
    if (key in imageCache) { setSrc(imageCache[key]); return; }
    setSrc(undefined);
    fetchCarImage(modelo).then(url => setSrc(url));
  }, [modelo]);  // eslint-disable-line react-hooks/exhaustive-deps

  if (src === undefined) {
    return (
      <div className="w-full h-28 rounded-xl bg-slate-100 mb-3 flex items-center justify-center">
        <Loader2 size={18} className="animate-spin text-slate-300" />
      </div>
    );
  }

  if (!src) {
    return (
      <div className="w-full h-28 rounded-xl bg-slate-100 mb-3 flex flex-col items-center justify-center gap-1 opacity-25">
        <ImageOff size={22} className="text-slate-400" />
        <span className="text-[8px] font-black uppercase text-slate-400 tracking-wider">sem imagem</span>
      </div>
    );
  }

  return (
    <div className="w-full h-28 rounded-xl overflow-hidden bg-slate-100 mb-3">
      <img
        src={src}
        alt={modelo}
        className="w-full h-full object-cover transition-opacity duration-300"
        onError={() => { imageCache[key] = null; setSrc(null); }}
      />
    </div>
  );
}

export function EstacionamentoCarros() {
  const [rows, setRows] = useState<VagaRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [expandedLots, setExpandedLots] = useState<Record<string, boolean>>({});
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);

  async function fetchData() {
    setLoading(true);
    setError(null);
    try {
      const resp = await fetch(CSV_URL);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const text = await resp.text();

      const lines = text.trim().split('\n');
      if (lines.length >= 1) {
        setHeaders(lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, '')));
      }

      const parsed = parseCSV(text);
      setRows(parsed);
      setLastUpdated(new Date());

      const lots = Array.from(new Set(parsed.map(r => r.estacionamento).filter(Boolean)));
      const expanded: Record<string, boolean> = {};
      lots.forEach(l => { expanded[l] = true; });
      setExpandedLots(expanded);
    } catch (err: any) {
      setError('Não foi possível carregar os dados da planilha.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { fetchData(); }, []);

  const filtered = useMemo(() => {
    if (!search.trim()) return rows;
    const q = normalizePlaca(search);
    return rows.filter(r =>
      normalizePlaca(r.placa).includes(q) ||
      r.nome.toUpperCase().includes(search.toUpperCase()) ||
      r.modelo.toUpperCase().includes(search.toUpperCase())
    );
  }, [rows, search]);

  const lots = useMemo(() => {
    const map: Record<string, VagaRow[]> = {};
    filtered.forEach(r => {
      const lot = r.estacionamento || 'Sem estacionamento';
      if (!map[lot]) map[lot] = [];
      map[lot].push(r);
    });
    return map;
  }, [filtered]);

  const lotNames = useMemo(() => Object.keys(lots).sort(), [lots]);

  const stats = useMemo(() => ({
    total: rows.length,
    lots: new Set(rows.map(r => r.estacionamento).filter(Boolean)).size,
    unique: new Set(rows.map(r => r.nome.trim().toUpperCase())).size,
  }), [rows]);

  const toggleLot = (lot: string) =>
    setExpandedLots(prev => ({ ...prev, [lot]: !prev[lot] }));

  const lotColors = [
    { bg: 'bg-indigo-600', light: 'bg-indigo-50', border: 'border-indigo-200', text: 'text-indigo-700', badge: 'bg-indigo-100 text-indigo-700' },
    { bg: 'bg-emerald-600', light: 'bg-emerald-50', border: 'border-emerald-200', text: 'text-emerald-700', badge: 'bg-emerald-100 text-emerald-700' },
    { bg: 'bg-amber-500',   light: 'bg-amber-50',   border: 'border-amber-200',   text: 'text-amber-700',   badge: 'bg-amber-100  text-amber-700'  },
    { bg: 'bg-rose-600',    light: 'bg-rose-50',    border: 'border-rose-200',    text: 'text-rose-700',    badge: 'bg-rose-100   text-rose-700'   },
  ];

  const extraHeaders = useMemo(() => headers.filter(h => {
    const lh = h.toLowerCase();
    return !['timestamp','carimbo','data','hora','nome','placa','modelo','estacionamento','vaga',
             'funcionário','solicitante','local','parking','lot','number','spot','carro','marca',
             'plate','vehicle','name'].some(k => lh.includes(k));
  }).slice(0, 2), [headers]);

  return (
    <div className="space-y-6 pb-20">

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="p-3.5 bg-slate-900 rounded-2xl text-white shadow-xl shadow-slate-200">
            <ParkingSquare size={28} />
          </div>
          <div>
            <h1 className="text-2xl font-black text-slate-900 tracking-tight uppercase leading-none">
              Controle de Estacionamento
            </h1>
            <p className="text-slate-400 font-semibold text-sm mt-0.5">
              Localização de veículos por placa
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={fetchData}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-black text-[11px] uppercase tracking-widest transition-all active:scale-95 disabled:opacity-50"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            Atualizar
          </button>

          <a
            href={SHEET_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 px-5 py-2.5 bg-slate-900 hover:bg-black text-white rounded-xl font-black text-[11px] uppercase tracking-widest shadow-lg transition-all active:scale-95"
          >
            <ExternalLink size={14} />
            Ver Planilha
          </a>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm flex items-center gap-4">
          <div className="p-2.5 rounded-xl bg-slate-100 text-slate-600 shrink-0"><Car size={18} /></div>
          <div>
            <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Total de Veículos</p>
            <p className="text-2xl font-black text-slate-900 leading-tight mt-0.5">{loading ? '...' : stats.total}</p>
          </div>
        </div>
        <div className="bg-white p-5 rounded-2xl border border-indigo-100 shadow-sm flex items-center gap-4">
          <div className="p-2.5 rounded-xl bg-indigo-100 text-indigo-600 shrink-0"><MapPin size={18} /></div>
          <div>
            <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Estacionamentos</p>
            <p className="text-2xl font-black text-indigo-700 leading-tight mt-0.5">{loading ? '...' : stats.lots}</p>
          </div>
        </div>
        <div className="bg-white p-5 rounded-2xl border border-emerald-100 shadow-sm flex items-center gap-4 col-span-2 lg:col-span-1">
          <div className="p-2.5 rounded-xl bg-emerald-100 text-emerald-600 shrink-0"><Users size={18} /></div>
          <div>
            <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Funcionários</p>
            <p className="text-2xl font-black text-emerald-700 leading-tight mt-0.5">{loading ? '...' : stats.unique}</p>
          </div>
        </div>
      </div>

      {/* Search */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
        <div className="relative">
          <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar por placa, nome ou modelo..."
            className="w-full pl-11 pr-10 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
            >
              <X size={15} />
            </button>
          )}
        </div>
        {search && (
          <p className="mt-2 text-[10px] font-black text-slate-400 uppercase tracking-widest">
            {filtered.length} resultado{filtered.length !== 1 ? 's' : ''} para "{search}"
          </p>
        )}
      </div>

      {/* Content */}
      {loading ? (
        <div className="bg-white rounded-3xl border border-slate-100 shadow-sm py-24 flex flex-col items-center justify-center gap-4 text-slate-300">
          <Loader2 className="animate-spin" size={40} />
          <p className="text-[10px] font-black uppercase tracking-widest">Carregando dados...</p>
        </div>
      ) : error ? (
        <div className="bg-red-50 border border-red-200 rounded-2xl p-6 text-center">
          <p className="text-sm font-bold text-red-600">{error}</p>
          <button onClick={fetchData} className="mt-3 px-4 py-2 bg-red-600 text-white rounded-xl text-xs font-black uppercase tracking-wider hover:bg-red-700 transition-colors">
            Tentar novamente
          </button>
        </div>
      ) : rows.length === 0 ? (
        <div className="bg-white rounded-3xl border border-slate-100 shadow-sm py-24 flex flex-col items-center justify-center gap-3 opacity-30">
          <ParkingSquare size={56} />
          <p className="text-sm font-bold uppercase">Nenhum dado encontrado</p>
        </div>
      ) : (
        <div className="space-y-4">
          {lotNames.length === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm py-16 text-center">
              <p className="text-sm font-bold text-slate-400 uppercase">Nenhum resultado para a busca.</p>
            </div>
          ) : lotNames.map((lot, lotIdx) => {
            const color = lotColors[lotIdx % lotColors.length];
            const cars = lots[lot];
            const isOpen = expandedLots[lot] !== false;

            return (
              <div key={lot} className={`bg-white rounded-2xl border shadow-sm overflow-hidden ${color.border}`}>
                <button
                  onClick={() => toggleLot(lot)}
                  className={`w-full flex items-center justify-between px-6 py-4 ${color.light} border-b ${color.border} transition-colors hover:opacity-90`}
                >
                  <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-xl ${color.bg} text-white shrink-0`}>
                      <MapPin size={16} />
                    </div>
                    <div className="text-left">
                      <p className={`text-sm font-black uppercase tracking-tight ${color.text}`}>{lot}</p>
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                        {cars.length} veículo{cars.length !== 1 ? 's' : ''} cadastrado{cars.length !== 1 ? 's' : ''}
                      </p>
                    </div>
                  </div>
                  {isOpen ? <ChevronUp size={18} className="text-slate-400" /> : <ChevronDown size={18} className="text-slate-400" />}
                </button>

                {isOpen && (
                  <div className="p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                    {cars.map((car, i) => {
                      const isHighlighted = !!search.trim() && (
                        normalizePlaca(car.placa).includes(normalizePlaca(search)) ||
                        car.nome.toUpperCase().includes(search.toUpperCase()) ||
                        car.modelo.toUpperCase().includes(search.toUpperCase())
                      );
                      return (
                        <div
                          key={i}
                          className={`rounded-xl p-4 border transition-all ${
                            isHighlighted
                              ? 'ring-2 ring-indigo-500 border-indigo-300 bg-indigo-50'
                              : 'border-slate-100 bg-slate-50 hover:bg-white hover:border-slate-200'
                          }`}
                        >
                          {/* Imagem do modelo */}
                          {car.modelo && <CarImage modelo={car.modelo} />}

                          {/* Placa + Vaga */}
                          <div className="flex items-center justify-between mb-2">
                            <div className="bg-slate-900 text-white rounded-lg px-3 py-1.5 font-black text-sm tracking-widest uppercase">
                              {car.placa || '—'}
                            </div>
                            {car.vaga && (
                              <span className={`text-[9px] font-black px-2 py-1 rounded-lg uppercase tracking-wider ${color.badge}`}>
                                Vaga {car.vaga}
                              </span>
                            )}
                          </div>

                          {/* Nome */}
                          <p className="text-xs font-black text-slate-800 uppercase leading-tight truncate mt-2">
                            {car.nome || '—'}
                          </p>

                          {/* Modelo */}
                          {car.modelo && (
                            <p className="text-[10px] font-semibold text-slate-500 mt-0.5 uppercase truncate">
                              {car.modelo}
                            </p>
                          )}

                          {/* Colunas extras */}
                          {extraHeaders.map(h => car[h] ? (
                            <p key={h} className="text-[9px] text-slate-400 mt-1 truncate">
                              <span className="font-black uppercase">{h}:</span> {car[h]}
                            </p>
                          ) : null)}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {lastUpdated && !loading && (
        <p className="text-center text-[9px] font-black text-slate-300 uppercase tracking-widest">
          Última atualização: {lastUpdated.toLocaleTimeString('pt-BR')}
        </p>
      )}
    </div>
  );
}

export default EstacionamentoCarros;

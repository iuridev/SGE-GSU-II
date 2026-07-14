import { useState, useMemo, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { resolveViewRole } from '../lib/roles';
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
  Star,
  Search,
  FileSpreadsheet,
} from 'lucide-react';
// Importações do Mapa Real (Leaflet)
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// ─── Google Sheets ───────────────────────────────────────────────────────────
const MANEJO_SHEET_ID = import.meta.env.VITE_MANEJO_SHEET_ID as string;

interface ManejoSheetRow {
  timestamp: Date;
  escola: string;            // nome normalizado (chave de merge)
  escolaOriginal: string;    // nome como veio na planilha
  qtdRemocao: number;
  qtdPoda: number;
  validadeISO: string | null; // YYYY-MM-DD | null
  naoSeAplica: boolean;      // coluna E contém "Não se Aplica" (sem árvores)
  naoEnviou: boolean;        // coluna F contém "NÃO ENVIOU" → conta como NAO_RESPONDIDO
  observacoes: string;
}

function parseGvizDate(v: any): Date | null {
  if (!v) return null;
  if (typeof v === 'string') {
    const m = v.match(/Date\((\d+),(\d+),(\d+)(?:,(\d+),(\d+),(\d+))?\)/);
    if (m) return new Date(+m[1], +m[2], +m[3], +(m[4] ?? 0), +(m[5] ?? 0), +(m[6] ?? 0));
  }
  return null;
}

function normalizeName(name: string): string {
  return name
    .toUpperCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')          // remove diacríticos (forma explícita)
    .replace(/^(EE|EMEI|EMEF|CEI|EM |ESCOLA ESTADUAL|ESCOLA MUNICIPAL|PROF\.?|PROFESSOR[A]?)\s+/g, '')
    .replace(/[^A-Z0-9 ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function matchNames(supNorm: string, sheetNorm: string): boolean {
  if (supNorm === sheetNorm) return true;
  if (supNorm.includes(sheetNorm) || sheetNorm.includes(supNorm)) return true;
  // sobreposição de palavras ≥ 60%
  const wA = supNorm.split(' ').filter(Boolean);
  const wB = new Set(sheetNorm.split(' ').filter(Boolean));
  const overlap = wA.filter(w => wB.has(w)).length;
  return overlap / Math.min(wA.length, wB.size) >= 0.6;
}

async function fetchManejoFromSheet(): Promise<Map<string, ManejoSheetRow>> {
  const url = `https://docs.google.com/spreadsheets/d/${MANEJO_SHEET_ID}/gviz/tq?tqx=out:json`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Sheet HTTP ${res.status}`);
  const text = await res.text();
  const json = JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1));

  const rows: ManejoSheetRow[] = (json.table?.rows ?? [])
    .filter((r: any) => r?.c?.[1]?.v)
    .map((r: any): ManejoSheetRow => {
      const c = r.c || [];
      const raw = (i: number) => c[i]?.v ?? null;
      const fmt = (i: number): string => c[i]?.f ?? String(c[i]?.v ?? '');

      const ts = parseGvizDate(raw(0)) ?? new Date(0);

      // Coluna E (Validade): pode ser uma data OU o texto "Não se Aplica"
      const colE_raw = raw(4);
      const colE_fmt = fmt(4);
      const naoSeAplica =
        (typeof colE_raw === 'string' && /n.o\s*se\s*aplic/i.test(colE_raw)) ||
        /n.o\s*se\s*aplic/i.test(colE_fmt);
      const validadeDate = naoSeAplica ? null : parseGvizDate(colE_raw);
      const validadeISO = validadeDate
        ? `${validadeDate.getFullYear()}-${String(validadeDate.getMonth() + 1).padStart(2, '0')}-${String(validadeDate.getDate()).padStart(2, '0')}`
        : null;

      // Coluna F (Autorização): "NÃO ENVIOU" → trata como não respondido
      const colF = String(raw(5) ?? fmt(5) ?? '').toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
      const naoEnviou = colF.includes('NAO ENVIOU') || colF.includes('N O ENVIOU');

      const escolaOriginal = String(raw(1)).trim();
      return {
        timestamp: ts,
        escola: normalizeName(escolaOriginal),
        escolaOriginal,
        qtdRemocao: typeof raw(2) === 'number' ? Math.round(raw(2)) : 0,
        qtdPoda:    typeof raw(3) === 'number' ? Math.round(raw(3)) : 0,
        validadeISO,
        naoSeAplica,
        naoEnviou,
        observacoes: raw(14) ? String(raw(14)).trim() : '',
      };
    });

  // Ordena por timestamp descendente e mantém apenas a resposta mais recente por escola
  rows.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  const map = new Map<string, ManejoSheetRow>();
  for (const row of rows) {
    if (!map.has(row.escola)) map.set(row.escola, row);
  }
  return map;
}
// ─────────────────────────────────────────────────────────────────────────────

// --- TIPAGENS ---
// PENDENTE = respondeu o Forms mas não informou data de validade na coluna E
type StatusManejo = 'VALIDO' | 'VENCIDO' | 'NAO_RESPONDIDO' | 'NAO_SE_APLICA' | 'PENDENTE';

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
  // campos extras da planilha
  daPlanilha: boolean;
  observacoes: string;
  escolaOriginalPlanilha: string;
  timestampResposta: Date | null;
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
  } else if (status === 'PENDENTE') {
    iconColor = '#f59e0b'; borderColor = '#fcd34d';
    svgContent = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="#fef3c7" stroke="${iconColor}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m17 14 3 3.3a1 1 0 0 1-.7 1.7H4.7a1 1 0 0 1-.7-1.7L7 14h-.3a1 1 0 0 1-.7-1.7L9 9h-.2A1 1 0 0 1 8 7.3L12 3l4 4.3a1 1 0 0 1-.8 1.7H15l3 3.3a1 1 0 0 1-.8 1.7H17z"/><path d="M12 19v3"/></svg>`;
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
      // 1. Perfil do usuário
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('role, school_id')
          .eq('id', session.user.id)
          .single();
        if (profile) {
          setUserRole(resolveViewRole((profile as any).role));
          setUserSchoolId((profile as any).school_id);
        }
      }

      // 2. Busca paralela: escolas do Supabase + dados de manejo da planilha
      const [{ data, error }, sheetMap] = await Promise.all([
        supabase.from('schools').select(`
          id, name, address, latitude, longitude,
          manejo_arboreo ( id, validade_autorizacao, qtd_remocao, qtd_poda, nao_se_aplica )
        `),
        fetchManejoFromSheet().catch((err) => {
          console.warn('Planilha indisponível, usando apenas Supabase:', err);
          return new Map<string, ManejoSheetRow>();
        }),
      ]);

      if (error) throw error;
      if (!data) return;

      // 3. Merge: para cada escola do Supabase, procura correspondência na planilha
      const dadosFormatados: Escola[] = data.map((esc: any) => {
        const lat = esc.latitude != null ? parseFloat(String(esc.latitude)) : null;
        const lng = esc.longitude != null ? parseFloat(String(esc.longitude)) : null;
        const supNorm = normalizeName(esc.name || '');

        // Tenta encontrar a escola na planilha via correspondência de nomes
        let sheetRow: ManejoSheetRow | undefined;
        for (const [sheetNorm, row] of sheetMap) {
          if (matchNames(supNorm, sheetNorm)) {
            sheetRow = row;
            break;
          }
        }

        if (sheetRow) {
          // "NÃO ENVIOU" na coluna F → resposta existe mas sem autorização → NAO_RESPONDIDO
          // "Não se Aplica" na coluna E → escola sem árvores → NAO_SE_APLICA
          const naoSeAplica = sheetRow.naoSeAplica;
          const semDados = sheetRow.naoEnviou; // trata como NAO_RESPONDIDO

          return {
            id: esc.id,
            nome: esc.name || 'Sem nome',
            endereco: esc.address || '',
            latitude: Number.isNaN(lat) ? null : lat,
            longitude: Number.isNaN(lng) ? null : lng,
            manejo_id: null,
            validadeAutorizacao: (naoSeAplica || semDados) ? null : sheetRow.validadeISO,
            qtdRemocao: semDados ? 0 : sheetRow.qtdRemocao,
            qtdPoda:    semDados ? 0 : sheetRow.qtdPoda,
            naoSeAplica,
            daPlanilha: true,
            observacoes: sheetRow.observacoes,
            escolaOriginalPlanilha: sheetRow.escolaOriginal,
            timestampResposta: sheetRow.timestamp,
          };
        }

        // Fallback: dados do Supabase (escola ainda não respondeu a planilha)
        const manejo = Array.isArray(esc.manejo_arboreo)
          ? esc.manejo_arboreo[0]
          : esc.manejo_arboreo;

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
          daPlanilha: false,
          observacoes: '',
          escolaOriginalPlanilha: '',
          timestampResposta: null,
        };
      });

      setEscolas(dadosFormatados);
    } catch (err) {
      console.error('Erro ao inicializar página:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    carregarContextoEDados();
  }, []);

  const determinarStatus = (escola: Escola): StatusManejo => {
    if (escola.naoSeAplica) return 'NAO_SE_APLICA';
    if (!escola.validadeAutorizacao) {
      // Respondeu o Forms mas não preencheu a data de validade → pendente
      return escola.daPlanilha ? 'PENDENTE' : 'NAO_RESPONDIDO';
    }
    
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
    const stats = { validos: 0, vencidos: 0, naoRespondidos: 0, naoSeAplica: 0, pendentes: 0 };
    escolasFiltradas.forEach(escola => {
      const status = determinarStatus(escola);
      if (status === 'VALIDO') stats.validos++;
      else if (status === 'VENCIDO') stats.vencidos++;
      else if (status === 'PENDENTE') stats.pendentes++;
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
      case 'PENDENTE': return <TreePine size={size} className="text-amber-500 fill-amber-100" />;
      case 'NAO_RESPONDIDO': return <TreePine size={size} className="text-slate-400 fill-slate-100" />;
      case 'NAO_SE_APLICA': return <IconeNaoSeAplica />;
    }
  };

  const totais = useMemo(() => ({
    podas: escolas.reduce((s, e) => s + (e.naoSeAplica ? 0 : e.qtdPoda), 0),
    remocoes: escolas.reduce((s, e) => s + (e.naoSeAplica ? 0 : e.qtdRemocao), 0),
  }), [escolas]);

  if (loading && escolas.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[500px] gap-5">
        <div className="relative w-20 h-20">
          <div className="w-20 h-20 border-4 border-emerald-100 rounded-full" />
          <div className="absolute inset-0 w-20 h-20 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin" />
          <div className="absolute inset-0 flex items-center justify-center">
            <TreeDeciduous size={28} className="text-emerald-600" />
          </div>
        </div>
        <div className="text-center">
          <p className="font-black text-slate-700 text-xl">Carregando dados</p>
          <p className="text-slate-400 text-sm mt-1">Buscando informações de manejo arbóreo…</p>
        </div>
      </div>
    );
  }

  const escolasComCoordenadas = escolasFiltradas.filter(e => e.latitude !== null && e.longitude !== null);

  return (
    <div className="space-y-6">

      <style>{`
        .leaflet-container img { max-width: none !important; }
        .custom-leaflet-icon { background: transparent; border: none; }
        @keyframes custom-pulse {
          0% { transform: scale(0.95); opacity: 0.8; }
          50% { transform: scale(1.15); opacity: 0.3; }
          100% { transform: scale(0.95); opacity: 0.8; }
        }
      `}</style>

      {/* ── Banner principal ── */}
      <div className="rounded-2xl overflow-hidden shadow-xl" style={{ background: 'linear-gradient(135deg, #052e16 0%, #14532d 50%, #166534 100%)' }}>
        <div className="relative px-6 py-7 md:px-8">
          {/* textura de folhas no fundo */}
          <div className="absolute inset-0 opacity-[0.04]" style={{ backgroundImage: 'radial-gradient(circle at 20% 50%, #86efac 0%, transparent 50%), radial-gradient(circle at 80% 20%, #4ade80 0%, transparent 40%)', backgroundSize: '300px 300px' }} />
          <div className="relative flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-center gap-5">
              <div className="w-16 h-16 bg-emerald-500 rounded-2xl flex items-center justify-center shadow-2xl shadow-emerald-500/40 flex-shrink-0">
                <TreeDeciduous size={34} className="text-white" />
              </div>
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-[10px] font-black text-emerald-400 uppercase tracking-[0.2em] bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">Infraestrutura</span>
                  <span className="text-[10px] font-bold text-emerald-700 uppercase tracking-widest">Ambiental</span>
                </div>
                <h1 className="text-2xl md:text-3xl font-black text-white tracking-tight leading-tight">Manejo Arbóreo</h1>
                <p className="text-emerald-300/70 text-sm mt-1">
                  Gestão de podas e remoções nas unidades escolares
                  <span className="text-emerald-500/50"> • {escolas.length} unidades cadastradas</span>
                </p>
              </div>
            </div>

            {/* Toggle Mapa / Lista */}
            <div className="flex items-center gap-3">
              <div className="flex gap-1 bg-white/10 p-1 rounded-xl border border-white/10">
                <button
                  onClick={() => setModoVisao('MAPA')}
                  className={`flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-bold transition-all ${modoVisao === 'MAPA' ? 'bg-emerald-500 text-white shadow-md shadow-emerald-500/30' : 'text-emerald-200 hover:bg-white/10'}`}
                >
                  <MapIcon size={16} /> Mapa
                </button>
                <button
                  onClick={() => setModoVisao('LISTA')}
                  className={`flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-bold transition-all ${modoVisao === 'LISTA' ? 'bg-emerald-500 text-white shadow-md shadow-emerald-500/30' : 'text-emerald-200 hover:bg-white/10'}`}
                >
                  <List size={16} /> Lista
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Barra inferior do banner */}
        <div className="bg-black/20 px-8 py-3 flex flex-wrap items-center gap-6 border-t border-white/5">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 bg-emerald-400 rounded-full" />
            <span className="text-xs text-emerald-300/70 font-semibold">{estatisticas.validos} autorizações válidas</span>
          </div>
          <div className="h-3 w-px bg-white/10" />
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 bg-red-400 rounded-full" />
            <span className="text-xs text-emerald-300/70 font-semibold">{estatisticas.vencidos} vencidas</span>
          </div>
          <div className="h-3 w-px bg-white/10" />
          <span className="text-xs text-emerald-500/50">Fonte: Supabase • manejo_arboreo</span>
        </div>
      </div>

      {/* ── KPI Cards ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 xl:grid-cols-7 gap-4">
        {[
          { label: 'Autorizações Válidas',  value: estatisticas.validos,       icon: <CheckCircle size={20} className="text-emerald-500" />,                         bg: 'bg-emerald-50', border: 'border-emerald-200', text: 'text-emerald-700' },
          { label: 'Autorizações Vencidas', value: estatisticas.vencidos,       icon: <AlertCircle size={20} className="text-red-500" />,                             bg: 'bg-red-50',     border: 'border-red-200',     text: 'text-red-700'     },
          { label: 'Aguardando Validade',   value: estatisticas.pendentes,      icon: <HelpCircle size={20} className="text-amber-500" />,                            bg: 'bg-amber-50',   border: 'border-amber-200',   text: 'text-amber-700'   },
          { label: 'Sem Resposta',          value: estatisticas.naoRespondidos, icon: <HelpCircle size={20} className="text-slate-400" />,                            bg: 'bg-slate-50',   border: 'border-slate-200',   text: 'text-slate-600'   },
          { label: 'Não se Aplica',         value: estatisticas.naoSeAplica,    icon: <Triangle size={20} className="text-orange-500" fill="currentColor" />,         bg: 'bg-orange-50',  border: 'border-orange-200',  text: 'text-orange-700'  },
          { label: 'Total de Podas',        value: totais.podas,                icon: <TreePine size={20} className="text-teal-500" />,                               bg: 'bg-teal-50',    border: 'border-teal-200',    text: 'text-teal-700'    },
          { label: 'Total de Remoções',     value: totais.remocoes,             icon: <TreePine size={20} className="text-rose-500" />,                               bg: 'bg-rose-50',    border: 'border-rose-200',    text: 'text-rose-700'    },
        ].map((card, i) => (
          <div key={i} className={`bg-white rounded-2xl p-5 border ${card.border} shadow-sm hover:shadow-md transition-shadow`}>
            <div className="flex items-center justify-between mb-3">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-tight">{card.label}</p>
              <div className={`w-9 h-9 ${card.bg} rounded-xl flex items-center justify-center flex-shrink-0`}>{card.icon}</div>
            </div>
            <p className={`text-3xl font-black ${card.text}`}>{card.value}</p>
          </div>
        ))}
      </div>

      {/* ── Barra de Busca ── */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm px-5 py-4">
        <div className="relative max-w-sm">
          <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          <input
            type="text"
            placeholder="Pesquisar escola ou endereço…"
            value={termoBusca}
            onChange={(e) => setTermoBusca(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 transition-all bg-slate-50 focus:bg-white"
          />
        </div>
        {termoBusca && (
          <p className="text-xs text-slate-400 mt-2">
            <span className="font-bold text-slate-600">{escolasFiltradas.length}</span> resultado(s) para "{termoBusca}"
          </p>
        )}
      </div>

      {/* ── Área Principal (Mapa ou Lista) ── */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden min-h-[600px] relative z-0">

        {modoVisao === 'MAPA' ? (
          <div className="w-full h-[620px] relative">

            {/* Legenda */}
            <div className="absolute bottom-6 right-6 bg-white/97 backdrop-blur-sm p-4 rounded-2xl shadow-xl text-sm space-y-2.5 z-[1000] border border-slate-200">
              <p className="font-black text-slate-800 text-xs uppercase tracking-widest border-b border-slate-100 pb-2 mb-1">Legenda</p>
              <div className="flex items-center gap-2.5"><div className="w-3 h-3 rounded-full bg-emerald-400 flex-shrink-0" /><span className="text-slate-600 font-semibold text-xs">Válido</span></div>
              <div className="flex items-center gap-2.5"><div className="w-3 h-3 rounded-full bg-red-400 flex-shrink-0" /><span className="text-slate-600 font-semibold text-xs">Vencido</span></div>
              <div className="flex items-center gap-2.5"><div className="w-3 h-3 rounded-full bg-amber-400 flex-shrink-0" /><span className="text-slate-600 font-semibold text-xs">Aguard. Validade</span></div>
              <div className="flex items-center gap-2.5"><div className="w-3 h-3 rounded-full bg-slate-300 flex-shrink-0" /><span className="text-slate-600 font-semibold text-xs">Sem Resposta</span></div>
              <div className="flex items-center gap-2.5"><div className="w-3 h-3 rounded-full bg-orange-400 flex-shrink-0" /><span className="text-slate-600 font-semibold text-xs">Não se Aplica</span></div>
              {userRole === 'school_manager' && (
                <div className="flex items-center gap-2.5 pt-2 mt-1 border-t border-slate-100">
                  <div className="w-3 h-3 rounded-full bg-blue-200 border-2 border-blue-500 animate-pulse flex-shrink-0" />
                  <span className="text-slate-700 font-bold text-xs">Minha Escola</span>
                </div>
              )}
            </div>

            {/* Contador de pins visíveis */}
            <div className="absolute top-4 left-4 bg-white/95 backdrop-blur-sm px-3 py-2 rounded-xl shadow-lg z-[1000] border border-slate-200 flex items-center gap-2">
              <MapIcon size={14} className="text-emerald-600" />
              <span className="text-xs font-black text-slate-700">{escolasComCoordenadas.length} escola(s) no mapa</span>
            </div>

            {escolasComCoordenadas.length === 0 ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-50/80 z-20 text-center p-6">
                <div className="w-16 h-16 bg-emerald-100 text-emerald-500 rounded-2xl flex items-center justify-center mb-4">
                  {termoBusca ? <Search size={30} /> : <MapIcon size={30} />}
                </div>
                <h3 className="text-xl font-black text-slate-800">
                  {termoBusca ? 'Nenhuma escola encontrada' : 'Mapa Indisponível'}
                </h3>
                <p className="text-slate-500 max-w-md mt-2 text-sm leading-relaxed">
                  {termoBusca
                    ? `Pesquisa por "${termoBusca}" não retornou escolas com coordenadas.`
                    : 'Nenhuma escola com coordenadas cadastradas.'}
                </p>
              </div>
            ) : (
              <MapContainer
                center={[-23.4542, -46.5333]}
                zoom={12}
                style={{ height: '100%', width: '100%' }}
                scrollWheelZoom={true}
              >
                <TileLayer
                  attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />
                <MapBoundsUpdater escolas={escolasComCoordenadas} />
                {escolasComCoordenadas.map(escola => {
                  const isMinhaEscola = escola.id === userSchoolId;
                  const status = determinarStatus(escola);
                  const icon = getMarkerIcon(status, isMinhaEscola);
                  return (
                    <Marker key={escola.id} position={[escola.latitude!, escola.longitude!]} icon={icon}>
                      <Popup closeButton={false}>
                        <div className="p-1 min-w-[200px]">
                          <div className="flex items-start justify-between gap-2 mb-1">
                            <p className="font-black text-slate-800 text-[13px] leading-snug">{escola.nome}</p>
                            {escola.daPlanilha && (
                              <span title={`Planilha: ${escola.escolaOriginalPlanilha}`}>
                                <FileSpreadsheet size={14} className="text-emerald-500 flex-shrink-0 mt-0.5" />
                              </span>
                            )}
                          </div>
                          {isMinhaEscola && (
                            <p className="text-blue-600 font-bold text-[11px] mb-2 flex items-center gap-1">
                              <Star size={11} fill="currentColor" /> Minha Escola
                            </p>
                          )}
                          <div className="flex items-center gap-1.5 mt-1">
                            {renderIconeStatus(status, 14)}
                            <span className="text-[11px] font-bold text-slate-600">{status.replace(/_/g, ' ')}</span>
                          </div>
                          {!escola.naoSeAplica && (
                            <div className="flex gap-3 mt-2 pt-2 border-t border-slate-100 text-[11px] text-slate-500">
                              <span><b className="text-teal-600">{escola.qtdPoda}</b> poda(s)</span>
                              <span><b className="text-rose-600">{escola.qtdRemocao}</b> remoção(ões)</span>
                            </div>
                          )}
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
              <div className="flex flex-col items-center justify-center p-16 text-slate-400">
                <div className="w-16 h-16 bg-emerald-50 rounded-2xl flex items-center justify-center mb-4">
                  <Search size={30} className="text-emerald-300" />
                </div>
                <p className="font-bold text-slate-600">Nenhuma escola encontrada</p>
                <p className="text-sm mt-1">Pesquisa: "{termoBusca}"</p>
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-100">
                    <th className="text-left py-3.5 px-5 text-[11px] font-black text-slate-400 uppercase tracking-widest">Unidade Escolar</th>
                    <th className="text-left py-3.5 px-5 text-[11px] font-black text-slate-400 uppercase tracking-widest">Situação</th>
                    <th className="text-left py-3.5 px-5 text-[11px] font-black text-slate-400 uppercase tracking-widest">Validade</th>
                    <th className="text-center py-3.5 px-5 text-[11px] font-black text-slate-400 uppercase tracking-widest">Podas</th>
                    <th className="text-center py-3.5 px-5 text-[11px] font-black text-slate-400 uppercase tracking-widest">Remoções</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {escolasFiltradas.map(escola => {
                    const status = determinarStatus(escola);
                    const isMinhaEscola = escola.id === userSchoolId;

                    const statusConfig: Record<StatusManejo, { label: string; cls: string }> = {
                      VALIDO:         { label: 'Válido',              cls: 'bg-emerald-100 text-emerald-700' },
                      VENCIDO:        { label: 'Vencido',             cls: 'bg-red-100 text-red-700'         },
                      PENDENTE:       { label: 'Aguard. Validade',    cls: 'bg-amber-100 text-amber-700'     },
                      NAO_RESPONDIDO: { label: 'Sem Resposta',        cls: 'bg-slate-100 text-slate-600'     },
                      NAO_SE_APLICA:  { label: 'Não se Aplica',       cls: 'bg-orange-100 text-orange-700'   },
                    };

                    return (
                      <tr key={escola.id} className={`transition-colors ${isMinhaEscola ? 'bg-blue-50/40 hover:bg-blue-50/70' : 'hover:bg-emerald-50/30'}`}>
                        <td className="py-4 px-5">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="font-bold text-slate-800">{escola.nome}</p>
                            {isMinhaEscola && (
                              <span className="flex items-center gap-1 text-[10px] font-black bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full border border-blue-200">
                                <Star size={9} fill="currentColor" /> Minha Escola
                              </span>
                            )}
                            {escola.daPlanilha && (
                              <span className="flex items-center gap-1 text-[10px] font-black bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full border border-emerald-200" title={`Resposta: ${escola.timestampResposta?.toLocaleDateString('pt-BR') ?? ''}`}>
                                <FileSpreadsheet size={9} /> Planilha
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-slate-400 mt-0.5">{escola.endereco}</p>
                          {escola.observacoes && (
                            <p className="text-[11px] text-slate-500 mt-0.5 italic truncate max-w-xs" title={escola.observacoes}>"{escola.observacoes}"</p>
                          )}
                        </td>
                        <td className="py-4 px-5">
                          <div className="flex items-center gap-2">
                            {renderIconeStatus(status, 16)}
                            <span className={`text-[11px] font-black px-2.5 py-1 rounded-lg ${statusConfig[status].cls}`}>
                              {statusConfig[status].label}
                            </span>
                          </div>
                        </td>
                        <td className="py-4 px-5">
                          {escola.naoSeAplica
                            ? <span className="text-slate-300 text-xs">—</span>
                            : escola.validadeAutorizacao
                              ? <span className="font-semibold text-slate-700 text-sm">{new Date(escola.validadeAutorizacao + 'T12:00:00Z').toLocaleDateString('pt-BR')}</span>
                              : <span className="text-[11px] font-bold bg-amber-100 text-amber-700 px-2 py-0.5 rounded-lg">Pendente</span>
                          }
                        </td>
                        <td className="py-4 px-5 text-center">
                          {escola.naoSeAplica
                            ? <span className="text-slate-300 text-xs">—</span>
                            : <span className="inline-block font-black text-teal-700 bg-teal-50 border border-teal-100 px-3 py-1 rounded-lg text-sm min-w-[2.5rem]">{escola.qtdPoda}</span>
                          }
                        </td>
                        <td className="py-4 px-5 text-center">
                          {escola.naoSeAplica
                            ? <span className="text-slate-300 text-xs">—</span>
                            : <span className="inline-block font-black text-rose-700 bg-rose-50 border border-rose-100 px-3 py-1 rounded-lg text-sm min-w-[2.5rem]">{escola.qtdRemocao}</span>
                          }
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="bg-emerald-50/50 border-t-2 border-emerald-100">
                    <td colSpan={3} className="py-3 px-5 text-xs font-black text-slate-500 uppercase tracking-widest">
                      Totais ({escolasFiltradas.filter(e => !e.naoSeAplica).length} escolas com manejo)
                    </td>
                    <td className="py-3 px-5 text-center font-black text-teal-700">
                      {escolasFiltradas.reduce((s, e) => s + (e.naoSeAplica ? 0 : e.qtdPoda), 0)}
                    </td>
                    <td className="py-3 px-5 text-center font-black text-rose-700">
                      {escolasFiltradas.reduce((s, e) => s + (e.naoSeAplica ? 0 : e.qtdRemocao), 0)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
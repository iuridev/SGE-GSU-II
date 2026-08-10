import { useState, useEffect, useMemo } from 'react';
import Papa from 'papaparse';
import { supabase } from '../lib/supabase';
import { fetchObrasSheet, normalizeStatus, normalizeForMatch, type SheetSchool } from '../lib/obrasSheet';
import {
  Loader2, HardHat, Search, X, RefreshCw, ExternalLink, CalendarDays,
  School, Star, AlertTriangle, ImageIcon, TrendingUp, BarChart3, Clock,
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from 'recharts';

const CSV_URL = import.meta.env.VITE_ACOMPANHAMENTO_OBRAS_CSV_URL as string;
const VIEW_URL = import.meta.env.VITE_ACOMPANHAMENTO_OBRAS_VIEW_URL as string;

const RATING_COLORS: Record<number, string> = {
  1: '#ef4444', 2: '#f97316', 3: '#f59e0b', 4: '#84cc16', 5: '#10b981',
};

interface AcompanhamentoRow {
  id: string;
  timestamp: string;
  dataISO: string;
  escola: string;
  tipoObra: string;
  empresa: string;
  fiscal: string;
  dataAbertura: string;
  servicosExecutados: string;
  fotosCount: number;
  fotosUrls: string[];
  ocorrencia: string;
  temOcorrencia: boolean;
  avaliacao: number | null;
  responsavel: string;
}

const normalizeHeader = (s: string) =>
  s?.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim() || '';

const normalizeText = (s: string) =>
  s?.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[.,;!]/g, '').trim() || '';

// dd/mm/yyyy [hh:mm:ss] -> yyyy-mm-dd
function parseDateBR(raw: string): string {
  const m = raw?.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (!m) return '';
  const [, d, mo, y] = m;
  return `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`;
}

const OCORRENCIA_NEGATIVA = /^(nao|nenhuma?|n a|na|sem ocorrencia)\b/;

function parseRow(headers: string[], row: Record<string, string>): AcompanhamentoRow | null {
  const findKey = (terms: string[]) => headers.find(h => terms.some(t => normalizeHeader(h).includes(t)));

  const kTimestamp = findKey(['carimbo']);
  const kEscola = findKey(['selecione a ue']);
  const kTipoObra = findKey(['tipo de obra']);
  const kEmpresa = findKey(['constru']);
  const kFiscal = findKey(['fiscal']);
  const kAbertura = findKey(['abertura da obra']);
  const kServicos = findKey(['servicos executados']);
  const kFotos = findKey(['fotos']);
  const kOcorrencia = findKey(['ocorrencia']);
  const kAvaliacao = findKey(['andamento da obra']);
  const kResponsavel = findKey(['responsavel']);

  const escola = kEscola ? (row[kEscola] || '').trim() : '';
  if (!escola) return null;

  const timestampRaw = kTimestamp ? (row[kTimestamp] || '').trim() : '';
  const ocorrenciaRaw = kOcorrencia ? (row[kOcorrencia] || '').trim() : '';
  const fotosRaw = kFotos ? (row[kFotos] || '').trim() : '';
  const fotosUrls = fotosRaw ? fotosRaw.split(',').map(u => u.trim()).filter(Boolean) : [];
  const avaliacaoNum = kAvaliacao ? parseInt((row[kAvaliacao] || '').trim(), 10) : NaN;

  return {
    id: `${timestampRaw}-${escola}`,
    timestamp: timestampRaw,
    dataISO: parseDateBR(timestampRaw),
    escola,
    tipoObra: kTipoObra ? (row[kTipoObra] || '').trim() : '',
    empresa: kEmpresa ? (row[kEmpresa] || '').trim() : '',
    fiscal: kFiscal ? (row[kFiscal] || '').trim() : '',
    dataAbertura: kAbertura ? (row[kAbertura] || '').trim() : '',
    servicosExecutados: kServicos ? (row[kServicos] || '').trim() : '',
    fotosCount: fotosUrls.length,
    fotosUrls,
    ocorrencia: ocorrenciaRaw,
    temOcorrencia: normalizeText(ocorrenciaRaw) !== '' && !OCORRENCIA_NEGATIVA.test(normalizeText(ocorrenciaRaw)),
    avaliacao: Number.isFinite(avaliacaoNum) && avaliacaoNum >= 1 && avaliacaoNum <= 5 ? avaliacaoNum : null,
    responsavel: kResponsavel ? (row[kResponsavel] || '').trim() : '',
  };
}

function fetchAcompanhamentoCSV(): Promise<AcompanhamentoRow[]> {
  return new Promise((resolve, reject) => {
    if (!CSV_URL) {
      console.warn('VITE_ACOMPANHAMENTO_OBRAS_CSV_URL não configurada.');
      resolve([]);
      return;
    }
    Papa.parse<Record<string, string>>(CSV_URL, {
      download: true,
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const headers = results.meta.fields || [];
        const rows = results.data
          .map(r => parseRow(headers, r))
          .filter((r): r is AcompanhamentoRow => r !== null)
          .sort((a, b) => (b.dataISO || '').localeCompare(a.dataISO || ''));
        resolve(rows);
      },
      error: (err) => reject(err),
    });
  });
}

function schoolMatches(a: string, b: string): boolean {
  const na = normalizeForMatch(a);
  const nb = normalizeForMatch(b);
  if (!na || !nb) return false;
  return na === nb || na.includes(nb) || nb.includes(na);
}

export default function AcompanhamentoObras() {
  const [rows, setRows] = useState<AcompanhamentoRow[]>([]);
  const [obrasAtivas, setObrasAtivas] = useState<{ nome: string }[]>([]);
  const [loading, setLoading] = useState(true);

  const [searchTerm, setSearchTerm] = useState('');
  const [onlyAtencao, setOnlyAtencao] = useState(false);

  useEffect(() => {
    fetchAll();
  }, []);

  const fetchAll = async () => {
    setLoading(true);
    try {
      const [csvResult, schoolsResult] = await Promise.allSettled([
        fetchAcompanhamentoCSV(),
        (supabase as any).from('schools').select('id, name').order('name'),
      ]);

      if (csvResult.status === 'fulfilled') setRows(csvResult.value);
      else console.error('Erro ao buscar respostas do formulário:', csvResult.reason);

      if (schoolsResult.status === 'fulfilled') {
        const schools: SheetSchool[] = schoolsResult.value?.data || [];
        try {
          const obras = await fetchObrasSheet(schools);
          const emAndamento = obras.filter(o => normalizeStatus(o.status) === 'EM ANDAMENTO');
          const uniqueNames = new Map<string, string>();
          emAndamento.forEach(o => {
            const display = o.matchedSchoolName || o.escola;
            uniqueNames.set(normalizeForMatch(display), display);
          });
          setObrasAtivas(Array.from(uniqueNames.values()).map(nome => ({ nome })));
        } catch (e) {
          console.error('Erro ao buscar planilha de obras para cruzamento:', e);
        }
      }
    } finally {
      setLoading(false);
    }
  };

  const now = new Date();
  const sevenDaysAgoISO = new Date(now.getTime() - 7 * 86400000).toISOString().split('T')[0];

  const registrosNaSemana = useMemo(
    () => rows.filter(r => r.dataISO && r.dataISO >= sevenDaysAgoISO),
    [rows, sevenDaysAgoISO],
  );

  const escolasAcompanhadas = useMemo(
    () => new Set(rows.map(r => normalizeForMatch(r.escola)).filter(Boolean)).size,
    [rows],
  );

  const avaliacaoMedia = useMemo(() => {
    const validas = rows.filter(r => r.avaliacao !== null);
    if (!validas.length) return null;
    return validas.reduce((s, r) => s + (r.avaliacao || 0), 0) / validas.length;
  }, [rows]);

  const registrosAtencao = useMemo(
    () => rows.filter(r => r.temOcorrencia || (r.avaliacao !== null && r.avaliacao <= 2)),
    [rows],
  );

  // Obras em andamento (planilha de Obras) sem nenhum registro de acompanhamento
  // nos últimos 7 dias — sinaliza que a escola pode não estar respondendo o formulário semanal.
  const obrasSemAtualizacao = useMemo(() => {
    return obrasAtivas
      .map(o => {
        const registrosDaEscola = rows.filter(r => schoolMatches(r.escola, o.nome));
        const ultima = registrosDaEscola.reduce<string | null>((max, r) => {
          if (!r.dataISO) return max;
          return !max || r.dataISO > max ? r.dataISO : max;
        }, null);
        const dias = ultima
          ? Math.floor((now.getTime() - new Date(`${ultima}T00:00:00`).getTime()) / 86400000)
          : null;
        return { nome: o.nome, ultima, dias };
      })
      .filter(o => o.dias === null || o.dias > 7)
      .sort((a, b) => {
        if (a.dias === null && b.dias === null) return a.nome.localeCompare(b.nome);
        if (a.dias === null) return -1;
        if (b.dias === null) return 1;
        return b.dias - a.dias;
      });
  }, [obrasAtivas, rows]);

  const chartByWeek = useMemo(() => {
    const weeks: { label: string; startISO: string; total: number }[] = [];
    for (let i = 7; i >= 0; i--) {
      const ref = new Date(now);
      ref.setDate(ref.getDate() - i * 7);
      const day = ref.getDay();
      const diffToMonday = day === 0 ? -6 : 1 - day;
      const monday = new Date(ref);
      monday.setDate(ref.getDate() + diffToMonday);
      const startISO = monday.toISOString().split('T')[0];
      const label = monday.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
      weeks.push({ label, startISO, total: 0 });
    }
    rows.forEach(r => {
      if (!r.dataISO) return;
      for (let i = weeks.length - 1; i >= 0; i--) {
        if (r.dataISO >= weeks[i].startISO) {
          weeks[i].total++;
          break;
        }
      }
    });
    return weeks;
  }, [rows]);

  const chartByAvaliacao = useMemo(() => {
    const counts = [1, 2, 3, 4, 5].map(nota => ({
      nota: `Nota ${nota}`,
      total: rows.filter(r => r.avaliacao === nota).length,
      fill: RATING_COLORS[nota],
    }));
    return counts;
  }, [rows]);

  const filtered = useMemo(() => {
    return rows.filter(r => {
      const q = searchTerm.toLowerCase();
      const matchSearch =
        !searchTerm ||
        r.escola.toLowerCase().includes(q) ||
        r.empresa.toLowerCase().includes(q) ||
        r.fiscal.toLowerCase().includes(q) ||
        r.responsavel.toLowerCase().includes(q);
      const matchAtencao = !onlyAtencao || r.temOcorrencia || (r.avaliacao !== null && r.avaliacao <= 2);
      return matchSearch && matchAtencao;
    });
  }, [rows, searchTerm, onlyAtencao]);

  const formatDate = (iso: string) => {
    if (!iso) return '-';
    const p = iso.split('-');
    return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : iso;
  };

  const ratingBadge = (nota: number | null) => {
    if (nota === null) return 'bg-slate-50 text-slate-400 border-slate-200';
    if (nota <= 2) return 'bg-red-50 text-red-700 border-red-200';
    if (nota === 3) return 'bg-amber-50 text-amber-700 border-amber-200';
    return 'bg-emerald-50 text-emerald-700 border-emerald-200';
  };

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <HardHat className="text-orange-500" size={28} />
            Acompanhamento Semanal de Obras
          </h1>
          <p className="text-slate-500 text-sm mt-1">
            Respostas do formulário semanal preenchido pelas escolas com obras em andamento
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={fetchAll}
            className="flex items-center gap-2 px-3 py-2 text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors text-sm"
          >
            <RefreshCw size={16} />
            Atualizar
          </button>
          {VIEW_URL && (
            <a
              href={VIEW_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 px-3 py-2 text-emerald-700 border border-emerald-200 bg-emerald-50 rounded-lg hover:bg-emerald-100 transition-colors text-sm font-medium"
            >
              <ExternalLink size={16} />
              Abrir Respostas
            </a>
          )}
        </div>
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          {
            label: 'Total de Registros',
            value: rows.length,
            icon: <BarChart3 size={20} className="text-blue-600" />,
            bg: 'bg-blue-50',
          },
          {
            label: 'Registros (7 dias)',
            value: registrosNaSemana.length,
            icon: <CalendarDays size={20} className="text-emerald-600" />,
            bg: 'bg-emerald-50',
          },
          {
            label: 'Escolas Acompanhadas',
            value: escolasAcompanhadas,
            icon: <School size={20} className="text-violet-600" />,
            bg: 'bg-violet-50',
          },
          {
            label: 'Avaliação Média',
            value: avaliacaoMedia !== null ? avaliacaoMedia.toFixed(1) : '-',
            icon: <Star size={20} className="text-amber-600" />,
            bg: 'bg-amber-50',
          },
        ].map(card => (
          <div key={card.label} className="bg-white rounded-xl border border-slate-100 shadow-sm p-4">
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-lg ${card.bg} flex items-center justify-center shrink-0`}>
                {card.icon}
              </div>
              <div>
                <p className="text-xs text-slate-500 font-medium">{card.label}</p>
                <p className="text-2xl font-bold text-slate-800">{card.value}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Obras sem atualização recente */}
      <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-4">
        <h2 className="text-sm font-semibold text-slate-700 mb-1 flex items-center gap-2">
          <Clock size={16} className="text-red-500" />
          Obras em Andamento sem Atualização Recente
        </h2>
        <p className="text-xs text-slate-400 mb-4">
          Cruza a planilha de Obras e Reformas (status "Em Andamento") com as respostas do formulário semanal.
        </p>
        {loading ? (
          <div className="flex justify-center items-center py-10">
            <Loader2 size={24} className="animate-spin text-orange-500" />
          </div>
        ) : obrasSemAtualizacao.length === 0 ? (
          <p className="text-sm text-slate-400 text-center py-6">
            Todas as obras em andamento têm registro nos últimos 7 dias.
          </p>
        ) : (
          <div className="divide-y divide-slate-50">
            {obrasSemAtualizacao.slice(0, 8).map(o => (
              <div key={o.nome} className="flex items-center justify-between gap-3 py-2.5">
                <p className="text-sm font-medium text-slate-800 truncate">{o.nome}</p>
                <p className="text-xs text-red-500 shrink-0">
                  {o.dias === null ? 'Nunca respondeu' : `${o.dias} dia(s) sem atualização`}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-4">
          <h2 className="text-sm font-semibold text-slate-700 mb-4 flex items-center gap-2">
            <TrendingUp size={16} className="text-emerald-500" />
            Registros por Semana (últimas 8 semanas)
          </h2>
          {loading ? (
            <div className="flex items-center justify-center h-[220px] text-slate-400 text-sm">
              <Loader2 size={24} className="animate-spin" />
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={chartByWeek} margin={{ top: 0, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                <Tooltip formatter={(v) => [v, 'Registros']} labelFormatter={l => `Semana de ${l}`} />
                <Bar dataKey="total" fill="#0d9488" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-4">
          <h2 className="text-sm font-semibold text-slate-700 mb-4 flex items-center gap-2">
            <Star size={16} className="text-amber-500" />
            Distribuição da Avaliação do Andamento
          </h2>
          {loading ? (
            <div className="flex items-center justify-center h-[220px] text-slate-400 text-sm">
              <Loader2 size={24} className="animate-spin" />
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={chartByAvaliacao} margin={{ top: 0, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="nota" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                <Tooltip formatter={(v) => [v, 'Registros']} />
                <Bar dataKey="total" radius={[4, 4, 0, 0]}>
                  {chartByAvaliacao.map((entry, i) => (
                    <Cell key={i} fill={entry.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Registros que precisam de atenção */}
      {registrosAtencao.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-4">
          <h2 className="text-sm font-semibold text-slate-700 mb-1 flex items-center gap-2">
            <AlertTriangle size={16} className="text-amber-500" />
            Registros que Precisam de Atenção
          </h2>
          <p className="text-xs text-slate-400 mb-4">
            Ocorrências relatadas ou avaliação de andamento baixa (nota 1 ou 2).
          </p>
          <div className="divide-y divide-slate-50">
            {registrosAtencao.slice(0, 8).map(r => (
              <div key={r.id} className="py-2.5">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-medium text-slate-800 truncate">{r.escola}</p>
                  <div className="flex items-center gap-2 shrink-0">
                    {r.avaliacao !== null && (
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${ratingBadge(r.avaliacao)}`}>
                        Nota {r.avaliacao}
                      </span>
                    )}
                    <span className="text-xs text-slate-400">{formatDate(r.dataISO)}</span>
                  </div>
                </div>
                {r.temOcorrencia && (
                  <p className="text-xs text-slate-500 mt-1 truncate">{r.ocorrencia}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Filters + Table */}
      <div className="bg-white rounded-xl border border-slate-100 shadow-sm">
        <div className="p-4 border-b border-slate-100 flex flex-wrap gap-3 items-center">
          <div className="relative flex-1 min-w-[200px]">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Buscar escola, empresa, fiscal ou responsável..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
          </div>
          <label className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer">
            <input
              type="checkbox"
              checked={onlyAtencao}
              onChange={e => setOnlyAtencao(e.target.checked)}
              className="rounded border-slate-300 text-teal-600 focus:ring-teal-500"
            />
            Somente com atenção
          </label>
          {(searchTerm || onlyAtencao) && (
            <button
              onClick={() => { setSearchTerm(''); setOnlyAtencao(false); }}
              className="flex items-center gap-1 text-sm text-slate-500 hover:text-red-500 transition-colors"
            >
              <X size={14} /> Limpar
            </button>
          )}
          <span className="text-xs text-slate-400 ml-auto">{filtered.length} registro(s)</span>
        </div>

        <div className="overflow-x-auto">
          {loading ? (
            <div className="flex justify-center items-center py-16">
              <Loader2 size={32} className="animate-spin text-orange-500" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-16 text-slate-400">
              <HardHat size={48} className="mx-auto mb-3 opacity-30" />
              <p className="text-sm">
                {rows.length === 0
                  ? 'Nenhum registro encontrado. Verifique se o formulário já recebeu respostas.'
                  : 'Nenhum registro encontrado com os filtros aplicados'}
              </p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50">
                  {['Data', 'Escola', 'Tipo de Obra', 'Empresa', 'Fiscal', 'Serviços Executados (7 dias)', 'Avaliação', 'Fotos', 'Responsável'].map(h => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {filtered.map((r, i) => (
                  <tr key={r.id || i} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3 text-slate-700 whitespace-nowrap">{formatDate(r.dataISO)}</td>
                    <td className="px-4 py-3 font-medium text-slate-800">{r.escola}</td>
                    <td className="px-4 py-3 text-slate-600 max-w-[180px] truncate" title={r.tipoObra}>{r.tipoObra || '-'}</td>
                    <td className="px-4 py-3 text-slate-600">{r.empresa || '-'}</td>
                    <td className="px-4 py-3 text-slate-600">{r.fiscal || '-'}</td>
                    <td className="px-4 py-3 text-slate-500 max-w-xs truncate" title={r.servicosExecutados}>{r.servicosExecutados || '-'}</td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {r.avaliacao !== null ? (
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${ratingBadge(r.avaliacao)}`}>
                          {r.avaliacao}
                        </span>
                      ) : '-'}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {r.fotosUrls.length > 0 ? (
                        <a
                          href={r.fotosUrls[0]}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-xs text-teal-700 hover:underline"
                        >
                          <ImageIcon size={13} /> {r.fotosUrls.length}
                        </a>
                      ) : '-'}
                    </td>
                    <td className="px-4 py-3 text-slate-600 whitespace-nowrap">{r.responsavel || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Building2, Calendar, ChevronLeft, ChevronRight, Clock, Users } from 'lucide-react';

interface Ambiente {
  id: string;
  nome: string;
  capacidade: number;
}

interface Agendamento {
  id: string;
  titulo_evento: string;
  user_name: string;
  hora_inicio: string;
  hora_fim: string;
  data_agendamento: string;
  quantidade_pessoas: number;
  status: 'pendente' | 'aprovado' | 'reprovado' | 'cancelado';
}

function toDateStr(date: Date) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(date);
}

function formatDateLabel(date: Date, mode: 'dia' | 'semana') {
  if (mode === 'dia') {
    return date.toLocaleDateString('pt-BR', {
      weekday: 'long', day: '2-digit', month: 'long', year: 'numeric',
      timeZone: 'America/Sao_Paulo',
    });
  }
  const end = new Date(date.getTime() + 6 * 86400000);
  return `${date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', timeZone: 'America/Sao_Paulo' })} – ${end.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'America/Sao_Paulo' })}`;
}

function startOfWeek(date: Date) {
  const d = new Date(date);
  const day = d.getDay();
  d.setDate(d.getDate() - day);
  return d;
}

export function AgendaPublica({ ambienteId }: { ambienteId: string }) {
  const [ambiente, setAmbiente] = useState<Ambiente | null>(null);
  const [agendamentos, setAgendamentos] = useState<Agendamento[]>([]);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<'dia' | 'semana'>('dia');

  useEffect(() => {
    supabase
      .from('ambientes')
      .select('id, nome, capacidade')
      .eq('id', ambienteId)
      .single()
      .then(({ data }) => setAmbiente(data));
  }, [ambienteId]);

  useEffect(() => {
    async function fetch() {
      setLoading(true);
      let query = supabase
        .from('agendamentos_ambientes')
        .select('id, titulo_evento, user_name, hora_inicio, hora_fim, data_agendamento, quantidade_pessoas, status')
        .eq('ambiente_id', ambienteId)
        .in('status', ['aprovado', 'pendente'])
        .order('data_agendamento')
        .order('hora_inicio');

      if (viewMode === 'dia') {
        query = query.eq('data_agendamento', toDateStr(selectedDate));
      } else {
        const weekStart = startOfWeek(selectedDate);
        const weekEnd = new Date(weekStart.getTime() + 6 * 86400000);
        query = query
          .gte('data_agendamento', toDateStr(weekStart))
          .lte('data_agendamento', toDateStr(weekEnd));
      }

      const { data } = await query;
      setAgendamentos(data || []);
      setLoading(false);
    }
    fetch();
  }, [ambienteId, selectedDate, viewMode]);

  function navigate(dir: 1 | -1) {
    const delta = (viewMode === 'dia' ? 1 : 7) * dir * 86400000;
    setSelectedDate(d => new Date(d.getTime() + delta));
  }

  function goToday() {
    setSelectedDate(new Date());
  }

  const groupedByDate = agendamentos.reduce<Record<string, Agendamento[]>>((acc, ag) => {
    if (!acc[ag.data_agendamento]) acc[ag.data_agendamento] = [];
    acc[ag.data_agendamento].push(ag);
    return acc;
  }, {});

  const sortedDates = Object.keys(groupedByDate).sort();

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-blue-50 p-4 flex flex-col items-center">
      <div className="w-full max-w-lg">

        {/* Header */}
        <div className="text-center mb-6 pt-4">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-indigo-600 rounded-2xl mb-3 shadow-lg shadow-indigo-200">
            <Building2 size={28} className="text-white" />
          </div>
          <h1 className="text-2xl font-black text-slate-800 uppercase tracking-tight">
            {ambiente?.nome ?? '...'}
          </h1>
          {ambiente && (
            <p className="text-sm text-slate-500 font-bold mt-1 flex items-center justify-center gap-1">
              <Users size={13} /> Capacidade: {ambiente.capacidade} pessoas
            </p>
          )}
          <p className="text-xs text-slate-400 font-bold mt-2 uppercase tracking-widest">Agenda de Reservas</p>
        </div>

        {/* View mode toggle */}
        <div className="flex gap-1 p-1.5 bg-white rounded-2xl border border-slate-200 shadow-sm mb-3">
          {(['dia', 'semana'] as const).map(m => (
            <button
              key={m}
              onClick={() => { setViewMode(m); setSelectedDate(new Date()); }}
              className={`flex-1 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${viewMode === m ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-slate-600'}`}
            >
              {m === 'dia' ? 'Hoje' : 'Semana'}
            </button>
          ))}
        </div>

        {/* Date navigation */}
        <div className="flex items-center justify-between mb-4 bg-white rounded-2xl border border-slate-200 px-3 py-2.5 shadow-sm">
          <button onClick={() => navigate(-1)} className="p-2 hover:bg-slate-100 rounded-xl transition-colors">
            <ChevronLeft size={20} className="text-slate-600" />
          </button>
          <button onClick={goToday} className="text-center flex-1 hover:bg-slate-50 rounded-xl py-1 transition-colors">
            <p className="text-sm font-black text-slate-700 capitalize leading-tight">
              {formatDateLabel(viewMode === 'semana' ? startOfWeek(selectedDate) : selectedDate, viewMode)}
            </p>
          </button>
          <button onClick={() => navigate(1)} className="p-2 hover:bg-slate-100 rounded-xl transition-colors">
            <ChevronRight size={20} className="text-slate-600" />
          </button>
        </div>

        {/* Schedules */}
        {loading ? (
          <div className="flex justify-center py-16">
            <div className="w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : agendamentos.length === 0 ? (
          <div className="text-center py-16 bg-white rounded-3xl border border-dashed border-slate-200 shadow-sm">
            <Calendar size={44} className="text-slate-200 mx-auto mb-3" />
            <p className="font-black text-slate-400 uppercase tracking-widest text-sm">Nenhuma reserva</p>
            <p className="text-xs text-slate-400 mt-1.5">Este ambiente está disponível</p>
          </div>
        ) : viewMode === 'dia' ? (
          <div className="space-y-3">
            {agendamentos.map(ag => (
              <AgendamentoCard key={ag.id} ag={ag} />
            ))}
          </div>
        ) : (
          <div className="space-y-5">
            {sortedDates.map(dateStr => {
              const d = new Date(dateStr + 'T12:00:00');
              return (
                <div key={dateStr}>
                  <p className="text-xs font-black text-slate-400 uppercase tracking-widest mb-2 pl-1 capitalize">
                    {d.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'short', timeZone: 'UTC' })}
                  </p>
                  <div className="space-y-3">
                    {groupedByDate[dateStr].map(ag => (
                      <AgendamentoCard key={ag.id} ag={ag} />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <p className="text-center text-xs text-slate-400 font-bold mt-8 mb-4">
          SGE-GSU · Atualizado {new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
        </p>
      </div>
    </div>
  );
}

function AgendamentoCard({ ag }: { ag: Agendamento }) {
  const aprovado = ag.status === 'aprovado';
  return (
    <div className={`bg-white rounded-2xl border p-4 shadow-sm ${aprovado ? 'border-green-100' : 'border-yellow-100'}`}>
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex-1 min-w-0">
          <p className="font-black text-slate-800 text-base leading-tight truncate">{ag.titulo_evento}</p>
          <p className="text-xs text-slate-500 font-semibold mt-0.5 truncate">{ag.user_name}</p>
        </div>
        <span className={`text-[10px] font-black px-2 py-1 rounded-lg uppercase tracking-wide shrink-0 ${aprovado ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
          {aprovado ? 'Aprovado' : 'Pendente'}
        </span>
      </div>
      <div className="flex items-center gap-4">
        <span className="flex items-center gap-1.5 text-sm font-black text-indigo-600">
          <Clock size={14} />
          {ag.hora_inicio} – {ag.hora_fim}
        </span>
        <span className="flex items-center gap-1.5 text-xs font-semibold text-slate-400">
          <Users size={13} />
          {ag.quantidade_pessoas} {ag.quantidade_pessoas === 1 ? 'pessoa' : 'pessoas'}
        </span>
      </div>
    </div>
  );
}

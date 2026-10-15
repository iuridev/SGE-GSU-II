// Busca das fontes da Agenda Unificada (efeito colateral — as regras puras
// ficam em agendaUnificada.ts). Compartilhada pelo modal do topo
// (AgendaUnificadaModal) e pelo Cronograma SEOM/SEFISC, para os dois
// mostrarem sempre os mesmos eventos.
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from './supabase';
import { fetchObrasSheet } from './obrasSheet';
import { type AgendaItem, parseDataFlexivel } from './agendaUnificada';

const db = supabase as unknown as SupabaseClient;

interface AmbienteRow { id: string; data_agendamento: string | null; hora_inicio: string | null; hora_fim: string | null; titulo_evento: string | null; user_name: string | null; status: string; ambientes: { nome: string | null } | null }
interface CarroRow { id: string; service_date: string | null; requester_name: string | null; status: string | null }
interface ReuniaoRow { id: string; title: string | null; event_type: string | null; date: string | null; time: string | null; schools: { name: string | null } | null }
interface VisitaFiscalRow { id: string; status: string; dataAgendada: string | null; escolaId: string; motivo?: string }
interface VisitaEscolarRow { id: string; data_visita: string | null; escola_nome?: string; objetivo?: string; visitante?: string }

// Busca as 6 fontes em paralelo, cada uma com seu próprio try/catch: se uma
// fonte falhar (ex.: planilha fora do ar), as outras continuam aparecendo —
// só a fonte com problema é reportada em `onErro`.
export async function fetchAgendaUnificada(onErro: (fonte: string) => void): Promise<AgendaItem[]> {
  const resultado: AgendaItem[] = [];
  const { data: schoolsData } = await db.from('schools').select('id, name');
  const schools = (schoolsData || []) as { id: string; name: string }[];
  const schoolName = (id: string) => schools.find(s => s.id === id)?.name || id;

  const fonte = async (nome: string, buscar: () => Promise<void>) => {
    try {
      await buscar();
    } catch (err) {
      console.error(`Agenda Unificada: erro ao buscar ${nome}`, err);
      onErro(nome);
    }
  };

  await Promise.all([
    fonte('Reservas de Ambiente', async () => {
      const { data, error } = await db
        .from('agendamentos_ambientes')
        .select('id, data_agendamento, hora_inicio, hora_fim, titulo_evento, user_name, status, ambientes(nome)')
        .in('status', ['pendente', 'aprovado']);
      if (error) throw error;
      ((data || []) as unknown as AmbienteRow[]).forEach(a => {
        if (!a.data_agendamento) return;
        resultado.push({
          id: `amb-${a.id}`, tipo: 'ambiente', data: a.data_agendamento, hora: a.hora_inicio || undefined,
          titulo: `${a.ambientes?.nome || 'Ambiente'} — ${a.titulo_evento || 'Reserva'}`,
          subtitulo: `${a.user_name || ''} · ${a.hora_inicio || ''}${a.hora_fim ? `–${a.hora_fim}` : ''} · ${a.status === 'pendente' ? 'Pendente' : 'Aprovado'}`,
        });
      });
    }),

    fonte('Carros Oficiais', async () => {
      const { data, error } = await db.from('car_schedules').select('id, service_date, requester_name, status');
      if (error) throw error;
      ((data || []) as CarroRow[]).forEach(c => {
        if (!c.service_date) return;
        resultado.push({
          id: `car-${c.id}`, tipo: 'carro', data: c.service_date,
          titulo: `Carro Oficial — ${c.requester_name || 'Sem nome'}`,
          subtitulo: c.status || '',
        });
      });
    }),

    fonte('Calendário/Reuniões', async () => {
      const { data, error } = await db.from('meetings').select('id, title, event_type, date, time, schools(name)');
      if (error) throw error;
      ((data || []) as unknown as ReuniaoRow[]).forEach(m => {
        if (!m.date) return;
        resultado.push({
          id: `reu-${m.id}`, tipo: 'reuniao', data: m.date, hora: m.time || undefined,
          titulo: m.title || m.event_type || 'Evento',
          subtitulo: [m.schools?.name, m.time].filter(Boolean).join(' · '),
        });
      });
    }),

    fonte('Visita Técnica da Fiscalização', async () => {
      const { data, error } = await supabase.functions.invoke('google-sheets-fiscalizacao-terceirizados', { method: 'GET' });
      if (error) throw error;
      const visitas: VisitaFiscalRow[] = Array.isArray(data?.visitRequests) ? data.visitRequests : [];
      visitas
        .filter(v => v.status === 'agendada' && v.dataAgendada)
        .forEach(v => {
          resultado.push({
            id: `visf-${v.id}`, tipo: 'visita_fiscal', data: v.dataAgendada!,
            titulo: `Visita Técnica — ${schoolName(v.escolaId)}`,
            subtitulo: v.motivo || '',
          });
        });
    }),

    fonte('Obras', async () => {
      const obras = await fetchObrasSheet(schools);
      obras.forEach((o, idx) => {
        const nomeEscola = o.matchedSchoolName || o.escola;
        const inicio = parseDataFlexivel(o.dataInicio);
        if (inicio) {
          resultado.push({ id: `obra-ini-${idx}`, tipo: 'obra', data: inicio, titulo: `Início de Obra — ${nomeEscola}`, subtitulo: o.obra });
        }
        const termino = parseDataFlexivel(o.previsaoTermino);
        if (termino) {
          resultado.push({ id: `obra-fim-${idx}`, tipo: 'obra', data: termino, titulo: `Previsão de Término — ${nomeEscola}`, subtitulo: o.obra });
        }
      });
    }),

    fonte('Visitas Escolares', async () => {
      const { data, error } = await supabase.functions.invoke('google-sheets-visitas', { method: 'GET' });
      if (error) throw error;
      const visitas: VisitaEscolarRow[] = Array.isArray(data) ? data : [];
      visitas.forEach(v => {
        if (!v.data_visita) return;
        resultado.push({
          id: `esc-${v.id}`, tipo: 'visita_escolar', data: v.data_visita,
          titulo: `Visita Escolar — ${v.escola_nome || ''}`,
          subtitulo: [v.objetivo, v.visitante].filter(Boolean).join(' · '),
        });
      });
    }),
  ]);

  return resultado;
}

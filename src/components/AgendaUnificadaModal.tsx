import { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import toast from 'react-hot-toast';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { addTimbradoAllPages } from '../lib/pdfTimbrado';
import { fetchObrasSheet } from '../lib/obrasSheet';
import { X, ChevronLeft, ChevronRight, FileDown, Loader2, CalendarDays } from 'lucide-react';
import {
  type AgendaItem, AGENDA_TIPOS,
  parseDataFlexivel, groupAgendaItemsByDate, filterAgendaItemsByMonth,
} from '../lib/agendaUnificada';

const MONTHS = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const WEEKDAYS = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB'];

const TIPO_COR: Record<string, string> = Object.fromEntries(AGENDA_TIPOS.map(t => [t.tipo, t.cor]));
const TIPO_LABEL: Record<string, string> = Object.fromEntries(AGENDA_TIPOS.map(t => [t.tipo, t.label]));

interface Props {
  onClose: () => void;
}

export function AgendaUnificadaModal({ onClose }: Props) {
  const [loading, setLoading] = useState(true);
  const [gerandoPdf, setGerandoPdf] = useState(false);
  const [items, setItems] = useState<AgendaItem[]>([]);
  const [refDate, setRefDate] = useState(new Date());
  const [diaSelecionado, setDiaSelecionado] = useState<string | null>(null);

  useEffect(() => { fetchTudo(); }, []);

  // Busca as 6 fontes em paralelo, cada uma com seu próprio try/catch: se
  // uma fonte falhar (ex.: planilha fora do ar), as outras continuam
  // aparecendo normalmente — só a fonte com problema vira um toast de erro.
  async function fetchTudo() {
    setLoading(true);
    const resultado: AgendaItem[] = [];
    const { data: schoolsData } = await (supabase as any).from('schools').select('id, name');
    const schools = schoolsData || [];
    const schoolName = (id: string) => schools.find((s: any) => s.id === id)?.name || id;

    await Promise.all([
      (async () => {
        try {
          const { data, error } = await (supabase as any)
            .from('agendamentos_ambientes')
            .select('id, data_agendamento, hora_inicio, hora_fim, titulo_evento, user_name, status, ambientes(nome)')
            .in('status', ['pendente', 'aprovado']);
          if (error) throw error;
          (data || []).forEach((a: any) => {
            if (!a.data_agendamento) return;
            resultado.push({
              id: `amb-${a.id}`, tipo: 'ambiente', data: a.data_agendamento, hora: a.hora_inicio,
              titulo: `${a.ambientes?.nome || 'Ambiente'} — ${a.titulo_evento || 'Reserva'}`,
              subtitulo: `${a.user_name || ''} · ${a.hora_inicio || ''}${a.hora_fim ? `–${a.hora_fim}` : ''} · ${a.status === 'pendente' ? 'Pendente' : 'Aprovado'}`,
            });
          });
        } catch (err) {
          console.error('Agenda Unificada: erro ao buscar Reservas de Ambiente', err);
          toast.error('Não foi possível carregar Reservas de Ambiente.');
        }
      })(),

      (async () => {
        try {
          const { data, error } = await (supabase as any).from('car_schedules').select('id, service_date, requester_name, status');
          if (error) throw error;
          (data || []).forEach((c: any) => {
            if (!c.service_date) return;
            resultado.push({
              id: `car-${c.id}`, tipo: 'carro', data: c.service_date,
              titulo: `Carro Oficial — ${c.requester_name || 'Sem nome'}`,
              subtitulo: c.status || '',
            });
          });
        } catch (err) {
          console.error('Agenda Unificada: erro ao buscar Carros Oficiais', err);
          toast.error('Não foi possível carregar Carros Oficiais.');
        }
      })(),

      (async () => {
        try {
          const { data, error } = await (supabase as any).from('meetings').select('id, title, event_type, date, time, schools(name)');
          if (error) throw error;
          (data || []).forEach((m: any) => {
            if (!m.date) return;
            resultado.push({
              id: `reu-${m.id}`, tipo: 'reuniao', data: m.date, hora: m.time,
              titulo: m.title || m.event_type || 'Evento',
              subtitulo: [m.schools?.name, m.time].filter(Boolean).join(' · '),
            });
          });
        } catch (err) {
          console.error('Agenda Unificada: erro ao buscar Calendário/Reuniões', err);
          toast.error('Não foi possível carregar o Calendário/Reuniões.');
        }
      })(),

      (async () => {
        try {
          const { data, error } = await supabase.functions.invoke('google-sheets-fiscalizacao-terceirizados', { method: 'GET' });
          if (error) throw error;
          const visitas = Array.isArray(data?.visitRequests) ? data.visitRequests : [];
          visitas
            .filter((v: any) => v.status === 'agendada' && v.dataAgendada)
            .forEach((v: any) => {
              resultado.push({
                id: `visf-${v.id}`, tipo: 'visita_fiscal', data: v.dataAgendada,
                titulo: `Visita Técnica — ${schoolName(v.escolaId)}`,
                subtitulo: v.motivo || '',
              });
            });
        } catch (err) {
          console.error('Agenda Unificada: erro ao buscar Visita Técnica da Fiscalização', err);
          toast.error('Não foi possível carregar Visita Técnica da Fiscalização.');
        }
      })(),

      (async () => {
        try {
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
        } catch (err) {
          console.error('Agenda Unificada: erro ao buscar Obras', err);
          toast.error('Não foi possível carregar Obras.');
        }
      })(),

      (async () => {
        try {
          const { data, error } = await supabase.functions.invoke('google-sheets-visitas', { method: 'GET' });
          if (error) throw error;
          const visitas = Array.isArray(data) ? data : [];
          visitas.forEach((v: any) => {
            if (!v.data_visita) return;
            resultado.push({
              id: `esc-${v.id}`, tipo: 'visita_escolar', data: v.data_visita,
              titulo: `Visita Escolar — ${v.escola_nome || ''}`,
              subtitulo: v.objetivo || '',
            });
          });
        } catch (err) {
          console.error('Agenda Unificada: erro ao buscar Visitas Escolares', err);
          toast.error('Não foi possível carregar Visitas Escolares.');
        }
      })(),
    ]);

    setItems(resultado);
    setLoading(false);
  }

  const itemsDoMes = useMemo(
    () => filterAgendaItemsByMonth(items, refDate.getFullYear(), refDate.getMonth()),
    [items, refDate],
  );
  const grupos = useMemo(() => groupAgendaItemsByDate(itemsDoMes), [itemsDoMes]);
  const itensDoDiaSelecionado = diaSelecionado ? (grupos[diaSelecionado] || []) : [];

  const mudarMes = (delta: number) => {
    setDiaSelecionado(null);
    setRefDate(prev => new Date(prev.getFullYear(), prev.getMonth() + delta, 1));
  };

  const handleGerarPdf = () => {
    if (itemsDoMes.length === 0) { toast.error('Nenhum agendamento neste mês para gerar PDF.'); return; }
    setGerandoPdf(true);
    try {
      const doc = new jsPDF();
      const margin = 14;
      doc.setFontSize(14); doc.setTextColor(30, 41, 59);
      doc.text(`Agenda Unificada — ${MONTHS[refDate.getMonth()]} de ${refDate.getFullYear()}`, margin, 40);
      doc.setFontSize(9); doc.setTextColor(100);
      doc.text(`Gerado em ${new Date().toLocaleString('pt-BR')}`, margin, 46);

      const linhas = [...itemsDoMes]
        .sort((a, b) => a.data.localeCompare(b.data) || (a.hora || '').localeCompare(b.hora || ''))
        .map(i => [
          new Date(i.data + 'T12:00:00').toLocaleDateString('pt-BR'),
          i.hora || '—',
          TIPO_LABEL[i.tipo] || i.tipo,
          i.titulo,
          i.subtitulo || '',
        ]);

      autoTable(doc, {
        startY: 52,
        margin: { left: margin, right: margin },
        head: [['Data', 'Hora', 'Tipo', 'Título', 'Detalhe']],
        body: linhas,
        styles: { fontSize: 8 },
        headStyles: { fillColor: [30, 41, 59], textColor: 255 },
      });

      addTimbradoAllPages(doc);
      doc.save(`agenda_${refDate.getFullYear()}_${String(refDate.getMonth() + 1).padStart(2, '0')}.pdf`);
    } catch (err) {
      console.error('Agenda Unificada: erro ao gerar PDF', err);
      toast.error('Não foi possível gerar o PDF.');
    } finally {
      setGerandoPdf(false);
    }
  };

  const renderGrid = () => {
    const ano = refDate.getFullYear();
    const mes = refDate.getMonth();
    const primeiroDiaSemana = new Date(ano, mes, 1).getDay();
    const diasNoMes = new Date(ano, mes + 1, 0).getDate();
    const hoje = new Date();
    const hojeStr = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}-${String(hoje.getDate()).padStart(2, '0')}`;

    const celulas = [];
    for (let i = 0; i < primeiroDiaSemana; i++) celulas.push(<div key={`vazio-${i}`} className="bg-slate-50/40" />);

    for (let dia = 1; dia <= diasNoMes; dia++) {
      const dataStr = `${ano}-${String(mes + 1).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
      const itensDoDia = grupos[dataStr] || [];
      const isHoje = dataStr === hojeStr;
      const isSelecionado = dataStr === diaSelecionado;
      const tiposUnicos = Array.from(new Set(itensDoDia.map(i => i.tipo)));

      celulas.push(
        <button
          key={dia} type="button"
          onClick={() => setDiaSelecionado(dataStr === diaSelecionado ? null : dataStr)}
          className={`min-h-[64px] p-2 border border-slate-100 text-left transition-colors flex flex-col gap-1 ${isSelecionado ? 'bg-blue-50 ring-2 ring-blue-400 ring-inset' : isHoje ? 'bg-blue-50/40' : 'bg-white hover:bg-slate-50'}`}
        >
          <span className={`text-xs font-bold ${isHoje ? 'text-blue-600' : 'text-slate-600'}`}>{dia}</span>
          {tiposUnicos.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {tiposUnicos.map(tipo => (
                <span key={tipo} className={`w-2 h-2 rounded-full ${TIPO_COR[tipo] || 'bg-slate-400'}`} />
              ))}
            </div>
          )}
          {itensDoDia.length > 0 && <span className="text-[10px] text-slate-400">{itensDoDia.length} item{itensDoDia.length > 1 ? 's' : ''}</span>}
        </button>,
      );
    }

    return (
      <div className="grid grid-cols-7 gap-px bg-slate-100 border border-slate-100 rounded-xl overflow-hidden">
        {WEEKDAYS.map(dia => (
          <div key={dia} className="bg-slate-50 py-2 text-center text-[10px] font-black text-slate-400 uppercase tracking-widest">{dia}</div>
        ))}
        {celulas}
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/70 backdrop-blur-sm p-4" onClick={onClose}>
      <div
        className="bg-white rounded-3xl w-full max-w-4xl max-h-[90vh] shadow-2xl overflow-hidden flex flex-col animate-in zoom-in-95 duration-200"
        onClick={e => e.stopPropagation()}
      >
        <div className="p-6 border-b border-slate-100 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-blue-600 rounded-2xl text-white shrink-0"><CalendarDays size={22} /></div>
            <div>
              <h2 className="font-black text-slate-900 text-lg leading-none">Agenda Unificada</h2>
              <p className="text-xs text-slate-400 mt-1">Todos os agendamentos da rede num só lugar</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full text-slate-400"><X size={22} /></button>
        </div>

        <div className="p-6 overflow-y-auto flex-1 space-y-5">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3">
              <button onClick={() => mudarMes(-1)} className="p-2 rounded-full border border-slate-200 text-slate-400 hover:text-blue-600 hover:border-blue-200"><ChevronLeft size={18} /></button>
              <span className="font-black text-slate-800 text-sm uppercase tracking-wide min-w-[140px] text-center">{MONTHS[refDate.getMonth()]} de {refDate.getFullYear()}</span>
              <button onClick={() => mudarMes(1)} className="p-2 rounded-full border border-slate-200 text-slate-400 hover:text-blue-600 hover:border-blue-200"><ChevronRight size={18} /></button>
            </div>
            <button
              onClick={handleGerarPdf} disabled={gerandoPdf || loading}
              className="px-5 py-2.5 bg-slate-900 hover:bg-black text-white rounded-lg text-xs font-bold flex items-center gap-2 disabled:opacity-60"
            >
              {gerandoPdf ? <Loader2 className="animate-spin" size={16} /> : <FileDown size={16} />} Gerar PDF do Mês
            </button>
          </div>

          <div className="flex flex-wrap gap-3">
            {AGENDA_TIPOS.map(t => (
              <div key={t.tipo} className="flex items-center gap-1.5 text-[10px] font-bold text-slate-500 uppercase tracking-wide">
                <span className={`w-2.5 h-2.5 rounded-full ${t.cor}`} /> {t.label}
              </div>
            ))}
          </div>

          {loading ? (
            <div className="flex flex-col items-center justify-center py-20 gap-3">
              <Loader2 className="animate-spin text-blue-600" size={32} />
              <p className="text-sm text-slate-400">Carregando agendamentos...</p>
            </div>
          ) : (
            <>
              {renderGrid()}

              {diaSelecionado && (
                <div className="space-y-2">
                  <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest">
                    {new Date(diaSelecionado + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' })}
                  </h3>
                  {itensDoDiaSelecionado.length === 0 ? (
                    <p className="text-sm text-slate-400 py-4">Nenhum agendamento neste dia.</p>
                  ) : itensDoDiaSelecionado.map(item => (
                    <div key={item.id} className="p-3 rounded-xl border border-slate-200 bg-slate-50 flex items-start gap-3">
                      <span className={`w-2.5 h-2.5 rounded-full mt-1.5 shrink-0 ${TIPO_COR[item.tipo] || 'bg-slate-400'}`} />
                      <div className="min-w-0">
                        <p className="text-xs font-black text-slate-400 uppercase tracking-wide">{TIPO_LABEL[item.tipo] || item.tipo}{item.hora ? ` · ${item.hora}` : ''}</p>
                        <p className="text-sm font-semibold text-slate-700">{item.titulo}</p>
                        {item.subtitulo && <p className="text-xs text-slate-500 mt-0.5">{item.subtitulo}</p>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default AgendaUnificadaModal;

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { supabase } from '../lib/supabase';
import {
  Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend,
  BarChart, Bar, XAxis, YAxis, CartesianGrid
} from 'recharts';
import {
  Search, Plus, Loader2, Building2,
  CheckCircle2, Clock, AlertTriangle,
  Hammer, X, Save, Trash2,
  Edit, Siren, Filter, LayoutDashboard, List,
  FileDown, PauseCircle, ShieldAlert
} from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import html2canvas from 'html2canvas';

interface School {
  id: string;
  name: string;
}

interface ConstructionWork {
  id: string;
  school_id: string;
  title: string;
  integra_code?: string;
  pi_code?: string;
  sei_number?: string;
  company_name: string;
  start_date: string;
  deadline_days: number;
  status: 'EM ANDAMENTO' | 'CONCLUÍDO' | 'PARALISADO';
  school?: { name: string };
  created_at?: string;
  updated_at?: string;
}

export function Obras() {
  const [works, setWorks] = useState<ConstructionWork[]>([]);
  const [schools, setSchools] = useState<School[]>([]);
  const [loading, setLoading] = useState(true);
  const [saveLoading, setSaveLoading] = useState(false);
  const [exportLoading, setExportLoading] = useState(false);
  const [userRole, setUserRole] = useState('');
  const [userSchoolId, setUserSchoolId] = useState<string | null>(null);
  const [supervisorSchoolIds, setSupervisorSchoolIds] = useState<string[]>([]);
  const [lastUpdated, setLastUpdated] = useState('Carregando...');
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('TODOS');
  const [viewMode, setViewMode] = useState<'cards' | 'table'>('table');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingWork, setEditingWork] = useState<ConstructionWork | null>(null);
  const chartsRef = useRef<HTMLDivElement>(null);

  const [formData, setFormData] = useState<{
    school_id: string;
    title: string;
    integra_code: string;
    pi_code: string;
    sei_number: string;
    company_name: string;
    start_date: string;
    deadline_days: number;
    status: 'EM ANDAMENTO' | 'CONCLUÍDO' | 'PARALISADO';
  }>({
    school_id: '',
    title: '',
    integra_code: '',
    pi_code: '',
    sei_number: '',
    company_name: '',
    start_date: new Date().toISOString().split('T')[0],
    deadline_days: 180,
    status: 'EM ANDAMENTO'
  });

  useEffect(() => {
    fetchInitialData();
  }, []);

  useEffect(() => {
    if (loading) return;
    if (works.length > 0) {
      const maxTimestamp = works.reduce((latest, work) => {
        const workDateStr = work.updated_at || work.created_at;
        if (!workDateStr) return latest;
        const workTime = new Date(workDateStr).getTime();
        return workTime > latest ? workTime : latest;
      }, 0);
      if (maxTimestamp > 0) {
        const dateObj = new Date(maxTimestamp);
        const date = dateObj.toLocaleDateString('pt-BR');
        const time = dateObj.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
        setLastUpdated(`${date} às ${time}`);
      } else {
        setLastUpdated('Data indisponível');
      }
    } else {
      setLastUpdated('Sem registros');
    }
  }, [works, loading]);

  async function fetchInitialData() {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      let role = '';
      let sId = null;
      let supSchools: string[] = [];

      if (user) {
        const { data: profile } = await (supabase as any)
          .from('profiles')
          .select('role, school_id, supervisor_schools')
          .eq('id', user.id)
          .single();

        role = profile?.role || '';
        sId = profile?.school_id || null;
        supSchools = profile?.supervisor_schools || [];

        setUserRole(role);
        setUserSchoolId(sId);
        setSupervisorSchoolIds(supSchools);
      }

      const { data: schoolsData } = await (supabase as any).from('schools').select('id, name').order('name');

      if (role === 'supervisor') {
        setSchools((schoolsData || []).filter((s: any) => supSchools.includes(s.id)));
      } else {
        setSchools(schoolsData || []);
      }

      await fetchWorks(role, sId, supSchools);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  }

  async function fetchWorks(role: string, sId: string | null, supSchools: string[] = []) {
    let query = (supabase as any)
      .from('construction_works')
      .select('*, school:schools(name)');

    if (role === 'school_manager' && sId) {
      query = query.eq('school_id', sId);
    } else if (role === 'supervisor') {
      if (supSchools.length > 0) {
        query = query.in('school_id', supSchools);
      } else {
        setWorks([]);
        return;
      }
    }

    const { data, error } = await query.order('created_at', { ascending: false });
    if (!error) setWorks(data || []);
  }

  const calculateDeadline = (startDate: string, days: number) => {
    const date = new Date(startDate);
    date.setDate(date.getDate() + days);
    return date;
  };

  const getWorkStatusInfo = (work: ConstructionWork) => {
    if (work.status === 'CONCLUÍDO') return { label: 'Concluído', color: 'bg-emerald-100 text-emerald-700 border-emerald-200', rawStatus: 'concluido' };
    if (work.status === 'PARALISADO') return { label: 'Paralisado', color: 'bg-slate-100 text-slate-600 border-slate-200', rawStatus: 'paralisado' };

    const end = calculateDeadline(work.start_date, work.deadline_days);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const endDateCheck = new Date(end);
    endDateCheck.setHours(0, 0, 0, 0);

    const diffTime = endDateCheck.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays < 0) return { label: `Atrasado ${Math.abs(diffDays)} dias`, color: 'bg-red-100 text-red-700 border-red-200', rawStatus: 'atrasado', diffDays };
    if (diffDays <= 30) return { label: `Atenção: ${diffDays} dias`, color: 'bg-amber-100 text-amber-700 border-amber-200', rawStatus: 'atencao', diffDays };

    return { label: 'Em Andamento', color: 'bg-blue-50 text-blue-700 border-blue-200', rawStatus: 'andamento', diffDays };
  };

  const getTimeProgress = (work: ConstructionWork) => {
    if (work.status === 'CONCLUÍDO') return 100;
    if (work.status === 'PARALISADO') return 0;

    const start = new Date(work.start_date).getTime();
    const end = calculateDeadline(work.start_date, work.deadline_days).getTime();
    const now = new Date().getTime();
    const total = end - start;
    const elapsed = now - start;

    let percent = (elapsed / total) * 100;
    if (percent < 0) percent = 0;
    if (percent > 100) percent = 100;
    return Math.round(percent);
  };

  const kpiData = useMemo(() => {
    const total = works.length;
    const concluidas = works.filter(w => w.status === 'CONCLUÍDO').length;
    const paralisadas = works.filter(w => w.status === 'PARALISADO').length;

    let atrasadas = 0;
    let emAndamento = 0;
    let atencao = 0;

    works.forEach(w => {
      if (w.status === 'EM ANDAMENTO') {
        const info = getWorkStatusInfo(w);
        if (info.rawStatus === 'atrasado') atrasadas++;
        else if (info.rawStatus === 'atencao') atencao++;
        else emAndamento++;
      }
    });

    return { total, concluidas, paralisadas, atrasadas, emAndamento, atencao };
  }, [works]);

  const chartDataStatus = [
    { name: 'Em Andamento', value: kpiData.emAndamento, color: '#3B82F6' },
    { name: 'Concluídas', value: kpiData.concluidas, color: '#10B981' },
    { name: 'Atrasadas', value: kpiData.atrasadas, color: '#EF4444' },
    { name: 'Em Atenção', value: kpiData.atencao, color: '#F59E0B' },
    { name: 'Paralisadas', value: kpiData.paralisadas, color: '#94A3B8' },
  ].filter(d => d.value > 0);

  const schoolBarData = useMemo(() => {
    const counts: Record<string, { name: string; andamento: number; concluido: number; atrasado: number; paralisado: number }> = {};
    works.forEach(w => {
      const key = w.school?.name || 'N/A';
      const shortName = key.length > 20 ? key.substring(0, 18) + '..' : key;
      if (!counts[key]) counts[key] = { name: shortName, andamento: 0, concluido: 0, atrasado: 0, paralisado: 0 };
      const info = getWorkStatusInfo(w);
      if (w.status === 'CONCLUÍDO') counts[key].concluido++;
      else if (w.status === 'PARALISADO') counts[key].paralisado++;
      else if (info.rawStatus === 'atrasado') counts[key].atrasado++;
      else counts[key].andamento++;
    });
    return Object.values(counts)
      .sort((a, b) => (b.andamento + b.concluido + b.atrasado + b.paralisado) - (a.andamento + a.concluido + a.atrasado + a.paralisado))
      .slice(0, 8);
  }, [works]);

  const filteredWorks = useMemo(() => {
    return works.filter(w => {
      const matchesSearch =
        w.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (w.school?.name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        w.company_name.toLowerCase().includes(searchTerm.toLowerCase());

      const statusInfo = getWorkStatusInfo(w);
      let matchesFilter = true;

      if (statusFilter === 'ATRASADO') matchesFilter = statusInfo.rawStatus === 'atrasado';
      else if (statusFilter === 'ATENCAO') matchesFilter = statusInfo.rawStatus === 'atencao';
      else if (statusFilter === 'CONCLUIDO') matchesFilter = w.status === 'CONCLUÍDO';
      else if (statusFilter === 'ANDAMENTO') matchesFilter = w.status === 'EM ANDAMENTO' && statusInfo.rawStatus !== 'atrasado' && statusInfo.rawStatus !== 'atencao';
      else if (statusFilter === 'PARALISADO') matchesFilter = w.status === 'PARALISADO';

      return matchesSearch && matchesFilter;
    });
  }, [works, searchTerm, statusFilter]);

  async function handleExportPDF() {
    setExportLoading(true);
    try {
      const doc = new jsPDF('landscape', 'mm', 'a4');
      const pageW = doc.internal.pageSize.getWidth();

      // Header laranja
      doc.setFillColor(234, 88, 12);
      doc.rect(0, 0, pageW, 28, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(18);
      doc.setFont('helvetica', 'bold');
      doc.text('PAINEL DE OBRAS E REFORMAS', 14, 12);
      doc.setFontSize(8);
      doc.setFont('helvetica', 'normal');
      doc.text('SGE · GSU-II · Infraestrutura', 14, 19);
      doc.text(
        `Gerado em: ${new Date().toLocaleDateString('pt-BR')} às ${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`,
        pageW - 14, 19, { align: 'right' }
      );

      // Linha subtítulo de filtro
      if (statusFilter !== 'TODOS' || searchTerm) {
        doc.setFillColor(254, 243, 232);
        doc.rect(0, 28, pageW, 8, 'F');
        doc.setTextColor(154, 52, 18);
        doc.setFontSize(7);
        doc.setFont('helvetica', 'bold');
        const filterLabel = statusFilter !== 'TODOS' ? `Filtro: ${statusFilter}` : '';
        const searchLabel = searchTerm ? `Busca: "${searchTerm}"` : '';
        doc.text([filterLabel, searchLabel].filter(Boolean).join(' · '), 14, 33.5);
      }

      // KPI boxes
      doc.setTextColor(0, 0, 0);
      doc.setFontSize(7);
      doc.setFont('helvetica', 'bold');
      doc.text('MÉTRICAS GERAIS', 14, 43);

      const kpis = [
        { label: 'Total', value: kpiData.total, r: 71, g: 85, b: 105 },
        { label: 'Em Andamento', value: kpiData.emAndamento, r: 59, g: 130, b: 246 },
        { label: 'Em Atenção', value: kpiData.atencao, r: 245, g: 158, b: 11 },
        { label: 'Atrasadas', value: kpiData.atrasadas, r: 239, g: 68, b: 68 },
        { label: 'Concluídas', value: kpiData.concluidas, r: 16, g: 185, b: 129 },
        { label: 'Paralisadas', value: kpiData.paralisadas, r: 148, g: 163, b: 184 },
      ];

      const boxW = (pageW - 28) / kpis.length - 2;
      kpis.forEach((kpi, i) => {
        const x = 14 + i * (boxW + 2);
        doc.setFillColor(kpi.r, kpi.g, kpi.b);
        doc.roundedRect(x, 46, boxW, 18, 2, 2, 'F');
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(16);
        doc.setFont('helvetica', 'bold');
        doc.text(String(kpi.value), x + boxW / 2, 58, { align: 'center' });
        doc.setFontSize(5.5);
        doc.setFont('helvetica', 'normal');
        doc.text(kpi.label.toUpperCase(), x + boxW / 2, 62, { align: 'center' });
      });

      // Captura dos gráficos
      let chartEndY = 68;
      if (chartsRef.current) {
        try {
          const canvas = await html2canvas(chartsRef.current, {
            scale: 1.5,
            useCORS: true,
            backgroundColor: '#ffffff',
          });
          const imgData = canvas.toDataURL('image/png');
          const imgW = pageW - 28;
          const imgH = (canvas.height / canvas.width) * imgW;
          const maxH = 65;
          const finalH = Math.min(imgH, maxH);
          doc.addImage(imgData, 'PNG', 14, 68, imgW, finalH);
          chartEndY = 68 + finalH + 6;
        } catch {
          chartEndY = 72;
        }
      }

      // Tabela de obras
      doc.setTextColor(0, 0, 0);
      doc.setFontSize(8);
      doc.setFont('helvetica', 'bold');
      doc.text(`LISTAGEM DE OBRAS (${filteredWorks.length} registros)`, 14, chartEndY);

      autoTable(doc, {
        startY: chartEndY + 4,
        head: [['Obra / Serviço', 'Escola', 'Empresa', 'Início', 'Prazo', 'Previsão Término', 'Status']],
        body: filteredWorks.map(w => {
          const info = getWorkStatusInfo(w);
          const endDate = calculateDeadline(w.start_date, w.deadline_days);
          return [
            w.title,
            w.school?.name || '-',
            w.company_name,
            new Date(w.start_date + 'T12:00:00').toLocaleDateString('pt-BR'),
            `${w.deadline_days} dias`,
            endDate.toLocaleDateString('pt-BR'),
            info.label,
          ];
        }),
        styles: { fontSize: 7, cellPadding: 2.5 },
        headStyles: { fillColor: [234, 88, 12], textColor: 255, fontStyle: 'bold' },
        alternateRowStyles: { fillColor: [248, 250, 252] },
        columnStyles: {
          0: { cellWidth: 55 },
          1: { cellWidth: 42 },
          2: { cellWidth: 38 },
          3: { cellWidth: 20 },
          4: { cellWidth: 18 },
          5: { cellWidth: 22 },
          6: { cellWidth: 'auto' },
        },
      });

      // Rodapé
      const totalPages = (doc as any).internal.getNumberOfPages();
      for (let i = 1; i <= totalPages; i++) {
        doc.setPage(i);
        doc.setFontSize(6.5);
        doc.setTextColor(148, 163, 184);
        doc.setFont('helvetica', 'normal');
        doc.text(`Página ${i} de ${totalPages} · SGE-GSU-II`, pageW / 2, doc.internal.pageSize.getHeight() - 6, { align: 'center' });
      }

      doc.save(`relatorio-obras-${new Date().toISOString().split('T')[0]}.pdf`);
    } catch (error) {
      console.error('Erro ao gerar PDF:', error);
      alert('Erro ao gerar o PDF. Tente novamente.');
    } finally {
      setExportLoading(false);
    }
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaveLoading(true);
    try {
      const payload = {
        ...formData,
        integra_code: formData.integra_code || null,
        pi_code: formData.pi_code || null,
        sei_number: formData.sei_number || null,
      };

      if (editingWork) {
        await (supabase as any).from('construction_works').update(payload).eq('id', editingWork.id);
      } else {
        await (supabase as any).from('construction_works').insert([payload]);
      }
      setIsModalOpen(false);
      fetchWorks(userRole, userSchoolId, supervisorSchoolIds);
    } catch (error: any) {
      alert('Erro ao salvar: ' + error.message);
    } finally {
      setSaveLoading(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Tem certeza que deseja excluir este registro de obra?')) return;
    await (supabase as any).from('construction_works').delete().eq('id', id);
    fetchWorks(userRole, userSchoolId, supervisorSchoolIds);
  }

  async function markAsComplete(work: ConstructionWork) {
    if (!confirm(`Confirmar conclusão da obra "${work.title}"?`)) return;
    await (supabase as any).from('construction_works').update({ status: 'CONCLUÍDO' }).eq('id', work.id);
    fetchWorks(userRole, userSchoolId, supervisorSchoolIds);
  }

  function openModal(work: ConstructionWork | null = null) {
    if (work) {
      setEditingWork(work);
      setFormData({
        school_id: work.school_id,
        title: work.title,
        integra_code: work.integra_code || '',
        pi_code: work.pi_code || '',
        sei_number: work.sei_number || '',
        company_name: work.company_name,
        start_date: work.start_date,
        deadline_days: work.deadline_days,
        status: work.status,
      });
    } else {
      setEditingWork(null);
      setFormData({
        school_id: userRole === 'school_manager' && userSchoolId ? userSchoolId : '',
        title: '',
        integra_code: '',
        pi_code: '',
        sei_number: '',
        company_name: '',
        start_date: new Date().toISOString().split('T')[0],
        deadline_days: 180,
        status: 'EM ANDAMENTO',
      });
    }
    setIsModalOpen(true);
  }

  const isAdminOrDirigente = userRole === 'regional_admin' || userRole === 'dirigente';
  const isSchoolManager = userRole === 'school_manager';

  return (
    <div className="bg-slate-50 font-sans">

      {/* Header com gradiente */}
      <div className="bg-gradient-to-br from-orange-600 to-orange-800 px-6 pt-8 pb-24">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col md:flex-row md:items-start justify-between gap-6">
            <div>
              <div className="flex items-center gap-2 mb-3">
                <div className="p-2 bg-white/20 rounded-xl">
                  <Hammer size={22} className="text-white" />
                </div>
                <div className="text-orange-200 text-xs font-bold uppercase tracking-widest">SGE · Infraestrutura</div>
              </div>
              <h1 className="text-3xl font-black text-white tracking-tight">Painel de Obras</h1>
              <p className="text-orange-200 mt-1 text-sm">Cronograma físico e status das intervenções</p>
            </div>
            <div className="flex flex-wrap gap-3 items-start">
              <button
                onClick={handleExportPDF}
                disabled={exportLoading}
                className="bg-white/20 hover:bg-white/30 border border-white/30 text-white px-5 py-2.5 rounded-xl font-bold text-sm flex items-center gap-2 transition-all active:scale-95 disabled:opacity-60"
              >
                {exportLoading ? <Loader2 size={16} className="animate-spin" /> : <FileDown size={16} />}
                Exportar PDF
              </button>
              {isAdminOrDirigente && (
                <button
                  onClick={() => openModal()}
                  className="bg-white text-orange-700 hover:bg-orange-50 px-5 py-2.5 rounded-xl font-black text-sm flex items-center gap-2 shadow-lg transition-all active:scale-95"
                >
                  <Plus size={18} /> Nova Obra
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Conteúdo principal sobreposando o header */}
      <div className="max-w-7xl mx-auto px-6 -mt-16 pb-32 space-y-5">

        {/* Banner de restrição para school_manager */}
        {isSchoolManager && (
          <div className="bg-blue-50 border border-blue-200 rounded-2xl px-5 py-3.5 flex items-center gap-3 shadow-sm">
            <ShieldAlert size={18} className="text-blue-600 shrink-0" />
            <p className="text-blue-700 text-sm font-medium">
              Visualização restrita — exibindo apenas obras vinculadas à sua unidade escolar.
            </p>
          </div>
        )}

        {/* Info de atualização */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm px-5 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2 text-slate-500 text-sm">
            <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="font-medium">Dados sincronizados em tempo real</span>
          </div>
          <div className="text-xs text-slate-400 font-medium">
            Atualizado em: <span className="text-slate-600 font-bold">{lastUpdated}</span>
          </div>
        </div>

        {/* KPI Cards — 6 métricas */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <KPICard title="Total de Obras" value={kpiData.total} icon={Building2} />
          <KPICard title="Em Andamento" value={kpiData.emAndamento} icon={Hammer} iconColor="text-blue-600" accent="border-l-4 border-blue-500" />
          <KPICard title="Em Atenção" value={kpiData.atencao} icon={AlertTriangle} iconColor="text-amber-500" accent="border-l-4 border-amber-400" valueColor="text-amber-600" />
          <KPICard title="Atrasadas" value={kpiData.atrasadas} icon={Siren} iconColor="text-red-600" accent="border-l-4 border-red-500" valueColor="text-red-600" />
          <KPICard title="Concluídas" value={kpiData.concluidas} icon={CheckCircle2} iconColor="text-emerald-600" accent="border-l-4 border-emerald-500" />
          <KPICard title="Paralisadas" value={kpiData.paralisadas} icon={PauseCircle} iconColor="text-slate-500" accent="border-l-4 border-slate-400" />
        </div>

        {/* Seção de gráficos — capturada para o PDF */}
        <div ref={chartsRef} className="grid grid-cols-1 lg:grid-cols-5 gap-5 bg-transparent">

          {/* Pie chart — Distribuição por Status */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6 lg:col-span-2">
            <h3 className="font-bold text-slate-800 text-sm">Distribuição por Status</h3>
            <p className="text-xs text-slate-400 mt-0.5 mb-4">Visão proporcional do portfólio de obras</p>
            <div style={{ width: '100%', height: 220 }}>
              {chartDataStatus.length > 0 ? (
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie
                      data={chartDataStatus}
                      cx="50%"
                      cy="45%"
                      innerRadius={55}
                      outerRadius={78}
                      paddingAngle={4}
                      dataKey="value"
                    >
                      {chartDataStatus.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.12)' }}
                      formatter={(value: any, name: any) => [value, name]}
                    />
                    <Legend verticalAlign="bottom" height={36} iconType="circle" iconSize={8} />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-slate-300 text-xs font-bold uppercase tracking-widest text-center border-2 border-dashed border-slate-100 rounded-xl">
                  Nenhuma obra<br />para gerar gráfico
                </div>
              )}
            </div>
          </div>

          {/* Bar chart — Obras por Escola */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6 lg:col-span-3">
            <h3 className="font-bold text-slate-800 text-sm">Obras por Unidade Escolar</h3>
            <p className="text-xs text-slate-400 mt-0.5 mb-4">Concentração de intervenções por escola</p>
            <div style={{ width: '100%', height: 220 }}>
              {schoolBarData.length > 0 ? (
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={schoolBarData} margin={{ top: 0, right: 8, left: -20, bottom: 40 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                    <XAxis
                      dataKey="name"
                      tick={{ fontSize: 9, fill: '#94a3b8' }}
                      angle={-30}
                      textAnchor="end"
                      interval={0}
                    />
                    <YAxis tick={{ fontSize: 9, fill: '#94a3b8' }} allowDecimals={false} />
                    <Tooltip
                      contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.12)', fontSize: 12 }}
                    />
                    <Bar dataKey="andamento" name="Em Andamento" stackId="a" fill="#3B82F6" radius={[0, 0, 0, 0]} />
                    <Bar dataKey="atrasado" name="Atrasada" stackId="a" fill="#EF4444" />
                    <Bar dataKey="concluido" name="Concluída" stackId="a" fill="#10B981" />
                    <Bar dataKey="paralisado" name="Paralisada" stackId="a" fill="#94A3B8" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-slate-300 text-xs font-bold uppercase tracking-widest text-center border-2 border-dashed border-slate-100 rounded-xl">
                  Sem dados<br />para gerar gráfico
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Tabela / Lista de Obras */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 flex flex-col">

          {/* Toolbar */}
          <div className="p-5 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h3 className="text-base font-bold text-slate-800">Lista de Obras</h3>
              <p className="text-xs text-slate-400 mt-0.5">{filteredWorks.length} registro(s) exibido(s)</p>
            </div>

            <div className="flex flex-wrap gap-2.5">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={15} />
                <input
                  type="text"
                  placeholder="Buscar obra, escola..."
                  className="pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 w-full sm:w-48 transition-all"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>

              <div className="relative">
                <Filter className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={15} />
                <select
                  className="pl-9 pr-8 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 appearance-none cursor-pointer font-medium text-slate-600 transition-all"
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                >
                  <option value="TODOS">Todos os Status</option>
                  <option value="ANDAMENTO">Em Andamento</option>
                  <option value="ATENCAO">Em Atenção (≤30 dias)</option>
                  <option value="ATRASADO">Atrasadas</option>
                  <option value="CONCLUIDO">Concluídas</option>
                  <option value="PARALISADO">Paralisadas</option>
                </select>
              </div>

              <div className="flex bg-slate-100 rounded-lg p-1">
                <button
                  onClick={() => setViewMode('table')}
                  className={`p-1.5 rounded-md transition-all ${viewMode === 'table' ? 'bg-white shadow text-slate-800' : 'text-slate-400'}`}
                >
                  <List size={16} />
                </button>
                <button
                  onClick={() => setViewMode('cards')}
                  className={`p-1.5 rounded-md transition-all ${viewMode === 'cards' ? 'bg-white shadow text-slate-800' : 'text-slate-400'}`}
                >
                  <LayoutDashboard size={16} />
                </button>
              </div>
            </div>
          </div>

          {/* Conteúdo */}
          {loading ? (
            <div className="flex-1 flex flex-col items-center justify-center py-20">
              <Loader2 className="animate-spin text-orange-500 mb-2" size={30} />
              <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">Carregando...</span>
            </div>
          ) : filteredWorks.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center py-20 text-center px-4">
              <Building2 className="text-slate-200 mb-4" size={44} />
              <span className="text-slate-400 font-medium text-sm">Nenhuma obra encontrada com os filtros atuais.</span>
            </div>
          ) : viewMode === 'table' ? (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 text-slate-500 text-[10px] uppercase tracking-wider font-bold">
                    <th className="p-4 border-b border-slate-100">Obra / Escola</th>
                    <th className="p-4 border-b border-slate-100">Empresa</th>
                    <th className="p-4 border-b border-slate-100">Cronograma</th>
                    <th className="p-4 border-b border-slate-100">Status</th>
                    {isAdminOrDirigente && <th className="p-4 border-b border-slate-100 text-right">Ações</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {filteredWorks.map((work) => {
                    const statusInfo = getWorkStatusInfo(work);
                    const progress = getTimeProgress(work);
                    const endDate = calculateDeadline(work.start_date, work.deadline_days);

                    return (
                      <tr key={work.id} className="hover:bg-slate-50/60 transition-colors group">
                        <td className="p-4">
                          <div className="flex flex-col">
                            <span className="font-bold text-slate-800 text-sm">{work.title}</span>
                            <span className="text-xs text-slate-500 flex items-center gap-1 mt-0.5">
                              <Building2 size={11} /> {work.school?.name}
                            </span>
                            {(work.sei_number || work.integra_code || work.pi_code) && (
                              <div className="flex gap-2 mt-1">
                                {work.sei_number && <span className="text-[9px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded font-mono">SEI: {work.sei_number}</span>}
                                {work.integra_code && <span className="text-[9px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded font-mono">INT: {work.integra_code}</span>}
                              </div>
                            )}
                          </div>
                        </td>
                        <td className="p-4 text-xs font-medium text-slate-600">
                          {work.company_name}
                        </td>
                        <td className="p-4 w-52">
                          <div className="flex flex-col gap-1">
                            <div className="flex justify-between text-[10px] text-slate-400 font-bold uppercase">
                              <span>Início: {new Date(work.start_date + 'T12:00:00').toLocaleDateString('pt-BR')}</span>
                              <span>{progress}%</span>
                            </div>
                            <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden w-full">
                              <div
                                className={`h-full rounded-full transition-all duration-500 ${progress >= 100 && work.status !== 'CONCLUÍDO' ? 'bg-red-500' :
                                  work.status === 'CONCLUÍDO' ? 'bg-emerald-500' :
                                    statusInfo.rawStatus === 'atencao' ? 'bg-amber-400' : 'bg-blue-500'
                                  }`}
                                style={{ width: `${progress}%` }}
                              />
                            </div>
                            <div className="text-[10px] text-right font-medium text-slate-500">
                              Prev.: {endDate.toLocaleDateString('pt-BR')} · {work.deadline_days} dias
                            </div>
                          </div>
                        </td>
                        <td className="p-4">
                          <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wide border ${statusInfo.color}`}>
                            {statusInfo.rawStatus === 'atrasado' ? <Siren size={11} /> :
                              work.status === 'CONCLUÍDO' ? <CheckCircle2 size={11} /> :
                                statusInfo.rawStatus === 'atencao' ? <AlertTriangle size={11} /> :
                                  work.status === 'PARALISADO' ? <PauseCircle size={11} /> : <Clock size={11} />}
                            {statusInfo.label}
                          </div>
                        </td>
                        {isAdminOrDirigente && (
                          <td className="p-4 text-right">
                            <div className="flex justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              <button onClick={() => openModal(work)} className="p-1.5 hover:bg-orange-50 text-slate-400 hover:text-orange-600 rounded-lg transition-colors">
                                <Edit size={15} />
                              </button>
                              <button onClick={() => handleDelete(work.id)} className="p-1.5 hover:bg-red-50 text-slate-400 hover:text-red-600 rounded-lg transition-colors">
                                <Trash2 size={15} />
                              </button>
                            </div>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-4">
              {filteredWorks.map(work => {
                const statusInfo = getWorkStatusInfo(work);
                const progress = getTimeProgress(work);

                return (
                  <div key={work.id} className="bg-white border border-slate-100 rounded-2xl p-5 hover:shadow-md transition-all hover:border-slate-200">
                    <div className="flex justify-between items-start mb-3">
                      <div className="flex-1 min-w-0 mr-3">
                        <h4 className="font-bold text-slate-800 text-sm truncate">{work.title}</h4>
                        <p className="text-xs text-slate-500 font-medium flex items-center gap-1 mt-1">
                          <Building2 size={11} /> {work.school?.name}
                        </p>
                      </div>
                      <div className={`px-2 py-1 rounded-lg text-[10px] font-black uppercase border shrink-0 ${statusInfo.color}`}>
                        {statusInfo.label}
                      </div>
                    </div>

                    <div className="mb-4">
                      <div className="flex justify-between text-[10px] font-bold text-slate-400 uppercase mb-1">
                        <span>Progresso do Prazo</span>
                        <span>{progress}%</span>
                      </div>
                      <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${progress >= 100 && work.status !== 'CONCLUÍDO' ? 'bg-red-500' :
                            work.status === 'CONCLUÍDO' ? 'bg-emerald-500' :
                              statusInfo.rawStatus === 'atencao' ? 'bg-amber-400' : 'bg-blue-500'
                            }`}
                          style={{ width: `${progress}%` }}
                        />
                      </div>
                    </div>

                    <div className="flex justify-between items-center pt-3 border-t border-slate-50">
                      <span className="text-xs text-slate-500 font-medium truncate mr-2">{work.company_name}</span>
                      {isAdminOrDirigente && (
                        <div className="flex gap-2 shrink-0">
                          {work.status !== 'CONCLUÍDO' && (
                            <button onClick={() => markAsComplete(work)} className="text-[10px] font-bold text-emerald-600 hover:underline uppercase">
                              Concluir
                            </button>
                          )}
                          <button onClick={() => openModal(work)} className="text-slate-400 hover:text-orange-600 transition-colors">
                            <Edit size={14} />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Modal Criar/Editar */}
      {isModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/90 backdrop-blur-md p-4">
          <div className="bg-white rounded-[2rem] w-full max-w-2xl max-h-[90vh] shadow-2xl overflow-hidden border border-white flex flex-col">
            <div className="p-7 border-b border-slate-100 flex justify-between items-center bg-slate-50/50 shrink-0">
              <div className="flex items-center gap-4">
                <div className="w-11 h-11 bg-orange-600 rounded-2xl flex items-center justify-center text-white shadow-lg">
                  <Hammer size={22} />
                </div>
                <div>
                  <h2 className="text-lg font-black uppercase tracking-tight">{editingWork ? 'Editar Obra' : 'Nova Obra'}</h2>
                  <p className="text-[10px] text-orange-600 font-bold uppercase tracking-widest mt-0.5">Cadastro Técnico</p>
                </div>
              </div>
              <button onClick={() => setIsModalOpen(false)} className="p-2.5 hover:bg-white rounded-full text-slate-400 transition-colors">
                <X size={22} />
              </button>
            </div>

            <form onSubmit={handleSave} className="p-8 space-y-5 overflow-y-auto flex-1">
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-500 uppercase ml-1">Unidade Escolar</label>
                <select
                  required
                  disabled={isSchoolManager}
                  className="w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl font-bold outline-none focus:border-orange-500 disabled:opacity-60 disabled:cursor-not-allowed"
                  value={formData.school_id}
                  onChange={e => setFormData({ ...formData, school_id: e.target.value })}
                >
                  <option value="">Selecione...</option>
                  {schools.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-500 uppercase ml-1">Nome da Obra / Serviço</label>
                  <input
                    required
                    className="w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl font-bold focus:border-orange-500 outline-none"
                    placeholder="Ex: Reforma da Cozinha"
                    value={formData.title}
                    onChange={e => setFormData({ ...formData, title: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-500 uppercase ml-1">Empresa Contratada</label>
                  <input
                    required
                    className="w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl font-bold focus:border-orange-500 outline-none"
                    placeholder="Razão Social"
                    value={formData.company_name}
                    onChange={e => setFormData({ ...formData, company_name: e.target.value })}
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-500 uppercase ml-1">Nº Integra (Opc.)</label>
                  <input
                    className="w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl font-mono text-sm font-bold focus:border-orange-500 outline-none"
                    placeholder="0000"
                    value={formData.integra_code}
                    onChange={e => setFormData({ ...formData, integra_code: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-500 uppercase ml-1">Nº PI (Opc.)</label>
                  <input
                    className="w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl font-mono text-sm font-bold focus:border-orange-500 outline-none"
                    placeholder="0000"
                    value={formData.pi_code}
                    onChange={e => setFormData({ ...formData, pi_code: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-500 uppercase ml-1">Nº SEI (Opc.)</label>
                  <input
                    className="w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl font-mono text-sm font-bold focus:border-orange-500 outline-none"
                    placeholder="000.000..."
                    value={formData.sei_number}
                    onChange={e => setFormData({ ...formData, sei_number: e.target.value })}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-5 bg-orange-50 p-5 rounded-2xl border border-orange-100">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-orange-700 uppercase ml-1">Data de Início</label>
                  <input
                    type="date"
                    required
                    className="w-full p-4 bg-white border-2 border-orange-100 rounded-2xl font-bold focus:border-orange-500 outline-none"
                    value={formData.start_date}
                    onChange={e => setFormData({ ...formData, start_date: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-orange-700 uppercase ml-1">Prazo (Dias)</label>
                  <input
                    type="number"
                    required
                    min="1"
                    className="w-full p-4 bg-white border-2 border-orange-100 rounded-2xl font-bold focus:border-orange-500 outline-none"
                    placeholder="Ex: 180"
                    value={formData.deadline_days}
                    onChange={e => setFormData({ ...formData, deadline_days: Number(e.target.value) })}
                  />
                </div>
              </div>

              {editingWork && (
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-500 uppercase ml-1">Status da Obra</label>
                  <div className="grid grid-cols-3 gap-3">
                    {(['EM ANDAMENTO', 'CONCLUÍDO', 'PARALISADO'] as const).map(s => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => setFormData({ ...formData, status: s })}
                        className={`p-3 rounded-xl text-[10px] font-black uppercase border-2 transition-all ${formData.status === s ? 'bg-slate-900 border-slate-900 text-white' : 'bg-white border-slate-100 text-slate-400 hover:border-slate-200'}`}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </form>

            <div className="p-7 border-t border-slate-100 bg-white shrink-0 flex justify-end gap-4">
              <button
                onClick={() => setIsModalOpen(false)}
                className="px-7 py-3.5 text-slate-400 font-black uppercase text-xs hover:text-slate-600 transition-all"
              >
                Cancelar
              </button>
              <button
                onClick={handleSave}
                disabled={saveLoading}
                className="px-10 py-3.5 bg-orange-600 text-white rounded-2xl font-black uppercase text-xs shadow-xl shadow-orange-100 hover:bg-orange-700 flex items-center gap-3 transition-all active:scale-95 disabled:opacity-60"
              >
                {saveLoading ? <Loader2 className="animate-spin" size={16} /> : <Save size={16} />} Salvar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function KPICard({
  title,
  value,
  icon: Icon,
  iconColor = 'text-slate-500',
  accent = '',
  valueColor = 'text-slate-900',
}: {
  title: string;
  value: number;
  icon: any;
  iconColor?: string;
  accent?: string;
  valueColor?: string;
}) {
  return (
    <div className={`bg-white p-5 rounded-2xl shadow-sm border border-slate-100 ${accent}`}>
      <div className="flex items-start justify-between mb-3">
        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider leading-tight">{title}</p>
        <div className={`p-1.5 rounded-lg bg-slate-50 ${iconColor}`}>
          <Icon size={16} />
        </div>
      </div>
      <h3 className={`text-3xl font-black ${valueColor}`}>{value}</h3>
    </div>
  );
}

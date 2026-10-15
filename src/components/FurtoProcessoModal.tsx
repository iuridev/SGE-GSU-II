import React, { useState } from 'react';
import { supabase } from '../lib/supabase';
import { X, Save, Loader2, ShieldAlert, AlertCircle } from 'lucide-react';

// Processo da página de Furtos (tabela processos_furtos). A página de Furtos é
// a fonte desses dados; aqui (Processos de Patrimônio) eles são exibidos e
// podem ser atualizados, gravando na mesma tabela.
export interface ProcessoFurto {
  id: string;
  numero_sei: string;
  escola_id: string;
  data_ocorrencia: string | null;
  tipo_ocorrencia: string | null;
  numero_bo: string | null;
  autoria: string | null;
  status: string | null;
  situacao: string | null;
  nl_baixa: string | null;
  numero_baixa_sam: string | null;
  itens: { id: number; descricao: string; patrimonio: string; valorUnitario: string }[] | null;
  valor_total: number | null;
  updated_at: string | null;
  created_at: string | null;
  data_conclusao: string | null;
  schools?: { name: string } | null;
}

export const FURTO_SELECT = 'id, numero_sei, escola_id, data_ocorrencia, tipo_ocorrencia, numero_bo, autoria, status, situacao, nl_baixa, numero_baixa_sam, itens, valor_total, updated_at, created_at, data_conclusao, schools ( name )';

// Mesmas opções da página de Furtos (src/pages/Furtos.tsx).
const TIPOS_OCORRENCIA = ['FURTO', 'ROUBO', 'EXTRAVIO', 'INCÊNCIO', 'VANDALISMO'];
const SITUACOES = ['Em Análise', 'Em Apuração', 'Concluído'];
const AUTORIAS = ['CONHECIDA', 'NÃO CONHECIDA'];
const STATUS_OPCOES = [
  'NÃO INSTAURADO',
  'EM ANDAMENTO',
  'ENCERRADO COMO CONCLUIDO PELA RESPONSÁBILIDADE',
  'ENCERRADO COMO CONCLUIDO PELA NÃO RESPONSÁBILIDADE',
];

export const furtoTemNl = (f: ProcessoFurto) => !!(f.nl_baixa && f.nl_baixa !== 'Aguardando');

// Mesma regra do botão "Registrar Baixa" da página de Furtos: concluído, com
// prejuízo e ainda sem o nº da baixa no SAM Patrimônio.
export const furtoPendenteBaixaSam = (f: ProcessoFurto) =>
  f.situacao === 'Concluído' && Number(f.valor_total) > 0 && !(f.numero_baixa_sam || '').trim();

const moeda = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

interface Props {
  furto: ProcessoFurto;
  readOnly: boolean;
  onClose: () => void;
  onSaved: (f: ProcessoFurto) => void;
}

export function FurtoProcessoModal({ furto, readOnly, onClose, onSaved }: Props) {
  const [form, setForm] = useState({
    numero_sei: furto.numero_sei || '',
    tipo_ocorrencia: furto.tipo_ocorrencia || 'FURTO',
    data_ocorrencia: furto.data_ocorrencia || '',
    numero_bo: furto.numero_bo || '',
    autoria: furto.autoria || 'NÃO CONHECIDA',
    situacao: furto.situacao || 'Em Análise',
    status: furto.status || 'NÃO INSTAURADO',
    numero_baixa_sam: furto.numero_baixa_sam || '',
    nl_baixa: furtoTemNl(furto) ? (furto.nl_baixa || '') : '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }));

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (readOnly) return;
    if (!form.numero_sei.trim()) { setError('Informe o nº do processo SEI.'); return; }
    if (form.nl_baixa.trim() && !form.numero_baixa_sam.trim()) {
      setError('Informe o nº da baixa no SAM antes da NL.');
      return;
    }

    setSaving(true);
    const agoraIso = new Date().toISOString();
    const payload: Record<string, unknown> = {
      numero_sei: form.numero_sei.trim(),
      tipo_ocorrencia: form.tipo_ocorrencia,
      data_ocorrencia: form.data_ocorrencia || null,
      numero_bo: form.numero_bo.trim(),
      autoria: form.autoria,
      situacao: form.situacao,
      status: form.status,
      numero_baixa_sam: form.numero_baixa_sam.trim() || null,
      nl_baixa: form.nl_baixa.trim() || 'Aguardando',
      updated_at: agoraIso,
    };
    // Igual à página de Furtos: data_conclusao só muda na transição de situação.
    const eraConcluido = furto.situacao === 'Concluído';
    const ficaConcluido = form.situacao === 'Concluído';
    if (!eraConcluido && ficaConcluido) payload.data_conclusao = agoraIso;
    else if (eraConcluido && !ficaConcluido) payload.data_conclusao = null;

    try {
      const { data, error: err } = await (supabase as any)
        .from('processos_furtos')
        .update(payload)
        .eq('id', furto.id)
        .select(FURTO_SELECT)
        .single();
      if (err) throw err;
      onSaved(data as ProcessoFurto);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar o processo de furto.');
    } finally {
      setSaving(false);
    }
  }

  const inputCls = 'w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-700 outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-300 disabled:cursor-not-allowed disabled:opacity-80';
  const labelCls = 'text-xs font-semibold text-slate-400 uppercase tracking-wider';
  const itens = furto.itens || [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[92vh] flex flex-col overflow-hidden">
        <div className="p-5 border-b border-slate-100 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-red-50 flex items-center justify-center shrink-0">
              <ShieldAlert size={20} className="text-red-600" />
            </div>
            <div className="min-w-0">
              <h2 className="text-base font-bold text-slate-800">{readOnly ? 'Processo de Furto' : 'Atualizar Processo de Furto'}</h2>
              <p className="text-xs text-slate-400 truncate">{furto.schools?.name || 'Escola não informada'} · dados da página de Furtos</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSave} className="flex flex-col flex-1 min-h-0">
          <fieldset disabled={readOnly || saving} className="p-5 space-y-5 overflow-y-auto flex-1">
            {error && (
              <div className="flex items-center gap-2 p-3 rounded-xl bg-red-50 border border-red-100 text-sm text-red-700">
                <AlertCircle size={16} className="shrink-0" /> {error}
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className={labelCls}>Nº SEI</label>
                <input className={`${inputCls} font-mono`} value={form.numero_sei} onChange={set('numero_sei')} />
              </div>
              <div className="space-y-1.5">
                <label className={labelCls}>Tipo de ocorrência</label>
                <select className={inputCls} value={form.tipo_ocorrencia} onChange={set('tipo_ocorrencia')}>
                  {TIPOS_OCORRENCIA.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div className="space-y-1.5">
                <label className={labelCls}>Data da ocorrência</label>
                <input type="date" className={inputCls} value={form.data_ocorrencia} onChange={set('data_ocorrencia')} />
              </div>
              <div className="space-y-1.5">
                <label className={labelCls}>Nº do B.O.</label>
                <input className={inputCls} value={form.numero_bo} onChange={set('numero_bo')} />
              </div>
              <div className="space-y-1.5">
                <label className={labelCls}>Autoria</label>
                <select className={inputCls} value={form.autoria} onChange={set('autoria')}>
                  {AUTORIAS.map(a => <option key={a} value={a}>{a}</option>)}
                </select>
              </div>
              <div className="space-y-1.5">
                <label className={labelCls}>Situação</label>
                <select className={inputCls} value={form.situacao} onChange={set('situacao')}>
                  {SITUACOES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <label className={labelCls}>Status final do processo</label>
                <select className={inputCls} value={form.status} onChange={set('status')}>
                  {STATUS_OPCOES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            </div>

            <div className="p-4 rounded-xl border border-indigo-100 bg-indigo-50/50 space-y-3">
              <p className="text-xs font-bold text-indigo-700 uppercase tracking-wide">Baixa patrimonial</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className={labelCls}>Nº da baixa no SAM</label>
                  <input className={inputCls} value={form.numero_baixa_sam} onChange={set('numero_baixa_sam')} placeholder="Registro no SAM Patrimônio" />
                </div>
                <div className="space-y-1.5">
                  <label className={labelCls}>NL (SEAFIN)</label>
                  <input className={inputCls} value={form.nl_baixa} onChange={set('nl_baixa')} placeholder="Quando o SEAFIN emitir" />
                </div>
              </div>
              {furtoPendenteBaixaSam(furto) && (
                <p className="text-[11px] text-indigo-600">Processo concluído aguardando a baixa no SAM: ao informar o nº da baixa, ele sai da fila.</p>
              )}
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className={labelCls}>Itens atingidos</p>
                <p className="text-xs font-bold text-slate-700">{moeda(Number(furto.valor_total) || 0)}</p>
              </div>
              {itens.length === 0 ? (
                <p className="text-xs text-slate-400 italic">Nenhum item informado.</p>
              ) : (
                <div className="rounded-xl border border-slate-100 divide-y divide-slate-100">
                  {itens.map((i, idx) => (
                    <div key={i.id ?? idx} className="flex items-center justify-between gap-3 px-3 py-2 text-xs">
                      <span className="text-slate-700 truncate">{i.descricao || '-'}{i.patrimonio ? <span className="text-slate-400"> · nº {i.patrimonio}</span> : null}</span>
                      <span className="text-slate-500 shrink-0">{i.valorUnitario ? moeda(parseFloat(i.valorUnitario) || 0) : '-'}</span>
                    </div>
                  ))}
                </div>
              )}
              <p className="text-[11px] text-slate-400">Para alterar a escola ou os itens, use a página de Furtos.</p>
            </div>
          </fieldset>

          <div className="p-5 border-t border-slate-100 bg-slate-50/50 shrink-0 flex justify-end gap-3">
            <button type="button" onClick={onClose} className="px-5 py-2.5 text-sm font-semibold text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-xl">
              {readOnly ? 'Fechar' : 'Cancelar'}
            </button>
            {!readOnly && (
              <button type="submit" disabled={saving} className="inline-flex items-center gap-2 px-6 py-2.5 bg-red-600 text-white text-sm font-semibold rounded-xl shadow-md shadow-red-200 hover:bg-red-700 disabled:opacity-60">
                {saving ? <Loader2 className="animate-spin" size={16} /> : <Save size={16} />}
                Atualizar Processo
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}

import { useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import {
  CheckCircle2, AlertTriangle, Minus, Loader2, Send, Wrench, Phone, Timer, UserX, Sparkles,
  Paperclip, FileText, Image as ImageIcon, X,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { FUNCTION_NAME } from '../lib/fiscalizacaoElevadoresApi';
import {
  BLOCOS_ESCOLA, BLOCO_VISITA, PERGUNTA_AVISO_MANUTENCAO, PRAZO_EMERGENCIAL_MIN,
  avaliarFiscalizacao, validarFiscalizacao, perguntasAplicaveis, minutosEntre, montarLinhasPlanilha,
  urlAnexo, type Anexo, type ChecklistBloco, type ChecklistPergunta, type EntradaFiscalizacao,
  type FiscalizacaoRegistro, type Quinzena, type Resposta,
} from '../lib/fiscalizacaoElevadores';

const ANEXO_MAX_MB = 10;
const ANEXOS_MAX = 5;

function lerBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '');
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

interface Props {
  escola: { id: string; name: string };
  quinzena: Quinzena;
  inspector: { id: string; name: string };
  existente?: FiscalizacaoRegistro | null;
  onSaved: () => void;
}

// ISO (UTC) -> valor de <input type="datetime-local"> no fuso local
function toLocalInput(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

const toISOOrNull = (local: string) => (local ? new Date(local).toISOString() : null);

function SimNao({ valor, onChange, simLabel = 'Sim', naoLabel = 'Não' }: {
  valor: boolean | null;
  onChange: (v: boolean) => void;
  simLabel?: string;
  naoLabel?: string;
}) {
  const simCor = 'bg-emerald-600 border-emerald-600';
  const naoCor = 'bg-red-600 border-red-600';
  const base = 'flex-1 py-3 rounded-xl border-2 text-sm font-black transition-all active:scale-95';
  const off = 'bg-white border-slate-200 text-slate-500 hover:border-slate-300';
  return (
    <div className="flex gap-2">
      <button type="button" onClick={() => onChange(true)} className={`${base} ${valor === true ? `${simCor} text-white shadow-md` : off}`}>{simLabel}</button>
      <button type="button" onClick={() => onChange(false)} className={`${base} ${valor === false ? `${naoCor} text-white shadow-md` : off}`}>{naoLabel}</button>
    </div>
  );
}

function LinhaPergunta({ pergunta, resposta, observacao, onResposta, onObservacao }: {
  pergunta: ChecklistPergunta;
  resposta?: Resposta;
  observacao: string;
  onResposta: (r: Resposta) => void;
  onObservacao: (t: string) => void;
}) {
  const btn = (r: Resposta, label: string, icon: React.ReactNode, ativo: string) => (
    <button
      type="button"
      onClick={() => onResposta(r)}
      aria-pressed={resposta === r}
      className={`flex items-center justify-center gap-1.5 py-2.5 rounded-xl border-2 text-xs font-black transition-all active:scale-95 ${
        resposta === r ? `${ativo} text-white shadow-md` : 'bg-white border-slate-200 text-slate-500 hover:border-slate-300'
      }`}
    >
      {icon} {label}
    </button>
  );
  return (
    <div className={`px-4 py-3.5 space-y-2.5 ${resposta === 'nok' ? 'bg-red-50/60' : ''}`}>
      <div>
        <p className="text-sm font-bold text-slate-800 leading-snug">{pergunta.texto}</p>
        {pergunta.dica && <p className="text-[11px] text-slate-400 font-medium mt-0.5">{pergunta.dica}</p>}
      </div>
      <div className="grid grid-cols-3 gap-2">
        {btn('ok', 'Conforme', <CheckCircle2 size={14} />, 'bg-emerald-600 border-emerald-600')}
        {btn('nok', 'Problema', <AlertTriangle size={14} />, 'bg-red-600 border-red-600')}
        {btn('na', 'N/A', <Minus size={14} />, 'bg-slate-500 border-slate-500')}
      </div>
      {resposta === 'nok' && (
        <textarea
          value={observacao}
          onChange={e => onObservacao(e.target.value)}
          rows={2}
          placeholder="Descreva rapidamente o problema…"
          className="w-full text-sm border-2 border-red-200 focus:border-red-400 outline-none rounded-xl px-3 py-2 bg-white"
        />
      )}
    </div>
  );
}

function CardBloco({ bloco, respostas, observacoes, onResposta, onObservacao, onTudoOk }: {
  bloco: ChecklistBloco;
  respostas: Record<string, Resposta>;
  observacoes: Record<string, string>;
  onResposta: (id: string, r: Resposta) => void;
  onObservacao: (id: string, t: string) => void;
  onTudoOk: () => void;
}) {
  const feitos = bloco.perguntas.filter(p => respostas[p.id]).length;
  return (
    <section className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
      <header className="flex items-center justify-between gap-3 px-4 py-3 bg-slate-50 border-b border-slate-100">
        <div className="min-w-0">
          <h3 className="text-sm font-black text-slate-900 uppercase tracking-wide">{bloco.titulo}</h3>
          <p className="text-[11px] text-slate-500 font-medium truncate">{bloco.descricao}</p>
        </div>
        <div className="shrink-0 flex items-center gap-2">
          <span className="text-[11px] font-black text-slate-400">{feitos}/{bloco.perguntas.length}</span>
          <button
            type="button"
            onClick={onTudoOk}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-[11px] font-black"
          >
            <Sparkles size={12} /> Tudo conforme
          </button>
        </div>
      </header>
      <div className="divide-y divide-slate-100">
        {bloco.perguntas.map(p => (
          <LinhaPergunta
            key={p.id}
            pergunta={p}
            resposta={respostas[p.id]}
            observacao={observacoes[p.id] ?? ''}
            onResposta={r => onResposta(p.id, r)}
            onObservacao={t => onObservacao(p.id, t)}
          />
        ))}
      </div>
    </section>
  );
}

function Pergunta({ titulo, dica, children }: { titulo: string; dica?: string; children: React.ReactNode }) {
  return (
    <section className="bg-white rounded-3xl border border-slate-200 shadow-sm p-4 space-y-3">
      <div>
        <h3 className="text-sm font-black text-slate-900">{titulo}</h3>
        {dica && <p className="text-[11px] text-slate-500 font-medium mt-0.5">{dica}</p>}
      </div>
      {children}
    </section>
  );
}

const STATUS_PREVIA = {
  conforme: { label: 'Conforme', cls: 'bg-emerald-100 text-emerald-700' },
  atencao: { label: 'Atenção', cls: 'bg-amber-100 text-amber-700' },
  critico: { label: 'Crítico', cls: 'bg-red-100 text-red-700' },
} as const;

export function FormularioFiscalizacaoElevador({ escola, quinzena, inspector, existente, onSaved }: Props) {
  const [funcionando, setFuncionando] = useState<boolean | null>(existente ? existente.is_operational : null);
  const [desde, setDesde] = useState(existente?.down_since ?? '');
  const [houveVisita, setHouveVisita] = useState<boolean | null>(existente ? existente.had_visit : null);
  const [respostas, setRespostas] = useState<Record<string, Resposta>>(existente?.answers ?? {});
  const [observacoes, setObservacoes] = useState<Record<string, string>>(existente?.observations ?? {});
  const [houveChamado, setHouveChamado] = useState<boolean | null>(existente ? existente.had_call : null);
  const [tipoChamado, setTipoChamado] = useState<'emergencial' | 'corretivo' | ''>(existente?.call_type ?? '');
  const [abertoEm, setAbertoEm] = useState(toLocalInput(existente?.call_opened_at));
  const [atendidoEm, setAtendidoEm] = useState(toLocalInput(existente?.call_attended_at));
  const [pessoaPresa, setPessoaPresa] = useState(existente?.person_trapped ?? false);
  const [notas, setNotas] = useState(existente?.general_notes ?? '');
  const [anexos, setAnexos] = useState<Anexo[]>(existente?.attachments ?? []);
  const [enviandoAnexo, setEnviandoAnexo] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errosVisiveis, setErrosVisiveis] = useState(false);

  const entrada: EntradaFiscalizacao = useMemo(() => ({
    funcionando: funcionando !== false,
    houveVisita: houveVisita === true,
    respostas,
    chamado: {
      houve: houveChamado === true,
      tipo: tipoChamado || undefined,
      abertoEm: abertoEm || null,
      atendidoEm: atendidoEm || null,
      pessoaPresa,
    },
  }), [funcionando, houveVisita, respostas, houveChamado, tipoChamado, abertoEm, atendidoEm, pessoaPresa]);

  const aplicaveis = perguntasAplicaveis(entrada);
  const avaliacao = avaliarFiscalizacao(entrada);
  const perguntasGerais = [funcionando, houveVisita, houveChamado].filter(v => v !== null).length;
  const totalProgresso = aplicaveis.length + 3;
  const feitoProgresso = avaliacao.respondidos + perguntasGerais;
  const pct = Math.round((feitoProgresso / totalProgresso) * 100);

  const erros = useMemo(() => {
    const e: string[] = [];
    if (funcionando === null) e.push('Informe se o elevador está funcionando.');
    if (houveVisita === null) e.push('Informe se houve visita da empresa.');
    if (houveChamado === null) e.push('Informe se houve chamado de manutenção.');
    return [...e, ...validarFiscalizacao(entrada, observacoes, desde || null)];
  }, [funcionando, houveVisita, houveChamado, entrada, observacoes, desde]);

  const minutos = minutosEntre(abertoEm, atendidoEm);

  function setResp(id: string, r: Resposta) {
    setRespostas(prev => ({ ...prev, [id]: r }));
  }
  function tudoOk(perguntas: ChecklistPergunta[]) {
    setRespostas(prev => {
      const next = { ...prev };
      perguntas.forEach(p => { if (next[p.id] !== 'nok') next[p.id] = 'ok'; });
      return next;
    });
  }

  // O arquivo sobe para o Drive na hora; só o id entra na planilha ao salvar o formulário.
  async function anexar(files: FileList | null) {
    if (!files || files.length === 0) return;
    const lista = Array.from(files);
    if (anexos.length + lista.length > ANEXOS_MAX) {
      toast.error(`No máximo ${ANEXOS_MAX} anexos por fiscalização.`);
      return;
    }
    setEnviandoAnexo(true);
    try {
      for (const file of lista) {
        if (file.type !== 'application/pdf' && !file.type.startsWith('image/')) {
          toast.error(`${file.name}: envie apenas PDF ou imagem.`);
          continue;
        }
        if (file.size > ANEXO_MAX_MB * 1024 * 1024) {
          toast.error(`${file.name}: arquivo acima de ${ANEXO_MAX_MB} MB.`);
          continue;
        }
        const base64 = await lerBase64(file);
        const { data: resp, error } = await supabase.functions.invoke(FUNCTION_NAME, {
          method: 'POST',
          body: { action: 'upload_anexo', escolaId: escola.id, periodoInicio: quinzena.inicio, fileName: file.name, mimeType: file.type, base64 },
        });
        if (resp?.error) throw new Error(resp.error);
        if (error) throw error;
        setAnexos(prev => [...prev, resp.anexo as Anexo]);
      }
    } catch (err: any) {
      console.error(err);
      toast.error(err?.message ? `Erro ao anexar: ${err.message}` : 'Erro ao anexar o arquivo.');
    } finally {
      setEnviandoAnexo(false);
    }
  }

  async function enviar() {
    if (enviandoAnexo) {
      toast.error('Aguarde o envio dos anexos terminar.');
      return;
    }
    if (erros.length > 0) {
      setErrosVisiveis(true);
      toast.error('Falta completar alguns itens.');
      return;
    }
    setSaving(true);
    try {
      const ids = new Set(aplicaveis.map(p => p.id));
      const answers = Object.fromEntries(Object.entries(respostas).filter(([id]) => ids.has(id)));
      const observations = Object.fromEntries(
        Object.entries(observacoes).filter(([id, t]) => ids.has(id) && respostas[id] === 'nok' && t.trim()),
      );
      const chamado = houveChamado === true;
      const { data, items } = montarLinhasPlanilha({
        escola,
        quinzena,
        fiscal: { id: inspector.id, nome: inspector.name },
        funcionando: funcionando !== false,
        paradoDesde: desde || null,
        houveVisita: houveVisita === true,
        chamado: {
          houve: chamado,
          tipo: tipoChamado || null,
          abertoEmISO: toISOOrNull(abertoEm),
          atendidoEmISO: toISOOrNull(atendidoEm),
          pessoaPresa,
        },
        respostas: answers,
        observacoes: observations,
        observacoesGerais: notas,
        avaliacao,
        anexos,
      });
      const { data: resp, error } = await supabase.functions.invoke(FUNCTION_NAME, { method: 'POST', body: { data, items } });
      if (resp?.error) throw new Error(resp.error);
      if (error) throw error;
      toast.success(existente ? 'Fiscalização atualizada!' : 'Fiscalização enviada. Obrigado!');
      onSaved();
    } catch (err: any) {
      console.error(err);
      toast.error(err?.message ? `Erro ao salvar: ${err.message}` : 'Erro ao salvar a fiscalização.');
    } finally {
      setSaving(false);
    }
  }

  const previa = STATUS_PREVIA[avaliacao.status];

  return (
    <div className="space-y-4">
      {/* Progresso */}
      <div className="sticky top-0 z-20 -mx-1 px-1 pt-1 pb-2 bg-slate-50/90 backdrop-blur">
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm px-4 py-3">
          <div className="flex items-center justify-between text-[11px] font-black uppercase tracking-wide text-slate-500 mb-1.5">
            <span>{feitoProgresso} de {totalProgresso} respondidos</span>
            <span className={pct === 100 ? 'text-emerald-600' : ''}>{pct}%</span>
          </div>
          <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
            <div className="h-full rounded-full bg-gradient-to-r from-blue-500 to-emerald-500 transition-all" style={{ width: `${pct}%` }} />
          </div>
        </div>
      </div>

      <Pergunta titulo="O elevador está funcionando hoje?" dica="Resposta geral sobre o equipamento neste momento">
        <SimNao valor={funcionando} onChange={setFuncionando} simLabel="Sim, funcionando" naoLabel="Não, parado" />
        {funcionando === false && (
          <div className="space-y-1">
            <label className="text-[11px] font-black uppercase tracking-wide text-slate-500">Parado desde</label>
            <input
              type="date"
              value={desde}
              max={quinzena.fim}
              onChange={e => setDesde(e.target.value)}
              className="w-full border-2 border-slate-200 focus:border-red-400 outline-none rounded-xl px-3 py-2.5 text-sm"
            />
          </div>
        )}
      </Pergunta>

      {BLOCOS_ESCOLA.map(b => (
        <CardBloco
          key={b.id}
          bloco={b}
          respostas={respostas}
          observacoes={observacoes}
          onResposta={setResp}
          onObservacao={(id, t) => setObservacoes(prev => ({ ...prev, [id]: t }))}
          onTudoOk={() => tudoOk(b.perguntas)}
        />
      ))}

      {funcionando === false && (
        <CardBloco
          bloco={{ id: 'aviso', titulo: 'Elevador parado', descricao: 'Sinalização obrigatória', perguntas: [PERGUNTA_AVISO_MANUTENCAO] }}
          respostas={respostas}
          observacoes={observacoes}
          onResposta={setResp}
          onObservacao={(id, t) => setObservacoes(prev => ({ ...prev, [id]: t }))}
          onTudoOk={() => tudoOk([PERGUNTA_AVISO_MANUTENCAO])}
        />
      )}

      <Pergunta titulo="A empresa de manutenção visitou a escola nesta quinzena?" dica="Preventiva, corretiva ou emergencial">
        <SimNao valor={houveVisita} onChange={setHouveVisita} />
      </Pergunta>

      {houveVisita === true && (
        <CardBloco
          bloco={BLOCO_VISITA}
          respostas={respostas}
          observacoes={observacoes}
          onResposta={setResp}
          onObservacao={(id, t) => setObservacoes(prev => ({ ...prev, [id]: t }))}
          onTudoOk={() => tudoOk(BLOCO_VISITA.perguntas)}
        />
      )}

      <Pergunta titulo="Foi aberto algum chamado de manutenção?" dica="Corretivo ou emergencial, junto à empresa contratada">
        <SimNao valor={houveChamado} onChange={setHouveChamado} />
        {houveChamado === true && (
          <div className="space-y-3 pt-1">
            <div className="grid grid-cols-2 gap-2">
              {(['emergencial', 'corretivo'] as const).map(t => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTipoChamado(t)}
                  className={`flex items-center justify-center gap-1.5 py-2.5 rounded-xl border-2 text-xs font-black capitalize transition-all ${
                    tipoChamado === t ? 'bg-blue-600 border-blue-600 text-white shadow-md' : 'bg-white border-slate-200 text-slate-500'
                  }`}
                >
                  {t === 'emergencial' ? <Phone size={13} /> : <Wrench size={13} />} {t}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className="space-y-1 block">
                <span className="text-[11px] font-black uppercase tracking-wide text-slate-500">Chamado aberto em</span>
                <input type="datetime-local" value={abertoEm} onChange={e => setAbertoEm(e.target.value)}
                  className="w-full border-2 border-slate-200 focus:border-blue-400 outline-none rounded-xl px-3 py-2.5 text-sm" />
              </label>
              <label className="space-y-1 block">
                <span className="text-[11px] font-black uppercase tracking-wide text-slate-500">Atendido em <span className="text-slate-400 normal-case">(se já atendeu)</span></span>
                <input type="datetime-local" value={atendidoEm} onChange={e => setAtendidoEm(e.target.value)}
                  className="w-full border-2 border-slate-200 focus:border-blue-400 outline-none rounded-xl px-3 py-2.5 text-sm" />
              </label>
            </div>
            {minutos !== null && (
              <div className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold ${
                tipoChamado === 'emergencial' && minutos > PRAZO_EMERGENCIAL_MIN ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-700'
              }`}>
                <Timer size={14} />
                Tempo de atendimento: {minutos} min
                {tipoChamado === 'emergencial' && (minutos > PRAZO_EMERGENCIAL_MIN
                  ? ` — acima do prazo contratual de ${PRAZO_EMERGENCIAL_MIN} min`
                  : ` — dentro do prazo de ${PRAZO_EMERGENCIAL_MIN} min`)}
              </div>
            )}
            <label className="flex items-center gap-3 px-3 py-2.5 rounded-xl border-2 border-slate-200 cursor-pointer">
              <input type="checkbox" checked={pessoaPresa} onChange={e => setPessoaPresa(e.target.checked)} className="w-5 h-5 accent-red-600" />
              <span className="flex items-center gap-1.5 text-sm font-bold text-slate-700"><UserX size={15} className="text-red-500" /> Havia pessoa presa no elevador</span>
            </label>
          </div>
        )}
      </Pergunta>

      <Pergunta titulo="Algo mais a relatar?" dica="Opcional — o Fiscal Técnico da URE lê estas observações">
        <textarea
          value={notas}
          onChange={e => setNotas(e.target.value)}
          rows={3}
          className="w-full text-sm border-2 border-slate-200 focus:border-blue-400 outline-none rounded-xl px-3 py-2"
          placeholder="Ex.: ruído no 2º andar desde terça, técnico prometeu retorno…"
        />
      </Pergunta>

      <Pergunta titulo="Anexos" dica={`Opcional — fotos ou PDF (ordem de serviço, laudo, relatório da empresa). Até ${ANEXOS_MAX} arquivos de ${ANEXO_MAX_MB} MB.`}>
        {anexos.length > 0 && (
          <div className="space-y-1.5">
            {anexos.map(a => (
              <div key={a.id} className="flex items-center gap-2 bg-slate-50 border border-slate-100 rounded-xl px-3 py-2">
                {a.mimeType === 'application/pdf' ? <FileText size={15} className="shrink-0 text-red-500" /> : <ImageIcon size={15} className="shrink-0 text-blue-500" />}
                <a href={urlAnexo(a)} target="_blank" rel="noopener noreferrer" className="flex-1 min-w-0 truncate text-sm font-bold text-blue-700 hover:underline">{a.nome}</a>
                <button type="button" onClick={() => setAnexos(prev => prev.filter(x => x.id !== a.id))}
                  aria-label={`Remover ${a.nome}`} className="shrink-0 p-1 rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-600">
                  <X size={15} />
                </button>
              </div>
            ))}
          </div>
        )}
        {anexos.length < ANEXOS_MAX && (
          <label className={`flex items-center justify-center gap-2 py-3 rounded-xl border-2 border-dashed text-sm font-black transition-all ${
            enviandoAnexo ? 'border-slate-200 text-slate-400 cursor-wait' : 'border-blue-200 text-blue-700 hover:bg-blue-50 cursor-pointer'
          }`}>
            {enviandoAnexo ? <Loader2 size={16} className="animate-spin" /> : <Paperclip size={16} />}
            {enviandoAnexo ? 'Enviando…' : 'Anexar PDF ou imagem'}
            <input type="file" multiple accept="application/pdf,image/*" className="hidden" disabled={enviandoAnexo}
              onChange={e => { void anexar(e.target.files); e.target.value = ''; }} />
          </label>
        )}
      </Pergunta>

      {errosVisiveis && erros.length > 0 && (
        <div className="bg-red-50 border-2 border-red-200 rounded-2xl p-4 space-y-1">
          {erros.map(e => (
            <p key={e} className="flex items-start gap-2 text-xs font-bold text-red-700"><AlertTriangle size={14} className="shrink-0 mt-0.5" /> {e}</p>
          ))}
        </div>
      )}

      <div className="sticky bottom-0 z-20 -mx-1 px-1 pb-2 pt-2 bg-gradient-to-t from-slate-50 via-slate-50/95 to-transparent">
        <div className="bg-white rounded-2xl border border-slate-200 shadow-lg p-3 flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-black uppercase tracking-wide text-slate-400">Resultado previsto</p>
            <div className="flex items-center gap-2">
              <span className={`text-[11px] font-black px-2.5 py-1 rounded-full uppercase ${previa.cls}`}>{previa.label}</span>
              {avaliacao.score !== null && <span className="text-sm font-black text-slate-700">{avaliacao.score}% conforme</span>}
            </div>
          </div>
          <button
            type="button"
            onClick={enviar}
            disabled={saving || enviandoAnexo}
            className="shrink-0 flex items-center gap-2 px-5 py-3 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white text-sm font-black shadow-md"
          >
            {saving ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
            {existente ? 'Atualizar' : 'Enviar'}
          </button>
        </div>
      </div>
    </div>
  );
}

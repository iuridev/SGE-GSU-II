import { useEffect, useState } from 'react';
import { UserRound, Phone, BadgeCheck } from 'lucide-react';
import {
  type ContatoEscola, type ContatoSolicitante,
  formatarTelefone, listarContatosEscola,
} from '../lib/contatosEscola';

interface Props {
  schoolId: string;
  value: ContatoSolicitante;
  onChange: (c: ContatoSolicitante) => void;
  accent: 'blue' | 'amber';
}

// Bloco "Contato do solicitante" usado nos modais emergenciais. Mostra os
// contatos já salvos da escola como atalho para preencher os campos.
export function ContatoSolicitanteFields({ schoolId, value, onChange, accent }: Props) {
  const [salvos, setSalvos] = useState<ContatoEscola[]>([]);

  useEffect(() => {
    if (!schoolId) { setSalvos([]); return; }
    let ativo = true;
    listarContatosEscola(schoolId)
      .then(lista => { if (ativo) setSalvos(lista.slice(0, 6)); })
      .catch(err => console.error('Erro ao carregar contatos da escola:', err));
    return () => { ativo = false; };
  }, [schoolId]);

  const focus = accent === 'blue' ? 'focus:border-blue-500' : 'focus:border-amber-500';
  const inputCls = `w-full p-3 bg-slate-50 border-2 border-slate-100 rounded-xl ${focus} focus:bg-white outline-none text-sm font-bold text-slate-700 transition-all`;

  const selecionado = (c: ContatoEscola) =>
    c.telefone === value.telefone.replace(/\D/g, '') && c.nome === value.nome;

  return (
    <div className="p-6 bg-slate-50/60 rounded-3xl border-2 border-slate-100 space-y-4">
      <div className="flex items-center gap-2 text-slate-800 font-black uppercase text-[10px] tracking-[0.2em]">
        <UserRound size={14} className={accent === 'blue' ? 'text-blue-500' : 'text-amber-500'} /> Contato do Solicitante
      </div>

      {salvos.length > 0 && (
        <div className="space-y-2">
          <p className="text-[10px] font-bold text-slate-400 uppercase ml-1">Contatos já cadastrados — toque para usar</p>
          <div className="flex flex-wrap gap-2">
            {salvos.map(c => (
              <button
                key={c.id}
                type="button"
                onClick={() => onChange({ nome: c.nome, cargo: c.cargo, telefone: formatarTelefone(c.telefone) })}
                className={`px-3 py-2 rounded-xl border-2 text-left transition-all ${selecionado(c) ? 'bg-emerald-50 border-emerald-400' : 'bg-white border-slate-200 hover:border-slate-300'}`}
              >
                <span className="flex items-center gap-1.5 text-[11px] font-black text-slate-700 uppercase">
                  {selecionado(c) && <BadgeCheck size={12} className="text-emerald-600" />}{c.nome}
                </span>
                <span className="block text-[10px] font-semibold text-slate-400">{c.cargo || 'Sem cargo'} · {formatarTelefone(c.telefone)}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="space-y-1.5">
          <label className="text-[10px] font-black text-slate-500 uppercase ml-1">Nome</label>
          <input required className={inputCls} placeholder="Nome completo" value={value.nome} onChange={e => onChange({ ...value, nome: e.target.value })} />
        </div>
        <div className="space-y-1.5">
          <label className="text-[10px] font-black text-slate-500 uppercase ml-1">Cargo / Função</label>
          <input required className={inputCls} placeholder="Ex: Diretor(a), GOE" value={value.cargo} onChange={e => onChange({ ...value, cargo: e.target.value })} />
        </div>
        <div className="space-y-1.5">
          <label className="text-[10px] font-black text-slate-500 uppercase ml-1 flex items-center gap-1"><Phone size={11} /> Telefone</label>
          <input
            required
            type="tel"
            inputMode="numeric"
            pattern="\(\d{2}\) \d{4,5}-\d{4}"
            title="Informe DDD + número"
            className={inputCls}
            placeholder="(11) 98765-4321"
            value={value.telefone}
            onChange={e => onChange({ ...value, telefone: formatarTelefone(e.target.value) })}
          />
        </div>
      </div>
    </div>
  );
}

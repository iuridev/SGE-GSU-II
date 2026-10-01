import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { selosEmRisco, type Selo, type SeloEscola } from '../lib/selosMetricas';
import { SeloBadge } from './SeloBadge';

// Selos de Excelência do ano corrente da escola logada, exibidos na barra do
// topo (só para school_manager). Clicar leva à galeria de selos.
export function SelosTopo({ userId, onAbrirGaleria }: { userId: string; onAbrirGaleria: () => void }) {
  const [selos, setSelos] = useState<Selo[]>([]);
  // Selos que a escola corre o risco de perder (índice abaixo do critério hoje)
  const [emRisco, setEmRisco] = useState<Map<string, string>>(new Map());
  const ano = new Date().getFullYear();

  useEffect(() => {
    let ativo = true;
    (async () => {
      try {
        const { data: perfil } = await (supabase as any).from('profiles').select('school_id').eq('id', userId).single();
        if (!perfil?.school_id) return;
        const [concedidosRes, catalogoRes] = await Promise.all([
          (supabase as any).from('selos_escolas').select('selo_id').eq('school_id', perfil.school_id).eq('ano', ano),
          (supabase as any).from('selos').select('*').eq('ativo', true).order('ordem'),
        ]);
        const ids = new Set(((concedidosRes.data || []) as Pick<SeloEscola, 'selo_id'>[]).map(c => c.selo_id));
        const daEscola = ((catalogoRes.data || []) as Selo[]).filter(s => ids.has(s.id));
        if (!ativo) return;
        setSelos(daEscola);
        const risco = await selosEmRisco(daEscola, perfil.school_id, ano);
        if (ativo) setEmRisco(risco);
      } catch (err) {
        console.error('Erro ao carregar selos da escola:', err);
      }
    })();
    return () => { ativo = false; };
  }, [userId, ano]);

  if (selos.length === 0) return null;

  return (
    <button
      onClick={onAbrirGaleria}
      title="Ver galeria de Selos de Excelência"
      className="flex items-center gap-1.5 px-2 py-1.5 rounded-xl hover:bg-slate-100 transition-all"
    >
      {selos.map(s => {
        const risco = emRisco.has(s.id);
        return (
          <span key={s.id} className="relative flex">
            <SeloBadge
              icone={s.icone} cor={s.cor} formato={s.formato} acabamento={s.acabamento} tamanho="sm"
              title={risco ? `Selo ${s.nome} ${ano} — risco de perder o selo` : `Selo ${s.nome} ${ano}`}
            />
            {risco && <span className="absolute -inset-1 rounded-full border-2 border-red-500 animate-pulse pointer-events-none" />}
          </span>
        );
      })}
    </button>
  );
}

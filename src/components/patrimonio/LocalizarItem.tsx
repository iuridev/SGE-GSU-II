import { useDeferredValue, useMemo, useState } from 'react';
import { DoorOpen, Package, Search } from 'lucide-react';
import type { ItemPatrimonio } from '../../pages/PatrimonioSalas';

const MAX_RESULTADOS = 50;

const formatarData = (d?: string | null) => (d ? new Date(d).toLocaleString('pt-BR') : '-');

function situacao(item: ItemPatrimonio) {
  if (item.alocado) return { texto: `Alocado · ${item.salaNome || 'sala não informada'}`, classes: 'bg-blue-50 text-blue-700' };
  if (item.inservivel) return { texto: 'Inservível', classes: 'bg-red-50 text-red-700' };
  return { texto: 'Disponível · não alocado', classes: 'bg-emerald-50 text-emerald-700' };
}

export function LocalizarItem({ itens }: { itens: ItemPatrimonio[] }) {
  const [busca, setBusca] = useState('');
  const buscaAdiada = useDeferredValue(busca);
  const termo = buscaAdiada.trim().toLowerCase();

  const resultados = useMemo(() => {
    if (termo.length < 2) return [];
    return itens
      .filter(i => i.chapa.toLowerCase().includes(termo) || i.descricao.toLowerCase().includes(termo))
      // A chapa digitada por inteiro vem antes das que só a contêm.
      .sort((a, b) => Number(b.chapa.toLowerCase() === termo) - Number(a.chapa.toLowerCase() === termo));
  }, [itens, termo]);

  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
      <div className="p-4 border-b border-slate-100">
        <div className="relative">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            autoFocus
            placeholder="Digite a chapa ou a descrição do item..."
            value={busca}
            onChange={e => setBusca(e.target.value)}
            className="w-full pl-10 pr-3 py-3 text-base border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        {termo.length >= 2 && (
          <p className="text-xs text-slate-400 mt-2">
            {resultados.length} resultado(s){resultados.length > MAX_RESULTADOS ? ` · mostrando os ${MAX_RESULTADOS} primeiros, refine a busca` : ''}
          </p>
        )}
      </div>

      {termo.length < 2 ? (
        <div className="text-center py-16 text-slate-400">
          <Search size={40} className="mx-auto mb-3 opacity-30" />
          <p className="text-sm">Pesquise um item para saber em qual sala ele está.</p>
        </div>
      ) : resultados.length === 0 ? (
        <div className="text-center py-16 text-slate-400">
          <Package size={40} className="mx-auto mb-3 opacity-30" />
          <p className="text-sm">Nenhum item encontrado.</p>
        </div>
      ) : (
        <div className="divide-y divide-slate-50">
          {resultados.slice(0, MAX_RESULTADOS).map(item => {
            const s = situacao(item);
            return (
              <div key={item.chapa} className="p-4">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-mono font-bold text-lg text-blue-700 bg-blue-50 px-2.5 py-0.5 rounded-lg">
                    {item.comodato ? item.chapa : `Chapa ${item.chapa}`}
                  </span>
                  <span className={`text-xs font-bold px-2.5 py-1 rounded-full inline-flex items-center gap-1 ${s.classes}`}>
                    {item.alocado && <DoorOpen size={12} />}
                    {s.texto}
                  </span>
                </div>
                <p className="font-medium text-slate-800 break-words mt-1">{item.descricao}</p>
                {item.alocado && (
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    Alocado por {item.alocadoPorNome} em {formatarData(item.alocadoEm)}
                    {item.conferidoEm ? ` · conferido em ${formatarData(item.conferidoEm)}` : ''}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

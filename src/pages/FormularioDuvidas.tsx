import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { HelpCircle, Send, CheckCircle2, Loader2 } from 'lucide-react';

interface EscolaOpcao {
  id: string;
  nome: string;
}

const CATEGORIAS = ['Obras', 'Manutenções', 'Patrimônio', 'Zeladoria', 'Outro'] as const;

export function FormularioDuvidas() {
  const [escolas, setEscolas] = useState<EscolaOpcao[]>([]);
  const [carregandoEscolas, setCarregandoEscolas] = useState(true);
  const [escolaId, setEscolaId] = useState('');
  const [categoria, setCategoria] = useState<string>('');
  const [duvida, setDuvida] = useState('');
  const [contato, setContato] = useState('');
  const [campoExtra, setCampoExtra] = useState(''); // honeypot: humano nunca preenche isso
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState('');
  const [enviado, setEnviado] = useState(false);

  useEffect(() => {
    supabase.functions.invoke('duvidas-escolas-enviar', { body: { action: 'listar_escolas' } })
      .then(({ data, error }) => {
        if (error) throw error;
        setEscolas(data?.escolas || []);
      })
      .catch(() => setErro('Não foi possível carregar a lista de escolas. Recarregue a página.'))
      .finally(() => setCarregandoEscolas(false));
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErro('');

    const escola = escolas.find(x => x.id === escolaId);
    if (!escola) { setErro('Selecione a escola.'); return; }
    if (!categoria) { setErro('Selecione o assunto da dúvida.'); return; }
    if (duvida.trim().length < 5) { setErro('Descreva a dúvida com um pouco mais de detalhe.'); return; }

    setEnviando(true);
    try {
      const { data, error } = await supabase.functions.invoke('duvidas-escolas-enviar', {
        body: {
          action: 'criar',
          escola_id: escola.id,
          escola_nome: escola.nome,
          categoria,
          duvida: duvida.trim(),
          contato: contato.trim(),
          campo_extra: campoExtra,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setEnviado(true);
    } catch (err: any) {
      setErro(err?.message || 'Não foi possível enviar sua dúvida. Tente novamente.');
    } finally {
      setEnviando(false);
    }
  }

  function enviarOutra() {
    setEnviado(false);
    setCategoria('');
    setDuvida('');
    setContato('');
    setErro('');
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-blue-50 p-4 flex flex-col items-center">
      <div className="w-full max-w-lg">
        <div className="text-center mb-6 pt-4">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-indigo-600 rounded-2xl mb-3 shadow-lg shadow-indigo-200">
            <HelpCircle size={28} className="text-white" />
          </div>
          <h1 className="text-2xl font-black text-slate-800 uppercase tracking-tight">Dúvidas das Escolas</h1>
          <p className="text-sm text-slate-500 font-semibold mt-1">
            Obras · Manutenções · Patrimônio · Zeladoria
          </p>
        </div>

        {enviado ? (
          <div className="bg-white rounded-3xl border border-green-100 shadow-sm p-8 text-center">
            <CheckCircle2 size={44} className="text-green-500 mx-auto mb-3" />
            <p className="font-black text-slate-800 text-lg">Dúvida enviada!</p>
            <p className="text-sm text-slate-500 mt-1.5">Obrigado por contribuir com a formação.</p>
            <button
              onClick={enviarOutra}
              className="mt-6 w-full py-3 rounded-2xl bg-indigo-600 text-white font-black uppercase tracking-widest text-xs hover:bg-indigo-700 transition-colors"
            >
              Enviar outra dúvida
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6 space-y-4">
            <div>
              <label className="block text-xs font-black text-slate-500 uppercase tracking-widest mb-1.5">Escola</label>
              <select
                value={escolaId}
                onChange={e => setEscolaId(e.target.value)}
                disabled={carregandoEscolas}
                className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-400"
              >
                <option value="">{carregandoEscolas ? 'Carregando...' : 'Selecione sua escola'}</option>
                {escolas.map(esc => (
                  <option key={esc.id} value={esc.id}>{esc.nome}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-black text-slate-500 uppercase tracking-widest mb-1.5">Assunto</label>
              <div className="grid grid-cols-2 gap-2">
                {CATEGORIAS.map(cat => (
                  <button
                    type="button"
                    key={cat}
                    onClick={() => setCategoria(cat)}
                    className={`px-3 py-2.5 rounded-xl text-xs font-black uppercase tracking-wide border transition-colors ${categoria === cat ? 'bg-indigo-600 border-indigo-600 text-white' : 'bg-white border-slate-200 text-slate-500 hover:border-indigo-300'}`}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs font-black text-slate-500 uppercase tracking-widest mb-1.5">Sua dúvida</label>
              <textarea
                value={duvida}
                onChange={e => setDuvida(e.target.value.slice(0, 1000))}
                rows={5}
                maxLength={1000}
                placeholder="Descreva sua dúvida..."
                className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-400 resize-none"
              />
              <p className="text-[11px] text-slate-400 text-right mt-1">{duvida.length}/1000</p>
            </div>

            <div>
              <label className="block text-xs font-black text-slate-500 uppercase tracking-widest mb-1.5">Seu nome ou contato (opcional)</label>
              <input
                type="text"
                value={contato}
                onChange={e => setContato(e.target.value.slice(0, 200))}
                placeholder="Se quiser resposta direta"
                className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-400"
              />
            </div>

            {/* Honeypot — invisível para humanos, atrai bots de preenchimento automático */}
            <div aria-hidden="true" style={{ position: 'absolute', left: '-9999px', width: 1, height: 1, overflow: 'hidden' }}>
              <label htmlFor="site">Não preencha este campo</label>
              <input
                id="site"
                type="text"
                tabIndex={-1}
                autoComplete="off"
                value={campoExtra}
                onChange={e => setCampoExtra(e.target.value)}
              />
            </div>

            {erro && <p className="text-sm font-semibold text-red-600 bg-red-50 rounded-xl px-3 py-2">{erro}</p>}

            <button
              type="submit"
              disabled={enviando}
              className="w-full py-3 rounded-2xl bg-indigo-600 text-white font-black uppercase tracking-widest text-xs hover:bg-indigo-700 transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
            >
              {enviando ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
              {enviando ? 'Enviando...' : 'Enviar dúvida'}
            </button>
          </form>
        )}

        <p className="text-center text-xs text-slate-400 font-bold mt-8 mb-4">
          SGE-GSU · Você pode enviar mais de uma dúvida
        </p>
      </div>
    </div>
  );
}

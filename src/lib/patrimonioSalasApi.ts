import { supabase } from './supabase';

// supabase.functions.invoke() joga um FunctionsHttpError genérico quando a function
// responde com status != 2xx — a mensagem real (JSON { error }) vem em error.context.
export async function invokePatrimonioSalas(action: string, payload: Record<string, unknown> = {}) {
  const { data, error } = await supabase.functions.invoke('patrimonio-salas', {
    body: { action, ...payload },
  });
  if (error) {
    let message = error.message;
    const context = (error as any).context;
    if (context && typeof context.json === 'function') {
      try {
        const body = await context.clone().json();
        if (body?.error) message = body.error;
      } catch { /* corpo não é JSON, mantém mensagem padrão */ }
    }
    throw new Error(message);
  }
  if (data?.error) throw new Error(data.error);
  return data;
}

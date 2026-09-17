-- Segunda-feira 14/09/2026 o alerta semanal de obras (job
-- "obras-alerta-semanal-segunda", 0 11 * * 1) rodou no horário certo mas a
-- chamada net.http_post falhou de forma pontual/transitória — como o cron
-- não tem retry, o alerta daquela semana quase se perdeu (só foi recuperado
-- disparando a função manualmente depois).
--
-- A função obras-alerta-semanal já é idempotente: ela só reenvia avaliações
-- que ainda não têm email_enviado=true em obra_avaliacao_alertas (ver
-- supabase/functions/obras-alerta-semanal/index.ts). Isso permite usar
-- reexecuções como rede de segurança sem risco de e-mail duplicado — se a
-- rodada de segunda 11h já deu certo, os retries abaixo só encontram
-- "pendentes.length === 0" e não fazem nada.
select cron.schedule(
  'obras-alerta-semanal-retry-tarde',
  '0 15 * * 1', -- segunda 15h UTC (12h BRT) — mesma tarde, cobre falha momentânea de manhã
  $$
  select net.http_post(
    url := 'https://crmihiulaxxwmzivfmsm.supabase.co/functions/v1/obras-alerta-semanal',
    headers := jsonb_build_object('Content-Type','application/json','x-cron-secret','bb7b52d4e4b4e7276125a6eac88817651cadf9cc7b6ff75d4eb7c5a0f28e719c'),
    body := '{}'::jsonb
  );
  $$
);

select cron.schedule(
  'obras-alerta-semanal-retry-terca',
  '0 11 * * 2', -- terça 11h UTC — cobre indisponibilidade que durou o dia inteiro de segunda
  $$
  select net.http_post(
    url := 'https://crmihiulaxxwmzivfmsm.supabase.co/functions/v1/obras-alerta-semanal',
    headers := jsonb_build_object('Content-Type','application/json','x-cron-secret','bb7b52d4e4b4e7276125a6eac88817651cadf9cc7b6ff75d4eb7c5a0f28e719c'),
    body := '{}'::jsonb
  );
  $$
);

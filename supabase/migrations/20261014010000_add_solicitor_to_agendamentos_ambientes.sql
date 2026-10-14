-- Adiciona nome e WhatsApp do solicitante nos agendamentos de ambientes.
-- Colunas nullable: registros anteriores ficam com NULL.

alter table public.agendamentos_ambientes
  add column if not exists solicitor_name     text,
  add column if not exists solicitor_whatsapp text;

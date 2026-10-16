-- Data da nota fiscal de cada item a incorporar, ao lado do número. O número
-- deixa de ser obrigatório para permitir informar os dois campos em qualquer
-- ordem (a linha some quando ambos ficam vazios).
alter table public.patrimonio_itens_nota_fiscal add column if not exists data_nota_fiscal date;
alter table public.patrimonio_itens_nota_fiscal alter column numero_nota_fiscal drop not null;

-- Selo de Acompanhamento de Obras: a meta deixa de ser um número fixo de
-- registros no ano e passa a ser o percentual das semanas do prazo da obra
-- em que a escola registrou o acompanhamento (padrão 70%, editável pelo
-- regional_admin na tela). Só troca o critério se ainda estiver no valor
-- antigo (8 registros), para não desfazer um ajuste feito pela Regional.
update public.selos
   set criterio_minimo = 70,
       descricao = 'Escola que registra o acompanhamento semanal na maior parte das semanas do prazo da obra.'
 where slug = 'acompanhamento-obras'
   and criterio_minimo = 8;

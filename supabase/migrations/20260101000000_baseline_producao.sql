


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE SCHEMA IF NOT EXISTS "public";


ALTER SCHEMA "public" OWNER TO "pg_database_owner";


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE TYPE "public"."user_role" AS ENUM (
    'regional_admin',
    'school_manager',
    'supervisor',
    'dirigente',
    'ure_servico',
    'ure_ecc',
    'chefe_departamento'
);


ALTER TYPE "public"."user_role" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."atualizar_data_conversa"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  -- Sempre que entrar uma mensagem, atualiza a data da conversa pai
  UPDATE public.conversas 
  SET atualizada_em = NOW() 
  WHERE id = NEW.conversa_id;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."atualizar_data_conversa"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."block_write_for_readonly_roles"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if exists (
    select 1 from profiles where id = auth.uid() and role = 'chefe_departamento'
  ) then
    raise exception 'Acesso somente leitura: escrita não permitida para este usuário.'
      using errcode = '42501';
  end if;
  return coalesce(new, old);
end;
$$;


ALTER FUNCTION "public"."block_write_for_readonly_roles"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_my_role"() RETURNS "text"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid();
$$;


ALTER FUNCTION "public"."get_my_role"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_my_school_id"() RETURNS "uuid"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    AS $$
  SELECT school_id FROM public.profiles WHERE id = auth.uid();
$$;


ALTER FUNCTION "public"."get_my_school_id"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_pending_water_schools"("p_window_start" "date", "p_today" "date") RETURNS TABLE("school_id" "uuid", "school_name" "text", "year" integer, "month" integer, "missing_days" integer)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  with suspended_dates as (
    select distinct date
    from consumo_agua
    where meter_id is null
      and justification like 'Suspensão de Expediente:%'
      and date between p_window_start and p_today
  ),
  business_days as (
    select gs::date as day
    from generate_series(p_window_start::timestamp, p_today::timestamp, interval '1 day') as gs
    where extract(dow from gs) not in (0, 6)
      and gs::date not in (select date from suspended_dates)
  ),
  eligible_schools as (
    select id, name
    from schools
    where coalesce(water_exempt, false) = false
  ),
  expected as (
    select s.id as school_id, s.name as school_name, b.day
    from eligible_schools s
    cross join business_days b
  ),
  registered as (
    select distinct school_id, date
    from consumo_agua
    where date between p_window_start and p_today
  )
  select
    e.school_id,
    e.school_name,
    extract(year from e.day)::int as year,
    extract(month from e.day)::int as month,
    count(*)::int as missing_days
  from expected e
  left join registered r
    on r.school_id = e.school_id and r.date = e.day
  where r.date is null
  group by e.school_id, e.school_name, extract(year from e.day), extract(month from e.day)
  having count(*) > 0
  order by e.school_name, 3, 4;
$$;


ALTER FUNCTION "public"."get_pending_water_schools"("p_window_start" "date", "p_today" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_user_data"() RETURNS TABLE("perfil" "text", "escola_id" "uuid")
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  RETURN QUERY SELECT u.perfil, u.escola_id 
  FROM usuarios u 
  WHERE u.id = auth.uid();
END;
$$;


ALTER FUNCTION "public"."get_user_data"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_user_last_access"() RETURNS TABLE("user_id" "uuid", "email" "text", "last_sign_in_at" timestamp with time zone, "created_at" timestamp with time zone)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if not exists (
    select 1 from profiles
    where id = auth.uid()
      and role in ('regional_admin', 'chefe_departamento', 'supervisor', 'dirigente', 'ure_servico', 'ure_ecc')
  ) then
    raise exception 'Acesso negado.' using errcode = '42501';
  end if;

  return query
    select au.id, au.email, au.last_sign_in_at, au.created_at
    from auth.users au;
end;
$$;


ALTER FUNCTION "public"."get_user_last_access"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."iniciar_conversa"("p_participante1" "uuid", "p_participante2" "uuid", "p_setor" character varying) RETURNS json
    LANGUAGE "plpgsql"
    AS $$
DECLARE
    v_conversa_id UUID;
    v_ano INT;
    v_sequencia INT;
    v_protocolo VARCHAR;
    v_resultado JSON;
BEGIN
    -- Pega o ano atual
    v_ano := EXTRACT(YEAR FROM CURRENT_DATE);

    -- Conta quantas conversas já existem naquele ano e setor para gerar o número sequencial
    SELECT COUNT(*) + 1 INTO v_sequencia 
    FROM public.conversas 
    WHERE protocolo LIKE 'CHAT-' || p_setor || '-' || v_ano || '-%';

    -- Monta o protocolo (ex: CHAT-SEOM-2026-00001)
    v_protocolo := 'CHAT-' || p_setor || '-' || v_ano || '-' || LPAD(v_sequencia::TEXT, 5, '0');

    -- Insere a nova conversa e captura o ID gerado
    INSERT INTO public.conversas (protocolo, participante1_id, participante2_id)
    VALUES (v_protocolo, p_participante1, p_participante2)
    RETURNING id INTO v_conversa_id;

    -- Retorna um objeto JSON com o ID e o Protocolo para o Front-end
    v_resultado := json_build_object('id', v_conversa_id, 'protocolo', v_protocolo);
    RETURN v_resultado;
END;
$$;


ALTER FUNCTION "public"."iniciar_conversa"("p_participante1" "uuid", "p_participante2" "uuid", "p_setor" character varying) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_admin"() RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.usuarios
    WHERE id = auth.uid()
    AND perfil = 'ADMINISTRADOR'
  );
END;
$$;


ALTER FUNCTION "public"."is_admin"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_regional"() RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.usuarios
    WHERE id = auth.uid()
    AND perfil = 'Regional'
  );
END;
$$;


ALTER FUNCTION "public"."is_regional"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_my_favorite_pages"("pages" "jsonb") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  UPDATE profiles SET favorite_pages = pages WHERE id = auth.uid();
END;
$$;


ALTER FUNCTION "public"."set_my_favorite_pages"("pages" "jsonb") OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."access_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "event_type" "text" NOT NULL,
    "page" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "session_id" "uuid",
    CONSTRAINT "access_logs_event_type_check" CHECK (("event_type" = ANY (ARRAY['login'::"text", 'page_view'::"text", 'logout'::"text"])))
);


ALTER TABLE "public"."access_logs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."acquisition_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "title" "text" NOT NULL,
    "start_date" "date" NOT NULL,
    "end_date" "date" NOT NULL,
    "status" "text" DEFAULT 'ABERTO'::"text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "sent_to_fde_date" "date",
    CONSTRAINT "acquisition_events_status_check" CHECK (("status" = ANY (ARRAY['ABERTO'::"text", 'FECHADO'::"text", 'CANCELADO'::"text", 'ENVIADO_FDE'::"text"])))
);


ALTER TABLE "public"."acquisition_events" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."acquisition_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "code" "text" NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."acquisition_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."acquisition_responses" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "event_id" "uuid",
    "school_id" "uuid",
    "item_id" "uuid",
    "requested_qty" integer DEFAULT 0,
    "planned_qty" integer DEFAULT 0,
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "is_received" boolean DEFAULT false,
    "received_at" timestamp with time zone
);


ALTER TABLE "public"."acquisition_responses" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."agendamentos_ambientes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "ambiente_id" "uuid",
    "user_id" "uuid",
    "user_name" "text" NOT NULL,
    "titulo_evento" "text" NOT NULL,
    "data_agendamento" "date" NOT NULL,
    "hora_inicio" time without time zone NOT NULL,
    "hora_fim" time without time zone NOT NULL,
    "quantidade_pessoas" integer NOT NULL,
    "observacao" "text",
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()),
    "status" "text" DEFAULT 'pendente'::"text",
    "motivo_reprovacao" "text",
    "historico_edicao" "text"
);


ALTER TABLE "public"."agendamentos_ambientes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."almoxarifado_itens" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "nome" "text" NOT NULL,
    "quantidade" integer DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "unidade" "text" DEFAULT 'Unidade'::"text"
);


ALTER TABLE "public"."almoxarifado_itens" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."almoxarifado_responsaveis" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "user_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."almoxarifado_responsaveis" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."almoxarifado_solicitacao_itens" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "solicitacao_id" "uuid",
    "item_id" "uuid",
    "quantidade_solicitada" integer NOT NULL,
    "quantidade_aprovada" integer DEFAULT 0
);


ALTER TABLE "public"."almoxarifado_solicitacao_itens" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."almoxarifado_solicitacoes" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "user_id" "uuid",
    "nome_solicitante" "text" NOT NULL,
    "nome_evento" "text" NOT NULL,
    "quantidade_pessoas" integer NOT NULL,
    "status" "text" DEFAULT 'pendente'::"text",
    "observacao" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "data_entrega" "date"
);


ALTER TABLE "public"."almoxarifado_solicitacoes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."ambientes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "nome" "text" NOT NULL,
    "capacidade" integer NOT NULL,
    "ativo" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"())
);


ALTER TABLE "public"."ambientes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."asset_processes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "school_id" "uuid",
    "type" "text" NOT NULL,
    "sei_number" "text" NOT NULL,
    "process_date" "date" NOT NULL,
    "current_step" "text" NOT NULL,
    "status" "text" DEFAULT 'ATIVO'::"text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "occurrence_date" "date",
    "bulletin_number" "text",
    "is_nl_low" boolean DEFAULT false,
    "authorship" "text",
    "conclusion" "text",
    "subtype" "text",
    "items_json" "jsonb"
);


ALTER TABLE "public"."asset_processes" OWNER TO "postgres";


COMMENT ON COLUMN "public"."asset_processes"."items_json" IS 'Armazena a lista de equipamentos, patrimónios e valores unitários';



CREATE TABLE IF NOT EXISTS "public"."building_inspections" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "school_id" "uuid" NOT NULL,
    "inspection_date" "date" NOT NULL,
    "element_evaluated" character varying(100) NOT NULL,
    "score" numeric(4,2) NOT NULL,
    "created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE "public"."building_inspections" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."car_schedules" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "status" "text",
    "requester_name" "text",
    "service_date" "date",
    "unique_key" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."car_schedules" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."construction_works" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "school_id" "uuid" NOT NULL,
    "title" "text" NOT NULL,
    "integra_code" "text",
    "pi_code" "text",
    "sei_number" "text",
    "company_name" "text" NOT NULL,
    "start_date" "date" NOT NULL,
    "deadline_days" integer NOT NULL,
    "status" "text" DEFAULT 'EM ANDAMENTO'::"text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."construction_works" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."consumo_agua" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "school_id" "uuid" NOT NULL,
    "date" "date" NOT NULL,
    "reading_m3" numeric(10,2) NOT NULL,
    "consumption_diff" numeric(10,2),
    "student_count" integer DEFAULT 0,
    "staff_count" integer DEFAULT 0,
    "limit_exceeded" boolean DEFAULT false,
    "justification" "text",
    "action_plan" "text",
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "created_by" "uuid",
    "meter_id" "uuid",
    "meter_id_key" "uuid" GENERATED ALWAYS AS (COALESCE("meter_id", '00000000-0000-0000-0000-000000000000'::"uuid")) STORED
);


ALTER TABLE "public"."consumo_agua" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."consumo_agua_luz" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "codigo_predio" "text" NOT NULL,
    "nome_escola" "text",
    "mes_ano" "text" NOT NULL,
    "agua_qtde_m3" numeric,
    "agua_valor" numeric,
    "energia_qtde_kwh" numeric,
    "energia_valor" numeric,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"())
);


ALTER TABLE "public"."consumo_agua_luz" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."conversas" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "protocolo" character varying(50) NOT NULL,
    "participante1_id" "uuid" NOT NULL,
    "participante2_id" "uuid" NOT NULL,
    "criada_em" timestamp with time zone DEFAULT "now"(),
    "status" character varying(50) DEFAULT 'aberta'::character varying,
    "atualizada_em" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."conversas" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."demands" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "school_id" "uuid",
    "title" "text" NOT NULL,
    "description" "text",
    "deadline" "date" NOT NULL,
    "status" "text" DEFAULT 'PENDENTE'::"text",
    "priority" "text" DEFAULT 'MÉDIA'::"text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "completed_at" timestamp with time zone
);


ALTER TABLE "public"."demands" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."fiscalizacao_limpeza" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "mes_referencia" character varying(7) NOT NULL,
    "ambiente_id" character varying(50) NOT NULL,
    "q1_lavagem" boolean DEFAULT false,
    "q2_semanal" boolean DEFAULT false,
    "q3_lixo" boolean DEFAULT false,
    "q4_poeira" boolean DEFAULT false,
    "q5_ventilador" boolean DEFAULT false,
    "q6_vidro" boolean DEFAULT false,
    "nota_final" numeric(4,2) DEFAULT 0,
    "avaliador_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."fiscalizacao_limpeza" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."fluxo_registros" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "tipo" "text" DEFAULT 'entrada'::"text" NOT NULL,
    "pessoa_nova" boolean DEFAULT true NOT NULL
);


ALTER TABLE "public"."fluxo_registros" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."indice_escolas" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "nome_escola_novo" "text",
    "nome_escola_antigo" "text",
    "nome_no_banco_de_dados" "text",
    "cie" "text",
    "codigo_fde" "text",
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()),
    "nome_no_avcb" "text"
);


ALTER TABLE "public"."indice_escolas" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."internal_tickets" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "protocol" "text" NOT NULL,
    "school_id" "uuid" NOT NULL,
    "created_by" "uuid",
    "title" "text" NOT NULL,
    "category" "text" NOT NULL,
    "department" "text" NOT NULL,
    "description" "text",
    "drive_link" "text",
    "status" "text" DEFAULT 'ABERTO'::"text",
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()),
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()),
    "priority" "text" DEFAULT 'NORMAL'::"text",
    "sub_category" "text",
    "assigned_to" "uuid",
    "origem_tipo" "text",
    "origem_id" "text",
    "origem_label" "text",
    CONSTRAINT "internal_tickets_department_check" CHECK (("department" = ANY (ARRAY['SEOM'::"text", 'SEFISC'::"text"]))),
    CONSTRAINT "internal_tickets_status_check" CHECK (("status" = ANY (ARRAY['ABERTO'::"text", 'EM_ANDAMENTO'::"text", 'AGUARDANDO_ESCOLA'::"text", 'CONCLUIDO'::"text"])))
);


ALTER TABLE "public"."internal_tickets" OWNER TO "postgres";


COMMENT ON COLUMN "public"."internal_tickets"."origem_tipo" IS 'Tipo do registro de patrimônio que originou o chamado: "atendimento" ou "remanejamento". Nulo para chamados abertos sem referência.';



COMMENT ON COLUMN "public"."internal_tickets"."origem_id" IS 'ID (na planilha Google Sheets de Atendimento Patrimônio) do atendimento/remanejamento referenciado.';



COMMENT ON COLUMN "public"."internal_tickets"."origem_label" IS 'Descrição legível do atendimento/remanejamento referenciado, para exibição direta sem precisar consultar a planilha.';



CREATE TABLE IF NOT EXISTS "public"."inventory_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "school_id" "uuid",
    "item_name" "text" NOT NULL,
    "asset_number" "text" NOT NULL,
    "description" "text",
    "image_url" "text",
    "status" "text" DEFAULT 'DISPONÍVEL'::"text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "created_by" "uuid",
    "batch_id" "uuid",
    "interested_school_id" "uuid",
    "status_notes" "text",
    "approval_number" integer,
    "approval_year" integer,
    "gr_link" "text"
);


ALTER TABLE "public"."inventory_items" OWNER TO "postgres";


COMMENT ON COLUMN "public"."inventory_items"."gr_link" IS 'URL externa (Google Drive) da Guia de Remanejamento do lote. Nulo quando o lote não possui guia cadastrada.';



CREATE TABLE IF NOT EXISTS "public"."maintenance_tickets" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "school_id" "uuid",
    "title" "text" NOT NULL,
    "description" "text",
    "status" "text" DEFAULT 'pendente'::"text",
    "priority" "text" DEFAULT 'media'::"text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "maintenance_tickets_priority_check" CHECK (("priority" = ANY (ARRAY['baixa'::"text", 'media'::"text", 'alta'::"text", 'urgente'::"text"]))),
    CONSTRAINT "maintenance_tickets_status_check" CHECK (("status" = ANY (ARRAY['pendente'::"text", 'em_andamento'::"text", 'concluido'::"text"])))
);


ALTER TABLE "public"."maintenance_tickets" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."manejo_arboreo" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "escola_id" "uuid" NOT NULL,
    "validade_autorizacao" "date",
    "qtd_remocao" integer DEFAULT 0,
    "qtd_poda" integer DEFAULT 0,
    "nao_se_aplica" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL
);


ALTER TABLE "public"."manejo_arboreo" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."manuals" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "title" "text" NOT NULL,
    "description" "text",
    "category" "text" NOT NULL,
    "drive_link" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "created_by" "uuid"
);


ALTER TABLE "public"."manuals" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."meetings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "title" "text" NOT NULL,
    "description" "text",
    "date" "date" NOT NULL,
    "time" time without time zone NOT NULL,
    "modality" "text" NOT NULL,
    "location_link" "text",
    "location_address" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "created_by" "uuid",
    "event_type" "text" DEFAULT 'REUNIAO'::"text",
    "school_id" "uuid",
    "patrimonio_atendimento_id" "text",
    CONSTRAINT "meetings_modality_check" CHECK (("modality" = ANY (ARRAY['Online'::"text", 'Presencial'::"text", 'N/A'::"text"])))
);


ALTER TABLE "public"."meetings" OWNER TO "postgres";


COMMENT ON COLUMN "public"."meetings"."patrimonio_atendimento_id" IS 'ID da linha correspondente na aba Atendimentos_Teams da planilha (Google Sheets), quando event_type = PATRIMONIO. Nulo se ainda não sincronizado.';



CREATE TABLE IF NOT EXISTS "public"."messages" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "conversa_id" "uuid" NOT NULL,
    "sender_id" "uuid" NOT NULL,
    "content" "text" NOT NULL,
    "is_read" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."messages" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."monitoring_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "date" "date" NOT NULL,
    "service_type" "text" NOT NULL,
    "frequency" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "created_by" "uuid"
);


ALTER TABLE "public"."monitoring_events" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."monitoring_submissions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "event_id" "uuid",
    "school_id" "uuid",
    "is_completed" boolean DEFAULT false,
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "is_dispensed" boolean DEFAULT false,
    "rating" integer
);


ALTER TABLE "public"."monitoring_submissions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."occurrences" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "type" "text" NOT NULL,
    "school_name" "text" NOT NULL,
    "user_name" "text" NOT NULL,
    "details" "text",
    "school_id" "uuid"
);


ALTER TABLE "public"."occurrences" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."patrimonial_actions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "school_id" "uuid",
    "date" "date" NOT NULL,
    "title" "text" NOT NULL,
    "description" "text",
    "impact" "text" DEFAULT 'Médio'::"text",
    "photo_before_url" "text",
    "photo_after_url" "text"
);


ALTER TABLE "public"."patrimonial_actions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."patrimonial_occurrences" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "school_id" "uuid",
    "date" "date" NOT NULL,
    "type" "text" NOT NULL,
    "description" "text",
    "status" "text" DEFAULT 'Pendente'::"text",
    "photo_url" "text"
);


ALTER TABLE "public"."patrimonial_occurrences" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."portaria_registros" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "nome" "text" NOT NULL,
    "cpf" character varying(14) NOT NULL,
    "setor" "text" NOT NULL,
    "registrado_por" "text" DEFAULT 'ure_servico'::"text"
);


ALTER TABLE "public"."portaria_registros" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."processos_furtos" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "numero_sei" "text" NOT NULL,
    "escola_id" "uuid" NOT NULL,
    "data_ocorrencia" "date" NOT NULL,
    "tipo_ocorrencia" "text" NOT NULL,
    "numero_bo" "text",
    "autoria" "text",
    "situacao" "text" NOT NULL,
    "status" "text" NOT NULL,
    "nl_baixa" "text",
    "valor_total" numeric DEFAULT 0,
    "itens" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"())
);


ALTER TABLE "public"."processos_furtos" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" NOT NULL,
    "full_name" "text",
    "role" "public"."user_role" DEFAULT 'school_manager'::"public"."user_role" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "school_id" "uuid",
    "email" "text",
    "setor" "text",
    "supervisor_schools" "uuid"[],
    "salas_trabalho" "text"[],
    "favorite_pages" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";


COMMENT ON COLUMN "public"."profiles"."salas_trabalho" IS 'IDs das salas (aba "Salas" da planilha de patrimônio) vinculadas ao usuário ure_servico. Nulo/vazio para demais roles.';



COMMENT ON COLUMN "public"."profiles"."favorite_pages" IS 'Lista (jsonb array de strings) dos ids de página marcados como favoritos pelo usuário no menu lateral.';



CREATE TABLE IF NOT EXISTS "public"."ranking_parameters" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "nome_parametro" "text" NOT NULL,
    "spreadsheet_id" "text" NOT NULL,
    "aba_nome" "text" NOT NULL,
    "coluna_escola" "text" NOT NULL,
    "coluna_pontuacao" "text" NOT NULL,
    "peso" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "regional_id" "uuid"
);


ALTER TABLE "public"."ranking_parameters" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."ranking_settings" (
    "id" "text" NOT NULL,
    "water_reg" numeric DEFAULT 2,
    "water_limit" numeric DEFAULT 1,
    "demand_on_time" numeric DEFAULT 3,
    "fiscal_delivery" numeric DEFAULT 2,
    "fiscal_quality" numeric DEFAULT 2,
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "tree_management" numeric DEFAULT 2.0,
    "zeladoria" numeric DEFAULT 2.0,
    "penalty_per_occurrence" numeric DEFAULT 0.5,
    "penalty_max" numeric DEFAULT 2.0,
    "avcb" numeric DEFAULT 1.7 NOT NULL
);


ALTER TABLE "public"."ranking_settings" OWNER TO "postgres";


COMMENT ON COLUMN "public"."ranking_settings"."avcb" IS 'Peso (0 a 10) do pilar AVCB no cálculo do GSU. Escola com AVCB válido recebe 100% deste peso, sem registro na planilha recebe 50% (neutro) e com AVCB vencido recebe 0%.';



CREATE TABLE IF NOT EXISTS "public"."reservas_provisorias" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "ambiente_id" "uuid" NOT NULL,
    "data_agendamento" "date" NOT NULL,
    "hora_inicio" time without time zone NOT NULL,
    "hora_fim" time without time zone NOT NULL,
    "user_id" "uuid" NOT NULL,
    "expires_at" timestamp with time zone NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."reservas_provisorias" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."room_schedules" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "start_date" "date",
    "end_date" "date",
    "start_time" "text",
    "end_time" "text",
    "room_name" "text",
    "status" "text",
    "unique_key" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "service_name" "text"
);


ALTER TABLE "public"."room_schedules" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."school_fiscals" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "school_id" "uuid" NOT NULL,
    "contract_type" "text" NOT NULL,
    "fiscal_name" "text" NOT NULL,
    "contact_info" "text",
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL
);


ALTER TABLE "public"."school_fiscals" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."school_meters" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "school_id" "uuid" NOT NULL,
    "name" "text" DEFAULT 'Hidrômetro Principal'::"text" NOT NULL,
    "description" "text",
    "is_active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "created_by" "uuid"
);


ALTER TABLE "public"."school_meters" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."school_plans" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "school_id" "uuid" NOT NULL,
    "plan_url" "text" NOT NULL,
    "description" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL
);


ALTER TABLE "public"."school_plans" OWNER TO "postgres";


COMMENT ON TABLE "public"."school_plans" IS 'Tabela que armazena os links das plantas prediais das escolas.';



CREATE TABLE IF NOT EXISTS "public"."schools" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "name" "text" NOT NULL,
    "email" "text",
    "phone" "text",
    "address" "text",
    "zip_code" "text",
    "director_name" "text",
    "manager_name" "text",
    "fde_code" "text",
    "edp_installation_id" "text",
    "sabesp_supply_id" "text",
    "student_count" integer DEFAULT 0,
    "teacher_count" integer DEFAULT 0,
    "sgi_code" "text",
    "building_year" integer,
    "sector_number" "text",
    "teaching_types" "text"[],
    "periods" "text"[],
    "room_count" integer,
    "property_registration" "text",
    "has_elevator" boolean DEFAULT false,
    "latitude" double precision,
    "longitude" double precision,
    "cie_code" "text",
    "is_elevator_operational" boolean DEFAULT true,
    "last_elevator_maintenance" timestamp with time zone,
    "water_exempt" boolean DEFAULT false
);


ALTER TABLE "public"."schools" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."servicos_manutencao" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "escola_id" "uuid",
    "descricao" "text" NOT NULL,
    "empresa" "text",
    "valor" numeric,
    "status" "text" DEFAULT 'Aguardando Orçamentos'::"text" NOT NULL,
    "data_inicio" "date",
    "data_previsao_termino" "date",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."servicos_manutencao" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."system_metadata" (
    "key" character varying(50) NOT NULL,
    "updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE "public"."system_metadata" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."tags_pessoais" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "usuario_id" "uuid" NOT NULL,
    "nome" "text" NOT NULL,
    "cor" "text" DEFAULT '#3B82F6'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."tags_pessoais" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."tarefas_pessoais" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "usuario_id" "uuid" NOT NULL,
    "titulo" "text" NOT NULL,
    "descricao" "text",
    "status" "text" DEFAULT 'pendente'::"text",
    "prioridade" "text" DEFAULT 'media'::"text",
    "data_vencimento" "date",
    "data_conclusao" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "tag_id" "uuid",
    "escola" "text",
    CONSTRAINT "tarefas_pessoais_prioridade_check" CHECK (("prioridade" = ANY (ARRAY['baixa'::"text", 'media'::"text", 'alta'::"text"]))),
    CONSTRAINT "tarefas_pessoais_status_check" CHECK (("status" = ANY (ARRAY['pendente'::"text", 'em_andamento'::"text", 'concluido'::"text"])))
);


ALTER TABLE "public"."tarefas_pessoais" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."ticket_categories" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "department" "text" NOT NULL,
    "name" "text" NOT NULL,
    "subcategories" "text"[] DEFAULT '{}'::"text"[],
    "created_at" timestamp with time zone DEFAULT "now"(),
    "is_urgent" boolean DEFAULT false
);


ALTER TABLE "public"."ticket_categories" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."ticket_messages" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "ticket_id" "uuid",
    "user_id" "uuid",
    "message" "text" NOT NULL,
    "type" "text" DEFAULT 'RESPONSE'::"text",
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()),
    "is_read" boolean DEFAULT false
);


ALTER TABLE "public"."ticket_messages" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."whatsapp_conversations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "message_id" "text",
    "client_phone" "text" NOT NULL,
    "client_name" "text",
    "direction" "text",
    "message_body" "text",
    "message_type" "text",
    "protocol" "text",
    "status" "text" DEFAULT 'ABERTO'::"text",
    "timestamp" bigint,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()),
    CONSTRAINT "whatsapp_conversations_direction_check" CHECK (("direction" = ANY (ARRAY['SENT'::"text", 'RECEIVED'::"text"])))
);


ALTER TABLE "public"."whatsapp_conversations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."zeladoria_timeline" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "zeladoria_id" bigint NOT NULL,
    "previous_status" "text",
    "new_status" "text" NOT NULL,
    "changed_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "changed_by" "uuid",
    "notes" "text"
);


ALTER TABLE "public"."zeladoria_timeline" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."zeladorias" (
    "id" bigint NOT NULL,
    "ue" "text",
    "nome" "text",
    "sei_numero" "text",
    "ocupada" "text",
    "zelador" "text",
    "rg" "text",
    "cargo" "text",
    "autorizacao" "text",
    "ate" "text",
    "validade" "date",
    "perto_de_vencer" "text",
    "obs_sefisc" "text",
    "apelido_zelador" "text",
    "emails" "text",
    "dare" "text",
    "valor_imovel" "text",
    "imovel_1_porcento" "text",
    "salario_10_porcento" "text",
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()),
    "school_id" "uuid",
    "status_updated_at" timestamp with time zone DEFAULT "now"(),
    "admin_notes" "text",
    "terreno_fazenda_estado" boolean,
    "sei_regularizacao" "text",
    "certidao_matricula" boolean,
    "sei_certidao" "text",
    "cartorio_matricula" "text",
    "numero_matricula" "text",
    "valor_zeladoria" numeric
);


ALTER TABLE "public"."zeladorias" OWNER TO "postgres";


COMMENT ON COLUMN "public"."zeladorias"."valor_zeladoria" IS 'Valor do desconto de Zeladoria informado ao enviar o processo para a etapa SEFREP, para cadastro na folha de pagamento do servidor. Nulo quando o servidor é isento ou o valor ainda não foi informado.';



ALTER TABLE "public"."zeladorias" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."zeladorias_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



ALTER TABLE ONLY "public"."access_logs"
    ADD CONSTRAINT "access_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."acquisition_events"
    ADD CONSTRAINT "acquisition_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."acquisition_items"
    ADD CONSTRAINT "acquisition_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."acquisition_responses"
    ADD CONSTRAINT "acquisition_responses_event_id_school_id_item_id_key" UNIQUE ("event_id", "school_id", "item_id");



ALTER TABLE ONLY "public"."acquisition_responses"
    ADD CONSTRAINT "acquisition_responses_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."agendamentos_ambientes"
    ADD CONSTRAINT "agendamentos_ambientes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."almoxarifado_itens"
    ADD CONSTRAINT "almoxarifado_itens_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."almoxarifado_responsaveis"
    ADD CONSTRAINT "almoxarifado_responsaveis_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."almoxarifado_solicitacao_itens"
    ADD CONSTRAINT "almoxarifado_solicitacao_itens_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."almoxarifado_solicitacoes"
    ADD CONSTRAINT "almoxarifado_solicitacoes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ambientes"
    ADD CONSTRAINT "ambientes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."asset_processes"
    ADD CONSTRAINT "asset_processes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."building_inspections"
    ADD CONSTRAINT "building_inspections_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."car_schedules"
    ADD CONSTRAINT "car_schedules_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."car_schedules"
    ADD CONSTRAINT "car_schedules_unique_key_key" UNIQUE ("unique_key");



ALTER TABLE ONLY "public"."construction_works"
    ADD CONSTRAINT "construction_works_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."consumo_agua_luz"
    ADD CONSTRAINT "consumo_agua_luz_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."consumo_agua"
    ADD CONSTRAINT "consumo_agua_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."consumo_agua"
    ADD CONSTRAINT "consumo_agua_school_date_meter_unique" UNIQUE ("school_id", "date", "meter_id_key");



ALTER TABLE ONLY "public"."conversas"
    ADD CONSTRAINT "conversas_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."conversas"
    ADD CONSTRAINT "conversas_protocolo_key" UNIQUE ("protocolo");



ALTER TABLE ONLY "public"."demands"
    ADD CONSTRAINT "demands_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."fiscalizacao_limpeza"
    ADD CONSTRAINT "fiscalizacao_limpeza_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."fluxo_registros"
    ADD CONSTRAINT "fluxo_registros_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."indice_escolas"
    ADD CONSTRAINT "indice_escolas_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."internal_tickets"
    ADD CONSTRAINT "internal_tickets_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."internal_tickets"
    ADD CONSTRAINT "internal_tickets_protocol_key" UNIQUE ("protocol");



ALTER TABLE ONLY "public"."inventory_items"
    ADD CONSTRAINT "inventory_items_asset_number_key" UNIQUE ("asset_number");



ALTER TABLE ONLY "public"."inventory_items"
    ADD CONSTRAINT "inventory_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."maintenance_tickets"
    ADD CONSTRAINT "maintenance_tickets_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."manejo_arboreo"
    ADD CONSTRAINT "manejo_arboreo_escola_id_key" UNIQUE ("escola_id");



ALTER TABLE ONLY "public"."manejo_arboreo"
    ADD CONSTRAINT "manejo_arboreo_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."manuals"
    ADD CONSTRAINT "manuals_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."meetings"
    ADD CONSTRAINT "meetings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."messages"
    ADD CONSTRAINT "messages_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."monitoring_events"
    ADD CONSTRAINT "monitoring_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."monitoring_submissions"
    ADD CONSTRAINT "monitoring_submissions_event_id_school_id_key" UNIQUE ("event_id", "school_id");



ALTER TABLE ONLY "public"."monitoring_submissions"
    ADD CONSTRAINT "monitoring_submissions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."occurrences"
    ADD CONSTRAINT "occurrences_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."patrimonial_actions"
    ADD CONSTRAINT "patrimonial_actions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."patrimonial_occurrences"
    ADD CONSTRAINT "patrimonial_occurrences_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."portaria_registros"
    ADD CONSTRAINT "portaria_registros_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."processos_furtos"
    ADD CONSTRAINT "processos_furtos_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ranking_parameters"
    ADD CONSTRAINT "ranking_parameters_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ranking_settings"
    ADD CONSTRAINT "ranking_settings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."reservas_provisorias"
    ADD CONSTRAINT "reservas_provisorias_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."room_schedules"
    ADD CONSTRAINT "room_schedules_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."room_schedules"
    ADD CONSTRAINT "room_schedules_unique_key_key" UNIQUE ("unique_key");



ALTER TABLE ONLY "public"."school_fiscals"
    ADD CONSTRAINT "school_fiscals_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."school_meters"
    ADD CONSTRAINT "school_meters_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."school_plans"
    ADD CONSTRAINT "school_plans_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."schools"
    ADD CONSTRAINT "schools_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."servicos_manutencao"
    ADD CONSTRAINT "servicos_manutencao_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."system_metadata"
    ADD CONSTRAINT "system_metadata_pkey" PRIMARY KEY ("key");



ALTER TABLE ONLY "public"."tags_pessoais"
    ADD CONSTRAINT "tags_pessoais_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."tarefas_pessoais"
    ADD CONSTRAINT "tarefas_pessoais_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ticket_categories"
    ADD CONSTRAINT "ticket_categories_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ticket_messages"
    ADD CONSTRAINT "ticket_messages_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."consumo_agua_luz"
    ADD CONSTRAINT "unique_consumo_mes" UNIQUE ("codigo_predio", "mes_ano");



ALTER TABLE ONLY "public"."building_inspections"
    ADD CONSTRAINT "unique_school_inspection_element" UNIQUE ("school_id", "inspection_date", "element_evaluated");



ALTER TABLE ONLY "public"."whatsapp_conversations"
    ADD CONSTRAINT "whatsapp_conversations_message_id_key" UNIQUE ("message_id");



ALTER TABLE ONLY "public"."whatsapp_conversations"
    ADD CONSTRAINT "whatsapp_conversations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."zeladoria_timeline"
    ADD CONSTRAINT "zeladoria_timeline_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."zeladorias"
    ADD CONSTRAINT "zeladorias_pkey" PRIMARY KEY ("id");



CREATE INDEX "access_logs_created_at_idx" ON "public"."access_logs" USING "btree" ("created_at");



CREATE INDEX "access_logs_event_type_idx" ON "public"."access_logs" USING "btree" ("event_type");



CREATE INDEX "access_logs_session_id_idx" ON "public"."access_logs" USING "btree" ("session_id");



CREATE INDEX "access_logs_user_id_idx" ON "public"."access_logs" USING "btree" ("user_id");



CREATE INDEX "idx_approval_seq" ON "public"."inventory_items" USING "btree" ("approval_year", "approval_number");



CREATE INDEX "idx_reservas_prov_ambiente" ON "public"."reservas_provisorias" USING "btree" ("ambiente_id");



CREATE INDEX "idx_reservas_prov_expires" ON "public"."reservas_provisorias" USING "btree" ("expires_at");



CREATE INDEX "idx_school_meters_school_id" ON "public"."school_meters" USING "btree" ("school_id");



CREATE INDEX "idx_whatsapp_created" ON "public"."whatsapp_conversations" USING "btree" ("created_at");



CREATE INDEX "idx_whatsapp_phone" ON "public"."whatsapp_conversations" USING "btree" ("client_phone");



CREATE OR REPLACE TRIGGER "trg_block_write_readonly" BEFORE INSERT OR DELETE OR UPDATE ON "public"."access_logs" FOR EACH ROW EXECUTE FUNCTION "public"."block_write_for_readonly_roles"();



CREATE OR REPLACE TRIGGER "trg_block_write_readonly" BEFORE INSERT OR DELETE OR UPDATE ON "public"."acquisition_events" FOR EACH ROW EXECUTE FUNCTION "public"."block_write_for_readonly_roles"();



CREATE OR REPLACE TRIGGER "trg_block_write_readonly" BEFORE INSERT OR DELETE OR UPDATE ON "public"."acquisition_items" FOR EACH ROW EXECUTE FUNCTION "public"."block_write_for_readonly_roles"();



CREATE OR REPLACE TRIGGER "trg_block_write_readonly" BEFORE INSERT OR DELETE OR UPDATE ON "public"."acquisition_responses" FOR EACH ROW EXECUTE FUNCTION "public"."block_write_for_readonly_roles"();



CREATE OR REPLACE TRIGGER "trg_block_write_readonly" BEFORE INSERT OR DELETE OR UPDATE ON "public"."agendamentos_ambientes" FOR EACH ROW EXECUTE FUNCTION "public"."block_write_for_readonly_roles"();



CREATE OR REPLACE TRIGGER "trg_block_write_readonly" BEFORE INSERT OR DELETE OR UPDATE ON "public"."almoxarifado_itens" FOR EACH ROW EXECUTE FUNCTION "public"."block_write_for_readonly_roles"();



CREATE OR REPLACE TRIGGER "trg_block_write_readonly" BEFORE INSERT OR DELETE OR UPDATE ON "public"."almoxarifado_responsaveis" FOR EACH ROW EXECUTE FUNCTION "public"."block_write_for_readonly_roles"();



CREATE OR REPLACE TRIGGER "trg_block_write_readonly" BEFORE INSERT OR DELETE OR UPDATE ON "public"."almoxarifado_solicitacao_itens" FOR EACH ROW EXECUTE FUNCTION "public"."block_write_for_readonly_roles"();



CREATE OR REPLACE TRIGGER "trg_block_write_readonly" BEFORE INSERT OR DELETE OR UPDATE ON "public"."almoxarifado_solicitacoes" FOR EACH ROW EXECUTE FUNCTION "public"."block_write_for_readonly_roles"();



CREATE OR REPLACE TRIGGER "trg_block_write_readonly" BEFORE INSERT OR DELETE OR UPDATE ON "public"."ambientes" FOR EACH ROW EXECUTE FUNCTION "public"."block_write_for_readonly_roles"();



CREATE OR REPLACE TRIGGER "trg_block_write_readonly" BEFORE INSERT OR DELETE OR UPDATE ON "public"."asset_processes" FOR EACH ROW EXECUTE FUNCTION "public"."block_write_for_readonly_roles"();



CREATE OR REPLACE TRIGGER "trg_block_write_readonly" BEFORE INSERT OR DELETE OR UPDATE ON "public"."building_inspections" FOR EACH ROW EXECUTE FUNCTION "public"."block_write_for_readonly_roles"();



CREATE OR REPLACE TRIGGER "trg_block_write_readonly" BEFORE INSERT OR DELETE OR UPDATE ON "public"."car_schedules" FOR EACH ROW EXECUTE FUNCTION "public"."block_write_for_readonly_roles"();



CREATE OR REPLACE TRIGGER "trg_block_write_readonly" BEFORE INSERT OR DELETE OR UPDATE ON "public"."construction_works" FOR EACH ROW EXECUTE FUNCTION "public"."block_write_for_readonly_roles"();



CREATE OR REPLACE TRIGGER "trg_block_write_readonly" BEFORE INSERT OR DELETE OR UPDATE ON "public"."consumo_agua" FOR EACH ROW EXECUTE FUNCTION "public"."block_write_for_readonly_roles"();



CREATE OR REPLACE TRIGGER "trg_block_write_readonly" BEFORE INSERT OR DELETE OR UPDATE ON "public"."consumo_agua_luz" FOR EACH ROW EXECUTE FUNCTION "public"."block_write_for_readonly_roles"();



CREATE OR REPLACE TRIGGER "trg_block_write_readonly" BEFORE INSERT OR DELETE OR UPDATE ON "public"."conversas" FOR EACH ROW EXECUTE FUNCTION "public"."block_write_for_readonly_roles"();



CREATE OR REPLACE TRIGGER "trg_block_write_readonly" BEFORE INSERT OR DELETE OR UPDATE ON "public"."demands" FOR EACH ROW EXECUTE FUNCTION "public"."block_write_for_readonly_roles"();



CREATE OR REPLACE TRIGGER "trg_block_write_readonly" BEFORE INSERT OR DELETE OR UPDATE ON "public"."fiscalizacao_limpeza" FOR EACH ROW EXECUTE FUNCTION "public"."block_write_for_readonly_roles"();



CREATE OR REPLACE TRIGGER "trg_block_write_readonly" BEFORE INSERT OR DELETE OR UPDATE ON "public"."fluxo_registros" FOR EACH ROW EXECUTE FUNCTION "public"."block_write_for_readonly_roles"();



CREATE OR REPLACE TRIGGER "trg_block_write_readonly" BEFORE INSERT OR DELETE OR UPDATE ON "public"."indice_escolas" FOR EACH ROW EXECUTE FUNCTION "public"."block_write_for_readonly_roles"();



CREATE OR REPLACE TRIGGER "trg_block_write_readonly" BEFORE INSERT OR DELETE OR UPDATE ON "public"."internal_tickets" FOR EACH ROW EXECUTE FUNCTION "public"."block_write_for_readonly_roles"();



CREATE OR REPLACE TRIGGER "trg_block_write_readonly" BEFORE INSERT OR DELETE OR UPDATE ON "public"."inventory_items" FOR EACH ROW EXECUTE FUNCTION "public"."block_write_for_readonly_roles"();



CREATE OR REPLACE TRIGGER "trg_block_write_readonly" BEFORE INSERT OR DELETE OR UPDATE ON "public"."maintenance_tickets" FOR EACH ROW EXECUTE FUNCTION "public"."block_write_for_readonly_roles"();



CREATE OR REPLACE TRIGGER "trg_block_write_readonly" BEFORE INSERT OR DELETE OR UPDATE ON "public"."manejo_arboreo" FOR EACH ROW EXECUTE FUNCTION "public"."block_write_for_readonly_roles"();



CREATE OR REPLACE TRIGGER "trg_block_write_readonly" BEFORE INSERT OR DELETE OR UPDATE ON "public"."manuals" FOR EACH ROW EXECUTE FUNCTION "public"."block_write_for_readonly_roles"();



CREATE OR REPLACE TRIGGER "trg_block_write_readonly" BEFORE INSERT OR DELETE OR UPDATE ON "public"."meetings" FOR EACH ROW EXECUTE FUNCTION "public"."block_write_for_readonly_roles"();



CREATE OR REPLACE TRIGGER "trg_block_write_readonly" BEFORE INSERT OR DELETE OR UPDATE ON "public"."messages" FOR EACH ROW EXECUTE FUNCTION "public"."block_write_for_readonly_roles"();



CREATE OR REPLACE TRIGGER "trg_block_write_readonly" BEFORE INSERT OR DELETE OR UPDATE ON "public"."monitoring_events" FOR EACH ROW EXECUTE FUNCTION "public"."block_write_for_readonly_roles"();



CREATE OR REPLACE TRIGGER "trg_block_write_readonly" BEFORE INSERT OR DELETE OR UPDATE ON "public"."monitoring_submissions" FOR EACH ROW EXECUTE FUNCTION "public"."block_write_for_readonly_roles"();



CREATE OR REPLACE TRIGGER "trg_block_write_readonly" BEFORE INSERT OR DELETE OR UPDATE ON "public"."occurrences" FOR EACH ROW EXECUTE FUNCTION "public"."block_write_for_readonly_roles"();



CREATE OR REPLACE TRIGGER "trg_block_write_readonly" BEFORE INSERT OR DELETE OR UPDATE ON "public"."patrimonial_actions" FOR EACH ROW EXECUTE FUNCTION "public"."block_write_for_readonly_roles"();



CREATE OR REPLACE TRIGGER "trg_block_write_readonly" BEFORE INSERT OR DELETE OR UPDATE ON "public"."patrimonial_occurrences" FOR EACH ROW EXECUTE FUNCTION "public"."block_write_for_readonly_roles"();



CREATE OR REPLACE TRIGGER "trg_block_write_readonly" BEFORE INSERT OR DELETE OR UPDATE ON "public"."portaria_registros" FOR EACH ROW EXECUTE FUNCTION "public"."block_write_for_readonly_roles"();



CREATE OR REPLACE TRIGGER "trg_block_write_readonly" BEFORE INSERT OR DELETE OR UPDATE ON "public"."processos_furtos" FOR EACH ROW EXECUTE FUNCTION "public"."block_write_for_readonly_roles"();



CREATE OR REPLACE TRIGGER "trg_block_write_readonly" BEFORE INSERT OR DELETE OR UPDATE ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."block_write_for_readonly_roles"();



CREATE OR REPLACE TRIGGER "trg_block_write_readonly" BEFORE INSERT OR DELETE OR UPDATE ON "public"."ranking_parameters" FOR EACH ROW EXECUTE FUNCTION "public"."block_write_for_readonly_roles"();



CREATE OR REPLACE TRIGGER "trg_block_write_readonly" BEFORE INSERT OR DELETE OR UPDATE ON "public"."ranking_settings" FOR EACH ROW EXECUTE FUNCTION "public"."block_write_for_readonly_roles"();



CREATE OR REPLACE TRIGGER "trg_block_write_readonly" BEFORE INSERT OR DELETE OR UPDATE ON "public"."reservas_provisorias" FOR EACH ROW EXECUTE FUNCTION "public"."block_write_for_readonly_roles"();



CREATE OR REPLACE TRIGGER "trg_block_write_readonly" BEFORE INSERT OR DELETE OR UPDATE ON "public"."room_schedules" FOR EACH ROW EXECUTE FUNCTION "public"."block_write_for_readonly_roles"();



CREATE OR REPLACE TRIGGER "trg_block_write_readonly" BEFORE INSERT OR DELETE OR UPDATE ON "public"."school_fiscals" FOR EACH ROW EXECUTE FUNCTION "public"."block_write_for_readonly_roles"();



CREATE OR REPLACE TRIGGER "trg_block_write_readonly" BEFORE INSERT OR DELETE OR UPDATE ON "public"."school_meters" FOR EACH ROW EXECUTE FUNCTION "public"."block_write_for_readonly_roles"();



CREATE OR REPLACE TRIGGER "trg_block_write_readonly" BEFORE INSERT OR DELETE OR UPDATE ON "public"."school_plans" FOR EACH ROW EXECUTE FUNCTION "public"."block_write_for_readonly_roles"();



CREATE OR REPLACE TRIGGER "trg_block_write_readonly" BEFORE INSERT OR DELETE OR UPDATE ON "public"."schools" FOR EACH ROW EXECUTE FUNCTION "public"."block_write_for_readonly_roles"();



CREATE OR REPLACE TRIGGER "trg_block_write_readonly" BEFORE INSERT OR DELETE OR UPDATE ON "public"."servicos_manutencao" FOR EACH ROW EXECUTE FUNCTION "public"."block_write_for_readonly_roles"();



CREATE OR REPLACE TRIGGER "trg_block_write_readonly" BEFORE INSERT OR DELETE OR UPDATE ON "public"."system_metadata" FOR EACH ROW EXECUTE FUNCTION "public"."block_write_for_readonly_roles"();



CREATE OR REPLACE TRIGGER "trg_block_write_readonly" BEFORE INSERT OR DELETE OR UPDATE ON "public"."tags_pessoais" FOR EACH ROW EXECUTE FUNCTION "public"."block_write_for_readonly_roles"();



CREATE OR REPLACE TRIGGER "trg_block_write_readonly" BEFORE INSERT OR DELETE OR UPDATE ON "public"."tarefas_pessoais" FOR EACH ROW EXECUTE FUNCTION "public"."block_write_for_readonly_roles"();



CREATE OR REPLACE TRIGGER "trg_block_write_readonly" BEFORE INSERT OR DELETE OR UPDATE ON "public"."ticket_categories" FOR EACH ROW EXECUTE FUNCTION "public"."block_write_for_readonly_roles"();



CREATE OR REPLACE TRIGGER "trg_block_write_readonly" BEFORE INSERT OR DELETE OR UPDATE ON "public"."ticket_messages" FOR EACH ROW EXECUTE FUNCTION "public"."block_write_for_readonly_roles"();



CREATE OR REPLACE TRIGGER "trg_block_write_readonly" BEFORE INSERT OR DELETE OR UPDATE ON "public"."whatsapp_conversations" FOR EACH ROW EXECUTE FUNCTION "public"."block_write_for_readonly_roles"();



CREATE OR REPLACE TRIGGER "trg_block_write_readonly" BEFORE INSERT OR DELETE OR UPDATE ON "public"."zeladoria_timeline" FOR EACH ROW EXECUTE FUNCTION "public"."block_write_for_readonly_roles"();



CREATE OR REPLACE TRIGGER "trg_block_write_readonly" BEFORE INSERT OR DELETE OR UPDATE ON "public"."zeladorias" FOR EACH ROW EXECUTE FUNCTION "public"."block_write_for_readonly_roles"();



CREATE OR REPLACE TRIGGER "trigger_atualiza_conversa" AFTER INSERT ON "public"."messages" FOR EACH ROW EXECUTE FUNCTION "public"."atualizar_data_conversa"();



ALTER TABLE ONLY "public"."access_logs"
    ADD CONSTRAINT "access_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."acquisition_responses"
    ADD CONSTRAINT "acquisition_responses_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "public"."acquisition_events"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."acquisition_responses"
    ADD CONSTRAINT "acquisition_responses_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "public"."acquisition_items"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."acquisition_responses"
    ADD CONSTRAINT "acquisition_responses_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."agendamentos_ambientes"
    ADD CONSTRAINT "agendamentos_ambientes_ambiente_id_fkey" FOREIGN KEY ("ambiente_id") REFERENCES "public"."ambientes"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."agendamentos_ambientes"
    ADD CONSTRAINT "agendamentos_ambientes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."almoxarifado_responsaveis"
    ADD CONSTRAINT "almoxarifado_responsaveis_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."almoxarifado_solicitacao_itens"
    ADD CONSTRAINT "almoxarifado_solicitacao_itens_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "public"."almoxarifado_itens"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."almoxarifado_solicitacao_itens"
    ADD CONSTRAINT "almoxarifado_solicitacao_itens_solicitacao_id_fkey" FOREIGN KEY ("solicitacao_id") REFERENCES "public"."almoxarifado_solicitacoes"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."almoxarifado_solicitacoes"
    ADD CONSTRAINT "almoxarifado_solicitacoes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."asset_processes"
    ADD CONSTRAINT "asset_processes_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."construction_works"
    ADD CONSTRAINT "construction_works_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."consumo_agua"
    ADD CONSTRAINT "consumo_agua_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."consumo_agua"
    ADD CONSTRAINT "consumo_agua_meter_id_fkey" FOREIGN KEY ("meter_id") REFERENCES "public"."school_meters"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."consumo_agua"
    ADD CONSTRAINT "consumo_agua_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."conversas"
    ADD CONSTRAINT "conversas_participante1_id_fkey" FOREIGN KEY ("participante1_id") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."conversas"
    ADD CONSTRAINT "conversas_participante2_id_fkey" FOREIGN KEY ("participante2_id") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."demands"
    ADD CONSTRAINT "demands_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."fiscalizacao_limpeza"
    ADD CONSTRAINT "fiscalizacao_limpeza_avaliador_id_fkey" FOREIGN KEY ("avaliador_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."building_inspections"
    ADD CONSTRAINT "fk_school" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."ticket_messages"
    ADD CONSTRAINT "fk_ticket_messages_profile" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."internal_tickets"
    ADD CONSTRAINT "internal_tickets_assigned_to_fkey" FOREIGN KEY ("assigned_to") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."internal_tickets"
    ADD CONSTRAINT "internal_tickets_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."internal_tickets"
    ADD CONSTRAINT "internal_tickets_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id");



ALTER TABLE ONLY "public"."inventory_items"
    ADD CONSTRAINT "inventory_items_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."inventory_items"
    ADD CONSTRAINT "inventory_items_interested_school_id_fkey" FOREIGN KEY ("interested_school_id") REFERENCES "public"."schools"("id");



ALTER TABLE ONLY "public"."inventory_items"
    ADD CONSTRAINT "inventory_items_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id");



ALTER TABLE ONLY "public"."maintenance_tickets"
    ADD CONSTRAINT "maintenance_tickets_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."manejo_arboreo"
    ADD CONSTRAINT "manejo_arboreo_escola_id_fkey" FOREIGN KEY ("escola_id") REFERENCES "public"."schools"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."manuals"
    ADD CONSTRAINT "manuals_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."meetings"
    ADD CONSTRAINT "meetings_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."meetings"
    ADD CONSTRAINT "meetings_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."messages"
    ADD CONSTRAINT "messages_conversa_id_fkey" FOREIGN KEY ("conversa_id") REFERENCES "public"."conversas"("id");



ALTER TABLE ONLY "public"."messages"
    ADD CONSTRAINT "messages_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."monitoring_events"
    ADD CONSTRAINT "monitoring_events_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."monitoring_submissions"
    ADD CONSTRAINT "monitoring_submissions_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "public"."monitoring_events"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."monitoring_submissions"
    ADD CONSTRAINT "monitoring_submissions_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."occurrences"
    ADD CONSTRAINT "occurrences_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id");



ALTER TABLE ONLY "public"."patrimonial_actions"
    ADD CONSTRAINT "patrimonial_actions_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."patrimonial_occurrences"
    ADD CONSTRAINT "patrimonial_occurrences_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."processos_furtos"
    ADD CONSTRAINT "processos_furtos_escola_id_fkey" FOREIGN KEY ("escola_id") REFERENCES "public"."schools"("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id");



ALTER TABLE ONLY "public"."ranking_parameters"
    ADD CONSTRAINT "ranking_parameters_regional_id_fkey" FOREIGN KEY ("regional_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."school_fiscals"
    ADD CONSTRAINT "school_fiscals_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."school_meters"
    ADD CONSTRAINT "school_meters_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."school_meters"
    ADD CONSTRAINT "school_meters_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."school_plans"
    ADD CONSTRAINT "school_plans_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."servicos_manutencao"
    ADD CONSTRAINT "servicos_manutencao_escola_id_fkey" FOREIGN KEY ("escola_id") REFERENCES "public"."schools"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."tags_pessoais"
    ADD CONSTRAINT "tags_pessoais_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."tarefas_pessoais"
    ADD CONSTRAINT "tarefas_pessoais_tag_id_fkey" FOREIGN KEY ("tag_id") REFERENCES "public"."tags_pessoais"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."tarefas_pessoais"
    ADD CONSTRAINT "tarefas_pessoais_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."ticket_messages"
    ADD CONSTRAINT "ticket_messages_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "public"."internal_tickets"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."ticket_messages"
    ADD CONSTRAINT "ticket_messages_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."zeladoria_timeline"
    ADD CONSTRAINT "zeladoria_timeline_changed_by_fkey" FOREIGN KEY ("changed_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."zeladoria_timeline"
    ADD CONSTRAINT "zeladoria_timeline_zeladoria_id_fkey" FOREIGN KEY ("zeladoria_id") REFERENCES "public"."zeladorias"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."zeladorias"
    ADD CONSTRAINT "zeladorias_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id");



CREATE POLICY "Acesso Total Ambientes" ON "public"."room_schedules" USING (true) WITH CHECK (true);



CREATE POLICY "Acesso Total Script" ON "public"."car_schedules" USING (true) WITH CHECK (true);



CREATE POLICY "Acesso total" ON "public"."inventory_items" USING (true);



CREATE POLICY "Acesso total ações" ON "public"."patrimonial_actions" USING (true);



CREATE POLICY "Acesso total ocorrências" ON "public"."patrimonial_occurrences" USING (true);



CREATE POLICY "Admins podem inserir na linha do tempo" ON "public"."zeladoria_timeline" FOR INSERT WITH CHECK (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "Apenas Admins gerenciam escolas" ON "public"."schools" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'regional_admin'::"public"."user_role")))));



CREATE POLICY "Apenas admin pode modificar ambientes" ON "public"."ambientes" USING ((( SELECT "profiles"."role"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"())) = 'regional_admin'::"public"."user_role"));



CREATE POLICY "Atualizar próprias tarefas" ON "public"."tarefas_pessoais" FOR UPDATE USING (("auth"."uid"() = "usuario_id"));



CREATE POLICY "Eliminar próprias tarefas" ON "public"."tarefas_pessoais" FOR DELETE USING (("auth"."uid"() = "usuario_id"));



CREATE POLICY "Enable insert for authenticated users" ON "public"."internal_tickets" FOR INSERT WITH CHECK (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "Enable insert for messages" ON "public"."ticket_messages" FOR INSERT WITH CHECK (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "Enable read access for all users" ON "public"."internal_tickets" FOR SELECT USING (true);



CREATE POLICY "Enable read access for messages" ON "public"."ticket_messages" FOR SELECT USING (true);



CREATE POLICY "Enable update for authenticated users" ON "public"."internal_tickets" FOR UPDATE USING (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "Escrita admin categorias" ON "public"."ticket_categories" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'regional_admin'::"public"."user_role")))));



CREATE POLICY "Escrita apenas para admins" ON "public"."construction_works" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'regional_admin'::"public"."user_role")))));



CREATE POLICY "Gestão de hidrômetros" ON "public"."school_meters" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['regional_admin'::"public"."user_role", 'dirigente'::"public"."user_role"]))))));



CREATE POLICY "Inserir próprias tags" ON "public"."tags_pessoais" FOR INSERT WITH CHECK (("auth"."uid"() = "usuario_id"));



CREATE POLICY "Inserir próprias tarefas" ON "public"."tarefas_pessoais" FOR INSERT WITH CHECK (("auth"."uid"() = "usuario_id"));



CREATE POLICY "Leitura de hidrômetros" ON "public"."school_meters" FOR SELECT USING (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "Leitura livre de categorias" ON "public"."ticket_categories" FOR SELECT USING (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "Leitura permitida para todos autenticados" ON "public"."construction_works" FOR SELECT USING (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "Leitura pública de agendamentos" ON "public"."agendamentos_ambientes" FOR SELECT TO "anon" USING (("status" = ANY (ARRAY['aprovado'::"text", 'pendente'::"text"])));



CREATE POLICY "Leitura pública de ambientes" ON "public"."ambientes" FOR SELECT TO "anon" USING (("ativo" = true));



CREATE POLICY "Permitir atualizacao de agendamentos" ON "public"."agendamentos_ambientes" FOR UPDATE USING (true);



CREATE POLICY "Permitir atualização para usuários autenticados" ON "public"."processos_furtos" FOR UPDATE TO "authenticated" USING (true);



CREATE POLICY "Permitir atualização para usuários autenticados" ON "public"."school_plans" FOR UPDATE TO "authenticated" USING (true);



CREATE POLICY "Permitir contagem de mensagens" ON "public"."messages" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Permitir exclusão para usuários autenticados" ON "public"."school_plans" FOR DELETE TO "authenticated" USING (true);



CREATE POLICY "Permitir inserção para autenticados" ON "public"."fluxo_registros" FOR INSERT TO "authenticated" WITH CHECK (true);



CREATE POLICY "Permitir inserção para usuários autenticados" ON "public"."processos_furtos" FOR INSERT TO "authenticated" WITH CHECK (true);



CREATE POLICY "Permitir inserção para usuários autenticados" ON "public"."school_plans" FOR INSERT TO "authenticated" WITH CHECK (true);



CREATE POLICY "Permitir inserção para usuários logados" ON "public"."maintenance_tickets" FOR INSERT WITH CHECK (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "Permitir inserção via service role" ON "public"."occurrences" FOR INSERT WITH CHECK (true);



CREATE POLICY "Permitir leitura de fiscais para usuários autenticados" ON "public"."school_fiscals" FOR SELECT USING (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "Permitir leitura para autenticados" ON "public"."fluxo_registros" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Permitir leitura para todos autenticados" ON "public"."fiscalizacao_limpeza" FOR SELECT USING (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "Permitir leitura para usuários autenticados" ON "public"."processos_furtos" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Permitir leitura para usuários autenticados" ON "public"."school_plans" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Permitir leitura para usuários autenticados" ON "public"."schools" FOR SELECT USING (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "Permitir leitura para usuários logados" ON "public"."maintenance_tickets" FOR SELECT USING (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "Permitir leitura para utilizadores autenticados" ON "public"."servicos_manutencao" FOR SELECT USING (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "Permitir tudo" ON "public"."building_inspections" USING (true);



CREATE POLICY "Permitir tudo" ON "public"."system_metadata" USING (true);



CREATE POLICY "Permitir tudo para admin" ON "public"."servicos_manutencao" USING (true);



CREATE POLICY "Permitir tudo para admin e regional" ON "public"."fiscalizacao_limpeza" USING (true);



CREATE POLICY "Permitir update messages" ON "public"."messages" FOR UPDATE TO "authenticated" USING (true);



CREATE POLICY "Permitir update ticket_messages" ON "public"."ticket_messages" FOR UPDATE TO "authenticated" USING (true);



CREATE POLICY "Todos podem ver a linha do tempo" ON "public"."zeladoria_timeline" FOR SELECT USING (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "Todos podem ver agendamentos" ON "public"."agendamentos_ambientes" FOR SELECT USING (true);



CREATE POLICY "Todos podem ver ambientes" ON "public"."ambientes" FOR SELECT USING (true);



CREATE POLICY "Universal Read for Authenticated" ON "public"."profiles" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Usuários autenticados podem inserir agendamentos" ON "public"."agendamentos_ambientes" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Ver próprias tags" ON "public"."tags_pessoais" FOR SELECT USING (("auth"."uid"() = "usuario_id"));



CREATE POLICY "Ver próprias tarefas" ON "public"."tarefas_pessoais" FOR SELECT USING (("auth"."uid"() = "usuario_id"));



ALTER TABLE "public"."access_logs" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "access_logs_insert_own" ON "public"."access_logs" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "access_logs_select_admins" ON "public"."access_logs" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."role" = ANY (ARRAY['regional_admin'::"public"."user_role", 'chefe_departamento'::"public"."user_role", 'supervisor'::"public"."user_role", 'dirigente'::"public"."user_role", 'ure_servico'::"public"."user_role", 'ure_ecc'::"public"."user_role"]))))));



ALTER TABLE "public"."acquisition_events" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "acquisition_events: escrita restrita" ON "public"."acquisition_events" TO "authenticated" USING (("public"."get_my_role"() = ANY (ARRAY['regional_admin'::"text", 'dirigente'::"text"]))) WITH CHECK (("public"."get_my_role"() = ANY (ARRAY['regional_admin'::"text", 'dirigente'::"text"])));



CREATE POLICY "acquisition_events: leitura" ON "public"."acquisition_events" FOR SELECT TO "authenticated" USING (true);



ALTER TABLE "public"."acquisition_items" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "acquisition_items: escrita restrita" ON "public"."acquisition_items" TO "authenticated" USING (("public"."get_my_role"() = ANY (ARRAY['regional_admin'::"text", 'dirigente'::"text"]))) WITH CHECK (("public"."get_my_role"() = ANY (ARRAY['regional_admin'::"text", 'dirigente'::"text"])));



CREATE POLICY "acquisition_items: leitura" ON "public"."acquisition_items" FOR SELECT TO "authenticated" USING (true);



ALTER TABLE "public"."acquisition_responses" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "acquisition_responses: escrita restrita" ON "public"."acquisition_responses" TO "authenticated" USING (("public"."get_my_role"() = ANY (ARRAY['regional_admin'::"text", 'dirigente'::"text"]))) WITH CHECK (("public"."get_my_role"() = ANY (ARRAY['regional_admin'::"text", 'dirigente'::"text"])));



CREATE POLICY "acquisition_responses: leitura" ON "public"."acquisition_responses" FOR SELECT TO "authenticated" USING (true);



ALTER TABLE "public"."agendamentos_ambientes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."almoxarifado_itens" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "almoxarifado_itens: escrita restrita" ON "public"."almoxarifado_itens" TO "authenticated" USING ((("public"."get_my_role"() = 'regional_admin'::"text") OR (EXISTS ( SELECT 1
   FROM "public"."almoxarifado_responsaveis"
  WHERE ("almoxarifado_responsaveis"."user_id" = "auth"."uid"()))))) WITH CHECK ((("public"."get_my_role"() = 'regional_admin'::"text") OR (EXISTS ( SELECT 1
   FROM "public"."almoxarifado_responsaveis"
  WHERE ("almoxarifado_responsaveis"."user_id" = "auth"."uid"())))));



CREATE POLICY "almoxarifado_itens: leitura" ON "public"."almoxarifado_itens" FOR SELECT TO "authenticated" USING (true);



ALTER TABLE "public"."almoxarifado_responsaveis" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "almoxarifado_responsaveis: escrita admin" ON "public"."almoxarifado_responsaveis" TO "authenticated" USING (("public"."get_my_role"() = 'regional_admin'::"text")) WITH CHECK (("public"."get_my_role"() = 'regional_admin'::"text"));



CREATE POLICY "almoxarifado_responsaveis: leitura" ON "public"."almoxarifado_responsaveis" FOR SELECT TO "authenticated" USING (true);



ALTER TABLE "public"."almoxarifado_solicitacao_itens" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "almoxarifado_solicitacao_itens: escrita" ON "public"."almoxarifado_solicitacao_itens" FOR INSERT TO "authenticated" WITH CHECK (true);



CREATE POLICY "almoxarifado_solicitacao_itens: gestão restrita" ON "public"."almoxarifado_solicitacao_itens" FOR UPDATE TO "authenticated" USING ((("public"."get_my_role"() = 'regional_admin'::"text") OR (EXISTS ( SELECT 1
   FROM "public"."almoxarifado_responsaveis"
  WHERE ("almoxarifado_responsaveis"."user_id" = "auth"."uid"())))));



CREATE POLICY "almoxarifado_solicitacao_itens: leitura" ON "public"."almoxarifado_solicitacao_itens" FOR SELECT TO "authenticated" USING (true);



ALTER TABLE "public"."almoxarifado_solicitacoes" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "almoxarifado_solicitacoes: criação" ON "public"."almoxarifado_solicitacoes" FOR INSERT TO "authenticated" WITH CHECK (true);



CREATE POLICY "almoxarifado_solicitacoes: gestão restrita" ON "public"."almoxarifado_solicitacoes" FOR UPDATE TO "authenticated" USING ((("public"."get_my_role"() = 'regional_admin'::"text") OR ("user_id" = "auth"."uid"()) OR (EXISTS ( SELECT 1
   FROM "public"."almoxarifado_responsaveis"
  WHERE ("almoxarifado_responsaveis"."user_id" = "auth"."uid"())))));



CREATE POLICY "almoxarifado_solicitacoes: leitura" ON "public"."almoxarifado_solicitacoes" FOR SELECT TO "authenticated" USING (true);



ALTER TABLE "public"."ambientes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."building_inspections" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."car_schedules" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."construction_works" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "delete_own" ON "public"."reservas_provisorias" FOR DELETE TO "authenticated" USING (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."demands" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "demands: criação" ON "public"."demands" FOR INSERT TO "authenticated" WITH CHECK (true);



CREATE POLICY "demands: edição e exclusão restrita" ON "public"."demands" TO "authenticated" USING (("public"."get_my_role"() = ANY (ARRAY['regional_admin'::"text", 'dirigente'::"text"]))) WITH CHECK (("public"."get_my_role"() = ANY (ARRAY['regional_admin'::"text", 'dirigente'::"text"])));



CREATE POLICY "demands: leitura" ON "public"."demands" FOR SELECT TO "authenticated" USING (true);



ALTER TABLE "public"."fiscalizacao_limpeza" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."fluxo_registros" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."indice_escolas" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "insert_own" ON "public"."reservas_provisorias" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."internal_tickets" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."maintenance_tickets" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "meetings: escrita restrita" ON "public"."meetings" TO "authenticated" USING (("public"."get_my_role"() = ANY (ARRAY['regional_admin'::"text", 'dirigente'::"text"]))) WITH CHECK (("public"."get_my_role"() = ANY (ARRAY['regional_admin'::"text", 'dirigente'::"text"])));



CREATE POLICY "meetings: leitura" ON "public"."meetings" FOR SELECT TO "authenticated" USING (true);



ALTER TABLE "public"."patrimonial_actions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."patrimonial_occurrences" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."processos_furtos" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "profiles: edição própria ou admin" ON "public"."profiles" FOR UPDATE TO "authenticated" USING ((("id" = "auth"."uid"()) OR ("public"."get_my_role"() = 'regional_admin'::"text")));



CREATE POLICY "profiles: exclusão admin" ON "public"."profiles" FOR DELETE TO "authenticated" USING (("public"."get_my_role"() = 'regional_admin'::"text"));



CREATE POLICY "profiles: inserção admin" ON "public"."profiles" FOR INSERT TO "authenticated" WITH CHECK (("public"."get_my_role"() = 'regional_admin'::"text"));



CREATE POLICY "ranking_parameters: escrita admin" ON "public"."ranking_parameters" TO "authenticated" USING (("public"."get_my_role"() = 'regional_admin'::"text")) WITH CHECK (("public"."get_my_role"() = 'regional_admin'::"text"));



CREATE POLICY "ranking_parameters: leitura" ON "public"."ranking_parameters" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "ranking_settings: escrita admin" ON "public"."ranking_settings" TO "authenticated" USING (("public"."get_my_role"() = 'regional_admin'::"text")) WITH CHECK (("public"."get_my_role"() = 'regional_admin'::"text"));



CREATE POLICY "ranking_settings: leitura" ON "public"."ranking_settings" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "read_for_authenticated" ON "public"."reservas_provisorias" FOR SELECT TO "authenticated" USING (true);



ALTER TABLE "public"."reservas_provisorias" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."room_schedules" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."school_meters" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."school_plans" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."servicos_manutencao" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."system_metadata" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."tags_pessoais" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "tags_pessoais: só o dono" ON "public"."tags_pessoais" TO "authenticated" USING (("usuario_id" = "auth"."uid"())) WITH CHECK (("usuario_id" = "auth"."uid"()));



ALTER TABLE "public"."tarefas_pessoais" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "tarefas_pessoais: só o dono" ON "public"."tarefas_pessoais" TO "authenticated" USING (("usuario_id" = "auth"."uid"())) WITH CHECK (("usuario_id" = "auth"."uid"()));



ALTER TABLE "public"."ticket_categories" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."ticket_messages" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "zeladoria_timeline: escrita dirigente ou admin" ON "public"."zeladoria_timeline" TO "authenticated" USING (("public"."get_my_role"() = ANY (ARRAY['regional_admin'::"text", 'dirigente'::"text"]))) WITH CHECK (("public"."get_my_role"() = ANY (ARRAY['regional_admin'::"text", 'dirigente'::"text"])));



CREATE POLICY "zeladoria_timeline: leitura" ON "public"."zeladoria_timeline" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "zeladorias: escrita dirigente ou admin" ON "public"."zeladorias" TO "authenticated" USING (("public"."get_my_role"() = ANY (ARRAY['regional_admin'::"text", 'dirigente'::"text"]))) WITH CHECK (("public"."get_my_role"() = ANY (ARRAY['regional_admin'::"text", 'dirigente'::"text"])));



CREATE POLICY "zeladorias: leitura" ON "public"."zeladorias" FOR SELECT TO "authenticated" USING (true);



GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";



GRANT ALL ON FUNCTION "public"."atualizar_data_conversa"() TO "anon";
GRANT ALL ON FUNCTION "public"."atualizar_data_conversa"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."atualizar_data_conversa"() TO "service_role";



GRANT ALL ON FUNCTION "public"."block_write_for_readonly_roles"() TO "anon";
GRANT ALL ON FUNCTION "public"."block_write_for_readonly_roles"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."block_write_for_readonly_roles"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_my_role"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_my_role"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_my_role"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_my_school_id"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_my_school_id"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_my_school_id"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_pending_water_schools"("p_window_start" "date", "p_today" "date") TO "anon";
GRANT ALL ON FUNCTION "public"."get_pending_water_schools"("p_window_start" "date", "p_today" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_pending_water_schools"("p_window_start" "date", "p_today" "date") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_user_data"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_user_data"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_user_data"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_user_last_access"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_user_last_access"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_user_last_access"() TO "service_role";



GRANT ALL ON FUNCTION "public"."iniciar_conversa"("p_participante1" "uuid", "p_participante2" "uuid", "p_setor" character varying) TO "anon";
GRANT ALL ON FUNCTION "public"."iniciar_conversa"("p_participante1" "uuid", "p_participante2" "uuid", "p_setor" character varying) TO "authenticated";
GRANT ALL ON FUNCTION "public"."iniciar_conversa"("p_participante1" "uuid", "p_participante2" "uuid", "p_setor" character varying) TO "service_role";



GRANT ALL ON FUNCTION "public"."is_admin"() TO "anon";
GRANT ALL ON FUNCTION "public"."is_admin"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_admin"() TO "service_role";



GRANT ALL ON FUNCTION "public"."is_regional"() TO "anon";
GRANT ALL ON FUNCTION "public"."is_regional"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_regional"() TO "service_role";



GRANT ALL ON FUNCTION "public"."set_my_favorite_pages"("pages" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."set_my_favorite_pages"("pages" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_my_favorite_pages"("pages" "jsonb") TO "service_role";



GRANT ALL ON TABLE "public"."access_logs" TO "anon";
GRANT ALL ON TABLE "public"."access_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."access_logs" TO "service_role";



GRANT ALL ON TABLE "public"."acquisition_events" TO "anon";
GRANT ALL ON TABLE "public"."acquisition_events" TO "authenticated";
GRANT ALL ON TABLE "public"."acquisition_events" TO "service_role";



GRANT ALL ON TABLE "public"."acquisition_items" TO "anon";
GRANT ALL ON TABLE "public"."acquisition_items" TO "authenticated";
GRANT ALL ON TABLE "public"."acquisition_items" TO "service_role";



GRANT ALL ON TABLE "public"."acquisition_responses" TO "anon";
GRANT ALL ON TABLE "public"."acquisition_responses" TO "authenticated";
GRANT ALL ON TABLE "public"."acquisition_responses" TO "service_role";



GRANT ALL ON TABLE "public"."agendamentos_ambientes" TO "anon";
GRANT ALL ON TABLE "public"."agendamentos_ambientes" TO "authenticated";
GRANT ALL ON TABLE "public"."agendamentos_ambientes" TO "service_role";



GRANT ALL ON TABLE "public"."almoxarifado_itens" TO "anon";
GRANT ALL ON TABLE "public"."almoxarifado_itens" TO "authenticated";
GRANT ALL ON TABLE "public"."almoxarifado_itens" TO "service_role";



GRANT ALL ON TABLE "public"."almoxarifado_responsaveis" TO "anon";
GRANT ALL ON TABLE "public"."almoxarifado_responsaveis" TO "authenticated";
GRANT ALL ON TABLE "public"."almoxarifado_responsaveis" TO "service_role";



GRANT ALL ON TABLE "public"."almoxarifado_solicitacao_itens" TO "anon";
GRANT ALL ON TABLE "public"."almoxarifado_solicitacao_itens" TO "authenticated";
GRANT ALL ON TABLE "public"."almoxarifado_solicitacao_itens" TO "service_role";



GRANT ALL ON TABLE "public"."almoxarifado_solicitacoes" TO "anon";
GRANT ALL ON TABLE "public"."almoxarifado_solicitacoes" TO "authenticated";
GRANT ALL ON TABLE "public"."almoxarifado_solicitacoes" TO "service_role";



GRANT ALL ON TABLE "public"."ambientes" TO "anon";
GRANT ALL ON TABLE "public"."ambientes" TO "authenticated";
GRANT ALL ON TABLE "public"."ambientes" TO "service_role";



GRANT ALL ON TABLE "public"."asset_processes" TO "anon";
GRANT ALL ON TABLE "public"."asset_processes" TO "authenticated";
GRANT ALL ON TABLE "public"."asset_processes" TO "service_role";



GRANT ALL ON TABLE "public"."building_inspections" TO "anon";
GRANT ALL ON TABLE "public"."building_inspections" TO "authenticated";
GRANT ALL ON TABLE "public"."building_inspections" TO "service_role";



GRANT ALL ON TABLE "public"."car_schedules" TO "anon";
GRANT ALL ON TABLE "public"."car_schedules" TO "authenticated";
GRANT ALL ON TABLE "public"."car_schedules" TO "service_role";



GRANT ALL ON TABLE "public"."construction_works" TO "anon";
GRANT ALL ON TABLE "public"."construction_works" TO "authenticated";
GRANT ALL ON TABLE "public"."construction_works" TO "service_role";



GRANT ALL ON TABLE "public"."consumo_agua" TO "anon";
GRANT ALL ON TABLE "public"."consumo_agua" TO "authenticated";
GRANT ALL ON TABLE "public"."consumo_agua" TO "service_role";



GRANT ALL ON TABLE "public"."consumo_agua_luz" TO "anon";
GRANT ALL ON TABLE "public"."consumo_agua_luz" TO "authenticated";
GRANT ALL ON TABLE "public"."consumo_agua_luz" TO "service_role";



GRANT ALL ON TABLE "public"."conversas" TO "anon";
GRANT ALL ON TABLE "public"."conversas" TO "authenticated";
GRANT ALL ON TABLE "public"."conversas" TO "service_role";



GRANT ALL ON TABLE "public"."demands" TO "anon";
GRANT ALL ON TABLE "public"."demands" TO "authenticated";
GRANT ALL ON TABLE "public"."demands" TO "service_role";



GRANT ALL ON TABLE "public"."fiscalizacao_limpeza" TO "anon";
GRANT ALL ON TABLE "public"."fiscalizacao_limpeza" TO "authenticated";
GRANT ALL ON TABLE "public"."fiscalizacao_limpeza" TO "service_role";



GRANT ALL ON TABLE "public"."fluxo_registros" TO "anon";
GRANT ALL ON TABLE "public"."fluxo_registros" TO "authenticated";
GRANT ALL ON TABLE "public"."fluxo_registros" TO "service_role";



GRANT ALL ON TABLE "public"."indice_escolas" TO "anon";
GRANT ALL ON TABLE "public"."indice_escolas" TO "authenticated";
GRANT ALL ON TABLE "public"."indice_escolas" TO "service_role";



GRANT ALL ON TABLE "public"."internal_tickets" TO "anon";
GRANT ALL ON TABLE "public"."internal_tickets" TO "authenticated";
GRANT ALL ON TABLE "public"."internal_tickets" TO "service_role";



GRANT ALL ON TABLE "public"."inventory_items" TO "anon";
GRANT ALL ON TABLE "public"."inventory_items" TO "authenticated";
GRANT ALL ON TABLE "public"."inventory_items" TO "service_role";



GRANT ALL ON TABLE "public"."maintenance_tickets" TO "anon";
GRANT ALL ON TABLE "public"."maintenance_tickets" TO "authenticated";
GRANT ALL ON TABLE "public"."maintenance_tickets" TO "service_role";



GRANT ALL ON TABLE "public"."manejo_arboreo" TO "anon";
GRANT ALL ON TABLE "public"."manejo_arboreo" TO "authenticated";
GRANT ALL ON TABLE "public"."manejo_arboreo" TO "service_role";



GRANT ALL ON TABLE "public"."manuals" TO "anon";
GRANT ALL ON TABLE "public"."manuals" TO "authenticated";
GRANT ALL ON TABLE "public"."manuals" TO "service_role";



GRANT ALL ON TABLE "public"."meetings" TO "anon";
GRANT ALL ON TABLE "public"."meetings" TO "authenticated";
GRANT ALL ON TABLE "public"."meetings" TO "service_role";



GRANT ALL ON TABLE "public"."messages" TO "anon";
GRANT ALL ON TABLE "public"."messages" TO "authenticated";
GRANT ALL ON TABLE "public"."messages" TO "service_role";



GRANT ALL ON TABLE "public"."monitoring_events" TO "anon";
GRANT ALL ON TABLE "public"."monitoring_events" TO "authenticated";
GRANT ALL ON TABLE "public"."monitoring_events" TO "service_role";



GRANT ALL ON TABLE "public"."monitoring_submissions" TO "anon";
GRANT ALL ON TABLE "public"."monitoring_submissions" TO "authenticated";
GRANT ALL ON TABLE "public"."monitoring_submissions" TO "service_role";



GRANT ALL ON TABLE "public"."occurrences" TO "anon";
GRANT ALL ON TABLE "public"."occurrences" TO "authenticated";
GRANT ALL ON TABLE "public"."occurrences" TO "service_role";



GRANT ALL ON TABLE "public"."patrimonial_actions" TO "anon";
GRANT ALL ON TABLE "public"."patrimonial_actions" TO "authenticated";
GRANT ALL ON TABLE "public"."patrimonial_actions" TO "service_role";



GRANT ALL ON TABLE "public"."patrimonial_occurrences" TO "anon";
GRANT ALL ON TABLE "public"."patrimonial_occurrences" TO "authenticated";
GRANT ALL ON TABLE "public"."patrimonial_occurrences" TO "service_role";



GRANT ALL ON TABLE "public"."portaria_registros" TO "anon";
GRANT ALL ON TABLE "public"."portaria_registros" TO "authenticated";
GRANT ALL ON TABLE "public"."portaria_registros" TO "service_role";



GRANT ALL ON TABLE "public"."processos_furtos" TO "anon";
GRANT ALL ON TABLE "public"."processos_furtos" TO "authenticated";
GRANT ALL ON TABLE "public"."processos_furtos" TO "service_role";



GRANT ALL ON TABLE "public"."profiles" TO "anon";
GRANT ALL ON TABLE "public"."profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."profiles" TO "service_role";



GRANT ALL ON TABLE "public"."ranking_parameters" TO "anon";
GRANT ALL ON TABLE "public"."ranking_parameters" TO "authenticated";
GRANT ALL ON TABLE "public"."ranking_parameters" TO "service_role";



GRANT ALL ON TABLE "public"."ranking_settings" TO "anon";
GRANT ALL ON TABLE "public"."ranking_settings" TO "authenticated";
GRANT ALL ON TABLE "public"."ranking_settings" TO "service_role";



GRANT ALL ON TABLE "public"."reservas_provisorias" TO "anon";
GRANT ALL ON TABLE "public"."reservas_provisorias" TO "authenticated";
GRANT ALL ON TABLE "public"."reservas_provisorias" TO "service_role";



GRANT ALL ON TABLE "public"."room_schedules" TO "anon";
GRANT ALL ON TABLE "public"."room_schedules" TO "authenticated";
GRANT ALL ON TABLE "public"."room_schedules" TO "service_role";



GRANT ALL ON TABLE "public"."school_fiscals" TO "anon";
GRANT ALL ON TABLE "public"."school_fiscals" TO "authenticated";
GRANT ALL ON TABLE "public"."school_fiscals" TO "service_role";



GRANT ALL ON TABLE "public"."school_meters" TO "anon";
GRANT ALL ON TABLE "public"."school_meters" TO "authenticated";
GRANT ALL ON TABLE "public"."school_meters" TO "service_role";



GRANT ALL ON TABLE "public"."school_plans" TO "anon";
GRANT ALL ON TABLE "public"."school_plans" TO "authenticated";
GRANT ALL ON TABLE "public"."school_plans" TO "service_role";



GRANT ALL ON TABLE "public"."schools" TO "anon";
GRANT ALL ON TABLE "public"."schools" TO "authenticated";
GRANT ALL ON TABLE "public"."schools" TO "service_role";



GRANT ALL ON TABLE "public"."servicos_manutencao" TO "anon";
GRANT ALL ON TABLE "public"."servicos_manutencao" TO "authenticated";
GRANT ALL ON TABLE "public"."servicos_manutencao" TO "service_role";



GRANT ALL ON TABLE "public"."system_metadata" TO "anon";
GRANT ALL ON TABLE "public"."system_metadata" TO "authenticated";
GRANT ALL ON TABLE "public"."system_metadata" TO "service_role";



GRANT ALL ON TABLE "public"."tags_pessoais" TO "anon";
GRANT ALL ON TABLE "public"."tags_pessoais" TO "authenticated";
GRANT ALL ON TABLE "public"."tags_pessoais" TO "service_role";



GRANT ALL ON TABLE "public"."tarefas_pessoais" TO "anon";
GRANT ALL ON TABLE "public"."tarefas_pessoais" TO "authenticated";
GRANT ALL ON TABLE "public"."tarefas_pessoais" TO "service_role";



GRANT ALL ON TABLE "public"."ticket_categories" TO "anon";
GRANT ALL ON TABLE "public"."ticket_categories" TO "authenticated";
GRANT ALL ON TABLE "public"."ticket_categories" TO "service_role";



GRANT ALL ON TABLE "public"."ticket_messages" TO "anon";
GRANT ALL ON TABLE "public"."ticket_messages" TO "authenticated";
GRANT ALL ON TABLE "public"."ticket_messages" TO "service_role";



GRANT ALL ON TABLE "public"."whatsapp_conversations" TO "anon";
GRANT ALL ON TABLE "public"."whatsapp_conversations" TO "authenticated";
GRANT ALL ON TABLE "public"."whatsapp_conversations" TO "service_role";



GRANT ALL ON TABLE "public"."zeladoria_timeline" TO "anon";
GRANT ALL ON TABLE "public"."zeladoria_timeline" TO "authenticated";
GRANT ALL ON TABLE "public"."zeladoria_timeline" TO "service_role";



GRANT ALL ON TABLE "public"."zeladorias" TO "anon";
GRANT ALL ON TABLE "public"."zeladorias" TO "authenticated";
GRANT ALL ON TABLE "public"."zeladorias" TO "service_role";



GRANT ALL ON SEQUENCE "public"."zeladorias_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."zeladorias_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."zeladorias_id_seq" TO "service_role";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";








-- ============================================================================
-- Bitácora — esquema de base de datos (Supabase / PostgreSQL)
-- ----------------------------------------------------------------------------
-- Ejecuta este fichero entero en:  Supabase Dashboard > SQL Editor > New query
-- Es idempotente: puedes volver a ejecutarlo sin romper nada.
-- ============================================================================

create extension if not exists pgcrypto;

-- ============================================================================
-- 1. Perfiles  (una fila por trabajador, enlazada a auth.users)
-- ============================================================================
create table if not exists public.profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  email      text not null,
  full_name  text not null default '',
  initials   text not null default '',
  color      text not null default '#146c6b',
  role       text not null default 'member' check (role in ('member', 'admin')),
  created_at timestamptz not null default now()
);

comment on table public.profiles is 'Trabajadores de DecaSight con acceso a Bitácora.';

-- Crea automáticamente el perfil al dar de alta un usuario en Supabase Auth.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name     text;
  v_initials text;
  v_color    text;
begin
  v_name := coalesce(
    nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''),
    nullif(trim(new.raw_user_meta_data ->> 'name'), ''),
    initcap(replace(split_part(coalesce(new.email, 'equipo'), '@', 1), '.', ' '))
  );

  select upper(string_agg(left(word, 1), '' order by ord))
  into v_initials
  from (
    select word, ord
    from regexp_split_to_table(v_name, '\s+') with ordinality as t(word, ord)
    where word <> ''
    limit 2
  ) s;

  v_color := (array['#146c6b', '#c98a2e', '#5b6863', '#8a5a3f', '#3f8f5f', '#b14a3a'])
             [(abs(hashtext(new.id::text)) % 6) + 1];

  insert into public.profiles (id, email, full_name, initials, color)
  values (new.id, coalesce(new.email, ''), v_name, coalesce(v_initials, 'XX'), v_color)
  on conflict (id) do nothing;

  return new;
end;
$$;

-- Alta sin confirmación por correo: el ajuste "Confirm email" del panel no se
-- puede tocar desde SQL, así que damos el correo por confirmado al crear el
-- usuario. Quien se registra entra en el acto. `confirmed_at` es una columna
-- generada, por eso solo se toca `email_confirmed_at`.
create or replace function public.auto_confirm_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.email_confirmed_at is null then
    new.email_confirmed_at := coalesce(new.created_at, now());
  end if;
  return new;
end;
$$;

drop trigger if exists on_auth_user_auto_confirm on auth.users;
create trigger on_auth_user_auto_confirm
  before insert on auth.users
  for each row execute function public.auto_confirm_new_user();

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================================
-- 2. Clientes
-- ============================================================================
create table if not exists public.clients (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  kind       text not null default '',
  ref_prefix text not null default 'C',
  card_seq   integer not null default 0,
  position   integer not null default 0,
  archived   boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.client_members (
  client_id  uuid not null references public.clients(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  primary key (client_id, profile_id)
);

-- ============================================================================
-- 3. Tablero: columnas y tarjetas
-- ============================================================================
create table if not exists public.board_columns (
  id        uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  key       text not null,
  label     text not null,
  position  integer not null default 0,
  unique (client_id, key)
);

create table if not exists public.cards (
  id          uuid primary key default gen_random_uuid(),
  client_id   uuid not null references public.clients(id) on delete cascade,
  column_id   uuid not null references public.board_columns(id) on delete cascade,
  ref         text not null default '',
  title       text not null,
  description text not null default '',
  due_date    date,
  labels      text[] not null default '{}',
  position    double precision not null default 0,
  created_by  uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists cards_client_idx on public.cards (client_id);
create index if not exists cards_column_idx on public.cards (column_id, position);

-- Referencia legible por cliente: F001, F002, ... (prefijo del cliente + contador)
create or replace function public.set_card_ref()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_seq    integer;
  v_prefix text;
begin
  if new.ref is null or new.ref = '' then
    update public.clients
      set card_seq = card_seq + 1
      where id = new.client_id
      returning card_seq, ref_prefix into v_seq, v_prefix;
    new.ref := coalesce(v_prefix, 'C') || lpad(coalesce(v_seq, 1)::text, 3, '0');
  end if;
  return new;
end;
$$;

drop trigger if exists cards_set_ref on public.cards;
create trigger cards_set_ref
  before insert on public.cards
  for each row execute function public.set_card_ref();

create or replace function public.touch_updated_at()
returns trigger language plpgsql set search_path = public as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists cards_touch on public.cards;
create trigger cards_touch
  before update on public.cards
  for each row execute function public.touch_updated_at();

create table if not exists public.card_assignees (
  card_id    uuid not null references public.cards(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  primary key (card_id, profile_id)
);

create table if not exists public.checklist_items (
  id       uuid primary key default gen_random_uuid(),
  card_id  uuid not null references public.cards(id) on delete cascade,
  text     text not null,
  done     boolean not null default false,
  position double precision not null default 0
);

create index if not exists checklist_card_idx on public.checklist_items (card_id, position);

create table if not exists public.card_comments (
  id         uuid primary key default gen_random_uuid(),
  card_id    uuid not null references public.cards(id) on delete cascade,
  author_id  uuid not null references public.profiles(id) on delete cascade,
  body       text not null,
  created_at timestamptz not null default now()
);

create index if not exists card_comments_card_idx on public.card_comments (card_id, created_at);

-- ============================================================================
-- 4. Chat interno por cliente
-- ============================================================================
create table if not exists public.messages (
  id         uuid primary key default gen_random_uuid(),
  client_id  uuid not null references public.clients(id) on delete cascade,
  author_id  uuid not null references public.profiles(id) on delete cascade,
  body       text not null,
  created_at timestamptz not null default now()
);

create index if not exists messages_client_idx on public.messages (client_id, created_at);

-- Última lectura de cada trabajador en cada chat (para el punto de "no leído")
create table if not exists public.chat_reads (
  client_id    uuid not null references public.clients(id) on delete cascade,
  profile_id   uuid not null references public.profiles(id) on delete cascade,
  last_read_at timestamptz not null default now(),
  primary key (client_id, profile_id)
);

-- Fichajes: un registro por pulsación (entrada, pausa, regreso, salida).
-- Es un histórico: la aplicación solo añade, nunca corrige ni borra.
create table if not exists public.time_punches (
  id         uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  kind       text not null check (kind in ('entrada', 'pausa', 'regreso', 'salida')),
  at         timestamptz not null default now()
);

create index if not exists time_punches_profile_at_idx
  on public.time_punches (profile_id, at desc);

-- Archivos del chat. Se guardan en el bucket privado `adjuntos` tal cual se
-- suben (mismo nombre, mismo tipo, sin recomprimir) y se descargan con una URL
-- firmada, así que un 4K o un Excel salen idénticos a como entraron.
insert into storage.buckets (id, name, public, file_size_limit)
values ('adjuntos', 'adjuntos', false, 5368709120)
on conflict (id) do update set file_size_limit = excluded.file_size_limit;

drop policy if exists adjuntos_select on storage.objects;
create policy adjuntos_select on storage.objects
  for select to authenticated using (bucket_id = 'adjuntos');

drop policy if exists adjuntos_insert on storage.objects;
create policy adjuntos_insert on storage.objects
  for insert to authenticated with check (bucket_id = 'adjuntos');

drop policy if exists adjuntos_delete on storage.objects;
create policy adjuntos_delete on storage.objects
  for delete to authenticated using (bucket_id = 'adjuntos' and owner = auth.uid());

create table if not exists public.message_attachments (
  id          uuid primary key default gen_random_uuid(),
  message_id  uuid not null references public.messages(id) on delete cascade,
  client_id   uuid not null references public.clients(id) on delete cascade,
  path        text not null,
  name        text not null,
  mime        text not null default '',
  size_bytes  bigint not null default 0,
  created_at  timestamptz not null default now()
);

create index if not exists message_attachments_message_idx
  on public.message_attachments (message_id);

-- Avisos importantes de cada cliente. La cabecera solo enseña los del mes.
create table if not exists public.client_notices (
  id         uuid primary key default gen_random_uuid(),
  client_id  uuid not null references public.clients(id) on delete cascade,
  body       text not null,
  author_id  uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists client_notices_client_idx
  on public.client_notices (client_id, created_at desc);

-- Lista de pendientes de cada cliente, aparte del tablero.
create table if not exists public.client_tasks (
  id         uuid primary key default gen_random_uuid(),
  client_id  uuid not null references public.clients(id) on delete cascade,
  text       text not null,
  done       boolean not null default false,
  position   double precision not null default 0,
  author_id  uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists client_tasks_client_idx
  on public.client_tasks (client_id, position);

-- Tiempo dedicado a cada tarjeta: una fila por tramo de trabajo (quién, en qué
-- tarjeta, de qué cliente y en qué fase). La fase se guarda copiada porque la
-- tarjeta se mueve de columna: así el informe de "cuánto se tardó editando" no
-- cambia cuando la tarjeta avanza.
create table if not exists public.work_sessions (
  id           uuid primary key default gen_random_uuid(),
  card_id      uuid not null references public.cards(id) on delete cascade,
  client_id    uuid not null references public.clients(id) on delete cascade,
  column_key   text not null default '',
  column_label text not null default '',
  profile_id   uuid not null references public.profiles(id) on delete cascade,
  started_at   timestamptz not null default now(),
  ended_at     timestamptz,
  check (ended_at is null or ended_at >= started_at)
);

create index if not exists work_sessions_client_idx
  on public.work_sessions (client_id, started_at desc);
create index if not exists work_sessions_profile_idx
  on public.work_sessions (profile_id, started_at desc);

-- Nadie puede tener dos cronómetros en marcha a la vez.
create unique index if not exists work_sessions_una_abierta_por_persona
  on public.work_sessions (profile_id) where ended_at is null;

-- ============================================================================
-- 5. Seguridad a nivel de fila (RLS)
-- ----------------------------------------------------------------------------
-- Bitácora es una herramienta interna: cualquier trabajador autenticado ve y
-- edita el trabajo de todos los clientes. Lo que sí se protege:
--   · borrar clientes  -> solo admin
--   · editar/borrar mensajes y comentarios -> solo su autor (o un admin)
-- ============================================================================
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;

alter table public.profiles        enable row level security;
alter table public.clients         enable row level security;
alter table public.client_members  enable row level security;
alter table public.board_columns   enable row level security;
alter table public.cards           enable row level security;
alter table public.card_assignees  enable row level security;
alter table public.checklist_items enable row level security;
alter table public.card_comments   enable row level security;
alter table public.messages        enable row level security;
alter table public.chat_reads      enable row level security;
alter table public.time_punches    enable row level security;
alter table public.message_attachments enable row level security;
alter table public.client_notices      enable row level security;
alter table public.client_tasks        enable row level security;
alter table public.work_sessions       enable row level security;

-- Perfiles: todos se ven entre ellos; cada uno edita el suyo; el admin, cualquiera.
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles
  for select to authenticated using (true);

drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles
  for update to authenticated using (id = auth.uid() or public.is_admin())
  with check (id = auth.uid() or public.is_admin());

-- Clientes
drop policy if exists clients_select on public.clients;
create policy clients_select on public.clients
  for select to authenticated using (true);

drop policy if exists clients_insert on public.clients;
create policy clients_insert on public.clients
  for insert to authenticated with check (true);

drop policy if exists clients_update on public.clients;
create policy clients_update on public.clients
  for update to authenticated using (true) with check (true);

drop policy if exists clients_delete on public.clients;
create policy clients_delete on public.clients
  for delete to authenticated using (public.is_admin());

-- Tablas de trabajo compartido: lectura y escritura para cualquier autenticado.
do $$
declare t text;
begin
  foreach t in array array[
    'client_members', 'board_columns', 'cards', 'card_assignees', 'checklist_items', 'chat_reads',
    'message_attachments', 'client_notices', 'client_tasks'
  ] loop
    execute format('drop policy if exists %I_all on public.%I', t, t);
    execute format(
      'create policy %I_all on public.%I for all to authenticated using (true) with check (true)', t, t);
  end loop;
end;
$$;

-- Fichajes: cada uno ve y ficha lo suyo; el admin ve los de todo el equipo.
drop policy if exists time_punches_select on public.time_punches;
create policy time_punches_select on public.time_punches
  for select to authenticated using (profile_id = auth.uid() or public.is_admin());

drop policy if exists time_punches_insert on public.time_punches;
create policy time_punches_insert on public.time_punches
  for insert to authenticated with check (profile_id = auth.uid());

-- Cronómetros: el equipo ve el trabajo de todos (los informes son compartidos);
-- cada uno solo abre y cierra los suyos.
drop policy if exists work_sessions_select on public.work_sessions;
create policy work_sessions_select on public.work_sessions
  for select to authenticated using (true);

drop policy if exists work_sessions_insert on public.work_sessions;
create policy work_sessions_insert on public.work_sessions
  for insert to authenticated with check (profile_id = auth.uid());

drop policy if exists work_sessions_update on public.work_sessions;
create policy work_sessions_update on public.work_sessions
  for update to authenticated
  using (profile_id = auth.uid() or public.is_admin())
  with check (profile_id = auth.uid() or public.is_admin());

drop policy if exists work_sessions_delete on public.work_sessions;
create policy work_sessions_delete on public.work_sessions
  for delete to authenticated using (profile_id = auth.uid() or public.is_admin());

-- Arrancar el cronómetro en una tarjeta: cierra el que tuvieras abierto, copia
-- el cliente y la fase, y devuelve el tramo nuevo.
create or replace function public.start_work(p_card_id uuid)
returns public.work_sessions
language plpgsql
security invoker
set search_path = public
as $fn$
declare
  v_card    public.cards;
  v_column  public.board_columns;
  v_session public.work_sessions;
begin
  select * into v_card from public.cards where id = p_card_id;
  if v_card.id is null then
    raise exception 'Esa tarjeta ya no existe.';
  end if;

  select * into v_column from public.board_columns where id = v_card.column_id;

  update public.work_sessions
     set ended_at = now()
   where profile_id = auth.uid() and ended_at is null;

  insert into public.work_sessions (card_id, client_id, column_key, column_label, profile_id)
  values (p_card_id, v_card.client_id, coalesce(v_column.key, ''), coalesce(v_column.label, ''), auth.uid())
  returning * into v_session;

  return v_session;
end;
$fn$;

grant execute on function public.start_work(uuid) to authenticated;

-- Parar lo que tenga abierto quien llama.
create or replace function public.stop_work()
returns integer
language plpgsql
security invoker
set search_path = public
as $fn$
declare
  v_n integer;
begin
  update public.work_sessions
     set ended_at = now()
   where profile_id = auth.uid() and ended_at is null;
  get diagnostics v_n = row_count;
  return v_n;
end;
$fn$;

grant execute on function public.stop_work() to authenticated;

-- Mensajes: cualquiera lee y escribe (como su propio autor); solo el autor edita/borra.
drop policy if exists messages_select on public.messages;
create policy messages_select on public.messages
  for select to authenticated using (true);

drop policy if exists messages_insert on public.messages;
create policy messages_insert on public.messages
  for insert to authenticated with check (author_id = auth.uid());

drop policy if exists messages_update on public.messages;
create policy messages_update on public.messages
  for update to authenticated using (author_id = auth.uid()) with check (author_id = auth.uid());

drop policy if exists messages_delete on public.messages;
create policy messages_delete on public.messages
  for delete to authenticated using (author_id = auth.uid() or public.is_admin());

-- Comentarios de tarjeta: mismo criterio.
drop policy if exists card_comments_select on public.card_comments;
create policy card_comments_select on public.card_comments
  for select to authenticated using (true);

drop policy if exists card_comments_insert on public.card_comments;
create policy card_comments_insert on public.card_comments
  for insert to authenticated with check (author_id = auth.uid());

drop policy if exists card_comments_delete on public.card_comments;
create policy card_comments_delete on public.card_comments
  for delete to authenticated using (author_id = auth.uid() or public.is_admin());

-- ============================================================================
-- 6. Realtime — para que el tablero y el chat se actualicen solos
-- ============================================================================
do $$
declare t text;
begin
  foreach t in array array['cards', 'messages', 'checklist_items', 'card_comments', 'board_columns',
                           'clients', 'message_attachments', 'client_notices', 'client_tasks',
                           'work_sessions'] loop
    begin
      execute format('alter publication supabase_realtime add table public.%I', t);
    exception
      when duplicate_object then null;
      when undefined_object then null;
    end;
  end loop;
end;
$$;

-- ============================================================================
-- 7. Alta de un cliente con sus tres columnas por defecto
-- ============================================================================
create or replace function public.create_client(
  p_name   text,
  p_kind   text default '',
  p_prefix text default null
)
returns public.clients
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_client public.clients;
  v_prefix text;
begin
  v_prefix := upper(coalesce(nullif(p_prefix, ''), left(regexp_replace(p_name, '[^a-zA-Z]', '', 'g'), 1)));
  if v_prefix is null or v_prefix = '' then
    v_prefix := 'C';
  end if;

  insert into public.clients (name, kind, ref_prefix, position)
  values (p_name, coalesce(p_kind, ''), v_prefix,
          coalesce((select max(position) + 1 from public.clients), 0))
  returning * into v_client;

  insert into public.board_columns (client_id, key, label, position) values
    (v_client.id, 'idear',     'Idear',     0),
    (v_client.id, 'grabar',    'Grabar',    1),
    (v_client.id, 'editar',    'Editar',    2),
    (v_client.id, 'programar', 'Programar', 3),
    (v_client.id, 'report',    'Report',    4);

  insert into public.client_members (client_id, profile_id)
  values (v_client.id, auth.uid())
  on conflict do nothing;

  return v_client;
end;
$$;

grant execute on function public.create_client(text, text, text) to authenticated;

-- ============================================================================
-- 8. Vista auxiliar: último mensaje de cada cliente (para el punto de no leído)
-- ============================================================================
create or replace view public.client_chat_state
with (security_invoker = true) as
select
  cl.id as client_id,
  (select max(m.created_at) from public.messages m where m.client_id = cl.id) as last_message_at
from public.clients cl;

grant select on public.client_chat_state to authenticated;

-- card_assignees también en realtime, para que los responsables se vean al vuelo.
do $$
begin
  begin
    execute 'alter publication supabase_realtime add table public.card_assignees';
  exception
    when duplicate_object then null;
    when undefined_object then null;
  end;
end;
$$;

-- Alta del propio perfil (red de seguridad si el usuario existía antes del trigger).
drop policy if exists profiles_insert on public.profiles;
create policy profiles_insert on public.profiles
  for insert to authenticated with check (id = auth.uid());

-- ============================================================================
-- 9. Endurecimiento (avisos del linter de seguridad de Supabase)
-- ----------------------------------------------------------------------------
-- handle_new_user() e is_admin() son SECURITY DEFINER. Sin esto quedan
-- expuestas como /rest/v1/rpc/... y cualquiera con la clave pública podría
-- invocarlas. handle_new_user() solo debe correr como trigger, e is_admin()
-- solo desde dentro de las políticas RLS.
-- ============================================================================
revoke execute on function public.handle_new_user() from anon, authenticated, public;
revoke execute on function public.auto_confirm_new_user() from anon, authenticated, public;
revoke execute on function public.is_admin()        from anon, authenticated, public;

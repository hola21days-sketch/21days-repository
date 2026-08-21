-- ============================================================================
-- Bitácora — datos de ejemplo (OPCIONAL)
-- ----------------------------------------------------------------------------
-- Reproduce los clientes y tarjetas del mockup para poder ver la app llena
-- desde el primer minuto. Bórralo cuando entren los clientes reales:
--     delete from public.clients where name in (
--       'Ferretería Solà', 'Grup Martí Reformes', 'Òptica Vidal', 'Restaurant Can Bosch');
--
-- Requisito: que ya exista al menos un usuario dado de alta (Authentication >
-- Users), porque las tarjetas se asignan a perfiles reales.
-- ============================================================================

do $$
declare
  v_owner uuid;
  v_client uuid;
  v_todo uuid;
  v_doing uuid;
  v_done uuid;
begin
  select id into v_owner from public.profiles order by created_at limit 1;
  if v_owner is null then
    raise exception 'No hay ningún perfil todavía. Da de alta un usuario en Authentication > Users antes de ejecutar el seed.';
  end if;

  -- ---------- Ferretería Solà ----------
  insert into public.clients (name, kind, ref_prefix, position)
  values ('Ferretería Solà', 'Comercio · Ferretería', 'F', 0) returning id into v_client;
  insert into public.board_columns (client_id, key, label, position)
  values (v_client, 'todo', 'Por hacer', 0) returning id into v_todo;
  insert into public.board_columns (client_id, key, label, position)
  values (v_client, 'doing', 'En curso', 1) returning id into v_doing;
  insert into public.board_columns (client_id, key, label, position)
  values (v_client, 'done', 'Hecho', 2) returning id into v_done;
  insert into public.client_members (client_id, profile_id) values (v_client, v_owner);
  insert into public.cards (client_id, column_id, title, labels, due_date, position, created_by) values
    (v_client, v_todo,  'Actualizar catálogo web con precios de septiembre', '{facturacion}', current_date + 4, 0, v_owner),
    (v_client, v_todo,  'Preparar propuesta de TPV nuevo',                   '{reunion}',     current_date + 7, 1, v_owner),
    (v_client, v_doing, 'Migrar ficha de productos a la nueva plantilla',    '{diseno}',      current_date - 1, 0, v_owner),
    (v_client, v_doing, 'Revisar formulario de contacto — no llegan los avisos', '{urgente}', current_date - 2, 1, v_owner),
    (v_client, v_done,  'Publicar horario especial de agosto',               '{}',            current_date - 5, 0, v_owner);
  insert into public.messages (client_id, author_id, body, created_at) values
    (v_client, v_owner, 'Buenos días. He hablado con Ferretería Solà esta mañana, quieren el catálogo listo antes del 1 de septiembre.', now() - interval '3 hours'),
    (v_client, v_owner, 'El formulario de contacto sigue sin avisar por correo — lo marco como urgente, lo miramos hoy.', now() - interval '1 hour');

  -- ---------- Grup Martí Reformes ----------
  insert into public.clients (name, kind, ref_prefix, position)
  values ('Grup Martí Reformes', 'Servicios · Reformas', 'M', 1) returning id into v_client;
  insert into public.board_columns (client_id, key, label, position)
  values (v_client, 'todo', 'Por hacer', 0) returning id into v_todo;
  insert into public.board_columns (client_id, key, label, position)
  values (v_client, 'doing', 'En curso', 1) returning id into v_doing;
  insert into public.board_columns (client_id, key, label, position)
  values (v_client, 'done', 'Hecho', 2) returning id into v_done;
  insert into public.client_members (client_id, profile_id) values (v_client, v_owner);
  insert into public.cards (client_id, column_id, title, labels, due_date, position, created_by) values
    (v_client, v_todo,  'Fotografiar obra terminada en Sant Cugat',        '{diseno}',                current_date + 6, 0, v_owner),
    (v_client, v_doing, 'Montar galería de proyectos en la web',           '{diseno}',                current_date + 5, 0, v_owner),
    (v_client, v_doing, 'Cuadrar facturación de julio con el cliente',     '{facturacion,urgente}',   current_date - 2, 1, v_owner),
    (v_client, v_done,  'Formulario de presupuesto rápido',                '{}',                      current_date - 9, 0, v_owner);
  insert into public.messages (client_id, author_id, body, created_at) values
    (v_client, v_owner, 'Grup Martí pregunta por la factura de julio, ¿la revisamos hoy antes de las 14h?', now() - interval '30 minutes');

  -- ---------- Òptica Vidal ----------
  insert into public.clients (name, kind, ref_prefix, position)
  values ('Òptica Vidal', 'Comercio · Óptica', 'V', 2) returning id into v_client;
  insert into public.board_columns (client_id, key, label, position)
  values (v_client, 'todo', 'Por hacer', 0) returning id into v_todo;
  insert into public.board_columns (client_id, key, label, position)
  values (v_client, 'doing', 'En curso', 1) returning id into v_doing;
  insert into public.board_columns (client_id, key, label, position)
  values (v_client, 'done', 'Hecho', 2) returning id into v_done;
  insert into public.client_members (client_id, profile_id) values (v_client, v_owner);
  insert into public.cards (client_id, column_id, title, labels, due_date, position, created_by) values
    (v_client, v_todo,  'Añadir reserva de hora online',            '{reunion}', current_date + 9,  0, v_owner),
    (v_client, v_doing, 'Optimizar velocidad de carga en móvil',    '{}',        current_date + 3,  0, v_owner),
    (v_client, v_done,  'Renovar certificado SSL',                  '{}',        current_date - 11, 0, v_owner),
    (v_client, v_done,  'Campaña de vuelta al cole — banner web',   '{diseno}',  current_date - 16, 1, v_owner);

  -- ---------- Restaurant Can Bosch ----------
  insert into public.clients (name, kind, ref_prefix, position)
  values ('Restaurant Can Bosch', 'Hostelería · Restaurante', 'B', 3) returning id into v_client;
  insert into public.board_columns (client_id, key, label, position)
  values (v_client, 'todo', 'Por hacer', 0) returning id into v_todo;
  insert into public.board_columns (client_id, key, label, position)
  values (v_client, 'doing', 'En curso', 1) returning id into v_doing;
  insert into public.board_columns (client_id, key, label, position)
  values (v_client, 'done', 'Hecho', 2) returning id into v_done;
  insert into public.client_members (client_id, profile_id) values (v_client, v_owner);
  insert into public.cards (client_id, column_id, title, labels, due_date, position, created_by) values
    (v_client, v_todo,  'Subir carta de otoño con fotos nuevas',                  '{diseno}',  current_date + 11, 0, v_owner),
    (v_client, v_todo,  'Configurar reservas para grupos grandes',                '{}',        current_date + 13, 1, v_owner),
    (v_client, v_doing, 'Revisar reseñas negativas y responder desde la web',     '{urgente}', current_date - 1,  0, v_owner);
  insert into public.messages (client_id, author_id, body, created_at) values
    (v_client, v_owner, 'Can Bosch nos ha pasado las fotos del nuevo menú de otoño, están en la carpeta compartida.', now() - interval '2 hours');

  -- Las tarjetas de ejemplo quedan asignadas a quien ejecuta el seed.
  insert into public.card_assignees (card_id, profile_id)
  select c.id, v_owner
  from public.cards c
  join public.clients cl on cl.id = c.client_id
  where cl.name in ('Ferretería Solà', 'Grup Martí Reformes', 'Òptica Vidal', 'Restaurant Can Bosch')
  on conflict do nothing;
end;
$$;

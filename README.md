# Bitácora — DecaSight

Herramienta interna de **DecaSight** para llevar el control de los clientes: un tablero de
encargos y un chat de equipo por cada cliente, en vivo y compartido por todo el equipo.

Nace de la propuesta de diseño de Marc y la convierte en una aplicación real con acceso por
usuario y datos persistentes.

| | |
|---|---|
| **Front** | Next.js 15 (App Router) · React 19 · TypeScript |
| **Datos y acceso** | Supabase (PostgreSQL + Auth + Realtime) |
| **Publicación** | Vercel |

---

## Qué hace

- **Índice de clientes** — con el número de encargos abiertos y un punto rojo cuando hay mensajes
  del equipo sin leer.
- **Tablero por cliente** — columnas *Idear · Grabar · Editar · Programar · Report*, tarjetas que
  se arrastran de una a otra, con referencia propia (`F001`, `F002`…), etiquetas, fecha de entrega
  y responsables. Las entregas pasadas se marcan en rojo.
- **Detalle del encargo** — descripción, checklist, responsables, fecha y comentarios del equipo.
- **Chat interno por cliente** — conversación que ve solo el equipo, nunca el cliente.
- **En vivo** — lo que cambia un compañero aparece al momento en la pantalla de los demás.
- **Modo claro y oscuro**, y uso desde el móvil.
- **Alta desde la propia pantalla de acceso** — cada trabajador se crea su cuenta con su correo,
  su nombre y una contraseña, y entra en el acto: no hay que confirmar el correo.
- **Fichaje** — abajo a la izquierda: entrada, pausa, regreso y salida, con el estado de la jornada
  y las horas acumuladas del día. Cada uno ve las suyas; un administrador, las de todo el equipo.

---

## Estado

| Pieza | Estado |
|---|---|
| Código de la aplicación | Listo. Compila y está en esta rama. |
| Base de datos Supabase | **Instalada** en el proyecto `bbxyvhcolypgvxtfsyvy` (región `eu-west-1`): 10 tablas, RLS en todas, realtime y funciones. |
| Publicación en Vercel | **Hecha** — <https://bitacora-21-days1.vercel.app> (proyecto `bitacora`, equipo 21DAYS). |
| Altas del equipo | Cada uno se registra en <https://bitacora-21-days1.vercel.app> con «Crear una». Hoy **no hay ningún usuario** dado de alta. |
| Logo y tipografía de DecaSight | **Pendiente** — ahora hay una marca provisional. |

---

## Lo que queda por hacer

### 1. Conectar GitHub con Vercel  *(1 minuto, recomendable)*

La aplicación **ya está publicada** en <https://bitacora-21-days1.vercel.app>, pero el proyecto
de Vercel no está enlazado al repositorio: el código se subió directamente. Mientras siga así,
un push a GitHub **no** actualiza la web; hay que volver a publicar a mano.

Para que cada push despliegue solo, instala la aplicación de Vercel en la cuenta de GitHub —
<https://github.com/apps/vercel> → *Install* → elegir `21days-repository` — y luego, en Vercel,
**Project Settings → Git → Connect Git Repository**. Es un permiso de la cuenta, no del proyecto,
y solo lo puede dar su titular.

> Los despliegues los hace una cuenta con permisos limitados en el equipo: puede publicar, pero
> no leer el estado de los despliegues ni cambiar los ajustes del proyecto. Para tocar ajustes
> (dominio propio, variables de entorno) hace falta entrar como propietario del equipo.

### 2. Dar de alta al equipo  *(cada uno se registra solo)*

En la pantalla de acceso hay **«¿Aún no tienes cuenta? Crear una»**: nombre, correo y contraseña,
y dentro. El perfil (iniciales y color del sello) se crea solo.

Para que funcione, en Supabase → **Authentication → Sign In / Providers → Email** tienen que estar
así:

- **Allow new users to sign up**: activado (si no, la pantalla avisa de que el registro está
  cerrado);
- **Confirm email**: da igual cómo esté. El esquema instala un trigger
  (`auto_confirm_new_user`) que da el correo por confirmado al crear el usuario, así que el alta
  entra directa. Si lo dejas activado, Supabase seguirá mandando un correo de confirmación que ya
  no hace falta abrir; desactívalo si prefieres que no se envíe.

También puedes seguir dando de alta a mano en **Authentication → Users → Add user** (marcando
*Auto Confirm User*), que es lo suyo si prefieres controlar tú quién entra.

> **Cuando estéis todos dentro, cierra el registro.** Desactiva *Allow new users to sign up*: la
> aplicación está en una dirección pública y cualquiera con el enlace podría crearse una cuenta.
> Si prefieres dejarlo abierto pero limitado a los correos de la empresa, pon los dominios en
> `NEXT_PUBLIC_ALLOWED_EMAIL_DOMAINS` (p. ej. `21daysagency.com`) y vuelve a publicar.

Para nombrar administradores (pueden borrar clientes y mensajes de otros), en el **SQL Editor**:

```sql
update public.profiles set role = 'admin' where email = 'hola@21daysagency.com';
```

Y para ajustar cómo se muestra alguien:

```sql
update public.profiles set full_name = 'Marc Valero', initials = 'MV' where email = 'marc@…';
```

### 3. Ajustar las URLs de acceso  *(1 minuto, imprescindible para el acceso por correo)*

Supabase → **Authentication → URL Configuration**:

- **Site URL**: `https://bitacora-21-days1.vercel.app` (o vuestro dominio, cuando lo haya).
- **Redirect URLs**: añade `https://bitacora-21-days1.vercel.app/auth/callback`.

Sin esto, el acceso por enlace de correo no vuelve a la aplicación. El acceso con contraseña
funciona igual.

### 4. (Opcional) Datos de ejemplo

Para ver la aplicación llena desde el primer momento, ejecuta
[`supabase/seed.sql`](supabase/seed.sql) en el SQL Editor. Reproduce los cuatro clientes del
mockup. Cuando entren los clientes reales, bórralos:

```sql
delete from public.clients
where name in ('Ferretería Solà', 'Grup Martí Reformes', 'Òptica Vidal', 'Restaurant Can Bosch');
```

---

## Reinstalar la base de datos desde cero

Ya está instalada, pero si algún día hace falta rehacerla o montar un segundo entorno: pega
[`supabase/schema.sql`](supabase/schema.sql) entero en **SQL Editor → New query**. Es idempotente,
así que se puede volver a ejecutar sin romper nada.

### Variables de entorno

| Variable | Obligatoria | Para qué |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Sí | Dirección del proyecto de Supabase. Ya viene puesta en `.env.production`. |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Sí | Clave pública (`sb_publishable_…`), la que Supabase recomienda hoy. Ya viene puesta en `.env.production`. Es segura en el navegador: en Next.js toda variable `NEXT_PUBLIC_*` viaja dentro del bundle, y quien protege los datos son las políticas RLS. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | No | La clave pública antigua (JWT *anon*). Solo se usa si no hay clave publishable; sirve para no romper entornos que ya la tuvieran. |
| `NEXT_PUBLIC_ALLOWED_EMAIL_DOMAINS` | No | Dominios permitidos, separados por comas (`decasight.com`). Vacío = sin restricción. |

> La clave `service_role` de Supabase **no** se usa aquí y no debe ponerse nunca en Vercel como
> variable `NEXT_PUBLIC_`.

---

## Desarrollo en local

```bash
npm install
cp .env.example .env.local     # y rellena la URL y la clave de Supabase
npm run dev                    # http://localhost:3000
```

Otros comandos:

```bash
npm run build        # build de producción
npm run typecheck    # comprobación de tipos
```

---

## Cómo está montado

```
src/
  app/
    layout.tsx            Estructura común y arranque del tema claro/oscuro
    page.tsx              Reparte: al tablero si hay sesión, si no a /entrar
    entrar/               Pantalla de acceso
    bitacora/             Carga los datos en servidor y monta el espacio de trabajo
    auth/callback/        Cierra el acceso por enlace de correo
    auth/salir/           Cerrar sesión
    globals.css           Toda la hoja de estilo, con los tokens de marca arriba
  components/
    Workspace.tsx         Estado, guardado y tiempo real
    Rail.tsx              Índice de clientes y fichaje
    Fichaje.tsx           Entrada, pausa, regreso y salida
    Board.tsx             Tablero y arrastre de tarjetas
    CardDrawer.tsx        Detalle del encargo
    Chat.tsx              Chat del equipo
    Logo.tsx              Logotipo de DecaSight
  lib/
    supabase/             Clientes de Supabase (navegador, servidor, middleware)
    brand.ts              Nombre, bajada y logo de la marca
    types.ts, format.ts   Tipos y formateo de fechas
supabase/
  schema.sql              Tablas, permisos, tiempo real
  seed.sql                Datos de ejemplo (opcional)
```

### Permisos

Bitácora es una herramienta interna: **cualquier trabajador autenticado ve y edita el trabajo de
todos los clientes**. Lo que sí está protegido por RLS:

- los fichajes → cada uno solo ve y ficha los suyos (el administrador ve los de todos);
- borrar clientes → solo administradores;
- editar o borrar mensajes y comentarios → solo su autor (o un administrador);
- sin sesión no se lee absolutamente nada.

Si en algún momento hiciera falta que cada trabajador viera solo sus clientes, se cambia en las
políticas de `schema.sql` apoyándose en la tabla `client_members`.

---

## Cambiar la identidad de DecaSight

Todo el color y la tipografía salen de un único sitio, así que la marca se cambia sin tocar
componentes:

- **Colores** — bloque `Identidad DecaSight` al principio de `src/app/globals.css`
  (`--accent`, `--ink`, `--bg`… y sus equivalentes en modo oscuro).
- **Tipografía** — variables `--font-display` y `--font-body` en ese mismo bloque.
- **Logotipo** — `src/components/Logo.tsx`. Ahora lleva una marca provisional dibujada con los
  colores del tema. Para poner el logo real, deja el SVG en `public/logo-decasight.svg` y cambia
  el componente por `<img src={BRAND.logo} alt={BRAND.logoAlt} className="rail__logo" />`.
- **Nombres y textos de marca** — `src/lib/brand.ts`.

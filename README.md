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
- **Tablero por cliente** — columnas *Por hacer · En curso · Hecho*, tarjetas que se arrastran de
  una a otra, con referencia propia (`F001`, `F002`…), etiquetas, fecha de entrega y responsables.
  Las entregas pasadas se marcan en rojo.
- **Detalle del encargo** — descripción, checklist, responsables, fecha y comentarios del equipo.
- **Chat interno por cliente** — conversación que ve solo el equipo, nunca el cliente.
- **En vivo** — lo que cambia un compañero aparece al momento en la pantalla de los demás.
- **Modo claro y oscuro**, y uso desde el móvil.

---

## Puesta en marcha

### 1. Crear el proyecto en Supabase

En <https://supabase.com/dashboard> → **New project**. Elige la región de Europa (Frankfurt o
Londres) para que vaya rápido desde aquí, y guarda la contraseña de la base de datos.

### 2. Instalar el esquema

En el panel de Supabase → **SQL Editor** → **New query**, pega el contenido de
[`supabase/schema.sql`](supabase/schema.sql) y ejecútalo. Crea las tablas, los permisos por fila
(RLS), el tiempo real y el alta automática de perfiles.

Se puede volver a ejecutar tantas veces como haga falta sin romper nada.

### 3. Dar de alta al equipo

**Authentication → Users → Add user**, uno por cada trabajador, con su correo de DecaSight y una
contraseña inicial. Marca *Auto Confirm User* para que puedan entrar sin verificar el correo.

Cada alta crea su perfil automáticamente. Para nombrar a alguien administrador (puede borrar
clientes y mensajes de otros):

```sql
update public.profiles set role = 'admin' where email = 'hola@21daysagency.com';
```

Si quieres cambiar el nombre que se muestra o sus iniciales:

```sql
update public.profiles set full_name = 'Marc Valero', initials = 'MV' where email = 'marc@…';
```

> **Deja el registro público cerrado.** En *Authentication → Sign In / Providers → Email*,
> desactiva **Allow new users to sign up**. Así solo entra quien tú das de alta.

### 4. (Opcional) Datos de ejemplo

Para ver la aplicación llena desde el primer momento, ejecuta
[`supabase/seed.sql`](supabase/seed.sql) en el SQL Editor. Reproduce los cuatro clientes del
mockup. Cuando entren los clientes reales, bórralos:

```sql
delete from public.clients
where name in ('Ferretería Solà', 'Grup Martí Reformes', 'Òptica Vidal', 'Restaurant Can Bosch');
```

### 5. Publicar en Vercel

1. En <https://vercel.com/new>, importa este repositorio. Vercel detecta Next.js solo: no toques
   los ajustes de build.
2. En **Environment Variables**, añade las de la tabla de abajo (las de Supabase están en
   *Project Settings → API*).
3. **Deploy**.
4. Vuelve a Supabase → **Authentication → URL Configuration** y pon en **Site URL** la dirección
   que te ha dado Vercel (`https://…vercel.app` o vuestro dominio). En **Redirect URLs** añade
   `https://…/auth/callback`. Sin esto, el acceso por enlace de correo no vuelve a la aplicación.

### Variables de entorno

| Variable | Obligatoria | Para qué |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Sí | Dirección del proyecto de Supabase. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Sí | Clave pública (*anon*). Es segura en el navegador: quien manda son las políticas RLS. |
| `NEXT_PUBLIC_ALLOWED_EMAIL_DOMAINS` | No | Dominios permitidos, separados por comas (`decasight.com`). Vacío = sin restricción. |

> La clave `service_role` de Supabase **no** se usa aquí y no debe ponerse nunca en Vercel como
> variable `NEXT_PUBLIC_`.

---

## Desarrollo en local

```bash
npm install
cp .env.example .env.local     # y rellena las dos claves de Supabase
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
    Rail.tsx              Índice de clientes
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

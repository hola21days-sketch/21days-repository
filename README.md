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

## Estado

| Pieza | Estado |
|---|---|
| Código de la aplicación | Listo. Compila y está en esta rama. |
| Base de datos Supabase | **Instalada** en el proyecto `bbxyvhcolypgvxtfsyvy` (región `eu-west-1`): 10 tablas, RLS en todas, realtime y funciones. |
| Publicación en Vercel | **Pendiente** — falta conectar GitHub a la cuenta de Vercel (ver abajo). |
| Altas del equipo | **Pendiente** — hay que crear los usuarios en Supabase. |
| Logo y tipografía de DecaSight | **Pendiente** — ahora hay una marca provisional. |

---

## Lo que queda por hacer

### 1. Conectar GitHub con Vercel  *(1 minuto, imprescindible)*

Vercel rechaza enlazar el repositorio con este error:

> *You need to add a Login Connection to your GitHub account first.*

Se arregla en <https://vercel.com/account/login-connections> → **GitHub** → *Connect*.
Es un permiso de la cuenta de Vercel, no del proyecto, y solo lo puede dar su titular.

Hecho eso, el proyecto se crea enlazado al repositorio y cada push despliega solo.

### 2. Dar de alta al equipo  *(1 minuto por persona)*

En Supabase → **Authentication → Users → Add user**, con el correo de cada trabajador y una
contraseña inicial. Marca *Auto Confirm User* para que puedan entrar sin verificar el correo.
El perfil se crea solo.

Para nombrar administradores (pueden borrar clientes y mensajes de otros), en el **SQL Editor**:

```sql
update public.profiles set role = 'admin' where email = 'hola@21daysagency.com';
```

Y para ajustar cómo se muestra alguien:

```sql
update public.profiles set full_name = 'Marc Valero', initials = 'MV' where email = 'marc@…';
```

> **Cierra el registro público.** En *Authentication → Sign In / Providers → Email*, desactiva
> **Allow new users to sign up**. Así solo entra quien tú das de alta.

### 3. Ajustar las URLs de acceso  *(cuando exista la URL de Vercel)*

Supabase → **Authentication → URL Configuration**:

- **Site URL**: la dirección que dé Vercel (o vuestro dominio).
- **Redirect URLs**: añade `https://…/auth/callback`.

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
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Sí | Clave pública (*anon*). Ya viene puesta en `.env.production`. Es segura en el navegador: en Next.js toda variable `NEXT_PUBLIC_*` viaja dentro del bundle, y quien protege los datos son las políticas RLS. |
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

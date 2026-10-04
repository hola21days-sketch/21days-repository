# Bitácora — 21days agency

Herramienta interna de **21days agency** para llevar el control de los clientes: un tablero de
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

- **Índice de clientes** — el número de la derecha es **lo que te has perdido** desde la última vez
  que abriste ese canal, no un total: al entrar se queda a cero y desaparece. El canal sale **en
  negrita** cuando
  **otra persona** ha hecho algo desde la última vez que se abrió —lo propio no cuenta, que si no
  el canal del equipo estaría siempre en negrita—, y con un icono que dice de qué se trata: 💬 si
  han escrito, ✎ si han tocado las tareas, los dos si las dos cosas. Abrirlo lo da por visto y la
  negrita se quita.
- **Avance del mes** — en el panel de clientes, una rejilla con una fila por cliente y una casilla
  por fase (*Idear · Grabar · Editar · Programar · Report*). Una casilla marcada se ve marcada y
  nada más: quién la marcó no se muestra. Sustituye al tablero de tarjetas, que ya no existe.
- **Chat interno por cliente** — conversación que ve solo el equipo, nunca el cliente, con
  **archivos adjuntos**: vídeo 4K, Excel, PDF o lo que sea, guardados tal cual y descargados
  idénticos (sin recomprimir ni recortar resolución). Los grandes se suben por partes, con
  porcentaje y reintentos, así que un corte de red no tira la subida. Los mensajes se pueden **editar y borrar**,
  se puede **mencionar** a alguien con `@`, y desde ahí se entra o se programa una
  **videollamada de Google Meet**, al momento o programada (con enlace para meterla en Google
  Calendar).
- **Transcripción y traducción de vídeos** — en cualquier vídeo o audio del chat sale
- **Mensajes directos** — *Mensajes directos*, en el panel izquierdo: conversación privada uno a
  uno con cualquier compañero, con archivos, notas de voz y enlaces pulsables. Lo que tiene algo sin
  leer sale **en negrita y con un 💬**, sin número: da igual que sean dos mensajes o nueve, se entra
  igual. Al abrir la conversación se quita al momento. Los archivos de un mensaje directo los leen solo sus dos dueños, no el equipo. Solo la ven los dos. Al
  programar una videollamada, todo el que sigue al cliente recibe el aviso por aquí.
- **La página no se mueve** — la aplicación mide lo que mide la pantalla y lo que se desplaza es lo
  de dentro. El listado de clientes se queda quieto —con su fichaje y su pie siempre abajo, y la
  lista corriendo por el medio—, la cabecera del canal se queda arriba y el cuadro de escribir
  abajo: lo único que baja son los mensajes. Lo mismo en el resto de pantallas: el tablero, las
  tareas o los informes se desplazan por dentro, debajo de su cabecera.
- **Las fases del mes, las de cada cliente** — de serie, idear, grabar, editar, **planificar** y
  programar. Pero no todos llevan lo mismo: hay clientes con **ads**, con **influencers** o con
  **web**, y otros no. Con el botón derecho sobre el nombre, **Qué lleva este cliente** marca las
  suyas, y si falta alguna se escribe y ya existe. El tablero saca una columna por cada fase que
  lleve alguien, y donde un cliente no la lleva sale un **guion** en vez de una casilla vacía, que es
  lo que no dejaba distinguir «no hecho» de «no va». Las cifras de arriba cuentan solo lo que de
  verdad toca. *Report* ya no está de serie porque no se lleva desde aquí; lo que se marcó en su día
  no se ha borrado, y devolver la columna a un cliente la devuelve con lo suyo.
- **El tablero y el listado de canales van por separado** — son dos sitios distintos y ya no
  arrastran el uno al otro. Hay clientes a los que se les lleva el contenido sin abrirles un canal, y
  canales que no son un cliente al que seguir mes a mes. Al dar de alta se dice **dónde sale** —en el
  tablero, en el listado, o en los dos—, y viene marcado el sitio desde el que se ha pedido el alta.
  Con el botón derecho, **Quitar del tablero** y **Quitar del listado** sacan de esa lista y de nada
  más; **Eliminar del todo** sigue estando aparte, con su confirmación.
- **Fases a medias** — en la rejilla del mes, una casilla ya no es sí o no: se pulsa y va pasando
  por **sin empezar → a medias → hecha**. *A medias* sale en ámbar, para distinguirlo de un vistazo
  de lo que está cerrado. Al dejar algo a medias se abre un hueco para escribir **qué falta** —«falta
  grabar la parte de la consulta»—, que se queda como nota de esa casilla y **se lee al pasar el ratón
  por encima**, en un globo, con un puntito en la casilla que avisa de que hay algo escrito. Al darlo por hecho, la nota se va
  sola. Arriba, junto a las fases hechas, se cuenta cuántas están a medias.
- **Añadir y quitar clientes desde el tablero** — al final de la rejilla hay **+ Añadir cliente**:
  lo que se dé de alta se queda, y los meses siguientes lo traen solo. Con el **botón derecho** sobre
  el nombre se abre el canal, se quita del tablero o se elimina del todo, esto último pidiendo que se
  escriba el nombre para confirmarlo, porque se lleva por delante su chat, sus tareas y sus archivos.
  Borrar es cosa de administradores.
- **Una tarea, varias personas** — hay trabajo que se reparte, así que una tarea puede llevarla
  más de uno: dos, tres o los que hagan falta. Donde antes había un desplegable que solo dejaba
  elegir a una persona —en el canal del cliente, en *Tareas del equipo* y en la agenda— ahora
  está cada uno con su foto y se pulsa para ponerlo o quitarlo. En las listas salen todas las
  caras, y la tarea aparece en el *mi trabajo* de cada una de ellas.
- **Tareas en proceso** — dentro de un cliente, cada pendiente tiene **Iniciar tarea**. Mientras
  está en marcha se ve *En proceso*, con el nombre de quien la lleva y el rato que lleva, y al
  acabar se pulsa **Terminar proceso**. En *Tareas del equipo*, lo primero es **En marcha ahora
  mismo**: quién está con qué, en qué cliente y desde cuándo.
- **Lo que queda a medias** — al cerrar la jornada, un cuarto paso opcional para apuntar lo que se
  ha quedado a medio hacer, con su cliente. Al día siguiente sale lo primero en *Tareas del equipo*,
  con el nombre de quien lo dejó y el día, y se quita pulsando **Resuelto**. No es una tarea: es el
  recado para que nadie empiece a ciegas.
- **Notas de voz** — en los canales y en los mensajes directos: el micrófono graba y la nota se va
  con el mensaje como un adjunto más, con su barra de reproducción y sus velocidades. Hay botón de
  tirarla antes de mandarla.
- **Archivos que se ven** — en los canales y en los mensajes directos: una imagen sale grande y se abre a pantalla completa al pulsarla, un
  vídeo se reproduce en el chat y un audio trae su barra de reproducción. Lo demás sigue siendo una
  tarjeta con su nombre y su tamaño. Descargar siempre está a mano, y el original no se toca.
- **Quién anda por aquí** — arriba a la derecha salen las caras de quien ha hecho algo en la
  aplicación en los **últimos 15 minutos** (pulsar, escribir, desplazarse, mover el ratón). Tenerla
  abierta todo el día en una pestaña sin tocarla no cuenta. Al pasar por encima de una cara dice
  hace cuánto. Seguir un cliente, que es lo que hace que te lleguen sus avisos, va en su botón
  **+ Seguir / Siguiendo**, al lado.
- **Aviso al llegar algo** — la campana de la cabecera enciende o apaga el aviso. Suena **alto**:
  tres notas que suben, dos veces, con compresión para que se oigan por encima de la música o del
  ruido de la oficina. Suena **todo** lo que llega de otra persona: un mensaje en un canal, un
  mensaje directo, una tarea nueva y que te repartan una tarea. También cuando el tiempo real se
  cae y los mensajes entran por la vía de repuesto, que antes llegaban callados. Lo propio no
  suena. Si la ventana está detrás de otra cosa, además salta el **aviso del ordenador** —se pide
  permiso al encender la campana, no al entrar— y el título de la pestaña pasa a `(3) Bitácora`,
  que se pone a cero al volver. Se guarda por aparato, así que puede estar encendido en el
  ordenador y apagado en el móvil.
- **Foto de perfil** — la misma que cada uno tiene en Slack, en los chats, en los mensajes
  directos, en las tareas y en los paneles. Lo traído de Slack también sale con su foto: se empareja
  por el nombre, así que «Aina» y «Aina Viciano» son la misma persona y ya no aparece dos veces en
  la barra de gente. Si la foto no carga, se ven las iniciales de siempre en vez de un cuadro roto.
- **Enlaces pulsables en todas partes** — en el chat, en los mensajes directos, en las indicaciones
  de una tarea, en la agenda, en la ficha del cliente y en las notas de una clave. Se escriben como
  texto y se leen como enlace, sin copiar y pegar.
- **Mi cuenta** — en el pie del panel izquierdo: cada uno se cambia su propia contraseña cuando
  quiere, sin pedírselo a nadie. Va contra Supabase directamente, así que la nueva no pasa por
  ninguna tabla nuestra y se guarda cifrada de ida sin vuelta.
- **Mi agenda** — dos agendas, una encima de la otra y a todo lo ancho. Arriba **lo personal**: lo de cada
  uno que no es trabajo, con su fecha y sus apuntes. **Solo lo ve quien lo escribe**, y no por estar
  escondido: la base de datos únicamente deja leer y escribir las filas propias, tenga el perfil que
  tenga. Debajo, **mi trabajo**: las tareas que uno tiene asignadas en los clientes, repartidas
  en columnas —*hoy, mañana, pasado, más adelante, sin día*— para organizarse arrastrándolas o con
  los botones. Mover una es cambiarle la fecha de entrega, no una copia: se ve igual en el canal del
  cliente y en el panel del equipo. Desde ahí también se **añaden** tareas: se dice qué hay que
  hacer, de qué cliente y para qué día, y la tarea aparece en el canal de ese cliente asignada a
  quien la escribió. **La tiene todo el equipo**, no solo los administradores: cada
  uno la suya, y lo personal de cada cual no lo ve nadie más.
- **En el móvil** — se añade a la pantalla de inicio como una app más, con su icono, y se abre a
  pantalla completa. Toda la aplicación está adaptada a pantalla estrecha: los canales salen del
  botón ☰, las tablas se desplazan de lado con la columna del nombre fija, los campos no provocan
  el zoom de iOS y se respetan el notch y la barra de gestos.
- **Claves de acceso** — pestaña *Claves* dentro de cada cliente: Instagram, TikTok, Metricool,
  ManyChat, Google Ads, WordPress, Klaviyo… con su usuario, su contraseña, el enlace y notas. Salen
  tapadas: se enseñan de una en una, todas de golpe con *Ver todas*, o se copian sin verlas. Las lee
  todo el equipo, pero **solo un administrador puede añadirlas, cambiarlas o borrarlas**: botón
  *Editar* en cada fila, la contraseña a la vista mientras se escribe y un *Guardar* explícito, con
  *Cancelar* al lado. Cada cambio deja quién y cuándo. El nombre del servicio es texto libre con
  sugerencias, así que cabe cualquiera. Las internas de la agencia van en el canal 21DAYS.
- **Drive y Pinterest** — botones *Entrar al Drive* y *Pinterest* en la cabecera de cada cliente y
  dentro de su ficha. Cada canal guarda su carpeta de Drive y su tablero de look & feel; los que
  no tengan carpeta propia apuntan a la carpeta general de clientes.
- **Canal del equipo** — los canales internos salen destacados arriba del listado y no cuentan
  como clientes en el panel.
- **Ficha del cliente** — se abre pulsando su nombre arriba: descripción, desde cuándo es cliente
  (y cuánto lleva con nosotros), temporada, vídeos al mes, contacto y cómo va ahora mismo el
  tablero. Se edita ahí mismo.
- **Resumen del mes por cliente** — bajo el nombre del cliente: vídeos en Report, en producción,
  entregas pasadas y tareas pendientes, más los avisos importantes que apunte el equipo.
- **Lista de pendientes por cliente** — pestaña *Tareas*, aparte del tablero: cada una se abre
  para poner quién la hace, las indicaciones y para cuándo.
- **Cronómetro por tarjeta** — *Iniciar proceso* / *Parar* dentro de cada encargo. Guarda quién,
  qué cliente y en qué fase estaba (Idear, Grabar, Editar…), y en el tablero se ve qué tarjetas
  están en proceso ahora mismo.
- **Panel de clientes** — la primera parada: la rejilla del mes y, debajo, todos los pendientes
  agrupados **por prioridad**, con su responsable y su fecha de entrega, filtrables por hoy, esta
  semana, este mes o todo.
- **Tareas del equipo** — el reparto en una tabla: cuántas lleva cada persona, cuántas son
  urgentes, cuántas van con retraso, cuántas ha cerrado y cuál es su próxima entrega. Al pulsar en
  alguien se ven sus tareas, y desde ahí se cambia la prioridad, la fecha o se dan por hechas.
  Marcarlas no las borra: se quedan **tachadas** al final, las de los últimos quince días, para
  repasar de un vistazo lo que ha salido. Se desmarcan volviendo a pulsar la casilla.
  Al abrir una tarea se le cambia también el **cliente**, y con **Duplicar** (o el botón derecho)
  sale una copia con su explicación, prioridad, fecha y personas, lista para pasarla a otro cliente.
- **Prioridades** — cada encargo, cada tarea y cada cliente se marcan como *Urgente*,
  *Importante*, *Normal* o *Puede esperar*. Las listas se ordenan solas por prioridad y, a
  igualdad, por fecha de entrega.
- **Parte del día** — no se ficha la entrada. Al terminar se pulsa *Terminar la jornada* y sale una
  sola pregunta, *¿qué has hecho hoy?*, que se responde en tres gestos: eliges la tarea (Idear,
  Grabar, Editar, Programar, Report, Reunión), marcas los clientes —varios de una vez si hace
  falta— y das el rato. Lo que estuviera cronometrado aparece ya puesto, y cada línea se ajusta de
  15 en 15 o se quita. Eso es lo que alimenta los informes.
- **Informes de tiempo** *(solo administradores)* — semana o mes, con el total por cliente y fase
  (p. ej. *Editar de X: 4h 20m*), el total por persona y quién está trabajando en cada cosa en
  este momento.
- **Informes en Excel** — *Descargar en Excel* en los informes de tiempo y en el panel de fichaje.
  No es un CSV pelado: es un libro con varias hojas, cabeceras de marca, barras dentro de las
  celdas, filtros y totales. El de tiempo trae *Resumen*, *Por persona* (media por día trabajado,
  media por día laborable y media de cada día de la semana), *Por cliente* (matriz cliente × fase
  y quién ha tocado cada cuenta), *Por día* y el *Detalle* tramo a tramo. El de fichaje trae
  *Resumen* (jornadas, media por jornada, entrada y salida medias, pausa media, día más largo),
  *Por día de la semana*, *Detalle diario* y los *Marcajes* en bruto.
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
| Base de datos Supabase | **Instalada** en el proyecto `bbxyvhcolypgvxtfsyvy` (región `eu-west-1`): tablas con RLS en todas, realtime y funciones. |
| Publicación en Vercel | **Hecha** — <https://bitacora-21-days1.vercel.app> (proyecto `bitacora`, equipo 21DAYS). |
| Altas del equipo | Cada uno se registra en <https://bitacora-21-days1.vercel.app> con «Crear una». Hoy **no hay ningún usuario** dado de alta. |
| Hoja de fichajes | [Google Sheets](https://docs.google.com/spreadsheets/d/1mKnnXBtKxVEpQMkJ6ovZgOnwaRWiM_0ncmtQB0IHuTk/edit) — se rellena con el Excel que exporta la app. |
| Logo y tipografía de 21days agency | **Pendiente** — ahora hay una marca provisional. |

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

### 4. Subir vídeos grandes  *(imprescindible para trabajar con 4K)*

Los archivos se guardan **tal cual**: mismo códec, misma resolución, mismo peso. La aplicación no
recomprime nada, ni al subir ni al descargar. Lo que sí tiene tope es Supabase.

Los archivos de más de 6 MB se suben **por partes** (protocolo TUS, trozos de 6 MB): se ve el
porcentaje mientras avanza, cada trozo se reintenta solo y un corte de red no tira la subida
entera. Eso arregla los cortes, pero no el tope.

El tope por archivo lo pone el **límite global del proyecto** (Supabase → *Storage → Settings →
Global file size limit*), y depende del plan:

| Plan de Supabase | Máximo por archivo | Almacenamiento incluido |
|---|---|---|
| Free | **50 MB** (no se puede subir) | 1 GB |
| Pro (25 $/mes) | hasta 500 GB | 100 GB |

Con el plan gratuito, un vídeo 4K casi nunca cabe. Para subirlos desde la herramienta hay que
pasar el proyecto a Pro, poner el límite global en el valor que queráis y, en Vercel, añadir la
variable `NEXT_PUBLIC_MAX_UPLOAD_MB` con ese mismo número (en MB) para que la aplicación deje de
frenar antes de tiempo.

Mientras tanto la aplicación avisa al elegir el archivo, en vez de fallar a mitad de subida, y
recuerda la alternativa: subir el vídeo a Drive y pegar el enlace en el chat.

### 5. Transcripción de audios  *(apagada)*

La función de borde `transcribir` sigue instalada y la tabla `transcripts` también, pero **el botón
ya no aparece en la aplicación**: usaba el reconocimiento de voz de OpenAI y hacía falta una clave
de pago, y para lo que se usaba no compensaba el lío. Para volver a encenderlo basta con devolver
el bloque de transcripción a `Adjunto.tsx` y añadir `OPENAI_API_KEY` en Supabase → Edge Functions →
Secrets.

### 6. Fichajes en Google Sheets

La hoja está creada:
[Fichajes — Bitácora](https://docs.google.com/spreadsheets/d/1mKnnXBtKxVEpQMkJ6ovZgOnwaRWiM_0ncmtQB0IHuTk/edit).
Para actualizarla: en la app, panel de fichaje → **Descargar en Excel**, y en la hoja
*Archivo → Importar → Subir → Sustituir hoja actual* (Google Sheets abre el `.xlsx` igual que un
CSV, y así conserva las cuatro pestañas). El libro trae lo que cada uno puede ver: sus fichajes,
o los de todo el equipo si es administrador.

### 7. (Opcional) Datos de ejemplo

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
| `NEXT_PUBLIC_ALLOWED_EMAIL_DOMAINS` | No | Dominios permitidos, separados por comas (`21daysagency.com`). Vacío = sin restricción. |
| `NEXT_PUBLIC_MAX_UPLOAD_MB` | No | Tope por archivo que enseña y respeta la aplicación, en MB. Por defecto `50`, que es el máximo del plan gratuito de Supabase. Al subir de plan, hay que poner aquí el mismo número que en *Storage → Settings → Global file size limit*. |

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
    Informes.tsx          Tiempo por cliente, fase y persona
    MiPanel.tsx           Lo mío y el reparto del equipo
    Claves.tsx            Claves de acceso de cada cliente
    Agenda.tsx            Agenda personal, privada de cada uno
    Chat.tsx              Chat del equipo, adjuntos, transcripciones y Meet
    FichaCliente.tsx      Ficha y contexto de cada cliente
    Panel.tsx             Resumen de todos los clientes y objetivos
    SalidaDelDia.tsx      Reparto de la jornada al fichar la salida
    MensajesDirectos.tsx  Conversaciones privadas entre compañeros
    Logo.tsx              Logotipo de 21days agency
  ../public/              Iconos y manifest para instalarla en el móvil
  lib/
    excel/                Los libros de Excel: estilo común, tiempos y fichajes
    subir.ts              Subida por partes de archivos grandes, con avance
    prioridad.ts          Los cuatro niveles de prioridad y su orden
    supabase/             Clientes de Supabase (navegador, servidor, middleware)
    brand.ts              Nombre, bajada y logo de la marca
    types.ts, format.ts   Tipos y formateo de fechas
supabase/
  schema.sql              Tablas, permisos, tiempo real
  seed.sql                Datos de ejemplo (opcional)
  functions/transcribir/  Voz a texto (instalada, sin botón en la aplicación)
```

### Dar de baja a alguien

Cuando alguien deja el equipo **no se borra su cuenta**: su historial (mensajes, fichajes,
cronómetros) cuelga de su perfil con borrado en cascada, así que eliminarlo se lo llevaría por
delante. Se le marca como inactivo, que lo saca de todas las listas de la app, y se le bloquea la
entrada:

```sql
update public.profiles set active = false where lower(email) = 'correo@ejemplo.com';
update auth.users set banned_until = 'infinity' where lower(email) = 'correo@ejemplo.com';
delete from auth.sessions
 where user_id in (select id from auth.users where lower(email) = 'correo@ejemplo.com');
```

Para readmitir a alguien, `active = true` y `banned_until = null`.

### Quién es administrador

Los administradores son los únicos que ven los *Informes de tiempo* y el fichaje de todo el
equipo. No se marcan a mano: van por correo, en la tabla `admin_emails`. Para nombrar a alguien,
en Supabase → **SQL Editor**:

```sql
insert into public.admin_emails (email, note)
values ('correo@ejemplo.com', 'Nombre y apellido')
on conflict (email) do nothing;

-- si esa persona ya tenía cuenta, esto la asciende
update public.profiles p set role = 'admin'
 where lower(p.email) = 'correo@ejemplo.com';
```

Si todavía no se ha registrado, no hace falta el segundo paso: entrará como administradora el día
que se dé de alta.

### Permisos

Bitácora es una herramienta interna: **cualquier trabajador autenticado ve y edita el trabajo de
todos los clientes**. Lo que sí está protegido por RLS:

- los fichajes → cada uno solo ve y ficha los suyos (el administrador ve los de todos);
- los cronómetros y los informes de tiempo → cada uno ve los suyos y los administradores, los de
  todo el equipo; el apartado *Informes* ni siquiera aparece si no eres administrador;
- borrar clientes → solo administradores;
- los mensajes directos → solo los dos que hablan; nadie más los lee, ni el administrador;
- editar o borrar mensajes y comentarios → solo su autor (o un administrador);
- sin sesión no se lee absolutamente nada.

Si en algún momento hiciera falta que cada trabajador viera solo sus clientes, se cambia en las
políticas de `schema.sql` apoyándose en la tabla `client_members`.

---

## Cambiar la identidad de 21days agency

Todo el color y la tipografía salen de un único sitio, así que la marca se cambia sin tocar
componentes:

- **Colores** — bloque `Identidad 21days agency` al principio de `src/app/globals.css`
  (`--accent`, `--ink`, `--bg`… y sus equivalentes en modo oscuro).
- **Tipografía** — variables `--font-display` y `--font-body` en ese mismo bloque.
- **Logotipo** — `src/components/Logo.tsx`. Ahora lleva una marca provisional dibujada con los
  colores del tema. Para poner el logo real, deja el SVG en `public/logo-decasight.svg` y cambia
  el componente por `<img src={BRAND.logo} alt={BRAND.logoAlt} className="rail__logo" />`.
- **Nombres y textos de marca** — `src/lib/brand.ts`.

## Quién puede entrar

No hay alta pública: la pantalla de entrada solo deja iniciar sesión, con contraseña o con un
enlace por correo, y ese enlace no crea cuentas (`shouldCreateUser: false`). Las cuentas las da de
alta un administrador desde Supabase.

Eso no se queda en la pantalla, que sería un candado de cartón: la aplicación está abierta en
internet y la clave publicable de Supabase viaja dentro del JavaScript, como es normal. Lo que
protege los datos son las políticas de la base de datos. Cada tabla de la aplicación lleva una
política **restrictiva** (`<tabla>_solo_equipo`) que se suma con Y a las demás y exige
`public.es_equipo()`: tener una ficha de equipo **activa**. Estar autenticado ya no basta.

Y quien consiguiera registrarse por otra vía entra **desactivado**, salvo que su correo sea de
`@21daysagency.com` o esté en `admin_emails`. Tendría sesión y no vería absolutamente nada hasta
que un administrador lo activase.

## Cómo se publica

La aplicación vive en Vercel, proyecto `bitacora` del equipo 21DAYS, y se publica en
**https://bitacora-ashy.vercel.app**. Esa es la dirección buena; hay otros alias
(`bitacora-21-days1.vercel.app`) que apuntan a versiones antiguas y conviene no usarlos.

La rama de producción es `claude/decasight-interactive-landing-xa9ijw`: cada commit que llega ahí
se construye y se publica solo.

**Cuidado con subir el mismo commit a dos ramas.** Vercel construye un commit una sola vez: si la
misma huella llega antes por una rama de borradores, la construye como *Preview* y, cuando después
llega a la rama de producción, ya no la vuelve a construir — se queda en *Preview* y la web sigue
sirviendo la versión anterior, sin ningún error que lo avise. Costó una tarde descubrirlo. Si se
trabaja en una rama aparte, **súbela primero a la de producción** y después a la otra.

Para arreglar una versión que se quedó en *Preview*, en el panel de Vercel: *Deployments*, los tres
puntos de esa línea, **Promote to Production**.

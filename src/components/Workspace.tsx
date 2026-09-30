"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Rail from "./Rail";
import type { Vista } from "./Rail";
import Chat from "./Chat";
import NewClientDialog from "./NewClientDialog";
import Resumen from "./Resumen";
import FichaCliente from "./FichaCliente";
import Informes from "./Informes";
import Panel from "./Panel";
import MiPanel from "./MiPanel";
import Agenda from "./Agenda";
import MiCuenta from "./MiCuenta";
import AgendaTrabajo from "./AgendaTrabajo";
import AvisoSonido from "./AvisoSonido";
import { sonarAviso } from "@/lib/aviso";
import Tareas from "./Tareas";
import Claves from "./Claves";
import MensajesDirectos from "./MensajesDirectos";
import ThemeToggle from "./ThemeToggle";
import Stamp from "./Stamp";
import { createClient } from "@/lib/supabase/client";
import { BRAND } from "@/lib/brand";
import { ErrorDeSubida, MAX_MB, subirArchivo } from "@/lib/subir";
import type { Attachment, BoardColumn, Card, Message, Prioridad, Profile, WorkSession } from "@/lib/types";

type ClientRow = {
  id: string;
  name: string;
  kind: string;
  ref_prefix: string;
  position: number;
  archived: boolean;
  description: string;
  started_on: string | null;
  season: string;
  videos_per_month: number;
  contact: string;
  meet_url: string;
  drive_url: string;
  pinterest_url: string;
  priority: Prioridad;
  internal: boolean;
};
type MemberRow = { client_id: string; profile_id: string };
type AssigneeRow = { card_id: string; profile_id: string };
type CardRow = Omit<Card, "assignees">;
type ReadRow = { client_id: string; profile_id: string; last_read_at: string };
type ChatStateRow = { client_id: string; last_message_at: string | null };

export type InitialData = {
  me: Profile;
  profiles: Profile[];
  clients: ClientRow[];
  members: MemberRow[];
  columns: BoardColumn[];
  cards: CardRow[];
  assignees: AssigneeRow[];
  reads: ReadRow[];
  chatState: ChatStateRow[];
};

function mergeAssignees(cards: CardRow[], assignees: AssigneeRow[]): Card[] {
  const byCard = new Map<string, string[]>();
  for (const a of assignees) {
    const list = byCard.get(a.card_id);
    if (list) list.push(a.profile_id);
    else byCard.set(a.card_id, [a.profile_id]);
  }
  return cards.map((c) => ({ ...c, assignees: byCard.get(c.id) ?? [] }));
}

export default function Workspace({ initial }: { initial: InitialData }) {
  const supabase = useMemo(() => createClient(), []);
  const me = initial.me;

  const [profiles, setProfiles] = useState<Profile[]>(initial.profiles);
  const [clients, setClients] = useState<ClientRow[]>(initial.clients);
  const [members, setMembers] = useState<MemberRow[]>(initial.members);
  const [columns, setColumns] = useState<BoardColumn[]>(initial.columns);
  const [cards, setCards] = useState<Card[]>(() => mergeAssignees(initial.cards, initial.assignees));

  /**
   * Cuándo escribió **otra persona** por última vez en cada canal. Lo propio no
   * cuenta: si contara, el canal del equipo estaría siempre en negrita por tus
   * propios mensajes y la negrita dejaría de significar nada.
   */
  const [lastMsgAt, setLastMsgAt] = useState<Record<string, string | null>>({});
  const [reads, setReads] = useState<Record<string, string>>(() =>
    Object.fromEntries(initial.reads.map((r) => [r.client_id, r.last_read_at])),
  );
  /**
   * Última vez que alguien puso o tocó una tarea en cada canal. Va junto con
   * `lastMsgAt` para decidir si el canal sale en negrita: da igual si la
   * novedad es un mensaje o una tarea, lo que importa es que hay algo nuevo.
   */
  const [lastTaskAt, setLastTaskAt] = useState<Record<string, string>>({});

  const [activeId, setActiveId] = useState<string | null>(initial.clients[0]?.id ?? null);
  const [tab, setTab] = useState<"chat" | "tareas" | "claves">("tareas");
  const [railOpen, setRailOpen] = useState(false);
  const [newClientOpen, setNewClientOpen] = useState(false);

  const [messagesByClient, setMessagesByClient] = useState<Record<string, Message[]>>({});
  const [attachmentsByMessage, setAttachmentsByMessage] = useState<Record<string, Attachment[]>>({});
  const [loadingChat, setLoadingChat] = useState(false);
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());
  const [uploading, setUploading] = useState<string | null>(null);
  const [progreso, setProgreso] = useState<number | null>(null);
  const [pendingTasks, setPendingTasks] = useState(0);
  const [tareasAtrasadas, setTareasAtrasadas] = useState(0);
  /** Pendientes por cliente, para el número del listado de la izquierda. */
  const [pendientesPorCliente, setPendientesPorCliente] = useState<Record<string, number>>({});
  const [vista, setVista] = useState<Vista>("cliente");
  const [dmUnread, setDmUnread] = useState(0);
  const [fichaAbierta, setFichaAbierta] = useState(false);
  const [cuentaAbierta, setCuentaAbierta] = useState(false);

  /**
   * Mensajes directos sin leer. Se cuenta aquí arriba para que el aviso del
   * panel izquierdo salga aunque no estés en la vista de mensajes.
   */
  useEffect(() => {
    async function contar() {
      const { count } = await supabase
        .from("dm_messages")
        .select("id", { count: "exact", head: true })
        .eq("recipient_id", me.id)
        .is("read_at", null);
      setDmUnread(count ?? 0);
    }
    void contar();
    const canal = supabase
      .channel("dm-aviso")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "dm_messages" }, (payload) => {
        const fila = payload.new as { recipient_id: string };
        if (fila.recipient_id === me.id) sonarAviso();
        void contar();
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "dm_messages" }, () => {
        void contar();
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(canal);
    };
  }, [supabase, me.id]);

  const profileById = useMemo(
    () => Object.fromEntries(profiles.map((p) => [p.id, p])) as Record<string, Profile>,
    [profiles],
  );

  const activeClient = useMemo(
    () => clients.find((c) => c.id === activeId) ?? null,
    [clients, activeId],
  );
  const activeColumns = useMemo(
    () => columns.filter((c) => c.client_id === activeId).sort((a, b) => a.position - b.position),
    [columns, activeId],
  );
  const activeCards = useMemo(
    () => cards.filter((c) => c.client_id === activeId).sort((a, b) => a.position - b.position),
    [cards, activeId],
  );
  const activeMembers = useMemo(
    () =>
      members
        .filter((m) => m.client_id === activeId)
        .map((m) => profileById[m.profile_id])
        .filter(Boolean),
    [members, activeId, profileById],
  );

  const isUnread = useCallback(
    (clientId: string) => {
      if (clientId === activeId && tab === "chat") return false;
      const last = lastMsgAt[clientId];
      if (!last) return false;
      const read = reads[clientId];
      if (!read) return true;
      return new Date(last).getTime() > new Date(read).getTime();
    },
    [activeId, tab, lastMsgAt, reads],
  );

  /**
   * Qué hay de nuevo en un canal desde la última vez que se abrió: un mensaje,
   * una tarea, o las dos cosas. Se distingue para poder enseñar el icono que
   * toca en el listado, en vez de un punto que no dice nada.
   */
  const novedadesDe = useCallback(
    (clientId: string) => {
      if (clientId === activeId) return { chat: false, tarea: false };
      const read = reads[clientId] ? new Date(reads[clientId]).getTime() : 0;
      const masNuevo = (f: string | null | undefined) =>
        !!f && new Date(f).getTime() > read;
      return { chat: masNuevo(lastMsgAt[clientId]), tarea: masNuevo(lastTaskAt[clientId]) };
    },
    [activeId, reads, lastMsgAt, lastTaskAt],
  );

  // Se da por cerrado lo que llega a la última columna del tablero (hoy,
  // Report). Va por posición y no por nombre, para que siga valiendo si
  // algún día se renombran o se añaden columnas.
  const doneColumnIds = useMemo(() => {
    const ultimaPorCliente = new Map<string, { id: string; position: number }>();
    for (const c of columns) {
      const actual = ultimaPorCliente.get(c.client_id);
      if (!actual || c.position > actual.position) {
        ultimaPorCliente.set(c.client_id, { id: c.id, position: c.position });
      }
    }
    return new Set([...ultimaPorCliente.values()].map((c) => c.id));
  }, [columns]);

  const activeDoneColumnId = useMemo(
    () => activeColumns.at(-1)?.id ?? null,
    [activeColumns],
  );

  const railClients = useMemo(
    () =>
      clients.map((c) => ({
        id: c.id,
        name: c.name,
        kind: c.kind,
        internal: c.internal,
        // El número de la derecha son sus tareas pendientes. Antes contaba
        // tarjetas del tablero, que ya no existe: enseñaba un número de algo
        // que nadie podía abrir.
        openCount: pendientesPorCliente[c.id] ?? 0,
        ...novedadesDe(c.id),
      })),
    [clients, pendientesPorCliente, novedadesDe],
  );

  // ---------------------------------------------------------------- recargas
  const refreshCards = useCallback(async () => {
    const [cardsRes, assigneesRes] = await Promise.all([
      supabase.from("cards").select("*").order("position"),
      supabase.from("card_assignees").select("*"),
    ]);
    if (cardsRes.data) {
      setCards(mergeAssignees(cardsRes.data as CardRow[], (assigneesRes.data ?? []) as AssigneeRow[]));
    }
  }, [supabase]);

  const refreshClients = useCallback(async () => {
    const [clientsRes, membersRes, columnsRes, profilesRes] = await Promise.all([
      supabase.from("clients").select("*").eq("archived", false).order("position").order("name"),
      supabase.from("client_members").select("*"),
      supabase.from("board_columns").select("*").order("position"),
      supabase.from("profiles").select("*").eq("active", true).order("full_name"),
    ]);
    if (clientsRes.data) setClients(clientsRes.data as ClientRow[]);
    if (membersRes.data) setMembers(membersRes.data as MemberRow[]);
    if (columnsRes.data) setColumns(columnsRes.data as BoardColumn[]);
    if (profilesRes.data) setProfiles(profilesRes.data as Profile[]);
  }, [supabase]);

  // ------------------------------------------------------------ cronómetros

  /** Quién está ahora mismo en cada tarjeta, para marcarlo en el tablero. */

  const cardTitles = useMemo(
    () => Object.fromEntries(cards.map((c) => [c.id, c.title])) as Record<string, string>,
    [cards],
  );

  const clientNames = useMemo(
    () => Object.fromEntries(clients.map((c) => [c.id, c.name])) as Record<string, string>,
    [clients],
  );

  // --------------------------------------------------------------- realtime
  const mergeAttachments = useCallback((files: Attachment[]) => {
    setAttachmentsByMessage((prev) => {
      const next = { ...prev };
      for (const f of files) {
        const list = next[f.message_id] ?? [];
        if (!list.some((x) => x.id === f.id)) next[f.message_id] = [...list, f];
      }
      return next;
    });
  }, []);

  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scheduleCardRefresh = useCallback(() => {
    if (refreshTimer.current) clearTimeout(refreshTimer.current);
    refreshTimer.current = setTimeout(() => void refreshCards(), 250);
  }, [refreshCards]);

  const upsertMessage = useCallback((clientId: string, msg: Message, tempId?: string) => {
    setMessagesByClient((prev) => {
      const list = prev[clientId];
      if (!list) return prev;
      const withoutTemp = tempId ? list.filter((m) => m.id !== tempId) : list;
      if (withoutTemp.some((m) => m.id === msg.id)) {
        return { ...prev, [clientId]: withoutTemp };
      }
      const next = [...withoutTemp, msg].sort((a, b) => a.created_at.localeCompare(b.created_at));
      return { ...prev, [clientId]: next };
    });
  }, []);

  useEffect(() => {
    const channel = supabase
      .channel("bitacora")
      .on("postgres_changes", { event: "*", schema: "public", table: "cards" }, scheduleCardRefresh)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "card_assignees" },
        scheduleCardRefresh,
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "clients" }, () => {
        void refreshClients();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "board_columns" }, () => {
        void refreshClients();
      })
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages" },
        (payload) => {
          const row = payload.new as Message;
          upsertMessage(row.client_id, row);
          // Lo propio ni suena ni pone el canal en negrita: ya sabes que has
          // escrito tú.
          if (row.author_id !== me.id) {
            setLastMsgAt((prev) => ({ ...prev, [row.client_id]: row.created_at }));
            sonarAviso();
          }
        },
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "message_attachments" },
        (payload) => {
          mergeAttachments([payload.new as Attachment]);
        },
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "work_sessions" }, () => {
      })
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "messages" },
        (payload) => {
          const row = payload.new as Message;
          setMessagesByClient((prev) => ({
            ...prev,
            [row.client_id]: (prev[row.client_id] ?? []).map((m) => (m.id === row.id ? row : m)),
          }));
        },
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "messages" },
        (payload) => {
          const viejo = payload.old as { id: string };
          setMessagesByClient((prev) => {
            const next: Record<string, Message[]> = {};
            for (const [id, lista] of Object.entries(prev)) {
              next[id] = lista.filter((m) => m.id !== viejo.id);
            }
            return next;
          });
        },
      )
      .subscribe();

    return () => {
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
      void supabase.removeChannel(channel);
    };
  }, [supabase, scheduleCardRefresh, refreshClients, upsertMessage, mergeAttachments]);

  // ------------------------------------------------------------------- chat
  // Clientes cuyo chat ya está cargado. En una ref y no en el estado para que
  // el efecto que dispara la carga no se rehaga con cada mensaje nuevo.
  const loadedChats = useRef<Set<string>>(new Set());

  const loadMessages = useCallback(
    async (clientId: string) => {
      if (loadedChats.current.has(clientId)) return;
      setLoadingChat(true);
      const { data, error } = await supabase
        .from("messages")
        .select("*")
        .eq("client_id", clientId)
        .order("created_at", { ascending: false })
        .limit(200);
      setLoadingChat(false);

      // Si falla no marcamos el chat como cargado: así se reintenta al volver
      // a entrar, en vez de quedarse vacío para siempre.
      if (error || !data) return;

      loadedChats.current.add(clientId);
      setMessagesByClient((prev) => ({ ...prev, [clientId]: (data as Message[]).slice().reverse() }));

      const { data: files } = await supabase
        .from("message_attachments")
        .select("*")
        .eq("client_id", clientId);
      if (files) mergeAttachments(files as Attachment[]);
    },
    [supabase, mergeAttachments],
  );

  const markRead = useCallback(
    async (clientId: string) => {
      const now = new Date().toISOString();
      setReads((prev) => ({ ...prev, [clientId]: now }));
      await supabase
        .from("chat_reads")
        .upsert(
          { client_id: clientId, profile_id: me.id, last_read_at: now },
          { onConflict: "client_id,profile_id" },
        );
    },
    [supabase, me.id],
  );

  const activeMessages = activeId ? (messagesByClient[activeId] ?? []) : [];
  const activeMessageCount = activeMessages.length;

  useEffect(() => {
    if (!activeId) return;
    let vigente = true;
    void (async () => {
      const hoy = new Date().toISOString().slice(0, 10);
      const { data } = await supabase
        .from("client_tasks")
        .select("due_date")
        .eq("client_id", activeId)
        .eq("done", false);
      if (!vigente) return;
      const filas = (data ?? []) as { due_date: string | null }[];
      setPendingTasks(filas.length);
      setTareasAtrasadas(filas.filter((t) => t.due_date && t.due_date < hoy).length);
    })();
    return () => {
      vigente = false;
    };
  }, [activeId, supabase]);

  /**
   * Cuándo escribió otra persona por última vez en cada canal. Se pide una vez
   * al entrar; después lo mantiene al día el realtime.
   */
  useEffect(() => {
    void (async () => {
      const { data } = await supabase
        .from("messages")
        .select("client_id, created_at")
        .neq("author_id", me.id)
        .order("created_at", { ascending: false })
        .limit(1000);
      if (!data) return;
      const mapa: Record<string, string> = {};
      for (const f of data as { client_id: string; created_at: string }[]) {
        // Vienen de más nuevo a más viejo: el primero de cada canal es el suyo.
        if (!mapa[f.client_id]) mapa[f.client_id] = f.created_at;
      }
      setLastMsgAt(mapa);
    })();
  }, [supabase, me.id]);

  /**
   * Cuándo se movió por última vez una tarea en cada canal. Se pide una vez y
   * después se va actualizando con lo que llegue por realtime.
   */
  useEffect(() => {
    const resumir = (filas: { client_id: string; created_at: string }[]) => {
      const mapa: Record<string, string> = {};
      for (const f of filas) {
        if (!mapa[f.client_id] || f.created_at > mapa[f.client_id]) mapa[f.client_id] = f.created_at;
      }
      setLastTaskAt(mapa);
    };
    void (async () => {
      const { data } = await supabase
        .from("client_tasks")
        .select("client_id, created_at, done, author_id");
      if (data) {
        const filas = data as {
          client_id: string;
          created_at: string;
          done: boolean;
          author_id: string | null;
        }[];
        // Para la negrita solo cuenta lo que ha puesto otra persona.
        resumir(filas.filter((f) => f.author_id !== me.id));
        const cuenta: Record<string, number> = {};
        for (const f of filas) {
          if (!f.done) cuenta[f.client_id] = (cuenta[f.client_id] ?? 0) + 1;
        }
        setPendientesPorCliente(cuenta);
      }
    })();

    const canal = supabase
      .channel("novedades-tareas")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "client_tasks" },
        (payload) => {
          const fila = payload.new as {
            client_id: string;
            created_at: string;
            author_id: string | null;
          };
          if (fila.author_id === me.id) return;
          setLastTaskAt((prev) => ({ ...prev, [fila.client_id]: fila.created_at }));
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(canal);
    };
  }, [supabase, me.id]);

  // Abrir el canal da lo de dentro por visto, sea la pestaña que sea: así la
  // negrita se quita igual si la novedad era un mensaje o una tarea.
  useEffect(() => {
    if (!activeId || vista !== "cliente") return;
    void markRead(activeId);
  }, [activeId, vista, markRead]);

  useEffect(() => {
    if (!activeId || tab !== "chat") return;
    void loadMessages(activeId);
  }, [activeId, tab, loadMessages]);

  /**
   * Red de seguridad del chat.
   * -------------------------------------------------------------------------
   * Lo normal es que los mensajes lleguen solos por tiempo real. Pero ese
   * socket se cae con el wifi, al bloquear el móvil o al dejar la pestaña de
   * fondo un rato, y cuando vuelve no siempre trae lo que se perdió. Con esto
   * se piden los mensajes nuevos cada pocos segundos mientras el chat está
   * abierto, y de golpe al volver a la pestaña. Nadie tiene que recargar.
   */
  const traerNuevos = useCallback(
    async (clientId: string) => {
      const lista = messagesByClient[clientId] ?? [];
      const ultimo = lista.at(-1)?.created_at;
      let q = supabase.from("messages").select("*").eq("client_id", clientId);
      // Sin nada cargado se piden los 200 más recientes, no los 200 más viejos.
      q = ultimo
        ? q.gt("created_at", ultimo)
        : q.order("created_at", { ascending: false }).limit(200);
      const { data } = await q;
      if (!data || data.length === 0) return;
      for (const m of data as Message[]) upsertMessage(clientId, m);
      const ids = (data as Message[]).map((m) => m.id);
      const { data: files } = await supabase
        .from("message_attachments")
        .select("*")
        .in("message_id", ids);
      if (files) mergeAttachments(files as Attachment[]);
    },
    [supabase, messagesByClient, upsertMessage, mergeAttachments],
  );

  const traerNuevosRef = useRef(traerNuevos);
  traerNuevosRef.current = traerNuevos;

  useEffect(() => {
    if (!activeId || tab !== "chat" || vista !== "cliente") return;
    const id = activeId;
    const reloj = setInterval(() => void traerNuevosRef.current(id), 12000);
    const alVolver = () => {
      if (document.visibilityState === "visible") void traerNuevosRef.current(id);
    };
    document.addEventListener("visibilitychange", alVolver);
    window.addEventListener("focus", alVolver);
    return () => {
      clearInterval(reloj);
      document.removeEventListener("visibilitychange", alVolver);
      window.removeEventListener("focus", alVolver);
    };
  }, [activeId, tab, vista]);

  useEffect(() => {
    if (!activeId || tab !== "chat") return;
    void markRead(activeId);
    // Se vuelve a marcar al llegar mensajes nuevos con el chat abierto.
  }, [activeId, tab, activeMessageCount, markRead]);

  /**
   * Manda el mensaje y, si lleva archivos, los sube al bucket `adjuntos`.
   * Los ficheros van tal cual: mismo nombre, mismo tipo, sin recomprimir, así
   * que un vídeo 4K o un Excel se descargan idénticos a como se subieron.
   */
  async function sendMessage(body: string, files: File[] = [], mentions: string[] = []) {
    if (!activeId) return;
    const clientId = activeId;
    const tempId = `temp-${Math.random().toString(36).slice(2)}`;
    const optimistic: Message = {
      id: tempId,
      client_id: clientId,
      author_id: me.id,
      body,
      created_at: new Date().toISOString(),
      edited_at: null,
      mentions,
      source: "app",
      external_author: "",
    };
    setPendingIds((prev) => new Set(prev).add(tempId));
    setMessagesByClient((prev) => ({ ...prev, [clientId]: [...(prev[clientId] ?? []), optimistic] }));
    if (files.length > 0) setUploading(`Subiendo ${files.length} archivo${files.length > 1 ? "s" : ""}…`);

    const { data, error } = await supabase
      .from("messages")
      .insert({ client_id: clientId, author_id: me.id, body, mentions })
      .select("*")
      .single();

    if (error || !data) {
      setPendingIds((prev) => {
        const next = new Set(prev);
        next.delete(tempId);
        return next;
      });
      setUploading(null);
      setMessagesByClient((prev) => ({
        ...prev,
        [clientId]: (prev[clientId] ?? []).filter((m) => m.id !== tempId),
      }));
      alert("No se ha podido enviar el mensaje. Comprueba tu conexión y vuelve a intentarlo.");
      return;
    }

    const saved = data as Message;

    const fallidos: string[] = [];
    let algunoPorTamaño = false;
    for (const [i, file] of files.entries()) {
      const cuenta = files.length > 1 ? `${i + 1} de ${files.length} · ` : "";
      setUploading(`Subiendo ${cuenta}${file.name}`);
      setProgreso(0);
      const limpio = file.name.replace(/[^\w.\-]+/g, "_");
      const path = `${clientId}/${saved.id}/${crypto.randomUUID()}-${limpio}`;
      try {
        await subirArchivo("adjuntos", path, file, (a) => {
          setProgreso(a.parte);
          setUploading(
            `Subiendo ${cuenta}${file.name} · ${Math.round(a.parte * 100)}%`,
          );
        });
      } catch (e) {
        const motivo = e instanceof ErrorDeSubida ? e.message : "error inesperado";
        if (e instanceof ErrorDeSubida && e.porTamaño) algunoPorTamaño = true;
        fallidos.push(`${file.name} (${motivo})`);
        continue;
      }
      const { data: fila } = await supabase
        .from("message_attachments")
        .insert({
          message_id: saved.id,
          client_id: clientId,
          path,
          name: file.name,
          mime: file.type || "application/octet-stream",
          size_bytes: file.size,
        })
        .select("*")
        .single();
      if (fila) mergeAttachments([fila as Attachment]);
    }

    setUploading(null);
    setProgreso(null);
    setPendingIds((prev) => {
      const next = new Set(prev);
      next.delete(tempId);
      return next;
    });

    upsertMessage(clientId, saved, tempId);
    setLastMsgAt((prev) => ({ ...prev, [clientId]: saved.created_at }));

    if (fallidos.length > 0) {
      const cola = algunoPorTamaño
        ? `\n\nEl proyecto de Supabase admite como mucho ${MAX_MB} MB por archivo. Para vídeos más grandes hay que subir el plan de Supabase (Storage → Settings → Global file size limit) o pasar el vídeo por Drive y pegar aquí el enlace.`
        : "\n\nEl mensaje se ha guardado. Vuelve a arrastrar el archivo para reintentar solo la subida.";
      alert(`No se han podido subir:\n· ${fallidos.join("\n· ")}${cola}`);
    }
  }

  async function editMessage(messageId: string, body: string) {
    const antes = messagesByClient;
    setMessagesByClient((prev) => {
      const next: Record<string, Message[]> = {};
      for (const [id, lista] of Object.entries(prev)) {
        next[id] = lista.map((m) =>
          m.id === messageId ? { ...m, body, edited_at: new Date().toISOString() } : m,
        );
      }
      return next;
    });
    const { error } = await supabase
      .from("messages")
      .update({ body, edited_at: new Date().toISOString() })
      .eq("id", messageId);
    if (error) {
      setMessagesByClient(antes);
      alert("No se ha podido editar el mensaje.");
    }
  }

  async function deleteMessage(messageId: string) {
    const antes = messagesByClient;
    setMessagesByClient((prev) => {
      const next: Record<string, Message[]> = {};
      for (const [id, lista] of Object.entries(prev)) {
        next[id] = lista.filter((m) => m.id !== messageId);
      }
      return next;
    });
    const { error } = await supabase.from("messages").delete().eq("id", messageId);
    if (error) {
      setMessagesByClient(antes);
      alert("No se ha podido borrar el mensaje.");
    }
  }

  // --------------------------------------------------------------- tarjetas
  // --------------------------------------------------------------- clientes
  async function createClientRecord(name: string, kind: string, prefix: string) {
    const { data, error } = await supabase.rpc("create_client", {
      p_name: name,
      p_kind: kind,
      p_prefix: prefix || null,
    });
    if (error) return error.message;
    await refreshClients();
    const created = data as ClientRow | null;
    if (created?.id) {
      setActiveId(created.id);
      setTab("tareas");
    }
    setNewClientOpen(false);
    return null;
  }

  /**
   * Borra un canal entero. Se lleva por delante su tablero, su chat y sus
   * tareas, así que se pide confirmación escribiendo el nombre.
   */
  async function deleteClient(clientId: string) {
    const cliente = clients.find((c) => c.id === clientId);
    if (!cliente) return;
    const escrito = prompt(
      `Esto borra el canal "${cliente.name}" con TODO lo suyo: tablero, tarjetas, chat, ` +
        `archivos adjuntos y tareas. No tiene vuelta atrás.\n\n` +
        `Escribe el nombre del canal para confirmarlo:`,
    );
    if (escrito === null) return;
    if (escrito.trim().toLowerCase() !== cliente.name.trim().toLowerCase()) {
      alert("El nombre no coincide. No se ha borrado nada.");
      return;
    }
    const { error } = await supabase.from("clients").delete().eq("id", clientId);
    if (error) {
      alert(
        `No se ha podido borrar: ${error.message}\n\n` +
          `Borrar canales es cosa de administradores.`,
      );
      return;
    }
    setClients((prev) => prev.filter((c) => c.id !== clientId));
    setFichaAbierta(false);
    if (activeId === clientId) {
      setActiveId((prev) => clients.find((c) => c.id !== prev)?.id ?? null);
    }
  }

  async function toggleMembership() {
    if (!activeId) return;
    const mine = members.some((m) => m.client_id === activeId && m.profile_id === me.id);
    if (mine) {
      setMembers((prev) => prev.filter((m) => !(m.client_id === activeId && m.profile_id === me.id)));
      await supabase
        .from("client_members")
        .delete()
        .eq("client_id", activeId)
        .eq("profile_id", me.id);
    } else {
      setMembers((prev) => [...prev, { client_id: activeId, profile_id: me.id }]);
      await supabase.from("client_members").insert({ client_id: activeId, profile_id: me.id });
    }
  }
  const iAmMember = !!activeId && members.some((m) => m.client_id === activeId && m.profile_id === me.id);

  return (
    <div className="app">
      <Rail
        clients={railClients}
        activeId={activeId}
        me={me}
        profiles={profiles}
        open={railOpen}
        onSelect={(id) => {
          setActiveId(id);
          setVista("cliente");
          setFichaAbierta(false);
          setRailOpen(false);
        }}
        onNewClient={() => {
          setNewClientOpen(true);
          setRailOpen(false);
        }}
        onClose={() => setRailOpen(false)}
        onMiCuenta={() => {
          setRailOpen(false);
          setCuentaAbierta(true);
        }}
        puedeBorrar={me.role === "admin"}
        onBorrarCliente={(id) => void deleteClient(id)}
        vista={vista}
        dmUnread={dmUnread}
        onVista={(v) => {
          setVista(v === "informes" && me.role !== "admin" ? "cliente" : v);
          setRailOpen(false);
        }}
      />

      <main className="main">
        <header className="main__header">
          <div>
            <div className="main__title-row">
              <button
                className="rail-toggle"
                onClick={() => setRailOpen((o) => !o)}
                aria-label="Mostrar clientes"
              >
                ☰
              </button>
              <div className="main__titulo-caja">
                {vista === "cliente" && activeClient ? (
                  <button
                    type="button"
                    className="main__title main__title--boton"
                    onClick={() => setFichaAbierta((o) => !o)}
                    aria-expanded={fichaAbierta}
                    title="Ver la ficha del cliente"
                  >
                    {activeClient.name}
                    <span className="main__title-chevron" aria-hidden>
                      ▾
                    </span>
                  </button>
                ) : (
                  <div className="main__title">
                    {vista === "informes"
                      ? "Informes"
                      : vista === "dm"
                        ? "Mensajes directos"
                        : vista === "panel"
                          ? "Panel de clientes"
                          : vista === "mias"
                            ? "Tareas del equipo"
                            : vista === "agenda"
                              ? "Mi agenda"
                              : BRAND.company}
                  </div>
                )}
                <div className="main__kind">
                  {vista === "informes"
                    ? "Tiempo por cliente y fase"
                    : vista === "dm"
                      ? "Conversaciones privadas del equipo"
                      : vista === "panel"
                        ? "Qué hay abierto y qué toca cerrar antes"
                        : vista === "mias"
                          ? "Qué lleva cada uno y para cuándo"
                          : vista === "agenda"
                            ? "Lo tuyo a un lado, el trabajo al otro"
                            : (activeClient?.kind ?? "Sin cliente seleccionado")}
                </div>

                {fichaAbierta && activeClient && vista === "cliente" && (
                  <FichaCliente
                    client={activeClient}
                    onSaved={(cambios) =>
                      setClients((prev) =>
                        prev.map((c) => (c.id === activeClient.id ? { ...c, ...cambios } : c)),
                      )
                    }
                    onClose={() => setFichaAbierta(false)}
                    puedeBorrar={me.role === "admin"}
                    onBorrar={() => void deleteClient(activeClient.id)}
                  />
                )}
              </div>
            </div>
            {activeClient && vista === "cliente" && (
              <nav className="tabs">
                <button
                  className={tab === "chat" ? "tab is-active" : "tab"}
                  onClick={() => setTab("chat")}
                >
                  Chat
                  {isUnread(activeClient.id) && <span className="tab-flag" />}
                </button>
                <button
                  className={tab === "tareas" ? "tab is-active" : "tab"}
                  onClick={() => setTab("tareas")}
                >
                  Tareas
                  {pendingTasks > 0 && <span className="count-chip tab-count">{pendingTasks}</span>}
                </button>
                <button
                  className={tab === "claves" ? "tab is-active" : "tab"}
                  onClick={() => setTab("claves")}
                >
                  Claves
                </button>
              </nav>
            )}
          </div>

          {vista === "cliente" && activeClient && (
            <Resumen
              key={activeClient.id}
              clientId={activeClient.id}
              pendingTasks={pendingTasks}
              tareasAtrasadas={tareasAtrasadas}
              me={me}
            />
          )}

          <div className="main__actions">
            <AvisoSonido />
            {activeClient && vista === "cliente" && activeClient.drive_url && (
              <a
                className="btn"
                href={activeClient.drive_url}
                target="_blank"
                rel="noopener noreferrer"
                title="Abrir la carpeta de Drive de este cliente"
              >
                Entrar al Drive
              </a>
            )}
            {activeClient && vista === "cliente" && activeClient.pinterest_url && (
              <a
                className="btn"
                href={activeClient.pinterest_url}
                target="_blank"
                rel="noopener noreferrer"
                title="Abrir el tablero de Pinterest de este cliente"
              >
                Pinterest
              </a>
            )}
            {activeClient && vista === "cliente" && (
              <button
                type="button"
                onClick={toggleMembership}
                title={iAmMember ? "Dejar de seguir este cliente" : "Seguir este cliente"}
                style={{ border: "none", background: "none", padding: 0, cursor: "pointer" }}
              >
                <div className="avatar-stack">
                  {activeMembers.map((p) => (
                    <Stamp key={p.id} label={p.initials} color={p.color} title={p.full_name} foto={p.avatar_url} />
                  ))}
                  {!iAmMember && <Stamp label="+" color="var(--ink-faint)" title="Seguir este cliente" />}
                </div>
              </button>
            )}
            <ThemeToggle />
          </div>
        </header>

        {vista === "informes" && me.role === "admin" && (
          <Informes
            clientNames={clientNames}
            profileById={profileById}
            me={me}
          />
        )}

        {vista === "panel" && (
          <Panel
            clients={clients
              .filter((c) => !c.internal)
              .map((c) => ({
                id: c.id,
                name: c.name,
                kind: c.kind,
                priority: c.priority,
              }))}
            columns={columns}
            profileById={profileById}
            me={me}
            onAbrirCliente={(id) => {
              setActiveId(id);
              setVista("cliente");
              setTab("tareas");
            }}
            onPrioridadCliente={(id, priority) => {
              setClients((prev) => prev.map((c) => (c.id === id ? { ...c, priority } : c)));
              void supabase.from("clients").update({ priority }).eq("id", id);
            }}
          />
        )}

        {vista === "mias" && (
          <MiPanel
            me={me}
            profiles={profiles}
            clientNames={clientNames}
            onAbrirCliente={(id) => {
              setActiveId(id);
              setVista("cliente");
              setTab("tareas");
            }}
          />
        )}

        {cuentaAbierta && <MiCuenta me={me} onCerrar={() => setCuentaAbierta(false)} />}

        {vista === "agenda" && (
          <section className="agenda">
            <Agenda me={me} />
            <AgendaTrabajo
              me={me}
              clientNames={clientNames}
              onAbrirCliente={(id) => {
                setActiveId(id);
                setVista("cliente");
                setTab("tareas");
              }}
            />
          </section>
        )}

        {vista === "dm" && (
          <MensajesDirectos me={me} profiles={profiles} onUnread={setDmUnread} />
        )}

        {vista === "cliente" && !activeClient && (
          <div className="empty">
            Todavía no hay ningún cliente en la bitácora. Añade el primero con el botón <b>+</b> del
            panel de la izquierda.
          </div>
        )}

        {vista === "cliente" && activeClient && tab === "chat" && (
          <Chat
            clientId={activeClient.id}
            clientName={activeClient.name}
            members={activeMembers}
            meetUrl={activeClient.meet_url}
            onMeetUrl={(url) =>
              setClients((prev) =>
                prev.map((c) => (c.id === activeClient.id ? { ...c, meet_url: url } : c)),
              )
            }
            messages={activeMessages}
            attachmentsByMessage={attachmentsByMessage}
            profiles={profiles}
            profileById={profileById}
            me={me}
            loading={loadingChat && activeMessages.length === 0}
            pendingIds={pendingIds}
            uploading={uploading}
            progreso={progreso}
            onSend={sendMessage}
            onEdit={editMessage}
            onDelete={deleteMessage}
          />
        )}

        {vista === "cliente" && activeClient && tab === "claves" && (
          <Claves
            key={activeClient.id}
            clientId={activeClient.id}
            clientName={activeClient.name}
            me={me}
            profileById={profileById}
          />
        )}

        {vista === "cliente" && activeClient && tab === "tareas" && (
          <Tareas
            key={activeClient.id}
            clientId={activeClient.id}
            me={me}
            profiles={profiles}
            profileById={profileById}
            onCount={setPendingTasks}
          />
        )}
      </main>

      {newClientOpen && (
        <NewClientDialog onCancel={() => setNewClientOpen(false)} onCreate={createClientRecord} />
      )}
    </div>
  );
}

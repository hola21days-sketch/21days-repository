"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Rail from "./Rail";
import Board from "./Board";
import Chat from "./Chat";
import CardDrawer from "./CardDrawer";
import NewClientDialog from "./NewClientDialog";
import Resumen from "./Resumen";
import Informes from "./Informes";
import Tareas from "./Tareas";
import ThemeToggle from "./ThemeToggle";
import Stamp from "./Stamp";
import { createClient } from "@/lib/supabase/client";
import type { Attachment, BoardColumn, Card, Message, Profile, WorkSession } from "@/lib/types";

type ClientRow = {
  id: string;
  name: string;
  kind: string;
  ref_prefix: string;
  position: number;
  archived: boolean;
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

  const [lastMsgAt, setLastMsgAt] = useState<Record<string, string | null>>(() =>
    Object.fromEntries(initial.chatState.map((c) => [c.client_id, c.last_message_at])),
  );
  const [reads, setReads] = useState<Record<string, string>>(() =>
    Object.fromEntries(initial.reads.map((r) => [r.client_id, r.last_read_at])),
  );

  const [activeId, setActiveId] = useState<string | null>(initial.clients[0]?.id ?? null);
  const [tab, setTab] = useState<"board" | "chat" | "tareas">("board");
  const [railOpen, setRailOpen] = useState(false);
  const [openCardId, setOpenCardId] = useState<string | null>(null);
  const [newClientOpen, setNewClientOpen] = useState(false);

  const [messagesByClient, setMessagesByClient] = useState<Record<string, Message[]>>({});
  const [attachmentsByMessage, setAttachmentsByMessage] = useState<Record<string, Attachment[]>>({});
  const [loadingChat, setLoadingChat] = useState(false);
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());
  const [uploading, setUploading] = useState<string | null>(null);
  const [pendingTasks, setPendingTasks] = useState(0);
  const [vista, setVista] = useState<"cliente" | "informes">("cliente");
  const [openSessions, setOpenSessions] = useState<WorkSession[]>([]);

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
        openCount: cards.filter((cd) => cd.client_id === c.id && !doneColumnIds.has(cd.column_id))
          .length,
        unread: isUnread(c.id),
      })),
    [clients, cards, doneColumnIds, isUnread],
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
      supabase.from("profiles").select("*").order("full_name"),
    ]);
    if (clientsRes.data) setClients(clientsRes.data as ClientRow[]);
    if (membersRes.data) setMembers(membersRes.data as MemberRow[]);
    if (columnsRes.data) setColumns(columnsRes.data as BoardColumn[]);
    if (profilesRes.data) setProfiles(profilesRes.data as Profile[]);
  }, [supabase]);

  // ------------------------------------------------------------ cronómetros
  const refreshSessions = useCallback(async () => {
    const { data } = await supabase.from("work_sessions").select("*").is("ended_at", null);
    if (data) setOpenSessions(data as WorkSession[]);
  }, [supabase]);

  useEffect(() => {
    void refreshSessions();
  }, [refreshSessions]);

  const myOpenSession = useMemo(
    () => openSessions.find((s) => s.profile_id === me.id) ?? null,
    [openSessions, me.id],
  );

  /** Quién está ahora mismo en cada tarjeta, para marcarlo en el tablero. */
  const workingByCard = useMemo(() => {
    const mapa: Record<string, Profile[]> = {};
    for (const s of openSessions) {
      const quien = profileById[s.profile_id];
      if (!quien) continue;
      mapa[s.card_id] = [...(mapa[s.card_id] ?? []), quien];
    }
    return mapa;
  }, [openSessions, profileById]);

  const cardTitles = useMemo(
    () => Object.fromEntries(cards.map((c) => [c.id, c.title])) as Record<string, string>,
    [cards],
  );

  const clientNames = useMemo(
    () => Object.fromEntries(clients.map((c) => [c.id, c.name])) as Record<string, string>,
    [clients],
  );

  async function startWork(cardId: string) {
    const { error } = await supabase.rpc("start_work", { p_card_id: cardId });
    if (error) {
      alert("No se ha podido arrancar el cronómetro. Vuelve a intentarlo.");
      return;
    }
    await refreshSessions();
  }

  async function stopWork() {
    const { error } = await supabase.rpc("stop_work");
    if (error) {
      alert("No se ha podido parar el cronómetro. Vuelve a intentarlo.");
      return;
    }
    await refreshSessions();
  }

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
          setLastMsgAt((prev) => ({ ...prev, [row.client_id]: row.created_at }));
          upsertMessage(row.client_id, row);
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
        void refreshSessions();
      })
      .subscribe();

    return () => {
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
      void supabase.removeChannel(channel);
    };
  }, [supabase, scheduleCardRefresh, refreshClients, upsertMessage, mergeAttachments, refreshSessions]);

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
      const { count } = await supabase
        .from("client_tasks")
        .select("id", { count: "exact", head: true })
        .eq("client_id", activeId)
        .eq("done", false);
      if (vigente) setPendingTasks(count ?? 0);
    })();
    return () => {
      vigente = false;
    };
  }, [activeId, supabase]);

  useEffect(() => {
    if (!activeId || tab !== "chat") return;
    void loadMessages(activeId);
  }, [activeId, tab, loadMessages]);

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
  async function sendMessage(body: string, files: File[] = []) {
    if (!activeId) return;
    const clientId = activeId;
    const tempId = `temp-${Math.random().toString(36).slice(2)}`;
    const optimistic: Message = {
      id: tempId,
      client_id: clientId,
      author_id: me.id,
      body,
      created_at: new Date().toISOString(),
    };
    setPendingIds((prev) => new Set(prev).add(tempId));
    setMessagesByClient((prev) => ({ ...prev, [clientId]: [...(prev[clientId] ?? []), optimistic] }));
    if (files.length > 0) setUploading(`Subiendo ${files.length} archivo${files.length > 1 ? "s" : ""}…`);

    const { data, error } = await supabase
      .from("messages")
      .insert({ client_id: clientId, author_id: me.id, body })
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
    for (const [i, file] of files.entries()) {
      setUploading(`Subiendo ${i + 1} de ${files.length}: ${file.name}`);
      const limpio = file.name.replace(/[^\w.\-]+/g, "_");
      const path = `${clientId}/${saved.id}/${crypto.randomUUID()}-${limpio}`;
      const { error: subida } = await supabase.storage.from("adjuntos").upload(path, file, {
        contentType: file.type || "application/octet-stream",
        upsert: false,
      });
      if (subida) {
        fallidos.push(file.name);
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
    setPendingIds((prev) => {
      const next = new Set(prev);
      next.delete(tempId);
      return next;
    });

    upsertMessage(clientId, saved, tempId);
    setLastMsgAt((prev) => ({ ...prev, [clientId]: saved.created_at }));

    if (fallidos.length > 0) {
      alert(
        `No se han podido subir: ${fallidos.join(", ")}.\n\nSuele ser por el tamaño máximo por archivo del proyecto de Supabase. Sube el archivo a Drive y pega el enlace en el chat, o pide que suban ese límite.`,
      );
    }
  }

  // --------------------------------------------------------------- tarjetas
  async function addCard(columnId: string, title: string) {
    if (!activeId) return;
    const inColumn = cards.filter((c) => c.column_id === columnId);
    const position = (inColumn.at(-1)?.position ?? 0) + 1;
    const { data, error } = await supabase
      .from("cards")
      .insert({ client_id: activeId, column_id: columnId, title, position, created_by: me.id })
      .select("*")
      .single();
    if (error || !data) {
      alert("No se ha podido crear la tarjeta.");
      return;
    }
    setCards((prev) => [...prev, { ...(data as CardRow), assignees: [] }]);
  }

  async function moveCard(cardId: string, columnId: string) {
    const card = cards.find((c) => c.id === cardId);
    if (!card || card.column_id === columnId) return;
    const inColumn = cards.filter((c) => c.column_id === columnId);
    const position = (inColumn.at(-1)?.position ?? 0) + 1;

    const previous = cards;
    setCards((prev) => prev.map((c) => (c.id === cardId ? { ...c, column_id: columnId, position } : c)));

    const { error } = await supabase.from("cards").update({ column_id: columnId, position }).eq("id", cardId);
    if (error) {
      setCards(previous);
      alert("No se ha podido mover la tarjeta.");
    }
  }

  async function patchCard(cardId: string, patch: Partial<Card>) {
    const previous = cards;
    setCards((prev) => prev.map((c) => (c.id === cardId ? { ...c, ...patch } : c)));

    const { assignees, ...dbPatch } = patch;
    void assignees;
    if (Object.keys(dbPatch).length === 0) return;

    const { error } = await supabase.from("cards").update(dbPatch).eq("id", cardId);
    if (error) {
      setCards(previous);
      alert("No se ha podido guardar el cambio.");
    }
  }

  async function toggleAssignee(cardId: string, profileId: string) {
    const card = cards.find((c) => c.id === cardId);
    if (!card) return;
    const has = card.assignees.includes(profileId);

    setCards((prev) =>
      prev.map((c) =>
        c.id === cardId
          ? {
              ...c,
              assignees: has
                ? c.assignees.filter((id) => id !== profileId)
                : [...c.assignees, profileId],
            }
          : c,
      ),
    );

    if (has) {
      await supabase
        .from("card_assignees")
        .delete()
        .eq("card_id", cardId)
        .eq("profile_id", profileId);
    } else {
      await supabase.from("card_assignees").insert({ card_id: cardId, profile_id: profileId });
    }
  }

  async function deleteCard(cardId: string) {
    const previous = cards;
    setCards((prev) => prev.filter((c) => c.id !== cardId));
    setOpenCardId(null);
    const { error } = await supabase.from("cards").delete().eq("id", cardId);
    if (error) {
      setCards(previous);
      alert("No se ha podido borrar la tarjeta.");
    }
  }

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
      setTab("board");
    }
    setNewClientOpen(false);
    return null;
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

  const openCard = openCardId ? (cards.find((c) => c.id === openCardId) ?? null) : null;
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
          setRailOpen(false);
        }}
        onNewClient={() => {
          setNewClientOpen(true);
          setRailOpen(false);
        }}
        onClose={() => setRailOpen(false)}
        vista={vista}
        onVista={(v) => {
          setVista(v);
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
              <div>
                <div className="main__title">
                  {vista === "informes" ? "Informes" : (activeClient?.name ?? "Bitácora")}
                </div>
                <div className="main__kind">
                  {vista === "informes"
                    ? "Tiempo por cliente y fase"
                    : (activeClient?.kind ?? "Sin cliente seleccionado")}
                </div>
              </div>
            </div>
            {activeClient && vista === "cliente" && (
              <nav className="tabs">
                <button
                  className={tab === "board" ? "tab is-active" : "tab"}
                  onClick={() => setTab("board")}
                >
                  Tablero
                </button>
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
              </nav>
            )}
          </div>

          <div className="main__actions">
            {activeClient && vista === "cliente" && (
              <button
                type="button"
                onClick={toggleMembership}
                title={iAmMember ? "Dejar de seguir este cliente" : "Seguir este cliente"}
                style={{ border: "none", background: "none", padding: 0, cursor: "pointer" }}
              >
                <div className="avatar-stack">
                  {activeMembers.map((p) => (
                    <Stamp key={p.id} label={p.initials} color={p.color} title={p.full_name} />
                  ))}
                  {!iAmMember && <Stamp label="+" color="var(--ink-faint)" title="Seguir este cliente" />}
                </div>
              </button>
            )}
            <ThemeToggle />
          </div>
        </header>

        {vista === "informes" && (
          <Informes
            clientNames={clientNames}
            profileById={profileById}
            cardTitles={cardTitles}
          />
        )}

        {vista === "cliente" && !activeClient && (
          <div className="empty">
            Todavía no hay ningún cliente en la bitácora. Añade el primero con el botón <b>+</b> del
            panel de la izquierda.
          </div>
        )}

        {vista === "cliente" && activeClient && (
          <Resumen
            key={activeClient.id}
            clientId={activeClient.id}
            cards={activeCards}
            doneColumnId={activeDoneColumnId}
            pendingTasks={pendingTasks}
            me={me}
          />
        )}

        {vista === "cliente" && activeClient && tab === "board" && (
          <Board
            columns={activeColumns}
            cards={activeCards}
            profileById={profileById}
            onOpenCard={setOpenCardId}
            onMoveCard={moveCard}
            onAddCard={addCard}
            workingByCard={workingByCard}
          />
        )}

        {vista === "cliente" && activeClient && tab === "chat" && (
          <Chat
            messages={activeMessages}
            attachmentsByMessage={attachmentsByMessage}
            profileById={profileById}
            loading={loadingChat && activeMessages.length === 0}
            pendingIds={pendingIds}
            uploading={uploading}
            onSend={sendMessage}
          />
        )}

        {vista === "cliente" && activeClient && tab === "tareas" && (
          <Tareas key={activeClient.id} clientId={activeClient.id} onCount={setPendingTasks} />
        )}
      </main>

      {vista === "cliente" && openCard && activeClient && (
        <CardDrawer
          card={openCard}
          clientName={activeClient.name}
          profiles={profiles}
          profileById={profileById}
          me={me}
          onClose={() => setOpenCardId(null)}
          onPatch={patchCard}
          onToggleAssignee={toggleAssignee}
          onDelete={deleteCard}
          myOpenSession={myOpenSession}
          workingHere={(workingByCard[openCard.id] ?? []).filter((p) => p.id !== me.id)}
          onStartWork={startWork}
          onStopWork={stopWork}
        />
      )}

      {newClientOpen && (
        <NewClientDialog onCancel={() => setNewClientOpen(false)} onCreate={createClientRecord} />
      )}
    </div>
  );
}

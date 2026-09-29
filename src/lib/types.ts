import type { Prioridad } from "./prioridad";

export type { Prioridad };

export type Role = "member" | "admin";

export type Profile = {
  id: string;
  email: string;
  full_name: string;
  initials: string;
  color: string;
  role: Role;
  /** Falso cuando alguien deja el equipo: desaparece de la app sin perder su historial. */
  active: boolean;
  /** Foto de perfil. Vacío si no tiene. */
  avatar_url: string;
};

export type BoardColumn = {
  id: string;
  client_id: string;
  key: string;
  label: string;
  position: number;
};

export type LabelKey = "diseno" | "facturacion" | "urgente" | "reunion";

export const LABELS: { key: LabelKey; text: string }[] = [
  { key: "diseno", text: "Diseño" },
  { key: "facturacion", text: "Facturación" },
  { key: "urgente", text: "Urgente" },
  { key: "reunion", text: "Reunión" },
];

export const LABEL_TEXT: Record<string, string> = Object.fromEntries(
  LABELS.map((l) => [l.key, l.text]),
);

export type Card = {
  id: string;
  client_id: string;
  column_id: string;
  ref: string;
  title: string;
  description: string;
  due_date: string | null;
  labels: string[];
  position: number;
  created_by: string | null;
  assignees: string[];
  priority: Prioridad;
};

export type Client = {
  id: string;
  name: string;
  kind: string;
  ref_prefix: string;
  position: number;
  archived: boolean;
  members: string[];
  openCount: number;
  unread: boolean;
  priority: Prioridad;
};

export type Message = {
  id: string;
  client_id: string;
  /** Vacío en lo importado de Slack: ahí el autor va en `external_author`. */
  author_id: string | null;
  source: string;
  external_author: string;
  body: string;
  created_at: string;
  edited_at: string | null;
  mentions: string[];
};

export type ChecklistItem = {
  id: string;
  card_id: string;
  text: string;
  done: boolean;
  position: number;
};

export type CardComment = {
  id: string;
  card_id: string;
  author_id: string;
  body: string;
  created_at: string;
};

export type PunchKind = "entrada" | "pausa" | "regreso" | "salida";

export type Punch = {
  id: string;
  profile_id: string;
  kind: PunchKind;
  at: string;
};

export type Attachment = {
  id: string;
  message_id: string;
  client_id: string;
  path: string;
  name: string;
  mime: string;
  size_bytes: number;
  created_at: string;
};

export type Notice = {
  id: string;
  client_id: string;
  body: string;
  author_id: string | null;
  created_at: string;
};

export type ClientTask = {
  id: string;
  client_id: string;
  text: string;
  done: boolean;
  position: number;
  author_id: string | null;
  assignee_id: string | null;
  notes: string;
  due_date: string | null;
  priority: Prioridad;
  done_at: string | null;
  /** Cuándo alguien le dio a «Iniciar tarea». Null si todavía no la ha cogido nadie. */
  started_at: string | null;
  /** Quién la tiene entre manos. Se conserva al terminarla, como registro. */
  started_by: string | null;
  created_at: string;
};

/** Lo que alguien dejó a medias al cerrar su jornada. Lo ve todo el equipo. */
export type DailyNote = {
  id: string;
  profile_id: string;
  client_id: string | null;
  day: string;
  kind: "a_medias" | "bloqueo" | "nota";
  text: string;
  done: boolean;
  done_at: string | null;
  done_by: string | null;
  created_at: string;
};

/** Una anotación de la agenda personal. Solo la ve quien la escribió. */
export type PersonalNote = {
  id: string;
  profile_id: string;
  text: string;
  notes: string;
  done: boolean;
  done_at: string | null;
  due_date: string | null;
  position: number;
  created_at: string;
};

export type Meeting = {
  id: string;
  client_id: string;
  title: string;
  url: string;
  starts_at: string | null;
  created_by: string | null;
  created_at: string;
};

export type WorkSession = {
  id: string;
  /** Vacío cuando el tiempo se apuntó a mano al fichar la salida. */
  card_id: string | null;
  client_id: string;
  column_key: string;
  column_label: string;
  profile_id: string;
  started_at: string;
  ended_at: string | null;
};

export type DirectMessage = {
  id: string;
  sender_id: string;
  recipient_id: string;
  body: string;
  created_at: string;
  edited_at: string | null;
  read_at: string | null;
};

export type Transcript = {
  id: string;
  attachment_id: string;
  client_id: string;
  language: string;
  text: string;
  translation: string;
  status: "pendiente" | "listo" | "error";
  error: string;
  created_at: string;
};

/** La ficha de un cliente: lo que hay guardado en la tabla `clients`. */
export type ClientDetails = {
  id: string;
  name: string;
  kind: string;
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

/** Una clave de acceso de un cliente: la red social, el usuario y su contraseña. */
export type Credencial = {
  id: string;
  client_id: string;
  service: string;
  username: string;
  secret: string;
  url: string;
  notes: string;
  position: number;
  updated_by: string | null;
  updated_at: string;
  created_at: string;
};

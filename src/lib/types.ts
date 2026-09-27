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
  priority: Prioridad;
};

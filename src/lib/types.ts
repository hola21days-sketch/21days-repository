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
};

export type Message = {
  id: string;
  client_id: string;
  author_id: string;
  body: string;
  created_at: string;
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

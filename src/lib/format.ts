const MONTHS = [
  "ene", "feb", "mar", "abr", "may", "jun",
  "jul", "ago", "sep", "oct", "nov", "dic",
];

/** "2026-08-25" -> "25 ago" */
export function formatDue(date: string | null): string {
  if (!date) return "";
  const [y, m, d] = date.split("-").map(Number);
  if (!y || !m || !d) return "";
  return `${d} ${MONTHS[m - 1]}`;
}

/** Una tarjeta está atrasada si su fecha de entrega ya pasó. */
export function isOverdue(date: string | null): boolean {
  if (!date) return false;
  const today = new Date();
  const iso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(
    today.getDate(),
  ).padStart(2, "0")}`;
  return date < iso;
}

/** "2026-08-21T09:14:00Z" -> "09:14" */
export function formatTime(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/** Encabezado de grupo del chat: Hoy / Ayer / 19 ago */
export function dayLabel(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  const same = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();
  if (same(d, today)) return "Hoy";
  if (same(d, yesterday)) return "Ayer";
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

/** Fecha relativa corta para comentarios: "hoy, 08:12" */
export function commentStamp(iso: string): string {
  return `${dayLabel(iso).toLowerCase()}, ${formatTime(iso)}`;
}

export function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

const STAMP_COLORS = ["#146c6b", "#c98a2e", "#5b6863", "#8a5a3f", "#3f8f5f", "#b14a3a"];

/** Color estable derivado de un identificador (para los sellos de cliente). */
export function stampColor(id: string): string {
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) % STAMP_COLORS.length;
  return STAMP_COLORS[h];
}

/** 1536000 -> "1,5 MB". Se queda en unidades redondas, sin decimales de más. */
export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["kB", "MB", "GB", "TB"];
  let value = bytes / 1024;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i += 1;
  }
  return `${value.toFixed(value < 10 ? 1 : 0).replace(".", ",")} ${units[i]}`;
}

/** "2026-08-21T09:14:00Z" -> "2026-08-21" en hora local. */
export function localDay(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

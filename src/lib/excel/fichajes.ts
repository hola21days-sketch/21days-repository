import ExcelJS from "exceljs";
import { descargar, kpis, portada, tabla, TINTA, type Valor } from "./estilo";
import { localDay } from "@/lib/format";
import type { Profile, Punch } from "@/lib/types";

const DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
const DIAS_CORTOS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

const HORAS = '0.00" h"';
const MINUTOS = '0" min"';

const enHoras = (min: number) => Math.round((min / 60) * 100) / 100;
const indiceSemana = (d: Date) => (d.getDay() + 6) % 7;

function reloj(minutosDelDia: number): string {
  if (!Number.isFinite(minutosDelDia) || minutosDelDia <= 0) return "";
  const m = Math.round(minutosDelDia);
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

const minutosDelDia = (iso: string) => {
  const d = new Date(iso);
  return d.getHours() * 60 + d.getMinutes();
};

export type Jornada = {
  fecha: string;
  profileId: string;
  persona: string;
  correo: string;
  entrada: number | null;
  salida: number | null;
  pausas: number;
  minutosPausa: number;
  minutosTrabajados: number;
  cerrada: boolean;
  detalle: string;
};

/**
 * De la lista de marcajes a una fila por persona y día, con lo trabajado, lo
 * pausado y a qué hora se entró y se salió.
 */
export function jornadas(punches: Punch[], porId: Map<string, Profile>): Jornada[] {
  const porDia = new Map<string, Punch[]>();
  for (const p of punches) {
    const clave = `${p.profile_id}|${localDay(p.at)}`;
    porDia.set(clave, [...(porDia.get(clave) ?? []), p]);
  }

  return [...porDia.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([clave, dia]) => {
      const [profileId, fecha] = clave.split("|");
      const quien = porId.get(profileId);
      const ordenados = [...dia].sort((a, b) => a.at.localeCompare(b.at));
      const entrada = ordenados.find((p) => p.kind === "entrada");
      const salida = [...ordenados].reverse().find((p) => p.kind === "salida");

      let trabajado = 0;
      let pausado = 0;
      let desde: number | null = null;
      let pausaDesde: number | null = null;
      for (const p of ordenados) {
        const t = new Date(p.at).getTime();
        if (p.kind === "entrada" || p.kind === "regreso") {
          if (desde === null) desde = t;
          if (pausaDesde !== null) {
            pausado += t - pausaDesde;
            pausaDesde = null;
          }
        } else {
          if (desde !== null) {
            trabajado += t - desde;
            desde = null;
          }
          if (p.kind === "pausa") pausaDesde = t;
        }
      }

      return {
        fecha,
        profileId,
        persona: quien?.full_name ?? "Alguien del equipo",
        correo: quien?.email ?? "",
        entrada: entrada ? minutosDelDia(entrada.at) : null,
        salida: salida ? minutosDelDia(salida.at) : null,
        pausas: ordenados.filter((p) => p.kind === "pausa").length,
        minutosPausa: Math.round(pausado / 60000),
        minutosTrabajados: Math.round(trabajado / 60000),
        cerrada: !!salida,
        detalle: ordenados.map((p) => `${reloj(minutosDelDia(p.at))} ${p.kind}`).join(" · "),
      };
    });
}

const media = (xs: number[]) => (xs.length > 0 ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

/**
 * El informe de fichajes en Excel: quién ha venido, cuándo y cuánto ha estado.
 */
export async function exportarFichajes(
  punches: Punch[],
  profiles: Profile[],
  generadoPor: string,
) {
  const porId = new Map(profiles.map((p) => [p.id, p]));
  const filas = jornadas(punches, porId);

  const libro = new ExcelJS.Workbook();
  libro.creator = "21days agency";
  libro.created = new Date();

  const desde = filas[0]?.fecha ?? "";
  const hasta = filas.at(-1)?.fecha ?? "";
  const cabeceraPeriodo = desde ? `Del ${desde} al ${hasta}` : "Sin fichajes todavía";
  const pie = `Generado por ${generadoPor} · ${new Date().toLocaleString("es-ES")}`;

  const totalMin = filas.reduce((a, j) => a + j.minutosTrabajados, 0);
  const gente = new Map<string, Jornada[]>();
  for (const j of filas) gente.set(j.profileId, [...(gente.get(j.profileId) ?? []), j]);
  const orden = [...gente.entries()].sort(
    (a, b) =>
      b[1].reduce((x, j) => x + j.minutosTrabajados, 0) -
      a[1].reduce((x, j) => x + j.minutosTrabajados, 0),
  );

  // ============================================================== 1. Resumen
  const resumen = libro.addWorksheet("Resumen", {
    pageSetup: { paperSize: 9, orientation: "landscape", fitToPage: true },
  });
  let f = portada(resumen, { titulo: "Informe de fichajes", periodo: cabeceraPeriodo, pie });

  const laborables = filas.filter((j) => {
    const d = new Date(`${j.fecha}T12:00:00`).getDay();
    return d !== 0 && d !== 6;
  });

  f = kpis(resumen, f, [
    { etiqueta: "Horas fichadas", valor: enHoras(totalMin), formato: HORAS },
    { etiqueta: "Personas", valor: gente.size },
    { etiqueta: "Jornadas", valor: filas.length },
    {
      etiqueta: "Media por jornada",
      valor: enHoras(media(filas.map((j) => j.minutosTrabajados))),
      formato: HORAS,
    },
    {
      etiqueta: "Media de jornada de lunes a viernes",
      valor: enHoras(media(laborables.map((j) => j.minutosTrabajados))),
      formato: HORAS,
    },
    {
      etiqueta: "Pausa media al día",
      valor: Math.round(media(filas.map((j) => j.minutosPausa))),
      formato: MINUTOS,
    },
  ]);

  f = tabla(resumen, f, {
    titulo: "Resumen por persona",
    columnas: [
      { titulo: "Persona", ancho: 26 },
      { titulo: "Correo", ancho: 28 },
      { titulo: "Jornadas", alinear: "right", ancho: 11 },
      { titulo: "Horas", formato: HORAS, alinear: "right", barra: true, ancho: 14 },
      { titulo: "Media por jornada", formato: HORAS, alinear: "right", ancho: 16 },
      { titulo: "Media de jornada de lunes a viernes", formato: HORAS, alinear: "right", ancho: 22 },
      { titulo: "Entrada media", alinear: "center", ancho: 13 },
      { titulo: "Salida media", alinear: "center", ancho: 13 },
      { titulo: "Pausa media", formato: MINUTOS, alinear: "right", ancho: 13 },
      { titulo: "Su día más largo", formato: HORAS, alinear: "right", ancho: 15 },
      { titulo: "Sin cerrar", alinear: "right", ancho: 11 },
    ],
    filas: orden.map(([, suyas]) => {
      const laborablesSuyas = suyas.filter((j) => {
        const d = new Date(`${j.fecha}T12:00:00`).getDay();
        return d !== 0 && d !== 6;
      });
      const entradas = suyas.map((j) => j.entrada).filter((x): x is number => x !== null);
      const salidas = suyas.map((j) => j.salida).filter((x): x is number => x !== null);
      return [
        suyas[0].persona,
        suyas[0].correo,
        suyas.length,
        enHoras(suyas.reduce((a, j) => a + j.minutosTrabajados, 0)),
        enHoras(media(suyas.map((j) => j.minutosTrabajados))),
        enHoras(media(laborablesSuyas.map((j) => j.minutosTrabajados))),
        reloj(media(entradas)),
        reloj(media(salidas)),
        Math.round(media(suyas.map((j) => j.minutosPausa))),
        enHoras(Math.max(0, ...suyas.map((j) => j.minutosTrabajados))),
        suyas.filter((j) => !j.cerrada).length,
      ] as Valor[];
    }),
    totales: [
      "Total",
      null,
      filas.length,
      enHoras(totalMin),
      enHoras(media(filas.map((j) => j.minutosTrabajados))),
      enHoras(media(laborables.map((j) => j.minutosTrabajados))),
      null,
      null,
      Math.round(media(filas.map((j) => j.minutosPausa))),
      null,
      filas.filter((j) => !j.cerrada).length,
    ],
  });

  const sinCerrar = filas.filter((j) => !j.cerrada).length;
  if (sinCerrar > 0) {
    const celda = resumen.getCell(f, 1);
    celda.value = `Ojo: ${sinCerrar} ${sinCerrar === 1 ? "jornada" : "jornadas"} sin fichar la salida. Esas horas cuentan solo hasta el último marcaje del día.`;
    celda.font = { name: "Calibri", size: 10, italic: true, color: { argb: TINTA.rojo } };
  }

  // =================================================== 2. Por día de la semana
  const semana = libro.addWorksheet("Por día de la semana", {
    pageSetup: { paperSize: 9, orientation: "landscape", fitToPage: true },
  });
  f = portada(semana, {
    titulo: "Cómo se reparte la semana",
    periodo: cabeceraPeriodo,
    pie,
  });

  f = tabla(semana, f, {
    titulo: "Media de horas por día de la semana",
    columnas: [
      { titulo: "Persona", ancho: 26 },
      ...DIAS_CORTOS.map((d) => ({
        titulo: d,
        formato: HORAS,
        alinear: "right" as const,
        ancho: 11,
      })),
      { titulo: "Media general", formato: HORAS, alinear: "right", barra: true, ancho: 14 },
    ],
    filas: orden.map(([, suyas]) => {
      const cubos: number[][] = [[], [], [], [], [], [], []];
      for (const j of suyas) {
        cubos[indiceSemana(new Date(`${j.fecha}T12:00:00`))].push(j.minutosTrabajados);
      }
      return [
        suyas[0].persona,
        ...cubos.map((c) => enHoras(media(c))),
        enHoras(media(suyas.map((j) => j.minutosTrabajados))),
      ] as Valor[];
    }),
  });

  f = tabla(semana, f, {
    titulo: "Días fichados por día de la semana",
    columnas: [
      { titulo: "Persona", ancho: 26 },
      ...DIAS_CORTOS.map((d) => ({ titulo: d, alinear: "right" as const, ancho: 11 })),
    ],
    filas: orden.map(([, suyas]) => {
      const cuenta = [0, 0, 0, 0, 0, 0, 0];
      for (const j of suyas) cuenta[indiceSemana(new Date(`${j.fecha}T12:00:00`))] += 1;
      return [suyas[0].persona, ...cuenta] as Valor[];
    }),
  });

  // ========================================================= 3. Detalle diario
  const diario = libro.addWorksheet("Detalle diario", {
    pageSetup: { paperSize: 9, orientation: "landscape", fitToPage: true },
  });
  f = portada(diario, { titulo: "Jornada a jornada", periodo: cabeceraPeriodo, pie });

  tabla(diario, f, {
    columnas: [
      { titulo: "Fecha", ancho: 13 },
      { titulo: "Día", ancho: 12 },
      { titulo: "Persona", ancho: 24 },
      { titulo: "Correo", ancho: 26 },
      { titulo: "Entrada", alinear: "center", ancho: 10 },
      { titulo: "Salida", alinear: "center", ancho: 10 },
      { titulo: "Pausas", alinear: "right", ancho: 9 },
      { titulo: "Minutos de pausa", formato: MINUTOS, alinear: "right", ancho: 15 },
      { titulo: "Horas trabajadas", formato: HORAS, alinear: "right", barra: true, ancho: 15 },
      { titulo: "Estado", ancho: 12 },
      { titulo: "Detalle del día", ancho: 46 },
    ],
    filas: [...filas]
      .sort((a, b) => b.fecha.localeCompare(a.fecha) || a.persona.localeCompare(b.persona))
      .map(
        (j) =>
          [
            j.fecha,
            DIAS[new Date(`${j.fecha}T12:00:00`).getDay()],
            j.persona,
            j.correo,
            reloj(j.entrada ?? 0),
            reloj(j.salida ?? 0),
            j.pausas,
            j.minutosPausa,
            enHoras(j.minutosTrabajados),
            j.cerrada ? "Cerrada" : "Sin salida",
            j.detalle,
          ] as Valor[],
      ),
    congelar: true,
    filtros: true,
  });

  // ============================================================== 4. Marcajes
  const marcajes = libro.addWorksheet("Marcajes", {
    pageSetup: { paperSize: 9, orientation: "portrait", fitToPage: true },
  });
  f = portada(marcajes, { titulo: "Marcajes en bruto", periodo: cabeceraPeriodo, pie });

  tabla(marcajes, f, {
    columnas: [
      { titulo: "Fecha", ancho: 13 },
      { titulo: "Día", ancho: 12 },
      { titulo: "Hora", alinear: "center", ancho: 10 },
      { titulo: "Persona", ancho: 24 },
      { titulo: "Marcaje", ancho: 12 },
    ],
    filas: [...punches]
      .sort((a, b) => a.at.localeCompare(b.at))
      .map(
        (p) =>
          [
            localDay(p.at),
            DIAS[new Date(p.at).getDay()],
            reloj(minutosDelDia(p.at)),
            porId.get(p.profile_id)?.full_name ?? "Alguien del equipo",
            p.kind,
          ] as Valor[],
      ),
    congelar: true,
    filtros: true,
  });

  await descargar(libro, `fichajes-${localDay(new Date().toISOString())}.xlsx`);
}

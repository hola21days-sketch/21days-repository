import ExcelJS from "exceljs";
import { descargar, kpis, portada, tabla, TINTA, type Valor } from "./estilo";
import { localDay } from "@/lib/format";
import type { Profile, WorkSession } from "@/lib/types";

const DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
const DIAS_CORTOS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

const HORAS = '0.00" h"';
const PORCEN = "0.0%";

/** Minutos de un tramo; si sigue abierto, cuenta hasta ahora. */
function minutosDe(s: WorkSession, ahora: number): number {
  const ini = new Date(s.started_at).getTime();
  const fin = s.ended_at ? new Date(s.ended_at).getTime() : ahora;
  return Math.max(0, (fin - ini) / 60000);
}

const enHoras = (min: number) => Math.round((min / 60) * 100) / 100;

/** Lunes = 0 … domingo = 6, que es como se lee una semana aquí. */
const indiceSemana = (d: Date) => (d.getDay() + 6) % 7;

/** Cuántos días laborables (L–V) han pasado ya dentro de la ventana. */
function laborablesTranscurridos(desde: Date, hasta: Date): number {
  const fin = new Date(Math.min(hasta.getTime(), Date.now()));
  let n = 0;
  const d = new Date(desde);
  while (d < fin) {
    const dia = d.getDay();
    if (dia !== 0 && dia !== 6) n += 1;
    d.setDate(d.getDate() + 1);
  }
  return Math.max(1, n);
}

function reloj(min: number): string {
  const m = Math.round(min);
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, "0")}m`;
}

function hora(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export type DatosDeTiempo = {
  sessions: WorkSession[];
  clientNames: Record<string, string>;
  profileById: Record<string, Profile>;
  periodo: "semana" | "mes";
  textoPeriodo: string;
  desde: Date;
  hasta: Date;
  ahora: number;
  generadoPor: string;
};

/**
 * El informe de tiempo en Excel.
 * ---------------------------------------------------------------------------
 * Cinco hojas: el titular, quién ha hecho qué, en qué cliente se ha ido el
 * tiempo, cómo se reparte por días y, al final, el detalle tramo a tramo por
 * si alguien quiere hacer sus propias cuentas.
 */
export async function exportarTiempos(d: DatosDeTiempo) {
  const {
    sessions, clientNames, profileById,
    periodo, textoPeriodo, desde, hasta, ahora, generadoPor,
  } = d;

  const libro = new ExcelJS.Workbook();
  libro.creator = "21days agency";
  libro.created = new Date(ahora);

  const total = sessions.reduce((a, s) => a + minutosDe(s, ahora), 0);
  const pie = `Generado por ${generadoPor} · ${new Date(ahora).toLocaleString("es-ES")}`;
  const cabeceraPeriodo = `${periodo === "semana" ? "Semana" : "Mes"} de ${textoPeriodo}`;

  // ---------------------------------------------------------------- por día
  const porDia = new Map<string, number>();
  const porDiaPersona = new Map<string, Map<string, number>>();
  for (const s of sessions) {
    const dia = localDay(s.started_at);
    const min = minutosDe(s, ahora);
    porDia.set(dia, (porDia.get(dia) ?? 0) + min);
    const fila = porDiaPersona.get(dia) ?? new Map<string, number>();
    fila.set(s.profile_id, (fila.get(s.profile_id) ?? 0) + min);
    porDiaPersona.set(dia, fila);
  }
  const dias = [...porDia.keys()].sort();

  // ------------------------------------------------------------- por persona
  const personas = new Map<
    string,
    {
      total: number;
      porDia: Map<string, number>;
      porSemana: number[];
      porCliente: Map<string, number>;
      clientes: Set<string>;
      fases: Set<string>;
      sesiones: number;
    }
  >();
  for (const s of sessions) {
    const p = personas.get(s.profile_id) ?? {
      total: 0,
      porDia: new Map<string, number>(),
      porSemana: [0, 0, 0, 0, 0, 0, 0],
      porCliente: new Map<string, number>(),
      clientes: new Set<string>(),
      fases: new Set<string>(),
      sesiones: 0,
    };
    const min = minutosDe(s, ahora);
    const dia = localDay(s.started_at);
    p.total += min;
    p.porDia.set(dia, (p.porDia.get(dia) ?? 0) + min);
    p.porSemana[indiceSemana(new Date(s.started_at))] += min;
    p.porCliente.set(s.client_id, (p.porCliente.get(s.client_id) ?? 0) + min);
    p.clientes.add(s.client_id);
    p.fases.add(s.column_label || "Sin fase");
    p.sesiones += 1;
    personas.set(s.profile_id, p);
  }
  const ordenPersonas = [...personas.entries()].sort((a, b) => b[1].total - a[1].total);

  // ------------------------------------------------------------- por cliente
  const fases: string[] = [];
  for (const s of sessions) {
    const f = s.column_label || "Sin fase";
    if (!fases.includes(f)) fases.push(f);
  }
  const clientes = new Map<
    string,
    { total: number; fases: Record<string, number>; personas: Map<string, number>; sesiones: number }
  >();
  for (const s of sessions) {
    const c = clientes.get(s.client_id) ?? {
      total: 0,
      fases: {},
      personas: new Map<string, number>(),
      sesiones: 0,
    };
    const f = s.column_label || "Sin fase";
    const min = minutosDe(s, ahora);
    c.total += min;
    c.fases[f] = (c.fases[f] ?? 0) + min;
    c.personas.set(s.profile_id, (c.personas.get(s.profile_id) ?? 0) + min);
    c.sesiones += 1;
    clientes.set(s.client_id, c);
  }
  const ordenClientes = [...clientes.entries()].sort((a, b) => b[1].total - a[1].total);

  const laborables = laborablesTranscurridos(desde, hasta);

  // ============================================================== 1. Resumen
  const resumen = libro.addWorksheet("Resumen", {
    properties: { defaultRowHeight: 16 },
    pageSetup: { paperSize: 9, orientation: "landscape", fitToPage: true },
  });
  let f = portada(resumen, {
    titulo: "Informe de tiempo",
    periodo: cabeceraPeriodo,
    pie,
  });

  const diaTop = dias.reduce(
    (mejor, dia) => ((porDia.get(dia) ?? 0) > (porDia.get(mejor) ?? 0) ? dia : mejor),
    dias[0] ?? "",
  );

  f = kpis(resumen, f, [
    { etiqueta: "Horas en total", valor: enHoras(total), formato: HORAS },
    { etiqueta: "Personas activas", valor: personas.size },
    { etiqueta: "Clientes tocados", valor: clientes.size },
    { etiqueta: "Media por día laborable", valor: enHoras(total / laborables), formato: HORAS },
    { etiqueta: "Días con actividad", valor: dias.length },
    { etiqueta: "Tramos cronometrados", valor: sessions.length },
  ]);

  f = tabla(resumen, f, {
    titulo: "Reparto por cliente",
    columnas: [
      { titulo: "Cliente", ancho: 28 },
      { titulo: "Horas", formato: HORAS, alinear: "right", barra: true, ancho: 14 },
      { titulo: "% del total", formato: PORCEN, alinear: "right", ancho: 12 },
      { titulo: "Tramos", alinear: "right", ancho: 10 },
      { titulo: "Personas", alinear: "right", ancho: 10 },
    ],
    filas: ordenClientes.map(([id, c]) => [
      clientNames[id] ?? "Cliente borrado",
      enHoras(c.total),
      total > 0 ? c.total / total : 0,
      c.sesiones,
      c.personas.size,
    ]),
    totales: ["Total", enHoras(total), total > 0 ? 1 : 0, sessions.length, personas.size],
  });

  const totalPorFase = fases.map((fase) => {
    const min = sessions
      .filter((s) => (s.column_label || "Sin fase") === fase)
      .reduce((a, s) => a + minutosDe(s, ahora), 0);
    return { fase, min };
  });
  totalPorFase.sort((a, b) => b.min - a.min);

  f = tabla(resumen, f, {
    titulo: "Reparto por fase",
    columnas: [
      { titulo: "Fase", ancho: 28 },
      { titulo: "Horas", formato: HORAS, alinear: "right", barra: true, ancho: 14 },
      { titulo: "% del total", formato: PORCEN, alinear: "right", ancho: 12 },
    ],
    filas: totalPorFase.map((x) => [x.fase, enHoras(x.min), total > 0 ? x.min / total : 0]),
    totales: ["Total", enHoras(total), total > 0 ? 1 : 0],
  });

  if (diaTop) {
    const celda = resumen.getCell(f, 1);
    celda.value = `Día más cargado: ${DIAS[new Date(`${diaTop}T12:00:00`).getDay()]} ${diaTop} · ${reloj(porDia.get(diaTop) ?? 0)}`;
    celda.font = { name: "Calibri", size: 10, italic: true, color: { argb: TINTA.gris } };
    f += 1;
  }

  // Un cronómetro olvidado infla el informe sin que se note en las cifras, así
  // que se dice cuánto pesa lo que sigue corriendo.
  const abiertos = sessions.filter((s) => !s.ended_at);
  if (abiertos.length > 0) {
    const minAbiertos = abiertos.reduce((a, s) => a + minutosDe(s, ahora), 0);
    const celda = resumen.getCell(f, 1);
    celda.value =
      `${abiertos.length} ${abiertos.length === 1 ? "tramo sigue" : "tramos siguen"} en marcha y ` +
      `${abiertos.length === 1 ? "suma" : "suman"} ${reloj(minAbiertos)} contados hasta ahora. ` +
      `Si alguien se ha dejado el cronómetro puesto, está inflando este informe: mira la hoja Detalle, columna Estado.`;
    celda.font = { name: "Calibri", size: 10, italic: true, color: { argb: TINTA.ambar } };
  }

  // ============================================================ 2. Por persona
  const hojaPersonas = libro.addWorksheet("Por persona", {
    pageSetup: { paperSize: 9, orientation: "landscape", fitToPage: true },
  });
  f = portada(hojaPersonas, {
    titulo: "Cuánto ha trabajado cada uno",
    periodo: cabeceraPeriodo,
    pie,
  });

  f = tabla(hojaPersonas, f, {
    titulo: "Resumen por persona",
    columnas: [
      { titulo: "Persona", ancho: 26 },
      { titulo: "Horas", formato: HORAS, alinear: "right", barra: true, ancho: 14 },
      { titulo: "% del total", formato: PORCEN, alinear: "right", ancho: 12 },
      { titulo: "Días con actividad", alinear: "right", ancho: 15 },
      { titulo: "Media por día trabajado", formato: HORAS, alinear: "right", ancho: 18 },
      { titulo: "Media por día laborable del periodo", formato: HORAS, alinear: "right", ancho: 22 },
      { titulo: "Su día más largo", formato: HORAS, alinear: "right", ancho: 15 },
      { titulo: "Clientes", alinear: "right", ancho: 10 },
      { titulo: "Tramos", alinear: "right", ancho: 10 },
    ],
    filas: ordenPersonas.map(([id, p]) => {
      const suyos = [...p.porDia.values()];
      const mejor = suyos.length > 0 ? Math.max(...suyos) : 0;
      return [
        profileById[id]?.full_name ?? "Alguien del equipo",
        enHoras(p.total),
        total > 0 ? p.total / total : 0,
        p.porDia.size,
        enHoras(p.porDia.size > 0 ? p.total / p.porDia.size : 0),
        enHoras(p.total / laborables),
        enHoras(mejor),
        p.clientes.size,
        p.sesiones,
      ] as Valor[];
    }),
    totales: [
      "Total",
      enHoras(total),
      total > 0 ? 1 : 0,
      dias.length,
      enHoras(dias.length > 0 ? total / dias.length : 0),
      enHoras(total / laborables),
      null,
      clientes.size,
      sessions.length,
    ],
  });

  f = tabla(hojaPersonas, f, {
    titulo: "Media por día de la semana",
    columnas: [
      { titulo: "Persona", ancho: 26 },
      ...DIAS_CORTOS.map((d2) => ({
        titulo: d2,
        formato: HORAS,
        alinear: "right" as const,
        ancho: 11,
      })),
    ],
    filas: ordenPersonas.map(([id, p]) => {
      // La media se hace sobre los días de ese nombre en los que hubo trabajo,
      // no sobre todos: si alguien no trabaja los viernes, no le baja la media.
      const cuentaPorDia = [0, 0, 0, 0, 0, 0, 0];
      for (const dia of p.porDia.keys()) {
        cuentaPorDia[indiceSemana(new Date(`${dia}T12:00:00`))] += 1;
      }
      return [
        profileById[id]?.full_name ?? "Alguien del equipo",
        ...p.porSemana.map((min, i) => enHoras(cuentaPorDia[i] > 0 ? min / cuentaPorDia[i] : 0)),
      ] as Valor[];
    }),
  });

  f = tabla(hojaPersonas, f, {
    titulo: "En qué cliente ha estado cada uno",
    columnas: [
      { titulo: "Persona", ancho: 26 },
      { titulo: "Cliente", ancho: 28 },
      { titulo: "Horas", formato: HORAS, alinear: "right", barra: true, ancho: 14 },
      { titulo: "% de su tiempo", formato: PORCEN, alinear: "right", ancho: 14 },
    ],
    filas: ordenPersonas.flatMap(([id, p]) =>
      [...p.porCliente.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(
          ([clientId, min]) =>
            [
              profileById[id]?.full_name ?? "Alguien del equipo",
              clientNames[clientId] ?? "Cliente borrado",
              enHoras(min),
              p.total > 0 ? min / p.total : 0,
            ] as Valor[],
        ),
    ),
  });

  // ============================================================ 3. Por cliente
  const hojaClientes = libro.addWorksheet("Por cliente", {
    pageSetup: { paperSize: 9, orientation: "landscape", fitToPage: true },
  });
  f = portada(hojaClientes, {
    titulo: "En qué se va el tiempo de cada cliente",
    periodo: cabeceraPeriodo,
    pie,
  });

  f = tabla(hojaClientes, f, {
    titulo: "Horas por cliente y fase",
    columnas: [
      { titulo: "Cliente", ancho: 28 },
      ...fases.map((fase) => ({
        titulo: fase,
        formato: HORAS,
        alinear: "right" as const,
        ancho: 13,
      })),
      { titulo: "Total", formato: HORAS, alinear: "right", barra: true, ancho: 14 },
      { titulo: "% del total", formato: PORCEN, alinear: "right", ancho: 12 },
    ],
    filas: ordenClientes.map(([id, c]) => [
      clientNames[id] ?? "Cliente borrado",
      ...fases.map((fase) => enHoras(c.fases[fase] ?? 0)),
      enHoras(c.total),
      total > 0 ? c.total / total : 0,
    ]),
    totales: [
      "Total",
      ...fases.map((fase) =>
        enHoras(ordenClientes.reduce((a, [, c]) => a + (c.fases[fase] ?? 0), 0)),
      ),
      enHoras(total),
      total > 0 ? 1 : 0,
    ],
  });

  f = tabla(hojaClientes, f, {
    titulo: "Quién ha trabajado en cada cliente",
    columnas: [
      { titulo: "Cliente", ancho: 28 },
      { titulo: "Persona", ancho: 26 },
      { titulo: "Horas", formato: HORAS, alinear: "right", barra: true, ancho: 14 },
      { titulo: "% del cliente", formato: PORCEN, alinear: "right", ancho: 14 },
    ],
    filas: ordenClientes.flatMap(([id, c]) =>
      [...c.personas.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(
          ([profileId, min]) =>
            [
              clientNames[id] ?? "Cliente borrado",
              profileById[profileId]?.full_name ?? "Alguien del equipo",
              enHoras(min),
              c.total > 0 ? min / c.total : 0,
            ] as Valor[],
        ),
    ),
  });

  // ================================================================ 4. Por día
  const hojaDias = libro.addWorksheet("Por día", {
    pageSetup: { paperSize: 9, orientation: "landscape", fitToPage: true },
  });
  f = portada(hojaDias, { titulo: "Día a día", periodo: cabeceraPeriodo, pie });

  const columnasPersona = ordenPersonas.map(([id]) => id);
  f = tabla(hojaDias, f, {
    titulo: "Horas por día y persona",
    columnas: [
      { titulo: "Fecha", ancho: 13 },
      { titulo: "Día", ancho: 12 },
      ...columnasPersona.map((id) => ({
        titulo: profileById[id]?.full_name ?? "Alguien",
        formato: HORAS,
        alinear: "right" as const,
        ancho: 15,
      })),
      { titulo: "Total del día", formato: HORAS, alinear: "right", barra: true, ancho: 15 },
    ],
    filas: dias.map((dia) => {
      const fila = porDiaPersona.get(dia);
      return [
        dia,
        DIAS[new Date(`${dia}T12:00:00`).getDay()],
        ...columnasPersona.map((id) => enHoras(fila?.get(id) ?? 0)),
        enHoras(porDia.get(dia) ?? 0),
      ] as Valor[];
    }),
    totales: [
      "Total",
      null,
      ...columnasPersona.map((id) => enHoras(personas.get(id)?.total ?? 0)),
      enHoras(total),
    ],
  });

  // ===================================================== 5. Qué ha hecho cada uno
  // Es la hoja que se mira de verdad: una fila por persona, día, cliente y
  // tarea, con el rato dedicado. Sale de lo que cada uno apunta al terminar
  // la jornada.
  const quehace = libro.addWorksheet("Qué ha hecho cada uno", {
    pageSetup: { paperSize: 9, orientation: "landscape", fitToPage: true },
  });
  f = portada(quehace, {
    titulo: "Qué ha hecho cada uno",
    periodo: cabeceraPeriodo,
    pie,
  });

  const porPersonaDiaTarea = new Map<string, number>();
  for (const s of sessions) {
    const clave = [
      s.profile_id,
      localDay(s.started_at),
      s.client_id,
      s.column_label || "Otros",
    ].join("|");
    porPersonaDiaTarea.set(clave, (porPersonaDiaTarea.get(clave) ?? 0) + minutosDe(s, ahora));
  }

  f = tabla(quehace, f, {
    columnas: [
      { titulo: "Persona", ancho: 24 },
      { titulo: "Fecha", ancho: 13 },
      { titulo: "Día", ancho: 12 },
      { titulo: "Cliente", ancho: 26 },
      { titulo: "Qué ha hecho", ancho: 18 },
      { titulo: "Horas", formato: HORAS, alinear: "right", ancho: 12, barra: true },
      { titulo: "Tiempo", ancho: 12, alinear: "right" },
    ],
    filas: [...porPersonaDiaTarea.entries()]
      .map(([clave, min]) => {
        const [profileId, dia, clientId, fase] = clave.split("|");
        return { profileId, dia, clientId, fase, min };
      })
      .sort(
        (a, b) =>
          (profileById[a.profileId]?.full_name ?? "").localeCompare(
            profileById[b.profileId]?.full_name ?? "",
          ) ||
          a.dia.localeCompare(b.dia) ||
          b.min - a.min,
      )
      .map(
        (x) =>
          [
            profileById[x.profileId]?.full_name ?? "Alguien del equipo",
            x.dia,
            DIAS[new Date(`${x.dia}T12:00:00`).getDay()],
            clientNames[x.clientId] ?? "Cliente borrado",
            x.fase,
            enHoras(x.min),
            reloj(x.min),
          ] as Valor[],
      ),
    congelar: true,
    filtros: true,
  });

  // ======================================================== 6. Reparto por tarea
  const tareas = libro.addWorksheet("Por tarea", {
    pageSetup: { paperSize: 9, orientation: "landscape", fitToPage: true },
  });
  f = portada(tareas, {
    titulo: "En qué se va el tiempo",
    periodo: cabeceraPeriodo,
    pie,
  });

  const personasOrden = ordenPersonas.map(([id]) => id);
  const porTarea = new Map<string, Map<string, number>>();
  for (const s of sessions) {
    const fase = s.column_label || "Otros";
    const fila = porTarea.get(fase) ?? new Map<string, number>();
    fila.set(s.profile_id, (fila.get(s.profile_id) ?? 0) + minutosDe(s, ahora));
    porTarea.set(fase, fila);
  }

  f = tabla(tareas, f, {
    titulo: "Horas por tarea y persona",
    columnas: [
      { titulo: "Qué se ha hecho", ancho: 20 },
      ...personasOrden.map((id) => ({
        titulo: profileById[id]?.full_name ?? "Alguien",
        formato: HORAS,
        alinear: "right" as const,
        ancho: 15,
      })),
      { titulo: "Total", formato: HORAS, alinear: "right", barra: true, ancho: 14 },
    ],
    filas: [...porTarea.entries()]
      .map(([fase, fila]) => ({
        fase,
        fila,
        total: [...fila.values()].reduce((a, b) => a + b, 0),
      }))
      .sort((a, b) => b.total - a.total)
      .map(
        (x) =>
          [
            x.fase,
            ...personasOrden.map((id) => enHoras(x.fila.get(id) ?? 0)),
            enHoras(x.total),
          ] as Valor[],
      ),
    totales: [
      "Total",
      ...personasOrden.map((id) => enHoras(personas.get(id)?.total ?? 0)),
      enHoras(total),
    ],
  });

  f = tabla(tareas, f, {
    titulo: "Horas por cliente y tarea",
    columnas: [
      { titulo: "Cliente", ancho: 26 },
      { titulo: "Qué se ha hecho", ancho: 20 },
      { titulo: "Horas", formato: HORAS, alinear: "right", barra: true, ancho: 14 },
      { titulo: "% del cliente", formato: PORCEN, alinear: "right", ancho: 14 },
    ],
    filas: ordenClientes.flatMap(([id, c]) =>
      Object.entries(c.fases)
        .sort((a, b) => b[1] - a[1])
        .map(
          ([fase, min]) =>
            [
              clientNames[id] ?? "Cliente borrado",
              fase,
              enHoras(min),
              c.total > 0 ? min / c.total : 0,
            ] as Valor[],
        ),
    ),
  });

  // ================================================================ 7. Detalle
  const detalle = libro.addWorksheet("Detalle", {
    pageSetup: { paperSize: 9, orientation: "landscape", fitToPage: true },
  });
  f = portada(detalle, { titulo: "Tramo a tramo", periodo: cabeceraPeriodo, pie });

  tabla(detalle, f, {
    columnas: [
      { titulo: "Fecha", ancho: 13 },
      { titulo: "Día", ancho: 12 },
      { titulo: "Persona", ancho: 24 },
      { titulo: "Cliente", ancho: 24 },
      { titulo: "Qué ha hecho", ancho: 18 },
      { titulo: "Inicio", ancho: 9, alinear: "center" },
      { titulo: "Fin", ancho: 9, alinear: "center" },
      { titulo: "Horas", formato: HORAS, alinear: "right", ancho: 12, barra: true },
    ],
    filas: [...sessions]
      .sort((a, b) => a.started_at.localeCompare(b.started_at))
      .map(
        (s) =>
          [
            localDay(s.started_at),
            DIAS[new Date(s.started_at).getDay()],
            profileById[s.profile_id]?.full_name ?? "Alguien del equipo",
            clientNames[s.client_id] ?? "Cliente borrado",
            s.column_label || "Otros",
            hora(s.started_at),
            s.ended_at ? hora(s.ended_at) : "",
            enHoras(minutosDe(s, ahora)),
          ] as Valor[],
      ),
    congelar: true,
    filtros: true,
  });

  const nombre = `informe-tiempo-${periodo}-${localDay(desde.toISOString())}.xlsx`;
  await descargar(libro, nombre);
}

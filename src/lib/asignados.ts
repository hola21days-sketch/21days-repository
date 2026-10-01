"use client";

import type { SupabaseClient } from "@supabase/supabase-js";

/** Quién lleva cada tarea: id de tarea → lista de personas. */
export type Asignados = Record<string, string[]>;

type Fila = { task_id: string; profile_id: string };

/**
 * Quién lleva cada tarea.
 * ---------------------------------------------------------------------------
 * Una tarea puede repartirse entre dos o tres personas, así que esto vive en
 * su propia tabla y no en una columna de la tarea. Todas las pantallas que
 * enseñan tareas leen de aquí, para que no haya dos versiones de lo mismo.
 */
export async function leerAsignados(
  supabase: SupabaseClient,
  taskIds?: string[],
): Promise<Asignados> {
  let q = supabase.from("client_task_assignees").select("task_id, profile_id");
  if (taskIds) {
    if (taskIds.length === 0) return {};
    q = q.in("task_id", taskIds);
  }
  const { data } = await q;
  const mapa: Asignados = {};
  for (const f of (data ?? []) as Fila[]) {
    mapa[f.task_id] = [...(mapa[f.task_id] ?? []), f.profile_id];
  }
  return mapa;
}

/**
 * Pone o quita a una persona de una tarea. Devuelve cómo queda la lista, para
 * poder pintarlo sin esperar a la base de datos.
 */
export async function alternarAsignado(
  supabase: SupabaseClient,
  taskId: string,
  profileId: string,
  estaba: boolean,
): Promise<void> {
  if (estaba) {
    await supabase
      .from("client_task_assignees")
      .delete()
      .eq("task_id", taskId)
      .eq("profile_id", profileId);
  } else {
    await supabase
      .from("client_task_assignees")
      .insert({ task_id: taskId, profile_id: profileId });
  }
}

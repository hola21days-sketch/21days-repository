import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import Workspace from "@/components/Workspace";
import type { Profile } from "@/lib/types";
import { initialsOf, stampColor } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function BitacoraPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/entrar");

  // Red de seguridad: si el usuario se creó antes de instalar el trigger, le
  // damos perfil aquí mismo.
  let { data: me } = await supabase.from("profiles").select("*").eq("id", user.id).maybeSingle();
  if (!me) {
    const fallbackName =
      (user.user_metadata?.full_name as string | undefined) ?? user.email?.split("@")[0] ?? "Equipo";
    const { data: created } = await supabase
      .from("profiles")
      .insert({
        id: user.id,
        email: user.email ?? "",
        full_name: fallbackName,
        initials: initialsOf(fallbackName),
        color: stampColor(user.id),
      })
      .select("*")
      .single();
    me = created ?? null;
  }

  if (!me) {
    return (
      <main className="gate__form-wrap">
        <div className="gate__form">
          <h1 className="gate__title">No hemos podido preparar tu perfil</h1>
          <p className="gate__sub">
            Comprueba que el esquema de Supabase está instalado (supabase/schema.sql) y vuelve a
            entrar.
          </p>
        </div>
      </main>
    );
  }

  const [profiles, clients, members, columns, cards, assignees, reads, chatState] = await Promise.all([
    supabase.from("profiles").select("*").eq("active", true).order("full_name"),
    supabase.from("clients").select("*").eq("archived", false).order("position").order("name"),
    supabase.from("client_members").select("*"),
    supabase.from("board_columns").select("*").order("position"),
    supabase.from("cards").select("*").order("position"),
    supabase.from("card_assignees").select("*"),
    supabase.from("chat_reads").select("*").eq("profile_id", user.id),
    supabase.from("client_chat_state").select("*"),
  ]);

  return (
    <Workspace
      initial={{
        me: me as Profile,
        profiles: (profiles.data ?? []) as Profile[],
        clients: clients.data ?? [],
        members: members.data ?? [],
        columns: columns.data ?? [],
        cards: cards.data ?? [],
        assignees: assignees.data ?? [],
        reads: reads.data ?? [],
        chatState: chatState.data ?? [],
      }}
    />
  );
}

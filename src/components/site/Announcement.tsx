import { getSettings } from "@/lib/db/settings";

/** Bandeau noir au-dessus de l'en-tête. Ne rend rien s'il est désactivé ou vide. */
export async function Announcement() {
  const { announcement } = await getSettings();
  if (!announcement.enabled || !announcement.text.trim()) return null;
  return (
    <aside className="bg-ink px-5 py-2.5 text-center text-xs font-semibold leading-relaxed tracking-[0.04em] text-white">
      {announcement.text}
    </aside>
  );
}

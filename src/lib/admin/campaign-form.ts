/*
 * Les trois lectures de formulaire que partagent une campagne et une participation :
 * elles se règlent avec les mêmes champs (dates, contrat, kit), et doivent donc les
 * comprendre de la même façon. Pures : aucune base, aucun « use server ».
 */

/*
 * Variables du contrat ajustées ici, postées en `cvar:CLÉ`. On ne garde que ce qui
 * diffère de la valeur du contrat : une valeur identique n'a pas à être recopiée, sans
 * quoi corriger un délai dans le contrat ne se répercuterait plus.
 */
export function contractVariablesFrom(formData: FormData): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of formData.entries()) {
    if (!key.startsWith("cvar:") || typeof value !== "string") continue;
    const name = key.slice(5);
    if (!/^[A-Z0-9_]{1,60}$/.test(name)) continue;
    const base = String(formData.get(`cbase:${name}`) ?? "");
    if (value.trim() !== base.trim()) out[name] = value.slice(0, 2000);
  }
  return out;
}

/** `slug:quantité, slug:quantité` — la forme que pose l'éditeur de kit. */
export function kitLines(raw: string): { slug: string; qty: number }[] {
  return raw
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const [slug, qty] = part.split(":");
      return { slug: slug.trim(), qty: Math.min(20, Math.max(1, Number(qty) || 1)) };
    })
    .filter((l) => l.slug);
}

/** Une date de formulaire (`AAAA-MM-JJ`) en horodatage ; la fin court jusqu'au soir. */
export function dayStamp(value: string, edge: "start" | "end"): number | null {
  if (!value) return null;
  const ts = new Date(`${value}T${edge === "start" ? "00:00:00" : "23:59:59"}`).getTime();
  return Number.isNaN(ts) ? null : ts;
}

/** L'inverse, pour remplir un `<input type="date">`. */
export const dayValue = (ts: number | undefined): string => (ts ? new Date(ts).toISOString().slice(0, 10) : "");

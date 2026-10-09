import type { CampaignPublication, ContractPublication } from "@/lib/domain/types";

/*
 * Les parutions dues par une campagne, et ce qu'on en sait.
 *
 * Le contrat dit ce qui est dû (« 2 vidéos TikTok »), la campagne dit ce qui a paru
 * (une case, un lien). Ce fichier met les deux en face : il DÉPLIE les quantités en
 * cases — deux vidéos font deux lignes, parce qu'on les publie l'une après l'autre et
 * qu'on veut le lien de chacune — et laisse tomber ce qui ne correspond à rien.
 *
 * Pur et testé : rien n'est lu ici. Le contrat fait foi ; ce que la campagne porte en
 * trop (une ligne retirée du contrat depuis) n'est pas affiché, mais n'est pas effacé
 * non plus — rétablir la ligne au contrat ramène ses liens.
 */

export type PublicationSlot = {
  /** « <id de la ligne>#<rang> ». */
  key: string;
  label: string;
  /** Le rang dans sa ligne, et combien elle en compte : « 2 sur 2 ». */
  index: number;
  qty: number;
  done: boolean;
  url: string;
  at?: number;
};

/*
 * Un lien VAUT la preuve. Une case décochée sous une adresse remplie ne dirait rien de
 * vrai : on oublie de cocher, on ne colle pas un lien par distraction.
 */
const isDone = (entry: CampaignPublication | undefined): boolean => Boolean(entry && (entry.done || entry.url.trim()));

export const slotKey = (id: string, index: number): string => `${id}#${index}`;

export function publicationSlots(required: ContractPublication[], recorded: CampaignPublication[]): PublicationSlot[] {
  const byKey = new Map(recorded.map((p) => [p.key, p]));
  const slots: PublicationSlot[] = [];
  for (const line of required) {
    for (let i = 0; i < line.qty; i++) {
      const key = slotKey(line.id, i);
      const entry = byKey.get(key);
      slots.push({ key, label: line.label, index: i, qty: line.qty, done: isDone(entry), url: entry?.url ?? "", at: entry?.at });
    }
  }
  return slots;
}

export type PublicationProgress = {
  done: number;
  total: number;
  /** Combien sont faites mais sans lien : c'est ce qu'il reste à récupérer. */
  withoutUrl: number;
  /** Y a-t-il quelque chose à suivre ? Sinon l'écran ne montre rien plutôt qu'un « 0 sur 0 ». */
  required: boolean;
  complete: boolean;
};

export function publicationProgress(slots: PublicationSlot[]): PublicationProgress {
  const done = slots.filter((s) => s.done).length;
  return {
    done,
    total: slots.length,
    withoutUrl: slots.filter((s) => s.done && !s.url.trim()).length,
    required: slots.length > 0,
    complete: slots.length > 0 && done === slots.length,
  };
}

/** « 3 parutions sur 5 », « Tout est paru », ou rien à dire. */
export function publicationLabel(p: PublicationProgress): string {
  if (!p.required) return "";
  if (p.complete) return p.withoutUrl > 0 ? `Tout est paru · ${p.withoutUrl} lien${p.withoutUrl > 1 ? "s" : ""} à récupérer` : "Tout est paru";
  return `${p.done} parution${p.done > 1 ? "s" : ""} sur ${p.total}`;
}

/* ---------- Ce que le contrat dit déjà en toutes lettres ---------- */

/*
 * Les parutions qu'on devine dans le résumé d'un contrat.
 *
 * Le résumé « Votre collaboration » énumère déjà les engagements, une ligne chacun —
 * « 1 réel Instagram », « 2 vidéos TikTok ». Les redemander en chiffres n'apprend rien
 * à personne : on les PROPOSE, et c'est l'administrateur qui tranche avant
 * d'enregistrer. Une proposition, donc, et jamais une déduction qui s'imposerait : le
 * texte d'un contrat n'a pas de grammaire, et ce qui est écrit pour être lu ne se lit
 * pas toujours comme on l'espère.
 *
 * Seules les lignes qui nomment un RÉSEAU ou une FORME de parution sont retenues :
 * « 40 photographies originales » est un fichier à recevoir, pas une publication, et le
 * proposer ici mélangerait les deux comptes.
 */
const PLATFORMS = /\b(tiktok|instagram|insta|facebook|youtube|snapchat|pinterest|linkedin|twitch)\b/i;
const FORMATS = /\b(r[ée]els?|reels?|stor(?:y|ies)|posts?|publications?|shorts?|carrousels?|lives?|unboxing)\b/i;

export function suggestPublications(summary: string): { id: string; label: string; qty: number }[] {
  const lines: { id: string; label: string; qty: number }[] = [];
  for (const raw of summary.split(/\r?\n/)) {
    /* Les puces d'une liste rédigée à la main, et les espaces autour. */
    const line = raw.replace(/^[\s*•\-–—]+/, "").trim();
    if (!line || line.length > 120) continue;
    if (!PLATFORMS.test(line) && !FORMATS.test(line)) continue;

    /* Le nombre de tête donne la quantité ; à défaut, une seule fois. */
    const m = line.match(/^(\d{1,2})\s*(?:[x×]\s*)?(.+)$/);
    const qty = m ? Math.min(20, Math.max(1, Number(m[1]))) : 1;
    const rest = (m ? m[2] : line).trim();
    if (!rest) continue;
    const label = (rest[0].toUpperCase() + rest.slice(1)).slice(0, 80);
    if (lines.some((l) => l.label.toLowerCase() === label.toLowerCase())) continue;
    lines.push({ id: "", label, qty });
  }
  return lines.slice(0, 40);
}

/* ---------- Ce que l'éditeur renvoie ---------- */

/*
 * Les lignes telles que l'éditeur les a sérialisées, remises en ordre.
 *
 * L'identifiant est conservé d'un enregistrement à l'autre : c'est lui qui rattache un
 * lien déjà saisi à sa ligne. Renommer « Vidéo TikTok » en « Réel TikTok » ne doit pas
 * perdre l'adresse qu'on y avait collée — d'où un identifiant, et non la position ni le
 * libellé. Un identifiant qui ne vient pas de CE contrat, ou qui a déjà servi dans la
 * même liste, est refait : rien du client ne décide d'un rattachement.
 *
 * Illisible : on rend ce qui était là. Une ligne sans nom est écartée en silence —
 * l'éditeur en ajoute une vide au clic, et une ligne qu'on n'a pas remplie n'exige rien.
 */
export function publicationLines(raw: string, previous: ContractPublication[], nextId: () => string): ContractPublication[] {
  if (!raw.trim()) return [];
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return previous;
  }
  if (!Array.isArray(data)) return previous;

  const known = new Set(previous.map((p) => p.id));
  const used = new Set<string>();
  const lines: ContractPublication[] = [];
  for (const entry of data.slice(0, 40)) {
    if (typeof entry !== "object" || entry === null) continue;
    const { id, label, qty } = entry as { id?: unknown; label?: unknown; qty?: unknown };
    const name = typeof label === "string" ? label.trim().slice(0, 80) : "";
    if (!name) continue;
    const times = Math.min(20, Math.max(1, Math.trunc(Number(qty)) || 1));
    const keep = typeof id === "string" && id && known.has(id) && !used.has(id);
    const final = keep ? (id as string) : nextId();
    used.add(final);
    lines.push({ id: final, label: name, qty: times });
  }
  return lines;
}

/*
 * Ce qu'on accepte comme lien : une adresse web, et rien d'autre. Un « tiktok.com/@moi »
 * sans protocole ne s'ouvrirait pas d'un clic, et un `javascript:` n'a rien à faire dans
 * un attribut href qu'un administrateur cliquera.
 */
export function cleanUrl(raw: string): string | null {
  const value = raw.trim();
  if (!value) return "";
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.toString().slice(0, 500);
  } catch {
    return null;
  }
}

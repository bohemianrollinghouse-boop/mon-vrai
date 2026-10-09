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

import type { Campaign, Operation } from "@/lib/domain/types";

/*
 * Ce qu'on sait dire d'une campagne partagée sans toucher à la base.
 *
 * « Campagne » = `Operation` : ce qu'on organise une fois et qu'on applique à plusieurs
 * partenaires. « Participation » = `Campaign` : ce qu'une personne en fait (voir le
 * commentaire de `Operation` dans domain/types.ts). Pur : l'administration, les actions
 * et les tests s'en servent tous et doivent répondre la même chose.
 */

/*
 * L'état d'une campagne se DÉDUIT de ses dates : il n'y a pas de statut à tenir à jour,
 * donc pas de statut qui puisse mentir. Une participation, elle, a bien un statut propre
 * — elle avance à son rythme, kit commandé puis contrat signé.
 */
export type OperationState = "upcoming" | "live" | "over";

export const OPERATION_STATE_LABELS: Record<OperationState, string> = {
  upcoming: "À venir",
  live: "En cours",
  over: "Terminée",
};

export function operationState(op: Pick<Operation, "startAt" | "endAt">, now: number): OperationState {
  if (op.startAt > now) return "upcoming";
  if (op.endAt < now) return "over";
  return "live";
}

/*
 * Les codes qu'on proposerait à ce partenaire, du plus souhaitable au moins.
 *
 * Son code précédent d'abord : sa communauté le connaît, et le reprendre ne coûte rien
 * — c'est déjà ce que fait une nouvelle campagne montée à la main. Sinon on le dérive de
 * son pseudo, puis de son nom, avec la remise en suffixe (MARIE10), et enfin numéroté
 * tant que c'est pris.
 *
 * Une liste, et non un code : dire si un code est libre demande la base, ce qui n'a rien
 * à faire ici. L'appelant descend la liste jusqu'au premier disponible.
 */
export function codeCandidates(partner: { handle: string; name: string; previous: string }, discount: number): string[] {
  const base = sanitize(partner.handle) || sanitize(partner.name) || "PARTENAIRE";
  const root = `${base}${discount}`.slice(0, 24);
  const out = [partner.previous.trim().toUpperCase(), root];
  for (let n = 2; n <= 20; n++) out.push(`${root.slice(0, 24 - String(n).length)}${n}`);
  return [...new Set(out)].filter((code) => /^[A-Z0-9]{2,24}$/.test(code));
}

/** Le code d'un partenaire aujourd'hui, pour le reprendre : le plus récent qu'il ait porté. */
export const lastCode = (participations: Campaign[]): string => participations.find((c) => c.code)?.code ?? "";

/** Majuscules sans accent ni ponctuation : ce qu'un code promo accepte. */
const sanitize = (raw: string): string =>
  raw
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 16);

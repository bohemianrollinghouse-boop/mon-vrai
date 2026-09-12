import "server-only";
import { FieldValue } from "firebase-admin/firestore";
import { Influencer, Promo, RefClicks, type CollaborationType, type PartnerSocials, type WelcomeKit } from "@/lib/domain/types";
import { col, newId, now, parseDoc, parseQuery } from "./helpers";

/*
 * Codes promo, influenceurs et clics de liens. Les codes sont indexés par leur libellé
 * (majuscules) ; un influenceur possède un code (document promos/<code> portant son id).
 */

const promos = () => col("promos");
const influencers = () => col("influencers");
const clicks = () => col("refClicks");

export async function listPromos(): Promise<Promo[]> {
  const list = await parseQuery(Promo, promos().limit(500));
  return list.sort((a, b) => b.createdAt - a.createdAt);
}

export async function getPromo(code: string): Promise<Promo | null> {
  return parseDoc(Promo, await promos().doc(code.toUpperCase()).get());
}

export async function getPromosByCodes(codes: string[]): Promise<Map<string, Promo>> {
  const unique = [...new Set(codes.map((c) => c.toUpperCase()))];
  const map = new Map<string, Promo>();
  await Promise.all(
    unique.map(async (c) => {
      const p = await getPromo(c);
      if (p) map.set(c, p);
    }),
  );
  return map;
}

export type PromoInput = Omit<Promo, "createdAt" | "updatedAt" | "uses">;

export async function upsertPromo(input: PromoInput): Promise<Promo> {
  const ref = promos().doc(input.code);
  const existing = parseDoc(Promo, await ref.get());
  const doc = Promo.parse({ ...input, uses: existing?.uses ?? 0, createdAt: existing?.createdAt ?? now(), updatedAt: now() });
  await ref.set(doc);
  return doc;
}

export async function deletePromo(code: string): Promise<void> {
  await promos().doc(code.toUpperCase()).delete();
}

export async function setPromoActive(code: string, active: boolean): Promise<void> {
  await promos().doc(code.toUpperCase()).update({ active, updatedAt: now() });
}

/** Une commande payée consomme une utilisation de chaque code appliqué. */
export async function incrementPromoUses(codes: string[]): Promise<void> {
  await Promise.all(codes.map((c) => promos().doc(c.toUpperCase()).update({ uses: FieldValue.increment(1), updatedAt: now() }).catch(() => undefined)));
}

/* ---------- Influenceurs ---------- */

export async function listInfluencers(): Promise<Influencer[]> {
  const list = await parseQuery(Influencer, influencers().limit(500));
  return list.sort((a, b) => a.createdAt - b.createdAt);
}

export async function getInfluencer(id: string): Promise<Influencer | null> {
  return parseDoc(Influencer, await influencers().doc(id).get());
}

export async function getInfluencerBySlug(slug: string): Promise<Influencer | null> {
  const snap = await influencers().where("slug", "==", slug).limit(1).get();
  const doc = snap.docs[0];
  return doc ? parseDoc(Influencer, doc) : null;
}

export async function getInfluencersByIds(ids: string[]): Promise<Map<string, Influencer>> {
  const map = new Map<string, Influencer>();
  await Promise.all(
    [...new Set(ids)].map(async (id) => {
      const i = await getInfluencer(id);
      if (i) map.set(id, i);
    }),
  );
  return map;
}

/*
 * Ce que le formulaire de l'admin porte. Le compte du partenaire (uid, dates
 * d'invitation et d'activation) et ses coordonnées bancaires vivent leur propre vie :
 * ils sont facultatifs ici et préservés à l'enregistrement, pour qu'un passage dans
 * la fiche ne déconnecte pas un partenaire déjà installé.
 */
export type InfluencerInput = Omit<
  Influencer,
  "id" | "createdAt" | "updatedAt" | "clicks" | "uid" | "invitedAt" | "activatedAt" | "iban" | "inviteToken" | "inviteExpiresAt" | "kitOrderId" | "kit" | "note" | "socials" | "collaborationType" | "contractId" | "signatureId" | "handle" | "platform"
> & {
  id?: string;
  uid?: string;
  invitedAt?: number;
  activatedAt?: number;
  iban?: string;
  kitOrderId?: string;
  kit?: WelcomeKit;
  note?: string;
  socials?: PartnerSocials;
  /* Anciens champs, gardés pour les fiches d'avant : la saisie se fait par les réseaux. */
  handle?: string;
  platform?: Influencer["platform"];
  collaborationType?: CollaborationType;
  contractId?: string;
  signatureId?: string;
};

/** Crée ou met à jour l'influenceur et son code promo (remise en pourcentage, cumulable avec rien par défaut). */
export async function upsertInfluencer(input: InfluencerInput): Promise<Influencer> {
  const id = input.id ?? newId("inf");
  const ref = influencers().doc(id);
  const existing = parseDoc(Influencer, await ref.get());
  const doc = Influencer.parse({
    ...input,
    id,
    clicks: existing?.clicks ?? 0,
    uid: input.uid ?? existing?.uid ?? "",
    invitedAt: input.invitedAt ?? existing?.invitedAt,
    activatedAt: input.activatedAt ?? existing?.activatedAt,
    iban: input.iban ?? existing?.iban ?? "",
    kitOrderId: input.kitOrderId ?? existing?.kitOrderId ?? "",
    kit: input.kit ?? existing?.kit,
    note: input.note ?? existing?.note ?? "",
    socials: input.socials ?? existing?.socials,
    handle: input.handle ?? existing?.handle ?? "",
    platform: input.platform ?? existing?.platform,
    collaborationType: input.collaborationType ?? existing?.collaborationType,
    contractId: input.contractId ?? existing?.contractId ?? "",
    signatureId: input.signatureId ?? existing?.signatureId ?? "",
    inviteToken: existing?.inviteToken ?? "",
    inviteExpiresAt: existing?.inviteExpiresAt,
    createdAt: existing?.createdAt ?? now(),
    updatedAt: now(),
  });
  await ref.set(doc);

  // Le code de l'influenceur est un code promo comme un autre, marqué de son id.
  if (existing && existing.code !== doc.code) await promos().doc(existing.code).delete().catch(() => undefined);
  const promoRef = promos().doc(doc.code);
  const existingPromo = parseDoc(Promo, await promoRef.get());
  await promoRef.set(
    Promo.parse({
      code: doc.code,
      description: `Code influenceur · ${doc.name}`,
      type: "percent",
      amount: doc.discount,
      minimum: 0,
      startAt: existingPromo?.startAt ?? now(),
      endAt: doc.endAt,
      perCustomer: existingPromo?.perCustomer ?? 1,
      stackWith: existingPromo?.stackWith ?? [],
      gifts: [],
      active: doc.active,
      influencerId: id,
      uses: existingPromo?.uses ?? 0,
      createdAt: existingPromo?.createdAt ?? now(),
      updatedAt: now(),
    }),
  );
  return doc;
}

export async function deleteInfluencer(id: string): Promise<void> {
  const existing = await getInfluencer(id);
  if (existing) await promos().doc(existing.code).delete().catch(() => undefined);
  await influencers().doc(id).delete();
}

/** Un clic sur un lien de suivi : compteur global + compteur du jour. */
export async function recordRefClick(influencerId: string, at = now()): Promise<void> {
  const day = new Date(at).toISOString().slice(0, 10);
  await Promise.all([
    influencers().doc(influencerId).update({ clicks: FieldValue.increment(1) }).catch(() => undefined),
    clicks().doc(`${influencerId}_${day}`).set({ influencerId, day, count: FieldValue.increment(1) }, { merge: true }),
  ]);
}

export async function listRefClicksSince(sinceDay: string): Promise<RefClicks[]> {
  return parseQuery(RefClicks, clicks().where("day", ">=", sinceDay));
}

/* ---------- Accès à l'espace partenaire ---------- */

const INVITE_DAYS = 14;

/*
 * Ouvre (ou renouvelle) une invitation. Le jeton est tiré au hasard, à usage unique,
 * et périme au bout de deux semaines : une adresse qui traîne dans une boîte mail ne
 * doit pas rester une porte ouverte indéfiniment.
 */
export async function issueInfluencerInvite(id: string): Promise<{ influencer: Influencer; token: string } | null> {
  const ref = influencers().doc(id);
  const existing = parseDoc(Influencer, await ref.get());
  if (!existing) return null;
  const token = `${newId("inv")}${newId("")}`.replace(/-/g, "");
  const doc = Influencer.parse({ ...existing, inviteToken: token, inviteExpiresAt: now() + INVITE_DAYS * 86_400_000, invitedAt: now(), updatedAt: now() });
  await ref.set(doc);
  return { influencer: doc, token };
}

/** Le partenaire visé par une invitation encore valable, sinon null. */
export async function getInfluencerByInvite(token: string): Promise<Influencer | null> {
  if (!token) return null;
  const snap = await influencers().where("inviteToken", "==", token).limit(1).get();
  const found = snap.docs[0] ? parseDoc(Influencer, snap.docs[0]) : null;
  if (!found || !found.inviteExpiresAt || found.inviteExpiresAt < now()) return null;
  return found;
}

/** Rattache le compte Firebase au partenaire et ferme l'invitation. */
export async function activateInfluencer(id: string, uid: string): Promise<Influencer | null> {
  const ref = influencers().doc(id);
  const existing = parseDoc(Influencer, await ref.get());
  if (!existing) return null;
  const doc = Influencer.parse({ ...existing, uid, activatedAt: now(), inviteToken: "", inviteExpiresAt: undefined, updatedAt: now() });
  await ref.set(doc);
  return doc;
}

/** Le partenaire rattaché à un compte, pour l'espace et la page compte. */
export async function getInfluencerByUid(uid: string): Promise<Influencer | null> {
  if (!uid) return null;
  const snap = await influencers().where("uid", "==", uid).limit(1).get();
  return snap.docs[0] ? parseDoc(Influencer, snap.docs[0]) : null;
}

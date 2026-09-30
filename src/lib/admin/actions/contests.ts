"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { audit } from "@/lib/admin/audit";
import { dayStamp, kitLines } from "@/lib/admin/campaign-form";
import { parseForm } from "@/lib/admin/form";
import { failed, saved, type AdminResult } from "@/lib/admin/types";
import { assertAdmin } from "@/lib/auth/session";
import { optionOfferCode, shippingOptions } from "@/lib/checkout/quote";
import { prizeSaid } from "@/lib/contests/state";
import { addHosts, addWinner, deleteContest, getContest, removeHost, removeWinner, setContestPublished, updateWinner, upsertContest } from "@/lib/db/contests";
import { createPrizeOrder } from "@/lib/db/orders";
import { listAllProducts } from "@/lib/db/products";
import { getInfluencer } from "@/lib/db/promos";
import { getSettings } from "@/lib/db/settings";
import { ContestPlatform, type Address, type ContestHost } from "@/lib/domain/types";
import { kitItems, kitOrderLines, kitWeightG } from "@/lib/promos/kit";
import { bracketIndexForWeight } from "@/lib/shipping/tariffs";

/*
 * Les concours : ce qu'on met en jeu, avec qui, et qui a gagné.
 *
 * Trois choses se règlent ici et nulle part ailleurs : le concours lui-même, ses
 * co-organisateurs, et le départ du lot d'un gagnant — une commande offerte, comme un
 * kit de partenaire (voir `createPrizeOrder`). Le reste, un co-organisateur le fait
 * depuis son espace (`lib/auth/partner-actions.ts`) : déclarer son gagnant, dire ce que
 * sa publication a donné.
 */

const contestPath = (id: string) => `/admin/concours/${id}`;

/* Les écrans qu'une écriture peut changer : le concours, la liste, les espaces partenaires. */
function touched(id: string): void {
  revalidatePath("/admin/concours");
  revalidatePath(contestPath(id));
  revalidatePath("/partenaire");
}

const Input = z.object({
  id: z.string().default(""),
  name: z.string().trim().min(1).max(80),
  platform: ContestPlatform.default("instagram"),
  startAt: z.string().trim().default(""),
  endAt: z.string().trim().default(""),
  winnersWanted: z.number().int().min(1).max(50).default(1),
  mechanic: z.string().trim().max(1000).default(""),
  rules: z.string().trim().max(2000).default(""),
  postUrl: z.string().trim().max(300).default(""),
  participants: z.number().int().min(0).default(0),
  published: z.boolean().default(false),
  note: z.string().trim().max(2000).default(""),
  /* Le lot, dans le même formulaire : il fait partie de ce qui se décide. */
  extra: z.string().trim().max(200).default(""),
  deductStock: z.boolean().default(false),
  /** Sélection sérialisée par l'éditeur : `slug:quantité`, séparés par des virgules. */
  lines: z.string().default(""),
});

export async function saveContestAction(formData: FormData): Promise<AdminResult> {
  const user = await assertAdmin();
  const parsed = parseForm(Input, formData, { numbers: ["winnersWanted", "participants"], booleans: ["published", "deductStock"] });
  if (!parsed.ok) return failed(parsed.error, parsed.issues);
  const d = parsed.data;

  const existing = d.id ? await getContest(d.id) : null;
  if (d.id && !existing) return failed("Concours introuvable");

  const startAt = dayStamp(d.startAt, "start");
  const endAt = dayStamp(d.endAt, "end");
  if (startAt === null) return failed("Indiquez la date d'ouverture du concours.", { startAt: "Date requise" });
  if (endAt === null) return failed("Indiquez la date du tirage.", { endAt: "Date requise" });
  if (endAt < startAt) return failed("Le tirage précède l'ouverture.", { endAt: "Après l'ouverture" });

  const prize = { lines: kitLines(d.lines), extra: d.extra, deductStock: d.deductStock };
  /*
   * Publier, c'est montrer le concours à des créateurs qui vont l'annoncer : un lot vide
   * ne se publie pas. En brouillon, tout est permis — on est en train d'y réfléchir.
   */
  if (d.published && !prizeSaid(prize)) {
    return failed("Dites ce qui est en jeu avant de publier le concours.", { lines: "Lot vide" });
  }
  /* Moins de places que de gagnants déjà déclarés : le tirage serait à refaire. */
  if (existing && d.winnersWanted < existing.winners.length) {
    return failed(`${existing.winners.length} gagnant(s) sont déjà déclarés : retirez-en avant de réduire le nombre de lots.`, { winnersWanted: "Trop bas" });
  }

  const contest = await upsertContest({
    id: existing?.id,
    name: d.name,
    platform: d.platform,
    startAt,
    endAt,
    mechanic: d.mechanic,
    rules: d.rules,
    prize,
    winnersWanted: d.winnersWanted,
    /* Ni les co-organisateurs ni les gagnants ne passent par ce formulaire : ils ont
       leurs propres actions, dont deux s'exécutent depuis l'espace partenaire. */
    hosts: existing?.hosts ?? [],
    winners: existing?.winners ?? [],
    published: d.published,
    /* Qui l'a monté ne se réécrit pas depuis cet écran : c'est un fait, pas un réglage. */
    proposedBy: existing?.proposedBy ?? "",
    postUrl: d.postUrl,
    participants: d.participants,
    note: d.note,
  });

  await audit(user.email, existing ? "contest.update" : "contest.create", `contests/${contest.id}`, contest.name);
  touched(contest.id);
  if (!existing) return { ok: true, message: `Concours « ${contest.name} » créé.`, redirectTo: contestPath(contest.id) };
  return saved(`Concours « ${contest.name} » enregistré.`);
}

/*
 * Valider la proposition d'un partenaire : la mettre en ligne, d'un seul geste.
 *
 * Le même interrupteur est au bas du formulaire, parmi tout ce qui se règle — mais une
 * proposition n'attend de nous qu'une chose, et elle doit se faire là où le bandeau
 * l'annonce. L'action ne réécrit QUE la publication : ce que le partenaire a écrit et le
 * lot qu'on vient d'enregistrer restent tels quels.
 *
 * Le lot reste exigé, comme à l'enregistrement : publier, c'est montrer le concours à des
 * créateurs qui vont l'annoncer, et un lot vide n'annonce rien.
 */
export async function publishContestAction(formData: FormData): Promise<AdminResult> {
  const user = await assertAdmin();
  const id = String(formData.get("id") ?? "");
  const contest = await getContest(id);
  if (!contest) return failed("Concours introuvable");
  if (!prizeSaid(contest.prize)) return failed("Dites ce qui est en jeu avant de publier le concours.", { lines: "Lot vide" });

  const next = await setContestPublished(id, true);
  if (!next) return failed("Concours introuvable");

  await audit(user.email, "contest.publish", `contests/${id}`, next.name);
  touched(id);
  return saved(`Concours « ${next.name} » publié : ses co-organisateurs le voient dans leur espace.`);
}

export async function deleteContestAction(formData: FormData): Promise<AdminResult> {
  const user = await assertAdmin();
  const id = String(formData.get("id") ?? "");
  const contest = await getContest(id);
  if (!contest) return failed("Concours introuvable");
  /* Un lot parti est un fait : sa commande resterait sans rien pour l'expliquer. */
  if (contest.winners.some((w) => w.orderId)) return failed("Un lot au moins est déjà parti : ce concours ne peut plus être supprimé.");

  await deleteContest(id);
  await audit(user.email, "contest.delete", `contests/${id}`, contest.name);
  revalidatePath("/admin/concours");
  revalidatePath("/partenaire");
  /* Redirection côté serveur : la route courante est le concours qu'on vient d'effacer. */
  redirect("/admin/concours");
}

/* ---------- Les co-organisateurs ---------- */

const HostsInput = z.object({
  contestId: z.string().min(1),
  influencerIds: z.array(z.string()).default([]),
  /* Un créateur sans fiche : nom et pseudo, rien de plus — il ne verra pas le concours. */
  guestName: z.string().trim().max(80).default(""),
  guestHandle: z.string().trim().max(80).default(""),
});

/*
 * Ajoute des co-organisateurs. Deux sortes dans le même geste : des partenaires de la
 * base, qui verront le concours dans leur espace et pourront y déclarer leur gagnant ;
 * et des créateurs invités pour ce jeu-là, dont on ne garde que le nom.
 */
export async function addContestHostsAction(formData: FormData): Promise<AdminResult> {
  const user = await assertAdmin();
  const parsed = parseForm(HostsInput, formData);
  if (!parsed.ok) return failed(parsed.error, parsed.issues);
  const d = parsed.data;

  const contest = await getContest(d.contestId);
  if (!contest) return failed("Concours introuvable");

  const hosts: ContestHost[] = [];
  for (const id of new Set(d.influencerIds.filter(Boolean))) {
    const influencer = await getInfluencer(id);
    if (!influencer) continue;
    /* L'identifiant du partenaire fait celui du co-organisateur : il ne peut donc pas
       figurer deux fois, et ses gagnants ne perdent pas leur rattachement. */
    hosts.push({ id: influencer.id, influencerId: influencer.id, name: influencer.name, handle: influencer.handle, postUrl: "", participants: 0, followers: 0 });
  }
  if (d.guestName) {
    hosts.push({ id: `gst_${Date.now().toString(36)}`, influencerId: "", name: d.guestName, handle: d.guestHandle, postUrl: "", participants: 0, followers: 0 });
  }
  if (hosts.length === 0) return failed("Cochez un partenaire, ou nommez un créateur invité.");

  const next = await addHosts(contest.id, hosts);
  if (!next) return failed("Concours introuvable");
  const added = next.hosts.length - contest.hosts.length;
  await audit(user.email, "contest.hosts", `contests/${contest.id}`, hosts.map((h) => h.name).join(", "));
  touched(contest.id);
  if (added === 0) return failed("Ces créateurs co-organisent déjà ce concours.");
  return saved(`${added} co-organisateur${added > 1 ? "s" : ""} ajouté${added > 1 ? "s" : ""}.`);
}

export async function removeContestHostAction(formData: FormData): Promise<AdminResult> {
  const user = await assertAdmin();
  const contestId = String(formData.get("contestId") ?? "");
  const hostId = String(formData.get("hostId") ?? "");
  const contest = await getContest(contestId);
  const host = contest?.hosts.find((h) => h.id === hostId);
  if (!contest || !host) return failed("Co-organisateur introuvable");

  await removeHost(contestId, hostId);
  await audit(user.email, "contest.host.remove", `contests/${contestId}`, host.name);
  touched(contestId);
  const orphans = contest.winners.filter((w) => w.hostId === hostId).length;
  return saved(orphans ? `${host.name} ne co-organise plus ce concours. Ses ${orphans} gagnant(s) restent à servir.` : `${host.name} ne co-organise plus ce concours.`);
}

/* ---------- Les gagnants ---------- */

/*
 * L'adresse est facultative en bloc : on peut noter un gagnant le soir du tirage et
 * n'avoir ses coordonnées que le lendemain. Elle devient obligatoire au moment d'envoyer
 * le lot, et c'est là qu'elle est vérifiée.
 */
const WinnerInput = z.object({
  contestId: z.string().min(1),
  winnerId: z.string().default(""),
  hostId: z.string().default(""),
  handle: z.string().trim().max(80).default(""),
  name: z.string().trim().max(120).default(""),
  email: z.string().trim().max(160).default(""),
  note: z.string().trim().max(500).default(""),
  address: z
    .object({
      line1: z.string().trim().max(160).default(""),
      line2: z.string().trim().max(160).default(""),
      postalCode: z.string().trim().max(12).default(""),
      city: z.string().trim().max(80).default(""),
      country: z.string().trim().max(2).default("FR"),
      phone: z.string().trim().max(30).default(""),
    })
    .default({ line1: "", line2: "", postalCode: "", city: "", country: "FR", phone: "" }),
});

/* Dans un fichier « use server », tout ce qui est exporté doit être une action : ce type
   et l'aide qui suit ne sortent donc pas d'ici. */
type WinnerAddressFields = z.infer<typeof WinnerInput>["address"];

/*
 * L'adresse telle qu'on la gardera, ou rien. Tout ou rien : une adresse à moitié remplie
 * ne sert à personne et laisserait croire qu'un colis peut partir.
 */
function addressOrNull(name: string, a: WinnerAddressFields): Address | null {
  if (!a.line1 || !a.postalCode || !a.city) return null;
  return {
    name: name || "Gagnant",
    line1: a.line1,
    line2: a.line2 || undefined,
    postalCode: a.postalCode,
    city: a.city,
    country: (a.country || "FR").toUpperCase(),
    phone: a.phone || undefined,
  };
}

export async function saveWinnerAction(formData: FormData): Promise<AdminResult> {
  const user = await assertAdmin();
  const parsed = parseForm(WinnerInput, formData);
  if (!parsed.ok) return failed(parsed.error, parsed.issues);
  const d = parsed.data;

  const contest = await getContest(d.contestId);
  if (!contest) return failed("Concours introuvable");
  if (!d.handle && !d.name) return failed("Donnez au moins le pseudo du gagnant.", { handle: "Pseudo requis" });
  if (d.hostId && !contest.hosts.some((h) => h.id === d.hostId)) return failed("Ce co-organisateur ne participe pas à ce concours.");

  const address = addressOrNull(d.name, d.address) ?? undefined;

  if (d.winnerId) {
    const current = contest.winners.find((w) => w.id === d.winnerId);
    if (!current) return failed("Gagnant introuvable");
    /* Le lot parti, l'adresse ne se corrige plus ici : c'est la commande qui fait foi. */
    const patch = current.orderId
      ? { hostId: d.hostId, handle: d.handle, name: d.name, email: d.email, note: d.note }
      : { hostId: d.hostId, handle: d.handle, name: d.name, email: d.email, note: d.note, address };
    await updateWinner(d.contestId, d.winnerId, patch);
    await audit(user.email, "contest.winner.update", `contests/${d.contestId}`, d.handle || d.name);
    touched(d.contestId);
    return saved(current.orderId ? "Gagnant corrigé. Le lot étant parti, l'adresse se corrige sur la commande." : "Gagnant enregistré.");
  }

  const done = await addWinner(d.contestId, {
    hostId: d.hostId,
    handle: d.handle,
    name: d.name,
    email: d.email,
    address,
    declaredBy: "admin",
    note: d.note,
  });
  if (!done) return failed(`Les ${contest.winnersWanted} lot(s) de ce concours ont déjà trouvé preneur.`);
  await audit(user.email, "contest.winner", `contests/${d.contestId}`, d.handle || d.name);
  touched(d.contestId);
  return saved("Gagnant déclaré.");
}

export async function removeWinnerAction(formData: FormData): Promise<AdminResult> {
  const user = await assertAdmin();
  const contestId = String(formData.get("contestId") ?? "");
  const winnerId = String(formData.get("winnerId") ?? "");
  const contest = await getContest(contestId);
  const winner = contest?.winners.find((w) => w.id === winnerId);
  if (!contest || !winner) return failed("Gagnant introuvable");
  if (winner.orderId) return failed("Son lot est déjà parti : annulez la commande plutôt que de le retirer d'ici.");

  await removeWinner(contestId, winnerId);
  await audit(user.email, "contest.winner.remove", `contests/${contestId}`, winner.handle || winner.name);
  touched(contestId);
  return saved("Gagnant retiré. Sa place est de nouveau à prendre.");
}

/* ---------- Envoyer le lot ---------- */

const ShipInput = z.object({
  contestId: z.string().min(1),
  winnerId: z.string().min(1),
  rateId: z.string().trim().min(1, "Choisissez un mode de livraison"),
});

/*
 * Crée la commande du lot : une commande offerte, à 0 €, expédiable par Boxtal comme les
 * autres depuis /admin/commandes — c'est là que l'étiquette se demande, et c'est elle qui
 * inscrira le port en dépense (voir lib/admin/gift-expense.ts).
 *
 * À domicile seulement : un gagnant donne son adresse, pas un point relais — il n'y a
 * aucune carte à lui montrer. Tout est relu en base ; le formulaire ne dit que le mode
 * de livraison.
 */
export async function shipPrizeAction(formData: FormData): Promise<AdminResult> {
  const user = await assertAdmin();
  const parsed = parseForm(ShipInput, formData);
  if (!parsed.ok) return failed(parsed.error, parsed.issues);
  const d = parsed.data;

  const contest = await getContest(d.contestId);
  const winner = contest?.winners.find((w) => w.id === d.winnerId);
  if (!contest || !winner) return failed("Gagnant introuvable");
  if (winner.orderId) return failed("Le lot de ce gagnant est déjà parti.");
  if (!winner.address) return failed("Renseignez l'adresse du gagnant avant d'envoyer son lot.");
  if (!winner.email) return failed("Renseignez l'e-mail du gagnant : une commande en a besoin pour le suivi.");

  const [products, settings] = await Promise.all([listAllProducts(), getSettings()]);
  const items = kitItems(contest.prize, products);
  if (items.length === 0) return failed("Le lot ne contient aucun livre du catalogue : rien à expédier.");
  if (!settings.shipping.countries.includes(winner.address.country)) return failed("Nous ne livrons pas encore dans ce pays.");

  const weight = Math.max(1, settings.shipping.parcel.baseWeightG + kitWeightG(items));
  const options = shippingOptions(settings.shipping.rates, bracketIndexForWeight(weight), true, true).filter((o) => !o.relay);
  const option = options.find((o) => o.id === d.rateId);
  if (!option) return failed("Un lot s'envoie à l'adresse du gagnant : choisissez une livraison à domicile.", { rateId: "Mode inconnu" });

  const order = await createPrizeOrder({
    contestId: contest.id,
    winnerId: winner.id,
    lines: kitOrderLines(items),
    email: winner.email.trim().toLowerCase(),
    shippingAddress: winner.address,
    delivery: { rateId: option.id, rateName: option.name, offerCode: optionOfferCode(option, winner.address.country) },
    livemode: settings.payments.mode === "live",
    deductStock: contest.prize.deductStock,
    note: `Lot du concours « ${contest.name} » · ${winner.handle || winner.name}`,
  });

  await updateWinner(contest.id, winner.id, { orderId: order.id });
  await audit(user.email, "contest.prize.ship", `orders/${order.id}`, `${contest.name} → ${winner.handle || winner.name}`);
  touched(contest.id);
  revalidatePath("/admin/commandes");
  return saved(`Lot à expédier — commande ${order.number}. Demandez son étiquette depuis la commande.`);
}

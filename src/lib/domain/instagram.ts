import { z } from "zod";

/*
 * Les réponses automatiques Instagram : ce qu'on reçoit, ce qu'on décide, ce qu'on
 * répond.
 *
 * Tout est pur ici — rien ne lit la base, rien n'appelle Meta. C'est voulu : une
 * automatisation qui écrit à des gens sans qu'on la regarde doit pouvoir se vérifier
 * entièrement hors ligne. Le choix de la règle, le texte retenu, le refus d'agir et
 * son motif se décident donc tous dans ce fichier, et `instagram/respond.ts` ne fait
 * qu'exécuter ce qu'on lui dit ici.
 *
 * Ce que Meta autorise, et qui dessine tout le reste :
 *  — on ne peut PAS écrire à un nouvel abonné. On ne répond qu'à quelqu'un qui a
 *    engagé la conversation : un DM reçu ouvre 24 h, un commentaire ouvre 7 jours et
 *    donne droit à UNE réponse privée, pas deux ;
 *  — une réponse publique sous un commentaire est elle-même un commentaire, et Meta
 *    nous la renvoie par webhook. Sans garde-fou, le dispositif se répond à lui-même
 *    jusqu'à épuisement du quota. D'où `ownComment` plus bas, qui n'est pas une
 *    précaution mais la condition pour que tout ceci puisse tourner.
 */

/* ---------- Le compte connecté ---------- */

/*
 * Ce qu'on retient de la connexion OAuth. Le jeton vaut 60 jours et se renouvelle ;
 * `expiresAt` existe pour qu'on puisse le renouveler AVANT qu'il meure, et surtout
 * pour que l'écran puisse dire « la connexion expire dans 4 jours » plutôt que de
 * laisser découvrir la panne par l'absence de réponses.
 *
 * `scopes` est relu tel que Meta nous l'a accordé, et non tel qu'on l'a demandé :
 * une permission refusée à l'écran de consentement doit se voir, sinon on cherche la
 * panne du côté du code.
 */
export const IgConnection = z.object({
  /** L'identifiant du compte professionnel, tel que Meta le nomme (IGID). */
  igUserId: z.string().min(1),
  username: z.string().default(""),
  accessToken: z.string().min(1),
  /** Fin de validité du jeton long, en millisecondes. */
  expiresAt: z.number(),
  scopes: z.array(z.string()).default([]),
  connectedAt: z.number(),
  /** Dernier renouvellement réussi — pour qu'une connexion muette se distingue d'une connexion jeune. */
  refreshedAt: z.number().default(0),
});
export type IgConnection = z.infer<typeof IgConnection>;

/* ---------- Les règles ---------- */

/*
 * Sur quoi une règle se déclenche. Deux portes d'entrée, et deux seulement, parce que
 * ce sont les deux que Meta nous ouvre : un commentaire sous une publication, un
 * message reçu en direct.
 */
export const IgTrigger = z.enum(["comment", "message"]);
export type IgTrigger = z.infer<typeof IgTrigger>;

export const IgRule = z.object({
  id: z.string().min(1),
  /** Le nom qu'on lui donne — il ne sert qu'à s'y retrouver dans la liste et le journal. */
  name: z.string().trim().max(80).default(""),
  on: IgTrigger.default("comment"),
  enabled: z.boolean().default(true),
  /*
   * Les mots qui déclenchent. Vide = la règle attrape tout ce qui arrive par sa porte.
   * C'est légitime (un accusé de réception à tout premier message), mais ça éteint
   * tout ce qui suit : `shadowedRules` le signale à l'écran plutôt que de réordonner
   * dans le dos de celui qui a écrit la liste.
   */
  keywords: z.array(z.string().trim().min(1).max(40)).max(20).default([]),
  /*
   * Les publications concernées, par leur identifiant. Vide = toutes, celles d'après
   * comprises — c'est le cas ordinaire, et ça évite d'avoir à revenir ici après chaque
   * post. On ne cible une publication que pour une opération précise.
   */
  mediaIds: z.array(z.string().trim().min(1).max(60)).max(50).default([]),
  /*
   * Les réponses publiques possibles. PLUSIEURS, et tirées à tour de rôle : dix fois la
   * même phrase mot pour mot sous dix commentaires, ça se lit comme un robot, et Meta
   * le lit aussi comme un robot. Liste vide = on ne répond pas en public.
   */
  publicReplies: z.array(z.string().trim().min(1).max(280)).max(10).default([]),
  /*
   * La réponse privée — le commentaire part en DM. Une seule formulation possible ici :
   * c'est un message qu'une personne reçoit une fois, la variété n'y sert à rien.
   * Vide = pas de message privé.
   */
  privateReply: z.string().trim().max(900).default(""),
  createdAt: z.number().default(0),
  updatedAt: z.number().default(0),
});
export type IgRule = z.infer<typeof IgRule>;

/* ---------- Les réglages du dispositif ---------- */

/*
 * L'interrupteur général, l'essai à blanc et le plafond. Les trois existent pour la
 * même raison : ce code écrit à de vraies personnes, sans qu'on soit devant.
 */
export const IgSettings = z.object({
  /** Rien n'est envoyé tant que ceci est faux. C'est le seul geste pour tout arrêter. */
  enabled: z.boolean().default(false),
  /*
   * Essai à blanc : on décide tout, on journalise tout, on n'envoie rien. Les premiers
   * jours se passent là — on vérifie sur de vrais commentaires ce que le dispositif
   * AURAIT répondu, ce qu'aucun jeu d'essai ne montre aussi bien.
   */
  dryRun: z.boolean().default(true),
  /*
   * Plafond d'envois par heure. Un post qui marche, ou une règle mal écrite, ne doivent
   * pas pouvoir partir en trois mille messages : au-delà, on cesse d'envoyer et on
   * journalise le refus. Meta plafonne de son côté à 750 réponses privées par heure ;
   * celui-ci est le nôtre, et il est volontairement bien plus bas.
   */
  hourlyCap: z.number().int().min(1).max(500).default(60),
});
export type IgSettings = z.infer<typeof IgSettings>;

export const EMPTY_IG_SETTINGS: IgSettings = { enabled: false, dryRun: true, hourlyCap: 60 };

/* ---------- Le journal ---------- */

/*
 * Ce qui est arrivé et ce qu'on en a fait. Il n'est pas là pour faire joli : c'est lui
 * qui répond à « pourquoi ce commentaire n'a-t-il rien reçu ? », la seule question
 * qu'on se pose vraiment une fois le dispositif en route. Un envoi sans journal est un
 * envoi qu'on ne peut ni expliquer ni corriger.
 */
export const IgAction = z.object({
  kind: z.enum(["publicReply", "privateReply"]),
  text: z.string().default(""),
  ok: z.boolean().default(false),
  error: z.string().default(""),
});
export type IgAction = z.infer<typeof IgAction>;

export const IgEvent = z.object({
  id: z.string().min(1),
  at: z.number(),
  kind: IgTrigger,
  /** L'identifiant Meta du commentaire ou du message : c'est lui qui interdit le doublon. */
  sourceId: z.string().default(""),
  /** Qui a écrit — l'identifiant est toujours là, le pseudo pas toujours. */
  fromId: z.string().default(""),
  fromUsername: z.string().default(""),
  text: z.string().max(2000).default(""),
  mediaId: z.string().default(""),
  ruleId: z.string().default(""),
  ruleName: z.string().default(""),
  actions: z.array(IgAction).default([]),
  /** Dit pourquoi rien n'est parti. Vide quand quelque chose est parti. */
  skipped: z.string().default(""),
  /** L'événement a-t-il été seulement simulé (essai à blanc) ? */
  dryRun: z.boolean().default(false),
});
export type IgEvent = z.infer<typeof IgEvent>;

/* ---------- Reconnaître un mot ---------- */

/*
 * Le texte ramené à ce qu'on compare : minuscules, accents retirés, espaces resserrés.
 * « LIVRÉ », « livre » et « Livré !! » doivent déclencher le même mot-clé — on écrit
 * un commentaire au pouce, dans le métro, et exiger l'accent reviendrait à rater la
 * moitié des gens.
 */
export function normalise(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/*
 * Le mot-clé est cherché comme un MOT, pas comme une suite de lettres : « livre » ne
 * doit pas se déclencher sur « délivrer » ni sur « livresque ». D'où les deux
 * sentinelles, qui exigent autre chose qu'une lettre ou un chiffre de part et d'autre.
 *
 * Elles laissent passer les emoji sans rien de spécial à écrire : un cœur n'est ni
 * lettre ni chiffre, donc « ❤️ » posé comme mot-clé se reconnaît au milieu d'une
 * phrase comme en rafale. Et un mot-clé en plusieurs mots (« je veux ») marche aussi,
 * puisqu'on compare du texte déjà resserré.
 */
export function hasKeyword(text: string, keyword: string): boolean {
  const needle = normalise(keyword);
  if (!needle) return false;
  return new RegExp(`(?<![\\p{L}\\p{N}])${escapeRe(needle)}(?![\\p{L}\\p{N}])`, "u").test(normalise(text));
}

/** Un seul mot-clé suffit : la liste est un OU, jamais un ET. */
export const matchesKeywords = (text: string, keywords: string[]): boolean => keywords.some((k) => hasKeyword(text, k));

/* ---------- Choisir la règle ---------- */

export type Incoming = {
  kind: IgTrigger;
  text: string;
  /** Vide pour un message privé : il ne vient d'aucune publication. */
  mediaId?: string;
};

/*
 * La règle qui s'applique : la PREMIÈRE de la liste qui convient, et l'ordre est celui
 * qu'on a écrit. On ne réordonne pas pour « faire au mieux » — deux règles qui se
 * disputent un commentaire doivent se départager d'une façon qu'on puisse prévoir en
 * lisant l'écran, et non d'après une finesse enfouie ici.
 */
export function pickRule(rules: IgRule[], incoming: Incoming): IgRule | null {
  return rules.find((r) => ruleAccepts(r, incoming)) ?? null;
}

export function ruleAccepts(rule: IgRule, incoming: Incoming): boolean {
  if (!rule.enabled) return false;
  if (rule.on !== incoming.kind) return false;
  /* Une règle visant des publications précises ne regarde qu'elles. */
  if (rule.mediaIds.length > 0 && !rule.mediaIds.includes(incoming.mediaId ?? "")) return false;
  /* Sans mot-clé, la règle prend tout ce qui lui parvient par cette porte. */
  if (rule.keywords.length === 0) return true;
  return matchesKeywords(incoming.text, rule.keywords);
}

/*
 * Les règles qui ne serviront jamais : une règle sans mot-clé ni publication ciblée
 * attrape tout ce qui passe par sa porte, et celles qui la suivent sur la même porte
 * sont mortes. L'écran le dit plutôt que de les réordonner — c'est la liste écrite qui
 * fait foi, mais personne ne doit croire qu'une règle agit alors qu'elle ne peut pas.
 */
export function shadowedRules(rules: IgRule[]): string[] {
  const caught = new Set<IgTrigger>();
  const dead: string[] = [];
  for (const rule of rules) {
    if (!rule.enabled) continue;
    if (caught.has(rule.on)) dead.push(rule.id);
    else if (rule.keywords.length === 0 && rule.mediaIds.length === 0) caught.add(rule.on);
  }
  return dead;
}

/* ---------- Choisir la formulation ---------- */

/*
 * Laquelle des formulations part. Tirée d'après l'identifiant du commentaire, et non
 * au hasard ni à tour de rôle : Meta rejoue ses webhooks, et le même commentaire doit
 * donner le même texte à chaque rejeu, sinon un incident réseau se solde par deux
 * réponses différentes sous le même message. Un compteur en base aurait le même défaut
 * et coûterait une écriture de plus.
 *
 * La répartition n'a pas besoin d'être parfaite, seulement de ne pas se voir : les
 * identifiants Meta sont des grands nombres qui se suivent, la somme de leurs
 * caractères suffit largement à alterner.
 */
export function variantFor(variants: string[], key: string): string {
  if (variants.length === 0) return "";
  let sum = 0;
  for (let i = 0; i < key.length; i++) sum = (sum * 31 + key.charCodeAt(i)) >>> 0;
  return variants[sum % variants.length];
}

/* ---------- Ce qu'on refuse de faire ---------- */

/*
 * Le commentaire vient-il de nous ? Une réponse publique est un commentaire de plus,
 * que Meta nous renvoie aussitôt : sans cette question posée en premier, le dispositif
 * se répond à lui-même et ne s'arrête plus. C'est LE garde-fou du dossier.
 */
export const ownComment = (fromId: string, igUserId: string): boolean => fromId !== "" && fromId === igUserId;

export type Decision =
  | { act: false; reason: string }
  | { act: true; rule: IgRule; publicReply: string; privateReply: string };

/*
 * Tout ce qui se décide avant d'appeler Meta, en une fois et sans effet de bord. Le
 * motif du refus est une phrase destinée au journal, donc à être lue par quelqu'un qui
 * cherche pourquoi son commentaire est resté sans réponse.
 */
export function decide(input: {
  incoming: Incoming;
  fromId: string;
  igUserId: string;
  sourceId: string;
  rules: IgRule[];
  settings: IgSettings;
  sentThisHour: number;
}): Decision {
  if (!input.settings.enabled) return { act: false, reason: "Réponses automatiques éteintes" };
  if (ownComment(input.fromId, input.igUserId)) return { act: false, reason: "Commentaire de notre propre compte" };

  const rule = pickRule(input.rules, input.incoming);
  if (!rule) return { act: false, reason: "Aucune règle ne correspond" };

  const publicReply = input.incoming.kind === "comment" ? variantFor(rule.publicReplies, input.sourceId) : "";
  const privateReply = rule.privateReply;
  if (!publicReply && !privateReply) return { act: false, reason: `La règle « ${rule.name || rule.id} » n'a rien à répondre` };

  /* Le plafond se vérifie en dernier : on veut savoir quelle règle AURAIT agi. */
  if (input.sentThisHour >= input.settings.hourlyCap) {
    return { act: false, reason: `Plafond horaire atteint (${input.settings.hourlyCap}) — rien n'est envoyé` };
  }
  return { act: true, rule, publicReply, privateReply };
}

/* ---------- Le jeton ---------- */

const DAY = 24 * 60 * 60 * 1000;

/*
 * Faut-il renouveler ? Le jeton vaut 60 jours, Meta refuse de le renouveler avant ses
 * 24 heures, et une connexion qui meurt ne se signale par rien d'autre que l'arrêt des
 * réponses. On s'y prend donc dix jours à l'avance : largement de quoi encaisser une
 * panne passagère chez Meta sans perdre la connexion.
 */
export const tokenStale = (expiresAt: number, at: number, marginDays = 10): boolean => expiresAt - at < marginDays * DAY;

/** Jeton mort : il n'y a plus rien à renouveler, il faut se reconnecter à la main. */
export const tokenDead = (expiresAt: number, at: number): boolean => expiresAt <= at;

/** « dans 42 jours », « expire aujourd'hui », « expiré » — ce que l'écran affiche. */
export function tokenLabel(expiresAt: number, at: number): string {
  const days = Math.floor((expiresAt - at) / DAY);
  if (days < 0) return "Connexion expirée";
  if (days === 0) return "Connexion expire aujourd'hui";
  return `Connexion valable encore ${days} jour${days > 1 ? "s" : ""}`;
}

/* ---------- Tout le dispositif, en un document ---------- */

/*
 * Connexion, réglages et règles vivent ensemble. Les règles ne font pas une collection
 * à part pour une raison de fond : leur ORDRE est leur priorité, et une liste dont
 * l'ordre compte se réécrit d'un bloc. En documents séparés il aurait fallu un champ
 * de position à tenir à jour, c'est-à-dire un état de plus qui puisse mentir — et deux
 * règles ne se départageraient plus en lisant l'écran.
 *
 * Le journal, lui, est bien une collection : il grossit sans fin et se lit par tranches.
 */
export const IgIntegration = z.object({
  /** Absente tant que personne n'a connecté de compte — l'écran doit pouvoir s'afficher. */
  connection: IgConnection.nullable().default(null),
  settings: IgSettings.default(EMPTY_IG_SETTINGS),
  rules: z.array(IgRule).max(50).default([]),
  updatedAt: z.number().default(0),
});
export type IgIntegration = z.infer<typeof IgIntegration>;

export const EMPTY_IG_INTEGRATION: IgIntegration = { connection: null, settings: EMPTY_IG_SETTINGS, rules: [], updatedAt: 0 };

import { formatEuro } from "@/lib/domain/money";
import type { Address, Contract, PartnerSocials, SignerStatus } from "@/lib/domain/types";

/*
 * Fabrique les valeurs des variables automatiques d'un contrat. Pur : la page d'aperçu
 * et l'enregistrement de la signature s'en servent tous les deux, et doivent produire
 * exactement le même texte — celui que le signataire a lu est celui qui est conservé.
 */

export type ContractParty = {
  firstName: string;
  lastName: string;
  email: string;
  address: Address;
  taxCountry: string;
  status: SignerStatus;
  companyName: string;
  siret: string;
  vatNumber: string;
  socials: PartnerSocials;
};

export type ContractGoods = { title: string; qty: number; unitValue: number }[];

export type Seller = { address: string; siren: string; representative: string };

const STATUS_LABEL: Record<SignerStatus, string> = {
  individual: "particulier",
  sole_trader: "micro-entrepreneur / entrepreneur individuel",
  company: "société",
};

const account = (a: { handle: string; url: string }) => [a.handle, a.url].filter(Boolean).join(" — ");

/** Une adresse postale sur une ligne, telle qu'elle se lit dans un contrat. */
export function oneLineAddress(a: Address): string {
  return [a.line1, a.line2, `${a.postalCode} ${a.city}`.trim(), a.country].filter(Boolean).join(", ");
}

export function contractValues(input: {
  contract: Pick<Contract, "id" | "version" | "variables">;
  /*
   * La campagne dont relève ce contrat : ses dates y figurent, et ne se saisissent pas.
   * C'est la période pendant laquelle le code promo vaut — le contrat dit donc la même
   * chose que la boutique, sans recopie.
   */
  campaign: { startAt: number; endAt?: number };
  seller: Seller;
  party: ContractParty;
  goods: ContractGoods;
  /* Les livres remis sont-ils des prototypes ? La fiche du kit le sait déjà : le
     contrat le reprend plutôt que de le faire ressaisir. */
  prototype: boolean;
  /** Date d'acceptation ; absente tant que le contrat n'est qu'affiché. */
  acceptedAt?: number;
}): Record<string, string> {
  const { contract, seller, party, goods } = input;
  const total = goods.reduce((sum, g) => sum + g.unitValue * g.qty, 0);
  const quantity = goods.reduce((sum, g) => sum + g.qty, 0);

  const company = party.status === "individual" ? "" : [party.companyName, party.siret && `SIRET ${party.siret}`, party.vatNumber && `TVA ${party.vatNumber}`].filter(Boolean).join(" — ");

  /*
   * Les échéances se déduisent du délai plutôt que de se saisir : une date écrite à la
   * main vieillit mal, et personne ne la corrige. Calculée depuis l'acceptation, elle
   * est juste pour chaque signataire. Une date saisie explicitement dans la fiche du
   * contrat l'emporte quand même — d'où le repli, et non l'écrasement.
   */
  const from = input.acceptedAt ?? Date.now();
  const plusDays = (days: string | undefined) => {
    const n = Number.parseInt((days ?? "").trim(), 10);
    if (!Number.isFinite(n) || n <= 0) return "";
    return new Date(from + n * 86_400_000).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
  };
  const v = contract.variables;
  const deadlines: Record<string, string> = {};
  if (!v.DATE_REMISE_CONTENUS?.trim()) deadlines.DATE_REMISE_CONTENUS = plusDays(v.DELAI_EN_JOURS);

  const longDay = (ts: number | undefined) => (ts ? new Date(ts).toLocaleDateString("fr-FR", { timeZone: "Europe/Paris", day: "numeric", month: "long", year: "numeric" }) : "");

  return {
    /* Les valeurs de campagne d'abord : une variable automatique ne doit jamais pouvoir
       être écrasée depuis la fiche du contrat. Les échéances calculées viennent juste
       après, et seulement là où rien n'a été saisi. */
    ...contract.variables,
    ...deadlines,

    ADRESSE_MON_VRAI: seller.address,
    SIREN_MON_VRAI: seller.siren,
    REPRESENTANT_MON_VRAI: seller.representative,

    CREATEUR_PRENOM: party.firstName,
    CREATEUR_NOM: party.lastName,
    CREATEUR_ADRESSE: oneLineAddress(party.address),
    CREATEUR_EMAIL: party.email,
    CREATEUR_PAYS_FISCAL: party.taxCountry,
    CREATEUR_QUALITE: STATUS_LABEL[party.status],
    CREATEUR_SOCIETE_SIRET: company,

    COMPTE_INSTAGRAM: account(party.socials.instagram),
    COMPTE_TIKTOK: account(party.socials.tiktok),
    COMPTE_AUTRE_RESEAU: account(party.socials.facebook),

    /* La liste sert dans un paragraphe : une ligne par livre, prête à être lue. */
    LISTE_DES_PRODUITS: goods.map((g) => `${g.title}${g.qty > 1 ? ` × ${g.qty}` : ""} — ${formatEuro(g.unitValue * g.qty)}`).join("\n"),
    STATUT_DES_PRODUITS: input.prototype
      ? "Exemplaires de présérie (prototypes) — ils peuvent différer de la version commercialisée."
      : "Exemplaires définitifs, identiques à la version commercialisée.",
    QUANTITE_DE_PRODUITS: String(quantity),
    VALEUR_TOTALE_PRODUITS: (total / 100).toFixed(2).replace(".", ","),

    DATE_DEBUT_CAMPAGNE: longDay(input.campaign.startAt),
    DATE_FIN_DE_CAMPAGNE: longDay(input.campaign.endAt),

    DATE_ACCEPTATION: input.acceptedAt
      ? new Date(input.acceptedAt).toLocaleString("fr-FR", { timeZone: "Europe/Paris", dateStyle: "long", timeStyle: "short" })
      : "à la validation",
    VERSION_DU_CONTRAT: contract.version,
    REFERENCE_DU_CONTRAT: contract.id,
  };
}

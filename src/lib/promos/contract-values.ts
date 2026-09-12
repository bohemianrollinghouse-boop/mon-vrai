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
  seller: Seller;
  party: ContractParty;
  goods: ContractGoods;
  /** Date d'acceptation ; absente tant que le contrat n'est qu'affiché. */
  acceptedAt?: number;
}): Record<string, string> {
  const { contract, seller, party, goods } = input;
  const total = goods.reduce((sum, g) => sum + g.unitValue * g.qty, 0);
  const quantity = goods.reduce((sum, g) => sum + g.qty, 0);

  const company = party.status === "individual" ? "" : [party.companyName, party.siret && `SIRET ${party.siret}`, party.vatNumber && `TVA ${party.vatNumber}`].filter(Boolean).join(" — ");

  return {
    /* Les valeurs de campagne d'abord : une variable automatique ne doit jamais pouvoir
       être écrasée depuis la fiche du contrat. */
    ...contract.variables,

    MONVRAI_ADDRESS: seller.address,
    MONVRAI_SIREN: seller.siren,
    MONVRAI_REPRESENTATIVE: seller.representative,

    CREATOR_FIRST_NAME: party.firstName,
    CREATOR_LAST_NAME: party.lastName,
    CREATOR_ADDRESS: oneLineAddress(party.address),
    CREATOR_EMAIL: party.email,
    CREATOR_TAX_COUNTRY: party.taxCountry,
    CREATOR_STATUS: STATUS_LABEL[party.status],
    CREATOR_COMPANY_DETAILS: company,

    INSTAGRAM_ACCOUNT: account(party.socials.instagram),
    TIKTOK_ACCOUNT: account(party.socials.tiktok),
    OTHER_SOCIAL_ACCOUNT: account(party.socials.facebook),

    /* La liste sert dans un paragraphe : une ligne par livre, prête à être lue. */
    PRODUCTS_LIST: goods.map((g) => `${g.title}${g.qty > 1 ? ` × ${g.qty}` : ""} — ${formatEuro(g.unitValue * g.qty)}`).join("\n"),
    PRODUCTS_QUANTITY: String(quantity),
    PRODUCTS_TOTAL_VALUE: (total / 100).toFixed(2).replace(".", ","),

    CONTRACT_ACCEPTED_AT: input.acceptedAt
      ? new Date(input.acceptedAt).toLocaleString("fr-FR", { timeZone: "Europe/Paris", dateStyle: "long", timeStyle: "short" })
      : "à la validation",
    CONTRACT_VERSION: contract.version,
    CONTRACT_ID: contract.id,
  };
}

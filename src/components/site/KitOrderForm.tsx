"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { RelayPicker, type Relay } from "@/components/checkout/RelayPicker";
import { AddressAutocomplete } from "@/components/checkout/AddressAutocomplete";
import { ContractDialog, type ContractView } from "@/components/site/ContractDialog";
import type { PartnerResult } from "@/lib/auth/partner-actions";

/*
 * Commande du kit de bienvenue : le tunnel d'achat en version courte. Le partenaire n'a
 * rien à choisir ni à payer — seulement dire où livrer. On reprend les mêmes composants
 * qu'à la caisse (autocomplétion d'adresse, carte des points relais) pour que ce soit
 * le même geste, avec les mêmes garanties côté Boxtal.
 */

export type KitShippingOption = { id: string; name: string; description: string; relay: boolean; networks: string[] };

const field =
  "w-full rounded-[14px] bg-paper px-[1.125rem] py-4 text-sm font-semibold outline-none placeholder:font-medium placeholder:text-faint focus-visible:outline-[1.5px] focus-visible:outline-offset-0 focus-visible:outline-ink";
const labelCls = "flex flex-col gap-2 text-[0.8125rem] font-bold";

function countryName(code: string): string {
  try {
    return new Intl.DisplayNames(["fr"], { type: "region" }).of(code) ?? code;
  } catch {
    return code;
  }
}

export function KitOrderForm({
  countries,
  options,
  mapToken,
  action,
  contract,
  signAction,
}: {
  countries: string[];
  options: KitShippingOption[];
  mapToken: string | null;
  action: (fd: FormData) => Promise<PartnerResult>;
  /** Contrat à signer avant de recevoir le kit ; absent : rien à signer. */
  contract?: ContractView;
  signAction?: (fd: FormData) => Promise<PartnerResult>;
}) {
  const router = useRouter();
  const [country, setCountry] = useState(countries[0] ?? "FR");
  const [rateId, setRateId] = useState(options[0]?.id ?? "");
  const [relay, setRelay] = useState<Relay | null>(null);
  /* Rien n'est pré-rempli : le nom du compte est souvent un pseudo, pas une identité. */
  const [form, setForm] = useState({ firstName: "", lastName: "", line1: "", line2: "", postalCode: "", city: "", phone: "" });
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  /* Adresse remplie ici, contrat signé par-dessus : un seul geste au bout du compte. */
  const [contractOpen, setContractOpen] = useState(false);
  const pendingForm = useRef<FormData | null>(null);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const option = options.find((o) => o.id === rateId) ?? options[0];

  /* L'adresse et le mode de livraison, communs aux deux chemins. */
  const withDelivery = (fd: FormData) => {
    fd.set("country", country);
    fd.set("rateId", rateId);
    fd.set("relay", option?.relay && relay ? JSON.stringify(relay) : "");
    return fd;
  };

  const submit = (fd: FormData) => {
    setError(null);
    withDelivery(fd);
    /*
     * Avec contrat, l'envoi du formulaire n'envoie rien : il ouvre le contrat. C'est
     * son bouton qui vaut commande — « Accepter le contrat et confirmer ma commande ».
     */
    if (contract && signAction) {
      pendingForm.current = fd;
      setContractOpen(true);
      return;
    }
    start(async () => {
      const result = await action(fd);
      // Succès : la page partenaire affiche désormais le suivi à la place du bon de commande.
      if (result.ok) router.push("/partenaire#kit");
      else setError(result.error);
    });
  };

  /* Le contrat rend ses champs ; on les ajoute à l'adresse déjà saisie. */
  const accept = (signature: FormData) =>
    start(async () => {
      setError(null);
      const fd = pendingForm.current ?? withDelivery(new FormData());
      for (const [k, v] of signature.entries()) fd.set(k, v);
      const result = await signAction!(fd);
      if (result.ok) router.push("/partenaire#kit");
      else setError(result.error);
    });

  return (
    <form action={submit} className="flex flex-col gap-5 rounded-card bg-white p-8 max-[599px]:p-6">
      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Pays">
        {countries.map((c) => (
          <button
            key={c}
            type="button"
            role="radio"
            aria-checked={country === c}
            onClick={() => {
              setCountry(c);
              setRelay(null);
            }}
            className={`rounded-pill px-4 py-2.5 text-[0.8125rem] ${country === c ? "bg-ink font-bold text-white" : "bg-paper font-semibold hover:opacity-70"}`}
          >
            {countryName(c)}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-4 max-[599px]:grid-cols-1">
        <label className={labelCls}>
          <span>Prénom</span>
          <input name="firstName" required value={form.firstName} onChange={set("firstName")} autoComplete="given-name" className={field} />
        </label>
        <label className={labelCls}>
          <span>Nom</span>
          <input name="lastName" required value={form.lastName} onChange={set("lastName")} autoComplete="family-name" className={field} />
        </label>
      </div>

      <AddressAutocomplete
        value={form.line1}
        country={country}
        fieldClassName={field}
        labelClassName={labelCls}
        onInput={(v) => setForm((f) => ({ ...f, line1: v }))}
        onPick={(a) => setForm((f) => ({ ...f, line1: a.line1, postalCode: a.postalCode, city: a.city }))}
      />
      <input type="hidden" name="line1" value={form.line1} />

      <label className={labelCls}>
        <span>
          Complément <span className="font-medium text-faint">(bâtiment, étage…)</span>
        </span>
        <input name="line2" value={form.line2} onChange={set("line2")} autoComplete="address-line2" className={field} />
      </label>

      <div className="grid grid-cols-[1fr_2fr] gap-4 max-[599px]:grid-cols-1">
        <label className={labelCls}>
          <span>Code postal</span>
          <input name="postalCode" required value={form.postalCode} onChange={set("postalCode")} autoComplete="postal-code" className={field} />
        </label>
        <label className={labelCls}>
          <span>Ville</span>
          <input name="city" required value={form.city} onChange={set("city")} autoComplete="address-level2" className={field} />
        </label>
      </div>

      <label className={labelCls}>
        <span>
          Téléphone <span className="font-medium text-faint">(pour le transporteur)</span>
        </span>
        <input name="phone" type="tel" required value={form.phone} onChange={set("phone")} autoComplete="tel" placeholder="06 …" className={field} />
      </label>

      <div className="flex flex-col gap-2.5" role="radiogroup" aria-label="Mode de livraison">
        <span className="text-[0.8125rem] font-bold">Mode de livraison</span>
        {options.map((o) => (
          <button
            key={o.id}
            type="button"
            role="radio"
            aria-checked={rateId === o.id}
            onClick={() => {
              setRateId(o.id);
              if (!o.relay || o.networks.join() !== option?.networks.join()) setRelay(null);
            }}
            className={`grid grid-cols-[auto_1fr_auto] items-center gap-3.5 rounded-2xl border-[1.5px] bg-paper px-[1.125rem] py-4 text-left ${rateId === o.id ? "border-ink" : "border-transparent hover:border-line-warm"}`}
          >
            <span className="flex h-5 w-5 items-center justify-center rounded-pill border-2 border-ink">
              <span className={`h-2.5 w-2.5 rounded-pill ${rateId === o.id ? "bg-ink" : "bg-transparent"}`} />
            </span>
            <span className="flex flex-col gap-0.5">
              <span className="text-sm font-bold">{o.name}</span>
              {o.description && <span className="text-xs text-muted">{o.description}</span>}
            </span>
            <span className="text-sm font-extrabold">Offerte</span>
          </button>
        ))}
      </div>

      {option?.relay && (
        <RelayPicker
          token={mapToken}
          networks={option.networks}
          address={{ country, postalCode: form.postalCode, city: form.city, street: form.line1 }}
          selected={relay}
          onSelect={setRelay}
        />
      )}

      {error && <p className="rounded-[14px] bg-tint-pink px-5 py-4 text-[0.8125rem] font-semibold text-tint-pink-ink">{error}</p>}

      <button type="submit" disabled={pending} className="w-fit rounded-pill bg-ink px-7 py-3.5 text-sm font-bold text-white disabled:opacity-50">
        {pending ? "Envoi…" : contract ? "Lire et signer le contrat" : "Valider ma commande"}
      </button>
      <span className="text-xs text-subtle">
        Aucun paiement : le kit est offert, frais de port compris.
        {contract && " Le contrat de collaboration s'ouvrira à l'étape suivante."}
      </span>

      {contractOpen && contract && (
        <ContractDialog
          contract={contract}
          signer={{ firstName: form.firstName.trim(), lastName: form.lastName.trim() }}
          onClose={() => setContractOpen(false)}
          onAccept={accept}
          pending={pending}
          error={error}
        />
      )}
    </form>
  );
}

"use client";

import { useState } from "react";
import { ActionForm } from "@/components/admin/ActionForm";
import { Input, Select } from "@/components/admin/ui";
import { sendNewsletterAction } from "@/lib/admin/actions/newsletter";

/*
 * Choix de l'audience puis envoi de la newsletter. « Une adresse » sert de test (aucune
 * confirmation) ; les envois de masse (tous, acheteurs) demandent confirmation.
 */
type ProductOpt = { slug: string; title: string };

export function NewsletterSend({ products, adminEmail, counts }: { products: ProductOpt[]; adminEmail: string; counts: { all: number; buyers: number } }) {
  const [kind, setKind] = useState<"all" | "buyers" | "product" | "one">("one");
  const [slug, setSlug] = useState(products[0]?.slug ?? "");
  const [email, setEmail] = useState(adminEmail);

  const confirm = kind === "one" ? undefined : "Envoyer la newsletter à tous les destinataires de cette sélection ? Cette action envoie de vrais e-mails.";
  const options: { value: typeof kind; label: string; note?: string }[] = [
    { value: "one", label: "Une seule adresse (test)", note: "Idéal pour se relire avant l'envoi." },
    { value: "all", label: "Tous les inscrits", note: `${counts.all} destinataire${counts.all > 1 ? "s" : ""}` },
    { value: "buyers", label: "Tous les acheteurs inscrits", note: `${counts.buyers} destinataire${counts.buyers > 1 ? "s" : ""}` },
    { value: "product", label: "Acheteurs d'un titre (inscrits)" },
  ];

  return (
    <ActionForm action={sendNewsletterAction} submitLabel="Envoyer la newsletter" submitTone="primary" confirm={confirm} footerNote={<span className="text-xs text-subtle">Seuls les inscrits à la newsletter reçoivent l'e-mail. Chacun a son lien de désinscription.</span>}>
      <input type="hidden" name="kind" value={kind} />
      <div className="flex flex-col gap-2">
        {options.map((o) => (
          <label key={o.value} className={`flex cursor-pointer items-start gap-2.5 rounded-[14px] border-[1.5px] px-3.5 py-3 ${kind === o.value ? "border-ink bg-paper" : "border-line bg-white"}`}>
            <input type="radio" name="audienceKind" checked={kind === o.value} onChange={() => setKind(o.value)} className="mt-0.5" />
            <span className="flex flex-col">
              <span className="text-[0.8125rem] font-bold">{o.label}</span>
              {o.note && <span className="text-[0.6875rem] text-subtle">{o.note}</span>}
            </span>
          </label>
        ))}
      </div>

      {kind === "product" && (
        <label className="flex flex-col gap-1.5 text-xs font-semibold text-subtle">
          <span>Titre</span>
          <Select value={slug} onChange={(e) => setSlug(e.target.value)} name="slugVisible">
            {products.map((p) => (
              <option key={p.slug} value={p.slug}>
                {p.title}
              </option>
            ))}
          </Select>
          <input type="hidden" name="slug" value={slug} />
        </label>
      )}

      {kind === "one" && (
        <label className="flex flex-col gap-1.5 text-xs font-semibold text-subtle">
          <span>Adresse e-mail</span>
          <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} name="email" placeholder="prenom@exemple.fr" />
        </label>
      )}
    </ActionForm>
  );
}

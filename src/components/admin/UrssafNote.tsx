"use client";

import { useEffect, useRef, useState } from "react";
import { formatEuro, parseEuroToCents } from "@/lib/domain/money";

/*
 * Ce que l'URSSAF prendra sur l'entrée qu'on est en train de saisir, affiché pendant
 * qu'on tape. Le calcul est celui du serveur (`partOf`, arrondi au centime) : on ne
 * montre pas un ordre de grandeur, mais le chiffre exact qui sera retenu.
 *
 * Le composant ne possède aucun champ — il écoute le <form> qui l'entoure. Le reste du
 * formulaire est rendu par le serveur, et remonter l'état du montant, du sens et de la
 * case jusqu'ici aurait fait passer tout ExpenseFields côté client pour trois valeurs.
 */
export function UrssafNote({ bp }: { bp: number }) {
  const anchor = useRef<HTMLParagraphElement>(null);
  const [text, setText] = useState<string | null>(null);

  useEffect(() => {
    const form = anchor.current?.closest("form");
    if (!form) return;

    const read = (name: string) => {
      const field = form.elements.namedItem(name);
      if (!field) return "";
      // Un groupe de radios (le sens) répond par sa valeur cochée ; un champ simple par la sienne.
      return field instanceof RadioNodeList ? field.value : field instanceof HTMLInputElement ? field.value : "";
    };

    const update = () => {
      const taxable = form.elements.namedItem("taxable");
      const checked = taxable instanceof HTMLInputElement && taxable.checked;
      if (read("direction") !== "in") return setText(null);
      if (!checked) return setText("Rien ne sera prélevé sur cette entrée.");

      let cents = 0;
      try {
        cents = parseEuroToCents(read("amountEuros"));
      } catch {
        return setText("Saisissez le montant pour voir ce qui sera prélevé.");
      }
      if (cents === 0) return setText("Saisissez le montant pour voir ce qui sera prélevé.");

      const urssaf = Math.round((cents * bp) / 10_000);
      setText(`${formatEuro(urssaf)} de cotisations sur cette entrée. Il vous restera ${formatEuro(cents - urssaf)}.`);
    };

    update();
    form.addEventListener("input", update);
    form.addEventListener("change", update);
    return () => {
      form.removeEventListener("input", update);
      form.removeEventListener("change", update);
    };
  }, [bp]);

  return (
    <p ref={anchor} className="text-xs font-semibold text-subtle" aria-live="polite">
      {text}
    </p>
  );
}

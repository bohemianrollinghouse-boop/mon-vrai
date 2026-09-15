"use client";

import { useEffect, useRef, useState } from "react";
import type { CashDirection } from "@/lib/domain/types";
import { formatEuro, parseEuroToCents } from "@/lib/domain/money";
import { Switch } from "./ui";

/*
 * La retenue URSSAF d'un mouvement : la case, et ce qu'elle coûte, calculé pendant qu'on
 * tape le montant. Le calcul est celui du serveur (arrondi au centime, ligne par ligne) —
 * on ne montre pas un ordre de grandeur mais le chiffre qui sera retenu.
 *
 * Le bloc ne paraît QUE sur une entrée : une sortie ne cotise rien, et une case sans
 * effet posée là n'aurait fait que semer le doute.
 *
 * Ce composant ne possède aucun des champs qu'il observe — il écoute le <form> qui
 * l'entoure. Remonter le montant et le sens jusqu'ici aurait fait basculer tout
 * ExpenseFields côté client pour deux valeurs. D'où l'ancre, qui reste dans le DOM même
 * repliée : sans elle, on perdrait l'écoute et le retour sur « Entrée » passerait inaperçu.
 */
export function UrssafField({ bp, defaultChecked, defaultDirection }: { bp: number; defaultChecked: boolean; defaultDirection: CashDirection }) {
  const anchor = useRef<HTMLDivElement>(null);
  const [isIncome, setIsIncome] = useState(defaultDirection === "in");
  const [checked, setChecked] = useState(defaultChecked);
  const [amount, setAmount] = useState<number | null>(null);

  useEffect(() => {
    const form = anchor.current?.closest("form");
    if (!form) return;

    const update = () => {
      const direction = form.elements.namedItem("direction");
      setIsIncome((direction instanceof RadioNodeList ? direction.value : "out") === "in");

      const field = form.elements.namedItem("amountEuros");
      const raw = field instanceof HTMLInputElement ? field.value : "";
      try {
        setAmount(parseEuroToCents(raw) || null);
      } catch {
        setAmount(null);
      }
    };

    update();
    form.addEventListener("input", update);
    form.addEventListener("change", update);
    return () => {
      form.removeEventListener("input", update);
      form.removeEventListener("change", update);
    };
  }, []);

  const rate = `${(bp / 100).toLocaleString("fr-FR", { maximumFractionDigits: 2 })} %`;
  const urssaf = amount === null ? null : Math.round((amount * bp) / 10_000);

  return (
    <div ref={anchor} className={isIncome ? "flex flex-col gap-2 rounded-[14px] bg-paper p-4" : "hidden"}>
      {/*
       * Replié, la case n'est pas seulement cachée : elle n'est pas rendue du tout. Un
       * champ masqué reste envoyé par le navigateur — une sortie repartirait donc marquée
       * comme cotisable. Absente, elle laisse `taxable` à faux, ce qui est la vérité.
       */}
      {isIncome && (
        <>
          <Switch
            name="taxable"
            checked={checked}
            onChange={(e) => setChecked(e.currentTarget.checked)}
            label={`Déduire les ${rate} d'URSSAF`}
            hint="Pour une entrée qui est du chiffre d'affaires : vente en salon, chez un libraire. Un don, un apport personnel ou un remboursement n'y est pas soumis."
          />
          <p className="text-xs font-semibold text-subtle" aria-live="polite">
            {!checked
              ? "Rien ne sera prélevé sur cette entrée."
              : urssaf === null
                ? "Saisissez le montant pour voir ce qui sera prélevé."
                : `${formatEuro(urssaf)} de cotisations sur cette entrée. Il vous restera ${formatEuro((amount ?? 0) - urssaf)}.`}
          </p>
        </>
      )}
    </div>
  );
}

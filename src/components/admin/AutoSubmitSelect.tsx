"use client";

import { useState } from "react";

/*
 * Liste déroulante qui envoie son formulaire dès qu'on change de valeur, comme
 * AutoSubmitSwitch pour les interrupteurs : dans un tableau, un bouton « Enregistrer »
 * par ligne serait plus encombrant que la donnée qu'il enregistre.
 *
 * Elle est CONTRÔLÉE, et pas seulement pré-remplie : React remet un formulaire à ses
 * valeurs de départ une fois l'action terminée, si bien qu'une liste non contrôlée
 * revenait visuellement au statut précédent — alors que l'enregistrement, lui, avait
 * bien eu lieu. C'est ce que trahissaient les compteurs, qui se mettaient à jour.
 *
 * Quand la page se rafraîchit, `value` change : on se réaligne alors sur ce que dit le
 * serveur, en ajustant l'état pendant le rendu (le procédé recommandé pour une valeur
 * dérivée d'une propriété, plutôt qu'un effet qui redéclencherait un rendu).
 */
export function AutoSubmitSelect({
  name,
  label,
  value,
  options,
  className = "",
}: {
  name: string;
  label: string;
  /** La valeur du serveur. Elle reprend la main dès qu'elle change. */
  value: string;
  options: { value: string; label: string }[];
  className?: string;
}) {
  const [chosen, setChosen] = useState(value);
  const [fromServer, setFromServer] = useState(value);
  if (fromServer !== value) {
    setFromServer(value);
    setChosen(value);
  }

  return (
    <select
      name={name}
      aria-label={label}
      value={chosen}
      onChange={(e) => {
        setChosen(e.target.value);
        e.currentTarget.form?.requestSubmit();
      }}
      className={`w-full cursor-pointer rounded-lg border border-line bg-surface px-2.5 py-2 text-xs font-bold outline-none focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ink ${className}`}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

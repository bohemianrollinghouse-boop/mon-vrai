"use client";

import { useState } from "react";

/*
 * Le champ « fichier » du dépôt de pièces.
 *
 * Il existe pour une raison précise : au-delà de la limite de corps d'une action
 * serveur, la requête est refusée par le cadre AVANT que l'action ne s'exécute. Le
 * `try`/`catch` de l'action ne voit alors rien, aucun message ne remonte, et le dépôt
 * paraît simplement ne pas marcher — c'est le pire des échecs, celui qui ne se dit pas.
 *
 * On pèse donc le fichier dans le navigateur, où on le tient déjà, et on refuse d'envoyer
 * ce qui ne passera pas. Le poids s'affiche dans tous les cas : voir « 12,4 Mo » avant de
 * cliquer vaut mieux que de deviner après.
 */

const MAX_BYTES = 40 * 1024 * 1024;

const size = (bytes: number): string =>
  bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1).replace(".", ",")} Mo` : `${Math.max(1, Math.round(bytes / 1024))} ko`;

export function DocumentFileField({ name = "file", accept }: { name?: string; accept: string }) {
  const [file, setFile] = useState<{ name: string; bytes: number } | null>(null);

  const tooBig = file !== null && file.bytes > MAX_BYTES;

  return (
    <div className="flex flex-col gap-2">
      <input
        type="file"
        name={name}
        accept={accept}
        required
        className="text-sm"
        onChange={(e) => {
          const chosen = e.target.files?.[0];
          setFile(chosen ? { name: chosen.name, bytes: chosen.size } : null);
        }}
        onInvalid={(e) => e.currentTarget.setCustomValidity("Choisissez un fichier.")}
        onInput={(e) => e.currentTarget.setCustomValidity("")}
      />

      {file && (
        <span className={`text-[0.6875rem] font-semibold ${tooBig ? "text-danger" : "text-subtle"}`}>
          {file.name} · {size(file.bytes)}
          {tooBig && ` — trop lourd : ${Math.round(MAX_BYTES / 1024 / 1024)} Mo au maximum. Compressez-le ou déposez-le en plusieurs pièces.`}
        </span>
      )}

      {/*
        Un champ invalide bloque l'envoi du formulaire sans rien enregistrer : c'est la
        garde du navigateur, et elle agit avant que la requête ne parte.
      */}
      {tooBig && <input type="text" required value="" readOnly aria-hidden tabIndex={-1} className="h-0 w-0 border-0 p-0 opacity-0" onChange={() => undefined} />}
    </div>
  );
}

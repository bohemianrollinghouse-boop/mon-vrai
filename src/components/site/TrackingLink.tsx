"use client";

import { useState } from "react";
import { CopyValue } from "./CopyValue";
import { slugify } from "@/lib/domain/slug";

/*
 * Lien de suivi, avec son suffixe de publication. Plutôt que d'expliquer au partenaire
 * comment ajouter « &src=… » à la main, on lui donne un champ : ce qu'il écrit entre
 * dans le lien à mesure, et il n'a plus qu'à copier.
 *
 * Le suffixe passe par slugify — celui des adresses de page, déjà éprouvé — parce
 * qu'il finira dans une URL et dans les statistiques : « Story du 12 mars » devient
 * « story-du-12-mars », lisible dans les deux. Le champ, lui, garde ce qui a été tapé :
 * c'est le lien affiché qui montre le résultat, sans réécrire sous les doigts.
 */

export function TrackingLink({ url }: { url: string }) {
  const [source, setSource] = useState("");
  const suffix = slugify(source).slice(0, 40).replace(/-+$/, "");
  const full = suffix ? `${url}&src=${suffix}` : url;

  return (
    <div className="flex flex-col gap-3">
      <CopyValue value={full} label="Copier le lien" display="link" />

      <label className="flex flex-wrap items-center gap-2.5 text-xs font-semibold text-subtle">
        <span className="whitespace-nowrap">Distinguer cette publication</span>
        <input
          value={source}
          onChange={(e) => setSource(e.target.value)}
          placeholder="story, bio, reel du 12 mars…"
          maxLength={60}
          className="min-w-0 flex-1 rounded-[10px] bg-paper px-3 py-2 text-[0.8125rem] font-semibold text-ink outline-none placeholder:font-medium placeholder:text-faint"
        />
      </label>

      <span className="text-xs leading-relaxed text-subtle">
        {suffix ? (
          <>
            Le lien porte maintenant <span className="font-bold text-ink">&amp;src={suffix}</span> : vos statistiques
            distingueront cette publication des autres.
          </>
        ) : (
          <>À coller en bio, en story ou en description. Laissez le champ vide pour un lien sans distinction.</>
        )}
      </span>
    </div>
  );
}

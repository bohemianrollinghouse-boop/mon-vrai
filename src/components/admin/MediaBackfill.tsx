"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { BackfillRound } from "@/lib/admin/actions/media-backfill";

/*
 * Le rattrapage des contenus de campagne, sans rien à cliquer.
 *
 * Ce n'est pas un geste à demander : c'est une dette que le changement de règle a
 * laissée derrière lui. Un bouton « Rapatrier » aurait fait porter à l'utilisateur la
 * mémoire d'une date — celle où le versement est devenu automatique —, ce qui est
 * exactement ce qu'on lui doit d'éviter. L'écran s'ouvre, le rattrapage tourne, et il
 * disparaît quand il n'y a plus rien à prendre.
 *
 * Il tourne par tours, parce que le serveur travaille par lots, et il s'arrête dès qu'un
 * tour n'avance plus : un fichier que la médiathèque refuse ne passera jamais, et
 * recommencer sur lui indéfiniment ferait tourner la page pour rien. Un garde-fou de
 * tours compte en plus, pour que rien ne puisse boucler.
 */

const MAX_ROUNDS = 60;

export function MediaBackfill({ pending, run }: { pending: number; run: () => Promise<BackfillRound> }) {
  const router = useRouter();
  const [left, setLeft] = useState(pending);
  const [done, setDone] = useState(0);
  const [refused, setRefused] = useState<string[]>([]);
  const [error, setError] = useState("");
  const started = useRef(false);

  useEffect(() => {
    if (started.current || pending === 0) return;
    started.current = true;
    let cancelled = false;

    void (async () => {
      let total = 0;
      const skipped: string[] = [];
      for (let round = 0; round < MAX_ROUNDS; round++) {
        const result = await run();
        if (cancelled) return;
        if (result.error) {
          setError(result.error);
          return;
        }
        total += result.done;
        skipped.push(...result.refused);
        setDone(total);
        setRefused([...skipped]);
        setLeft(result.left);
        /* Plus rien à prendre, ou plus rien qui avance : on s'arrête là. */
        if (result.left === 0 || result.done === 0) break;
      }
      /* La grille est à relire : elle a de nouveaux fichiers et de nouveaux dossiers. */
      if (!cancelled) router.refresh();
    })();

    return () => {
      cancelled = true;
    };
  }, [pending, run, router]);

  if (pending === 0) return null;

  const finished = left === 0 || (done === 0 && refused.length > 0) || Boolean(error);

  return (
    <div className="flex flex-col gap-1 rounded-card bg-tint-blue px-6 py-5 text-tint-blue-ink">
      <span className="text-[0.8125rem] font-extrabold text-ink">
        {error
          ? "Rapatriement interrompu"
          : finished
            ? done > 0
              ? `${done} contenu${done > 1 ? "s" : ""} de campagne rapatrié${done > 1 ? "s" : ""}`
              : "Rien n'a pu être rapatrié"
            : `Rapatriement des contenus de campagne… ${done} sur ${done + left}`}
      </span>

      <span className="text-[0.6875rem] leading-relaxed">
        {error ? (
          <>
            {error} — rouvrez cette page pour reprendre là où ça s&apos;est arrêté : rien n&apos;est jamais versé deux
            fois.
          </>
        ) : finished ? (
          <>Ils sont rangés dans le dossier de leur partenaire. Vous n&apos;aurez plus à y penser : les prochains y arrivent seuls.</>
        ) : (
          <>Déposés par vos partenaires avant que le versement ne devienne automatique. Laissez cette page ouverte.</>
        )}
      </span>

      {refused.length > 0 && (
        <span className="text-[0.6875rem] leading-relaxed">
          {refused.length} fichier{refused.length > 1 ? "s" : ""} qu&apos;aucun navigateur n&apos;affiche
          {refused.length > 1 ? " sont restés" : " est resté"} au dossier de sa campagne ({refused.slice(0, 3).join(", ")}
          {refused.length > 3 ? "…" : ""}) : convertissez-{refused.length > 1 ? "les" : "le"} en MP4 ou en JPEG pour
          {refused.length > 1 ? " les" : " le"} voir ici.
        </span>
      )}
    </div>
  );
}

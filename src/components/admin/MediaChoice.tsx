import Image from "next/image";
import type { Media } from "@/lib/domain/types";

/*
 * Choisir un média en le VOYANT.
 *
 * Une liste déroulante de noms de fichiers ne dit rien : « IMG_7363.jpeg » ne se
 * reconnaît pas, et l'on choisit à l'aveugle en espérant tomber juste. On montre donc
 * les vignettes, en rangée que l'on fait défiler, et la sélection se voit d'un liseré.
 *
 * Sans JavaScript : ce sont des boutons radio, masqués mais bien là, et c'est le
 * navigateur qui tient l'état (`has-[:checked]`). Le formulaire reste un formulaire —
 * la règle de l'administration — et la valeur postée est l'adresse du média, comme
 * avant.
 *
 * Les vidéos n'ont pas de miniature dans la médiathèque : on demande au navigateur la
 * seule chose qu'il sache donner sans tout télécharger — les métadonnées, et l'image
 * d'un dixième de seconde (`#t=0.1`). C'est léger, et cela suffit à reconnaître un plan.
 */

/** Au-delà, la rangée pèse plus qu'elle ne rend service : la médiathèque prend le relais. */
const SHOWN = 48;

const fileName = (m: Media): string => m.path.split("/").pop() ?? m.id;

const tile =
  "relative flex w-[104px] shrink-0 cursor-pointer flex-col gap-1.5 rounded-thumb p-1.5 outline-offset-[-2px] hover:bg-paper has-[:checked]:bg-paper has-[:checked]:outline-2 has-[:checked]:outline-ink";

export function MediaChoice({
  name,
  options,
  value,
  kind,
  emptyLabel = "Aucune",
}: {
  name: string;
  options: Media[];
  value: string;
  kind: "image" | "video";
  emptyLabel?: string;
}) {
  /*
   * Le média choisi passe en tête et ne peut pas tomber hors de la fenêtre affichée :
   * on doit toujours voir ce qui est posé, même si c'est une vieille photo.
   */
  const chosen = options.find((m) => m.url === value);
  const rest = options.filter((m) => m.url !== value).slice(0, SHOWN);
  const shown = chosen ? [chosen, ...rest] : rest;
  const hidden = Math.max(0, options.length - shown.length);

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex gap-1.5 overflow-x-auto pb-1.5">
        {/* Rien : l'emplacement reste libre et le guide le dit. */}
        <label className={tile}>
          <input type="radio" name={name} value="" defaultChecked={!value} className="peer sr-only" />
          <span className="flex h-[78px] w-full items-center justify-center rounded-[10px] border border-dashed border-line bg-surface text-[0.625rem] font-bold text-faint">
            {emptyLabel}
          </span>
          <span className="truncate text-center text-[0.625rem] text-faint">—</span>
        </label>

        {shown.map((m) => (
          <label key={m.id} className={tile} title={`${m.alt || fileName(m)} · ${fileName(m)}`}>
            <input type="radio" name={name} value={m.url} defaultChecked={value === m.url} className="peer sr-only" />
            <span className="relative block h-[78px] w-full overflow-hidden rounded-[10px] bg-canvas">
              {kind === "video" ? (
                <video src={`${m.url}#t=0.1`} muted preload="metadata" playsInline className="h-full w-full bg-ink object-cover" />
              ) : (
                <Image src={m.url} alt="" fill sizes="104px" className="object-cover" />
              )}
            </span>
            <span className="truncate text-center text-[0.625rem] text-subtle">{m.alt || fileName(m)}</span>
          </label>
        ))}
      </div>

      {hidden > 0 && (
        <span className="text-[0.625rem] text-faint">
          Les {shown.length} plus récents. {hidden} autres sont dans la médiathèque — renommez-les ou déposez-les à
          nouveau pour les retrouver ici.
        </span>
      )}
      {options.length === 0 && (
        <span className="text-[0.6875rem] text-subtle">
          {kind === "video" ? "Aucune vidéo dans la médiathèque." : "Aucune photo dans la médiathèque."}
        </span>
      )}
    </div>
  );
}

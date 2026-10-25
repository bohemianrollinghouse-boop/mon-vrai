import type { IgMedia } from "@/lib/instagram/client";

/*
 * Choisir les publications d'une règle en les VOYANT.
 *
 * Il y avait ici un champ de texte où il fallait taper des identifiants Meta
 * (« 17912345678901234 ») séparés par des virgules. Personne ne connaît par cœur
 * l'identifiant d'un de ses posts, et rien dans Instagram ne l'affiche : le champ
 * était donc inutilisable, et il rendait la règle impossible à cibler.
 *
 * Même principe que `MediaChoice` pour la médiathèque, et pour la même raison : des
 * vignettes, et pas de JavaScript. Ce sont des cases à cocher masquées, l'état est
 * tenu par le navigateur (`has-[:checked]`), et le formulaire reste un formulaire.
 *
 * La différence avec MediaChoice : on coche PLUSIEURS publications, donc des cases et
 * non des boutons radio — et l'absence de coche a un sens, qui est « toutes ».
 */

/** Au-delà, la rangée pèse plus qu'elle ne rend service. */
const SHOWN = 24;

const tile =
  "relative flex w-[92px] shrink-0 cursor-pointer flex-col gap-1.5 rounded-thumb p-1.5 outline-offset-[-2px] hover:bg-surface has-[:checked]:bg-surface has-[:checked]:outline-2 has-[:checked]:outline-ink";

/** La légende ramenée à ce qui tient sous une vignette ; à défaut, la date. */
function label(post: IgMedia): string {
  const caption = post.caption.replace(/\s+/g, " ").trim();
  if (caption) return caption.slice(0, 40);
  if (!post.timestamp) return "Sans légende";
  return new Date(post.timestamp).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "2-digit" });
}

export function IgPostPicker({ name, posts, selected }: { name: string; posts: IgMedia[]; selected: string[] }) {
  /*
   * Une publication cochée qui ne figure plus dans les récentes (elle est trop vieille,
   * ou Instagram ne l'a pas renvoyée) ne doit pas disparaître en silence : on la garde
   * en champ caché, sinon le simple fait d'enregistrer la règle la décocherait.
   */
  const shown = posts.slice(0, SHOWN);
  const offscreen = selected.filter((id) => !shown.some((p) => p.id === id));

  return (
    <div className="flex flex-col gap-1.5">
      {offscreen.map((id) => (
        <input key={id} type="hidden" name={`${name}[]`} value={id} />
      ))}

      <div className="flex gap-1.5 overflow-x-auto pb-1.5">
        {shown.map((post) => (
          <label key={post.id} className={tile} title={post.caption || post.id}>
            <input type="checkbox" name={`${name}[]`} value={post.id} defaultChecked={selected.includes(post.id)} className="peer sr-only" />
            <span className="relative block h-[92px] w-full overflow-hidden rounded-[10px] bg-canvas">
              {post.thumbnail ? (
                /*
                 * `<img>` et non next/image : ces adresses viennent du CDN Instagram,
                 * elles sont signées et expirent au bout de quelques jours. Les faire
                 * passer par l'optimiseur reviendrait à mettre en cache des images qui
                 * ne seront bientôt plus servies, pour des vignettes de 92 pixels.
                 */
                // eslint-disable-next-line @next/next/no-img-element
                <img src={post.thumbnail} alt="" className="h-full w-full object-cover" loading="lazy" />
              ) : (
                <span className="flex h-full w-full items-center justify-center text-[0.625rem] font-bold text-faint">
                  {post.mediaType === "VIDEO" ? "Vidéo" : "Post"}
                </span>
              )}
            </span>
            <span className="truncate text-center text-[0.625rem] text-subtle">{label(post)}</span>
          </label>
        ))}
      </div>

      {offscreen.length > 0 && (
        <p className="text-[0.625rem] text-faint">
          {offscreen.length} publication{offscreen.length > 1 ? "s" : ""} plus ancienne{offscreen.length > 1 ? "s" : ""} reste
          {offscreen.length > 1 ? "nt" : ""} cochée{offscreen.length > 1 ? "s" : ""}, hors de cette rangée.
        </p>
      )}
    </div>
  );
}

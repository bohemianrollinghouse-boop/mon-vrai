import { stopViewAsAction } from "@/lib/admin/actions/view-as";

/*
 * Bandeau d'une vue « en tant que ».
 *
 * Il ne s'agit pas d'être discret : un administrateur qui regarde l'espace de quelqu'un
 * d'autre doit le savoir à chaque instant, sans quoi il croirait voir le sien et
 * s'étonnerait que rien ne s'enregistre. D'où le ton d'alerte, la mention explicite du
 * nom, et la sortie à portée de clic.
 */
export function ViewAsBanner({ name }: { name: string }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-4 rounded-card bg-ink px-7 py-5 text-white">
      <span className="flex min-w-0 flex-col gap-1">
        <span className="text-[0.9375rem] font-extrabold">Vous regardez l&apos;espace de {name}</span>
        <span className="text-[0.8125rem] leading-relaxed text-white/70">
          C&apos;est une vue d&apos;administration, pas une connexion : rien ne peut être enregistré, commandé ni signé
          depuis cette page.
        </span>
      </span>
      <form action={stopViewAsAction}>
        <button type="submit" className="whitespace-nowrap rounded-pill bg-white px-6 py-3 text-[0.8125rem] font-bold text-ink hover:opacity-80">
          Quitter cette vue
        </button>
      </form>
    </div>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { ProductCard } from "@/components/site/ProductCard";
import { Chip, PillLink } from "@/components/site/ui";
import { listPublishedProducts, searchPublishedProducts } from "@/lib/db/products";
import { systemPath } from "@/lib/domain/system-pages";

export const metadata: Metadata = { title: "Recherche" };
export const dynamic = "force-dynamic";

/*
 * Page recherche (maquette 6a). Formulaire GET natif : l'URL porte la requête, elle se
 * partage, et tout se rend côté serveur. Les suggestions sont des liens vers une
 * recherche pré-remplie, construites sur les mots les plus fréquents du catalogue.
 */
export default async function SearchPage({ searchParams }: PageProps<"/recherche">) {
  const { q } = await searchParams;
  const query = typeof q === "string" ? q.trim() : "";
  const [results, all] = await Promise.all([query ? searchPublishedProducts(query) : Promise.resolve([]), listPublishedProducts()]);
  const suggestions = suggest(all);

  return (
    <>
      <section className="site-wrap flex flex-col items-center gap-5 pt-8 text-center">
        <h1 className="display-1 text-[clamp(1.875rem,4vw,2.75rem)]">Que cherchez-vous ?</h1>

        <form action={systemPath("search")} method="get" role="search" className="flex w-[720px] max-w-full items-center gap-2 rounded-pill bg-white p-2 pl-[1.625rem] shadow-soft">
          <label htmlFor="q" className="sr-only-keep">
            Rechercher un livre
          </label>
          <input
            id="q"
            type="search"
            name="q"
            defaultValue={query}
            placeholder="Un animal, un fruit, un objet…"
            autoComplete="off"
            className="min-w-0 flex-1 bg-transparent font-semibold outline-none focus-visible:rounded focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ink"
          />
          {query && (
            <Link href={systemPath("search")} className="flex-none px-2 text-[0.8125rem] font-semibold text-subtle">
              Effacer
            </Link>
          )}
          <button type="submit" className="flex-none rounded-pill bg-ink px-6 py-3.5 text-[0.8125rem] font-bold text-white">
            Rechercher
          </button>
        </form>

        {suggestions.length > 0 && (
          <div className="flex flex-wrap items-center justify-center gap-2">
            <span className="text-xs font-semibold text-subtle">Recherches fréquentes</span>
            {suggestions.map((s) => (
              <Link key={s} href={`${systemPath("search")}?q=${encodeURIComponent(s)}`}>
                <Chip>{s}</Chip>
              </Link>
            ))}
          </div>
        )}
      </section>

      {query && (
        <section className="site-wrap pt-14">
          <div className="flex flex-wrap items-baseline justify-between gap-4">
            <span className="font-bold">Résultats pour « {query} »</span>
            <span className="text-[0.8125rem] font-semibold text-subtle">
              {results.length} {results.length > 1 ? "résultats" : "résultat"}
            </span>
          </div>

          {results.length > 0 ? (
            <div className="grid grid-cols-3 gap-5 pt-5 max-[989px]:grid-cols-2 max-[599px]:grid-cols-1">
              {results.map((p) => (
                <ProductCard key={p.slug} product={p} />
              ))}
            </div>
          ) : (
            <div className="mt-5 flex flex-col items-center gap-4 rounded-panel bg-white p-16 text-center max-[599px]:px-6 max-[599px]:py-9">
              <h2 className="display-2">Pas encore dans nos pages</h2>
              <p className="max-w-[460px] leading-relaxed text-muted">
                Aujourd'hui l'univers Mon Vrai compte {all.length} imagiers 6–18 mois. D'autres thèmes viendront enrichir la collection.
              </p>
              <div className="flex flex-wrap justify-center gap-2.5 pt-2">
                <PillLink href={systemPath("catalogue")} variant="dark" className="text-[0.8125rem]">
                  Voir les {all.length} imagiers
                </PillLink>
                <PillLink href={systemPath("contact")} variant="paper" className="text-[0.8125rem]">
                  Suggérer un thème
                </PillLink>
              </div>
            </div>
          )}
        </section>
      )}

      <section className="site-wrap pt-14 pb-[4.5rem]">
        <div className="grid grid-cols-2 items-center gap-10 rounded-panel bg-tint-green px-16 py-12 max-[989px]:grid-cols-1 max-[989px]:px-7 max-[989px]:py-9">
          <div className="flex flex-col gap-2.5">
            <h2 className="display-2">Une question plutôt qu'un livre ?</h2>
            <p className="text-[0.9375rem] leading-relaxed text-tint-green-ink">
              Livraison, précommande, retours : les réponses sont dans la FAQ, ou écrivez-nous.
            </p>
          </div>
          <div className="flex flex-wrap justify-end gap-2.5 max-[989px]:justify-start">
            <PillLink href={`${systemPath("contact")}#faq`} variant="light" className="text-[0.8125rem]">
              Questions fréquentes
            </PillLink>
            <PillLink href={systemPath("contact")} variant="dark" className="text-[0.8125rem]">
              Contact
            </PillLink>
          </div>
        </div>
      </section>
    </>
  );
}

/** Un mot-clé par titre (le dernier mot significatif), dédoublonné : « Visage », « Ferme », « Fruits »… */
function suggest(products: { title: string }[]): string[] {
  const stop = new Set(["les", "le", "la", "de", "du", "des", "et", "l"]);
  const out: string[] = [];
  for (const p of products) {
    const words = p.title.split(/[\s']+/).filter((w) => !stop.has(w.toLowerCase()));
    const last = words[words.length - 1];
    if (last && !out.includes(last)) out.push(last);
  }
  return out.slice(0, 5);
}

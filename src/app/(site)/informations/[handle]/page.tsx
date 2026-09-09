import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PillLink } from "@/components/site/ui";
import { getPolicy, listPolicies } from "@/lib/db/policies";
import { policyPath, systemPath } from "@/lib/domain/system-pages";

export const dynamic = "force-dynamic";

/*
 * Pages légales (maquette 7c) : fil d'ariane, menu latéral des politiques avec l'entrée
 * courante en sombre, carte d'aide, contenu dans une carte blanche. Un gabarit, autant
 * de pages que de politiques.
 */

export async function generateMetadata({ params }: PageProps<"/informations/[handle]">): Promise<Metadata> {
  const { handle } = await params;
  const policy = await getPolicy(handle);
  return policy ? { title: policy.title } : {};
}

export default async function PolicyPage({ params }: PageProps<"/informations/[handle]">) {
  const { handle } = await params;
  const [policy, all] = await Promise.all([getPolicy(handle), listPolicies()]);
  if (!policy) notFound();

  const updated = new Date(policy.updatedAt).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });

  return (
    <section className="site-wrap py-6 pb-[4.5rem]">
      <div className="flex flex-col gap-3">
        <nav aria-label="Fil d'Ariane" className="flex flex-wrap gap-1.5 text-xs font-semibold text-subtle">
          <Link href="/">Accueil</Link>
          <span aria-hidden="true">›</span>
          <Link href={systemPath("policies")}>Informations</Link>
          <span aria-hidden="true">›</span>
          <span className="text-ink">{policy.title}</span>
        </nav>
        <h1 className="display-1 text-[clamp(1.875rem,4vw,2.75rem)]">{policy.title}</h1>
        {policy.updatedAt > 0 && <span className="text-[0.8125rem] font-semibold text-subtle">Dernière mise à jour : {updated}</span>}
      </div>

      <div className="mt-8 grid grid-cols-[280px_1fr] items-start gap-5 max-[899px]:grid-cols-1">
        <aside className="sticky top-24 flex flex-col gap-3 max-[899px]:static">
          <nav aria-label="Pages légales" className="flex flex-col gap-1 rounded-card bg-white p-3 text-sm font-semibold">
            {all.map((p) => {
              const current = p.handle === policy.handle;
              return (
                <Link
                  key={p.handle}
                  href={policyPath(p.handle)}
                  aria-current={current ? "page" : undefined}
                  className={`rounded-2xl px-[1.125rem] py-[0.8125rem] leading-snug ${current ? "bg-ink text-white" : "hover:bg-paper"}`}
                >
                  {p.title}
                </Link>
              );
            })}
          </nav>
          <div className="flex flex-col gap-2.5 rounded-card bg-tint-green p-6">
            <span className="text-sm font-bold text-tint-green-ink">Une question ?</span>
            <span className="text-[0.8125rem] leading-relaxed text-tint-green-ink">Nous répondons sous 48 h ouvrées.</span>
            <PillLink href={systemPath("contact")} variant="dark" size="sm" className="w-fit">
              Nous contacter
            </PillLink>
          </div>
        </aside>

        <div className="flex flex-col gap-9 rounded-panel bg-white px-14 py-12 max-[899px]:px-6 max-[899px]:py-8">
          <div className="prose-mv" dangerouslySetInnerHTML={{ __html: policy.body.html }} />
          <div className="flex flex-wrap items-center justify-between gap-4 border-t border-line pt-6 text-[0.8125rem] font-semibold text-subtle">
            <span>Mon Vrai - {policy.title}</span>
            <a href="#contenu" className="border-b-[1.5px] border-ink text-ink">
              Retour en haut
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}

import { notFound } from "next/navigation";
import { getAllTemplateValues } from "@/lib/db/newsletter";
import { getSettings } from "@/lib/db/settings";
import { renderNewsletterBody } from "@/lib/email/newsletter";
import { NEWSLETTER_TEMPLATES, RESPONSIVE_CSS, templateById } from "@/lib/newsletter/render";

export const dynamic = "force-dynamic";

/*
 * Version web d'une newsletter, celle que vise « Voir dans le navigateur ». Le même
 * moteur que l'e-mail, avec les mêmes textes : ce n'est pas une seconde version à
 * tenir à jour, c'est le même contenu rendu ailleurs.
 *
 * Seuls les modèles de la liste sont servis : les envois transactionnels (invitation
 * d'un partenaire) passent par le même moteur mais n'ont pas d'équivalent public.
 * Le lien de désinscription est propre à chaque destinataire, donc absent ici.
 */
export async function generateMetadata({ params }: PageProps<"/newsletter/[id]">) {
  const { id } = await params;
  const template = templateById(id);
  return template ? { title: template.label, robots: { index: false, follow: true } } : {};
}

export default async function NewsletterWebView({ params }: PageProps<"/newsletter/[id]">) {
  const { id } = await params;
  if (!NEWSLETTER_TEMPLATES.some((t) => t.id === id)) notFound();

  const [values, settings] = await Promise.all([getAllTemplateValues(), getSettings()]);
  const base = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://monvrai.fr").replace(/\/$/, "");
  const body = await renderNewsletterBody(id, values[id] ?? {}, settings, `${base}/compte`);

  return (
    <section className="flex justify-center bg-canvas px-3 py-7">
      {/* La même feuille que l'e-mail : sur un téléphone, la page montre ce que montre
          la boîte aux lettres — c'est la seule raison d'être de « Voir dans le navigateur ». */}
      <style dangerouslySetInnerHTML={{ __html: RESPONSIVE_CSS }} />
      <div
        className="w-[600px] max-w-full text-left"
        // Rendu par notre propre moteur, à partir de textes saisis dans l'admin :
        // aucune entrée de visiteur ne passe par là.
        dangerouslySetInnerHTML={{ __html: body }}
      />
    </section>
  );
}

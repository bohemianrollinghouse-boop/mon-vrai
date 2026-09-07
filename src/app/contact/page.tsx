import type { Metadata } from "next";
import { ContactForm } from "@/components/site/ContactForm";
import { Newsletter } from "@/components/site/Newsletter";
import { Eyebrow } from "@/components/site/ui";
import { getContactContent, getHomeContent } from "@/lib/db/content";
import { getSettings } from "@/lib/db/settings";

export const metadata: Metadata = { title: "Contact" };
export const dynamic = "force-dynamic";

/*
 * Page contact (maquette 4b) : colonne d'informations à gauche, formulaire à droite,
 * FAQ en deux colonnes, newsletter. Les coordonnées viennent des réglages, pas d'un
 * texte ressaisi : l'e-mail affiché est celui de la boutique.
 */
export default async function ContactPage() {
  const [content, settings, home] = await Promise.all([getContactContent(), getSettings(), getHomeContent()]);
  if (!content) {
    return (
      <section className="site-wrap py-24 text-center">
        <h1 className="display-2">La page contact n'est pas encore rédigée.</h1>
      </section>
    );
  }

  const socials = [
    ["Instagram", settings.socials.instagram],
    ["TikTok", settings.socials.tiktok],
    ["Facebook", settings.socials.facebook],
  ].filter((s): s is [string, string] => Boolean(s[1]));

  return (
    <>
      <section className="site-wrap grid grid-cols-[1fr_1.3fr] items-start gap-4 pt-2 max-[899px]:grid-cols-1">
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-[1.125rem] rounded-panel bg-tint-green p-12 max-[899px]:p-8">
            <Eyebrow className="text-tint-green-ink">{content.intro.eyebrow}</Eyebrow>
            <h1 className="display-1 text-[clamp(1.875rem,4vw,2.875rem)]">{content.intro.heading}</h1>
            {content.intro.text && <p className="leading-relaxed text-tint-green-ink">{content.intro.text}</p>}
          </div>

          <div className="flex flex-col gap-5 rounded-card bg-white p-8">
            {settings.contact.email && (
              <div className="flex flex-col gap-1">
                <span className="text-[0.6875rem] font-bold uppercase tracking-[0.1em] text-faint">E-mail</span>
                <a href={`mailto:${settings.contact.email}`} className="w-fit font-bold">
                  {settings.contact.email}
                </a>
              </div>
            )}
            {socials.length > 0 && (
              <div className="flex flex-col gap-1">
                <span className="text-[0.6875rem] font-bold uppercase tracking-[0.1em] text-faint">Réseaux</span>
                <div className="flex flex-wrap gap-2 pt-1">
                  {socials.map(([label, href]) => (
                    <a key={label} href={href} target="_blank" rel="me noopener" className="rounded-pill bg-paper px-3.5 py-2 text-[0.8125rem] font-semibold">
                      {label}
                    </a>
                  ))}
                </div>
              </div>
            )}
            {content.proText && (
              <div className="flex flex-col gap-1">
                <span className="text-[0.6875rem] font-bold uppercase tracking-[0.1em] text-faint">{content.proLabel}</span>
                <span className="text-sm leading-relaxed text-[#555]">{content.proText}</span>
              </div>
            )}
          </div>
        </div>

        <div className="rounded-panel bg-white p-12 max-[899px]:p-8">
          <ContactForm subjects={content.subjects} legal={content.legal} successText={content.successText} />
        </div>
      </section>

      {content.faq.items.length > 0 && (
        <section id="faq" className="site-wrap flex flex-col gap-7 pt-[4.5rem]">
          <div className="flex flex-wrap items-baseline justify-between gap-6">
            <h2 className="display-2">{content.faq.heading}</h2>
            {content.faq.note && <span className="text-[0.8125rem] font-semibold text-subtle">{content.faq.note}</span>}
          </div>
          <div className="grid grid-cols-2 gap-4 max-[899px]:grid-cols-1">
            {content.faq.items.map((f) => (
              <div key={f.q} className="flex flex-col gap-2.5 rounded-card bg-white p-7">
                <span className="font-bold leading-snug">{f.q}</span>
                <span className="text-sm leading-relaxed text-[#555]">{f.a}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      <div className="pt-12">{home && <Newsletter {...home.newsletter} />}</div>
      <div className="h-16" />
    </>
  );
}

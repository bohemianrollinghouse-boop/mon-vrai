import Image from "next/image";
import Link from "next/link";
import { getFooterMenu } from "@/lib/db/menus";
import { getSettings } from "@/lib/db/settings";
import { resolveTarget } from "@/lib/domain/menu-links";

/*
 * Pied de page de la maquette : colonne de marque large (logo, accroche, coordonnées),
 * jusqu'à trois colonnes de liens gérées depuis l'admin, une colonne « Nous suivre »
 * qui n'apparaît que si au moins un réseau est renseigné, et une barre de bas de page.
 */
export async function Footer() {
  const [menu, settings] = await Promise.all([getFooterMenu(), getSettings()]);
  const socials = [
    ["Instagram", settings.socials.instagram],
    ["TikTok", settings.socials.tiktok],
    ["Facebook", settings.socials.facebook],
  ].filter((s): s is [string, string] => Boolean(s[1]));
  const contact = settings.contact;
  const hasContact = contact.addressLines.length > 0 || contact.phone || contact.email;
  const year = new Date().getFullYear();

  return (
    <footer className="bg-paper text-[0.8125rem] font-semibold">
      <div className="site-wrap">
        <div className="grid grid-cols-[2fr_1fr_1fr_1fr] gap-8 pt-14 pb-6 max-[899px]:grid-cols-2 max-[899px]:gap-7 max-[479px]:grid-cols-1">
          <div className="flex flex-col gap-3 max-[899px]:col-span-full">
            <Link href="/" aria-label={settings.shopName} className="w-fit">
              <Image src="/email-logo.png" alt={settings.shopName} width={104} height={26} className="h-[26px] w-auto" style={{ height: 26, width: "auto" }} />
            </Link>
            {settings.tagline && <p className="max-w-[300px] font-medium leading-relaxed text-muted">{settings.tagline}</p>}
            {hasContact && (
              <address className="flex flex-col gap-1 font-medium not-italic leading-relaxed text-muted">
                {contact.addressLines.map((l) => (
                  <span key={l}>{l}</span>
                ))}
                {contact.phone && <a href={`tel:${contact.phone.replace(/[\s.]/g, "")}`}>{contact.phone}</a>}
                {contact.email && <a href={`mailto:${contact.email}`}>{contact.email}</a>}
              </address>
            )}
          </div>

          {menu.columns.map((col) => (
            <div key={col.id} className="flex flex-col gap-2.5">
              <span className="text-[0.6875rem] font-semibold uppercase tracking-[0.1em] text-faint">{col.heading}</span>
              {col.items.map((item) => {
                const { href, external, newTab } = resolveTarget(item.target);
                return (
                  <Link key={item.id} href={href} target={newTab ? "_blank" : undefined} rel={external ? "noopener" : undefined} className="w-fit hover:opacity-70">
                    {item.label}
                  </Link>
                );
              })}
            </div>
          ))}

          {socials.length > 0 && (
            <div className="flex flex-col gap-2.5">
              <span className="text-[0.6875rem] font-semibold uppercase tracking-[0.1em] text-faint">Nous suivre</span>
              {socials.map(([label, href]) => (
                <a key={label} href={href} target="_blank" rel="me noopener" className="w-fit hover:opacity-70">
                  {label}
                </a>
              ))}
            </div>
          )}
        </div>

        <div className="flex flex-wrap justify-between gap-6 border-t border-line-warm pt-5 pb-9 text-xs font-medium text-subtle">
          <span>
            © {year} {settings.shopName}
          </span>
          {settings.legal.footerLine && <span>{settings.legal.footerLine}</span>}
        </div>
      </div>
    </footer>
  );
}

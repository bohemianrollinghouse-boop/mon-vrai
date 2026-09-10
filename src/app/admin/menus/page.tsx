import { FooterMenuBuilder, HeaderMenuBuilder } from "@/components/admin/MenuBuilder";
import { Card, PageHeader } from "@/components/admin/ui";
import { saveFooterMenuAction, saveHeaderMenuAction } from "@/lib/admin/actions/menus";
import { getFooterMenu, getHeaderMenu } from "@/lib/db/menus";
import { listPages } from "@/lib/db/pages";

export const dynamic = "force-dynamic";

export default async function MenusPage() {
  const [header, footer, pages] = await Promise.all([getHeaderMenu(), getFooterMenu(), listPages("published")]);
  const opts = { pages: pages.map((p) => ({ slug: p.slug, title: p.title })) };

  return (
    <>
      <PageHeader title="Menus" subtitle="Une entrée pointe vers une page système, une page libre ou une URL." />
      <div className="flex flex-col gap-6">
        <Card title="Menu d'en-tête">
          <HeaderMenuBuilder initial={header.items} opts={opts} action={saveHeaderMenuAction} />
        </Card>
        <Card title="Pied de page">
          <FooterMenuBuilder initial={footer.columns} opts={opts} action={saveFooterMenuAction} />
        </Card>
      </div>
    </>
  );
}

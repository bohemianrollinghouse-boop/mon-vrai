import Link from "next/link";
import { PageHeader, Pill, Table } from "@/components/admin/ui";
import { listCustomers } from "@/lib/db/customers";
import { listOrders } from "@/lib/db/orders";
import { listInfluencers } from "@/lib/db/promos";
import { formatEuro } from "@/lib/domain/money";

export const dynamic = "force-dynamic";

/*
 * Clients : la liste des comptes, avec le nombre de commandes et le total dépensé.
 * Les données personnelles restent minimales — un client se supprime depuis sa fiche
 * Auth et eraseCustomer() (RGPD), pas depuis cette liste.
 *
 * Un partenaire a aussi un compte client (créé à sa première connexion, cf.
 * /api/session) : il est marqué ici et renvoie vers sa fiche. Le rapprochement passe
 * par l'uid Auth, et par l'e-mail tant que le partenaire ne s'est pas encore connecté.
 */
export default async function CustomersPage() {
  const [customers, orders, influencers] = await Promise.all([listCustomers(300), listOrders({ limit: 1000 }), listInfluencers()]);
  const byUid = new Map<string, { count: number; total: number }>();
  for (const o of orders) {
    if (!o.customerUid || o.status === "cancelled" || o.status === "pending_payment") continue;
    const cur = byUid.get(o.customerUid) ?? { count: 0, total: 0 };
    byUid.set(o.customerUid, { count: cur.count + 1, total: cur.total + o.totals.total });
  }

  const partners = new Map<string, { id: string; name: string }>();
  for (const i of influencers) {
    const card = { id: i.id, name: i.name };
    if (i.uid) partners.set(i.uid, card);
    if (i.email) partners.set(i.email.trim().toLowerCase(), card);
  }
  const partnerOf = (uid: string, email: string) => partners.get(uid) ?? partners.get(email.trim().toLowerCase());
  const partnerCount = customers.filter((c) => partnerOf(c.uid, c.email)).length;

  return (
    <>
      <PageHeader title="Clients" subtitle={`${customers.length} comptes${partnerCount > 0 ? ` · dont ${partnerCount} influenceur${partnerCount > 1 ? "s" : ""}` : ""}`} />
      {customers.length === 0 ? (
        <p className="rounded-card bg-surface p-6 text-sm text-muted">Aucun compte client pour le moment.</p>
      ) : (
        <Table head={["Client", "E-mail", "Inscrit le", "Commandes", "Total", "Newsletter"]}>
          {customers.map((c) => {
            const stats = byUid.get(c.uid) ?? { count: 0, total: 0 };
            const partner = partnerOf(c.uid, c.email);
            return (
              <tr key={c.uid} className="hover:bg-paper">
                <td className="font-bold">
                  <span className="flex flex-wrap items-center gap-2">
                    <span>{c.name || partner?.name || <span className="font-normal text-subtle">-</span>}</span>
                    {partner && (
                      <Link href={`/admin/influenceurs/${partner.id}`} className="hover:opacity-80" title={`Voir la fiche de ${partner.name}`}>
                        <Pill tone="pink">Influenceur</Pill>
                      </Link>
                    )}
                  </span>
                </td>
                <td>
                  <a href={`mailto:${c.email}`} className="hover:underline">
                    {c.email}
                  </a>
                </td>
                <td className="text-subtle">{new Date(c.createdAt).toLocaleDateString("fr-FR")}</td>
                <td>
                  {stats.count > 0 ? (
                    <Link href={`/admin/commandes`} className="hover:underline">
                      {stats.count}
                    </Link>
                  ) : (
                    "0"
                  )}
                </td>
                <td className="font-semibold">{formatEuro(stats.total)}</td>
                <td className="text-subtle">{c.newsletter?.optIn ? "oui" : "-"}</td>
              </tr>
            );
          })}
        </Table>
      )}
    </>
  );
}

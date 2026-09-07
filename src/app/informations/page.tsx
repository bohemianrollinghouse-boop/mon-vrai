import { redirect } from "next/navigation";
import { listPolicies } from "@/lib/db/policies";
import { policyPath } from "@/lib/domain/system-pages";

export const dynamic = "force-dynamic";

/** /informations n'a pas de contenu propre : on ouvre la première politique. */
export default async function PoliciesIndex() {
  const policies = await listPolicies();
  const first = policies[0];
  if (!first) {
    return (
      <section className="site-wrap py-24 text-center">
        <h1 className="display-2">Aucune page légale publiée.</h1>
      </section>
    );
  }
  redirect(policyPath(first.handle));
}

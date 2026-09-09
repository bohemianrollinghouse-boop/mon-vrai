import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { LoginForm } from "@/components/site/LoginForm";
import { getSessionUser } from "@/lib/auth/session";
import { safeInternalPath } from "@/lib/domain/safe-path";

export const metadata: Metadata = { title: "Connexion" };
export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }: PageProps<"/compte/connexion">) {
  const { retour } = await searchParams;
  // Seuls des chemins internes sont acceptés : pas de redirection vers un autre site.
  const returnTo = safeInternalPath(retour, "/compte");

  const user = await getSessionUser();
  if (user) redirect(returnTo);

  return (
    <section className="site-wrap py-12">
      <div className="mx-auto flex max-w-[480px] flex-col gap-6 rounded-panel bg-white p-12 max-[599px]:p-7">
        <div className="flex flex-col gap-2">
          <span className="eyebrow text-subtle">Compte</span>
          <h1 className="display-2">Bon retour parmi nous</h1>
          <p className="text-sm leading-relaxed text-muted">Retrouvez vos commandes et suivez vos précommandes.</p>
        </div>
        <LoginForm returnTo={returnTo} />
      </div>
    </section>
  );
}

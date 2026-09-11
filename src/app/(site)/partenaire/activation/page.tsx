import { getInfluencerByInvite } from "@/lib/db/promos";
import { activateInfluencerAccount } from "@/lib/auth/influencer";
import { ActivationForm } from "@/components/site/ActivationForm";

export const dynamic = "force-dynamic";

export const metadata = { title: "Activer votre espace partenaire" };

/*
 * Première visite d'un partenaire : il arrive par le lien de son e-mail de bienvenue
 * et choisit son mot de passe. Le jeton est vérifié ici avant d'afficher quoi que ce
 * soit — un lien périmé ne doit pas laisser croire qu'il reste une porte.
 */
export default async function ActivationPage({ searchParams }: PageProps<"/partenaire/activation">) {
  const { token } = await searchParams;
  const invite = typeof token === "string" ? await getInfluencerByInvite(token) : null;

  if (!invite) {
    return (
      <section className="site-wrap py-24 text-center">
        <h1 className="display-2">Ce lien n'est plus valable.</h1>
        <p className="mt-3 text-muted">Les invitations expirent au bout de deux semaines. Écrivez-nous pour en recevoir une nouvelle.</p>
      </section>
    );
  }

  return (
    <section className="site-wrap flex justify-center py-12 pb-24">
      <div className="flex w-full max-w-[34rem] flex-col gap-5 rounded-panel bg-white px-12 py-11 max-[749px]:px-6 max-[749px]:py-8">
        <div className="flex flex-col gap-2">
          <span className="eyebrow text-tint-pink-ink">Espace partenaire</span>
          <h1 className="display-2">Bienvenue {invite.name.split(" ")[0]}</h1>
          <p className="text-[0.9375rem] leading-relaxed text-muted">
            Choisissez un mot de passe pour <strong className="text-ink">{invite.email}</strong>. Vous accéderez ensuite à votre espace, avec votre code et votre lien de suivi.
          </p>
        </div>
        <ActivationForm token={token as string} email={invite.email} action={activateInfluencerAccount} />
      </div>
    </section>
  );
}

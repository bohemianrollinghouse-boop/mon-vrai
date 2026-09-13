import { CopyValue } from "./CopyValue";

/*
 * Où déposer les contenus, dans l'espace partenaire.
 *
 * Un créateur qui a filmé ses imagiers se retrouve avec des fichiers lourds et aucune
 * idée de l'endroit où les mettre : le contrat dit ce qu'il doit livrer, pas par quel
 * moyen. D'où cet encart, juste après le kit — on reçoit les livres, on envoie les
 * contenus.
 *
 * L'adresse vient des réglages du site (Paramètres → E-mail de contact) et non d'une
 * constante : c'est la même que celle du pied de page et des factures. Sans adresse
 * renseignée, l'encart ne s'affiche pas — mieux vaut rien qu'une consigne incomplète.
 */
export function ContentDropBlock({ email, prototype }: { email: string; prototype: boolean }) {
  if (!email) return null;

  return (
    <div id="contenus" className="flex scroll-mt-24 flex-col gap-4 rounded-panel bg-tint-blue p-10 max-[749px]:p-8">
      <span className="w-fit rounded-pill bg-white px-3.5 py-2 text-xs font-bold">Vos contenus</span>
      <h2 className="text-[1.625rem] font-extrabold tracking-[-0.01em]">Où envoyer vos photos et vidéos</h2>
      <p className="max-w-[46rem] text-sm leading-relaxed text-tint-blue-ink">
        Déposez vos fichiers sur <strong className="text-ink">WeTransfer</strong>, puis envoyez le lien de
        téléchargement à l&apos;adresse ci-dessous. C&apos;est gratuit jusqu&apos;à 2 Go et rien ne s&apos;abîme en
        route : vos photos et vos vidéos nous arrivent dans leur qualité d&apos;origine, ce qu&apos;un envoi par
        message ne permet pas.
      </p>

      <div className="grid grid-cols-[minmax(0,26rem)_1fr] items-start gap-6 max-[899px]:grid-cols-1">
        <div className="flex flex-col gap-2.5">
          <span className="text-[0.6875rem] font-bold uppercase tracking-[0.1em] text-tint-blue-ink">
            Envoyer le lien à
          </span>
          <CopyValue value={email} label="Copier" display="link" />
          <a href={`mailto:${email}`} className="w-fit border-b-[1.5px] border-ink text-[0.8125rem] font-bold">
            Écrire à cette adresse
          </a>
        </div>

        <div className="flex flex-col gap-2 text-[0.8125rem] leading-relaxed text-tint-blue-ink">
          <span className="font-bold text-ink">Pour que les fichiers soient utilisables</span>
          <ul className="flex flex-col gap-1.5">
            <li>Leur qualité d&apos;origine, sans compression.</li>
            <li>Sans filigrane, sans logo d&apos;une autre marque.</li>
            <li>Sans musique protégée incrustée : les rushs bruts conviennent.</li>
            <li>Vidéos verticales de préférence, pour les réseaux.</li>
          </ul>
          {prototype && (
            <span className="mt-1 text-xs">
              Vos exemplaires sont des prototypes : la version définitive peut différer légèrement de ce que vous
              filmez.
            </span>
          )}
        </div>
      </div>

      <a
        href="https://wetransfer.com"
        target="_blank"
        rel="noreferrer noopener"
        className="w-fit rounded-pill bg-ink px-7 py-3.5 text-sm font-bold text-white hover:opacity-80"
      >
        Ouvrir WeTransfer
      </a>
    </div>
  );
}

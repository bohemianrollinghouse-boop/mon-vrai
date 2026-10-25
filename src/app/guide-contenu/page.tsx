import { getSettings } from "@/lib/db/settings";
import { AVOID, LIGHT_POINTS, SCENE_CARDS, guideView, type FilledShot } from "@/lib/guide/content";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Aide à la création de contenu — Mon Vrai",
  description: "Ce que nous aimons voir dans vos photos et vos rushes : des scènes simples, bien éclairées, où le livre se vit vraiment.",
  /* Un guide de travail n'a rien à faire dans les résultats de recherche : il s'ouvre
     par le lien du contrat, pas par une requête. */
  robots: { index: false, follow: false },
};

/*
 * Le guide de création de contenu remis aux partenaires.
 *
 * Il vit HORS du groupe `(site)` : il porte son propre en-tête et son propre pied, et
 * l'habillage de la boutique — panier, menu, bandeau — n'a rien à faire sur un document
 * de travail. Même raison que la caisse, qui est sortie pour la même.
 *
 * Son adresse est publique et non référencée (`robots: noindex`), délibérément : le
 * créateur l'ouvre depuis le lien de son contrat, souvent sur un téléphone où il n'est
 * pas connecté, et une page de conseils photo n'a rien à protéger. L'exiger connecté
 * aurait fait buter le seul moment où le guide sert vraiment.
 *
 * Le TEXTE vient de `lib/guide/content.ts`. Les PHOTOS et les VIDÉOS viennent des
 * réglages (/admin/guide) : ce sont des exemples, et un exemple se remplace sans cesse.
 * Un emplacement vide se dit tel plutôt que de casser la mise en page.
 */
export default async function GuidePage() {
  const settings = await getSettings();
  const guide = guideView(settings.guide);
  const email = settings.contact.email ?? "";

  return (
    <div className="bg-white font-sans text-ink">
      <header className="mx-auto flex max-w-[1120px] flex-wrap items-center justify-between gap-5 px-[clamp(20px,5vw,48px)] py-6">
        <span className="text-lg font-extrabold tracking-[-0.02em]">{settings.shopName}</span>
        <nav className="flex flex-wrap gap-x-5 gap-y-1.5 text-[0.8125rem] font-semibold">
          <a href="#lumiere" className="text-muted hover:opacity-70">Lumière</a>
          <a href="#rushes" className="text-muted hover:opacity-70">Rushes</a>
          <a href="#exemples" className="text-muted hover:opacity-70">Exemples vidéo</a>
          <a href="#scenes" className="text-muted hover:opacity-70">Mises en scène</a>
        </nav>
      </header>

      {/* ---------- Ce que ce guide est, et ce qu'il n'est pas ---------- */}
      <section className="mx-auto grid max-w-[1120px] grid-cols-[repeat(auto-fit,minmax(min(100%,420px),1fr))] items-end gap-[clamp(24px,4vw,48px)] px-[clamp(20px,5vw,48px)] py-[clamp(24px,5vw,56px)]">
        <div className="flex flex-col gap-4">
          <span className="text-xs font-bold uppercase tracking-[0.12em] text-subtle">
            Guide de création de contenu · Partenaires photo &amp; vidéo
          </span>
          <h1 className="text-balance text-[clamp(2.25rem,6vw,4rem)] font-extrabold leading-[1.02] tracking-[-0.02em]">
            Aide à la création de contenu
          </h1>
        </div>
        <p className="text-[1.0625rem] leading-relaxed text-prose">
          Merci de créer avec nous. Ce guide résume ce que nous aimons voir dans vos photos et vos rushes : des scènes
          simples, bien éclairées, où le livre se vit vraiment. Le reste — nombre de contenus, délais, droits — est dans
          votre contrat.
        </p>
      </section>

      {/* ---------- L'image d'ouverture ---------- */}
      <section className="mx-auto max-w-[1120px] px-[clamp(20px,5vw,48px)]">
        <div className="relative min-h-[260px] overflow-hidden rounded-card bg-tint-sand [aspect-ratio:16/7]">
          {guide.hero ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={guide.hero} alt="" className="absolute inset-0 h-full w-full object-cover [object-position:50%_40%]" />
          ) : (
            <Empty label="Photo d'ouverture" />
          )}
          <span className="absolute bottom-[18px] left-[18px] rounded-pill bg-white/90 px-3.5 py-2 text-[0.8125rem] font-semibold">
            Lumière naturelle, fond simple.
          </span>
        </div>
      </section>

      {/* ---------- La lumière ---------- */}
      <section
        id="lumiere"
        className="mx-auto grid max-w-[1120px] grid-cols-[repeat(auto-fit,minmax(min(100%,340px),1fr))] items-start gap-[clamp(24px,4vw,48px)] px-[clamp(20px,5vw,48px)] py-[clamp(40px,7vw,80px)]"
      >
        <div className="flex flex-col gap-2.5 rounded-[20px] bg-paper px-[26px] py-6">
          <span className="text-xs font-bold uppercase tracking-[0.12em] text-faint">Mon Vrai en 3 lignes</span>
          <p className="text-pretty text-lg font-bold leading-snug">
            Des imagiers cartonnés sans texte, uniquement en vraies photos, dès 6 mois.
          </p>
          <p className="text-pretty text-prose">
            Pas de dessin : le vrai fruit, le vrai animal, le vrai vêtement, pour nommer le monde tel qu&apos;il est.
          </p>
          <p className="text-pretty text-prose">Des livres qui se vivent au sol, dans les mains, au quotidien.</p>
        </div>

        <div className="flex flex-col gap-4">
          <h2 className="text-[clamp(1.5rem,3vw,2rem)] font-extrabold tracking-[-0.02em]">La lumière et l&apos;ambiance</h2>
          <div className="grid grid-cols-[30px_1fr] items-start gap-3.5">
            {LIGHT_POINTS.map((point, i) => (
              <Fragmentish key={point.lead} n={i + 1} lead={point.lead} rest={point.rest} />
            ))}
          </div>
        </div>
      </section>

      {/* ---------- Pour s'inspirer ---------- */}
      <section className="mx-auto flex max-w-[1120px] flex-col gap-3.5 px-[clamp(20px,5vw,48px)]">
        <span className="text-xs font-bold uppercase tracking-[0.12em] text-faint">
          Pour s&apos;inspirer · pas à reproduire à l&apos;identique
        </span>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,260px),1fr))] gap-5">
          {guide.inspirations.map((shot) => (
            <Shot key={shot.key} shot={shot} />
          ))}
        </div>
      </section>

      {/* ---------- Les rushes ---------- */}
      <section id="rushes" className="mx-auto flex max-w-[1120px] flex-col gap-5 px-[clamp(20px,5vw,48px)] pt-[clamp(48px,8vw,96px)]">
        <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
          <h2 className="text-[clamp(1.75rem,4vw,2.5rem)] font-extrabold tracking-[-0.02em]">Les rushes vidéo</h2>
          <span className="text-sm font-semibold text-subtle">Nous montons tout nous-mêmes : donnez-nous de la matière.</span>
        </div>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,300px),1fr))] gap-4">
          {guide.rushes.map((card) => (
            <div key={card.title} className="flex flex-col gap-1.5 rounded-[18px] bg-paper px-[22px] py-5">
              <span className="text-pretty font-bold">{card.title}</span>
              <span className="text-pretty text-[0.9375rem] text-prose">{card.text}</span>
            </div>
          ))}
        </div>
      </section>

      {/* ---------- Les exemples vidéo ---------- */}
      <section id="exemples" className="mx-auto flex max-w-[1120px] flex-col gap-5 px-[clamp(20px,5vw,48px)] pt-[clamp(40px,6vw,72px)]">
        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-bold uppercase tracking-[0.12em] text-faint">Exemples vidéo</span>
          <h3 className="text-[clamp(1.375rem,3vw,1.75rem)] font-extrabold tracking-[-0.02em]">À quoi ressemble un bon rush</h3>
          <p className="max-w-[640px] text-pretty text-prose">
            Des plans bruts, tels que nous aimons les recevoir. Lancez-les pour voir le rythme, le cadrage et la lumière.
          </p>
        </div>
        <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,220px),1fr))] items-start gap-5">
          {guide.videos.map((video) => (
            <div key={video.key} className="flex flex-col gap-2">
              <div className="relative overflow-hidden rounded-thumb bg-tint-sand [aspect-ratio:9/16]">
                {video.url ? (
                  <video
                    src={video.url}
                    poster={video.poster || undefined}
                    controls
                    playsInline
                    preload="metadata"
                    className="absolute inset-0 h-full w-full bg-ink object-cover"
                  />
                ) : (
                  <Empty label="Vidéo à venir" />
                )}
              </div>
              <span className="text-[0.9375rem] font-bold">{video.title}</span>
              <span className="text-pretty text-sm text-prose">{video.caption}</span>
            </div>
          ))}
        </div>
      </section>

      {/* ---------- Les mises en scène ---------- */}
      <section id="scenes" className="mx-auto flex max-w-[1120px] flex-col gap-5 px-[clamp(20px,5vw,48px)] pt-[clamp(48px,8vw,96px)]">
        <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
          <h2 className="text-[clamp(1.75rem,4vw,2.5rem)] font-extrabold tracking-[-0.02em]">Mises en scène et associations</h2>
          <span className="text-sm font-semibold text-subtle">Des pistes à interpréter librement, chez vous, à votre façon.</span>
        </div>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,300px),1fr))] gap-5">
          {guide.scenes.slice(0, 2).map((shot) => (
            <Shot key={shot.key} shot={shot} />
          ))}
          {SCENE_CARDS.map((card) => (
            <div
              key={card.title}
              className={`flex min-h-[240px] flex-col justify-end gap-2 rounded-thumb px-6 py-[22px] ${
                card.tone === "green" ? "bg-tint-green text-tint-green-ink" : "bg-tint-sand text-tint-sand-ink"
              }`}
            >
              <span className="mb-auto text-xs font-bold uppercase tracking-[0.12em]">{card.eyebrow}</span>
              <span className="font-bold">{card.title}</span>
              <span className="text-pretty text-[0.9375rem]">{card.text}</span>
            </div>
          ))}
          {guide.scenes.slice(2).map((shot) => (
            <Shot key={shot.key} shot={shot} />
          ))}
        </div>
      </section>

      {/* ---------- À éviter ---------- */}
      <section className="mx-auto flex max-w-[1120px] flex-col gap-4 px-[clamp(20px,5vw,48px)] pt-[clamp(40px,6vw,72px)]">
        <div className="flex flex-col gap-3.5 rounded-[20px] border-[1.5px] border-ink px-6 py-[22px]">
          <span className="text-xs font-bold uppercase tracking-[0.12em]">À éviter</span>
          <div className="flex flex-wrap gap-x-2.5 gap-y-2 text-sm font-semibold text-prose">
            {AVOID.map((item) => (
              <span key={item} className="rounded-pill bg-paper px-3.5 py-1.5">
                {item}
              </span>
            ))}
          </div>
        </div>
        <p className="max-w-[720px] text-pretty text-[0.9375rem] text-prose">
          <strong className="text-ink">L&apos;enfant à l&apos;image.</strong> {guide.childNote}
        </p>
      </section>

      <footer className="mx-auto max-w-[1120px] px-[clamp(20px,5vw,48px)] pb-10 pt-[clamp(40px,6vw,72px)]">
        <div className="flex flex-wrap justify-between gap-x-6 gap-y-3 border-t border-line-warm pt-5 text-[0.8125rem] text-subtle">
          <span>{settings.shopName} · monvrai.fr</span>
          {email && <a href={`mailto:${email}`} className="underline hover:opacity-70">{email}</a>}
        </div>
      </footer>
    </div>
  );
}

/** Un point numéroté de la liste « lumière » : la pastille, puis la phrase. */
function Fragmentish({ n, lead, rest }: { n: number; lead: string; rest: string }) {
  return (
    <>
      <span className="flex h-[30px] w-[30px] items-center justify-center rounded-pill bg-tint-green text-[0.8125rem] font-extrabold text-tint-green-ink">
        {n}
      </span>
      <p className="text-pretty">
        <strong>{lead}</strong> <span className="text-prose">{rest}</span>
      </p>
    </>
  );
}

/** Une photo légendée. Sa place reste lisible quand l'image manque encore. */
function Shot({ shot }: { shot: FilledShot }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="relative overflow-hidden rounded-thumb bg-tint-sand [aspect-ratio:4/3]">
        {shot.url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={shot.url} alt="" className="h-full w-full object-cover" />
        ) : (
          <Empty label={shot.hint} />
        )}
      </div>
      {shot.title && <span className="font-bold">{shot.title}</span>}
      <span className="text-pretty text-[0.9375rem] text-prose">{shot.caption}</span>
    </div>
  );
}

/*
 * Un emplacement qui attend son fichier. Il dit ce qu'il attend plutôt que de laisser
 * un rectangle muet : le guide se lit déjà, et l'on voit du premier coup d'œil ce qu'il
 * reste à poser.
 */
function Empty({ label }: { label: string }) {
  return (
    <span className="absolute inset-0 flex flex-col items-center justify-center gap-2.5 p-4 text-center text-tint-sand-ink">
      <span className="flex h-12 w-12 items-center justify-center rounded-pill bg-white/70 text-base">▶</span>
      <span className="text-[0.8125rem] font-semibold">{label}</span>
    </span>
  );
}

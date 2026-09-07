import type { Metadata } from "next";
import Image from "next/image";
import { CtaBand } from "@/components/site/home-sections";
import { Newsletter } from "@/components/site/Newsletter";
import { Eyebrow, TINT_BG, TINT_INK } from "@/components/site/ui";
import { getHomeContent, getStoryContent } from "@/lib/db/content";

export const metadata: Metadata = { title: "Notre histoire" };
export const dynamic = "force-dynamic";

/*
 * Page « Notre histoire » (maquette 4a) : héro bicolore, prose en colonnes inégales,
 * trois principes teintés, triptyque photo, seconde prose, bandeau sombre, newsletter.
 */
export default async function StoryPage() {
  const [story, home] = await Promise.all([getStoryContent(), getHomeContent()]);
  if (!story) {
    return (
      <section className="site-wrap py-24 text-center">
        <h1 className="display-2">Cette page n'est pas encore rédigée.</h1>
      </section>
    );
  }

  return (
    <>
      <section className="site-wrap pt-2">
        <div className="grid grid-cols-2 gap-4 max-[899px]:grid-cols-1">
          <div className={`flex flex-col justify-center gap-5 rounded-panel p-16 max-[899px]:p-8 ${TINT_BG[story.hero.tint]}`}>
            {story.hero.eyebrow && <Eyebrow className={TINT_INK[story.hero.tint]}>{story.hero.eyebrow}</Eyebrow>}
            <h1 className="display-1 text-[clamp(2rem,4.6vw,3.375rem)]">{story.hero.heading}</h1>
            {story.hero.text && <p className={`text-[1.0625rem] leading-relaxed ${TINT_INK[story.hero.tint]}`}>{story.hero.text}</p>}
          </div>
          {story.hero.image && (
            <Image
              src={story.hero.image.url}
              alt={story.hero.image.alt}
              width={story.hero.image.width ?? 1200}
              height={story.hero.image.height ?? 900}
              sizes="(min-width: 900px) 50vw, 100vw"
              priority
              className="h-[520px] w-full rounded-panel object-cover max-[899px]:h-72"
            />
          )}
        </div>
      </section>

      <Prose heading={story.intro.heading} paragraphs={story.intro.paragraphs} />

      {story.principles.length > 0 && (
        <section className="site-wrap grid grid-cols-3 gap-4 max-[899px]:grid-cols-1">
          {story.principles.map((p) => (
            <div key={p.title} className={`flex flex-col gap-3 rounded-card p-8 ${TINT_BG[p.tint]}`}>
              <span className={`text-[0.8125rem] font-bold uppercase tracking-[0.1em] ${TINT_INK[p.tint]}`}>{p.eyebrow}</span>
              <span className="text-lg font-bold leading-snug">{p.title}</span>
              <span className={`text-sm leading-relaxed ${TINT_INK[p.tint]}`}>{p.text}</span>
            </div>
          ))}
        </section>
      )}

      {story.gallery.length > 0 && (
        <section className="site-wrap mt-16 grid gap-4 max-[899px]:mt-8 max-[899px]:grid-cols-2" style={{ gridTemplateColumns: `repeat(${story.gallery.length}, 1fr)` }}>
          {story.gallery.map((img, i) => (
            <Image
              key={`${img.url}-${i}`}
              src={img.url}
              alt={img.alt}
              width={img.width ?? 900}
              height={img.height ?? 900}
              sizes="(min-width: 750px) 33vw, 100vw"
              className="h-[380px] w-full rounded-card object-cover max-[899px]:h-48"
            />
          ))}
        </section>
      )}

      <Prose heading={story.walk.heading} paragraphs={story.walk.paragraphs} />

      <CtaBand heading={story.cta.heading} text={story.cta.text} button={story.cta.button} />

      {home && <Newsletter {...home.newsletter} />}
      <div className="h-16" />
    </>
  );
}

/** Titre à gauche, texte au fil à droite ; le dernier paragraphe fait office de chute. */
function Prose({ heading, paragraphs }: { heading: string; paragraphs: string[] }) {
  return (
    <section className="site-wrap grid grid-cols-[1fr_1.4fr] gap-16 py-20 max-[899px]:grid-cols-1 max-[899px]:gap-6 max-[899px]:py-12">
      <h2 className="display-2">{heading}</h2>
      <div className="flex flex-col gap-5 text-[1.0625rem] leading-[1.65] text-[#444]">
        {paragraphs.map((p, i) => (
          <p key={i} className={i === paragraphs.length - 1 && paragraphs.length > 1 ? "font-semibold text-ink" : ""}>
            {p}
          </p>
        ))}
      </div>
    </section>
  );
}

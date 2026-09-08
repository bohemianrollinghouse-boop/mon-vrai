import Image from "next/image";
import type { Cta, HomeContent, ImageRef, Tint } from "@/lib/domain/types";
import { HeroVideo } from "./HeroVideo";
import { Eyebrow, PillLink, TINT_BG, TINT_INK } from "./ui";

/*
 * Blocs de la page d'accueil (maquette 2a). Composants serveur, purement présentatifs :
 * ils reçoivent le contenu déjà chargé et ne lisent rien eux-mêmes.
 */

export function HomeHero({ hero }: { hero: HomeContent["hero"] }) {
  return (
    <section className="site-wrap pt-2">
      <div className="relative flex h-[640px] items-end overflow-hidden rounded-panel bg-tint-sand max-[1099px]:h-auto max-[1099px]:min-h-[640px] max-[749px]:min-h-[30rem]">
        {hero.videoUrl ? (
          <HeroVideo videoUrl={hero.videoUrl} />
        ) : hero.posterUrl ? (
          <Image src={hero.posterUrl} alt="" fill sizes="(min-width: 1296px) 1200px, 100vw" className="object-cover" priority />
        ) : null}

        {/* Dégradé du bas : le texte est calé en bas, c'est là qu'il faut du contraste. */}
        <div className="absolute inset-0 bg-[linear-gradient(to_top,rgb(0_0_0/0.55)_0%,rgb(0_0_0/0.05)_55%)]" />
        {/* Mobile : la vidéo remplit tout le cadre derrière le texte, un voile sombre le rend lisible. */}
        <div className="absolute inset-0 hidden bg-black/35 max-[749px]:block" aria-hidden="true" />

        <div className="relative flex w-full items-end justify-between gap-10 px-16 py-14 text-white max-[1099px]:flex-col max-[1099px]:items-start max-[1099px]:p-10 max-[749px]:gap-6 max-[749px]:px-6 max-[749px]:py-7">
          <div className="flex max-w-[620px] flex-col gap-[1.125rem]">
            {hero.badge && (
              <span className="w-fit rounded-pill bg-white/[0.92] px-3.5 py-2 text-xs font-bold text-ink">{hero.badge}</span>
            )}
            <h1 className="display-1">{hero.heading}</h1>
            {hero.text && <p className="max-w-[480px] text-[1.0625rem] leading-relaxed">{hero.text}</p>}
          </div>
          <div className="flex flex-none flex-wrap gap-3 max-[749px]:w-full">
            {hero.primary.label && (
              <PillLink href={hero.primary.href || "/catalogue"} variant="light" size="lg">
                {hero.primary.label}
              </PillLink>
            )}
            {hero.secondary.label && (
              <PillLink href={hero.secondary.href || "/notre-histoire"} variant="ghost" size="lg">
                {hero.secondary.label}
              </PillLink>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

export function Tiles({ tiles }: { tiles: HomeContent["tiles"] }) {
  if (tiles.length === 0) return null;
  return (
    <section className="site-wrap grid grid-cols-3 gap-4 pt-4 max-[989px]:grid-cols-1">
      {tiles.map((t) => (
        <div key={t.title} className={`flex flex-col gap-2 rounded-card p-7 ${TINT_BG[t.tint]}`}>
          <span className="text-[1.625rem] font-extrabold leading-tight">{t.title}</span>
          <span className={`text-sm font-semibold leading-snug ${TINT_INK[t.tint]}`}>{t.text}</span>
        </div>
      ))}
    </section>
  );
}

type SplitProps = {
  eyebrow: string;
  heading: string;
  text: string;
  image?: ImageRef;
  cta: Cta;
  mediaSide: "left" | "right";
  tint?: Tint;
  ctaStyle: "pill" | "underline";
  mediaHeight?: number;
};

/** Bloc image + texte, en miroir selon `mediaSide` ; fond teinté ou blanc. */
export function Split({ eyebrow, heading, text, image, cta, mediaSide, tint, ctaStyle, mediaHeight = 480 }: SplitProps) {
  const ink = tint ? TINT_INK[tint] : "text-muted";
  return (
    <section className="site-wrap">
      <div className={`mt-4 grid grid-cols-2 overflow-hidden rounded-panel max-[899px]:grid-cols-1 ${tint ? TINT_BG[tint] : "bg-white"}`}>
        <div className={`${mediaSide === "left" ? "order-1" : "order-2"} max-[899px]:order-1`}>
          {image && (
            <Image
              src={image.url}
              alt={image.alt}
              width={image.width ?? 1200}
              height={image.height ?? 900}
              sizes="(min-width: 750px) 50vw, 100vw"
              className="h-full w-full object-cover max-[899px]:h-64"
              style={{ height: mediaHeight }}
            />
          )}
        </div>
        <div className={`flex flex-col justify-center gap-5 p-16 max-[899px]:p-9 ${mediaSide === "left" ? "order-2" : "order-1"} max-[899px]:order-2`}>
          {eyebrow && <Eyebrow className={ink}>{eyebrow}</Eyebrow>}
          <h2 className="display-2">{heading}</h2>
          {text && <p className={`leading-relaxed ${ink}`}>{text}</p>}
          {cta.label &&
            (ctaStyle === "pill" ? (
              <PillLink href={cta.href || "#"} variant="dark" className="w-fit px-6 py-3.5 text-[0.8125rem]">
                {cta.label}
              </PillLink>
            ) : (
              <a href={cta.href || "#"} className="w-fit border-b-2 border-ink pb-0.5 text-sm font-bold">
                {cta.label}
              </a>
            ))}
        </div>
      </div>
    </section>
  );
}

export function CtaBand({ heading, text, button }: { heading: string; text: string; button: Cta }) {
  return (
    <section className="site-wrap">
      <div className="mt-4 flex flex-wrap items-center justify-between gap-10 rounded-panel bg-ink p-16 text-white max-[749px]:px-7 max-[749px]:py-9">
        <div className="flex max-w-[560px] flex-col gap-2.5">
          <h2 className="text-[clamp(1.625rem,3.6vw,2.25rem)] leading-[1.1] font-extrabold tracking-[-0.02em]">{heading}</h2>
          {text && <p className="text-[0.9375rem] leading-relaxed text-[#bbb]">{text}</p>}
        </div>
        {button.label && (
          <PillLink href={button.href || "/catalogue"} variant="light" size="lg" className="flex-none">
            {button.label}
          </PillLink>
        )}
      </div>
    </section>
  );
}

import Image from "next/image";
import Link from "next/link";
import type { ImageRef, Tint } from "@/lib/domain/types";
import { Eyebrow, PillLink, TINT_BG, TINT_INK } from "./ui";

/*
 * Blocs des pages éditoriales longues — « Notre histoire », « Le concept ». Ils
 * complètent home-sections.tsx : un récit en chapitres, des chiffres, une frise, des
 * panneaux image + texte plus riches que le Split de l'accueil.
 *
 * Composants purement présentatifs, rendus aussi bien par le site que par l'éditeur
 * de blocs : pas de "use client", pas d'accès aux données, pas d'import `server-only`.
 * Chacun porte son propre `site-wrap`, comme le veut la convention des blocs.
 */

export type Figure = { value: string; text: string };
export type Step = { label: string; text: string };
export type Bullet = { mark: string; text: string };
export type Card = { title: string; text: string };
export type TocEntry = { number: string; label: string; href: string };

/*
 * Le relief d'un paragraphe de récit, tel que la maquette le pratique : la chute d'un
 * chapitre en demi-gras, une phrase qui claque en plus gros, et la question centrale
 * détachée par un filet vert. Il se choisit paragraphe par paragraphe — une chute
 * déduite de la position tomberait au mauvais endroit dès qu'un chapitre se termine
 * sur une phrase ordinaire.
 */
export type Emphasis = "normal" | "chute" | "forte" | "citation";
export type Line = { text: string; emphasis?: Emphasis };

const EMPHASIS: Record<Emphasis, string> = {
  normal: "",
  chute: "font-semibold text-ink",
  forte: "text-[clamp(1.125rem,2vw,1.375rem)] font-bold leading-[1.4] text-ink",
  citation: "border-l-[3px] border-tint-green pl-5 text-[clamp(1.0625rem,2vw,1.25rem)] font-bold leading-[1.5] text-ink",
};

/** Texte au fil ; la chute est mise en avant, comme dans la maquette. */
function Flow({ items, strong = "font-semibold text-ink" }: { items: string[]; strong?: string }) {
  return (
    <>
      {items.map((p, i) => (
        <p key={i} className={i === items.length - 1 && items.length > 1 ? strong : ""}>
          {p}
        </p>
      ))}
    </>
  );
}

/** Photo d'un bloc : les dimensions du média quand on les a, sinon un rapport 4/3. */
function Picture({ image, className, sizes }: { image: ImageRef; className: string; sizes: string }) {
  return (
    <Image
      src={image.url}
      alt={image.alt}
      width={image.width ?? 1200}
      height={image.height ?? 900}
      sizes={sizes}
      className={`w-full object-cover ${className}`}
    />
  );
}

/*
 * L'allure d'un bloc de récit. « colonnes » met le titre sur un tiers et le texte sur
 * deux tiers, sur toute la largeur du site ; « centre » empile titre puis texte dans
 * une colonne de lecture de 760 px. Le récit long préfère la seconde, les pages plus
 * documentaires la première.
 */
export type Layout = "colonnes" | "centre";

/** Colonne de lecture des blocs centrés — la même partout, d'où la constante. */
const READING = "mx-auto flex max-w-[760px] flex-col gap-7";

/*
 * Un chapitre du récit : surtitre et titre sur un tiers, texte au fil sur deux tiers.
 * La piste vide de `auto-fit` se replie, d'où le 1/3 – 2/3 sans le déclarer. En
 * « centre », le titre passe simplement au-dessus de la colonne de lecture.
 */
export function Chapter({
  eyebrow,
  heading,
  lines,
  chips = [],
  image,
  closing,
  anchor,
  chipTint = "green",
  layout = "colonnes",
}: {
  eyebrow?: string;
  heading: string;
  lines: Line[];
  chips?: string[];
  image?: ImageRef;
  /** Ce qui se dit après la photo, et non avant : la chute d'un chapitre illustré. */
  closing?: Line;
  anchor?: string;
  chipTint?: Tint;
  layout?: Layout;
}) {
  const centre = layout === "centre";
  const head = (
    <div className="flex flex-col gap-3">
      {eyebrow && <Eyebrow className="text-faint">{eyebrow}</Eyebrow>}
      <h2 className="display-2">{heading}</h2>
    </div>
  );
  const body = (
    <div className={`flex flex-col gap-5 text-[1.0625rem] leading-[1.65] text-prose ${centre ? "" : "col-span-2"}`}>
      {lines.map((l, i) => (
        <p key={i} className={EMPHASIS[l.emphasis ?? "normal"]}>
          {l.text}
        </p>
      ))}
      {chips.length > 0 && <Chips items={chips} tint={chipTint} />}
      {image && (
        <Picture image={image} sizes={centre ? "(min-width: 900px) 760px, 100vw" : "(min-width: 900px) 66vw, 100vw"} className="h-[420px] rounded-card max-[899px]:h-60" />
      )}
      {closing?.text && <p className={EMPHASIS[closing.emphasis ?? "normal"]}>{closing.text}</p>}
    </div>
  );
  return (
    <section id={anchor || undefined} className="site-wrap scroll-mt-28 pt-20 max-[899px]:pt-12">
      {centre ? (
        <div className={READING}>
          {head}
          {body}
        </div>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fit,minmax(280px,1fr))] gap-16 max-[899px]:gap-6">
          {head}
          {body}
        </div>
      )}
    </section>
  );
}

/** Sommaire ancré : le numéro, le titre, et un renvoi libre en fin de liste. */
export function Contents({ label, items, layout = "colonnes" }: { label: string; items: TocEntry[]; layout?: Layout }) {
  if (items.length === 0) return null;
  const centre = layout === "centre";
  const list = (
    <ol className={`grid list-none grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-x-8 gap-y-3 p-0 ${centre ? "" : "col-span-2"}`}>
      {items.map((e, i) => (
        <li key={i}>
          <Link href={e.href || "#"} className="flex gap-3 text-[0.9375rem] font-semibold leading-normal hover:opacity-70">
            <span className="text-faint">{e.number}</span>
            {e.label}
          </Link>
        </li>
      ))}
    </ol>
  );
  return (
    <section className="site-wrap pt-16 max-[899px]:pt-10">
      <div
        className={
          centre
            ? `${READING} border-t border-line-warm pt-8`
            : "grid grid-cols-[repeat(auto-fit,minmax(280px,1fr))] gap-16 border-t border-line-warm pt-8 max-[899px]:gap-6"
        }
      >
        {label && <Eyebrow className="text-faint">{label}</Eyebrow>}
        {list}
      </div>
    </section>
  );
}

/*
 * Tuiles « chiffre + légende » : les repères du récit, les caractéristiques d'un
 * produit. Séparées (des cartes blanches espacées) ou jointes en une seule bande.
 *
 * La bande se sépare par un `gap` d'un pixel sur un fond de filet plutôt que par des
 * bordures : les tuiles se replient en deux lignes dès que la largeur manque, et une
 * bordure posée sur chaque tuile laisserait alors un filet en bout de ligne.
 */
export function Figures({
  items,
  size = "lg",
  min = 180,
  joined = false,
}: {
  items: Figure[];
  size?: "lg" | "md";
  min?: number;
  joined?: boolean;
}) {
  if (items.length === 0) return null;
  return (
    <section className="site-wrap pt-16 max-[899px]:pt-10">
      <div
        className={`grid ${joined ? "gap-px overflow-hidden rounded-card bg-line-warm" : "gap-4"}`}
        style={{ gridTemplateColumns: `repeat(auto-fit, minmax(${min}px, 1fr))` }}
      >
        {items.map((f, i) => (
          <div key={i} className={`flex flex-col gap-1.5 bg-white p-8 ${joined ? "" : "rounded-card"}`}>
            <span className={`font-extrabold leading-none tracking-[-0.02em] ${size === "lg" ? "text-[2.5rem]" : "text-[2rem]"}`}>{f.value}</span>
            <span className={`leading-relaxed text-muted ${size === "lg" ? "text-sm font-semibold" : "text-[0.9375rem]"}`}>{f.text}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

/** Pastilles teintées : les titres d'une collection, les valeurs d'une enquête. */
export function Chips({ items, tint = "green", min = 150 }: { items: string[]; tint?: Tint; min?: number }) {
  if (items.length === 0) return null;
  return (
    <ul className="grid list-none gap-3 p-0" style={{ gridTemplateColumns: `repeat(auto-fit, minmax(${min}px, 1fr))` }}>
      {items.map((c, i) => (
        <li key={i} className={`rounded-thumb px-5 py-[1.125rem] text-[0.9375rem] font-bold ${TINT_BG[tint]} ${TINT_INK[tint]}`}>
          {c}
        </li>
      ))}
    </ul>
  );
}

/*
 * Étapes ou jalons. En colonnes, chaque jalon est coiffé d'un filet noir et la rangée
 * se lit de gauche à droite ; empilés, le filet passe sur le flanc et la frise se lit
 * de haut en bas — ce que demande une chronologie un peu longue.
 */
function StepList({ items, ink, min, stacked }: { items: Step[]; ink: string; min: number; stacked: boolean }) {
  return (
    <ol
      className={`grid list-none p-0 ${stacked ? "grid-cols-1 gap-5" : "gap-6"}`}
      style={stacked ? undefined : { gridTemplateColumns: `repeat(auto-fit, minmax(${min}px, 1fr))` }}
    >
      {items.map((s, i) => (
        <li key={i} className={`flex flex-col gap-2 border-ink ${stacked ? "border-l-2 pl-5" : "border-t-2 pt-4"}`}>
          <span className="text-[0.8125rem] font-bold uppercase tracking-[0.08em]">{s.label}</span>
          <span className={`text-[0.9375rem] leading-relaxed ${ink}`}>{s.text}</span>
        </li>
      ))}
    </ol>
  );
}

/**
 * Frise : la chronologie d'une marque, ou les étapes d'un usage. Panneau blanc sans
 * teinte, panneau teinté avec un en-tête.
 */
export function Timeline({
  eyebrow,
  heading,
  text,
  items,
  tint,
  min = 200,
  stacked = false,
}: {
  eyebrow?: string;
  heading?: string;
  text?: string;
  items: Step[];
  tint?: Tint;
  min?: number;
  /** Jalons empilés, filet sur le flanc, plutôt qu'en rangée. */
  stacked?: boolean;
}) {
  if (items.length === 0) return null;
  const ink = tint ? TINT_INK[tint] : "text-muted";
  return (
    <section className="site-wrap pt-16 max-[899px]:pt-10">
      <div className={`flex flex-col gap-8 rounded-panel p-14 max-[899px]:p-7 ${tint ? TINT_BG[tint] : "bg-white"}`}>
        {(eyebrow || heading || text) && (
          <div className="flex max-w-[760px] flex-col gap-3">
            {eyebrow && <Eyebrow className={tint ? ink : "text-faint"}>{eyebrow}</Eyebrow>}
            {heading && <h2 className="display-2">{heading}</h2>}
            {text && <p className={`text-[1.0625rem] leading-[1.65] ${ink}`}>{text}</p>}
          </div>
        )}
        <StepList items={items} ink={ink} min={min} stacked={stacked} />
      </div>
    </section>
  );
}

/*
 * Panneau image + carte, plus riche que le Split de l'accueil : une phrase mise en
 * avant, une liste à puces, un second paragraphe. C'est la brique qui revient le plus
 * dans les deux pages.
 */
export function EditorialPanel({
  eyebrow,
  heading,
  text,
  quote,
  text2,
  bullets = [],
  image,
  side = "right",
  tint,
}: {
  eyebrow?: string;
  heading?: string;
  text?: string;
  quote?: string;
  text2?: string;
  bullets?: Bullet[];
  image?: ImageRef;
  side?: "left" | "right";
  tint?: Tint;
}) {
  const ink = tint ? TINT_INK[tint] : "text-prose";
  /*
   * La photo s'étire à la hauteur de la carte, et c'est la carte qui la fixe. D'où le
   * `fill` dans un conteneur positionné : une hauteur en pourcentage sur l'image
   * elle-même se résoudrait contre une rangée dimensionnée par son contenu — donc
   * contre l'image —, et c'est la photo qui imposerait sa hauteur au panneau.
   */
  const picture = image ? (
    <div className="relative min-h-[300px] overflow-hidden rounded-panel max-[899px]:h-64 max-[899px]:min-h-0">
      <Image src={image.url} alt={image.alt} fill sizes="(min-width: 900px) 50vw, 100vw" className="object-cover" />
    </div>
  ) : null;
  const card = (
    <div className={`flex flex-col justify-center gap-5 rounded-panel p-14 max-[899px]:p-7 ${tint ? TINT_BG[tint] : "bg-white"}`}>
      {eyebrow && <Eyebrow className={tint ? ink : "text-faint"}>{eyebrow}</Eyebrow>}
      {heading && <h2 className="display-2">{heading}</h2>}
      {text && <p className={`text-[1.0625rem] leading-[1.65] ${ink}`}>{text}</p>}
      {bullets.length > 0 && (
        <ul className="flex list-none flex-col gap-2.5 p-0">
          {bullets.map((b, i) => (
            <li key={i} className="flex gap-3.5 text-base font-semibold leading-normal">
              <span className={`min-w-[1.5em] ${tint ? ink : "text-tint-green-ink"}`}>{b.mark}</span>
              {b.text}
            </li>
          ))}
        </ul>
      )}
      {quote && <p className="text-[clamp(1.0625rem,2vw,1.25rem)] font-bold leading-[1.45]">{quote}</p>}
      {text2 && <p className={`text-[1.0625rem] leading-[1.65] ${ink}`}>{text2}</p>}
    </div>
  );
  return (
    <section className="site-wrap pt-16 max-[899px]:pt-10">
      <div className="grid grid-cols-[repeat(auto-fit,minmax(300px,1fr))] items-stretch gap-4">
        {side === "left" && picture}
        {card}
        {side === "right" && picture}
      </div>
    </section>
  );
}

/*
 * Panneau sombre. Deux allures : des cartes (les valeurs de la marque) ou deux
 * colonnes titre / texte (le manifeste graphique).
 */
export function DarkPanel({
  eyebrow,
  heading,
  text,
  paragraphs = [],
  cards = [],
  layout = "cards",
}: {
  eyebrow?: string;
  heading?: string;
  text?: string;
  paragraphs?: string[];
  cards?: Card[];
  layout?: "cards" | "columns";
}) {
  if (layout === "columns") {
    return (
      <section className="site-wrap pt-16 max-[899px]:pt-10">
        <div className="grid grid-cols-[repeat(auto-fit,minmax(280px,1fr))] gap-12 rounded-panel bg-deep p-14 text-on-deep max-[899px]:gap-6 max-[899px]:p-7">
          <div className="flex flex-col gap-3">
            {eyebrow && <Eyebrow className="text-on-deep-muted">{eyebrow}</Eyebrow>}
            {heading && <h2 className="display-2">{heading}</h2>}
          </div>
          <div className="flex flex-col gap-5 text-[1.0625rem] leading-[1.65] text-on-deep-muted">
            <Flow items={paragraphs} strong="font-bold text-on-deep" />
          </div>
        </div>
      </section>
    );
  }
  return (
    <section className="site-wrap pt-16 max-[899px]:pt-10">
      <div className="flex flex-col gap-9 rounded-panel bg-deep p-14 text-on-deep max-[899px]:p-7">
        <div className="flex max-w-[620px] flex-col gap-2.5">
          {eyebrow && <Eyebrow className="text-on-deep-muted">{eyebrow}</Eyebrow>}
          {heading && <h2 className="text-[clamp(1.625rem,3.6vw,2.25rem)] font-extrabold leading-[1.1] tracking-[-0.02em]">{heading}</h2>}
          {text && <p className="text-[0.9375rem] leading-relaxed text-on-deep-muted">{text}</p>}
        </div>
        <div className="grid grid-cols-2 gap-4 max-[599px]:grid-cols-1">
          {cards.map((c, i) => (
            <div key={i} className="flex flex-col gap-2 rounded-card bg-deep-soft p-7">
              <span className="text-[1.375rem] font-extrabold tracking-[-0.01em]">{c.title}</span>
              <span className="text-sm leading-relaxed text-on-deep-muted">{c.text}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/** Colonne de lecture centrée : la respiration entre deux panneaux. */
export function CenteredProse({
  eyebrow,
  heading,
  paragraphs,
  chips = [],
  chipTint = "green",
  closing,
  image,
}: {
  eyebrow?: string;
  heading?: string;
  paragraphs: string[];
  chips?: string[];
  chipTint?: Tint;
  /** Ce qui se dit après les pastilles, et non avant. */
  closing?: string;
  image?: ImageRef;
}) {
  return (
    <section className="site-wrap pt-14 max-[899px]:pt-8">
      <div className="mx-auto flex max-w-[760px] flex-col gap-5">
        {eyebrow && <Eyebrow className="text-faint">{eyebrow}</Eyebrow>}
        {heading && <h2 className="display-2">{heading}</h2>}
        <div className="flex flex-col gap-5 text-[1.0625rem] leading-[1.65] text-prose">
          <Flow items={paragraphs} />
        </div>
        {chips.length > 0 && <Chips items={chips} tint={chipTint} min={180} />}
        {closing && <p className="text-[1.0625rem] leading-[1.65] text-prose">{closing}</p>}
        {image && <Picture image={image} sizes="(min-width: 900px) 760px, 100vw" className="h-[380px] rounded-card max-[899px]:h-56" />}
      </div>
    </section>
  );
}

/** Bandeau teinté centré, avec ses deux boutons : la chute d'une page. */
export function TintBanner({
  eyebrow,
  heading,
  text,
  primary,
  secondary,
  tint = "green",
}: {
  eyebrow?: string;
  heading: string;
  text?: string;
  primary?: { label: string; href: string };
  secondary?: { label: string; href: string };
  tint?: Tint;
}) {
  return (
    <section className="site-wrap py-16 max-[899px]:py-10">
      <div className={`flex flex-col items-center gap-6 rounded-panel p-16 text-center max-[899px]:p-8 ${TINT_BG[tint]}`}>
        {eyebrow && <Eyebrow className={TINT_INK[tint]}>{eyebrow}</Eyebrow>}
        <p className="max-w-[800px] text-[clamp(1.25rem,2.6vw,1.75rem)] font-bold leading-[1.35] tracking-[-0.01em]">{heading}</p>
        {text && <p className={`max-w-[680px] text-[1.0625rem] leading-[1.65] ${TINT_INK[tint]}`}>{text}</p>}
        {(primary?.label || secondary?.label) && (
          <div className="flex flex-wrap justify-center gap-3 pt-2">
            {primary?.label && (
              <PillLink href={primary.href || "#"} variant="dark" size="lg">
                {primary.label}
              </PillLink>
            )}
            {secondary?.label && (
              <PillLink href={secondary.href || "#"} variant="light" size="lg">
                {secondary.label}
              </PillLink>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

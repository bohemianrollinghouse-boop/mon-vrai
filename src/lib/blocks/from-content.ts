import type { BlockDocument, CatalogueContent, ContactContent, HomeContent, StoryContent } from "@/lib/domain/types";

/*
 * Conversion des anciens contenus structurés (documents `content/home` et
 * `content/story`) en documents de blocs. Ces deux pages étaient des routes système
 * avec leur propre schéma ; ce sont désormais des pages libres composées en blocs.
 *
 * Fonctions pures, sans accès aux données : elles servent au seed et sont testées
 * (from-content.test.ts).
 */

let seq = 0;
const block = (type: string, props: Record<string, unknown>) => ({ type, props: { id: `${type}-${++seq}`, ...props } });

/** Accueil : héro, tuiles, grille du catalogue, deux blocs image + texte, infolettre. */
export function homeToBlocks(h: HomeContent): BlockDocument {
  seq = 0;
  return {
    root: { props: {} },
    content: [
      block("HerosAccueil", {
        badge: h.hero.badge,
        titre: h.hero.heading,
        texte: h.hero.text,
        video: h.hero.videoUrl ? { url: h.hero.videoUrl, alt: "" } : undefined,
        affiche: h.hero.posterUrl ? { url: h.hero.posterUrl, alt: "" } : undefined,
        ctaLabel: h.hero.primary.label,
        ctaHref: h.hero.primary.href,
        cta2Label: h.hero.secondary.label,
        cta2Href: h.hero.secondary.href,
      }),
      block("Tuiles", { items: h.tiles.map((t) => ({ titre: t.title, texte: t.text, teinte: t.tint })) }),
      // La grille n'emporte pas les livres : ils arrivent au rendu par les métadonnées.
      block("Catalogue", { titre: h.catalogue.heading, lienLabel: h.catalogue.linkLabel, nombre: h.catalogue.count }),
      block("ImageTexte", {
        surtitre: h.howTo.eyebrow, titre: h.howTo.heading, texte: h.howTo.text, image: h.howTo.image,
        cote: "left", teinte: h.howTo.tint ?? "", ctaLabel: h.howTo.cta.label, ctaHref: h.howTo.cta.href,
        ctaStyle: "pill", hauteurMedia: 480,
      }),
      block("ImageTexte", {
        surtitre: h.story.eyebrow, titre: h.story.heading, texte: h.story.text, image: h.story.image,
        cote: "right", teinte: "", ctaLabel: h.story.cta.label, ctaHref: h.story.cta.href,
        ctaStyle: "underline", hauteurMedia: 440,
      }),
      block("Infolettre", { titre: h.newsletter.heading, texte: h.newsletter.text, placeholder: h.newsletter.placeholder, bouton: h.newsletter.button }),
    ],
  };
}

/** Notre histoire : héro bicolore, proses, principes, triptyque, bandeau, infolettre. */
export function storyToBlocks(s: StoryContent, newsletter?: HomeContent["newsletter"]): BlockDocument {
  seq = 0;
  const content = [
    block("Heros", { surtitre: s.hero.eyebrow, titre: s.hero.heading, texte: s.hero.text, image: s.hero.image, teinte: s.hero.tint }),
    block("Prose", { titre: s.intro.heading, paragraphes: s.intro.paragraphs.map((texte) => ({ texte })) }),
    block("Principes", { items: s.principles.map((p) => ({ surtitre: p.eyebrow, titre: p.title, texte: p.text, teinte: p.tint })) }),
    block("Galerie", { images: s.gallery.map((image) => ({ image })), hauteur: 380 }),
    block("Prose", { titre: s.walk.heading, paragraphes: s.walk.paragraphs.map((texte) => ({ texte })) }),
    block("Bandeau", { titre: s.cta.heading, texte: s.cta.text, ctaLabel: s.cta.button.label, ctaHref: s.cta.button.href }),
  ];
  if (newsletter) {
    content.push(block("Infolettre", { titre: newsletter.heading, texte: newsletter.text, placeholder: newsletter.placeholder, bouton: newsletter.button }));
  }
  return { root: { props: {} }, content };
}

/** Catalogue : héro (avec l'offre collection), grille complète, caractéristiques, infolettre. */
export function catalogueToBlocks(c: CatalogueContent, newsletter?: HomeContent["newsletter"]): BlockDocument {
  seq = 0;
  const content = [
    block("HerosCatalogue", {
      surtitre: c.hero.eyebrow,
      titre: c.hero.heading,
      texte: c.hero.text,
      teinte: c.hero.tint,
      offreActive: c.offer.enabled,
      offreTitre: c.offer.title,
      offrePrixBarre: c.offer.compareAt,
      offrePrix: c.offer.price,
      offreNote: c.offer.note,
      offreCtaLabel: c.offer.cta.label,
    }),
    block("GrilleCatalogue", {}),
    block("Specs", { items: c.specs.map((sp) => ({ titre: sp.title, texte: sp.text })) }),
  ];
  if (newsletter) {
    content.push(block("Infolettre", { titre: newsletter.heading, texte: newsletter.text, placeholder: newsletter.placeholder, bouton: newsletter.button }));
  }
  return { root: { props: {} }, content };
}

/*
 * Contact : héro et formulaire côte à côte, FAQ, infolettre. Les coordonnées, les
 * sujets du formulaire et les questions ne sont pas recopiés — ils restent dans les
 * réglages, dans Contenus et dans /admin/faq, et arrivent par les métadonnées.
 */
export function contactToBlocks(c: ContactContent, newsletter?: HomeContent["newsletter"]): BlockDocument {
  seq = 0;
  const content = [
    block("Colonnes", {
      repartition: "1-2",
      espacement: "sm",
      gauche: [
        block("HerosContact", {
          surtitre: c.intro.eyebrow,
          titre: c.intro.heading,
          texte: c.intro.text,
          teinte: "green",
          proLabel: c.proLabel,
          proTexte: c.proText,
        }),
      ],
      centre: [],
      droite: [block("FormulaireContact", {})],
    }),
    block("FAQ", { titre: c.faq.heading, note: c.faq.note }),
  ];
  if (newsletter) {
    content.push(block("Infolettre", { titre: newsletter.heading, texte: newsletter.text, placeholder: newsletter.placeholder, bouton: newsletter.button }));
  }
  return { root: { props: {} }, content };
}

/*
 * Espace professionnels (maquette 11a). Contrairement aux autres pages composées, elle
 * ne dérive d'aucun contenu existant : ses textes viennent de la maquette et se
 * modifient ensuite dans l'éditeur, comme n'importe quelle page.
 */
export function proToBlocks(): BlockDocument {
  seq = 0;
  return {
    root: { props: {} },
    content: [
      block("HerosPro", {
        surtitre: "Espace professionnels",
        titre: "Du vrai, dans vos mains expertes.",
        texte:
          "Crèches, assistantes maternelles, PMI, librairies, orthophonistes : vous accompagnez les tout-petits chaque jour. Travaillons ensemble pour mettre nos imagiers entre leurs mains.",
        teinte: "blue",
        ctaLabel: "Nous écrire",
        ctaHref: "#demande",
        cta2Label: "Voir les imagiers",
        cta2Href: "/catalogue",
      }),
      block("FormulairePro", {
        titre: "Dites-nous qui vous êtes, on s'occupe du reste.",
        texte: "Réponse sous 48 h ouvrées avec une proposition adaptée : tarif, quantités, délais. Pas de devis automatique, une vraie personne.",
        emailLabel: "E-mail direct",
        email: "pro@monvrai.fr",
        docsLabel: "Documents",
        docs: [],
        mentionLegale: "En envoyant ce formulaire, vous acceptez notre politique de confidentialité. Aucune newsletter sans votre accord.",
      }),
      block("Temoignage", {
        titre: "Ils travaillent déjà avec nous",
        citation:
          "Les photos changent tout : les enfants reconnaissent la cuillère de la cantine, le chat de la voisine. On les sort à chaque temps calme.",
        auteur: "Directrice de micro-crèche, Lyon 3ᵉ",
      }),
      block("Encadre", {
        teinte: "sand",
        contenu:
          "<h2>Bon à savoir</h2><ul><li>Facturation avec SIRET et mandat administratif possible</li><li>Livraison groupée en un seul colis, France, Belgique, Luxembourg</li><li>Livres imprimés en France, encres végétales, coins arrondis</li></ul>",
      }),
    ],
  };
}

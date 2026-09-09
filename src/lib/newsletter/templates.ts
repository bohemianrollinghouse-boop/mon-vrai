/*
 * Modèles de newsletter riches, aux couleurs de Mon Vrai. Chaque modèle a sa propre mise
 * en page (voir email/newsletter-render.ts) et son propre jeu de champs éditables (textes
 * et images). L'admin choisit un modèle, modifie ce qu'il veut, puis envoie. Module de
 * données pur (pas de dépendance serveur) : partagé avec le formulaire d'édition côté client.
 */

export type FieldType = "text" | "textarea" | "image";
export type FieldDef = { name: string; label: string; type: FieldType; default: string; hint?: string };
export type TemplateDef = { id: string; label: string; description: string; fields: FieldDef[] };

const SITE = "https://monvrai.fr";

const f = (name: string, label: string, type: FieldType, def: string, hint?: string): FieldDef => ({ name, label, type, default: def, hint });

/* Champs communs, réutilisés d'un modèle à l'autre (mais chaque modèle choisit les siens). */
const subject = (def: string) => f("subject", "Sujet de l'e-mail", "text", def);
const eyebrow = (def: string) => f("eyebrow", "Surtitre", "text", def);
const title = (def: string) => f("title", "Titre", "text", def);
const heroImage = f("heroImage", "Image de bannière (URL)", "image", "", "Grande image en tête. Laissez vide pour ne pas en afficher.");
const productImage = f("productImage", "Image du produit (URL)", "image", "", "Affichée sur un cadre coloré, comme les cartes du site.");
const intro = (def: string) => f("intro", "Introduction", "textarea", def, "Une ligne vide sépare les paragraphes.");
const highlightTitle = (def: string) => f("highlightTitle", "Encadré — titre", "text", def);
const highlight = (def: string) => f("highlight", "Encadré — texte", "textarea", def, "Mis en avant dans un bloc coloré.");
const ctaLabel = (def: string) => f("ctaLabel", "Bouton — texte", "text", def);
const ctaHref = (def: string) => f("ctaHref", "Bouton — lien", "text", def);
const signature = (def: string) => f("signature", "Signature", "textarea", def);

export const NEWSLETTER_TEMPLATES: TemplateDef[] = [
  {
    id: "lancement",
    label: "Lancement du site",
    description: "Annoncer l'ouverture de la boutique.",
    fields: [
      subject("Le site Mon Vrai est ouvert"),
      eyebrow("C'est parti"),
      title("Notre boutique est en ligne"),
      heroImage,
      intro("Vous avez été nombreux·ses à nous soutenir, et c'est grâce à vous : notre boutique est enfin ouverte.\n\nRetrouvez nos imagiers réalistes pour les 6–18 mois, pensés pour accompagner les tout-petits avec du vrai."),
      highlightTitle("Livraison offerte dès 30 €"),
      highlight("Précommandes ouvertes, expédition dès le 25 décembre, tous vos livres dans un seul colis."),
      ctaLabel("Découvrir la boutique"),
      ctaHref(`${SITE}/catalogue`),
      signature("Merci d'être là depuis le début.\nMyenndine"),
    ],
  },
  {
    id: "nouveau-livre",
    label: "Nouveau livre",
    description: "Présenter un nouvel imagier.",
    fields: [
      subject("Nouveau : [nom du livre]"),
      eyebrow("Nouveauté"),
      title("[nom du livre]"),
      productImage,
      intro("On a hâte de vous le présenter : voici notre nouvel imagier. Comme toujours, de vraies photos, une par double-page, sur fond épuré.\n\n[Une phrase sur le thème et ce qu'il apporte à l'enfant.]"),
      highlightTitle("Ce qu'il contient"),
      highlight("14 × 14 cm · 6 doubles-pages · cartonné · dès 6 mois."),
      ctaLabel("Voir le livre"),
      ctaHref(`${SITE}/livres/[slug-du-livre]`),
      signature("Bonne découverte,\nMyenndine"),
    ],
  },
  {
    id: "nouveau-produit",
    label: "Nouveau produit",
    description: "Annoncer un produit hors imagier (cartes, gommettes…).",
    fields: [
      subject("Nouveau chez Mon Vrai : [nom du produit]"),
      eyebrow("Nouveauté"),
      title("[nom du produit]"),
      productImage,
      intro("On agrandit la famille Mon Vrai.\n\n[En deux phrases : à quoi sert le produit, pour quel âge, et ce qui le rend spécial. Le même soin que nos imagiers : du réel, du durable.]"),
      highlightTitle("Pensé pour durer"),
      highlight("[Matériaux, sécurité, âge conseillé…]"),
      ctaLabel("Découvrir le produit"),
      ctaHref(`${SITE}/catalogue`),
      signature("À découvrir,\nMyenndine"),
    ],
  },
  {
    id: "nouvelle-categorie",
    label: "Nouvelle catégorie",
    description: "Ouvrir une nouvelle gamme ou collection.",
    fields: [
      subject("Une nouvelle collection Mon Vrai"),
      eyebrow("Nouvelle collection"),
      title("[nom de la catégorie]"),
      heroImage,
      intro("Nouvelle étape pour Mon Vrai : nous ouvrons une nouvelle collection.\n\n[Une ou deux phrases sur ce qu'elle regroupe, pour quel âge, et pourquoi vous l'avez créée.]"),
      highlightTitle("À explorer"),
      highlight("[Ce qu'on y trouve, et ce qui arrive ensuite.]"),
      ctaLabel("Explorer la collection"),
      ctaHref(`${SITE}/catalogue`),
      signature("On a hâte d'avoir votre avis.\nMyenndine"),
    ],
  },
  {
    id: "precommande",
    label: "Précommande ouverte",
    description: "Lancer ou rappeler une précommande.",
    fields: [
      subject("Précommandes ouvertes"),
      eyebrow("Précommande"),
      title("Réservez [nom du livre / de la collection]"),
      heroImage,
      intro("Les précommandes sont ouvertes. En réservant maintenant, vous êtes sûr·e d'être servi·e dès l'arrivée du stock."),
      highlightTitle("Bon à savoir"),
      highlight("Expédition prévue à partir du [date]. Livraison offerte dès 30 €. Tous vos livres dans un seul colis."),
      ctaLabel("Précommander"),
      ctaHref(`${SITE}/catalogue`),
      signature("Merci pour votre confiance,\nMyenndine"),
    ],
  },
  {
    id: "offre",
    label: "Offre / Code promo",
    description: "Communiquer une réduction ou une offre.",
    fields: [
      subject("Une attention : [X %] avec le code [CODE]"),
      eyebrow("Offre"),
      title("[X %] sur toute la boutique"),
      heroImage,
      intro("Pour vous remercier, profitez de [X %] sur votre commande.\n\n[Une phrase sur ce que vous mettez en avant : un livre, la collection complète…]"),
      highlightTitle("Votre code : [CODE]"),
      highlight("Valable jusqu'au [date]. À saisir au moment du paiement."),
      ctaLabel("J'en profite"),
      ctaHref(`${SITE}/catalogue`),
      signature("Bonne découverte,\nMyenndine"),
    ],
  },
  {
    id: "retour-stock",
    label: "Retour en stock",
    description: "Prévenir qu'un titre est de nouveau disponible.",
    fields: [
      subject("[nom du livre] est de retour"),
      eyebrow("De nouveau disponible"),
      title("[nom du livre] est de retour"),
      productImage,
      intro("Bonne nouvelle : [nom du livre] est de nouveau en stock. Il est reparti vite la dernière fois, alors ne tardez pas."),
      ctaLabel("Voir le livre"),
      ctaHref(`${SITE}/livres/[slug-du-livre]`),
      signature("À bientôt,\nMyenndine"),
    ],
  },
  {
    id: "coulisses",
    label: "Coulisses / Notre histoire",
    description: "Partager les coulisses, la démarche, une actu.",
    fields: [
      subject("Dans les coulisses de Mon Vrai"),
      eyebrow("Les coulisses"),
      title("[Le titre de votre histoire]"),
      heroImage,
      intro("[Racontez une étape, une décision, une rencontre autour de Mon Vrai. Restez simple et sincère : c'est ce qui vous ressemble.]\n\n[Concluez avec ce que ça change pour les enfants et pour vous.]"),
      ctaLabel("Notre histoire"),
      ctaHref(`${SITE}/notre-histoire`),
      signature("À très vite,\nMyenndine"),
    ],
  },
];

export const templateById = (id: string): TemplateDef | undefined => NEWSLETTER_TEMPLATES.find((t) => t.id === id);

/** Valeurs par défaut d'un modèle (nom de champ → valeur). */
export function templateDefaults(id: string): Record<string, string> {
  const t = templateById(id);
  const out: Record<string, string> = {};
  for (const field of t?.fields ?? []) out[field.name] = field.default;
  return out;
}

import type { GuideSettings, GuideShot, GuideVideo } from "@/lib/domain/types";

/*
 * Le guide de création de contenu, tel qu'il s'affiche.
 *
 * Deux matières, et la frontière entre elles est tout le propos de ce fichier. Le
 * TEXTE — ce que nous attendons d'une photo, ce qu'est un bon rush, ce qu'il faut
 * éviter — est écrit ici : il ne change qu'avec notre façon de travailler, et le faire
 * passer par un formulaire reviendrait à demander de ressaisir un mode d'emploi. Les
 * IMAGES et les VIDÉOS, elles, se règlent dans l'administration : ce sont les exemples,
 * et un exemple se remplace sans cesse — c'est même à cela qu'il sert.
 *
 * D'où des emplacements NOMMÉS plutôt qu'une liste libre : chaque photo illustre une
 * idée précise, et sa légende appartient au texte. Ce qu'on choisit, c'est l'image qui
 * vient à cette place — pas la place elle-même.
 *
 * Pur et testé : la page publique et l'écran de réglage s'en servent tous les deux et
 * doivent montrer les mêmes emplacements, dans le même ordre.
 */

export type Slot = {
  /** Clé stable : c'est elle qui rattache une image à son emplacement. */
  key: string;
  /** Ce que la place illustre, pour que l'administrateur sache quoi y mettre. */
  hint: string;
  title: string;
  caption: string;
};

/** Les trois exemples « pour s'inspirer », sous le chapitre de la lumière. */
export const INSPIRATION_SLOTS: Slot[] = [
  { key: "geste", hint: "Un livre tenu, manipulé", title: "", caption: "Le livre bien visible, au cœur du geste." },
  { key: "lumiere", hint: "Une lumière de côté, deux personnes", title: "", caption: "Une lumière douce de côté, un moment partagé." },
  { key: "dessus", hint: "Vue du dessus, à plat", title: "", caption: "Vue du dessus : l'enfant, le livre, de l'air autour." },
];

/** Les mises en scène illustrées par une photo. Les deux autres sont des pavés de texte. */
export const SCENE_SLOTS: Slot[] = [
  { key: "figurine", hint: "Un jouet qui fait écho à la page", title: "La figurine et le livre", caption: "Un jouet ou une figurine qui fait écho à la page. En rush : la main qui l'approche du livre." },
  { key: "vrai", hint: "Un vrai objet posé près de sa photo", title: "Le vrai à côté de l'image", caption: "Le vrai fruit, le vrai légume ou le vrai objet posé à côté de sa photo." },
  { key: "univers", hint: "Des objets du même thème réunis", title: "L'univers autour du livre", caption: "Quelques objets du même thème que l'imagier, réunis simplement autour de lui." },
  { key: "quotidien", hint: "Au sol, sur les genoux, à deux", title: "Le moment du quotidien", caption: "Au sol, sur les genoux, à deux : l'enfant qui regarde, pointe et nomme les images, sans le provoquer." },
];

/** Les quatre rushs qu'on aimerait recevoir. Un exemple vidéo par idée. */
export const VIDEO_SLOTS: Slot[] = [
  { key: "large", hint: "Un plan large", title: "Le plan large", caption: "La scène entière : l'enfant, le livre, la pièce." },
  { key: "serre", hint: "Un plan serré", title: "Le plan serré", caption: "Le livre et les mains, la page bien nette." },
  { key: "detail", hint: "Un détail", title: "Le détail", caption: "La page qui tourne, le doigt qui montre." },
  { key: "association", hint: "Le vrai approché de sa photo", title: "Le vrai et son image", caption: "L'objet réel approché de sa photo." },
];

/** Ce qu'on attend de la lumière et de l'ambiance, numéroté comme on le lit. */
export const LIGHT_POINTS: { lead: string; rest: string }[] = [
  { lead: "Lumière du jour, uniquement.", rest: "Près d'une fenêtre, le matin ou en fin d'après-midi. Jamais de flash ni de plafonnier : la lumière vient d'un côté, les ombres restent douces." },
  { lead: "Des matières naturelles.", rest: "Lin, coton, bois… Un fond calme, une ou deux couleurs, rien qui concurrence le livre." },
  { lead: "Le livre se voit.", rest: "Couverture ou double page nette et entière, images bien visibles, sans reflet. Il peut être au centre ou en bord de cadre, mais toujours net." },
  { lead: "Le geste plutôt que la pose.", rest: "Une main qui tourne la page, un doigt qui montre, un enfant absorbé. On photographie un moment, pas une mise en scène." },
];

/* Ce qu'est un bon rush. La première carte cite la durée réglée dans l'administration. */
export const rushCards = (seconds: number): { title: string; text: string }[] => [
  { title: `${seconds} secondes minimum par plan`, text: "Plus c'est long, plus nous avons de quoi couper. Caméra stable : posée, ou tenue à deux mains, coudes serrés." },
  { title: "Avec ou sans son", text: "Peu importe, nous montons derrière. Laissez les bruits de la pièce, pas de musique ajoutée." },
  { title: "Vertical ou horizontal", text: "Les deux nous servent. Choisissez ce qui va à la scène et gardez le même cadrage sur toute la prise." },
  { title: "Du brut, rien d'autre", text: "Pas de zoom, pas de filtre, pas de texte ni de transition. Le fichier tel qu'il sort du téléphone." },
  { title: "La meilleure qualité possible", text: "Réglage vidéo au maximum, 4K si disponible. Envoyez les originaux, jamais une capture de story." },
  { title: "Pensez en trois plans", text: "Un plan large (la scène), un plan serré (le livre, la main), un détail (la page qui tourne)." },
];

/** Les deux mises en scène qui n'ont pas de photo : elles se racontent. */
export const SCENE_CARDS: { eyebrow: string; title: string; text: string; tone: "green" | "sand" }[] = [
  {
    eyebrow: "Dehors",
    title: "L'animal vivant",
    text: "Le chien de la maison, les poules des grands-parents, le chat du voisin : filmez la rencontre entre l'animal et sa page, en balade comme à la ferme.",
    tone: "green",
  },
  {
    eyebrow: "À table",
    title: "Découverte sensorielle, DME",
    text: "Toucher, sentir, goûter. Le livre ouvert à côté de l'assiette ou du plateau sensoriel, les mains qui explorent le vrai aliment.",
    tone: "sand",
  },
];

export const AVOID = [
  "Flash et lumière artificielle",
  "Filtres et retouches lourdes",
  "Texte, cadres ou transitions incrustés",
  "Fond chargé, autres marques visibles",
  "Livre flou ou coupé",
  "Pose figée, sourire forcé",
];

/*
 * Ce qu'on dit de l'enfant à l'image. Trois politiques, trois phrases écrites : le
 * réglage choisit laquelle paraît, et personne ne rédige une consigne de droit à
 * l'image dans un champ de formulaire.
 */
export const CHILD_NOTES: Record<GuideSettings["childPolicy"], string> = {
  choice: "De face, de dos ou seulement les mains : à votre choix, toutes ces options nous conviennent.",
  noFace: "Nous privilégions les prises de dos, de profil ou centrées sur les mains, sans visage reconnaissable.",
  face: "Le visage de l'enfant est bienvenu dès lors que vous êtes à l'aise : regards, sourires, concentration.",
};

export const CHILD_POLICY_LABELS: Record<GuideSettings["childPolicy"], string> = {
  choice: "Au choix du partenaire",
  noFace: "De dos ou mains uniquement",
  face: "Visage bienvenu",
};

/* ---------- Ce qui est posé à chaque emplacement ---------- */

export type FilledShot = Slot & { url: string };
export type FilledVideo = Slot & { url: string; poster: string };

const shotAt = (slots: Slot[], chosen: GuideShot[]): FilledShot[] => {
  const by = new Map(chosen.map((s) => [s.key, s]));
  return slots.map((slot) => ({ ...slot, url: by.get(slot.key)?.url ?? "" }));
};

/*
 * Le guide prêt à rendre. Les emplacements viennent du texte, les fichiers du réglage :
 * une photo retirée de la médiathèque laisse sa place vide et légendée, jamais une
 * image cassée.
 */
export function guideView(settings: GuideSettings) {
  const byKey = new Map(settings.videos.map((v: GuideVideo) => [v.key, v]));
  return {
    rushSeconds: settings.rushSeconds,
    childNote: CHILD_NOTES[settings.childPolicy],
    hero: settings.hero,
    inspirations: shotAt(INSPIRATION_SLOTS, settings.inspirations),
    scenes: shotAt(SCENE_SLOTS, settings.scenes),
    videos: VIDEO_SLOTS.map((slot) => ({ ...slot, url: byKey.get(slot.key)?.url ?? "", poster: byKey.get(slot.key)?.poster ?? "" })) as FilledVideo[],
    rushes: rushCards(settings.rushSeconds),
  };
}

/** Combien d'emplacements attendent encore un fichier : l'admin le dit en un chiffre. */
export function guideMissing(settings: GuideSettings): number {
  const view = guideView(settings);
  return (
    (view.hero ? 0 : 1) +
    view.inspirations.filter((s) => !s.url).length +
    view.scenes.filter((s) => !s.url).length +
    view.videos.filter((v) => !v.url).length
  );
}

/*
 * Pages perso : des documents HTML autonomes servis tels quels par une route
 * `src/app/perso/<adresse>/route.ts`, hors de la collection `pages` et de l'éditeur
 * en blocs. L'écran « Pages » de l'admin les liste depuis ce registre pour qu'on les
 * retrouve à côté des autres ; elles ne s'y modifient pas (le contenu est dans le
 * fichier indiqué). Ajouter ou retirer une page perso, c'est aussi la noter ici.
 */
export type PersoPage = {
  title: string;
  /** Chemin servi, tel qu'écrit dans `src/app`. */
  path: string;
  /** Fichier qui porte le contenu, depuis la racine du projet. */
  file: string;
};

export const PERSO_PAGES: PersoPage[] = [];

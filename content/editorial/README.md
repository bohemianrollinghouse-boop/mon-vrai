# Photos des pages éditoriales

Déposez ici les photos de « Notre histoire » et « Le concept », sous ces noms exacts
(la liste qui fait foi est `EDITORIAL_PHOTOS` dans `scripts/seed.ts`) :

| Fichier | Où il apparaît |
| --- | --- |
| `histoire-bebe-livre.jpg` | Notre histoire — héro |
| `histoire-main-savon.jpg` | Notre histoire — chapitre 1 |
| `histoire-lapin-reel.jpg` | Notre histoire — intermède en citation |
| `histoire-cinq-imagiers.jpg` | Notre histoire — chapitre 2 |
| `histoire-valise-rangement.jpg` | Notre histoire — chapitre 3 |
| `histoire-pomme-reelle.jpg` | Notre histoire — chapitre 5, et héro du Concept |
| `histoire-chien-figurine.jpg` | Notre histoire — chapitre 6, et « Le réalisme » |
| `histoire-bebe-vetements.jpg` | Notre histoire — bloc final, et « Les petites mains » |
| `histoire-double-page.jpg` | Le concept — « La conception » |
| `concept-couvertures.jpg` | Le concept — « Les thèmes » |
| `concept-collection.jpg` | Le concept — « La suite » |

`pnpm seed` les envoie dans la médiathèque et les pose dans les bons blocs. Celles qui
manquent sont remplacées par une photo d'ambiance : la page a quand même son allure, et
la bonne photo se choisit ensuite dans l'éditeur (`/admin/pages`, réglages du bloc →
« Choisir une image »).

En production, `scripts/migrate-prod.ts --editorial` les retrouve dans la médiathèque
par le même nom de fichier — il suffit donc de les avoir envoyées depuis `/admin/medias`.

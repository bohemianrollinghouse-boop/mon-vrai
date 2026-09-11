import type { BlockDocument, HomeContent, ImageRef } from "@/lib/domain/types";
import type { Props } from "./config";
import type { Emphasis } from "@/components/site/editorial";

/*
 * Les deux longues pages éditoriales — « Notre histoire » et « Le concept » — telles
 * qu'elles sortent du seed, d'après la maquette.
 *
 * Contrairement à from-content.ts, rien n'est converti ici : ce sont des pages
 * rédigées, pas la reprise d'un ancien contenu structuré. Le texte vit donc dans ce
 * fichier le temps d'un premier peuplement, puis dans la page elle-même — une fois
 * enregistrée depuis /admin/pages, c'est la base qui fait foi et ce fichier ne la
 * rattrape plus.
 *
 * Fonctions pures, sans accès aux données : `photo(nom)` va chercher dans la
 * médiathèque une image déjà envoyée par l'appelant.
 */

type Photo = (name: string) => ImageRef | undefined;

/*
 * `import type { Props }` est effacé à l'exécution : on profite du typage du catalogue
 * sans tirer les composants (et leur `server-only`) dans ce module. Le nom du bloc et
 * ses props sont donc vérifiés à la compilation.
 */
let seq = 0;
const block = <T extends keyof Props>(type: T, props: Props[T]) => ({ type, props: { id: `${type}-${++seq}`, ...props } });

const lines = (...texte: string[]) => texte.map((t) => ({ texte: t }));

/*
 * Paragraphes d'un chapitre, avec le relief de la maquette. Par défaut « normal » ;
 * `chute` pour la phrase qui referme un chapitre, `forte` pour celle qui claque,
 * `citation` pour la question détachée par un filet vert (chapitre 06).
 */
const p = (texte: string, relief: Emphasis = "normal") => ({ texte, relief });

/** « Notre histoire » : un récit en six chapitres, avec trois intermèdes. */
export function storyBlocks(photo: Photo, newsletter?: HomeContent["newsletter"]): BlockDocument {
  seq = 0;
  const content: BlockDocument["content"] = [
    block("Heros", {
      surtitre: "Notre histoire",
      titre: "Mon Vrai est né pour nos enfants. Il grandit aujourd'hui pour les vôtres.",
      texte:
        "Mon Vrai est né d'un besoin très simple : proposer aux tout-petits des supports réellement pensés pour eux, ancrés dans le réel, simples à observer et adaptés à leur développement.",
      image: photo("histoire-bebe-livre.jpg"),
      teinte: "pink",
      disposition: "cote",
    }),

    block("Chiffres", {
      taille: "lg",
      largeurMin: 180,
      items: [
        { valeur: "6", texte: "représentations par imagier, une seule par double page" },
        { valeur: "500", texte: "premiers livres imprimés en 2025, vendus en quatre mois" },
        { valeur: "128", texte: "parents et professionnels ont répondu à notre enquête" },
        { valeur: "5", texte: "premiers imagiers, créés d'abord pour nos propres enfants" },
      ],
    }),

    block("Sommaire", {
      intitule: "Au sommaire",
      entrees: [
        { numero: "01", label: "Chercher, puis fabriquer", lien: "#chapitre-1" },
        { numero: "02", label: "Les cinq premiers imagiers", lien: "#chapitre-2" },
        { numero: "03", label: "Devenir maison d'édition", lien: "#chapitre-3" },
        { numero: "04", label: "La pause, puis le déclic", lien: "#chapitre-4" },
        { numero: "05", label: "Pourquoi « Mon Vrai »", lien: "#chapitre-5" },
        { numero: "06", label: "Ce que nous voulons devenir", lien: "#chapitre-6" },
        { numero: "→", label: "Le concept des imagiers", lien: "/le-concept" },
      ],
    }),

    block("Chapitre", {
      surtitre: "Chapitre 01",
      titre: "Chercher, puis fabriquer",
      ancre: "chapitre-1",
      teintePastilles: "green",
      pastilles: [],
      image: photo("histoire-main-savon.jpg"),
      paragraphes: [
        p("Tout commence avec une maternité très jeune et une passion née avec elle : comprendre comment fonctionne un bébé, comment il découvre son environnement, comment évoluent ses capacités et de quoi il a besoin à chaque étape. Des formations suivent : la pédagogie Montessori pour les 0–3 ans et les 3–6 ans, d'autres pédagogies alternatives, la neuroéducation et plus largement le développement de l'enfant."),
        p("De cette recherche naît une habitude : chercher du matériel cohérent avec l'âge de l'enfant, ses capacités, ses besoins cognitifs et sensoriels. Elle se retrouve d'abord dans les livres. Mais pour un tout-petit, les imagiers trouvés en librairie contiennent souvent énormément de pages, beaucoup de texte, ou des dessins très éloignés de la réalité. Ce que nous cherchions était plus court, plus simple, plus lisible : peu d'informations à la fois, et des représentations proches du monde réel."),
        p("« Noir sur blanc » et « Blanc sur noir » de Tana Hoban sont devenus des références personnelles. Ils ne reposent pas sur le réalisme photographique que Mon Vrai a choisi plus tard, mais ils sont remarquablement pensés pour les premiers mois de vie : très simples, très lisibles, centrés sur l'essentiel. Nous les recommandons encore aujourd'hui, notamment entre 0 et 6 mois. Ce qui nous frappait, c'était de ne pas trouver ensuite de continuité, avec la même exigence de simplicité, pour les bébés un peu plus grands."),
        p("Alors, faute de trouver ces supports, nous les avons fabriqués : des éléments du quotidien photographiés ou sélectionnés, imprimés en petites cartes, plastifiés. Des cartes à regarder, nommer, associer. À ce stade, il n'existait ni Mon Vrai, ni imagier édité, ni projet de marque.", "chute"),
      ],
    }),

    block("Panneau", {
      surtitre: "",
      titre: "",
      texte: "",
      puces: [],
      citation:
        "Mon Vrai n'est pas né avec l'idée de créer une marque. Les livres ont d'abord été créés pour nos propres enfants. La marque est venue après, lorsque nous avons compris que d'autres familles et professionnels cherchaient eux aussi ce type de supports.",
      texte2: "",
      image: photo("histoire-lapin-reel.jpg"),
      cote: "left",
      teinte: "sand",
    }),

    block("Chapitre", {
      surtitre: "Chapitre 02",
      titre: "Les cinq premiers imagiers",
      ancre: "chapitre-2",
      teintePastilles: "green",
      pastilles: lines("Les Fruits", "Les Légumes", "Les Animaux de compagnie", "Les Vêtements", "Les Objets du quotidien"),
      image: photo("histoire-cinq-imagiers.jpg"),
      paragraphes: [
        p("Quelques années plus tard, une deuxième petite fille arrive, et les outils numériques sont devenus plus accessibles. Les fichiers deviennent plus aboutis, et l'idée change d'échelle : plutôt que d'imprimer des cartes à la maison, pourquoi ne pas faire fabriquer de vrais livres ? Une formation autour du dropshipping, finalement abandonnée, avait laissé un savoir-faire utile : chercher des fournisseurs, les contacter, comprendre la fabrication, et réfléchir au passage d'une idée à un produit réel."),
        p("Dès les premiers essais, les principes étaient là : des représentations réalistes, un fond blanc, très peu d'éléments par livre, aucun texte, une seule image à observer à la fois, une construction volontairement épurée. Les premiers éléments, des fruits et des légumes, ont été photographiés à la maison ; faute de studio, des outils d'intelligence artificielle ont servi à en homogénéiser la lumière, puis chaque élément a été isolé sur fond blanc."),
        p("Chaque livre a été volontairement limité à six représentations. Pas vingt, pas cinquante : six. Retirer plutôt qu'ajouter, ne pas remplir pour remplir, et laisser au tout-petit un support visuel simple. Un fruit qui ressemble à un vrai fruit. Un animal qui ressemble réellement à l'animal dont on lui parle. Un objet qui rappelle celui qu'il voit dans sa maison."),
        p("La famille partageait déjà beaucoup son quotidien sur les réseaux sociaux, notamment sa vie en bus aménagé. Le projet a suscité de l'intérêt, et de premiers prototypes ont été fabriqués."),
        p("Créés d'abord pour une enfant, ils ont plu à d'autres parents et à des personnes intéressées par le développement de l'enfant. Le manque ressenti n'était probablement pas le nôtre seulement.", "chute"),
      ],
    }),

    block("Chapitre", {
      surtitre: "Chapitre 03",
      titre: "Devenir maison d'édition",
      ancre: "chapitre-3",
      teintePastilles: "green",
      pastilles: [],
      image: photo("histoire-valise-rangement.jpg"),
      paragraphes: [
        p("Faire fabriquer et éditer ces livres a demandé d'entrer dans un univers inconnu : chercher des fournisseurs, comprendre la fabrication, se renseigner sur les normes, effectuer les démarches nécessaires pour transformer des fichiers en véritables livres. La structure éditoriale est née à ce moment-là sous le nom de Bohemian Rolling House, qui correspondait déjà à notre univers sur les réseaux sociaux."),
        p("En 2025, une campagne Ulule a permis de tester le projet plus sérieusement : une soixantaine de précommandes, puis une production de 500 exemplaires. Ces 500 livres se sont vendus en quelques mois, environ quatre. Au départ, les acheteurs venaient de notre communauté. Puis des commandes sont arrivées de personnes qui ne nous suivaient pas : des parents qui découvraient les imagiers par d'autres, des créateurs de contenu qui les montraient, des professionnels de la petite enfance qui s'y intéressaient."),
      ],
    }),

    block("Frise", {
      surtitre: "La chronologie",
      titre: "",
      texte: "",
      teinte: "",
      items: [
        { label: "Avant Mon Vrai", texte: "Formations autour du développement de l'enfant, et des cartes fabriquées à la maison, imprimées puis plastifiées." },
        { label: "Premiers fichiers", texte: "Six représentations réalistes par livre, fond blanc, aucun texte. Cinq imagiers prennent forme." },
        { label: "Bohemian Rolling House", texte: "Création de la structure éditoriale pour faire fabriquer les livres." },
        { label: "2025 · Ulule", texte: "Une soixantaine de précommandes, 500 exemplaires produits, vendus en quatre mois." },
        { label: "La pause", texte: "Le projet s'arrête un temps, faute de moyens pour relancer et par manque de structure." },
        { label: "Mars 2026 · l'enquête", texte: "128 réponses de parents, assistants maternels et professionnels de la petite enfance." },
        { label: "Aujourd'hui", texte: "Une identité de marque, une nouvelle collection et une ambition qui dépasse les imagiers." },
      ],
    }),

    block("Chapitre", {
      surtitre: "Chapitre 04",
      titre: "La pause, puis le déclic",
      ancre: "chapitre-4",
      teintePastilles: "green",
      pastilles: [],
      image: undefined,
      paragraphes: [
        p("La suite n'a pas été linéaire. Comment créer une identité ? Développer une gamme ? Construire un site ? Gérer une production plus importante ? Financer la suite ? Une partie du budget de la première production avait été mal anticipée : avoir vendu les 500 livres ne signifiait pas pouvoir relancer immédiatement une fabrication. À cela se sont ajoutés des changements importants dans la vie personnelle, et Mon Vrai a été mis en pause. Mais l'idée, elle, n'a jamais réellement disparu."),
        p("Avec du recul, la première édition avait fait exactement ce qu'elle devait faire : tester le concept, mettre les livres entre les mains des enfants, recueillir les premières réactions, confirmer qu'il existait une vraie demande. Visuellement, en revanche, tout avait été créé seule : il n'y avait pas encore de véritable identité de marque, ni de cohérence graphique globale."),
        p("Nous avons donc travaillé avec une graphiste pour construire l'identité de Mon Vrai : un logo, une palette de couleurs, une direction graphique et un univers capable de réunir tous les futurs produits sous une même marque. C'est à ce moment-là que le projet est devenu Mon Vrai tel que nous l'imaginons aujourd'hui.", "chute"),
      ],
    }),

    block("Chapitre", {
      surtitre: "Chapitre 05",
      titre: "Pourquoi « Mon Vrai »",
      ancre: "chapitre-5",
      teintePastilles: "green",
      pastilles: [],
      image: photo("histoire-pomme-reelle.jpg"),
      paragraphes: [
        p("Au départ, les livres s'appelaient Mes Vrais Imagiers. Ce nom décrivait bien les premiers produits, mais il limitait le projet aux imagiers, alors que l'ambition était déjà plus grande : des cartes contrastées, d'autres collections, des supports de langage, des jeux, d'autres outils pensés pour le développement du jeune enfant."),
        p("Mon Vrai imagier. Mon Vrai jeu. Mes vraies cartes. Mon Vrai support.", "forte"),
        p("L'idée derrière le nom est très simple : créer quelque chose de vrai pour l'enfant, quelque chose qui soit pensé pour lui, conçu pour son âge, ses capacités et son monde. Le logo reprend cette philosophie : le « M » mêle la forme d'un cœur et l'évocation d'un lapin, en référence à l'enfance et au lien entre l'enfant et l'adulte ; le « V » fait écho à un symbole de validation et rappelle l'importance accordée au vrai."),
        p("Les nouveaux imagiers ne sont pas le résultat de nos seuls goûts. Une enquête a été adressée à des parents, des assistantes maternelles, des professionnels de crèche, des personnes ayant déjà acheté les livres et d'autres qui découvraient le projet. 128 personnes ont répondu. Leurs réponses ont confirmé plusieurs valeurs déjà présentes dans Mon Vrai (le réalisme, la simplicité, la solidité, l'adaptation à l'âge, l'intérêt de supports qui évoluent avec l'enfant) et ont guidé le choix des prochains thèmes."),
      ],
    }),

    block("PanneauSombre", {
      disposition: "cards",
      surtitre: "Le maître mot",
      titre: "Quatre valeurs tiennent toute la marque",
      texte:
        "Elles sont écrites dans notre identité, et elles décident de chaque livre : ce que nous photographions, ce que nous retirons, ce que nous refusons de publier.",
      paragraphes: [],
      cartes: [
        { titre: "Authenticité", texte: "Dire ce que nous faisons, et faire ce que nous disons." },
        { titre: "Réalisme", texte: "Partir du monde que l'enfant peut réellement observer." },
        { titre: "Chaleur", texte: "Un livre qui devient un moment partagé entre l'enfant et l'adulte." },
        { titre: "Curiosité", texte: "Laisser l'enfant regarder, revenir, reconnaître, nommer à son rythme." },
      ],
    }),

    block("Chapitre", {
      surtitre: "Chapitre 06",
      titre: "Ce que nous voulons que Mon Vrai devienne",
      ancre: "chapitre-6",
      teintePastilles: "green",
      pastilles: [],
      image: photo("histoire-chien-figurine.jpg"),
      paragraphes: [
        p("Aujourd'hui, Mon Vrai ne se limite plus à cinq livres. L'ambition est de construire une grande collection de référence pour les tout-petits, puis une continuité pour les enfants qui grandissent : des imagiers 6–18 mois, des collections 18–36 mois, des cartes contrastées adaptées aux premiers mois, des supports de langage, des histoires réalistes, des outils autour des émotions."),
        p("Nous ne voulons pas créer un produit simplement parce qu'il est joli ou parce qu'il peut se vendre. La question que nous gardons au centre de chaque création est celle-ci :"),
        p("De quoi l'enfant a-t-il besoin à ce moment de son développement, et quel support pouvons-nous imaginer autour de ce besoin ?", "citation"),
        p("À long terme, nous aimerions que Mon Vrai devienne une référence pour les parents et les professionnels qui cherchent les premiers livres de leur enfant : retrouver plusieurs collections en librairie, être utilisé en crèche et chez les assistantes maternelles, créer une continuité pour les plus grands sans perdre la même ligne directrice — partir du réel, et penser d'abord au besoin de l'enfant. Des références comme Tana Hoban pour les premiers mois, ou Céline Alvarez dans son travail autour du langage et de la lecture, ont nourri cette réflexion : un support très simple peut être profondément pensé."),
        p("Un enfant qui vit en ville ne rencontrera peut-être jamais une vache dans son quotidien. Mais si on lui parle d'une vache, nous voulons qu'il puisse découvrir dans son livre à quoi elle ressemble réellement. Il aura toute sa vie pour rencontrer l'imaginaire. Le monde réel est déjà immense à découvrir."),
      ],
    }),

    block("Panneau", {
      surtitre: "Mon Vrai · Grandir avec du vrai",
      titre: "",
      texte: "",
      puces: [],
      citation:
        "Depuis les premières petites cartes imprimées et plastifiées jusqu'aux collections d'aujourd'hui, l'intention reste la même : créer des supports simples, réalistes et pensés pour accompagner les enfants dans leur découverte du monde.",
      texte2: "Mon Vrai est né pour nos enfants. Il grandit aujourd'hui pour les vôtres.",
      image: photo("histoire-bebe-vetements.jpg"),
      cote: "left",
      teinte: "pink",
    }),
  ];

  if (newsletter) {
    content.push(
      block("Infolettre", { titre: newsletter.heading, texte: newsletter.text, placeholder: newsletter.placeholder, bouton: newsletter.button }),
    );
  }
  return { root: { props: {} }, content };
}

/** « Le concept » : pourquoi des imagiers si dépouillés, en douze blocs. */
export function conceptBlocks(photo: Photo): BlockDocument {
  seq = 0;
  return {
    root: { props: {} },
    content: [
      block("Heros", {
        surtitre: "Le concept",
        titre: "Avant d'avoir besoin d'un univers chargé, un tout-petit peut simplement avoir besoin de regarder.",
        texte:
          "Regarder une pomme. Reconnaître un chat. Observer une chaussure. Retrouver dans un livre quelque chose qu'il a déjà vu dans sa maison, dans la rue ou dans son quotidien. C'est autour de cette simplicité que Mon Vrai a été créé.",
        image: photo("histoire-pomme-reelle.jpg"),
        teinte: "green",
        disposition: "dessous",
      }),

      block("Panneau", {
        surtitre: "La conception",
        titre: "Des livres simples, réalistes et essentiels",
        texte:
          "Les premiers livres Mon Vrai sont des imagiers destinés principalement aux enfants de 6 à 18 mois et au-delà. Chaque imagier est consacré à un thème du quotidien de l'enfant. À l'intérieur, la conception reste volontairement très épurée.",
        puces: [
          { signe: "6", texte: "représentations réalistes par livre" },
          { signe: "1", texte: "seul élément par double page" },
          { signe: "·", texte: "un fond blanc" },
          { signe: "·", texte: "aucun décor" },
          { signe: "·", texte: "aucun texte venant accompagner l'image" },
        ],
        citation: "",
        texte2: "",
        image: photo("histoire-double-page.jpg"),
        cote: "right",
        teinte: "",
      }),

      block("ProseCentree", {
        surtitre: "",
        titre: "",
        pastilles: [],
        teintePastilles: "green",
        texteFin: "",
        image: undefined,
        paragraphes: lines(
          "Chaque représentation est isolée afin que l'enfant puisse concentrer son regard sur un seul élément à la fois. L'objectif n'est pas de remplir les pages. Au contraire : nous avons choisi d'enlever tout ce qui n'est pas nécessaire, afin de laisser une véritable place à l'observation.",
          "L'adulte peut simplement nommer ce que l'enfant regarde. « Une pomme. » « Un chien. » « Une voiture. » Puis laisser l'enfant observer, toucher le livre, revenir sur une image, tourner les pages et découvrir à son rythme.",
          "Il n'y a pas de règle d'utilisation. Le livre devient avant tout un support de découverte et d'échange entre l'enfant et l'adulte.",
        ),
      }),

      block("Panneau", {
        surtitre: "Le réalisme",
        titre: "Pourquoi des représentations réalistes ?",
        texte:
          "L'identité de Mon Vrai repose sur le lien avec le réel. L'enfant découvre chaque jour son environnement : les objets de la maison, les aliments, les animaux, les vêtements, les véhicules ou encore les visages qui l'entourent. Les imagiers ont été conçus pour lui permettre de retrouver dans ses livres des éléments qui ressemblent à ceux qu'il rencontre réellement.",
        puces: [],
        citation: "Un chat ressemble à un chat. Une fraise ressemble à une vraie fraise. Une voiture ressemble à une voiture qu'il pourrait croiser dans la rue.",
        texte2:
          "La marque ne cherche pas à supprimer l'imaginaire de l'enfance. L'imaginaire aura toute sa place dans la vie de l'enfant. Mais la première collection a volontairement été pensée autour d'une autre expérience : découvrir, reconnaître et nommer le monde qui existe déjà autour de lui.",
        image: photo("histoire-chien-figurine.jpg"),
        cote: "left",
        teinte: "sand",
      }),

      block("Chiffres", {
        taille: "md",
        largeurMin: 260,
        items: [
          { valeur: "14 × 14 cm", texte: "Un format carré, pensé pour être facilement manipulable par les jeunes enfants." },
          { valeur: "Cartonné", texte: "Des pages épaisses et des coins arrondis, faits pour être repris tous les jours." },
          { valeur: "6–18 mois", texte: "La conception initiale de la collection, une indication plutôt qu'une limite." },
        ],
      }),

      block("ProseCentree", {
        surtitre: "Les petites mains",
        titre: "Un vrai objet du quotidien",
        pastilles: [],
        teintePastilles: "green",
        texteFin: "",
        image: photo("histoire-bebe-vetements.jpg"),
        paragraphes: lines(
          "Le livre peut devenir un véritable objet du quotidien : regardé avec un adulte, manipulé par l'enfant, posé dans une bibliothèque accessible ou emporté avec soi. L'objectif est que l'enfant puisse progressivement se l'approprier.",
        ),
      }),

      block("Frise", {
        surtitre: "L'usage dans le temps",
        titre: "Une collection 6–18 mois, mais pas seulement",
        texte:
          "Un enfant n'a pas à arrêter de les utiliser après 18 mois. L'utilisation du même imagier évolue avec lui, et chaque enfant avance à son propre rythme.",
        teinte: "blue",
        items: [
          { label: "D'abord", texte: "L'enfant regarde simplement une image." },
          { label: "Puis", texte: "Il commence à reconnaître certains éléments." },
          { label: "Plus tard", texte: "« Où est la banane ? » « Tu peux me montrer le chien ? »" },
          { label: "Enfin", texte: "L'enfant nomme lui-même ce qu'il voit." },
        ],
      }),

      block("Panneau", {
        surtitre: "Les thèmes",
        titre: "Proches du quotidien de l'enfant",
        texte:
          "Les collections sont construites autour de catégories facilement identifiables par les jeunes enfants. Fruits, légumes, animaux, véhicules, vêtements ou objets du quotidien permettent à l'enfant d'explorer progressivement différentes parties de son environnement.",
        puces: [],
        citation: "",
        texte2:
          "Nous continuerons de développer de nouveaux thèmes. Les imagiers 6–18 mois constituent le point de départ d'un univers éditorial plus large.",
        image: photo("concept-couvertures.jpg"),
        cote: "right",
        teinte: "",
      }),

      block("ProseCentree", {
        surtitre: "L'enquête",
        titre: "Une marque construite avec les familles et les professionnels",
        teintePastilles: "green",
        image: undefined,
        paragraphes: lines(
          "En mars 2026, une enquête menée auprès de 128 répondants, parents, assistants maternels et professionnels de la petite enfance notamment, a permis de mieux comprendre leurs attentes. Plusieurs valeurs revenaient particulièrement dans leurs réponses.",
        ),
        pastilles: lines("La durabilité", "Le réalisme des visuels", "L'adaptation à l'âge", "La simplicité", "Un outil utilisable de plusieurs manières"),
        texteFin:
          "L'enquête a également montré une forte attente autour de futurs outils réalistes : imagiers pour des enfants plus grands, histoires du quotidien, supports de nomination, cartes, activités et outils autour des émotions. Ces retours participent aujourd'hui au développement de Mon Vrai.",
      }),

      block("Panneau", {
        surtitre: "La suite",
        titre: "Plus qu'une collection d'imagiers",
        texte:
          "Mon Vrai a vocation à devenir un univers éditorial consacré aux outils réalistes pour l'enfance. Les imagiers sont la première pierre de ce projet. À terme, l'objectif est de créer différentes collections adaptées aux étapes de développement de l'enfant et à ses besoins.",
        puces: [],
        citation: "Des livres. Des histoires. Des supports de langage. Des outils de découverte. Des activités.",
        texte2:
          "Avec toujours la même ligne directrice : partir du réel, créer des supports simples à comprendre, respecter le rythme de l'enfant, et proposer aux familles comme aux professionnels des objets beaux, solides et réellement utilisables au quotidien.",
        image: photo("concept-collection.jpg"),
        cote: "left",
        teinte: "pink",
      }),

      block("PanneauSombre", {
        disposition: "columns",
        surtitre: "L'identité",
        titre: "La simplicité, jusque dans le graphisme",
        texte: "",
        cartes: [],
        paragraphes: lines(
          "Des tons neutres et naturels. Du blanc, du crème, du beige, du noir. Une identité douce, chaleureuse et épurée, pensée pour laisser les produits et les enfants occuper la place principale.",
          "Le logo reprend cette philosophie. Le « M » mêle la forme d'un cœur et l'évocation d'un lapin, en référence à l'enfance et au lien entre l'enfant et l'adulte. Le « V » fait écho à un symbole de validation et rappelle l'importance accordée au vrai.",
          "Quatre valeurs tiennent la marque : Authenticité. Réalisme. Chaleur. Curiosité.",
        ),
      }),

      block("BandeauTeinte", {
        surtitre: "Grandir avec du vrai",
        titre:
          "Mon Vrai est né de la conviction qu'un support pour enfant n'a pas besoin d'être compliqué pour avoir du sens. Parfois, une image suffit.",
        texte:
          "Une image que l'enfant peut regarder. Une image qu'il peut reconnaître. Une image qu'un parent peut nommer. Une image qui peut devenir le début d'un échange. Parce qu'avant de découvrir mille mondes imaginaires, il y a déjà un monde immense à observer autour de soi.",
        ctaLabel: "Voir le catalogue",
        ctaHref: "/catalogue",
        cta2Label: "Lire notre histoire",
        cta2Href: "/notre-histoire",
        teinte: "green",
      }),
    ],
  };
}

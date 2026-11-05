import { FB_MEMBERSHIPS, FB_MESSAGE_MAX, FB_NOTE_MAX, FB_POST_STATES, FB_STAFF_MAX, FB_STAFF_ROLES, FB_TABS, LOT_MAX } from "@/lib/domain/fb-groups";

/*
 * La documentation de l'API des Campagnes Facebook, au format OpenAPI 3.1. C'est elle
 * que Claude (dans Chrome) lit avant le premier appel : tout ce qu'il doit savoir pour
 * s'en servir correctement est écrit ici, y compris ce qu'il ne doit PAS faire. Elle
 * est servie sans clé — elle ne contient rien de secret, et l'agent peut ainsi la lire
 * en ouvrant simplement l'onglet.
 */

const STAFF = {
  type: "object",
  required: ["name", "role"],
  additionalProperties: false,
  properties: {
    name: { type: "string", maxLength: 100, description: "Nom tel qu'affiché dans la liste des admins et modérateurs du groupe." },
    role: { type: "string", enum: FB_STAFF_ROLES, description: "admin = administrateur, moderator = modérateur. Obligatoire : lis-le sur la page, ne le devine pas." },
    profileUrl: {
      type: ["string", "null"],
      description:
        "Lien de son profil (ou de sa Page) : l'adresse du lien posé sur son nom, sans avoir à ouvrir le profil. " +
        "Formes acceptées : https://www.facebook.com/<nom>, /profile.php?id=…, /people/<nom>/<id>, /groups/<groupe>/user/<id>. " +
        "Les paramètres de suivi (__cft__, __tn__…) sont retirés par le serveur. null si le nom n'est pas un lien.",
    },
  },
} as const;

const STAFF_LIST = {
  type: "array",
  maxItems: FB_STAFF_MAX,
  items: { $ref: "#/components/schemas/Moderateur" },
} as const;

const STAFF_RULES =
  "LES ADMINS ET MODÉRATEURS : relève-les sur l'onglet « Membres » du groupe, section « Administrateurs et modérateurs » " +
  "(adresse directe : <groupUrl>/members/admins), dans l'ordre affiché : nom, rôle, et le lien posé sur le nom. " +
  "Si la liste n'est pas visible (groupe privé dont tu n'es pas encore membre), n'envoie pas staff : tu le compléteras plus tard par PATCH. " +
  "N'ouvre pas leurs profils et ne leur écris jamais.";

const GROUP = {
  type: "object",
  properties: {
    slug: { type: "string", description: "Identifiant du groupe, et valeur ?fb= de son lien de suivi. Ne change jamais." },
    name: { type: "string", description: "Nom du groupe tel qu'affiché sur Facebook." },
    groupUrl: { type: "string", description: "Racine canonique https://www.facebook.com/groups/<id ou alias>." },
    status: { type: "string", enum: FB_TABS, description: "Onglet de l'admin : new = à faire, handled = fait, ignored = ignoré, refused = refusé." },
    membership: { type: "string", enum: FB_MEMBERSHIPS, description: "Adhésion : none = pas demandée, pending = demande envoyée, validated = membre." },
    members: { type: ["integer", "null"], description: "Nombre de membres relevé sur la page du groupe." },
    hasMessage: { type: "boolean" },
    message: { type: ["string", "null"], description: "Le message rédigé pour ce groupe, BRUT : {lien} n'y est pas remplacé." },
    link: { type: "string", description: "Lien de suivi du groupe. Ne l'ouvre jamais : chaque ouverture compterait un faux clic." },
    postUrl: { type: ["string", "null"], description: "Lien du post publié dans le groupe." },
    postStatus: { type: ["string", "null"], enum: [...FB_POST_STATES, null] },
    note: { type: "string", description: "Ce qu'il faut savoir du groupe (règle de publication, jour réservé aux annonces…)." },
    staff: { ...STAFF_LIST, description: "Admins et modérateurs du groupe (vide tant que personne ne les a relevés)." },
    staffAt: { type: ["string", "null"], format: "date-time", description: "Quand la liste a été relevée." },
    createdAt: { type: "string", format: "date-time" },
  },
} as const;

const NEW_GROUP = {
  type: "object",
  required: ["url", "name"],
  properties: {
    url: { type: "string", description: "N'importe quel lien du groupe : il est ramené à sa racine." },
    name: { type: "string", description: "Nom exact du groupe tel qu'affiché sur Facebook (obligatoire : le serveur ne peut pas le lire)." },
    membership: { type: "string", enum: FB_MEMBERSHIPS, description: "Facultatif, pending par défaut. validated si tu as été accepté aussitôt." },
    members: { type: ["integer", "null"], description: "Facultatif : nombre de membres affiché." },
    message: {
      type: ["string", "null"],
      maxLength: FB_MESSAGE_MAX,
      description: "Facultatif mais attendu : le message rédigé pour CE groupe, avec {lien} à l'endroit du lien. Refusé sans {lien}, ou s'il contient l'adresse du site en dur.",
    },
    note: { type: "string", maxLength: FB_NOTE_MAX, description: "Facultatif : une phrase utile sur le groupe (règle de publication, jour des annonces…)." },
    staff: { ...STAFF_LIST, description: "Facultatif mais attendu : les admins et modérateurs du groupe, avec le lien de leur profil." },
  },
} as const;

const MESSAGE_RULES =
  "LE MESSAGE : un texte par groupe, rédigé d'après son public, son ton et son règlement. Écris {lien} (accolades comprises) exactement là où doit apparaître le lien vers le site : " +
  "le serveur le remplace par le lien de suivi propre au groupe au moment où le message est copié dans l'admin, ce qui attribue les clics au groupe. " +
  "N'écris jamais l'adresse du site toi-même (le message serait refusé) et n'ouvre jamais un lien de suivi (il compterait un faux clic).";

export function fbGroupsOpenApi(apiBase: string) {
  return {
    openapi: "3.1.0",
    info: {
      title: "Mon Vrai : Campagnes Facebook",
      version: "1.1.0",
      description:
        "Suivi des groupes Facebook où Mon Vrai (imagiers pour les bébés de 6 à 18 mois) est présenté. " +
        "Lister, vérifier, ajouter des groupes, enregistrer le message rédigé pour chacun et ses admins et modérateurs ; mettre à jour leur suivi. " +
        "Rien ne se supprime par cette API, et ni le nom ni le slug d'un groupe ne s'y changent. " +
        "Chaque requête (sauf cette documentation) porte l'en-tête Authorization: Bearer <clé>. " +
        "Un même groupe a parfois deux adresses (alias et numéro) : vérifie le lien ET le nom avant d'ajouter (GET /check). " +
        "Depuis un environnement qui ne joint pas ce domaine (bac à sable cloud), ouvre un onglet du navigateur sur cette documentation " +
        "et fais les appels avec fetch() depuis cet onglet : même origine, donc pas de CORS. " +
        MESSAGE_RULES +
        " " +
        STAFF_RULES,
    },
    servers: [{ url: apiBase }],
    security: [{ bearer: [] }],
    components: {
      securitySchemes: { bearer: { type: "http", scheme: "bearer", description: "Clé mv_fb_…, générée dans l'admin (Campagnes Facebook)." } },
      schemas: { Groupe: GROUP, NouveauGroupe: NEW_GROUP, Moderateur: STAFF },
    },
    paths: {
      "/": {
        get: {
          summary: "Tous les groupes suivis, tous onglets, du plus récent au plus ancien.",
          description: "addedToday = groupes ajoutés aujourd'hui (heure de Paris) par l'agent : à titre indicatif, pour le compte rendu.",
          responses: {
            "200": {
              description: "La liste.",
              content: { "application/json": { schema: { type: "object", properties: { count: { type: "integer" }, addedToday: { type: "integer" }, groups: { type: "array", items: { $ref: "#/components/schemas/Groupe" } } } } } },
            },
            "401": { description: "Clé absente, invalide ou révoquée." },
          },
        },
        post: {
          summary: `Ajoute un groupe, ou un lot de ${LOT_MAX} au plus, dans l'onglet « À faire ».`,
          description:
            "Enregistre le groupe JUSTE APRÈS avoir demandé à le rejoindre, avec son message. Un groupe déjà suivi (même adresse) n'est ni dupliqué ni modifié : il revient avec existed=true. " +
            "Toujours 200 pour un lot bien formé ; le sort de chaque groupe est dans results (ok=false + error en cas de refus). " +
            MESSAGE_RULES +
            " " +
            STAFF_RULES,
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { oneOf: [{ $ref: "#/components/schemas/NouveauGroupe" }, { type: "object", required: ["groups"], properties: { groups: { type: "array", maxItems: LOT_MAX, items: { $ref: "#/components/schemas/NouveauGroupe" } } } }] },
                example: {
                  url: "https://www.facebook.com/groups/mamans.lyon",
                  name: "Mamans de Lyon et alentours",
                  membership: "pending",
                  members: 12400,
                  message: "Bonjour à toutes et à tous ! … Si ça vous parle, tout est expliqué ici : {lien}",
                  note: "Annonces autorisées le samedi uniquement.",
                  staff: [
                    { name: "Claire Martin", role: "admin", profileUrl: "https://www.facebook.com/groups/mamans.lyon/user/100004567890123" },
                    { name: "Sophie Durand", role: "moderator", profileUrl: "https://www.facebook.com/sophie.durand.69" },
                  ],
                },
              },
            },
          },
          responses: {
            "200": {
              description: "Bilan.",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      added: { type: "integer" },
                      existed: { type: "integer" },
                      failed: { type: "integer" },
                      results: { type: "array", items: { type: "object", properties: { url: { type: "string" }, ok: { type: "boolean" }, existed: { type: "boolean" }, error: { type: "string" }, warning: { type: "string" }, group: { $ref: "#/components/schemas/Groupe" } } } },
                    },
                  },
                },
              },
            },
            "400": { description: "Lot vide ou trop gros." },
          },
        },
      },
      "/check": {
        get: {
          summary: "Ce groupe est-il déjà suivi ?",
          parameters: [
            { name: "url", in: "query", required: true, schema: { type: "string" }, description: "N'importe quel lien du groupe." },
            { name: "name", in: "query", required: false, schema: { type: "string" }, description: "Nom du groupe : rattrape un groupe suivi sous une autre adresse." },
          ],
          responses: {
            "200": {
              description: "exists = même adresse ; sameName = groupes suivis sous le même nom. N'ajoute pas le groupe si l'un des deux est positif.",
              content: { "application/json": { schema: { type: "object", properties: { groupUrl: { type: ["string", "null"] }, exists: { type: "boolean" }, group: { oneOf: [{ $ref: "#/components/schemas/Groupe" }, { type: "null" }] }, sameName: { type: "array", items: { $ref: "#/components/schemas/Groupe" } } } } } },
            },
            "400": { description: "Ni lien de groupe ni nom." },
          },
        },
      },
      "/{group}": {
        parameters: [{ name: "group", in: "path", required: true, schema: { type: "string" }, description: "Slug du groupe (champ slug), ou son lien encodé." }],
        get: {
          summary: "Un groupe, et son message prêt à poster (text, lien de suivi en place).",
          responses: { "200": { description: "Le groupe.", content: { "application/json": { schema: { type: "object", properties: { group: { $ref: "#/components/schemas/Groupe" }, text: { type: ["string", "null"] } } } } } }, "404": { description: "Groupe non suivi." } },
        },
        patch: {
          summary: "Met à jour le suivi d'un groupe : adhésion, onglet, post, note, membres, message, admins et modérateurs.",
          description:
            "Seuls les champs envoyés changent ; un champ inconnu est refusé (400, nommé). Un premier lien de post part en pending et fait passer un groupe « à faire » dans « fait ». " +
            "postUrl vide ou null retire le post. message null efface le message. " +
            "staff REMPLACE la liste entière : envoie toujours la liste complète, telle que le groupe l'affiche (lis staff avec GET /{group} avant de la compléter) ; [] l'efface.",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  additionalProperties: false,
                  properties: {
                    status: { type: "string", enum: FB_TABS },
                    membership: { type: "string", enum: FB_MEMBERSHIPS },
                    members: { type: ["integer", "null"] },
                    postUrl: { type: ["string", "null"], description: "Lien facebook.com du post." },
                    postStatus: { type: "string", enum: FB_POST_STATES },
                    note: { type: "string", maxLength: FB_NOTE_MAX },
                    message: { type: ["string", "null"], description: "Avec {lien}." },
                    staff: { ...STAFF_LIST, description: "La liste complète des admins et modérateurs (remplace l'ancienne)." },
                  },
                },
                example: { membership: "validated", staff: [{ name: "Claire Martin", role: "admin", profileUrl: "https://www.facebook.com/claire.martin" }] },
              },
            },
          },
          responses: { "200": { description: "Le groupe à jour." }, "400": { description: "Champ refusé ou valeur invalide (error dit lequel)." }, "404": { description: "Groupe non suivi." } },
        },
      },
      "/{group}/message": {
        parameters: [{ name: "group", in: "path", required: true, schema: { type: "string" }, description: "Slug du groupe." }],
        get: {
          summary: "Le message prêt à poster dans ce groupe (text), son brut (raw) et le lien de suivi.",
          responses: { "200": { description: "Le message." }, "404": { description: "Groupe non suivi." }, "409": { description: "Aucun message rédigé pour ce groupe." } },
        },
        put: {
          summary: "Écrit ou réécrit le message du groupe.",
          description: MESSAGE_RULES,
          requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["text"], additionalProperties: false, properties: { text: { type: "string", maxLength: FB_MESSAGE_MAX } } } } } },
          responses: { "200": { description: "Le groupe à jour et le texte final." }, "400": { description: "Message vide, trop long, sans {lien}, ou avec l'adresse du site en dur." }, "404": { description: "Groupe non suivi." } },
        },
      },
      "/openapi.json": { get: { summary: "Cette documentation (sans clé).", security: [], responses: { "200": { description: "OpenAPI 3.1." } } } },
    },
  };
}

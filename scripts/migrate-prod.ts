/*
 * Migration des données vers le modèle « tout en pages de blocs ».
 *
 * Deux phases, à passer dans cet ordre autour du déploiement :
 *
 *   1. les pages, AVANT de déployer. Elles sont invisibles du site en ligne (aucun
 *      menu n'y mène encore), donc sans effet sur les visiteurs.
 *   2. les menus, APRÈS avoir déployé, avec --menus. Les repointer plus tôt enverrait
 *      le site en ligne vers /pages/<slug>, que l'ancien code rend vide.
 *
 * Le nouveau code sait lire les anciennes cibles de menu (voir MenuTarget), donc la
 * phase 2 est un nettoyage, pas une urgence. Les politiques sont lues EN BRUT, sans
 * zod : leur collection n'existe plus dans le nouveau code.
 *
 * Sans risque par défaut : il n'écrit rien tant qu'on ne passe pas --apply.
 *
 *   # répétition à blanc, sur la base visée
 *   NODE_OPTIONS=--conditions=react-server npx tsx --env-file=.env.local scripts/migrate-prod.ts
 *   # puis, seulement quand le compte rendu est conforme
 *   … scripts/migrate-prod.ts --apply
 *
 * Idempotent : une page déjà composée en blocs n'est pas réécrite (sauf --force),
 * pour ne pas effacer une retouche faite depuis l'admin.
 *
 * --editorial réécrit « Notre histoire » avec le récit rédigé (editorial-pages.ts) et
 * crée « Le concept ». À passer APRÈS le déploiement : le code en ligne doit connaître
 * les blocs du récit (Chapitre, Frise, Panneau…) pour savoir les rendre.
 */
import { legalToDocument } from "@/lib/blocks/from-html";
import { catalogueToBlocks, contactToBlocks, homeToBlocks, proToBlocks, storyToBlocks } from "@/lib/blocks/from-content";
import { conceptBlocks, storyBlocks } from "@/lib/blocks/editorial-pages";
import { getCatalogueContent, getContactContent, getHomeContent, getStoryContent } from "@/lib/db/content";
import { listMedia } from "@/lib/db/media";
import { getPage, savePageBlocks, setHomePage, upsertPage } from "@/lib/db/pages";
import { db } from "@/lib/firebase/admin";
import type { BlockDocument, ImageRef } from "@/lib/domain/types";

const APPLY = process.argv.includes("--apply");
/* Les menus ne bougent qu'à la demande : les repointer avant le déploiement casserait
   la navigation du site en ligne, qui résout une cible page vers /pages/<slug>. */
const MENUS = process.argv.includes("--menus");
/* Enveloppe les pages légales existantes dans le gabarit 7c. À passer APRÈS le
   déploiement : le code en ligne doit connaître le bloc pour savoir le rendre. */
const WRAP_LEGAL = process.argv.includes("--wrap-legal");
const FORCE = process.argv.includes("--force");
/* Réécrit « Notre histoire » avec le récit rédigé. Explicite, parce que la page existe
   déjà en blocs : la réécrire efface ce qui aurait été retouché depuis l'admin. */
const EDITORIAL = process.argv.includes("--editorial");

/* Une page « sœur » est une page libre, pas une page système ni une URL. */
const isPageSlug = (slug: string) => /^[a-z0-9-]+(\/[a-z0-9-]+)*$/.test(slug);

const plan: string[] = [];
const note = (s: string) => plan.push(s);

/** Crée ou remplace une page composée. Ne touche pas à une page déjà retouchée. */
async function ensurePage(slug: string, title: string, blocks: BlockDocument, html = ""): Promise<void> {
  const existing = await getPage(slug);
  if (existing?.blocks && !FORCE) {
    note(`= ${slug.padEnd(22)} déjà en blocs, laissée telle quelle`);
    return;
  }
  note(`${existing ? "~" : "+"} ${slug.padEnd(22)} « ${title} » · ${blocks.content.length} blocs`);
  if (!APPLY) return;
  await upsertPage({ slug, title, status: "published", body: { json: null, html } });
  await savePageBlocks(slug, blocks);
}

/*
 * Les photos des pages rédigées, retrouvées dans la médiathèque par leur nom de
 * fichier (voir EDITORIAL_PHOTOS dans le seed). Celles qui manquent laissent le bloc
 * sans image — elle se choisit alors dans l'éditeur, ce qui est sans risque.
 */
async function editorialPhoto(): Promise<(name: string) => ImageRef | undefined> {
  const media = (await listMedia(500)).filter((m) => m.mime.startsWith("image/"));
  return (name) => {
    const found = media.find((m) => m.path.endsWith(`/${name}`));
    return found ? { url: found.url, alt: found.alt, width: found.width, height: found.height } : undefined;
  };
}

type RawTarget = { kind?: string; key?: string; handle?: string; slug?: string; href?: string; newTab?: boolean };
type RawItem = { id?: string; label?: string; target?: RawTarget };

/* Une cible d'ancien modèle devient une cible de page. */
function retarget(t: RawTarget | undefined, pageSlugs: Set<string>): RawTarget | undefined {
  if (!t) return t;
  if (t.kind === "policy" && t.handle && pageSlugs.has(t.handle)) return { kind: "page", slug: t.handle };
  if (t.kind === "system" && t.key === "story" && pageSlugs.has("notre-histoire")) return { kind: "page", slug: "notre-histoire" };
  if (t.kind === "system" && t.key === "catalogue" && pageSlugs.has("catalogue")) return { kind: "page", slug: "catalogue" };
  if (t.kind === "system" && t.key === "contact" && pageSlugs.has("contact")) return { kind: "page", slug: "contact" };
  if (t.kind === "system" && t.key === "policies" && pageSlugs.has("privacy-policy")) return { kind: "page", slug: "privacy-policy" };
  return t;
}

async function main() {
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? "(défaut)";
  const emulated = Boolean(process.env.FIRESTORE_EMULATOR_HOST);
  console.log(`\nBase visée : ${projectId}${emulated ? " (ÉMULATEUR)" : "  ⚠️  BASE RÉELLE"}`);
  console.log(APPLY ? "Mode : ÉCRITURE\n" : "Mode : répétition à blanc, aucune écriture\n");

  /* 1. Politiques → pages, découpées aux titres. Lecture brute : la collection et son
        schéma n'existent plus dans le nouveau code. */
  const policies = await db().collection("policies").orderBy("position").get().catch(() => db().collection("policies").get());
  for (const d of policies.docs) {
    const raw = d.data() as { title?: string; body?: { html?: string } };
    const title = raw.title ?? d.id;
    await ensurePage(d.id, title, legalToDocument(raw.body?.html ?? "", title), raw.body?.html ?? "");
  }
  note(`  ${policies.size} politiques examinées`);

  /* 2. Les quatre pages bâties sur un contenu structuré. */
  const [home, story, catalogue, contact] = await Promise.all([getHomeContent(), getStoryContent(), getCatalogueContent(), getContactContent()]);
  if (story) await ensurePage("notre-histoire", "Notre histoire", storyToBlocks(story, home?.newsletter));
  if (catalogue) await ensurePage("catalogue", "Catalogue", catalogueToBlocks(catalogue, home?.newsletter));
  if (contact) await ensurePage("contact", "Contact", contactToBlocks(contact, home?.newsletter));
  if (home) await ensurePage("accueil", "Accueil", homeToBlocks(home));

  /* 2 bis. Les deux pages rédigées (lib/blocks/editorial-pages.ts). « Le concept » est
     nouvelle : elle est simplement créée. « Notre histoire » existe déjà en blocs,
     donc ensurePage la laisse tranquille — --editorial passe outre, délibérément. */
  const photo = await editorialPhoto();
  await ensurePage("le-concept", "Le concept", conceptBlocks(photo));
  // L'espace professionnels : nouvelle aussi, donc simplement créée.
  await ensurePage("pro", "Espace professionnels", proToBlocks());
  if (EDITORIAL) {
    const blocks = storyBlocks(photo, home?.newsletter);
    note(`~ ${"notre-histoire".padEnd(22)} récit rédigé · ${blocks.content.length} blocs (--editorial)`);
    if (APPLY) {
      await upsertPage({ slug: "notre-histoire", title: "Notre histoire", status: "published" });
      await savePageBlocks("notre-histoire", blocks);
    }
  } else {
    note("· notre-histoire         laissée telle quelle — la réécrire avec --editorial");
  }
  note("· menu : ajouter « Le concept » dans /admin/menus une fois la page vérifiée");

  /* 3. Les menus suivent. Lecture brute, pour la même raison qu'au point 1. */
  const slugs = new Set<string>();
  for (const d of policies.docs) slugs.add(d.id);
  for (const s of ["notre-histoire", "catalogue", "contact", "accueil"]) slugs.add(s);

  const header = MENUS ? await db().collection("menus").doc("header").get() : null;
  if (header?.exists) {
    const items = ((header.data()?.items ?? []) as RawItem[]).map((i) => ({ ...i, target: retarget(i.target, slugs) }));
    const changed = JSON.stringify(items) !== JSON.stringify(header.data()?.items);
    note(changed ? "~ menu d'en-tête repointé" : "= menu d'en-tête déjà à jour");
    if (APPLY && changed) await header.ref.set({ items, updatedAt: Date.now() });
  }
  const footer = MENUS ? await db().collection("menus").doc("footer").get() : null;
  if (footer?.exists) {
    const columns = ((footer.data()?.columns ?? []) as { items?: RawItem[] }[]).map((c) => ({
      ...c,
      items: (c.items ?? []).map((i) => ({ ...i, target: retarget(i.target, slugs) })),
    }));
    const changed = JSON.stringify(columns) !== JSON.stringify(footer.data()?.columns);
    note(changed ? "~ menu de pied repointé" : "= menu de pied déjà à jour");
    if (APPLY && changed) await footer.ref.set({ columns, updatedAt: Date.now() });
  }

  if (!MENUS) note("· menus laissés tels quels — les repointer avec --menus APRÈS le déploiement");

  /* 3 bis. Le gabarit des pages légales : sommaire à gauche, contenu à droite. Les
     blocs déjà en place sont déplacés dans le slot, jamais régénérés — une retouche
     faite depuis l'admin survit. */
  if (WRAP_LEGAL) {
    const footerDoc = await db().collection("menus").doc("footer").get();
    const columns = (footerDoc.data()?.columns ?? []) as { items?: { target?: { kind?: string; slug?: string } }[] }[];
    const candidates = new Set<string>();
    for (const c of columns) {
      for (const i of c.items ?? []) {
        const sl = i.target?.slug;
        if (typeof sl === "string" && isPageSlug(sl)) candidates.add(sl);
      }
    }
    for (const slug of candidates) {
      const page = await getPage(slug);
      if (!page?.blocks) continue;
      const content = page.blocks.content;
      if (content.length === 1 && content[0].type === "GabaritLegal") {
        note(`= ${slug.padEnd(22)} déjà dans le gabarit`);
        continue;
      }
      /*
       * Seule une page de texte entre dans le gabarit. Le critère est ce qu'elle
       * contient, pas la colonne où elle est rangée : « Boutique » liste aussi le
       * catalogue et le contact, qui ont leur propre mise en page.
       */
      if (!content.every((b) => b.type === "Titre" || b.type === "Texte")) {
        note(`· ${slug.padEnd(22)} mise en page propre, laissée de côté`);
        continue;
      }
      note(`~ ${slug.padEnd(22)} ${content.length} blocs déplacés dans le gabarit`);
      if (!APPLY) continue;
      await savePageBlocks(slug, {
        root: page.blocks.root,
        content: [
          {
            type: "GabaritLegal",
            props: {
              id: "GabaritLegal-1",
              resume: "",
              aideTitre: "Une question ?",
              aideTexte: "Nous répondons sous 48 h ouvrées.",
              aideCtaLabel: "Nous contacter",
              aideCtaHref: "/contact",
              contenu: content,
            },
          },
        ],
      });
    }
  }

  /* 4. La racine est servie par une page — seulement si aucune ne l'est déjà. */
  const flagged = await db().collection("pages").where("home", "==", true).limit(1).get();
  if (flagged.empty && (home || (await getPage("accueil")))) {
    note("~ page d'accueil : accueil");
    if (APPLY) await setHomePage("accueil");
  } else {
    note(`= page d'accueil : ${flagged.docs[0]?.id ?? "aucune"} (inchangée)`);
  }

  /* 5. La collection policies n'a plus de lecteur. On la garde le temps de vérifier
        la mise en ligne ; sa suppression est un second passage, délibéré. */
  note(`  collection policies conservée (${policies.size} documents) — supprimer avec --drop-policies une fois la prod validée`);
  if (APPLY && process.argv.includes("--drop-policies")) {
    const batch = db().batch();
    for (const d of policies.docs) batch.delete(d.ref);
    await batch.commit();
    note(`- collection policies supprimée`);
  }

  console.log(plan.join("\n"));
  console.log(APPLY ? "\nTerminé." : "\nRien n'a été écrit. Relancer avec --apply pour appliquer.\n");
}

main();

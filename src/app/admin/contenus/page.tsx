import Link from "next/link";
import { ActionForm } from "@/components/admin/ActionForm";
import { Card, Checkbox, Field, Input, PageHeader, Select, Textarea } from "@/components/admin/ui";
import { saveCatalogueAction, saveContactAction, saveHomeAction, saveStoryAction } from "@/lib/admin/actions/content";
import { getCatalogueContent, getContactContent, getHomeContent, getStoryContent } from "@/lib/db/content";
import type { Tint } from "@/lib/domain/types";

export const dynamic = "force-dynamic";

/*
 * Contenus des pages système : accueil, catalogue, notre histoire, contact. Un formulaire
 * par page, champ par champ — c'est le compromis assumé : on change textes et images,
 * pas la composition. Les images se saisissent par URL (copiée dans Médias).
 */

const TINTS: { value: Tint; label: string }[] = [
  { value: "green", label: "Vert" },
  { value: "blue", label: "Bleu" },
  { value: "pink", label: "Rose" },
  { value: "sand", label: "Sable" },
];

function TintSelect({ name, value }: { name: string; value: Tint }) {
  return (
    <Select name={name} defaultValue={value}>
      {TINTS.map((t) => (
        <option key={t.value} value={t.value}>
          {t.label}
        </option>
      ))}
    </Select>
  );
}

export default async function ContentsPage({ searchParams }: PageProps<"/admin/contenus">) {
  const { onglet } = await searchParams;
  const tab = typeof onglet === "string" ? onglet : "accueil";
  const [home, catalogue, story, contact] = await Promise.all([getHomeContent(), getCatalogueContent(), getStoryContent(), getContactContent()]);

  const tabs = [
    ["accueil", "Accueil"],
    ["catalogue", "Catalogue"],
    ["histoire", "Notre histoire"],
    ["contact", "Contact"],
  ] as const;

  return (
    <>
      <PageHeader title="Contenus" subtitle="Textes et images des pages système. Les images se collent par URL depuis la médiathèque." />
      <nav className="mb-6 flex flex-wrap gap-1.5 rounded-pill bg-white p-1.5 text-[0.8125rem] font-semibold" aria-label="Pages">
        {tabs.map(([key, label]) => (
          <a key={key} href={`?onglet=${key}`} className={`rounded-pill px-4 py-2 ${tab === key ? "bg-ink text-white" : "hover:bg-paper"}`} aria-current={tab === key ? "page" : undefined}>
            {label}
          </a>
        ))}
      </nav>

      {tab === "accueil" && home && (
        <ActionForm action={saveHomeAction} submitLabel="Enregistrer l'accueil">
          <>
            <Card title="Héro">
              <div className="grid grid-cols-2 gap-4 max-[749px]:grid-cols-1">
                <Field label="Pastille" name="hero.badge"><Input name="hero.badge" defaultValue={home.hero.badge} /></Field>
                <Field label="Titre" name="hero.heading"><Input name="hero.heading" defaultValue={home.hero.heading} /></Field>
                <Field label="Texte" className="col-span-2 max-[749px]:col-span-1" name="hero.text"><Textarea name="hero.text" defaultValue={home.hero.text} rows={2} /></Field>
                <Field label="URL de la vidéo (mp4)" name="hero.videoUrl"><Input name="hero.videoUrl" defaultValue={home.hero.videoUrl} /></Field>
                <Field label="URL de l'affiche" hint="Image montrée avant la vidéo et si l'animation est réduite." name="hero.posterUrl"><Input name="hero.posterUrl" defaultValue={home.hero.posterUrl} /></Field>
                <Field label="Bouton principal"><Input name="hero.primary.label" defaultValue={home.hero.primary.label} /></Field>
                <Field label="Lien principal"><Input name="hero.primary.href" defaultValue={home.hero.primary.href} placeholder="/catalogue" /></Field>
                <Field label="Bouton secondaire"><Input name="hero.secondary.label" defaultValue={home.hero.secondary.label} /></Field>
                <Field label="Lien secondaire"><Input name="hero.secondary.href" defaultValue={home.hero.secondary.href} /></Field>
              </div>
            </Card>

            <Card title="Tuiles">
              <div className="grid grid-cols-3 gap-4 max-[899px]:grid-cols-1">
                {[0, 1, 2].map((i) => {
                  const t = home.tiles[i] ?? { title: "", text: "", tint: "green" as Tint };
                  return (
                    <div key={i} className="flex flex-col gap-3 rounded-xl bg-paper p-4">
                      <Field label={`Tuile ${i + 1} — titre`}><Input name={`tiles[${i}].title`} defaultValue={t.title} /></Field>
                      <Field label="Texte"><Input name={`tiles[${i}].text`} defaultValue={t.text} /></Field>
                      <Field label="Teinte"><TintSelect name={`tiles[${i}].tint`} value={t.tint} /></Field>
                    </div>
                  );
                })}
              </div>
            </Card>

            <Card title="Bloc catalogue">
              <div className="grid grid-cols-3 gap-4 max-[749px]:grid-cols-1">
                <Field label="Titre"><Input name="catalogue.heading" defaultValue={home.catalogue.heading} /></Field>
                <Field label="Lien « voir tout »"><Input name="catalogue.linkLabel" defaultValue={home.catalogue.linkLabel} /></Field>
                <Field label="Nombre de livres" name="catalogue.count"><Input name="catalogue.count" type="number" min={1} max={12} defaultValue={home.catalogue.count} /></Field>
              </div>
            </Card>

            <Card title="Bloc « Comment l'utiliser »">
              <div className="grid grid-cols-2 gap-4 max-[749px]:grid-cols-1">
                <Field label="Surtitre"><Input name="howTo.eyebrow" defaultValue={home.howTo.eyebrow} /></Field>
                <Field label="Titre"><Input name="howTo.heading" defaultValue={home.howTo.heading} /></Field>
                <Field label="Texte" className="col-span-2 max-[749px]:col-span-1"><Textarea name="howTo.text" defaultValue={home.howTo.text} rows={3} /></Field>
                <Field label="URL de l'image"><Input name="howTo.image" defaultValue={home.howTo.image?.url ?? ""} /></Field>
                <Field label="Teinte"><TintSelect name="howTo.tint" value={home.howTo.tint} /></Field>
                <Field label="Bouton"><Input name="howTo.cta.label" defaultValue={home.howTo.cta.label} /></Field>
                <Field label="Lien du bouton"><Input name="howTo.cta.href" defaultValue={home.howTo.cta.href} /></Field>
              </div>
            </Card>

            <Card title="Bloc « Notre histoire »">
              <div className="grid grid-cols-2 gap-4 max-[749px]:grid-cols-1">
                <Field label="Surtitre"><Input name="story.eyebrow" defaultValue={home.story.eyebrow} /></Field>
                <Field label="Titre"><Input name="story.heading" defaultValue={home.story.heading} /></Field>
                <Field label="Texte" className="col-span-2 max-[749px]:col-span-1"><Textarea name="story.text" defaultValue={home.story.text} rows={3} /></Field>
                <Field label="URL de l'image"><Input name="story.image" defaultValue={home.story.image?.url ?? ""} /></Field>
                <Field label="Lien"><Input name="story.cta.label" defaultValue={home.story.cta.label} /></Field>
                <Field label="Cible du lien"><Input name="story.cta.href" defaultValue={home.story.cta.href} /></Field>
              </div>
            </Card>

            <Card title="Newsletter">
              <div className="grid grid-cols-2 gap-4 max-[749px]:grid-cols-1">
                <Field label="Titre"><Input name="newsletter.heading" defaultValue={home.newsletter.heading} /></Field>
                <Field label="Texte"><Input name="newsletter.text" defaultValue={home.newsletter.text} /></Field>
                <Field label="Champ"><Input name="newsletter.placeholder" defaultValue={home.newsletter.placeholder} /></Field>
                <Field label="Bouton"><Input name="newsletter.button" defaultValue={home.newsletter.button} /></Field>
              </div>
            </Card>
          </>
        </ActionForm>
      )}

      {tab === "catalogue" && catalogue && (
        <ActionForm action={saveCatalogueAction} submitLabel="Enregistrer le catalogue">
          <>
            <Card title="Bandeau">
              <div className="grid grid-cols-2 gap-4 max-[749px]:grid-cols-1">
                <Field label="Surtitre" hint="[count] = nombre de titres publiés."><Input name="hero.eyebrow" defaultValue={catalogue.hero.eyebrow} /></Field>
                <Field label="Titre" name="hero.heading"><Input name="hero.heading" defaultValue={catalogue.hero.heading} /></Field>
                <Field label="Texte" className="col-span-2 max-[749px]:col-span-1"><Textarea name="hero.text" defaultValue={catalogue.hero.text} rows={2} /></Field>
                <Field label="Teinte"><TintSelect name="hero.tint" value={catalogue.hero.tint} /></Field>
              </div>
            </Card>
            <Card title="Offre groupée">
              <div className="flex flex-col gap-4">
                <Checkbox name="offer.enabled" label="Afficher la carte" defaultChecked={catalogue.offer.enabled} />
                <div className="grid grid-cols-3 gap-4 max-[749px]:grid-cols-1">
                  <Field label="Intitulé"><Input name="offer.title" defaultValue={catalogue.offer.title} /></Field>
                  <Field label="Prix barré"><Input name="offer.compareAt" defaultValue={catalogue.offer.compareAt} /></Field>
                  <Field label="Prix"><Input name="offer.price" defaultValue={catalogue.offer.price} /></Field>
                  <Field label="Précision" className="col-span-3 max-[749px]:col-span-1"><Input name="offer.note" defaultValue={catalogue.offer.note} /></Field>
                  <Field label="Bouton"><Input name="offer.cta.label" defaultValue={catalogue.offer.cta.label} /></Field>
                  <Field label="Lien du bouton" hint="Le produit « collection complète » quand il existera."><Input name="offer.cta.href" defaultValue={catalogue.offer.cta.href} /></Field>
                </div>
              </div>
            </Card>
            <Card title="Caractéristiques (bande blanche)">
              <div className="grid grid-cols-3 gap-4 max-[899px]:grid-cols-1">
                {[0, 1, 2].map((i) => {
                  const s = catalogue.specs[i] ?? { title: "", text: "" };
                  return (
                    <div key={i} className="flex flex-col gap-3 rounded-xl bg-paper p-4">
                      <Field label={`Titre ${i + 1}`}><Input name={`specs[${i}].title`} defaultValue={s.title} /></Field>
                      <Field label="Texte"><Input name={`specs[${i}].text`} defaultValue={s.text} /></Field>
                    </div>
                  );
                })}
              </div>
            </Card>
          </>
        </ActionForm>
      )}

      {tab === "histoire" && story && (
        <ActionForm action={saveStoryAction} submitLabel="Enregistrer notre histoire">
          <>
            <Card title="Héro">
              <div className="grid grid-cols-2 gap-4 max-[749px]:grid-cols-1">
                <Field label="Surtitre"><Input name="hero.eyebrow" defaultValue={story.hero.eyebrow} /></Field>
                <Field label="Titre" name="hero.heading"><Input name="hero.heading" defaultValue={story.hero.heading} /></Field>
                <Field label="Texte" className="col-span-2 max-[749px]:col-span-1"><Textarea name="hero.text" defaultValue={story.hero.text} rows={3} /></Field>
                <Field label="URL de l'image"><Input name="hero.image" defaultValue={story.hero.image?.url ?? ""} /></Field>
                <Field label="Teinte"><TintSelect name="hero.tint" value={story.hero.tint} /></Field>
              </div>
            </Card>
            <Card title="Premier texte">
              <div className="flex flex-col gap-4">
                <Field label="Titre"><Input name="intro.heading" defaultValue={story.intro.heading} /></Field>
                <Field label="Paragraphes" hint="Un paragraphe par ligne. Le dernier est mis en avant."><Textarea name="intro.paragraphs" defaultValue={story.intro.paragraphs.join("\n")} rows={6} /></Field>
              </div>
            </Card>
            <Card title="Trois principes">
              <div className="grid grid-cols-3 gap-4 max-[899px]:grid-cols-1">
                {[0, 1, 2].map((i) => {
                  const p = story.principles[i] ?? { eyebrow: "", title: "", text: "", tint: "green" as Tint };
                  return (
                    <div key={i} className="flex flex-col gap-3 rounded-xl bg-paper p-4">
                      <Field label="Surtitre"><Input name={`principles[${i}].eyebrow`} defaultValue={p.eyebrow} /></Field>
                      <Field label="Titre"><Input name={`principles[${i}].title`} defaultValue={p.title} /></Field>
                      <Field label="Texte"><Textarea name={`principles[${i}].text`} defaultValue={p.text} rows={3} /></Field>
                      <Field label="Teinte"><TintSelect name={`principles[${i}].tint`} value={p.tint} /></Field>
                    </div>
                  );
                })}
              </div>
            </Card>
            <Card title="Galerie">
              <Field label="URLs des images" hint="Une par ligne, trois recommandées."><Textarea name="galleryUrls" defaultValue={story.gallery.map((g) => g.url).join("\n")} rows={3} /></Field>
            </Card>
            <Card title="Second texte">
              <div className="flex flex-col gap-4">
                <Field label="Titre"><Input name="walk.heading" defaultValue={story.walk.heading} /></Field>
                <Field label="Paragraphes" hint="Un paragraphe par ligne."><Textarea name="walk.paragraphs" defaultValue={story.walk.paragraphs.join("\n")} rows={6} /></Field>
              </div>
            </Card>
            <Card title="Bandeau final">
              <div className="grid grid-cols-2 gap-4 max-[749px]:grid-cols-1">
                <Field label="Titre"><Input name="cta.heading" defaultValue={story.cta.heading} /></Field>
                <Field label="Texte"><Input name="cta.text" defaultValue={story.cta.text} /></Field>
                <Field label="Bouton"><Input name="cta.button.label" defaultValue={story.cta.button.label} /></Field>
                <Field label="Lien"><Input name="cta.button.href" defaultValue={story.cta.button.href} /></Field>
              </div>
            </Card>
          </>
        </ActionForm>
      )}

      {tab === "contact" && contact && (
        <ActionForm action={saveContactAction} submitLabel="Enregistrer le contact">
          <>
            <Card title="Introduction">
              <div className="grid grid-cols-2 gap-4 max-[749px]:grid-cols-1">
                <Field label="Surtitre"><Input name="intro.eyebrow" defaultValue={contact.intro.eyebrow} /></Field>
                <Field label="Titre" name="intro.heading"><Input name="intro.heading" defaultValue={contact.intro.heading} /></Field>
                <Field label="Texte" className="col-span-2 max-[749px]:col-span-1"><Textarea name="intro.text" defaultValue={contact.intro.text} rows={3} /></Field>
                <Field label="Intitulé pros"><Input name="proLabel" defaultValue={contact.proLabel} /></Field>
                <Field label="Texte pros"><Input name="proText" defaultValue={contact.proText} /></Field>
              </div>
            </Card>
            <Card title="Formulaire">
              <div className="grid grid-cols-2 gap-4 max-[749px]:grid-cols-1">
                <Field label="Sujets" hint="Un par ligne ; le premier est sélectionné par défaut."><Textarea name="subjectsText" defaultValue={contact.subjects.join("\n")} rows={5} /></Field>
                <div className="flex flex-col gap-4">
                  <Field label="Mention légale sous le formulaire"><Textarea name="legal" defaultValue={contact.legal} rows={2} /></Field>
                  <Field label="Message de confirmation"><Textarea name="successText" defaultValue={contact.successText} rows={2} /></Field>
                </div>
              </div>
            </Card>
            <Card title="Questions fréquentes">
              <div className="flex flex-col gap-4">
                <div className="grid grid-cols-2 gap-4 max-[749px]:grid-cols-1">
                  <Field label="Titre de la section"><Input name="faq.heading" defaultValue={contact.faq.heading} /></Field>
                  <Field label="Mention à droite"><Input name="faq.note" defaultValue={contact.faq.note} /></Field>
                </div>
                <p className="text-[0.8125rem] text-muted">
                  Les questions et réponses se gèrent dans <Link href="/admin/faq" className="font-bold underline">FAQ</Link> ({contact.faq.items.length} question{contact.faq.items.length > 1 ? "s" : ""}).
                </p>
              </div>
            </Card>
          </>
        </ActionForm>
      )}
    </>
  );
}

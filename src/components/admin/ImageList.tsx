"use client";

import { useMemo, useRef, useState, type DragEvent } from "react";
import { uploadMediaFilesAction } from "@/lib/admin/actions/media";
import type { ImageRef, Media } from "@/lib/domain/types";

/*
 * Photos d'un produit, comme dans la maquette : la principale en grand sur la teinte
 * du livre, les autres en vignettes, une case « + » pour ajouter. Réordonner, retirer,
 * corriger le texte alternatif.
 *
 * Le « + » ouvre la médiathèque, avec les deux entrées côte à côte : choisir une photo
 * déjà en ligne, ou en envoyer une depuis l'ordinateur (bouton ou glisser-déposer).
 * Dans les deux cas la photo est DÉPOSÉE TOUT DE SUITE et rejoint la médiathèque ; ce
 * qui part à l'enregistrement du produit n'est plus qu'une liste d'URL, dans l'ordre
 * voulu (`imagesJson`).
 *
 * C'est le point important : les photos ne voyagent plus en pièces jointes du
 * formulaire. Auparavant elles attendaient dans un <input type="file"> réécrit à la
 * main, restaient marquées « à envoyer » après un enregistrement réussi — l'état local
 * ne se remet pas d'un rafraîchissement de la page —, et repartaient une seconde fois
 * au clic suivant. Déposer d'abord fait disparaître l'attente, et avec elle le doute.
 */
const TINT_BG = { green: "bg-tint-green", blue: "bg-tint-blue", pink: "bg-tint-pink", sand: "bg-tint-sand" } as const;

/*
 * Formats réellement acceptés par la médiathèque (voir ALLOWED dans db/media.ts). On
 * ne met pas `image/*` : la photothèque d'un iPhone proposerait alors des HEIC, que le
 * serveur refuse ensuite — mieux vaut ne pas les laisser choisir.
 */
const ACCEPTED = ["image/jpeg", "image/png", "image/webp", "image/avif"];

export function ImageList({ initial, tint = "sand", library }: { initial: ImageRef[]; tint?: keyof typeof TINT_BG; library: Media[] }) {
  const [images, setImages] = useState<ImageRef[]>(initial);
  const [selected, setSelected] = useState(0);
  /* La médiathèque telle qu'on la voit d'ici : celle du serveur, plus ce qu'on vient
     d'envoyer sans avoir rechargé la page. */
  const [media, setMedia] = useState<Media[]>(library);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [dragging, setDragging] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const update = (next: ImageRef[], nextSelected = selected) => {
    setImages(next);
    setSelected(Math.max(0, Math.min(nextSelected, next.length - 1)));
  };

  const addRefs = (refs: ImageRef[]) => {
    /* Deux fois la même photo sur un livre n'a pas de sens : l'URL suffit à le dire. */
    const known = new Set(images.map((i) => i.url));
    const fresh = refs.filter((r) => !known.has(r.url));
    if (fresh.length === 0) return;
    update([...images, ...fresh], images.length);
  };

  async function upload(files: FileList | File[] | null) {
    const all = Array.from(files ?? []);
    const chosen = all.filter((f) => ACCEPTED.includes(f.type));
    if (chosen.length === 0) {
      setError(all.length ? "Format non accepté : envoyez du JPG, PNG, WebP ou AVIF." : "Aucun fichier à envoyer.");
      return;
    }
    setBusy(true);
    setError("");
    const body = new FormData();
    for (const f of chosen) body.append("files", f);

    const result = await uploadMediaFilesAction(body);
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setMedia((prev) => [...result.media, ...prev]);
    addRefs(result.media.map((m) => ({ url: m.url, alt: m.alt, width: m.width, height: m.height })));
    /* Un fichier refusé sur plusieurs : on garde la fenêtre ouverte pour le dire. */
    if (result.error) setError(result.error);
    else setOpen(false);
  }

  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragging(false);
    void upload(e.dataTransfer.files);
  }

  const move = (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= images.length) return;
    const copy = [...images];
    [copy[i], copy[j]] = [copy[j], copy[i]];
    update(copy, j);
  };

  const remove = (i: number) => update(images.filter((_, k) => k !== i), 0);

  const main = images[selected] ?? images[0];
  const used = new Set(images.map((i) => i.url));
  const pictures = useMemo(() => media.filter((m) => m.mime.startsWith("image/")), [media]);
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return pictures;
    return pictures.filter((m) => m.path.toLowerCase().includes(q) || m.alt.toLowerCase().includes(q));
  }, [pictures, query]);

  return (
    <div className="flex flex-col gap-3.5">
      {/* Tout ce qui part à l'enregistrement : des URL déjà en ligne, dans l'ordre. */}
      <input type="hidden" name="imagesJson" value={JSON.stringify(images)} readOnly />

      <div className={`relative flex aspect-square items-center justify-center overflow-hidden rounded-2xl ${TINT_BG[tint]}`}>
        {main ? (
          // eslint-disable-next-line @next/next/no-img-element -- aperçu admin
          <img src={main.url} alt={main.alt} className="h-full w-full object-cover" />
        ) : (
          <span className="text-[0.8125rem] font-semibold text-subtle">Aucune photo</span>
        )}
        {main && (
          <>
            <span className="absolute left-2.5 top-2.5 rounded-pill bg-surface px-2 py-1 text-[0.625rem] font-bold uppercase tracking-[0.08em]">
              {selected === 0 ? "Principale" : `Photo ${selected + 1}`}
            </span>
            <div className="absolute bottom-2.5 right-2.5 flex gap-1.5">
              {selected > 0 && (
                <button type="button" onClick={() => move(selected, -1)} className="rounded-pill bg-surface px-2.5 py-1.5 text-[0.6875rem] font-bold">
                  ← Avancer
                </button>
              )}
              {selected < images.length - 1 && (
                <button type="button" onClick={() => move(selected, 1)} className="rounded-pill bg-surface px-2.5 py-1.5 text-[0.6875rem] font-bold">
                  Reculer →
                </button>
              )}
              <button type="button" onClick={() => remove(selected)} className="rounded-pill bg-surface px-2.5 py-1.5 text-[0.6875rem] font-bold text-accent">
                Retirer
              </button>
            </div>
          </>
        )}
      </div>

      <div className="grid grid-cols-4 gap-2">
        {images.map((img, i) => (
          <button
            key={img.url}
            type="button"
            onClick={() => setSelected(i)}
            aria-label={`Photo ${i + 1}`}
            aria-pressed={i === selected}
            className={`relative aspect-square overflow-hidden rounded-xl ${i === selected ? "outline-2 outline-offset-2 outline-ink" : ""}`}
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- aperçu admin */}
            <img src={img.url} alt="" className="h-full w-full object-cover" />
          </button>
        ))}
        <button
          type="button"
          onClick={() => {
            setError("");
            setOpen(true);
          }}
          title="Ajouter des photos"
          className="flex aspect-square cursor-pointer items-center justify-center rounded-xl border-[1.5px] border-dashed border-line-warm text-xl text-faint hover:border-ink hover:text-ink"
        >
          +
        </button>
      </div>

      {main && (
        <input
          value={main.alt}
          onChange={(e) => update(images.map((x, k) => (k === selected ? { ...x, alt: e.target.value } : x)))}
          placeholder="Texte alternatif de la photo sélectionnée"
          aria-label="Texte alternatif"
          className="w-full rounded-[14px] bg-paper px-4 py-3 text-[0.8125rem] font-semibold outline-none placeholder:font-medium placeholder:text-faint"
        />
      )}
      <span className="text-[0.6875rem] leading-relaxed text-subtle">
        La première photo est la vignette. Les photos ajoutées rejoignent la médiathèque aussitôt ; « Enregistrer » les
        rattache au livre, dans cet ordre. Fond de vignette : la teinte du livre.
      </span>

      {/* ---------- La médiathèque, et l'ordinateur ---------- */}
      {open && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40 p-6" onClick={() => setOpen(false)}>
          <div
            className={`flex max-h-[80vh] w-full max-w-[52rem] flex-col gap-3 rounded-card bg-surface p-5 ${dragging ? "outline-2 outline-dashed outline-ink" : ""}`}
            onClick={(e) => e.stopPropagation()}
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
          >
            <div className="flex items-center justify-between gap-3">
              <strong className="text-sm">
                Médiathèque · {shown.length} image{shown.length > 1 ? "s" : ""}
              </strong>
              <button type="button" onClick={() => setOpen(false)} className="text-xs font-bold underline">
                Terminer
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Filtrer par nom ou texte alternatif…"
                className="min-w-[12rem] flex-1 rounded-[10px] border border-line bg-paper px-3 py-2 text-sm"
              />
              {/*
                Le champ de fichiers vit ici, hors de toute étiquette : c'est le bouton
                qui l'ouvre. `value = ""` après coup, pour que renvoyer deux fois le même
                fichier déclenche bien deux fois l'événement.
              */}
              <input
                ref={fileInput}
                type="file"
                accept={ACCEPTED.join(",")}
                multiple
                className="sr-only"
                onChange={(e) => {
                  void upload(e.target.files);
                  e.target.value = "";
                }}
              />
              <button
                type="button"
                disabled={busy}
                onClick={() => fileInput.current?.click()}
                className="rounded-[10px] bg-ink px-3.5 py-2 text-xs font-bold text-on-ink hover:opacity-80 disabled:opacity-50"
              >
                {busy ? "Envoi…" : "Depuis mon ordinateur"}
              </button>
            </div>

            {error && <p className="text-xs font-semibold text-danger">{error}</p>}
            {dragging && <p className="text-xs font-semibold text-subtle">Déposez les fichiers pour les envoyer.</p>}

            {shown.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted">
                {pictures.length === 0
                  ? "La médiathèque est vide. Envoyez une photo ci-dessus, ou déposez un fichier ici."
                  : "Aucune image ne répond à ce filtre."}
              </p>
            ) : (
              /*
                `min-h-0` et `flex-1` : sans eux, un enfant de colonne flex ne descend
                jamais sous la hauteur de son contenu (`min-height: auto`), le défilement
                ne s'enclenche pas, et c'est la grille qui se comprime.
              */
              <div className="grid min-h-0 flex-1 auto-rows-max content-start grid-cols-5 gap-2 overflow-y-auto max-[899px]:grid-cols-3">
                {shown.map((m) => {
                  const already = used.has(m.url);
                  return (
                    <button
                      key={m.id}
                      type="button"
                      title={m.path}
                      /* Cliquer ajoute sans fermer : on prend souvent trois photos d'affilée. */
                      onClick={() => (already ? update(images.filter((i) => i.url !== m.url), 0) : addRefs([{ url: m.url, alt: m.alt, width: m.width, height: m.height }]))}
                      className={`relative aspect-square overflow-hidden rounded-[10px] bg-paper ring-offset-2 hover:opacity-80 ${already ? "ring-2 ring-ink" : ""}`}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element -- vignette admin */}
                      <img src={m.url} alt={m.alt} loading="lazy" className="h-full w-full object-cover" />
                      {already && (
                        <span className="absolute inset-x-0 bottom-0 bg-ink/70 py-0.5 text-[0.5625rem] font-bold uppercase tracking-[0.08em] text-white">Sur le livre</span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}

            <p className="text-[0.6875rem] text-subtle">
              Cliquez une image pour l&apos;ajouter au livre, de nouveau pour l&apos;en retirer. JPG, PNG, WebP ou AVIF,
              40 Mo maximum.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

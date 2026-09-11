"use client";

import "@puckeditor/core/puck.css";
import { Puck, type Data } from "@puckeditor/core";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { blockConfig, type BlockData, type BlockMetadata } from "@/lib/blocks/config";
import { MediaLibraryProvider } from "@/lib/blocks/media-context";
import { frDictionary } from "@/lib/blocks/dictionary";
import type { AdminResult } from "@/lib/admin/types";
import type { Media } from "@/lib/domain/types";
import { Notice } from "./ui";

/*
 * Éditeur visuel par blocs (prototype). Puck tient toute la surface : catalogue à
 * gauche, aperçu au centre, réglages du bloc sélectionné à droite. « Enregistrer »
 * envoie le document à l'action serveur, qui le revalide au zod avant écriture.
 *
 * `iframe: false` : l'aperçu est rendu dans la page plutôt que dans une iframe, pour
 * qu'il hérite directement de la feuille Tailwind du site (jetons, `prose-mv`,
 * `display-2`). C'est ce qui rend l'aperçu fidèle sans dupliquer la charte.
 */

type Props = {
  slug: string;
  title: string;
  initialData: Partial<BlockData>;
  /** Médiathèque chargée côté serveur : le champ image l'ouvre sans nouvel aller-retour. */
  media: Media[];
  /** Adresse publique de la page, affichée dans la barre de l'éditeur. */
  path: string;
  /** Données du site que certains blocs affichent (catalogue) : l'aperçu reste fidèle. */
  metadata: BlockMetadata;
  save: (slug: string, data: Data) => Promise<AdminResult>;
};

export function BlockEditor({ slug, title, path, initialData, media, metadata, save }: Props) {
  const router = useRouter();
  const [notice, setNotice] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const onPublish = async (data: BlockData) => {
    setBusy(true);
    setNotice(null);
    const result = await save(slug, data);
    setBusy(false);
    if (result.ok) {
      setNotice({ tone: "ok", text: result.message ?? "Page enregistrée." });
      router.refresh();
    } else {
      setNotice({ tone: "error", text: result.error });
    }
  };

  return (
    <div className="flex flex-col gap-3">
      {notice && <Notice tone={notice.tone}>{notice.text}</Notice>}
      {busy && <Notice tone="ok">Enregistrement…</Notice>}
      {/* Puck se cale sur la hauteur qu'on lui donne ; on lui laisse l'écran moins l'en-tête. */}
      <div className="overflow-hidden rounded-card border border-line">
        <MediaLibraryProvider media={media}>
          <Puck
            config={blockConfig}
            data={initialData}
            onPublish={onPublish}
            dictionary={frDictionary}
            metadata={metadata}
            headerTitle={title}
            headerPath={path}
            iframe={{ enabled: false }}
            height="calc(100vh - 14rem)"
          />
        </MediaLibraryProvider>
      </div>
    </div>
  );
}

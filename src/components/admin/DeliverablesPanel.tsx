"use client";

import { ref, uploadBytesResumable } from "firebase/storage";
import { useRouter } from "next/navigation";
import { useRef, useState, type DragEvent } from "react";
import { confirmDeliverableAction, deleteDeliverableAction, prepareDeliverableAction } from "@/lib/admin/actions/deliverables";
import { clientAuth, clientStorage } from "@/lib/firebase/client";
import { ACCEPTED_CONTENT, contentMime, fileSizeLabel, MAX_CONTENT_BYTES, progressLabel, shortfall, shortfallLabel, tallyContents } from "@/lib/domain/deliverables";
import type { ContentQuota, Deliverable } from "@/lib/domain/types";

/*
 * Les contenus rendus par un partenaire, sur la page de sa campagne : ce qui est
 * arrivé, ce qui manque, et de quoi déposer la suite.
 *
 * Le fichier NE PASSE PAS par le serveur. Il va droit au coffre, en trois temps :
 * « préparer » donne l'endroit, le navigateur y dépose (c'est le seul moment du projet
 * où il écrit quelque part), « inscrire » fait relire l'objet au serveur, qui en tire le
 * type, la taille et la fiche. Voir db/deliverables.ts : une action serveur plafonne à
 * 45 Mo, une vidéo de partenaire pèse couramment le triple.
 *
 * Le décompte se refait ici à chaque rendu, depuis la liste reçue : après un dépôt, un
 * `router.refresh()` rapporte la liste du serveur et le « il manque » suit tout seul.
 */

/*
 * Pourquoi l'envoi a échoué, et pas seulement qu'il a échoué. Un « envoi interrompu »
 * pour tout faisait passer un refus des règles du coffre pour une coupure réseau : il
 * manquait un `firebase deploy --only storage` et rien ne le disait. Le code Firebase
 * est gardé entre parenthèses quand il n'est pas prévu — c'est lui qui se cherche.
 */
const UPLOAD_ERRORS: Record<string, string> = {
  "storage/unauthorized": "refusé par le coffre : règles non déployées, ou session sans droits d'administration",
  "storage/unauthenticated": "session expirée : reconnectez-vous",
  "storage/retry-limit-exceeded": "envoi trop lent : le coffre a renoncé",
  "storage/canceled": "envoi annulé",
  "storage/quota-exceeded": "coffre plein",
  "storage/invalid-checksum": "fichier abîmé en route : réessayez",
};

function uploadError(e: unknown): string {
  const code = typeof e === "object" && e !== null && "code" in e ? String((e as { code: unknown }).code) : "";
  return UPLOAD_ERRORS[code] ?? (code ? `envoi interrompu (${code})` : "envoi interrompu");
}

const TONE = { photo: "bg-tint-blue text-tint-blue-ink", video: "bg-tint-pink text-tint-pink-ink" } as const;
const KIND = { photo: "Photo", video: "Vidéo" } as const;

type Pending = { name: string; percent: number; error?: string };

export function DeliverablesPanel({ campaignId, bucket, items, expected }: { campaignId: string; bucket: string; items: Deliverable[]; expected: ContentQuota }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<Pending[]>([]);
  const [error, setError] = useState("");
  const [dragging, setDragging] = useState(false);
  const [open, setOpen] = useState("");
  const [busy, setBusy] = useState(false);

  const received = tallyContents(items);
  const missing = shortfall(expected, received);

  async function send(files: FileList | File[] | null) {
    const all = Array.from(files ?? []);
    if (all.length === 0) return;
    setError("");

    /*
     * Le dépôt direct a besoin d'une session Firebase vivante dans CE navigateur : les
     * règles du coffre lisent le jeton, pas le cookie de session. Le dire franchement
     * vaut mieux qu'un « permission refusée » à mi-envoi.
     */
    if (!clientAuth().currentUser) {
      setError("Votre session s'est interrompue dans ce navigateur : reconnectez-vous avant de déposer.");
      return;
    }

    setBusy(true);
    setPending(all.map((f) => ({ name: f.name, percent: 0 })));
    const storage = clientStorage(bucket);
    const progress = (index: number, patch: Partial<Pending>) => setPending((list) => list.map((p, i) => (i === index ? { ...p, ...patch } : p)));

    for (const [index, file] of all.entries()) {
      if (file.size === 0 || file.size > MAX_CONTENT_BYTES) {
        progress(index, { error: file.size === 0 ? "fichier vide" : `plus de ${Math.round(MAX_CONTENT_BYTES / 1024 / 1024)} Mo` });
        continue;
      }
      const prepared = await prepareDeliverableAction(campaignId, file.name, file.type);
      if (!prepared.ok) {
        progress(index, { error: prepared.error });
        continue;
      }
      try {
        /*
         * Le type est posé explicitement : un HEIC arrive souvent sans type du tout, et
         * le coffre le rangerait en « octet-stream » — que les règles refusent, et dont
         * on ne saurait plus dire si c'est une photo ou une vidéo.
         */
        const task = uploadBytesResumable(ref(storage, prepared.path), file, { contentType: contentMime(file.name, file.type) });
        await new Promise<void>((resolve, reject) => {
          task.on(
            "state_changed",
            (snap) => progress(index, { percent: snap.totalBytes ? Math.round((snap.bytesTransferred / snap.totalBytes) * 100) : 0 }),
            reject,
            resolve,
          );
        });
      } catch (e) {
        progress(index, { error: uploadError(e) });
        continue;
      }
      const result = await confirmDeliverableAction(campaignId, prepared.id, file.name);
      if (!result.ok) progress(index, { error: result.error });
      else progress(index, { percent: 100 });
    }

    setBusy(false);
    /* Les lignes en échec restent affichées : elles disent lesquelles reprendre. */
    setPending((list) => list.filter((p) => p.error));
    if (input.current) input.current.value = "";
    router.refresh();
  }

  async function remove(item: Deliverable) {
    if (!confirm(`Retirer ${item.filename} ? Le fichier est effacé du coffre.`)) return;
    const form = new FormData();
    form.set("id", item.id);
    const result = await deleteDeliverableAction(form);
    if (!result.ok) setError(result.error);
    router.refresh();
  }

  function dropped(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragging(false);
    void send(e.dataTransfer.files);
  }

  return (
    <div className="flex flex-col gap-3">
      {/* ---------- Ce qui manque ---------- */}
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-[0.8125rem] font-extrabold">
          {missing.agreed ? progressLabel(expected, received) : `${items.length} fichier${items.length > 1 ? "s" : ""} au dossier`}
        </span>
        <span
          className={`rounded-pill px-2.5 py-1 text-[0.6875rem] font-bold ${missing.done ? "bg-tint-green text-tint-green-ink" : missing.agreed ? "bg-tint-sand text-tint-sand-ink" : "bg-paper text-subtle"}`}
        >
          {shortfallLabel(missing)}
        </span>
      </div>
      {!missing.agreed && (
        <p className="-mt-1 text-[0.6875rem] leading-relaxed text-subtle">
          Indiquez à gauche combien de photos et de vidéos sont attendues : le décompte se fera tout seul, ici comme sur
          la vignette de la campagne.
        </p>
      )}

      {/* ---------- Déposer ---------- */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={dropped}
        className={`flex flex-col items-center gap-1 rounded-card border-2 border-dashed p-5 text-center transition-colors ${dragging ? "border-ink bg-paper" : "border-line"}`}
      >
        <button
          type="button"
          disabled={busy}
          onClick={() => input.current?.click()}
          className="cursor-pointer rounded-pill bg-ink px-4 py-2 text-xs font-bold text-on-deep disabled:opacity-50"
        >
          {busy ? "Envoi en cours…" : "Déposer des fichiers"}
        </button>
        <span className="text-[0.6875rem] leading-relaxed text-subtle">
          Photos et vidéos, glissées ou choisies · {Math.round(MAX_CONTENT_BYTES / 1024 / 1024)} Mo par fichier au plus.
          Elles vont dans un dossier privé : rien n&apos;en paraît sur le site.
        </span>
        <input ref={input} type="file" multiple accept={ACCEPTED_CONTENT} className="hidden" onChange={(e) => void send(e.target.files)} />
      </div>

      {error && <p className="text-[0.6875rem] font-semibold text-accent">{error}</p>}

      {pending.length > 0 && (
        <ul className="flex flex-col gap-1.5">
          {pending.map((p) => (
            <li key={p.name} className="flex items-center justify-between gap-3 rounded-xl bg-paper px-3 py-2 text-[0.6875rem]">
              <span className="min-w-0 truncate font-semibold">{p.name}</span>
              <span className={`shrink-0 font-bold ${p.error ? "text-accent" : "text-subtle"}`}>{p.error ?? `${p.percent} %`}</span>
            </li>
          ))}
        </ul>
      )}

      {/* ---------- Ce qui est arrivé ---------- */}
      {items.length === 0 ? (
        <p className="text-[0.8125rem] text-subtle">Rien reçu pour l&apos;instant.</p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {items.map((item) => (
            <li key={item.id} className="flex flex-col gap-2 rounded-xl bg-paper px-3 py-2.5">
              <div className="flex items-center gap-2">
                <span className={`shrink-0 rounded-lg px-2 py-1 text-[0.625rem] font-bold ${TONE[item.kind]}`}>{KIND[item.kind]}</span>
                <span className="min-w-0 flex-1 truncate text-[0.75rem] font-semibold">{item.filename}</span>
                <span className="shrink-0 text-[0.625rem] text-subtle">{fileSizeLabel(item.size)}</span>
              </div>
              <div className="flex flex-wrap items-center gap-3 text-[0.625rem] font-bold">
                {/* Chargé seulement si on l'ouvre : vingt photos en vignettes, ce serait
                    vingt fichiers entiers tirés du coffre à chaque visite de la page. */}
                <button type="button" onClick={() => setOpen(open === item.id ? "" : item.id)} className="cursor-pointer underline">
                  {open === item.id ? "Replier" : "Regarder"}
                </button>
                <a href={`/api/contenus/${item.id}`} target="_blank" rel="noreferrer" className="underline">
                  Ouvrir
                </a>
                <button type="button" onClick={() => void remove(item)} className="cursor-pointer text-accent underline">
                  Retirer
                </button>
                <span className="ml-auto font-semibold text-subtle">
                  {new Date(item.receivedAt).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "2-digit" })}
                </span>
              </div>
              {open === item.id &&
                (item.kind === "photo" ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={`/api/contenus/${item.id}`} alt={item.filename} className="max-h-72 w-full rounded-lg object-contain" />
                ) : (
                  <video src={`/api/contenus/${item.id}`} controls preload="metadata" className="max-h-72 w-full rounded-lg bg-deep" />
                ))}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

"use client";

import { ref, uploadBytesResumable } from "firebase/storage";
import { useRouter } from "next/navigation";
import { useRef, useState, type DragEvent } from "react";
import { confirmDeliverableAction, deleteDeliverableAction, prepareDeliverableAction, publishDeliverableAction } from "@/lib/admin/actions/deliverables";
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

/*
 * Combien de pavés avant de demander la suite. Assez pour voir où l'on en est, pas
 * assez pour que la carte devienne un couloir : cent fichiers remis d'un coup, ce qui
 * est le cas ordinaire d'une campagne qui se termine, tiendraient autrement sur plus de
 * deux écrans.
 */
const PAGE = 24;

const FILTERS = [
  { kind: "all" as const, label: "Tout" },
  { kind: "photo" as const, label: "Photos" },
  { kind: "video" as const, label: "Vidéos" },
];

type Pending = { name: string; percent: number; error?: string };

export function DeliverablesPanel({ campaignId, bucket, items, expected }: { campaignId: string; bucket: string; items: Deliverable[]; expected: ContentQuota }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<Pending[]>([]);
  const [error, setError] = useState("");
  const [dragging, setDragging] = useState(false);
  const [open, setOpen] = useState("");
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState<"all" | "photo" | "video">("all");
  const [all, setAll] = useState(false);

  const received = tallyContents(items);
  const missing = shortfall(expected, received);
  const shown = filter === "all" ? items : items.filter((i) => i.kind === filter);
  const visible = all ? shown : shown.slice(0, PAGE);
  /* Ce qu'on regarde se cherche dans la liste ENTIÈRE, et non dans la page affichée :
     replier le « voir plus » ne doit pas faire disparaître l'aperçu ouvert. */
  const current = items.find((i) => i.id === open);

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

  /*
   * Verse un fichier dans la médiathèque, pour qu'il puisse paraître sur le site.
   *
   * Fichier par fichier, et jamais d'office : le dossier d'une campagne est privé, la
   * médiathèque est publique, et tout ce qu'un partenaire remet n'est pas destiné à
   * paraître. Cent fichiers déversés d'un coup rendraient d'ailleurs la médiathèque
   * aussi illisible que l'était cette liste.
   */
  async function publish(item: Deliverable) {
    setBusy(true);
    setError("");
    const form = new FormData();
    form.set("id", item.id);
    const result = await publishDeliverableAction(form);
    setBusy(false);
    if (!result.ok) setError(result.error);
    router.refresh();
  }

  async function remove(item: Deliverable) {
    if (!confirm(`Retirer ${item.filename} ? Le fichier est effacé du coffre.`)) return;
    const form = new FormData();
    form.set("id", item.id);
    const result = await deleteDeliverableAction(form);
    if (!result.ok) setError(result.error);
    setOpen("");
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
          La quantité attendue s&apos;écrit sur le contrat, dans /admin/contrats : toutes ses campagnes en héritent, et
          le décompte se fait tout seul — ici comme sur la vignette de la campagne.
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
          Elles vont dans un dossier privé : rien n&apos;en paraît sur le site tant qu&apos;on ne l&apos;a pas envoyé
          dans la médiathèque.
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
      {/*
        Une GRILLE, et un seul aperçu à la fois.
        En liste, cent fichiers faisaient cent lignes qu'il fallait dérouler jusqu'au
        bout. En vignettes, ils feraient cent fichiers ENTIERS tirés du coffre à chaque
        visite : il n'existe pas de miniature, `/api/contenus/<id>` sert l'original.
        D'où des pavés sans image, serrés, et l'aperçu du seul qu'on ouvre — en dessous,
        une fois. Les premiers {PAGE} suffisent à voir où l'on en est ; le reste se
        demande.
      */}
      {items.length === 0 ? (
        <p className="text-[0.8125rem] text-subtle">Rien reçu pour l&apos;instant.</p>
      ) : (
        <div className="flex flex-col gap-2 border-t border-line-soft pt-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-[0.6875rem] font-bold uppercase tracking-[0.08em] text-faint">Au dossier</span>
            <div className="flex gap-1">
              {FILTERS.map((f) => (
                <button
                  key={f.kind}
                  type="button"
                  onClick={() => {
                    setFilter(f.kind);
                    setAll(false);
                  }}
                  className={`cursor-pointer rounded-pill px-2.5 py-1 text-[0.625rem] font-bold ${filter === f.kind ? "bg-ink text-on-deep" : "bg-paper text-subtle"}`}
                >
                  {f.label} {f.kind === "all" ? items.length : f.kind === "photo" ? received.photos : received.videos}
                </button>
              ))}
            </div>
          </div>

          <ul className="grid grid-cols-3 gap-1.5 max-[1199px]:grid-cols-2 max-[899px]:grid-cols-3 max-[599px]:grid-cols-2">
            {visible.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => setOpen(open === item.id ? "" : item.id)}
                  className={`flex w-full cursor-pointer flex-col gap-1 rounded-xl px-2.5 py-2 text-left transition-opacity hover:opacity-70 ${open === item.id ? "bg-ink text-on-deep" : "bg-paper"}`}
                >
                  <span className="flex items-center gap-1.5">
                    <span className={`shrink-0 rounded-md px-1.5 py-0.5 text-[0.5625rem] font-bold ${open === item.id ? "bg-white/15" : TONE[item.kind]}`}>
                      {KIND[item.kind]}
                    </span>
                    {item.mediaId && (
                      <span title="Déjà dans la médiathèque" className="shrink-0 text-[0.5625rem] font-bold opacity-70">
                        ↗
                      </span>
                    )}
                    <span className={`ml-auto shrink-0 text-[0.5625rem] ${open === item.id ? "opacity-70" : "text-subtle"}`}>{fileSizeLabel(item.size)}</span>
                  </span>
                  <span className="truncate text-[0.6875rem] font-semibold">{item.filename}</span>
                </button>
              </li>
            ))}
          </ul>

          {!all && shown.length > PAGE && (
            <button
              type="button"
              onClick={() => setAll(true)}
              className="cursor-pointer rounded-pill bg-paper px-3 py-2 text-[0.6875rem] font-bold hover:opacity-70"
            >
              Afficher les {shown.length - PAGE} autres
            </button>
          )}

          {/* L'aperçu de celui qu'on a ouvert : un seul fichier tiré du coffre, le sien. */}
          {current && (
            <div className="flex flex-col gap-2 rounded-card bg-paper p-3">
              {current.kind === "photo" ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={`/api/contenus/${current.id}`} alt={current.filename} className="max-h-80 w-full rounded-lg object-contain" />
              ) : (
                <video src={`/api/contenus/${current.id}`} controls preload="metadata" className="max-h-80 w-full rounded-lg bg-deep" />
              )}
              <span className="truncate text-[0.75rem] font-semibold">{current.filename}</span>
              <div className="flex flex-wrap items-center gap-3 text-[0.625rem] font-bold">
                <a href={`/api/contenus/${current.id}`} target="_blank" rel="noreferrer" className="underline">
                  Ouvrir
                </a>
                {/*
                  Le dossier d'une campagne est privé, la médiathèque est publique : y
                  verser un fichier se décide, fichier par fichier. Une fois versé, il
                  est partout où l'on choisit une image — blocs de page, fiche produit.
                */}
                {current.mediaId ? (
                  <span className="text-tint-green-ink">Dans la médiathèque</span>
                ) : (
                  <button type="button" disabled={busy} onClick={() => void publish(current)} className="cursor-pointer underline disabled:opacity-50">
                    Envoyer dans la médiathèque
                  </button>
                )}
                <button type="button" onClick={() => void remove(current)} className="cursor-pointer text-accent underline">
                  Retirer
                </button>
                <span className="ml-auto font-semibold text-subtle">
                  {new Date(current.receivedAt).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "2-digit" })}
                </span>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

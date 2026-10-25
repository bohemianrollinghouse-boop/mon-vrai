"use client";

import { ref, uploadBytesResumable } from "firebase/storage";
import { useRouter } from "next/navigation";
import { useRef, useState, type FormEvent, type ReactNode } from "react";
import { confirmDocumentAction, prepareDocumentAction } from "@/lib/admin/actions/documents";
import type { AdminResult } from "@/lib/admin/types";
import { clientAuth, clientStorage } from "@/lib/firebase/client";
import { documentMime, MAX_DOC_BYTES } from "@/lib/domain/documents";
import { Button } from "./ui";
import { Field } from "./Field";
import { IssuesContext } from "./issues-context";
import { Toast } from "./Toast";

/*
 * Le dépôt d'une pièce administrative : le fichier va DROIT au coffre, les
 * métadonnées passent par une action serveur.
 *
 * Pourquoi ce détour plutôt qu'un <ActionForm> ordinaire : une action serveur tient le
 * fichier entier dans la mémoire d'une instance qui n'a qu'un gigaoctet, et le traverse
 * trois fois (corps de la requête, `arrayBuffer`, `Buffer`). Un rapport de laboratoire
 * scanné de dix-sept mégaoctets la tuait — page d'erreur nue, rien enregistré, et pas
 * même un message, puisque le processus n'était plus là pour en rendre un. Les contenus
 * de partenaires avaient déjà imposé ce détour (DeliverablesPanel) ; les pièces
 * administratives le méritaient autant.
 *
 * Trois temps, donc, et rien en base entre les deux premiers : « préparer » donne
 * l'endroit exact, le navigateur dépose, « inscrire » fait relire au serveur le type et
 * la taille RÉELS de l'objet arrivé. Un envoi interrompu ne laisse aucune ligne.
 */

/* Les codes du coffre, traduits. Un `storage/unauthorized` ressemble sinon à une
   coupure réseau, alors qu'il manque un `firebase deploy --only storage`. */
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

const size = (bytes: number): string =>
  bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1).replace(".", ",")} Mo` : `${Math.max(1, Math.round(bytes / 1024))} ko`;

type Props = {
  /** Les champs de la fiche (titre, nature, dates…), postés avec l'inscription. */
  children: ReactNode;
  accept: string;
  fileHint: string;
  submitLabel?: string;
  submitTone?: "primary" | "secondary";
  footerNote?: ReactNode;
  /*
   * Ce qu'on fait de la pièce une fois déposée, quand le dépôt a lieu quelque part où
   * la réponse est connue d'avance — sur la fiche d'un contrat, elle en devient
   * l'annexe. Action serveur déjà liée à sa cible par la page.
   */
  then?: (documentId: string) => Promise<AdminResult>;
};

export function DocumentDeposit({ children, accept, fileHint, submitLabel = "Déposer", submitTone = "primary", footerNote, then: andThen }: Props) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [percent, setPercent] = useState(0);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [issues, setIssues] = useState<Record<string, string>>({});

  const tooBig = file !== null && file.size > MAX_DOC_BYTES;

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    setNotice(null);
    setIssues({});

    if (!file) {
      setIssues({ file: "Fichier requis" });
      setNotice({ tone: "error", text: "Choisissez un fichier." });
      return;
    }
    if (tooBig) {
      setNotice({ tone: "error", text: `Trop lourd : ${Math.round(MAX_DOC_BYTES / 1024 / 1024)} Mo au maximum.` });
      return;
    }

    setBusy(true);
    setPercent(0);

    /*
     * Le dépôt direct a besoin d'une session Firebase vivante dans CE navigateur : les
     * règles du coffre lisent le jeton, pas le cookie de session. Le dire franchement
     * vaut mieux qu'un « permission refusée » à mi-envoi.
     *
     * `authStateReady()` et non `currentUser` tout de suite : le SDK restaure la session
     * depuis le stockage du navigateur de façon ASYNCHRONE, et `currentUser` vaut `null`
     * tant que ce n'est pas fait. Lu trop tôt, il fait dire « reconnectez-vous » à
     * quelqu'un qui est parfaitement connecté — ce qui est exactement arrivé.
     */
    const auth = clientAuth();
    await auth.authStateReady();
    if (!auth.currentUser) {
      setBusy(false);
      setNotice({ tone: "error", text: "Votre session s'est interrompue dans ce navigateur : reconnectez-vous avant de déposer." });
      return;
    }

    const prepared = await prepareDocumentAction(file.name, file.type);
    if (!prepared.ok) {
      setBusy(false);
      setIssues({ file: "Fichier refusé" });
      setNotice({ tone: "error", text: prepared.error });
      return;
    }

    try {
      /* Le type est posé explicitement : Windows livre régulièrement un PDF avec un
         `type` vide, que le coffre rangerait en « octet-stream » — refusé par les
         règles, et impossible à qualifier ensuite. */
      const task = uploadBytesResumable(ref(clientStorage(prepared.bucket), prepared.path), file, {
        contentType: documentMime(file.name, file.type),
      });
      await new Promise<void>((resolve, reject) => {
        task.on(
          "state_changed",
          (snap) => setPercent(snap.totalBytes ? Math.round((snap.bytesTransferred / snap.totalBytes) * 100) : 0),
          reject,
          resolve,
        );
      });
    } catch (err) {
      setBusy(false);
      setNotice({ tone: "error", text: `${file.name} : ${uploadError(err)}` });
      return;
    }

    const result = await confirmDocumentAction(prepared.id, file.name, new FormData(form));

    if (!result.ok) {
      setBusy(false);
      setIssues(result.issues ?? {});
      setNotice({ tone: "error", text: result.error });
      return;
    }

    /*
     * La pièce est en bibliothèque. Reste à en faire ce pour quoi on l'a déposée — sur
     * la fiche d'un contrat, son annexe. Un échec ici ne remet pas le dépôt en cause :
     * la pièce est bien arrivée, et le dire autrement serait mentir.
     */
    const after = andThen ? await andThen(result.id) : null;
    setBusy(false);

    /* Le formulaire se vide : la pièce suivante ne doit pas hériter du titre de la
       précédente, qui serait recopié sans qu'on y pense. */
    form.reset();
    setFile(null);
    setPercent(0);
    setNotice(
      after && !after.ok
        ? { tone: "error", text: `${result.message} En revanche, ${after.error}` }
        : { tone: "ok", text: after?.ok ? after.message ?? result.message : result.message },
    );
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-5">
      {notice && <Toast tone={notice.tone} message={notice.text} onClose={() => setNotice(null)} />}

      <IssuesContext.Provider value={issues}>
        <div className="flex flex-col gap-2">
          <Field label="Fichier" hint={fileHint} name="file">
            <input
              ref={input}
              type="file"
              accept={accept}
              className="text-sm"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          </Field>
          {file && (
            <span className={`text-[0.6875rem] font-semibold ${tooBig ? "text-danger" : "text-subtle"}`}>
              {file.name} · {size(file.size)}
              {tooBig && ` — trop lourd : ${Math.round(MAX_DOC_BYTES / 1024 / 1024)} Mo au maximum.`}
            </span>
          )}
          {busy && <span className="text-[0.6875rem] font-bold text-subtle">Envoi… {percent} %</span>}
        </div>

        {children}
      </IssuesContext.Provider>

      <div className="flex flex-wrap items-center justify-end gap-3">
        {footerNote && <span className="mr-auto text-[0.6875rem] leading-relaxed text-subtle">{footerNote}</span>}
        <Button type="submit" tone={submitTone} disabled={busy || tooBig}>
          {busy ? "Envoi en cours…" : submitLabel}
        </Button>
      </div>
    </form>
  );
}

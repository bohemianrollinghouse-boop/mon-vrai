"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

/*
 * Les morceaux interactifs de /admin/facebook : copier (un message, la clé, le prompt),
 * voir un message, et la fenêtre de détail des clics. Tout ce qui se calcule — le lien
 * de suivi glissé à la place de {lien}, le prompt avec la clé — l'est côté serveur ;
 * ces composants ne font que copier et afficher ce qu'on leur donne.
 */

const pill = "inline-flex items-center justify-center whitespace-nowrap rounded-pill px-3 py-2 text-[0.6875rem] font-bold transition-opacity disabled:opacity-40";

function useCopy(): [string | null, (key: string, text: string) => void] {
  const [done, setDone] = useState<string | null>(null);
  const copy = (key: string, text: string) => {
    navigator.clipboard?.writeText(text).then(() => {
      setDone(key);
      setTimeout(() => setDone((d) => (d === key ? null : d)), 1600);
    });
  };
  return [done, copy];
}

/** « Voir le message » et « Copier le message », côte à côte. `text` est le message final, lien en place. */
export function FbMessageButtons({ text, groupName }: { text: string | null; groupName: string }) {
  const [open, setOpen] = useState(false);
  const [done, copy] = useCopy();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  if (!text) return <span className="text-xs font-semibold text-faint">Message à rédiger</span>;

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={`${pill} bg-paper hover:opacity-70`}>
        Voir le message
      </button>
      <button type="button" onClick={() => copy("msg", text)} className={`${pill} bg-ink text-on-ink hover:opacity-80`}>
        {done === "msg" ? "Copié ✓" : "Copier le message"}
      </button>
      {open &&
        createPortal(
          <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-5" onClick={(e) => e.target === e.currentTarget && setOpen(false)}>
            <div role="dialog" aria-modal="true" aria-label={`Message pour ${groupName}`} className="flex max-h-[85vh] w-full max-w-[640px] flex-col gap-4 rounded-card bg-surface p-6 text-ink shadow-2xl">
              <div className="flex items-baseline justify-between gap-3">
                <h2 className="text-base font-extrabold">Message pour « {groupName} »</h2>
                <button type="button" onClick={() => setOpen(false)} aria-label="Fermer" className="text-lg leading-none text-subtle hover:text-ink">
                  ×
                </button>
              </div>
              <p className="overflow-y-auto whitespace-pre-wrap rounded-[14px] bg-paper p-4 text-[0.8125rem] leading-relaxed">{text}</p>
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs font-semibold text-subtle">{text.length} caractères · lien de suivi du groupe en place</span>
                <button type="button" onClick={() => copy("msg", text)} className={`${pill} bg-ink px-4 py-2.5 text-on-ink hover:opacity-80`}>
                  {done === "msg" ? "Copié ✓" : "Copier le message"}
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}

/** Un bouton qui copie un texte donné (lien de suivi, clé, prompt). */
export function FbCopy({ text, label, tone = "paper" }: { text: string; label: string; tone?: "paper" | "ink" | "surface" }) {
  const [done, copy] = useCopy();
  const cls = tone === "ink" ? "bg-ink text-on-ink hover:opacity-80" : tone === "surface" ? "bg-surface hover:opacity-70" : "bg-paper hover:opacity-70";
  return (
    <button type="button" onClick={() => copy("x", text)} className={`${pill} ${cls}`}>
      {done === "x" ? "Copié ✓" : label}
    </button>
  );
}

/** La clé, masquée, qu'on peut afficher un instant. */
export function FbKeyField({ apiKey }: { apiKey: string }) {
  const [shown, setShown] = useState(false);
  const masked = `${apiKey.slice(0, 6)}${"•".repeat(16)}${apiKey.slice(-4)}`;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <code className="min-w-0 flex-1 truncate rounded-[12px] bg-paper px-3.5 py-2.5 text-xs font-bold">{shown ? apiKey : masked}</code>
      <button type="button" onClick={() => setShown((s) => !s)} className={`${pill} bg-paper hover:opacity-70`}>
        {shown ? "Masquer" : "Afficher"}
      </button>
      <FbCopy text={apiKey} label="Copier la clé" />
    </div>
  );
}

/**
 * Fenêtre de détail (statistiques d'un groupe), rendue par la page serveur quand
 * l'adresse porte `?stats=<slug>`. Fermer, c'est revenir à l'adresse sans ce paramètre :
 * le détail se partage et survit à un rechargement, et il n'y a aucun état à tenir.
 */
export function FbModal({ closeHref, title, children, footer }: { closeHref: string; title: ReactNode; children: ReactNode; footer?: ReactNode }) {
  const router = useRouter();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && router.replace(closeHref, { scroll: false });
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [closeHref, router]);

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-5">
      <Link href={closeHref} scroll={false} replace aria-label="Fermer" className="absolute inset-0 bg-black/40" />
      <div role="dialog" aria-modal="true" className="relative flex max-h-[90vh] w-full max-w-[880px] flex-col overflow-hidden rounded-card bg-surface text-ink shadow-2xl">
        <div className="flex items-baseline justify-between gap-3 border-b border-line-soft px-6 py-4">
          <h2 className="truncate text-base font-extrabold">{title}</h2>
          <Link href={closeHref} scroll={false} replace aria-label="Fermer" className="text-lg leading-none text-subtle hover:text-ink">
            ×
          </Link>
        </div>
        <div className="overflow-y-auto px-6 py-5">{children}</div>
        {footer && <div className="flex flex-wrap items-center gap-3 border-t border-line-soft px-6 py-3.5">{footer}</div>}
      </div>
    </div>
  );
}

/* ---------- Le lien du post, saisi sur la ligne ---------- */

/**
 * Champ du lien du post, enregistré en quittant le champ (ou par Entrée) : le formulaire
 * englobant (un ActionForm) porte l'action. Rien ne part si la valeur n'a pas changé,
 * pour qu'un simple passage dans le champ ne déclenche pas d'enregistrement.
 */
export function FbPostInput({ initial }: { initial: string }) {
  return (
    <input
      name="postUrl"
      defaultValue={initial}
      key={initial}
      placeholder="Lien de mon post dans le groupe"
      autoComplete="off"
      aria-label="Lien du post publié"
      onBlur={(e) => {
        // La clé remonte le champ quand le serveur change la valeur : `initial` est donc toujours à jour.
        if (e.currentTarget.value.trim() === initial) return;
        e.currentTarget.form?.requestSubmit();
      }}
      onKeyDown={(e) => {
        if (e.key !== "Enter") return;
        e.preventDefault();
        e.currentTarget.blur();
      }}
      className="w-full min-w-[260px] rounded-lg border border-line bg-surface px-2.5 py-2 text-xs font-semibold outline-none placeholder:font-medium placeholder:text-faint focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ink"
    />
  );
}

/* ---------- Le script Tampermonkey de COBA ---------- */

/*
 * Le relevé des posts (état, réactions, commentaires) passe par le script Tampermonkey
 * de COBA — le même, servi par l'admin de COBA et autorisé sur monvrai.fr/admin. La
 * page lui envoie la liste des posts (`postMessage {cobaFbg: 'scan'}`), il ouvre chacun
 * dans un onglet en arrière-plan, le lit et rend le relevé (`{cobaFbg: 'result'}`) ;
 * c'est la page, connectée, qui l'enregistre. Le script signale sa présence par
 * `<html data-coba-fbg-script="<version>">`, posé avant même le chargement de la page.
 */
export const COBA_USERSCRIPT_URL = "https://europe-west1-traveloc.cloudfunctions.net/admin/fb-groups-userscript.user.js";

type ScanCtx = { scanning: Set<string>; scan: (posts: { id: string; url: string }[]) => void };
const ScanContext = createContext<ScanCtx | null>(null);

export function FbScanProvider({ children, record }: { children: ReactNode; record: (slug: string, releve: unknown) => Promise<{ ok: boolean; error?: string }> }) {
  const router = useRouter();
  const [scanning, setScanning] = useState<Set<string>>(new Set());
  const [status, setStatus] = useState<ReactNode>(null);
  const progress = useRef({ total: 0, done: 0, acked: false });

  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      // L'origine et non `e.source` : le script parle depuis le bac à sable de Tampermonkey.
      if (e.origin !== window.location.origin || !e.data || e.data.kind === "conversation") return;
      if (e.data.cobaFbg === "started") {
        progress.current.acked = true;
        return;
      }
      if (e.data.cobaFbg !== "result" || typeof e.data.id !== "string") return;
      const { id, releve, reste } = e.data as { id: string; releve: unknown; reste: number };
      const p = progress.current;
      p.done++;
      setStatus(reste ? `Relevé : ${p.done} / ${p.total}…` : `Relevé terminé (${p.done} post${p.done > 1 ? "s" : ""}).`);
      if (!reste) Object.assign(p, { total: 0, done: 0 });
      record(id, releve ?? {}).then((r) => {
        setScanning((s) => {
          const n = new Set(s);
          n.delete(id);
          return n;
        });
        if (!r.ok) setStatus(`Relevé de ${id} non enregistré : ${r.error}`);
        router.refresh();
      });
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [record, router]);

  const scan = (posts: { id: string; url: string }[]) => {
    if (!document.documentElement.getAttribute("data-coba-fbg-script")) {
      setStatus(
        <>
          Script Tampermonkey absent : <a href={COBA_USERSCRIPT_URL} target="_blank" rel="noreferrer" className="underline">l'installer</a>, puis recharger la page.
        </>,
      );
      return;
    }
    const todo = posts.filter((p) => !scanning.has(p.id));
    if (!todo.length) return;
    setScanning((s) => new Set([...s, ...todo.map((p) => p.id)]));
    const p = progress.current;
    p.total += todo.length;
    p.acked = false;
    setStatus(`Relevé : ${p.done} / ${p.total}…`);
    window.postMessage({ cobaFbg: "scan", posts: todo }, window.location.origin);
    setTimeout(() => {
      if (progress.current.acked) return;
      Object.assign(progress.current, { total: 0, done: 0 });
      setScanning(new Set());
      setStatus(
        <>
          Le script ne répond pas : <a href={COBA_USERSCRIPT_URL} target="_blank" rel="noreferrer" className="underline">mettez-le à jour</a> (1.5.0 ou plus), puis rechargez la page.
        </>,
      );
    }, 3000);
  };

  return (
    <ScanContext.Provider value={{ scanning, scan }}>
      {status && <p className="text-xs font-semibold text-subtle">{status}</p>}
      {children}
    </ScanContext.Provider>
  );
}

/** « Relever les posts » : tous ceux de la liste affichée. */
export function FbScanAll({ posts }: { posts: { id: string; url: string }[] }) {
  const ctx = useContext(ScanContext);
  return (
    <span className="flex items-center gap-2">
      <button type="button" disabled={!posts.length} onClick={() => ctx?.scan(posts)} title="Ouvre chacun de vos posts de la liste affichée sur Facebook (script Tampermonkey) et relève état, réactions et commentaires" className="rounded-pill bg-ink px-4 py-2.5 text-[0.8125rem] font-bold text-on-ink hover:opacity-80 disabled:opacity-40">
        Relever les posts{posts.length ? ` (${posts.length})` : ""}
      </button>
      <a href={COBA_USERSCRIPT_URL} target="_blank" rel="noreferrer" className="text-[0.6875rem] font-semibold text-subtle hover:underline">
        installer / mettre à jour le script
      </a>
    </span>
  );
}

/** « Vérifier » : un seul post. */
export function FbVerify({ id, url }: { id: string; url: string }) {
  const ctx = useContext(ScanContext);
  const busy = ctx?.scanning.has(id) ?? false;
  return (
    <button type="button" disabled={busy} onClick={() => ctx?.scan([{ id, url }])} className={`${pill} bg-paper hover:opacity-70`}>
      {busy ? "Vérification…" : "Vérifier"}
    </button>
  );
}

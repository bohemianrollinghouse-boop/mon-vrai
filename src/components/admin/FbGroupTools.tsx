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

/** Ce que le script reçoit ; `name` pour une conversation (`kind: 'staff'`). */
type Item = { id: string; url: string; name?: string; pid?: string };
/**
 * Une conversation à relire : le groupe, la personne (`staffKey`), l'adresse, et son nom, avec
 * lequel le script (1.8.0 et plus) retrouve la conversation chiffrée quand l'adresse notée est l'ancienne.
 */
export type StaffScanItem = { slug: string; key: string; url: string; name: string; profileUrl?: string | null };

/** L'identifiant Facebook tiré du lien de profil : le script vise ce résultat de recherche Messenger. */
function profileId(profileUrl: string | null | undefined): string {
  return String(profileUrl ?? "").match(/(?:profile\.php\?id=|\/user\/|\/people\/[^/]+\/)(\d{5,25})/)?.[1] ?? "";
}
type Kind = "post" | "group" | "staff";
type Result = { ok: boolean; error?: string };

type ScanCtx = {
  busy: (kind: Kind, id: string) => boolean;
  scanPosts: (items: Item[]) => void;
  scanMemberships: (items: Item[]) => void;
  scanStaff: (items: StaffScanItem[]) => void;
};
const ScanContext = createContext<ScanCtx | null>(null);

/** Le script installé est-il au moins en version `min` ? */
function scriptAtLeast(min: [number, number, number]): boolean {
  const v = (document.documentElement.getAttribute("data-coba-fbg-script") ?? "0").split(".").map(Number);
  for (let i = 0; i < 3; i++) if ((v[i] || 0) !== min[i]) return (v[i] || 0) > min[i];
  return true;
}

const MEMBERSHIP_WORDS: Record<string, string> = { none: "pas demandée", pending: "en attente", validated: "membre", refused: "refusée" };

/*
 * Trois relevés passent par le même script, et par ce même fournisseur :
 *  - les posts (`kind: 'post'`) : état, réactions, commentaires ;
 *  - la page du groupe (`kind: 'group'`, script 1.6.0) : notre adhésion. La fin dresse le
 *    bilan de ce qui a changé ;
 *  - la conversation avec un admin (`kind: 'staff'`, script 1.9.2 : il lit les conversations
 *    chiffrées ; quand l'adresse notée est l'ancienne `/messages/t/…` ou ne mène nulle part,
 *    il cherche la conversation au nom de la personne, visant l'identifiant tiré de son
 *    profil (`pid`), et rend l'adresse finale, que le serveur garde) : a-t-il répondu ? Le
 *    script ne connaît qu'un identifiant (`[\w-]+`) : on lui en donne un à nous, qui
 *    renvoie au groupe et à la personne.
 * Un résultat est compté quand il est ENREGISTRÉ, pas quand il arrive : le bilan attend
 * que tous les changements soient connus.
 */
export function FbScanProvider({
  children,
  record,
  recordMembership,
  recordStaffReply,
}: {
  children: ReactNode;
  record: (slug: string, releve: unknown) => Promise<Result>;
  recordMembership: (slug: string, releve: unknown) => Promise<Result & { name?: string; before?: string; after?: string }>;
  recordStaffReply: (slug: string, key: string, releve: unknown) => Promise<Result & { replied?: boolean; name?: string }>;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<Set<string>>(new Set());
  const [status, setStatus] = useState<ReactNode>(null);
  const progress = useRef<Record<Kind, { total: number; done: number; acked: boolean }>>({
    post: { total: 0, done: 0, acked: false },
    group: { total: 0, done: 0, acked: false },
    staff: { total: 0, done: 0, acked: false },
  });
  const changes = useRef<string[]>([]);
  const replies = useRef<string[]>([]);
  const staffIds = useRef(new Map<string, StaffScanItem>());
  const counter = useRef(0);

  useEffect(() => {
    const release = (key: string) =>
      setBusy((s) => {
        const n = new Set(s);
        n.delete(key);
        return n;
      });
    const finish = (kind: Kind, line: (done: number) => string, progressLine: (done: number, total: number) => string) => {
      const p = progress.current[kind];
      p.done++;
      if (p.done < p.total) {
        setStatus(progressLine(p.done, p.total));
        return;
      }
      setStatus(line(p.done));
      Object.assign(p, { total: 0, done: 0 });
      router.refresh();
    };

    const onMessage = (e: MessageEvent) => {
      // L'origine et non `e.source` : le script parle depuis le bac à sable de Tampermonkey.
      if (e.origin !== window.location.origin || !e.data || e.data.kind === "conversation") return;
      const kind: Kind = e.data.kind === "group" ? "group" : e.data.kind === "staff" ? "staff" : "post";
      if (e.data.cobaFbg === "started") {
        progress.current[kind].acked = true;
        return;
      }
      if (e.data.cobaFbg !== "result" || typeof e.data.id !== "string") return;
      const { id, releve } = e.data as { id: string; releve: unknown };

      if (kind === "group") {
        recordMembership(id, releve ?? {}).then((r) => {
          release(`group:${id}`);
          if (!r.ok) setStatus(`Adhésion de ${id} non enregistrée : ${r.error}`);
          else if (r.before !== r.after) changes.current.push(`${r.name} → ${MEMBERSHIP_WORDS[r.after ?? ""] ?? r.after}`);
          finish(
            "group",
            (n) => {
              const done = changes.current.splice(0);
              return `Adhésions vérifiées (${n} groupe${n > 1 ? "s" : ""}) : ${done.length ? done.join(", ") : "aucun changement"}.`;
            },
            (d, t) => `Adhésions : ${d} / ${t}…`,
          );
        });
        return;
      }

      if (kind === "staff") {
        const target = staffIds.current.get(id);
        staffIds.current.delete(id);
        if (!target) return;
        recordStaffReply(target.slug, target.key, releve ?? {}).then((r) => {
          release(`staff:${target.slug}|${target.key}`);
          if (!r.ok) setStatus(`Réponse non enregistrée : ${r.error}`);
          else if (r.replied && r.name) replies.current.push(r.name);
          finish(
            "staff",
            (n) => {
              const done = replies.current.splice(0);
              return `Conversations vérifiées (${n}) : ${done.length ? `à lire, ${done.join(", ")}` : "aucune réponse à lire"}.`;
            },
            (d, t) => `Réponses : ${d} / ${t}…`,
          );
        });
        return;
      }

      record(id, releve ?? {}).then((r) => {
        release(`post:${id}`);
        if (!r.ok) setStatus(`Relevé de ${id} non enregistré : ${r.error}`);
        finish(
          "post",
          (n) => `Relevé terminé (${n} post${n > 1 ? "s" : ""}).`,
          (d, t) => `Relevé : ${d} / ${t}…`,
        );
      });
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [record, recordMembership, recordStaffReply, router]);

  const updateLink = (
    <a href={COBA_USERSCRIPT_URL} target="_blank" rel="noreferrer" className="underline">
      le mettre à jour
    </a>
  );

  /** Envoie une liste au script, après avoir vérifié qu'il est là et assez récent. */
  const send = (kind: Kind, items: Item[], keys: string[], min: [number, number, number] | null, what: string, why?: string): boolean => {
    if (!document.documentElement.getAttribute("data-coba-fbg-script")) {
      setStatus(
        <>
          Script Tampermonkey absent : <a href={COBA_USERSCRIPT_URL} target="_blank" rel="noreferrer" className="underline">l'installer</a>, puis recharger la page.
        </>,
      );
      return false;
    }
    if (min && !scriptAtLeast(min)) {
      setStatus(
        <>
          {what} demande le script {min.join(".")} ou plus ({why ? `${why} ; ` : ""}installé : {document.documentElement.getAttribute("data-coba-fbg-script")}) : {updateLink}, puis recharger la page.
        </>,
      );
      return false;
    }
    if (!items.length) return false;
    setBusy((s) => new Set([...s, ...keys]));
    const p = progress.current[kind];
    p.total += items.length;
    p.acked = false;
    setStatus(`${what} : ${p.done} / ${p.total}…`);
    window.postMessage({ cobaFbg: "scan", kind, posts: items }, window.location.origin);
    setTimeout(() => {
      if (progress.current[kind].acked) return;
      Object.assign(progress.current[kind], { total: 0, done: 0 });
      setBusy((s) => new Set([...s].filter((k) => !k.startsWith(`${kind}:`))));
      if (kind === "staff") staffIds.current.clear();
      setStatus(<>Le script ne répond pas : {updateLink} ({(min ?? [1, 5, 0]).join(".")} ou plus), puis recharger la page.</>);
    }, 3000);
    return true;
  };

  const ctx: ScanCtx = {
    busy: (kind, id) => busy.has(`${kind}:${id}`),
    scanPosts: (items) => {
      const todo = items.filter((i) => !busy.has(`post:${i.id}`));
      send("post", todo, todo.map((i) => `post:${i.id}`), null, "Relevé");
    },
    scanMemberships: (items) => {
      const todo = items.filter((i) => !busy.has(`group:${i.id}`));
      send("group", todo, todo.map((i) => `group:${i.id}`), [1, 6, 0], "Vérifier les adhésions");
    },
    scanStaff: (items) => {
      const todo = items.filter((i) => !busy.has(`staff:${i.slug}|${i.key}`));
      const sent = todo.map((i) => ({ id: `st${++counter.current}`, url: i.url, name: i.name, pid: profileId(i.profileUrl) }));
      const ok = send("staff", sent, todo.map((i) => `staff:${i.slug}|${i.key}`), [1, 9, 2], "Vérifier les réponses des admins", "il lit les conversations chiffrées et retrouve celle d'un lien ancien ou introuvable");
      if (ok) sent.forEach((s, j) => staffIds.current.set(s.id, todo[j]));
    },
  };

  return (
    <ScanContext.Provider value={ctx}>
      {status && <p className="text-xs font-semibold text-subtle">{status}</p>}
      {children}
    </ScanContext.Provider>
  );
}

const bigButton = "rounded-pill px-4 py-2.5 text-[0.8125rem] font-bold disabled:opacity-40";

/** « Relever les posts » : tous ceux de la liste affichée. */
export function FbScanAll({ posts }: { posts: Item[] }) {
  const ctx = useContext(ScanContext);
  return (
    <button type="button" disabled={!posts.length} onClick={() => ctx?.scanPosts(posts)} title="Ouvre chacun de vos posts de la liste affichée sur Facebook (script Tampermonkey) et relève état, réactions et commentaires" className={`${bigButton} bg-ink text-on-ink hover:opacity-80`}>
      Relever les posts{posts.length ? ` (${posts.length})` : ""}
    </button>
  );
}

/** « Vérifier les adhésions » : les groupes affichés dont l'adhésion attend (ou a été refusée). */
export function FbScanMemberships({ groups }: { groups: Item[] }) {
  const ctx = useContext(ScanContext);
  return (
    <button
      type="button"
      disabled={!groups.length}
      onClick={() => ctx?.scanMemberships(groups)}
      title="Ouvre la page de chaque groupe affiché dont l'adhésion est en attente ou refusée (script Tampermonkey 1.6.0) et relève si elle est en attente, acceptée ou refusée. Pour un autre groupe : « Vérifier » sur sa ligne."
      className={`${bigButton} bg-surface hover:opacity-70`}
    >
      Vérifier les adhésions{groups.length ? ` (${groups.length})` : ""}
    </button>
  );
}

/** « Vérifier les réponses des admins » : chaque conversation notée dans les groupes affichés. */
export function FbScanStaffReplies({ items }: { items: StaffScanItem[] }) {
  const ctx = useContext(ScanContext);
  return (
    <button
      type="button"
      disabled={!items.length}
      onClick={() => ctx?.scanStaff(items)}
      title="Ouvre chaque conversation notée avec un admin ou un modérateur des groupes affichés (script Tampermonkey 1.9.2) et regarde s'il a répondu"
      className={`${bigButton} bg-surface hover:opacity-70`}
    >
      Vérifier les réponses des admins{items.length ? ` (${items.length})` : ""}
    </button>
  );
}

export function FbScriptLink() {
  return (
    <a href={COBA_USERSCRIPT_URL} target="_blank" rel="noreferrer" className="text-[0.6875rem] font-semibold text-subtle hover:underline">
      installer / mettre à jour le script
    </a>
  );
}

/** « Vérifier » : un seul post. */
export function FbVerify({ id, url }: { id: string; url: string }) {
  const ctx = useContext(ScanContext);
  const busy = ctx?.busy("post", id) ?? false;
  return (
    <button type="button" disabled={busy} onClick={() => ctx?.scanPosts([{ id, url }])} className={`${pill} bg-paper hover:opacity-70`}>
      {busy ? "Vérification…" : "Vérifier"}
    </button>
  );
}

/** « Vérifier » : l'adhésion d'un seul groupe. */
export function FbVerifyMembership({ id, url }: { id: string; url: string }) {
  const ctx = useContext(ScanContext);
  const busy = ctx?.busy("group", id) ?? false;
  return (
    <button type="button" disabled={busy} onClick={() => ctx?.scanMemberships([{ id, url }])} title="Ouvre la page du groupe sur Facebook (script Tampermonkey) et relève si notre adhésion est en attente, acceptée ou refusée" className={`${pill} bg-paper hover:opacity-70`}>
      {busy ? "Vérification…" : "Vérifier"}
    </button>
  );
}

/** « Vérifier » : la conversation avec une seule personne. */
export function FbVerifyStaff({ item }: { item: StaffScanItem }) {
  const ctx = useContext(ScanContext);
  const busy = ctx?.busy("staff", `${item.slug}|${item.key}`) ?? false;
  return (
    <button type="button" disabled={busy} onClick={() => ctx?.scanStaff([item])} title="Ouvre la conversation (script Tampermonkey) et regarde si la personne a répondu" className={`${pill} bg-paper hover:opacity-70`}>
      {busy ? "Vérification…" : "Vérifier"}
    </button>
  );
}

/* ---------- Les admins et modérateurs, saisis dans de vrais champs ---------- */

type StaffRow = { uid: number; name: string; role: "admin" | "moderator"; profileUrl: string; conversationUrl: string };

const field = "w-full min-w-0 rounded-lg border border-line bg-surface px-2.5 py-2 text-xs font-semibold outline-none placeholder:font-medium placeholder:text-faint focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ink";
const fieldLabel = "flex min-w-0 flex-col gap-1 text-[0.6875rem] font-bold text-subtle";

/*
 * Un bloc par personne : nom, lien du profil, rôle, lien de la conversation. Le message
 * envoyé, la date du contact et la réponse relevée n'y figurent pas, et le serveur les
 * garde (`mergeStaff`) : enregistrer la liste ne les efface pas. Un refus laisse la saisie
 * en place, à corriger, avec la personne fautive nommée.
 */
export function FbStaffEditor({
  slug,
  staff,
  save,
}: {
  slug: string;
  staff: { name: string; role: "admin" | "moderator"; profileUrl: string | null; conversationUrl?: string }[];
  save: (slug: string, rows: unknown) => Promise<Result>;
}) {
  const router = useRouter();
  const blank = (uid: number): StaffRow => ({ uid, name: "", role: "admin", profileUrl: "", conversationUrl: "" });
  const [rows, setRows] = useState<StaffRow[]>(() =>
    staff.length ? staff.map((p, i) => ({ uid: i, name: p.name, role: p.role, profileUrl: p.profileUrl ?? "", conversationUrl: p.conversationUrl ?? "" })) : [blank(0)],
  );
  const [state, setState] = useState<{ pending: boolean; error: string | null; done: boolean }>({ pending: false, error: null, done: false });
  const set = (uid: number, patch: Partial<StaffRow>) => setRows((rs) => rs.map((r) => (r.uid === uid ? { ...r, ...patch } : r)));

  const submit = () => {
    // Les blocs entièrement vides sont ignorés.
    const list = rows
      .filter((r) => r.name.trim() || r.profileUrl.trim() || r.conversationUrl.trim())
      .map(({ name, role, profileUrl, conversationUrl }) => ({ name, role, profileUrl, conversationUrl }));
    setState({ pending: true, error: null, done: false });
    save(slug, list).then((r) => {
      setState({ pending: false, error: r.ok ? null : (r.error ?? "Enregistrement refusé."), done: r.ok });
      if (r.ok) router.refresh();
    });
  };

  return (
    <div className="flex flex-col gap-2.5">
      {rows.map((r) => (
        <div key={r.uid} className="grid grid-cols-[minmax(120px,1.2fr)_minmax(160px,2fr)_130px_minmax(160px,2fr)_auto] items-end gap-2 rounded-[14px] border border-line-soft bg-surface p-2.5 max-[899px]:grid-cols-2">
          <label className={fieldLabel}>
            Nom
            <input value={r.name} onChange={(e) => set(r.uid, { name: e.target.value })} placeholder="Claire Martin" autoComplete="off" className={field} />
          </label>
          <label className={fieldLabel}>
            Lien du profil
            <input value={r.profileUrl} onChange={(e) => set(r.uid, { profileUrl: e.target.value })} placeholder="https://www.facebook.com/…" autoComplete="off" className={field} />
          </label>
          <label className={fieldLabel}>
            Rôle
            <select value={r.role} onChange={(e) => set(r.uid, { role: e.target.value as StaffRow["role"] })} className={`${field} cursor-pointer`}>
              <option value="admin">Admin</option>
              <option value="moderator">Modérateur</option>
            </select>
          </label>
          <label className={fieldLabel}>
            Lien de la conversation Messenger
            <input value={r.conversationUrl} onChange={(e) => set(r.uid, { conversationUrl: e.target.value })} placeholder="https://www.facebook.com/messages/t/…" autoComplete="off" className={field} />
          </label>
          <button type="button" onClick={() => setRows((rs) => rs.filter((x) => x.uid !== r.uid))} title="Retirer cette personne de la liste" className={`${pill} bg-paper text-danger hover:opacity-70`}>
            Retirer
          </button>
        </div>
      ))}
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => setRows((rs) => [...rs, blank(Math.max(-1, ...rs.map((x) => x.uid)) + 1)])} className={`${pill} bg-surface hover:opacity-70`}>
          + Ajouter une personne
        </button>
        <button type="button" disabled={state.pending} onClick={submit} className={`${pill} bg-ink text-on-ink hover:opacity-80`}>
          {state.pending ? "Enregistrement…" : "Enregistrer"}
        </button>
        <span className="text-[0.6875rem] font-semibold text-subtle">Nom et rôle obligatoires, liens facultatifs. Le message envoyé et la date du contact sont gardés.</span>
      </div>
      {state.error && <p className="text-xs font-bold text-danger">{state.error}</p>}
      {state.done && !state.error && <p className="text-xs font-bold text-tint-green-ink">Admins et modérateurs enregistrés.</p>}
    </div>
  );
}

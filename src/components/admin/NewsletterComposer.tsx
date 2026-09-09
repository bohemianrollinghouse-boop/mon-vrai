"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Input, Select } from "@/components/admin/ui";
import { saveNewsletterTemplateAction, sendNewsletterAction } from "@/lib/admin/actions/newsletter";
import { isValidHref, NEWSLETTER_TEMPLATES, renderTemplateBody, templateById, type Brand, type RenderCtx } from "@/lib/newsletter/render";
import type { AdminResult } from "@/lib/admin/types";

/*
 * Composeur de newsletter : on choisit un modèle (onglets), et on l'édite DIRECTEMENT
 * dans l'aperçu — chaque texte se modifie sur place (aucun champ, aucun éditeur riche),
 * chaque image se remplace via le petit crayon (sélection d'un fichier, recadrage centré),
 * chaque bouton garde son texte éditable et son lien se change via le petit 🔗 (le clic
 * sur un bouton ne navigue pas dans l'aperçu).
 * On enregistre, puis on envoie à l'audience choisie. Le gabarit reste fixe.
 *
 * L'aperçu éditable est injecté en HTML brut dans un conteneur et n'est PAS géré par React
 * (sinon le curseur sauterait à chaque frappe) : on relit le DOM (« scrape ») au moment de
 * changer d'onglet, d'enregistrer ou d'envoyer.
 */
type ProductOpt = { slug: string; title: string };
type Values = Record<string, string>;
type AudienceKind = "one" | "all" | "buyers" | "product";

export function NewsletterComposer({
  saved,
  products,
  adminEmail,
  counts,
  brand,
  base,
}: {
  saved: Record<string, Values>;
  products: ProductOpt[];
  adminEmail: string;
  counts: { all: number; buyers: number };
  brand: Brand;
  base: string;
}) {
  const [templateId, setTemplateId] = useState(NEWSLETTER_TEMPLATES[0].id);
  const [subjects, setSubjects] = useState<Record<string, string>>(() => {
    const s: Record<string, string> = {};
    for (const t of NEWSLETTER_TEMPLATES) s[t.id] = saved[t.id]?.subject ?? t.subject;
    return s;
  });
  const [kind, setKind] = useState<AudienceKind>("one");
  const [slug, setSlug] = useState(products[0]?.slug ?? "");
  const [email, setEmail] = useState(adminEmail);
  const [message, setMessage] = useState<AdminResult | null>(null);
  const [uploading, setUploading] = useState(false);
  // Édition du lien d'un bouton : petite fenêtre positionnée sous le bouton 🔗 cliqué.
  const [linkEdit, setLinkEdit] = useState<{ key: string; href: string; top: number; left: number } | null>(null);
  const [pending, start] = useTransition();

  // Valeurs éditées (textes + images) par modèle, dans un objet mutable hors React : on le
  // modifie sans re-render pour ne pas faire sauter le curseur de l'aperçu. Initialisé
  // paresseusement (jamais pendant le rendu ; seulement depuis les effets/gestionnaires).
  const storeRef = useRef<Record<string, Values> | null>(null);
  const getStore = (): Record<string, Values> => {
    if (storeRef.current === null) {
      const s: Record<string, Values> = {};
      for (const t of NEWSLETTER_TEMPLATES) {
        const rest = { ...(saved[t.id] ?? {}) };
        delete rest.subject;
        s[t.id] = rest;
      }
      storeRef.current = s;
    }
    return storeRef.current;
  };

  const container = useRef<HTMLDivElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const currentKey = useRef<string>("");

  const renderInto = (id: string) => {
    if (!container.current) return;
    const ctx: RenderCtx = { mode: "edit", base, unsub: "#", brand, values: getStore()[id] ?? {} };
    container.current.innerHTML = renderTemplateBody(id, ctx);
  };

  const scrape = (id: string) => {
    const el = container.current;
    if (!el) return;
    const vals: Values = { ...(getStore()[id] ?? {}) };
    el.querySelectorAll<HTMLElement>('[contenteditable="true"][data-k]').forEach((node) => {
      vals[node.dataset.k as string] = node.innerText.replace(/ /g, " ").replace(/\n{3,}/g, "\n\n").replace(/[ \t]+$/gm, "").trim();
    });
    el.querySelectorAll<HTMLAnchorElement>("a[data-href-k]").forEach((a) => {
      const href = a.getAttribute("href") ?? "";
      if (href) vals["href:" + (a.dataset.hrefK as string)] = href;
    });
    el.querySelectorAll<HTMLImageElement>("img[data-img][data-k]").forEach((img) => {
      const src = img.getAttribute("src") ?? "";
      const key = "img:" + (img.dataset.k as string);
      if (src && !src.startsWith("data:")) vals[key] = src;
      else delete vals[key];
    });
    getStore()[id] = vals;
  };

  // (Re)rend l'aperçu quand on change de modèle.
  useEffect(() => {
    renderInto(templateId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [templateId]);

  // Clic sur un crayon → sélecteur de fichier ; collage → texte brut.
  useEffect(() => {
    const el = container.current;
    if (!el) return;
    const onClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      // Bouton 🔗 : ouvrir l'édition du lien du bouton voisin.
      const linkBtn = target.closest<HTMLElement>(".nl-linkbtn");
      if (linkBtn) {
        e.preventDefault();
        const key = linkBtn.dataset.k ?? "";
        const anchor = el.querySelector<HTMLAnchorElement>(`a[data-href-k="${CSS.escape(key)}"]`);
        // Fenêtre centrée sous le bouton, sans sortir de l'écran.
        const r = (anchor ?? linkBtn).getBoundingClientRect();
        setLinkEdit({ key, href: anchor?.getAttribute("href") ?? "", top: r.bottom + 10, left: Math.max(12, Math.min(r.left + r.width / 2 - 170, window.innerWidth - 352)) });
        return;
      }
      // Un bouton de l'aperçu ne doit pas naviguer : on édite son texte comme les autres.
      if (target.closest("a")) e.preventDefault();
      const btn = target.closest(".nl-pencil");
      if (!btn) return;
      e.preventDefault();
      currentKey.current = (btn as HTMLElement).dataset.k ?? "";
      if (fileInput.current) {
        fileInput.current.value = "";
        fileInput.current.click();
      }
    };
    const onPaste = (e: ClipboardEvent) => {
      const t = e.target as HTMLElement;
      if (!t.closest('[contenteditable="true"]')) return;
      e.preventDefault();
      const text = e.clipboardData?.getData("text/plain") ?? "";
      document.getSelection()?.getRangeAt(0)?.deleteContents();
      document.execCommand("insertText", false, text);
    };
    el.addEventListener("click", onClick);
    el.addEventListener("paste", onPaste as EventListener);
    return () => {
      el.removeEventListener("click", onClick);
      el.removeEventListener("paste", onPaste as EventListener);
    };
  }, []);

  const onPickFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    const key = currentKey.current;
    if (!file || !key) return;
    setUploading(true);
    setMessage(null);
    try {
      const fd = new FormData();
      fd.set("file", file);
      const res = await fetch("/api/newsletter/image", { method: "POST", body: fd });
      const data = (await res.json()) as { url?: string; error?: string };
      if (!res.ok || !data.url) throw new Error(data.error ?? "Envoi impossible.");
      const img = container.current?.querySelector<HTMLImageElement>(`img[data-img][data-k="${CSS.escape(key)}"]`);
      if (img) {
        img.src = data.url;
        const wrap = img.closest<HTMLElement>(".nl-imgwrap");
        if (wrap) wrap.style.background = "";
      }
      scrape(templateId);
    } catch (err) {
      setMessage({ ok: false, error: (err as Error).message });
    } finally {
      setUploading(false);
    }
  };

  const applyLink = () => {
    if (!linkEdit) return;
    const href = linkEdit.href.trim();
    if (!isValidHref(href)) {
      setMessage({ ok: false, error: "Lien invalide : une adresse https://…, mailto:… ou un chemin du site (/catalogue)." });
      return;
    }
    const anchor = container.current?.querySelector<HTMLAnchorElement>(`a[data-href-k="${CSS.escape(linkEdit.key)}"]`);
    if (anchor) anchor.setAttribute("href", href);
    scrape(templateId);
    setMessage(null);
    setLinkEdit(null);
  };

  const currentValues = (): Values => {
    scrape(templateId);
    return { ...getStore()[templateId], subject: subjects[templateId] };
  };
  const formData = (extra: Record<string, string> = {}): FormData => {
    const fd = new FormData();
    fd.set("templateId", templateId);
    fd.set("values", JSON.stringify(currentValues()));
    for (const [k, v] of Object.entries(extra)) fd.set(k, v);
    return fd;
  };

  const switchTemplate = (id: string) => {
    scrape(templateId);
    setMessage(null);
    setLinkEdit(null);
    setTemplateId(id);
  };

  const onSave = () => start(async () => setMessage(await saveNewsletterTemplateAction(formData())));
  const onSend = () => {
    if (kind !== "one" && !window.confirm("Envoyer cette newsletter à tous les destinataires de cette sélection ? De vrais e-mails partent.")) return;
    start(async () => setMessage(await sendNewsletterAction(formData({ kind, slug, email }))));
  };

  const audienceOptions: { value: AudienceKind; label: string; note?: string }[] = [
    { value: "one", label: "Une seule adresse (test)" },
    { value: "all", label: "Tous les inscrits", note: `${counts.all}` },
    { value: "buyers", label: "Acheteurs inscrits", note: `${counts.buyers}` },
    { value: "product", label: "Acheteurs inscrits d'un titre" },
  ];

  const busy = pending || uploading;

  return (
    <div className="flex flex-col gap-4">
      <style>{`
        .nl-root [contenteditable="true"]{ outline:none; cursor:text; border-radius:5px; transition:box-shadow .12s ease; }
        .nl-root [contenteditable="true"]:hover{ box-shadow:0 0 0 2px rgba(17,17,17,.14); }
        .nl-root [contenteditable="true"]:focus{ box-shadow:0 0 0 2px rgba(17,17,17,.6); background:rgba(255,255,255,.5); }
        .nl-root .nl-pencil{ position:absolute; top:8px; right:8px; z-index:6; width:34px; height:34px; border-radius:999px; border:none; background:rgba(17,17,17,.74); color:#fff; font-size:15px; line-height:1; cursor:pointer; display:flex; align-items:center; justify-content:center; opacity:.55; transition:opacity .12s ease; box-shadow:0 2px 8px rgba(0,0,0,.25); }
        .nl-root .nl-pencil:hover{ opacity:1; }
        .nl-root .nl-btn{ cursor:text; }
        .nl-root .nl-linkbtn{ position:absolute; top:-12px; right:-12px; z-index:6; width:28px; height:28px; border-radius:999px; border:2px solid #fff; background:rgba(17,17,17,.82); color:#fff; font-size:13px; line-height:1; cursor:pointer; display:flex; align-items:center; justify-content:center; opacity:.6; transition:opacity .12s ease; box-shadow:0 2px 8px rgba(0,0,0,.25); }
        .nl-root .nl-linkbtn:hover, .nl-root .nl-btnwrap:hover .nl-linkbtn{ opacity:1; }
      `}</style>

      {linkEdit && (
        <div className="fixed z-50 flex w-[340px] flex-col gap-2 rounded-card bg-surface p-4 shadow-[0_16px_40px_rgb(0_0_0/0.18)]" style={{ top: linkEdit.top, left: linkEdit.left }} role="dialog" aria-label="Lien du bouton">
          <span className="text-xs font-bold">Lien du bouton</span>
          <Input
            autoFocus
            value={linkEdit.href}
            onChange={(e) => setLinkEdit({ ...linkEdit, href: e.target.value })}
            onKeyDown={(e) => {
              if (e.key === "Enter") applyLink();
              if (e.key === "Escape") setLinkEdit(null);
            }}
            placeholder="https://monvrai.fr/catalogue"
          />
          <span className="text-[0.6875rem] text-subtle">Adresse complète (https://…), e-mail (mailto:…) ou chemin du site (/livres/le-visage).</span>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setLinkEdit(null)} className="rounded-pill bg-paper px-3.5 py-2 text-xs font-bold">
              Annuler
            </button>
            <button type="button" onClick={applyLink} className="rounded-pill bg-ink px-3.5 py-2 text-xs font-bold text-on-ink">
              Appliquer
            </button>
          </div>
        </div>
      )}

      {/* Onglets des modèles */}
      <div className="flex flex-wrap gap-1.5">
        {NEWSLETTER_TEMPLATES.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => switchTemplate(t.id)}
            title={t.description}
            className={`rounded-pill px-3.5 py-2 text-[0.6875rem] font-bold transition-colors ${t.id === templateId ? "bg-ink text-on-ink" : "bg-paper hover:bg-line"}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-[minmax(0,640px)_1fr] items-start gap-4 max-[1099px]:grid-cols-1">
        {/* Aperçu éditable */}
        <div className="flex flex-col gap-3 rounded-card bg-surface p-5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <span className="text-lg font-extrabold">{templateById(templateId)?.label}</span>
            <span className="text-[0.6875rem] text-subtle">Cliquez un texte pour l'éditer · crayon : remplacer une image · 🔗 : changer le lien d'un bouton</span>
          </div>
          <label className="flex flex-col gap-1.5 text-xs font-semibold text-subtle">
            <span>Objet de l'e-mail</span>
            <Input value={subjects[templateId] ?? ""} onChange={(e) => setSubjects((s) => ({ ...s, [templateId]: e.target.value }))} placeholder="Objet…" />
          </label>
          <div className="overflow-x-auto rounded-[14px] bg-[#E9E6E0] p-4">
            <div ref={container} className="nl-root mx-auto" style={{ width: 600, maxWidth: "100%" }} />
          </div>
          <input ref={fileInput} type="file" accept="image/*" hidden onChange={onPickFile} />
          {uploading && <span className="text-[0.6875rem] font-semibold text-subtle">Envoi de l'image…</span>}
        </div>

        {/* Enregistrer + envoyer */}
        <div className="sticky top-6 flex flex-col gap-4">
          <div className="flex flex-col gap-3 rounded-card bg-surface p-6">
            <span className="text-lg font-extrabold">Enregistrer</span>
            <button type="button" onClick={onSave} disabled={busy} className="rounded-pill bg-paper px-5 py-3 text-sm font-bold disabled:opacity-60">
              {pending ? "…" : "Enregistrer le modèle"}
            </button>
            <span className="text-[0.6875rem] text-faint">Les modifications restent sur ce modèle.</span>
          </div>

          <div className="flex flex-col gap-3 rounded-card bg-surface p-6">
            <span className="text-lg font-extrabold">Envoyer</span>
            <div className="flex flex-col gap-2">
              {audienceOptions.map((o) => (
                <label key={o.value} className={`flex cursor-pointer items-center justify-between gap-2 rounded-[14px] border-[1.5px] px-3.5 py-3 ${kind === o.value ? "border-ink bg-paper" : "border-line bg-surface"}`}>
                  <span className="flex items-center gap-2.5">
                    <input type="radio" name="audienceKind" checked={kind === o.value} onChange={() => setKind(o.value)} />
                    <span className="text-[0.8125rem] font-bold">{o.label}</span>
                  </span>
                  {o.note && <span className="text-[0.6875rem] text-subtle">{o.note}</span>}
                </label>
              ))}
            </div>
            {kind === "product" && (
              <Select value={slug} onChange={(e) => setSlug(e.target.value)}>
                {products.map((p) => (
                  <option key={p.slug} value={p.slug}>
                    {p.title}
                  </option>
                ))}
              </Select>
            )}
            {kind === "one" && <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="prenom@exemple.fr" />}

            <button type="button" onClick={onSend} disabled={busy} className="rounded-pill bg-ink px-5 py-3.5 text-sm font-bold text-on-ink disabled:opacity-60">
              {pending ? "Envoi…" : "Envoyer la newsletter"}
            </button>
            <span className="text-[0.6875rem] text-subtle">Seuls les inscrits reçoivent l'e-mail. Chacun a son lien de désinscription. Envoyez-vous un test avant l'envoi de masse.</span>
          </div>

          {message && (
            <p className={`rounded-[14px] px-5 py-3.5 text-sm font-semibold ${message.ok ? "bg-tint-green text-tint-green-ink" : "bg-danger-bg text-danger"}`}>{message.ok ? message.message : message.error}</p>
          )}
        </div>
      </div>
    </div>
  );
}

"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Input } from "@/components/admin/ui";
import { PARTNER_WELCOME_ID, renderTemplateBody, type Brand, type RenderCtx } from "@/lib/newsletter/render";
import type { AdminResult } from "@/lib/admin/types";

/*
 * E-mail d'invitation des partenaires, éditable comme une newsletter : on modifie les
 * textes directement dans l'aperçu, sans champ ni éditeur riche.
 *
 * Comme dans le composeur de newsletter, l'aperçu est injecté en HTML brut et n'est pas
 * géré par React — sinon le curseur sauterait à chaque frappe. On relit donc le DOM au
 * moment d'enregistrer.
 *
 * Le bouton d'accès n'est pas modifiable : sa cible est un lien personnel, différent
 * pour chaque partenaire et produit au moment de l'envoi.
 *
 * La photo se change par le crayon, comme dans le composeur de newsletter et par la
 * même route d'envoi ; tant qu'aucune n'est choisie, le bloc ne part pas dans l'e-mail.
 */
export function PartnerWelcomeEditor({
  saved,
  brand,
  base,
  action,
}: {
  saved: Record<string, string>;
  brand: Brand;
  base: string;
  action: (values: Record<string, string>) => Promise<AdminResult>;
}) {
  const container = useRef<HTMLDivElement>(null);
  const values = useRef<Record<string, string>>({ ...saved });
  const fileInput = useRef<HTMLInputElement>(null);
  const pickedKey = useRef("");
  const [subject, setSubject] = useState(saved.subject ?? "");
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [pending, start] = useTransition();

  useEffect(() => {
    if (!container.current) return;
    const ctx: RenderCtx = { mode: "edit", base, unsub: "#", brand, values: values.current };
    container.current.innerHTML = renderTemplateBody(PARTNER_WELCOME_ID, ctx);
  }, [base, brand]);

  // Le collage doit rester du texte : sinon le style de la source entre dans l'e-mail.
  // Le crayon d'une image ouvre le sélecteur de fichier.
  useEffect(() => {
    const el = container.current;
    if (!el) return;
    const onPaste = (e: ClipboardEvent) => {
      e.preventDefault();
      document.execCommand("insertText", false, e.clipboardData?.getData("text/plain") ?? "");
    };
    const onClick = (e: MouseEvent) => {
      const btn = (e.target as HTMLElement).closest<HTMLElement>(".nl-pencil");
      if (!btn) return;
      e.preventDefault();
      pickedKey.current = btn.dataset.k ?? "";
      if (fileInput.current) {
        fileInput.current.value = "";
        fileInput.current.click();
      }
    };
    el.addEventListener("paste", onPaste);
    el.addEventListener("click", onClick);
    return () => {
      el.removeEventListener("paste", onPaste);
      el.removeEventListener("click", onClick);
    };
  }, []);

  const scrape = (): Record<string, string> => {
    const el = container.current;
    const next: Record<string, string> = { ...values.current, subject };
    if (el) {
      el.querySelectorAll<HTMLElement>('[contenteditable="true"][data-k]').forEach((node) => {
        next[node.dataset.k as string] = node.innerText.replace(/ /g, " ").replace(/\n{3,}/g, "\n\n").trim();
      });
      el.querySelectorAll<HTMLImageElement>("img[data-img][data-k]").forEach((img) => {
        const src = img.getAttribute("src") ?? "";
        const key = "img:" + (img.dataset.k as string);
        if (src && !src.startsWith("data:")) next[key] = src;
        else delete next[key];
      });
    }
    values.current = next;
    return next;
  };

  // Même route que le composeur de newsletter : dépôt dans la médiathèque, puis l'aperçu
  // pose l'URL renvoyée — `scrape` la relira au moment d'enregistrer.
  const onPickFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    const key = pickedKey.current;
    if (!file || !key) return;
    setUploading(true);
    setNotice(null);
    try {
      const body = new FormData();
      body.set("file", file);
      const res = await fetch("/api/newsletter/image", { method: "POST", body });
      const data = (await res.json()) as { url?: string; error?: string };
      if (!res.ok || !data.url) throw new Error(data.error ?? "Envoi impossible.");
      const img = container.current?.querySelector<HTMLImageElement>(`img[data-img][data-k="${CSS.escape(key)}"]`);
      if (img) {
        img.src = data.url;
        const wrap = img.closest<HTMLElement>(".nl-imgwrap");
        if (wrap) wrap.style.background = "";
      }
      scrape();
    } catch (err) {
      setNotice({ ok: false, text: (err as Error).message });
    } finally {
      setUploading(false);
    }
  };

  const save = () =>
    start(async () => {
      const result = await action(scrape());
      setNotice({ ok: result.ok, text: result.ok ? (result.message ?? "Enregistré.") : result.error });
    });

  return (
    <div className="flex flex-col gap-3.5">
      <style>{`
        .pw-root [contenteditable="true"]{ outline:none; }
        .pw-root [contenteditable="true"]:hover{ box-shadow:0 0 0 2px rgba(17,17,17,.12); border-radius:4px; }
        .pw-root [contenteditable="true"]:focus{ box-shadow:0 0 0 2px rgba(17,17,17,.55); border-radius:4px; }
        .pw-root a{ cursor:text; }
        .pw-root .nl-pencil{ position:absolute; top:8px; right:8px; z-index:6; width:34px; height:34px; border-radius:999px; border:none; background:rgba(17,17,17,.74); color:#fff; font-size:15px; line-height:1; cursor:pointer; display:flex; align-items:center; justify-content:center; opacity:.55; transition:opacity .12s ease; box-shadow:0 2px 8px rgba(0,0,0,.25); }
        .pw-root .nl-pencil:hover{ opacity:1; }
      `}</style>

      <input ref={fileInput} type="file" accept="image/*" hidden onChange={onPickFile} />

      <div className="grid grid-cols-[1fr_auto] items-end gap-3 max-[749px]:grid-cols-1">
        <label className="flex flex-col gap-1.5 text-xs font-semibold text-subtle">
          <span>Objet de l'e-mail</span>
          <Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Votre espace partenaire Mon Vrai" />
        </label>
        <button
          type="button"
          onClick={save}
          disabled={pending || uploading}
          className="rounded-pill bg-ink px-[1.125rem] py-3 text-[0.8125rem] font-bold text-on-ink disabled:opacity-50"
        >
          {pending || uploading ? "…" : "Enregistrer l'e-mail"}
        </button>
      </div>

      {notice && (
        <p role="status" className={`rounded-[14px] px-4 py-3 text-sm font-semibold ${notice.ok ? "bg-tint-green text-tint-green-ink" : "bg-danger-bg text-danger"}`}>
          {notice.text}
        </p>
      )}

      <p className="text-[0.6875rem] leading-relaxed text-subtle">
        Cliquez dans l'aperçu pour modifier les textes, sur le crayon pour changer la photo — sans photo choisie, le
        bloc ne part pas dans l'e-mail. Le bouton d'accès n'est pas modifiable : il mène à un lien personnel, produit au
        moment de l'envoi. Aucun lien de désinscription — c'est un envoi transactionnel.
      </p>

      <div className="overflow-x-auto rounded-card bg-canvas p-5">
        <div ref={container} className="pw-root mx-auto w-[600px] max-w-full text-left" />
      </div>
    </div>
  );
}

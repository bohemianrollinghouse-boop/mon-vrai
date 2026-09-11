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
  const [subject, setSubject] = useState(saved.subject ?? "");
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    if (!container.current) return;
    const ctx: RenderCtx = { mode: "edit", base, unsub: "#", brand, values: values.current };
    container.current.innerHTML = renderTemplateBody(PARTNER_WELCOME_ID, ctx);
  }, [base, brand]);

  // Le collage doit rester du texte : sinon le style de la source entre dans l'e-mail.
  useEffect(() => {
    const el = container.current;
    if (!el) return;
    const onPaste = (e: ClipboardEvent) => {
      e.preventDefault();
      document.execCommand("insertText", false, e.clipboardData?.getData("text/plain") ?? "");
    };
    el.addEventListener("paste", onPaste);
    return () => el.removeEventListener("paste", onPaste);
  }, []);

  const scrape = (): Record<string, string> => {
    const el = container.current;
    const next: Record<string, string> = { ...values.current, subject };
    if (el) {
      el.querySelectorAll<HTMLElement>('[contenteditable="true"][data-k]').forEach((node) => {
        next[node.dataset.k as string] = node.innerText.replace(/ /g, " ").replace(/\n{3,}/g, "\n\n").trim();
      });
    }
    values.current = next;
    return next;
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
      `}</style>

      <div className="grid grid-cols-[1fr_auto] items-end gap-3 max-[749px]:grid-cols-1">
        <label className="flex flex-col gap-1.5 text-xs font-semibold text-subtle">
          <span>Objet de l'e-mail</span>
          <Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Votre espace partenaire Mon Vrai" />
        </label>
        <button
          type="button"
          onClick={save}
          disabled={pending}
          className="rounded-pill bg-ink px-[1.125rem] py-3 text-[0.8125rem] font-bold text-on-ink disabled:opacity-50"
        >
          {pending ? "…" : "Enregistrer l'e-mail"}
        </button>
      </div>

      {notice && (
        <p role="status" className={`rounded-[14px] px-4 py-3 text-sm font-semibold ${notice.ok ? "bg-tint-green text-tint-green-ink" : "bg-danger-bg text-danger"}`}>
          {notice.text}
        </p>
      )}

      <p className="text-[0.6875rem] leading-relaxed text-subtle">
        Cliquez dans l'aperçu pour modifier les textes. Le bouton d'accès n'est pas modifiable : il mène à un lien
        personnel, produit au moment de l'envoi. Aucun lien de désinscription — c'est un envoi transactionnel.
      </p>

      <div className="overflow-x-auto rounded-card bg-canvas p-5">
        <div ref={container} className="pw-root mx-auto w-[600px] max-w-full text-left" />
      </div>
    </div>
  );
}

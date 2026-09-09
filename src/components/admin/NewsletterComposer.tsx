"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { Input, Select, Textarea } from "@/components/admin/ui";
import { saveNewsletterTemplateAction, sendNewsletterAction } from "@/lib/admin/actions/newsletter";
import { NEWSLETTER_TEMPLATES, templateById, templateDefaults } from "@/lib/newsletter/templates";
import type { AdminResult } from "@/lib/admin/types";

/*
 * Composeur de newsletter par modèles : on choisit un modèle (onglets), on modifie ses
 * textes et images (aperçu en direct à droite), on enregistre, puis on envoie à l'audience
 * choisie. Pas d'éditeur libre : on part toujours d'un modèle riche et on l'ajuste.
 */
type ProductOpt = { slug: string; title: string };
type Values = Record<string, string>;
type AudienceKind = "one" | "all" | "buyers" | "product";

export function NewsletterComposer({ saved, products, adminEmail, counts }: { saved: Record<string, Values>; products: ProductOpt[]; adminEmail: string; counts: { all: number; buyers: number } }) {
  const [templateId, setTemplateId] = useState(NEWSLETTER_TEMPLATES[0].id);
  const [store, setStore] = useState<Record<string, Values>>(() => {
    const s: Record<string, Values> = {};
    for (const t of NEWSLETTER_TEMPLATES) s[t.id] = { ...templateDefaults(t.id), ...(saved[t.id] ?? {}) };
    return s;
  });
  const [kind, setKind] = useState<AudienceKind>("one");
  const [slug, setSlug] = useState(products[0]?.slug ?? "");
  const [email, setEmail] = useState(adminEmail);
  const [message, setMessage] = useState<AdminResult | null>(null);
  const [pending, start] = useTransition();
  const [previewHtml, setPreviewHtml] = useState("");

  const def = templateById(templateId)!;
  const values = store[templateId];
  const setField = (name: string, val: string) => setStore((s) => ({ ...s, [templateId]: { ...s[templateId], [name]: val } }));

  const fd = useMemo(() => {
    const build = (extra: Record<string, string> = {}) => {
      const f = new FormData();
      f.set("templateId", templateId);
      for (const field of def.fields) f.set(field.name, values[field.name] ?? "");
      for (const [k, v] of Object.entries(extra)) f.set(k, v);
      return f;
    };
    return build;
  }, [templateId, values, def]);

  // Aperçu en direct (débouncé).
  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const res = await fetch("/api/newsletter/preview", { method: "POST", body: fd() });
        if (!cancelled && res.ok) setPreviewHtml(await res.text());
      } catch {
        // aperçu indisponible
      }
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [fd]);

  const onSave = () => start(async () => setMessage(await saveNewsletterTemplateAction(fd())));
  const onSend = () => {
    if (kind !== "one" && !window.confirm("Envoyer cette newsletter à tous les destinataires de cette sélection ? De vrais e-mails partent.")) return;
    start(async () => setMessage(await sendNewsletterAction(fd({ kind, slug, email }))));
  };

  const audienceOptions: { value: AudienceKind; label: string; note?: string }[] = [
    { value: "one", label: "Une seule adresse (test)" },
    { value: "all", label: "Tous les inscrits", note: `${counts.all}` },
    { value: "buyers", label: "Acheteurs inscrits", note: `${counts.buyers}` },
    { value: "product", label: "Acheteurs inscrits d'un titre" },
  ];

  return (
    <div className="flex flex-col gap-4">
      {/* Onglets des modèles */}
      <div className="flex flex-wrap gap-1.5">
        {NEWSLETTER_TEMPLATES.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => {
              setTemplateId(t.id);
              setMessage(null);
            }}
            title={t.description}
            className={`rounded-pill px-3.5 py-2 text-[0.6875rem] font-bold transition-colors ${t.id === templateId ? "bg-ink text-white" : "bg-paper hover:bg-line"}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-[1fr_1fr] items-start gap-4 max-[1099px]:grid-cols-1">
        {/* Édition */}
        <div className="flex flex-col gap-3 rounded-card bg-white p-6">
          <div className="flex items-baseline justify-between">
            <span className="text-lg font-extrabold">{def.label}</span>
            <span className="text-xs text-subtle">{def.description}</span>
          </div>
          {def.fields.map((field) => (
            <label key={field.name} className="flex flex-col gap-1.5 text-xs font-semibold text-subtle">
              <span>
                {field.label}
                {field.hint && <span className="ml-1 font-medium text-faint">— {field.hint}</span>}
              </span>
              {field.type === "textarea" ? (
                <Textarea value={values[field.name] ?? ""} onChange={(e) => setField(field.name, e.target.value)} rows={field.name === "intro" ? 6 : 3} />
              ) : (
                <Input type={field.type === "image" ? "url" : "text"} value={values[field.name] ?? ""} onChange={(e) => setField(field.name, e.target.value)} placeholder={field.type === "image" ? "https://…" : ""} />
              )}
            </label>
          ))}

          <div className="flex flex-wrap items-center gap-3 border-t border-line pt-3">
            <button type="button" onClick={onSave} disabled={pending} className="rounded-pill bg-paper px-5 py-3 text-sm font-bold disabled:opacity-60">
              {pending ? "…" : "Enregistrer le modèle"}
            </button>
            <span className="text-[0.6875rem] text-faint">Les modifications restent sur ce modèle.</span>
          </div>
        </div>

        {/* Aperçu + envoi */}
        <div className="flex flex-col gap-4">
          <div className="rounded-card bg-white p-6">
            <span className="mb-3 block text-lg font-extrabold">Aperçu en direct</span>
            <iframe title="Aperçu de la newsletter" srcDoc={previewHtml} className="h-[560px] w-full rounded-[14px] border border-line bg-white" />
          </div>

          <div className="flex flex-col gap-3 rounded-card bg-white p-6">
            <span className="text-lg font-extrabold">Envoyer</span>
            <div className="flex flex-col gap-2">
              {audienceOptions.map((o) => (
                <label key={o.value} className={`flex cursor-pointer items-center justify-between gap-2 rounded-[14px] border-[1.5px] px-3.5 py-3 ${kind === o.value ? "border-ink bg-paper" : "border-line bg-white"}`}>
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

            <button type="button" onClick={onSend} disabled={pending} className="rounded-pill bg-ink px-5 py-3.5 text-sm font-bold text-white disabled:opacity-60">
              {pending ? "Envoi…" : "Envoyer la newsletter"}
            </button>
            <span className="text-[0.6875rem] text-subtle">Seuls les inscrits reçoivent l'e-mail. Chacun a son lien de désinscription. Envoyez-vous un test avant l'envoi de masse.</span>
          </div>
        </div>
      </div>

      {message && (
        <p className={`rounded-[14px] px-5 py-3.5 text-sm font-semibold ${message.ok ? "bg-tint-green text-tint-green-ink" : "bg-danger-bg text-danger"}`}>{message.ok ? message.message : message.error}</p>
      )}
    </div>
  );
}

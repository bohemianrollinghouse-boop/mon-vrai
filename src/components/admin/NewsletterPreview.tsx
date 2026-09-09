"use client";

import { useEffect, useState } from "react";

/*
 * Aperçu en direct de la newsletter : écoute les champs du formulaire d'édition (par son
 * id), envoie leur contenu à la route d'aperçu (débounce), et affiche le HTML rendu dans
 * un iframe. Le vrai gabarit sert de source, donc l'aperçu est fidèle à l'e-mail envoyé.
 */
export function NewsletterPreview({ formId }: { formId: string }) {
  const [html, setHtml] = useState<string>("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const form = document.getElementById(formId) as HTMLFormElement | null;
    if (!form) return;
    let timer: ReturnType<typeof setTimeout>;
    let cancelled = false;

    const update = async () => {
      try {
        const res = await fetch("/api/newsletter/preview", { method: "POST", body: new FormData(form) });
        if (!cancelled && res.ok) setHtml(await res.text());
      } catch {
        // Aperçu indisponible : on garde le dernier rendu.
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    const onInput = () => {
      clearTimeout(timer);
      timer = setTimeout(update, 350);
    };

    form.addEventListener("input", onInput);
    update();
    return () => {
      cancelled = true;
      clearTimeout(timer);
      form.removeEventListener("input", onInput);
    };
  }, [formId]);

  return (
    <div className="flex flex-col gap-2">
      <iframe title="Aperçu de la newsletter" srcDoc={html} className="h-[680px] w-full rounded-[14px] border border-line bg-white" />
      {loading && <span className="text-[0.6875rem] text-subtle">Chargement de l'aperçu…</span>}
    </div>
  );
}

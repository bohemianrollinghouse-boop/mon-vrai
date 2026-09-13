"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ContractText } from "@/components/site/ContractText";

/*
 * Lecture du contrat.
 *
 * La fenêtre ne demande rien et n'accepte rien : elle sert à LIRE. Les informations ont
 * été remplies dans la page — le contrat s'affiche ici avec elles à leur place —, et
 * les attestations se cochent dans la page APRÈS. On n'atteste pas avoir lu un texte
 * qu'on n'a pas encore vu.
 *
 * Le bouton reste grisé tant que le contrat n'a pas été déroulé jusqu'en bas, et la
 * raison est écrite juste à côté. La condition se relâche quand le texte tient dans le
 * cadre sans défilement, sinon le bouton ne s'activerait jamais.
 *
 * Une barre dit où l'on en est, et l'article qu'on lit. Elle n'est pas décorative : un
 * contrat de vingt articles dans un cadre de quelques centaines de pixels ne donne
 * aucune idée de ce qu'il reste, et on le referme au tiers en croyant l'avoir vu.
 */
export function ContractDialog({
  title,
  typeLabel,
  version,
  body,
  signerName,
  alreadyRead,
  onClose,
  onRead,
}: {
  title: string;
  typeLabel: string;
  version: string;
  body: string;
  signerName: string;
  /** Déjà lu : la fenêtre sert alors à relire, sans rien redemander. */
  alreadyRead: boolean;
  onClose: () => void;
  onRead: () => void;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const [read, setRead] = useState(false);
  const [progress, setProgress] = useState(0);
  const [article, setArticle] = useState({ current: 0, total: 0 });

  /*
   * Où l'on en est : la part défilée, et l'article dont le titre vient de passer en haut
   * du cadre. Les titres sont mesurés dans le document plutôt qu'estimés depuis la
   * hauteur — un article long ne vaut pas un article court.
   */
  const measure = useCallback(() => {
    const el = scroller.current;
    if (!el) return;
    const room = el.scrollHeight - el.clientHeight;
    setProgress(room <= 0 ? 100 : Math.min(100, Math.round((el.scrollTop / room) * 100)));
    if (room <= 0 || el.scrollTop + el.clientHeight >= el.scrollHeight - 24) setRead(true);

    const headings = [...el.querySelectorAll("h3")].filter((h) => /^article\b/i.test(h.textContent?.trim() ?? ""));
    if (headings.length === 0) return setArticle({ current: 0, total: 0 });
    const top = el.getBoundingClientRect().top;
    /* Le dernier titre passé au-dessus du tiers haut du cadre : c'est celui qu'on lit. */
    const seen = headings.filter((h) => h.getBoundingClientRect().top - top < el.clientHeight / 3).length;
    setArticle({ current: Math.max(1, seen), total: headings.length });
  }, []);

  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    measure();
    el.addEventListener("scroll", measure, { passive: true });
    window.addEventListener("resize", measure);
    return () => {
      el.removeEventListener("scroll", measure);
      window.removeEventListener("resize", measure);
    };
  }, [measure]);

  /* Échap ferme : une fenêtre modale doit pouvoir se quitter au clavier. */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    /*
     * Plein écran sur un téléphone, fenêtre au milieu sur un bureau : un contrat de vingt
     * articles ne se lit pas dans une carte de 400 pixels de haut posée sur un fond flou.
     */
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/45 backdrop-blur-sm max-[749px]:p-0 max-[749px]:backdrop-blur-none min-[750px]:p-4"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div className="flex w-full flex-col bg-white max-[749px]:h-full min-[750px]:max-h-[92vh] min-[750px]:max-w-[48rem] min-[750px]:gap-4 min-[750px]:rounded-panel min-[750px]:p-7">
        <div className="flex items-start justify-between gap-4 max-[749px]:px-5 max-[749px]:pb-3.5 max-[749px]:pt-6">
          <div className="flex flex-col gap-0.5">
            <span className="text-[0.6875rem] font-bold uppercase tracking-[0.1em] text-faint">Contrat · {typeLabel}</span>
            <h2 className="text-[1.375rem] font-extrabold leading-[1.15] tracking-[-0.01em] max-[749px]:text-xl">{title}</h2>
            <span className="text-xs text-subtle">Version {version} · rempli de vos informations</span>
          </div>
          {/* Une croix sur un téléphone, un mot sur un bureau : le geste n'est pas le même. */}
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer"
            className="shrink-0 max-[749px]:flex max-[749px]:h-10 max-[749px]:w-10 max-[749px]:items-center max-[749px]:justify-center max-[749px]:rounded-pill max-[749px]:bg-paper max-[749px]:text-xl min-[750px]:text-xs min-[750px]:font-bold min-[750px]:underline"
          >
            <span className="max-[749px]:hidden">Fermer</span>
            <span aria-hidden="true" className="min-[750px]:hidden">
              ×
            </span>
          </button>
        </div>

        <div className="flex flex-col gap-1.5 max-[749px]:px-5 max-[749px]:pb-3">
          <div className="h-1 overflow-hidden rounded-pill bg-line">
            <div className="h-full rounded-pill bg-ink transition-[width] duration-150" style={{ width: `${Math.max(2, progress)}%` }} />
          </div>
          <span className="text-[0.6875rem] font-semibold text-subtle" role="status">
            {article.total > 0 && `Article ${article.current} sur ${article.total}`}
            {article.total > 0 && !read && " · "}
            {!read && "faites défiler jusqu'en bas pour continuer"}
            {article.total === 0 && read && "Contrat lu jusqu'au bout"}
          </span>
        </div>

        <div
          ref={scroller}
          className="flex-1 overflow-y-auto max-[749px]:border-t max-[749px]:border-line max-[749px]:px-5 max-[749px]:py-4 min-[750px]:min-h-[12rem] min-[750px]:rounded-card min-[750px]:border min-[750px]:border-line min-[750px]:bg-surface min-[750px]:px-6 min-[750px]:py-5"
        >
          <ContractText text={body} />
          {/* La signature ferme le document, comme sur un contrat imprimé. */}
          <div className="mt-6 flex flex-col gap-1 border-t border-line pt-4 text-[0.8125rem]">
            <span className="text-[0.6875rem] font-bold uppercase tracking-[0.08em] text-faint">À accepter électroniquement par</span>
            <span className="text-base font-extrabold">{signerName || "—"}</span>
            <span className="text-xs text-subtle">Vous attesterez et signerez juste après, dans la page. L&apos;acceptation sera horodatée à ce moment-là.</span>
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 max-[749px]:flex-col max-[749px]:gap-2 max-[749px]:border-t max-[749px]:border-line max-[749px]:px-5 max-[749px]:pb-6 max-[749px]:pt-3.5">
          <span className={`text-xs font-semibold max-[749px]:order-2 max-[749px]:text-center ${read ? "text-tint-green-ink" : "text-subtle"}`}>
            {read ? "Contrat lu jusqu'au bout." : "Le bouton s'active une fois le contrat déroulé jusqu'en bas."}
          </span>
          {alreadyRead ? (
            <button type="button" onClick={onClose} className="rounded-pill bg-ink py-3.5 text-sm font-bold text-white max-[749px]:order-1 max-[749px]:w-full min-[750px]:px-7">
              Fermer
            </button>
          ) : (
            <button
              type="button"
              onClick={onRead}
              disabled={!read}
              className="rounded-pill bg-ink py-3.5 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-40 max-[749px]:order-1 max-[749px]:w-full min-[750px]:px-7"
            >
              J&apos;ai lu le contrat
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

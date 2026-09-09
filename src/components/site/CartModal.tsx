"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import { addToCart } from "@/lib/cart/actions";
import { cartModalSnapshot, completeCollectionAction, type CartModalData } from "@/lib/cart/modal";
import { formatEuroShort } from "@/lib/domain/money";
import { TINT_BG } from "./ui";

/*
 * Modal « Ajouté au panier » (maquette 10A), globale et déclenchée après chaque ajout au
 * panier — fiche produit, carte catalogue, encart collection. Un contexte léger expose
 * `openCartModal` ; le contenu (offre collection, suggestions, sous-total) est recalculé
 * côté serveur par cartModalSnapshot, jamais dans le navigateur. Accessible : fermeture
 * Échap et clic sur l'arrière-plan, focus déplacé dans la modal, corps figé.
 */

type OpenOptions = { slug?: string };
type CartModalContextValue = { openCartModal: (opts?: OpenOptions) => void };

const CartModalContext = createContext<CartModalContextValue | null>(null);

export function useCartModal(): CartModalContextValue {
  const ctx = useContext(CartModalContext);
  if (!ctx) throw new Error("useCartModal doit être utilisé dans <CartModalProvider>");
  return ctx;
}

export function CartModalProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<CartModalData | null>(null);
  const [loading, setLoading] = useState(false);
  const slugRef = useRef<string | undefined>(undefined);

  const load = useCallback(async (slug?: string) => {
    setLoading(true);
    try {
      setData(await cartModalSnapshot(slug));
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  const openCartModal = useCallback(
    (opts?: OpenOptions) => {
      slugRef.current = opts?.slug;
      setData(null);
      setOpen(true);
      void load(opts?.slug);
    },
    [load],
  );

  const close = useCallback(() => setOpen(false), []);
  const refresh = useCallback(() => load(slugRef.current), [load]);

  return (
    <CartModalContext.Provider value={{ openCartModal }}>
      {children}
      {open && <CartModal data={data} loading={loading} onClose={close} onRefresh={refresh} />}
    </CartModalContext.Provider>
  );
}

function CartModal({ data, loading, onClose, onRefresh }: { data: CartModalData | null; loading: boolean; onClose: () => void; onRefresh: () => void }) {
  const router = useRouter();
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const [pending, startTransition] = useTransition();

  // Échap ferme, corps figé, focus amené sur la modal.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "Tab") trapFocus(e, panelRef.current);
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose]);

  const showCollection = Boolean(data?.offerEnabled);
  const canComplete = showCollection && !data!.complete && data!.missingCount > 0;
  const isComplete = showCollection && data!.complete;

  const complete = () =>
    startTransition(async () => {
      await completeCollectionAction();
      onClose();
      router.push("/panier");
    });

  const addSuggestion = (slug: string) =>
    startTransition(async () => {
      const fd = new FormData();
      fd.set("slug", slug);
      fd.set("qty", "1");
      await addToCart(fd);
      onRefresh();
    });

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-[1000] flex items-center justify-center bg-ink/45 p-6 backdrop-blur-[3px]"
      role="dialog"
      aria-modal="true"
      aria-label="Ajouté au panier"
    >
      <div
        ref={panelRef}
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[calc(100vh-48px)] w-[560px] max-w-full flex-col overflow-auto rounded-panel bg-paper shadow-float"
      >
        <div className="flex items-center justify-between px-7 pt-6">
          <div className="flex items-center gap-3">
            <span className="flex h-8 w-8 items-center justify-center rounded-pill bg-tint-green text-sm font-extrabold text-tint-green-ink" aria-hidden="true">
              ✓
            </span>
            <span className="text-lg font-extrabold tracking-[-0.01em]">Ajouté au panier</span>
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Fermer"
            className="flex h-9 w-9 items-center justify-center rounded-pill bg-white text-base text-muted hover:text-ink"
          >
            ×
          </button>
        </div>

        {loading && !data ? (
          <div className="px-7 py-10 text-center text-sm font-semibold text-muted">Un instant…</div>
        ) : !data ? (
          <div className="px-7 py-10 text-center text-sm font-semibold text-muted">
            Article ajouté.{" "}
            <Link href="/panier" onClick={onClose} className="underline">
              Voir le panier
            </Link>
          </div>
        ) : (
          <>
            {data.added && (
              <div className="mx-7 mt-5 grid grid-cols-[96px_1fr_auto] items-center gap-[18px] rounded-card bg-white p-5 max-[479px]:grid-cols-[72px_1fr]">
                <div className={`relative flex h-24 w-24 items-center justify-center rounded-thumb max-[479px]:h-[72px] max-[479px]:w-[72px] ${TINT_BG[data.added.tint]}`}>
                  {data.added.image && (
                    <div className="absolute inset-[18%] overflow-hidden rounded-[8px]">
                      <Image src={data.added.image} alt={data.added.name} fill sizes="96px" className="object-cover" />
                    </div>
                  )}
                </div>
                <div className="flex flex-col gap-1.5">
                  <span className="text-[0.6875rem] font-bold uppercase tracking-[0.08em] text-subtle">{data.added.ageLabel}</span>
                  <span className="text-[1.0625rem] font-extrabold leading-tight tracking-[-0.01em]">{data.added.name}</span>
                  <span className="text-xs font-semibold text-muted">
                    Quantité : {data.added.qty}
                    {data.added.preorder && " · Précommande, expédié dès le 25 déc."}
                  </span>
                </div>
                <span className="self-center whitespace-nowrap text-lg font-extrabold max-[479px]:col-start-2">{formatEuroShort(data.added.lineTotal)}</span>
              </div>
            )}

            {canComplete && (
              <div className="mx-7 mt-3 grid grid-cols-[1fr_auto] items-center gap-4 rounded-[20px] bg-tint-sand px-5 py-[18px] max-[479px]:grid-cols-1">
                <div className="flex flex-col gap-1.5">
                  <span className="text-[0.6875rem] font-bold uppercase tracking-[0.1em] text-tint-sand-ink">Complétez la collection</span>
                  <span className="text-[0.9375rem] font-extrabold leading-tight tracking-[-0.01em]">
                    Ajoutez {data.missingCount === 1 ? "le titre manquant" : `les ${data.missingCount} titres manquants`}, un livre offert
                  </span>
                  <span className="text-xs font-semibold text-tint-sand-ink">
                    Les {data.totalTitles} imagiers pour <strong>{formatEuroShort(data.offerPrice)}</strong>{" "}
                    <span className="line-through opacity-60">{formatEuroShort(data.fullPrice)}</span>
                  </span>
                </div>
                <button
                  type="button"
                  onClick={complete}
                  disabled={pending}
                  className="whitespace-nowrap rounded-pill bg-ink px-[18px] py-3 text-xs font-bold text-white disabled:opacity-50 max-[479px]:w-full"
                >
                  {pending ? "…" : `Compléter · +${formatEuroShort(data.missingCost)}`}
                </button>
              </div>
            )}

            {isComplete && (
              <div className="mx-7 mt-3 rounded-thumb bg-tint-green px-[18px] py-3.5 text-center text-[0.8125rem] font-bold text-tint-green-ink">
                Collection complète — un livre offert, −{formatEuroShort(data.collectionDiscount)} appliqués.
              </div>
            )}

            {data.suggestions.length > 0 && (
              <div className="flex flex-col gap-3 px-7 pt-5">
                <span className="text-xs font-bold text-subtle">Ces imagiers pourraient aussi vous intéresser</span>
                <div className="grid grid-cols-3 gap-2 max-[479px]:grid-cols-2">
                  {data.suggestions.map((s) => (
                    <div key={s.slug} className="flex flex-col items-center gap-2 rounded-thumb bg-white p-3 text-center">
                      <div className={`relative flex aspect-square w-full items-center justify-center rounded-[12px] ${TINT_BG[s.tint]}`}>
                        {s.image && (
                          <div className="absolute inset-[20%] overflow-hidden rounded-[6px]">
                            <Image src={s.image} alt={s.name} fill sizes="120px" className="object-cover" />
                          </div>
                        )}
                      </div>
                      <span className="text-[0.6875rem] font-bold leading-tight">{s.name}</span>
                      <button
                        type="button"
                        onClick={() => addSuggestion(s.slug)}
                        disabled={pending}
                        className="rounded-pill bg-paper px-3 py-1.5 text-[0.6875rem] font-bold disabled:opacity-50"
                      >
                        + {formatEuroShort(s.price)}
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex items-baseline justify-between px-7 pt-5 text-sm font-semibold">
              <span className="text-muted">
                Sous-total du panier · {data.count} {data.count > 1 ? "livres" : "livre"}
              </span>
              <div className="flex items-baseline gap-2">
                {isComplete && data.collectionDiscount > 0 && <span className="text-[0.8125rem] text-faint line-through">{formatEuroShort(data.subtotal)}</span>}
                <span className="text-xl font-extrabold tracking-[-0.01em]">{formatEuroShort(Math.max(0, data.subtotal - data.collectionDiscount))}</span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2.5 px-7 pb-7 pt-5 max-[479px]:grid-cols-1">
              <button type="button" onClick={onClose} className="rounded-pill bg-white px-5 py-4 text-center text-sm font-bold">
                Continuer mes achats
              </button>
              <Link href="/panier" onClick={onClose} className="rounded-pill bg-ink px-5 py-4 text-center text-sm font-bold text-white">
                Voir mon panier
              </Link>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/** Piège à focus léger : garde la tabulation à l'intérieur de la modal. */
function trapFocus(e: KeyboardEvent, panel: HTMLElement | null) {
  if (!panel) return;
  const focusable = panel.querySelectorAll<HTMLElement>('button, a[href], input, [tabindex]:not([tabindex="-1"])');
  if (focusable.length === 0) return;
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (e.shiftKey && document.activeElement === first) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && document.activeElement === last) {
    e.preventDefault();
    first.focus();
  }
}

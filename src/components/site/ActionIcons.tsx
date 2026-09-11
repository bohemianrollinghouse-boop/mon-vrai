/*
 * Icônes des actions de l'en-tête (maquette 11a) : recherche, compte, panier. Des
 * traits, pas des aplats — elles héritent de la couleur du bouton, donc du même jeu
 * clair/sombre que les pastilles du menu.
 */
const props = { width: 18, height: 18, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round" } as const;

export function SearchIcon() {
  return (
    <svg {...props} aria-hidden="true">
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  );
}

export function AccountIcon() {
  return (
    <svg {...props} aria-hidden="true">
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c0-4 3.6-7 8-7s8 3 8 7" />
    </svg>
  );
}

export function CartIcon() {
  return (
    <svg {...props} strokeLinejoin="round" aria-hidden="true">
      <path d="M3 9h18l-1.5 10a2 2 0 0 1-2 1.7H6.5a2 2 0 0 1-2-1.7Z" />
      <path d="M8 9V7a4 4 0 0 1 8 0v2" />
    </svg>
  );
}

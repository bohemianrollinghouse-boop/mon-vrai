import { ImageResponse } from "next/og";

/*
 * Icônes de la PWA admin, générées à la volée (le monogramme « M » de Mon Vrai, blanc sur
 * fond encre). Fond plein pour rester correct en « maskable ». Taille passée dans l'URL :
 * /admin/app-icon/192, /admin/app-icon/512, /admin/app-icon/180 (Apple).
 */
export async function GET(_req: Request, ctx: { params: Promise<{ size: string }> }) {
  const { size: raw } = await ctx.params;
  const size = Math.min(1024, Math.max(48, Number(raw) || 192));
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#111111",
          color: "#ffffff",
          fontSize: Math.round(size * 0.46),
          fontWeight: 800,
          fontFamily: "sans-serif",
          letterSpacing: "-0.03em",
        }}
      >
        M
      </div>
    ),
    { width: size, height: size },
  );
}

import { describe, expect, it } from "vitest";
import { playableMime, wasRenamed } from "./media-compat";

/*
 * Un .mov d'iPhone contient presque toujours de l'H.264 : le navigateur sait le lire,
 * il refuse seulement d'essayer sous ce nom-là. On corrige une étiquette, et rien d'autre
 * — surtout pas les octets.
 */

describe("compatibilité des vidéos", () => {
  it("rebaptise les conteneurs qu'un navigateur lit sous un autre nom", () => {
    expect(playableMime("video/quicktime")).toBe("video/mp4");
    expect(playableMime("video/x-m4v")).toBe("video/mp4");
    expect(wasRenamed("video/quicktime")).toBe(true);
  });

  it("ne touche pas à ce qui se lit déjà", () => {
    for (const mime of ["video/mp4", "video/webm", "image/jpeg", "application/pdf"]) {
      expect(playableMime(mime)).toBe(mime);
      expect(wasRenamed(mime)).toBe(false);
    }
  });

  it("ne sauve pas ce qui ne se lit nulle part : le nom n'y peut rien", () => {
    expect(playableMime("image/heic")).toBe("image/heic");
    expect(playableMime("video/x-msvideo")).toBe("video/x-msvideo");
  });
});

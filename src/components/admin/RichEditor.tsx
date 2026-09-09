"use client";

import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import Image from "@tiptap/extension-image";
import Placeholder from "@tiptap/extension-placeholder";
import { useState } from "react";

/*
 * Éditeur WYSIWYG (Tiptap). Il écrit deux champs cachés : le HTML figé, servi au public,
 * et le document JSON, source de vérité pour rééditer sans perte. Barre d'outils réduite
 * à ce qu'une page de contenu a besoin : titres, gras/italique, listes, lien, image,
 * citation. Pas de couleurs ni de tailles : la charte s'en charge.
 *
 * `htmlOnly` ne pose qu'un champ `<name>` (HTML) - pour la description produit.
 */

type Props = {
  name: string;
  initialHtml?: string;
  initialJson?: unknown;
  htmlOnly?: boolean;
  placeholder?: string;
};

export function RichEditor({ name, initialHtml = "", initialJson, htmlOnly = false, placeholder = "Rédigez ici…" }: Props) {
  const [html, setHtml] = useState(initialHtml);
  const [json, setJson] = useState<string>(() => JSON.stringify(initialJson ?? null));

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({ heading: { levels: [2, 3] } }),
      Link.configure({ openOnClick: false, autolink: true, defaultProtocol: "https" }),
      Image.configure({ inline: false }),
      Placeholder.configure({ placeholder }),
    ],
    content: initialJson && typeof initialJson === "object" ? (initialJson as object) : initialHtml,
    editorProps: {
      attributes: { class: "prose-mv max-w-none min-h-[14rem] rounded-b-[14px] bg-paper px-[1.375rem] py-5 text-[0.9375rem] leading-[1.65] text-[#333] outline-none" },
    },
    onUpdate: ({ editor }) => {
      setHtml(editor.getHTML());
      setJson(JSON.stringify(editor.getJSON()));
    },
  });

  const btn = (label: string, active: boolean, run: () => void, title = label) => (
    <button
      type="button"
      title={title}
      onMouseDown={(e) => e.preventDefault()}
      onClick={run}
      className={`flex h-[34px] min-w-[34px] items-center justify-center rounded-[10px] px-2.5 text-[0.8125rem] font-bold ${active ? "bg-ink text-white" : "bg-white hover:opacity-70"}`}
    >
      {label}
    </button>
  );

  const setLink = () => {
    if (!editor) return;
    const prev = editor.getAttributes("link").href as string | undefined;
    const url = window.prompt("Adresse du lien", prev ?? "https://");
    if (url === null) return;
    if (url === "") editor.chain().focus().extendMarkRange("link").unsetLink().run();
    else editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
  };

  const addImage = () => {
    if (!editor) return;
    const url = window.prompt("Adresse de l'image (depuis la médiathèque)");
    if (url) editor.chain().focus().setImage({ src: url }).run();
  };

  return (
    <div className="flex flex-col">
      {htmlOnly ? (
        <input type="hidden" name={name} value={html} readOnly />
      ) : (
        <>
          <input type="hidden" name={`${name}Html`} value={html} readOnly />
          <input type="hidden" name={`${name}Json`} value={json} readOnly />
        </>
      )}
      {editor && (
        <div className="flex flex-wrap gap-1 rounded-t-[14px] bg-paper p-2" role="toolbar" aria-label="Mise en forme">
          {btn("H2", editor.isActive("heading", { level: 2 }), () => editor.chain().focus().toggleHeading({ level: 2 }).run(), "Titre")}
          {btn("H3", editor.isActive("heading", { level: 3 }), () => editor.chain().focus().toggleHeading({ level: 3 }).run(), "Sous-titre")}
          {btn("¶", editor.isActive("paragraph"), () => editor.chain().focus().setParagraph().run(), "Paragraphe")}
          <span className="w-1.5" />
          {btn("G", editor.isActive("bold"), () => editor.chain().focus().toggleBold().run(), "Gras")}
          {btn("I", editor.isActive("italic"), () => editor.chain().focus().toggleItalic().run(), "Italique")}
          <span className="w-1.5" />
          {btn("• Liste", editor.isActive("bulletList"), () => editor.chain().focus().toggleBulletList().run())}
          {btn("1. Liste", editor.isActive("orderedList"), () => editor.chain().focus().toggleOrderedList().run())}
          {btn("Citation", editor.isActive("blockquote"), () => editor.chain().focus().toggleBlockquote().run())}
          <span className="w-1.5" />
          {btn("Lien", editor.isActive("link"), setLink)}
          {btn("Image", false, addImage)}
          <span className="w-1.5" />
          {btn("Annuler", false, () => editor.chain().focus().undo().run())}
          {btn("Rétablir", false, () => editor.chain().focus().redo().run())}
        </div>
      )}
      <EditorContent editor={editor} />
    </div>
  );
}

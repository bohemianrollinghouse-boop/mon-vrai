import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
  {
    rules: {
      // Le site est en français : les apostrophes dans le JSX sont la norme, pas une
      // erreur. La règle n'a aucun effet à l'exécution.
      "react/no-unescaped-entities": "off",
    },
  },
]);

export default eslintConfig;

import { readFile } from "node:fs/promises";

// esbuild plugin: load .xml imports as their raw text, so spec.ts can parse the
// LDML source directly. Mirrors bun's `[loader] ".xml" = "text"` (bunfig.toml).
export default () => ({
  name: "xml-text",
  setup(build: any) {
    build.onLoad({ filter: /\.xml$/ }, async (args: { path: string }) => ({
      contents: await readFile(args.path, "utf8"),
      loader: "text",
    }));
  },
});

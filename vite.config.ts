import { cinnamonInstallPlugin } from "./tools/vite/cinnamon-install.ts";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [cinnamonInstallPlugin()],
  publicDir: "packaging",
  build: {
    copyPublicDir: true,
    emptyOutDir: true,
    lib: {
      entry: "src/applet.ts",
      fileName: () => "portman-applet.js",
      formats: ["cjs"],
      name: "portmanApplet",
    },
    outDir: "files/portman@listlessbird",
    sourcemap: false,
    target: "es2020",
  },
});

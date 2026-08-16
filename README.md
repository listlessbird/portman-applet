# Portman Cinnamon Applet

Portman finds listening local ports and lets you safely stop their owning
processes from a Cinnamon panel applet.

## Build

Install dependencies and produce the Cinnamon package:

```bash
pnpm install
pnpm build
```

The generated package is written to `files/portman@listlessbird/`.

## Install locally

Install the applet for the current user:

```bash
pnpm install:local
```

This copies the finished package to
`~/.local/share/cinnamon/applets/portman@listlessbird/` and asks Cinnamon to
reload it. Add **Portman** to a panel through Cinnamon’s Applets settings.

## Development install

Install an isolated development copy:

```bash
pnpm dev:install
```

This uses the `devtest-portman@listlessbird` UUID so it does not overwrite the
normal installation. The development metadata is rewritten in the copied
package only.

Normal `pnpm build` never writes to the user’s Cinnamon directory. The install
steps opt into the Vite install plugin through their build modes.

## Checks

```bash
pnpm test
pnpm check
```

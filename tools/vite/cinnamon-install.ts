import { execFile } from "node:child_process";
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { promisify } from "node:util";
import type { Plugin, ResolvedConfig } from "vite";

const execFileAsync = promisify(execFile);
const APPLET_UUID = "portman@listlessbird";
const DEV_PREFIX = "devtest-";

type InstallMode = "dev" | "local";

/** Installs the finished Vite package only for the explicit install modes. */
export function cinnamonInstallPlugin(): Plugin {
  let config: ResolvedConfig | undefined;
  let installMode: InstallMode | undefined;

  return {
    name: "portman-cinnamon-install",
    apply: "build",

    configResolved(resolvedConfig) {
      config = resolvedConfig;
      installMode = getInstallMode(resolvedConfig.mode);
    },

    async closeBundle() {
      if (config === undefined || installMode === undefined) return;

      const installedUuid = installMode === "dev" ? `${DEV_PREFIX}${APPLET_UUID}` : APPLET_UUID;
      const destination = join(cinnamonAppletsDirectory(), installedUuid);

      await mkdir(dirname(destination), { recursive: true });
      await rm(destination, { force: true, recursive: true });
      await cp(config.build.outDir, destination, { recursive: true });

      if (installMode === "dev") await rewriteDevelopmentMetadata(destination, installedUuid);
      await reloadApplet((message) => this.warn(message), installedUuid);

      this.info(`Installed ${installedUuid} at ${destination}`);
    },
  };
}

function getInstallMode(mode: string): InstallMode | undefined {
  if (mode === "local-install") return "local";
  if (mode === "dev-install") return "dev";
  return undefined;
}

function cinnamonAppletsDirectory(): string {
  const dataHome = process.env.XDG_DATA_HOME;
  return join(
    dataHome === undefined || dataHome === "" ? join(homedir(), ".local", "share") : dataHome,
    "cinnamon",
    "applets",
  );
}

async function rewriteDevelopmentMetadata(
  destination: string,
  installedUuid: string,
): Promise<void> {
  const metadataPath = join(destination, "metadata.json");
  const metadata = await readFile(metadataPath, "utf8");
  const sourceUuid = readMetadataString(metadata, "uuid");
  if (sourceUuid !== APPLET_UUID) {
    throw new Error(`Expected metadata uuid ${APPLET_UUID}, got ${sourceUuid}`);
  }

  const name = readMetadataString(metadata, "name");
  const withUuid = replaceMetadataString(metadata, "uuid", installedUuid);
  const withName = replaceMetadataString(withUuid, "name", `(${DEV_PREFIX.slice(0, -1)}) ${name}`);
  await writeFile(metadataPath, withName, "utf8");
}

function readMetadataString(metadata: string, field: "name" | "uuid"): string {
  const match = metadata.match(new RegExp(`"${field}"\\s*:\\s*"([^"\\\\]*(?:\\\\.[^"\\\\]*)*)"`));
  if (match === null || match[1] === undefined) {
    throw new Error(`Expected metadata.json to contain a string field named ${field}`);
  }
  // SAFETY: The regex matched one complete JSON string token and the wrapper preserves its type.
  return JSON.parse(`"${match[1]}"`) as string;
}

function replaceMetadataString(metadata: string, field: "name" | "uuid", value: string): string {
  const pattern = new RegExp(`("${field}"\\s*:\\s*")([^"\\\\]*(?:\\\\.[^"\\\\]*)*)(")`);
  if (!pattern.test(metadata)) throw new Error(`Expected metadata.json to contain ${field}`);
  const encodedValue = JSON.stringify(value).slice(1, -1);
  return metadata.replace(pattern, `$1${encodedValue}$3`);
}

async function reloadApplet(warn: (message: string) => void, installedUuid: string): Promise<void> {
  try {
    await execFileAsync("/usr/bin/cinnamon-dbus-command", ["ReloadXlet", installedUuid, "APPLET"]);
  } catch (error) {
    warn(
      `Installed ${installedUuid}, but Cinnamon could not reload it automatically: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}

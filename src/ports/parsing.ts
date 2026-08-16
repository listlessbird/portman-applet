import { Result, type Result as ResultType } from "better-result";

import { PortOutputMalformed } from "./errors.ts";
import type { OpenPort, PortProcess } from "./models.ts";

const PROCESS_PROTECTION = new Set([
  "cinnamon",
  "containerd",
  "dbus-daemon",
  "dockerd",
  "init",
  "mariadbd",
  "mysqld",
  "networkmanager",
  "postgres",
  "redis-server",
  "sshd",
  "systemd",
]);

function parseAddress(
  value: string,
  line: number,
): ResultType<{ readonly host: string; readonly port: number }, PortOutputMalformed> {
  const separator = value.lastIndexOf(":");
  if (separator < 0) return Result.err(malformed("ss", line, `Invalid address: ${value}`));

  const port = Number(value.slice(separator + 1));
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    return Result.err(malformed("ss", line, `Invalid port in address: ${value}`));
  }

  const host = value.slice(0, separator).replace(/^\[/, "").replace(/\]$/, "") || "*";
  return Result.ok({ host, port });
}

function protectionReason(process: Pick<PortProcess, "pid" | "name">): string | undefined {
  const normalizedName = process.name.toLowerCase();
  if (process.pid <= 1) return `PID ${process.pid} is a core system process`;
  if (PROCESS_PROTECTION.has(normalizedName)) return `${process.name} is protected by default`;
  return undefined;
}

export function parseSs(stdout: string): ResultType<OpenPort[], PortOutputMalformed> {
  const ports = new Map<number, { readonly host: string; readonly processes: PortProcess[] }>();

  for (const [index, line] of stdout.split("\n").entries()) {
    const lineNumber = index + 1;
    const columns = line.trim().split(/\s+/);
    if (line.trim() === "") continue;
    if (columns[0] !== "LISTEN") continue;
    if (columns.length < 4) {
      return Result.err(malformed("ss", lineNumber, "LISTEN row has too few fields"));
    }

    const localAddress = columns[3];
    if (localAddress === undefined) {
      return Result.err(malformed("ss", lineNumber, "LISTEN row has no local address"));
    }
    const address = parseAddress(localAddress, lineNumber);
    if (address.isErr()) return address;
    const { host, port } = address.value;

    const userIndex = line.indexOf("users:");
    const userInfo = userIndex < 0 ? "" : line.slice(userIndex);
    const processes: PortProcess[] = [];
    const processPattern = /\("([^"]+)",pid=(\d+)/g;
    for (const match of userInfo.matchAll(processPattern)) {
      const pid = Number(match[2]);
      const name = match[1];
      if (
        !Number.isInteger(pid) ||
        name === undefined ||
        processes.some((process) => process.pid === pid)
      )
        continue;
      const base = { pid, name };
      const protectedReason = protectionReason(base);
      processes.push(protectedReason === undefined ? base : { ...base, protectedReason });
    }
    if (userInfo !== "" && processes.length === 0) {
      return Result.err(malformed("ss", lineNumber, "Invalid process owner field"));
    }

    const current = ports.get(port);
    if (current === undefined) {
      ports.set(port, { host, processes });
      continue;
    }

    for (const process of processes) {
      if (!current.processes.some((existing) => existing.pid === process.pid))
        current.processes.push(process);
    }
  }

  return Result.ok(
    Array.from(ports.entries())
      .sort(([left], [right]) => left - right)
      .map(([port, value]) => ({
        port,
        protocol: "tcp",
        host: value.host,
        processes: value.processes,
      })),
  );
}

export function parseProcessDetails(
  stdout: string,
): ResultType<Map<number, Omit<PortProcess, "pid" | "protectedReason">>, PortOutputMalformed> {
  const details = new Map<number, Omit<PortProcess, "pid" | "protectedReason">>();
  for (const [index, line] of stdout.split("\n").entries()) {
    const lineNumber = index + 1;
    if (line.trim() === "") continue;
    const match = line.trim().match(/^(\d+)\s+(\d+)\s+(\S+)\s+(\S+)\s+(\d+)\s*(.*)$/);
    if (match === null) return Result.err(malformed("ps", lineNumber, "Invalid process row"));

    const pid = Number(match[1]);
    const parentPid = Number(match[2]);
    const user = match[3];
    const name = match[4];
    const uptimeSeconds = Number(match[5]);
    const command = match[6]?.trim();
    if (![pid, parentPid, uptimeSeconds].every(Number.isInteger)) {
      return Result.err(malformed("ps", lineNumber, "Invalid numeric process field"));
    }
    if (user === undefined || name === undefined) {
      return Result.err(malformed("ps", lineNumber, "Missing process field"));
    }

    let detail: Omit<PortProcess, "pid" | "protectedReason"> = {
      name,
      user,
      parentPid,
      uptimeSeconds,
    };
    if (command !== undefined && command !== "") detail = { ...detail, command };
    details.set(pid, detail);
  }
  return Result.ok(details);
}

export function enrichPorts(
  ports: readonly OpenPort[],
  details: Map<number, Omit<PortProcess, "pid" | "protectedReason">>,
): OpenPort[] {
  return ports.map((port) => ({
    ...port,
    processes: port.processes.map((process) => {
      const detail = details.get(process.pid);
      if (detail === undefined) return process;
      const enriched = { ...process, ...detail };
      const protectedReason = protectionReason(enriched);
      return protectedReason === undefined ? enriched : { ...enriched, protectedReason };
    }),
  }));
}

export function containsDevelopmentPort(port: OpenPort): boolean {
  return port.port >= 3000 && port.port <= 9999;
}

function malformed(command: "ss" | "ps", line: number, detail: string): PortOutputMalformed {
  return new PortOutputMalformed({
    command,
    line,
    message: `${command} output was malformed on line ${line}: ${detail}`,
  });
}

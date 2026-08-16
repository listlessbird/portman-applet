import { Result } from "better-result";

import { gioCommandRunner, type CommandRunner } from "./command.ts";
import { ProcessOwnerUnavailable, ProcessStillListening, ProtectedProcess } from "./errors.ts";
import { scanPorts } from "./scan.ts";
import type { FreePortResult, KillResult, OpenPort, PortProcess } from "./models.ts";

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

export interface ProcessControlDependencies {
  readonly commandRunner: CommandRunner;
  readonly wait: (milliseconds: number) => Promise<void>;
}

const defaultDependencies: ProcessControlDependencies = {
  commandRunner: gioCommandRunner,
  wait,
};

function processIsListening(ports: readonly OpenPort[], pid: number): boolean {
  return ports.some((port) => port.processes.some((process) => process.pid === pid));
}

export async function stopProcess(
  process: PortProcess,
  dependencies: ProcessControlDependencies = defaultDependencies,
): Promise<KillResult> {
  if (process.protectedReason !== undefined) {
    return Result.err(
      new ProtectedProcess({
        pid: process.pid,
        message: process.protectedReason,
      }),
    );
  }

  return Result.gen(async function* () {
    yield* Result.await(dependencies.commandRunner.run(["kill", "-TERM", String(process.pid)]));

    await dependencies.wait(1000);
    const afterGraceful = yield* Result.await(scanPorts(true, dependencies.commandRunner));
    if (!processIsListening(afterGraceful, process.pid)) return Result.ok({ escalated: false });

    yield* Result.await(dependencies.commandRunner.run(["kill", "-KILL", String(process.pid)]));
    await dependencies.wait(300);

    const afterForce = yield* Result.await(scanPorts(true, dependencies.commandRunner));
    if (processIsListening(afterForce, process.pid)) {
      return Result.err(
        new ProcessStillListening({
          pid: process.pid,
          message: `PID ${process.pid} is still listening`,
        }),
      );
    }
    return Result.ok({ escalated: true });
  });
}

export async function freePort(
  port: OpenPort,
  dependencies: ProcessControlDependencies = defaultDependencies,
): Promise<FreePortResult> {
  if (port.processes.length === 0) {
    return Result.err(
      new ProcessOwnerUnavailable({
        port: port.port,
        message: "The process owner is unavailable",
      }),
    );
  }
  if (port.processes.some((process) => process.protectedReason !== undefined)) {
    const protectedProcess = port.processes.find(
      (process) => process.protectedReason !== undefined,
    );
    if (protectedProcess !== undefined) {
      return Result.err(
        new ProtectedProcess({
          pid: protectedProcess.pid,
          message: protectedProcess.protectedReason ?? "A protected process owns this port",
        }),
      );
    }
  }

  return Result.gen(async function* () {
    let escalated = false;
    for (const process of port.processes) {
      const outcome = yield* Result.await(stopProcess(process, dependencies));
      escalated ||= outcome.escalated;
    }
    return Result.ok({ escalated });
  });
}

import { Result } from "better-result";

import { gioCommandRunner, type CommandRunner } from "./command.ts";
import { parseProcessDetails, parseSs, enrichPorts, containsDevelopmentPort } from "./parsing.ts";
import type { OpenPort, PortScan } from "./models.ts";

/** Discover listening TCP ports and enrich them with process details when available. */
export async function scanPorts(
  includeSystemPorts: boolean,
  commandRunner: CommandRunner = gioCommandRunner,
): Promise<PortScan> {
  return Result.gen(async function* () {
    const socketOutput = yield* Result.await(commandRunner.run(["ss", "-H", "-ltnp"]));
    const ports = yield* parseSs(socketOutput);
    const pids = Array.from(
      new Set(ports.flatMap((port) => port.processes.map((process) => process.pid))),
    );
    if (pids.length === 0) {
      return Result.ok(filterPorts(ports, includeSystemPorts));
    }

    const detailsResult = await commandRunner.run([
      "ps",
      "-p",
      pids.join(","),
      "-o",
      "pid=,ppid=,user=,comm=,etimes=,args=",
    ]);
    const enrichedResult = detailsResult.match({
      ok: (detailsOutput) =>
        parseProcessDetails(detailsOutput).map((details) => enrichPorts(ports, details)),
      err: () => Result.ok(ports),
    });
    const enriched = yield* enrichedResult;
    return Result.ok(filterPorts(enriched, includeSystemPorts));
  });
}

function filterPorts(ports: readonly OpenPort[], includeSystemPorts: boolean): OpenPort[] {
  return includeSystemPorts ? [...ports] : ports.filter(containsDevelopmentPort);
}

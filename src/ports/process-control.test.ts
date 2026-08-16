import assert from "node:assert/strict";
import test from "node:test";

import { Result, type Result as ResultType } from "better-result";

import { CommandFailed, type StopError } from "./errors.ts";
import { freePort, stopProcess } from "./process-control.ts";
import type { OpenPort, PortProcess } from "./models.ts";

const process: PortProcess = { name: "node", pid: 1234 };
const listeningPort: OpenPort = {
  host: "127.0.0.1",
  port: 3000,
  processes: [process],
  protocol: "tcp",
};

class FakeCommandRunner {
  readonly calls: (readonly string[])[] = [];
  private readonly socketOutputs: readonly string[];
  private socketIndex = 0;

  constructor(socketOutputs: readonly string[]) {
    this.socketOutputs = socketOutputs;
  }

  readonly run = async (argv: readonly string[]): Promise<ResultType<string, CommandFailed>> => {
    this.calls.push(argv);
    if (argv[0] === "ss") {
      return Result.ok(this.socketOutputs[this.socketIndex++] ?? "");
    }
    if (argv[0] === "ps") return Result.ok("");
    if (argv[0] === "kill") return Result.ok("");
    return Result.err(
      new CommandFailed({ command: argv.join(" "), message: "Unexpected test command" }),
    );
  };
}

function makeDependencies(socketOutputs: readonly string[]) {
  const runner = new FakeCommandRunner(socketOutputs);
  return {
    runner,
    dependencies: { commandRunner: runner, wait: async () => {} },
  };
}

function listeningOutput(): string {
  return 'LISTEN 0 511 127.0.0.1:3000 0.0.0.0:* users:(("node",pid=1234,fd=21))';
}

function errorOf(result: ResultType<unknown, StopError>): StopError {
  assert.equal(result.status, "error");
  return result.error;
}

test("stops a process gracefully through the command boundary", async () => {
  const { runner, dependencies } = makeDependencies([""]);
  const result = await stopProcess(process, dependencies);

  assert.deepEqual(result, Result.ok({ escalated: false }));
  assert.deepEqual(
    runner.calls.map((argv) => argv[0]),
    ["kill", "ss"],
  );
});

test("escalates when SIGTERM leaves the port listening", async () => {
  const { runner, dependencies } = makeDependencies([listeningOutput(), ""]);
  const result = await stopProcess(process, dependencies);

  assert.deepEqual(result, Result.ok({ escalated: true }));
  assert.deepEqual(
    runner.calls.map((argv) => argv[0]),
    ["kill", "ss", "ps", "kill", "ss"],
  );
});

test("returns a typed failure when SIGKILL still leaves the port listening", async () => {
  const { dependencies } = makeDependencies([listeningOutput(), listeningOutput()]);
  const result = await stopProcess(process, dependencies);

  assert.equal(errorOf(result)._tag, "ProcessStillListening");
});

test("does not signal protected processes or ports without owners", async () => {
  const protectedProcess: PortProcess = {
    name: "systemd",
    pid: 1,
    protectedReason: "PID 1 is a core system process",
  };
  const protectedResult = await stopProcess(protectedProcess, makeDependencies([]).dependencies);
  const ownerResult = await freePort(
    { ...listeningPort, processes: [] },
    makeDependencies([]).dependencies,
  );

  assert.equal(errorOf(protectedResult)._tag, "ProtectedProcess");
  assert.equal(ownerResult.status, "error");
  if (ownerResult.status === "error")
    assert.equal(ownerResult.error._tag, "ProcessOwnerUnavailable");
});

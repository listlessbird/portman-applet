import { Result, type Result as ResultType } from "better-result";

import { CommandFailed } from "./errors.ts";

interface CommandOutput {
  readonly successful: boolean;
  readonly stdout: string;
  readonly stderr: string;
}

export interface CommandRunner {
  readonly run: (argv: readonly string[]) => Promise<ResultType<string, CommandFailed>>;
}

/** Execute a host command and translate Gio failures into a domain error. */
export function runCommand(argv: readonly string[]): Promise<ResultType<string, CommandFailed>> {
  const Gio = imports.gi.Gio;
  const processResult = Result.try({
    try: () =>
      Gio.Subprocess.new(
        [...argv],
        Gio.SubprocessFlags.SEARCH_PATH |
          Gio.SubprocessFlags.STDOUT_PIPE |
          Gio.SubprocessFlags.STDERR_PIPE,
      ),
    catch: (cause) =>
      new CommandFailed({
        command: argv.join(" "),
        message: cause instanceof Error ? cause.message : `Unable to run ${argv[0]}`,
        cause,
      }),
  });

  if (processResult.isErr()) return Promise.resolve(processResult);

  return Result.tryPromise({
    try: () => communicate(processResult.value),
    catch: (cause) =>
      new CommandFailed({
        command: argv.join(" "),
        message: cause instanceof Error ? cause.message : "Command failed",
        cause,
      }),
  }).then((communicationResult) =>
    communicationResult.match({
      ok: (output) =>
        output.successful
          ? Result.ok(output.stdout)
          : Result.err(
              new CommandFailed({
                command: argv.join(" "),
                message: output.stderr.trim() || `Command failed: ${argv[0]}`,
              }),
            ),
      err: (error) => Result.err(error),
    }),
  );
}

export const gioCommandRunner: CommandRunner = { run: runCommand };

function communicate(process: CinnamonGio.Subprocess): Promise<CommandOutput> {
  return new Promise((resolve, reject) => {
    process.communicate_utf8_async(null, null, (source, result) => {
      try {
        const [success, stdout, stderr] = source.communicate_utf8_finish(result);
        resolve({ successful: success && source.get_successful(), stdout, stderr });
      } catch (error) {
        reject(error);
      }
    });
  });
}

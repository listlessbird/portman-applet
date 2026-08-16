import { TaggedError } from "better-result";

export class CommandFailed extends TaggedError("CommandFailed")<{
  readonly command: string;
  readonly message: string;
  readonly cause?: unknown;
}> {}

export class PortOutputMalformed extends TaggedError("PortOutputMalformed")<{
  readonly command: "ss" | "ps";
  readonly line: number;
  readonly message: string;
}> {}

export class ProtectedProcess extends TaggedError("ProtectedProcess")<{
  readonly pid: number;
  readonly message: string;
}> {}

export class ProcessStillListening extends TaggedError("ProcessStillListening")<{
  readonly pid: number;
  readonly message: string;
}> {}

export class ProcessOwnerUnavailable extends TaggedError("ProcessOwnerUnavailable")<{
  readonly port: number;
  readonly message: string;
}> {}

export type ScanError = CommandFailed | PortOutputMalformed;
export type StopError =
  | CommandFailed
  | PortOutputMalformed
  | ProtectedProcess
  | ProcessStillListening;
export type FreePortError = StopError | ProcessOwnerUnavailable;

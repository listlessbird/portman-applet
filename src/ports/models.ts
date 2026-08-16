import type { Result as ResultType } from "better-result";

import type { FreePortError, ScanError, StopError } from "./errors.ts";

export interface PortProcess {
  readonly pid: number;
  readonly name: string;
  readonly user?: string;
  readonly parentPid?: number;
  readonly command?: string;
  readonly uptimeSeconds?: number;
  readonly protectedReason?: string;
}

export interface OpenPort {
  readonly port: number;
  readonly protocol: "tcp";
  readonly host: string;
  readonly processes: readonly PortProcess[];
}

export interface StopOutcome {
  readonly escalated: boolean;
}

export type PortScan = ResultType<readonly OpenPort[], ScanError>;
export type KillResult = ResultType<StopOutcome, StopError>;
export type FreePortResult = ResultType<StopOutcome, FreePortError>;

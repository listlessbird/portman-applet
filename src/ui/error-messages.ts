import type { FreePortError, ScanError, StopError } from "../ports/errors.ts";

export function scanErrorMessage(error: ScanError): string {
  return error.match({
    CommandFailed: () =>
      "The port inspection command failed. Check that ss is installed, then refresh.",
    PortOutputMalformed: () =>
      "The port inspection command returned an unsupported response. Refresh and try again.",
  });
}

export function stopErrorMessage(error: StopError): string {
  return error.match({
    CommandFailed: () => "The process stop command failed. The process was not confirmed stopped.",
    PortOutputMalformed: () =>
      "Port inspection returned an unsupported response, so the process state was not confirmed.",
    ProtectedProcess: () => "This process is protected. No signal was sent.",
    ProcessStillListening: () =>
      "The process is still listening after SIGTERM and SIGKILL. Inspect it manually.",
  });
}

export function freeErrorMessage(error: FreePortError): string {
  return error.match({
    CommandFailed: () => "The process stop command failed. The port was not confirmed free.",
    PortOutputMalformed: () =>
      "Port inspection returned an unsupported response, so the port state was not confirmed.",
    ProtectedProcess: () => "A protected process owns this port. No signal was sent.",
    ProcessStillListening: () =>
      "A process is still listening after SIGTERM and SIGKILL. Inspect it manually.",
    ProcessOwnerUnavailable: () =>
      "The port owner could not be identified. Try elevated inspection.",
  });
}

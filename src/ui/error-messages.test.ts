import assert from "node:assert/strict";
import test from "node:test";

import {
  CommandFailed,
  PortOutputMalformed,
  ProcessOwnerUnavailable,
  ProcessStillListening,
  ProtectedProcess,
} from "../ports/errors.ts";
import { freeErrorMessage, scanErrorMessage, stopErrorMessage } from "./error-messages.ts";

test("maps scan failures to safe user-facing messages", () => {
  const commandError = new CommandFailed({
    command: "ss -H -ltnp",
    message: "permission denied: internal detail",
  });
  const parseError = new PortOutputMalformed({
    command: "ss",
    line: 4,
    message: "ss output was malformed on line 4",
  });

  assert.equal(
    scanErrorMessage(commandError),
    "The port inspection command failed. Check that ss is installed, then refresh.",
  );
  assert.equal(
    scanErrorMessage(parseError),
    "The port inspection command returned an unsupported response. Refresh and try again.",
  );
  assert.doesNotMatch(scanErrorMessage(commandError), /internal detail/);
});

test("maps every stop and free-port failure", () => {
  const commandError = new CommandFailed({ command: "kill -TERM 1234", message: "failed" });
  const parseError = new PortOutputMalformed({
    command: "ps",
    line: 2,
    message: "malformed",
  });
  const protectedError = new ProtectedProcess({ pid: 1, message: "system process" });
  const listeningError = new ProcessStillListening({ pid: 1234, message: "still listening" });
  const ownerError = new ProcessOwnerUnavailable({ port: 3000, message: "owner unavailable" });

  assert.match(stopErrorMessage(commandError), /stop command failed/);
  assert.match(stopErrorMessage(parseError), /unsupported response/);
  assert.match(stopErrorMessage(protectedError), /protected/);
  assert.match(stopErrorMessage(listeningError), /still listening/);
  assert.match(freeErrorMessage(commandError), /not confirmed free/);
  assert.match(freeErrorMessage(parseError), /unsupported response/);
  assert.match(freeErrorMessage(protectedError), /protected/);
  assert.match(freeErrorMessage(listeningError), /still listening/);
  assert.match(freeErrorMessage(ownerError), /owner could not be identified/);
});

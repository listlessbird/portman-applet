import assert from "node:assert/strict";
import test from "node:test";

import { parseProcessDetails, parseSs } from "./parsing.ts";

test("parses listening ports and protects known system processes", () => {
  const result = parseSs(
    [
      'LISTEN 0 511 127.0.0.1:3000 0.0.0.0:* users:(("node",pid=1234,fd=21))',
      'LISTEN 0 128 [::1]:5432 [::]:* users:(("postgres",pid=55,fd=7))',
    ].join("\n"),
  );

  assert.equal(result.status, "ok");

  assert.deepEqual(result.value, [
    {
      host: "127.0.0.1",
      port: 3000,
      processes: [{ name: "node", pid: 1234 }],
      protocol: "tcp",
    },
    {
      host: "::1",
      port: 5432,
      processes: [
        {
          name: "postgres",
          pid: 55,
          protectedReason: "postgres is protected by default",
        },
      ],
      protocol: "tcp",
    },
  ]);
});

test("returns a typed error for malformed socket output", () => {
  const result = parseSs("LISTEN 0 128 127.0.0.1:not-a-port 0.0.0.0:*");

  assert.equal(result.status, "error");

  assert.equal(result.error._tag, "PortOutputMalformed");
  assert.equal(result.error.command, "ss");
  assert.equal(result.error.line, 1);
});

test("returns a typed error for malformed process-owner output", () => {
  const result = parseSs('LISTEN 0 128 127.0.0.1:3000 0.0.0.0:* users:(("node",pid=not-a-pid))');

  assert.equal(result.status, "error");

  assert.equal(result.error._tag, "PortOutputMalformed");
  assert.equal(result.error.command, "ss");
});

test("parses process details with command text", () => {
  const result = parseProcessDetails("1234 1000 ril node 42 node server.js --port 3000");

  assert.equal(result.status, "ok");

  assert.deepEqual(result.value.get(1234), {
    command: "node server.js --port 3000",
    name: "node",
    parentPid: 1000,
    uptimeSeconds: 42,
    user: "ril",
  });
});

test("returns a typed error for malformed process output", () => {
  const result = parseProcessDetails("not a process row");

  assert.equal(result.status, "error");

  assert.equal(result.error._tag, "PortOutputMalformed");
  assert.equal(result.error.command, "ps");
  assert.equal(result.error.line, 1);
});

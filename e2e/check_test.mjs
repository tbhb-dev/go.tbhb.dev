// SPDX-License-Identifier: Apache-2.0
// Copyright Tony Burns

// Runs check.mjs against the Worker's own entry point, served over HTTP, the
// way a deploy runs it against a deployed version. The server stands in for
// Cloudflare: it requires the version override header the deploy passes, and
// the Worker names its version.

import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { join } from "node:path";
import { test } from "node:test";

const runfiles = process.env.RUNFILES_DIR ?? process.env.TEST_SRCDIR;
const root = join(runfiles, "_main");
const { default: worker } = await import(join(root, "src", "index.ts"));

const VERSION = "7d2e4f60-1b3c-4a5d-8e9f-0a1b2c3d4e5f";
const OVERRIDE = "Cloudflare-Workers-Version-Overrides";
const PIN = `go-tbhb-dev-stg="${VERSION}"`;

async function serve(env) {
  const server = createServer(async (req, res) => {
    if (req.headers[OVERRIDE.toLowerCase()] !== PIN) {
      res.writeHead(412);
      res.end();
      return;
    }
    const response = await worker.fetch(
      new Request(`http://localhost${req.url}`, { headers: req.headers }),
      env,
    );
    res.writeHead(response.status, Object.fromEntries(response.headers));
    res.end(Buffer.from(await response.arrayBuffer()));
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  return server;
}

function check(url, { headers = { [OVERRIDE]: PIN }, version = VERSION } = {}) {
  const child = spawn(process.execPath, [join(root, "e2e", "check.mjs")], {
    env: {
      ...process.env,
      WORKER_URL: url,
      WORKER_REQUEST_HEADERS: JSON.stringify(headers),
      WORKER_VERSION_ID: version,
    },
  });
  let output = "";
  child.stdout.on("data", (d) => (output += d));
  child.stderr.on("data", (d) => (output += d));
  return new Promise((r) =>
    child.on("close", (status) => r({ status, output })),
  );
}

const env = { CF_VERSION_METADATA: { id: VERSION } };

test("passes against a working Worker", async () => {
  const server = await serve(env);
  const { port } = server.address();
  const r = await check(`http://127.0.0.1:${port}`);
  server.close();
  assert.equal(r.status, 0, r.output);
  assert.match(r.output, /passed/);
});

test("fails when the request headers aren't sent", async () => {
  const server = await serve(env);
  const { port } = server.address();
  const r = await check(`http://127.0.0.1:${port}`, { headers: {} });
  server.close();
  assert.equal(r.status, 1);
  assert.match(r.output, /status 412/);
});

test("fails when another version answers", async () => {
  const server = await serve(env);
  const { port } = server.address();
  const other = "00000000-0000-4000-8000-000000000000";
  const r = await check(`http://127.0.0.1:${port}`, { version: other });
  server.close();
  assert.equal(r.status, 1);
  assert.match(
    r.output,
    new RegExp(`version ${VERSION} answered, expected ${other}`),
  );
});

test("records an unreachable Worker as a failure", async () => {
  const server = await serve(env);
  const { port } = server.address();
  await new Promise((r) => server.close(r));
  const r = await check(`http://127.0.0.1:${port}`);
  assert.equal(r.status, 1);
  assert.match(r.output, /FAIL: .*GET failed/);
  assert.doesNotMatch(r.output, /at async/);
});

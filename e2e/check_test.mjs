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

// `pinned` false serves every request, as the live URL does after the
// traffic move; `rewrite` turns the Worker's response into a broken one.
async function serve(env, { pinned = true, rewrite = (r) => r } = {}) {
  const server = createServer(async (req, res) => {
    if (pinned && req.headers[OVERRIDE.toLowerCase()] !== PIN) {
      res.writeHead(412);
      res.end();
      return;
    }
    const response = rewrite(
      await worker.fetch(
        new Request(`http://localhost${req.url}`, { headers: req.headers }),
        env,
      ),
    );
    res.writeHead(response.status, Object.fromEntries(response.headers));
    res.end(Buffer.from(await response.arrayBuffer()));
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  return server;
}

// Runs check.mjs with the deploy's variables; a variable set to undefined is
// left out of its environment.
function check(url, vars = {}) {
  const env = {
    ...process.env,
    WORKER_URL: url,
    WORKER_REQUEST_HEADERS: JSON.stringify({ [OVERRIDE]: PIN }),
    WORKER_VERSION_ID: VERSION,
    ...vars,
  };
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) {
      delete env[key];
    }
  }
  const child = spawn(process.execPath, [join(root, "e2e", "check.mjs")], {
    env,
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
  const r = await check(`http://127.0.0.1:${port}`, {
    WORKER_REQUEST_HEADERS: "{}",
  });
  server.close();
  assert.equal(r.status, 1);
  assert.match(r.output, /status 412/);
});

test("fails when another version answers", async () => {
  const server = await serve(env);
  const { port } = server.address();
  const other = "00000000-0000-4000-8000-000000000000";
  const r = await check(`http://127.0.0.1:${port}`, {
    WORKER_VERSION_ID: other,
  });
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

test("fails without WORKER_URL", async () => {
  const r = await check(undefined);
  assert.equal(r.status, 1);
  assert.match(r.output, /WORKER_URL must be set/);
});

test("checks the live URL without headers or a version to match", async () => {
  // As a check run by hand: no override headers and no expected version, so
  // a Worker naming any version passes.
  const other = { CF_VERSION_METADATA: { id: "another-version" } };
  const server = await serve(other, { pinned: false });
  const { port } = server.address();
  const r = await check(`http://127.0.0.1:${port}`, {
    WORKER_REQUEST_HEADERS: undefined,
    WORKER_VERSION_ID: undefined,
  });
  server.close();
  assert.equal(r.status, 0, r.output);
  assert.match(r.output, /passed/);
});

test("fails when a redirect goes elsewhere", async () => {
  const server = await serve(env, {
    rewrite: (response) => {
      const headers = new Headers(response.headers);
      if (headers.has("location")) {
        headers.set("location", "https://example.com/");
      }
      return new Response(response.body, { status: response.status, headers });
    },
  });
  const { port } = server.address();
  const r = await check(`http://127.0.0.1:${port}`);
  server.close();
  assert.equal(r.status, 1);
  assert.match(r.output, /FAIL: the root .*: location https:\/\/example\.com\//);
});

test("fails when the go-get page lacks the go-import meta", async () => {
  const server = await serve(env, {
    rewrite: (response) =>
      new Response("", { status: response.status, headers: response.headers }),
  });
  const { port } = server.address();
  const r = await check(`http://127.0.0.1:${port}`);
  server.close();
  assert.equal(r.status, 1);
  assert.match(r.output, /FAIL: go get finds a module: the body lacks/);
});

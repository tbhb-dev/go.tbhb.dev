// SPDX-License-Identifier: Apache-2.0
// Copyright Tony Burns

// Runs check.mjs against the Worker's own entry point, served over HTTP, the
// way a deploy runs it against a deployed version. The server stands in for
// Cloudflare: it requires the version override header the deploy passes, and
// the Worker names its version.

import { createServer } from "node:http";
import { afterEach, expect, test, vi } from "vitest";
import worker from "../src/index.ts";
import { run } from "./check.mjs";

const VERSION = "7d2e4f60-1b3c-4a5d-8e9f-0a1b2c3d4e5f";
const OVERRIDE = "Cloudflare-Workers-Version-Overrides";
const PIN = `go-tbhb-dev-stg="${VERSION}"`;

const env = { CF_VERSION_METADATA: { id: VERSION } };

const servers = [];
afterEach(async () => {
  await Promise.all(
    servers.splice(0).map((s) => new Promise((r) => s.close(r))),
  );
  vi.unstubAllEnvs();
});

// The Worker behind a stand-in for Cloudflare's edge, at the returned URL.
// `pinned` false serves every request, as the live URL does after the
// traffic move; `rewrite` turns the Worker's response into a broken one.
async function serve({
  workerEnv = env,
  pinned = true,
  rewrite = (r) => r,
} = {}) {
  const server = createServer(async (req, res) => {
    if (pinned && req.headers[OVERRIDE.toLowerCase()] !== PIN) {
      res.writeHead(412);
      res.end();
      return;
    }
    const response = rewrite(
      await worker.fetch(
        new Request(`http://localhost${req.url}`, { headers: req.headers }),
        workerEnv,
      ),
    );
    res.writeHead(response.status, Object.fromEntries(response.headers));
    res.end(Buffer.from(await response.arrayBuffer()));
  });
  servers.push(server);
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  return `http://127.0.0.1:${server.address().port}`;
}

// The deploy's environment for a check against url.
function deploy(url, overrides = {}) {
  return {
    WORKER_URL: url,
    WORKER_REQUEST_HEADERS: JSON.stringify({ [OVERRIDE]: PIN }),
    WORKER_VERSION_ID: VERSION,
    ...overrides,
  };
}

// Runs the check, returning its status and everything it wrote.
async function check(checkEnv) {
  const lines = [];
  const out = {
    log: (line) => lines.push(line),
    error: (line) => lines.push(line),
  };
  const status = await run(checkEnv, out);
  return { status, output: lines.join("\n") };
}

test("passes against a working Worker", async () => {
  const r = await check(deploy(await serve()));
  expect(r.status, r.output).toBe(0);
  expect(r.output).toMatch(/passed$/);
});

test("fails when the request headers aren't sent", async () => {
  const r = await check(
    deploy(await serve(), { WORKER_REQUEST_HEADERS: "{}" }),
  );
  expect(r.status).toBe(1);
  expect(r.output).toMatch(/status 412/);
});

test("fails when another version answers", async () => {
  const other = "00000000-0000-4000-8000-000000000000";
  const r = await check(
    deploy(await serve(), { WORKER_VERSION_ID: other }),
  );
  expect(r.status).toBe(1);
  expect(r.output).toContain(`version ${VERSION} answered, expected ${other}`);
});

test("records an unreachable Worker as a failure", async () => {
  const url = await serve();
  await Promise.all(
    servers.splice(0).map((s) => new Promise((r) => s.close(r))),
  );
  const r = await check(deploy(url));
  expect(r.status).toBe(1);
  expect(r.output).toMatch(/FAIL: .*GET failed/);
});

test("fails without WORKER_URL", async () => {
  const r = await check({});
  expect(r.status).toBe(1);
  expect(r.output).toMatch(/WORKER_URL must be set/);
});

test("checks the live URL without headers or a version to match", async () => {
  // As a check run by hand: no override headers and no expected version, so
  // a Worker naming any version passes.
  const url = await serve({
    workerEnv: { CF_VERSION_METADATA: { id: "another-version" } },
    pinned: false,
  });
  const r = await check({ WORKER_URL: url });
  expect(r.status, r.output).toBe(0);
  expect(r.output).toMatch(/passed$/);
});

test("fails when a redirect goes elsewhere", async () => {
  const url = await serve({
    rewrite: (response) => {
      const headers = new Headers(response.headers);
      if (headers.has("location")) {
        headers.set("location", "https://example.com/");
      }
      return new Response(response.body, { status: response.status, headers });
    },
  });
  const r = await check(deploy(url));
  expect(r.status).toBe(1);
  expect(r.output).toMatch(
    /FAIL: the root .*: location https:\/\/example\.com\//,
  );
});

test("fails when the go-get page lacks the go-import meta", async () => {
  const url = await serve({
    rewrite: (response) =>
      new Response("", { status: response.status, headers: response.headers }),
  });
  const r = await check(deploy(url));
  expect(r.status).toBe(1);
  expect(r.output).toMatch(/FAIL: go get finds a module: the body lacks/);
});

test("logs to the console by default", async () => {
  const error = vi.spyOn(console, "error").mockImplementation(() => {});
  try {
    expect(await run({})).toBe(1);
    expect(error).toHaveBeenCalledWith("e2e: WORKER_URL must be set");
  } finally {
    error.mockRestore();
  }
});

test("main.mjs runs the check from the process environment", async () => {
  for (const [name, value] of Object.entries(deploy(await serve()))) {
    vi.stubEnv(name, value);
  }
  const log = vi.spyOn(console, "log").mockImplementation(() => {});
  try {
    await import("./main.mjs");
    expect(process.exitCode).toBe(0);
    expect(log).toHaveBeenCalledWith(expect.stringMatching(/passed$/));
  } finally {
    process.exitCode = undefined;
    log.mockRestore();
  }
});

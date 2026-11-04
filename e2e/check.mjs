// SPDX-License-Identifier: Apache-2.0
// Copyright Tony Burns

// The deploy's pre- and post-deploy check: exercises a deployed Worker as
// `go get` and a browser would. worker_deploy sets WORKER_URL,
// WORKER_VERSION_ID (the new version) and WORKER_REQUEST_HEADERS (the
// version override before the traffic move). Every response must name
// WORKER_VERSION_ID in Go-Vanity-Worker-Version, so a check that reached the
// old version fails.
//
// main.mjs runs it; check.test.mjs runs it against the Worker's own entry
// point.

// Runs the check against env's Worker and returns the exit status, writing
// progress to out.log and failures to out.error.
export async function run(env, out = console) {
  const url = env.WORKER_URL;
  if (!url) {
    out.error("e2e: WORKER_URL must be set");
    return 1;
  }
  const extra = JSON.parse(env.WORKER_REQUEST_HEADERS ?? "{}");
  const version = env.WORKER_VERSION_ID;
  const failures = [];

  // A response, or null after recording why the request failed: a timeout
  // or network error is a failed check, not a crash.
  async function call(name, path) {
    try {
      return await fetch(new URL(path, url), {
        headers: extra,
        redirect: "manual",
        signal: AbortSignal.timeout(15_000),
      });
    } catch (error) {
      failures.push(`${name}: GET failed: ${error.message}`);
      return null;
    }
  }

  async function expect(name, path, status, { location, contains } = {}) {
    const response = await call(name, path);
    if (response === null) {
      return;
    }
    const body = await response.text();
    const answered = response.headers.get("Go-Vanity-Worker-Version");
    if (response.status !== status) {
      failures.push(`${name}: status ${response.status}, expected ${status}`);
    } else if (version && answered !== version) {
      failures.push(
        `${name}: version ${answered} answered, expected ${version}`,
      );
    } else if (
      location !== undefined &&
      response.headers.get("location") !== location
    ) {
      failures.push(`${name}: location ${response.headers.get("location")}`);
    } else if (contains !== undefined && !body.includes(contains)) {
      failures.push(`${name}: the body lacks ${contains}`);
    } else {
      out.log(`e2e: ok: ${name}`);
    }
  }

  await expect("the root redirects to the organization", "/", 302, {
    location: "https://github.com/tbhb-dev",
  });
  await expect("an unknown module is not found", "/nope?go-get=1", 404);
  await expect("go get finds a module", "/ascm/internal?go-get=1", 200, {
    contains:
      '<meta name="go-import" content="go.tbhb.dev/ascm git https://github.com/tbhb-dev/ascm">',
  });
  await expect("a package redirects to pkg.go.dev", "/ascm/internal", 302, {
    location: "https://pkg.go.dev/go.tbhb.dev/ascm/internal",
  });

  if (failures.length > 0) {
    for (const failure of failures) {
      out.error(`e2e: FAIL: ${failure}`);
    }
    return 1;
  }
  out.log(`e2e: ${url} passed`);
  return 0;
}

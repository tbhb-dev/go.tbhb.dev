// SPDX-License-Identifier: Apache-2.0
// Copyright Tony Burns

import { describe, expect, it } from "vitest";
import { handle, MODULES } from "./vanity.ts";

function get(path: string): Response {
  return handle(new Request(`https://go.tbhb.dev${path}`));
}

describe("handle", () => {
  it("redirects the root to the GitHub organization", () => {
    const response = get("/");
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe(
      "https://github.com/tbhb-dev",
    );
  });

  it("refuses a module that isn't published", async () => {
    const response = get("/nope?go-get=1");
    expect(response.status).toBe(404);
    expect(await response.text()).toBe("not found\n");
  });

  it.each([...MODULES])("serves the go-import page for %s", async (name) => {
    const response = get(`/${name}/internal/x?go-get=1`);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe(
      "text/html; charset=utf-8",
    );
    expect(response.headers.get("cache-control")).toBe("public, max-age=300");
    const repo = `https://github.com/tbhb-dev/${name}`;
    expect(await response.text()).toBe(`<!doctype html>
<html><head><meta charset="utf-8">
<meta name="go-import" content="go.tbhb.dev/${name} git ${repo}">
<meta name="go-source" content="go.tbhb.dev/${name} ${repo} ${repo}/tree/main{/dir} ${repo}/blob/main{/dir}/{file}#L{line}">
</head><body>go get go.tbhb.dev/${name}</body></html>
`);
  });

  it("redirects a package path to pkg.go.dev", () => {
    const response = get("/ascm/internal/x");
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe(
      "https://pkg.go.dev/go.tbhb.dev/ascm/internal/x",
    );
  });

  it("redirects when go-get isn't 1", () => {
    const response = get("/ascm?go-get=0");
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe(
      "https://pkg.go.dev/go.tbhb.dev/ascm",
    );
  });

  it("publishes exactly the six modules", () => {
    expect([...MODULES].sort()).toEqual([
      "afakt",
      "afenc",
      "ascm",
      "avirt",
      "awrel",
      "gomodscan",
    ]);
  });
});

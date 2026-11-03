// SPDX-License-Identifier: Apache-2.0
// Copyright Tony Burns

import { describe, expect, it } from "vitest";
import worker, { type Env, VERSION_HEADER } from "./index.ts";

const env: Env = { CF_VERSION_METADATA: { id: "version-1" } };

function fetchPath(path: string): Response {
  return worker.fetch(new Request(`https://go.tbhb.dev${path}`), env);
}

describe("worker", () => {
  it("names its version on a page", async () => {
    const response = fetchPath("/ascm?go-get=1");
    expect(response.status).toBe(200);
    expect(response.headers.get(VERSION_HEADER)).toBe("version-1");
    expect(response.headers.get("content-type")).toBe(
      "text/html; charset=utf-8",
    );
    expect(await response.text()).toContain('name="go-import"');
  });

  it("names its version on a redirect and keeps its location", () => {
    const response = fetchPath("/");
    expect(response.status).toBe(302);
    expect(response.headers.get(VERSION_HEADER)).toBe("version-1");
    expect(response.headers.get("location")).toBe(
      "https://github.com/tbhb-dev",
    );
  });
});

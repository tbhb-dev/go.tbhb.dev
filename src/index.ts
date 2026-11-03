// SPDX-License-Identifier: Apache-2.0
// Copyright Tony Burns

import { handle } from "./vanity.ts";

/**
 * The response header that names the Worker version that answered, so a
 * deploy's checks can confirm they reached the version they meant to test.
 */
export const VERSION_HEADER = "Go-Vanity-Worker-Version";

/** The Worker's bindings: only its version. */
export interface Env {
  readonly CF_VERSION_METADATA: { readonly id: string };
}

export default {
  fetch(request, env): Response {
    const response = handle(request);
    const headers = new Headers(response.headers);
    headers.set(VERSION_HEADER, env.CF_VERSION_METADATA.id);
    return new Response(response.body, { status: response.status, headers });
  },
} satisfies ExportedHandler<Env>;

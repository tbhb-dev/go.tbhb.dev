// SPDX-License-Identifier: Apache-2.0
// Copyright Tony Burns

// Go vanity import server for go.tbhb.dev.
// go.tbhb.dev/<module>[/pkg...] -> github.com/tbhb-dev/<module>

const HOST = "go.tbhb.dev";
const ORG = "tbhb-dev";
const BRANCH = "main";

/** The modules that resolve. Add a name here to publish another module. */
export const MODULES: ReadonlySet<string> = new Set([
  "afakt",
  "afenc",
  "ascm",
  "avirt",
]);

/** The go-import and go-source page for a module, as `go get` reads it. */
function goGetPage(name: string): string {
  const root = `${HOST}/${name}`;
  const repo = `https://github.com/${ORG}/${name}`;
  return `<!doctype html>
<html><head><meta charset="utf-8">
<meta name="go-import" content="${root} git ${repo}">
<meta name="go-source" content="${root} ${repo} ${repo}/tree/${BRANCH}{/dir} ${repo}/blob/${BRANCH}{/dir}/{file}#L{line}">
</head><body>go get ${root}</body></html>
`;
}

/**
 * Answers a request: the root redirects to the GitHub organization, an
 * unknown module is not found, `?go-get=1` gets the go-import page, and any
 * other path under a module redirects to its pkg.go.dev page.
 */
export function handle(request: Request): Response {
  const url = new URL(request.url);
  const [name] = url.pathname.split("/").filter(Boolean);

  if (name === undefined) {
    return Response.redirect(`https://github.com/${ORG}`, 302);
  }
  if (!MODULES.has(name)) {
    return new Response("not found\n", { status: 404 });
  }
  if (url.searchParams.get("go-get") === "1") {
    return new Response(goGetPage(name), {
      headers: {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "public, max-age=300",
      },
    });
  }
  return Response.redirect(`https://pkg.go.dev/${HOST}${url.pathname}`, 302);
}

// SPDX-License-Identifier: Apache-2.0
// Copyright Tony Burns

// Go vanity import server for go.tbhb.dev.
// go.tbhb.dev/<module>[/pkg...] -> github.com/tbhb-dev/<module>

const HOST = "go.tbhb.dev";
const ORG = "tbhb-dev";
const BRANCH = "main";

// Only these modules resolve. Add a name here to publish another module.
const MODULES = new Set(["afakt", "afenc", "ascm", "avirt"]);

export default {
  fetch(request) {
    const url = new URL(request.url);
    const [name] = url.pathname.split("/").filter(Boolean);

    if (!name) {
      return Response.redirect(`https://github.com/${ORG}`, 302);
    }
    if (!MODULES.has(name)) {
      return new Response("not found\n", { status: 404 });
    }

    const root = `${HOST}/${name}`;
    const repo = `https://github.com/${ORG}/${name}`;

    if (url.searchParams.get("go-get") === "1") {
      const html = `<!doctype html>
<html><head><meta charset="utf-8">
<meta name="go-import" content="${root} git ${repo}">
<meta name="go-source" content="${root} ${repo} ${repo}/tree/${BRANCH}{/dir} ${repo}/blob/${BRANCH}{/dir}/{file}#L{line}">
</head><body>go get ${root}</body></html>
`;
      return new Response(html, {
        headers: {
          "content-type": "text/html; charset=utf-8",
          "cache-control": "public, max-age=300",
        },
      });
    }

    return Response.redirect(`https://pkg.go.dev/${HOST}${url.pathname}`, 302);
  },
};

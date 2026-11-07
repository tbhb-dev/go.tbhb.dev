# go.tbhb.dev

The Go vanity import server for `go.tbhb.dev`, a Cloudflare Worker. A module path `go.tbhb.dev/<module>` resolves to `github.com/tbhb-dev/<module>` for the modules listed in [src/vanity.ts](src/vanity.ts).

## Getting started

```sh
mise install
bazelisk run //:bazel_env
tbhbdev alpha install
bazelisk test //...
```

`bazelisk test //...` runs every lint, audit, and test gate. Each push to main deploys to the `go-tbhb-dev-stg` Worker at `go-stg.tbhb.dev`, then to `go-tbhb-dev-prd` at `go.tbhb.dev`. The documentation is in [docs/](docs/index.md).

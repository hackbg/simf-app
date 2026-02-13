# SimplicityHL Vault/Escrow/Oracle Prototype

This is an example project powered by the
experimental WASM-based SimplicityHL support
in [Fadroma](https://github.com/hackbg/fadroma),
the cross-chain framework by [Hack.bg](https://hack.bg).

## Architecture

We plan to implement the equivalent of "oracle-gated liquidity pools"
in the form of escrow program instances that require a signed witness
of the external price feed at the moment of fulfillment, in order to
release the funds.

## Install

A container build is in the works. Meanwhile, setup is manual:

### Obtain the source

Clone the repository with submodules:

```
git clone --recursive https://github.com/hackbg/simf-app
```

> ☝️ If you forget `--recursive`, use `git submodule update --init --recursive`
> to initialize the Git submodules:

### Dependencies

If you have Nix and Direnv, run `direnv allow` in repo to provide
minimum necessary tooling (**Just**, **Deno**, **Podman**) as defined in `shell.nix`.

Also required (and currently not automatically provided) is **Elements**.
Neither does the `shell.nix` attempt to provide a **Rust toolchain**.

> ☝️ This is because Elements in Nixpkgs as of last test does not support Simplicity;
> Rust/Clang toolchain provided by `rustup` under Nix may build an incompatible WASM.

### Build the WASM

SimplicityHL operations are performed by a WASM component,
defined by the submodule-of-submodule `fadroma/platform/SimplicityHL`.
You will need to compile it with:

```
just wasm
```

### Run the tests

Run the test suite in `test.ts` with:

```
just test
```

### Contribute!

Run `just -l` or read the `Justfile` for the full list
of pre-defined development actions.

## Deploy

The **oracle server** is started in the foreground with:

```
just server --chain=<RPCURL>
```

 * `RPCURL` is a chain's HTTP(S) RPC endpoint.
 * This will run in the foreground, listening until termination
   at the HTTP/WS endpoint referenced below as `APIURL`.

> ☝️ If you don't provide `RPCURL`, it will default to `spawn`.
>
> `--chain=spawn` tells the server to run a temporary
> `elementsregtest` chain for local testing.
>
> This requires a compatible version of `elementsd` to
> be on your `PATH`.

### Orchestration

> This part is not documented yet!

## Use

### CLI

The **oracle command interface** is invoked with:

```
just client --chain=<RPCURL> --oracle=<APIURL> <...ARGS>
```

  * `RPCURL` is a chain's HTTP(S) RPC endpoint,
  * `APIURL` is the oracle server component's HTTP/WS API endpoint.
  * `...ARGS` is the command to send to the oracle.

> ☝️ If you don't provide `APIURL`, it will default to `spawn`.
>
> `--oracle=spawn` will run a temporary oracle server,
> which will in turn conform to the `--chain` value.

#### Locking funds

> This part is not documented yet!

#### Price attestation

> This part is not documented yet!

#### Retrieving funds

> This part is not documented yet!

### SDK

> This part is not documented yet!

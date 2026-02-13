# SimplicityHL Vault/Escrow/Oracle Prototype

This is an example project powered by the
[experimental WASM-based SimplicityHL support](https://github.com/hackbg/simf)
in [Fadroma](https://github.com/hackbg/fadroma),
the cross-chain framework by [Hack.bg](https://hack.bg).

## Architecture

The **oracle** is a backend service which periodically emits an **attestation**
about the value of an external datum, such as the exchange price of a given token.

The **vault** is a SimplicityHL program which holds a certain amount of funds.
Its balance can be transferred by fulfilling the program's condition, which is
parameterized over the data attested by the oracle.

## Install

A container build is in the works. Meanwhile, setup is manual:

### Obtain the source

Clone the repository with submodules:

```
git clone --recursive https://github.com/hackbg/simf-app
cd simf-app
```

> ☝️ If you forgot `--recursive` - don't worry, it happens all the time.
>
> Run `git submodule update --init --recursive` in the root of the repo
> to initialize all Git submodules.

### Dependencies

If you have Nix and Direnv, run `direnv allow` in repo to provide
minimum necessary tooling (**Just**, **Deno**, **Podman**) as defined in `shell.nix`.

Also required (and currently not automatically provided) is **Elements**.

> ☝️ Elements in Nixpkgs as of last test does not support Simplicity.
>
> It's [easy to build a compatible version with Nix](https://github.com/hackbg/fadroma/blob/9a33722bc54ace7bda4f6ed28d48bdce1979ae18/shell.nix#L33-L41)
> but may compile for a long time, which is not a good first run experience.
>
> For now, have a look at the [official (static) binaries](https://github.com/ElementsProject/elements/releases/tag/elements-23.3.1) instead.

Neither does the `shell.nix` attempt to provide a **Rust toolchain**.

> ☝️ Rust/Clang toolchain provided by `rustup` plus Nix may build an incompatible WASM.
>
> We recommend users of that combination to build in the provided container as described below.

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
of pre-defined development actions. These are meant to
facilitate making and testin modifications to the code.

## Launch

The **oracle server** is started in the foreground with:

```
just server --rpcurl=<RPCURL>
```

 * `RPCURL` is a chain's HTTP(S) RPC endpoint.
 * This will run in the foreground, listening until termination
   at the HTTP/WS endpoint referenced below as `APIURL`.

> ☝️ The special form `--rpcurl=spawn` tells the server to
> run a temporary `elementsregtest` chain for local testing.
> This requires a compatible version of `elementsd` to
> be on your `PATH`.

## Use

### CLI

The **oracle command interface** is invoked with:

```
just client --rpcurl=<RPCURL> --apiurl=<APIURL> <...ARGS>
```

  * `RPCURL` is a chain's HTTP(S) RPC endpoint,
  * `APIURL` is the oracle server component's HTTP/WS API endpoint.
  * `...ARGS` is the command to send to the oracle.

> ☝️ The special form `--apiurl=spawn` tells the client to
> run a temporary oracle server process, which will in turn
> conform to the value of the `--rpcurl` options.

#### Locking funds

> This part is not documented yet!

#### Price attestation

> This part is not documented yet!

#### Retrieving funds

> This part is not documented yet!

### SDK

> This part is not documented yet!

### GUI

> This part is not documented yet!

## Deploy

### OCI

> This part is not documented yet!

### NixOS

> This part is not documented yet!

# SimplicityHL Vault/Escrow/Oracle Prototype

This is an example project powered by the
experimental WASM-based SimplicityHL support
in [Fadroma](https://github.com/hackbg/fadroma),
the cross-chain framework by [Hack.bg](https://hack.bg).

## Architecture

The **oracle** is a backend service which periodically emits an **attestation**
about the value of an external datum, such as the exchange price of a given token.

The **vault** is a SimplicityHL program which holds a certain amount of funds.
Its balance can be transferred by fulfilling the program's condition, which is
parameterized over the data attested by the oracle.

Now building the elementar vault: one which allows the holder of the attestation
to purchase a number of tokens proportional to the attested price.

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
of pre-defined development actions. These are meant to
facilitate making and testin modifications to the code.

## Deploy

The **oracle server** is started in the foreground with:

```
just server --chain=<RPCURL>
```

 * `RPCURL` is a chain's HTTP(S) RPC endpoint.
 * This will run in the foreground, listening until termination
   at the HTTP/WS endpoint referenced below as `APIURL`.

> ☝️ The special form `--chain=spawn` tells the server to
> run a temporary `elementsregtest` chain for local testing.
> This requires a compatible version of `elementsd` to
> be on your `PATH`.

### Orchestration

#### OCI

> This part is not documented yet!

#### NixOS

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

> ☝️ The special form `--oracle=spawn` tells the client to
> run a temporary oracle server process, which will in turn
> conform to the value of the `--chain` options.

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

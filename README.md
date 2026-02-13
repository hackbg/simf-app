# SimplicityHL Escrow/Oracle Prototype

This is an example project powered by the
experimental WASM-based SimplicityHL support
in [Fadroma](https://github.com/hackbg/fadroma),
the cross-chain framework by [Hack.bg](https://hack.bg).

## Architecture

We plan to implement the equivalent of "oracle-gated liquidity pools"
in the form of escrow program instances that require a signed witness
of the external price feed at the moment of fulfillment, in order to
release the funds.

### Locking funds

> This part is not documented yet!

### Price attestation

> This part is not documented yet!

### Retrieving funds

> This part is not documented yet!

## Usage

### Development

For testing, try this:

```
just client --chain=spawn --oracle=spawn
```

Run `just -l` or read the `Justfile` for DX overview.

If you have Nix and Direnv, run `direnv allow` in repo
to provide minimum necessary tooling (Just, Deno, Podman).

### Deployment

Setup and usage instructions will follow here as we build out the service.

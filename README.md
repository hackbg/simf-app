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

## Usage

### Locking funds

> This part is not documented yet!

### Price attestation

> This part is not documented yet!

### Retrieving funds

> This part is not documented yet!

## Development

If you have Nix and Direnv, run `direnv allow` in repo
to provide minimum necessary tooling (Just, Deno, Podman).

Currently, you need to provide your own `elementsd` and
`elements-cli`.

Run `just -l` or read the `Justfile` for a full list
of pre-defined development actions, such as the folloing:

### Iterating

To run the code in this repo, try this:

```
just client --chain=spawn --oracle=spawn
```

### Testing

Run the test suite in `test.ts` with:

```
just test
```

### Deployment

> This part is not documented yet!

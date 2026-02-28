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

Package and container builds are in the works. Meanwhile, you can obtain
the project via **Git checkout**:

```sh
git clone --recursive https://github.com/hackbg/simf-app
cd simf-app
just -l
```

> ☝️ If you forgot `--recursive`, don't worry. It happens all the time.
>
> Run `git submodule update --init --recursive` in the root of the repo
> to **initialize all Git submodules**.

### Dependencies

If you already have **Nix (unstable channel)** and **Direnv**, just run `direnv allow` in the repo.

This will bootstrap minimum necessary tooling (**Just**, **Deno**, **Podman**, **Elements**),
as defined in `shell.nix`.

> ☝️ The `shell.nix` does not attempt to provide a **Rust toolchain**.
>
> Uncomplicated use of **`rustup` under Nix** may involve incompatible Clang versions
> at different stages - which may build the WASM with the **Simplicity Jets silently missing**.
>
> That's why we recommend users build the WASM in the provided container - as described below.

### Build the WASM

SimplicityHL operations are performed by a **WASM module**, `fadroma/platform/SimplicityHL`.

Before first run, you will need to compile this with:

```sh
just wasm
```

### Run the tests

To make sure everything is in good order, run the **test suite** in `test.ts` with:

```sh
just test
```

### Contribute!

Read the `Justfile` for the full list of DX scripts.

These are meant to facilitate you in making and testing changes,
and are a good starting point to becoming fluent with the codebase.

## Operate

To run the **oracle API service** in the foreground:

```sh
just server --rpcurl=<RPCURL>
```

 * `RPCURL` is a chain's HTTP(S) RPC endpoint.
 * This will run in the foreground, listening until termination
   at the HTTP/WS endpoint referenced below as `APIURL`.

> ☝️ **The special form `--rpcurl=spawn`** tells the server to
> run a temporary `elementsregtest` chain for local testing.
> This requires a compatible version of `elementsd` to
> be on your `PATH`.

### API

> The API endpoints are not documented yet!

### OCI

> The OCI container images are not documented yet!

### NixOS

> The NixOS production setup is not documented yet!

## Use

To invoke the **oracle command interface**:

```sh
just client --rpcurl=<RPCURL> --apiurl=<APIURL> <...COMMAND>
```

  * `RPCURL` is a chain's HTTP(S) RPC endpoint,
  * `APIURL` is the oracle API service's HTTP/WS API endpoint.
  * `...COMMAND` is the command to send to the oracle.

> ☝️ **The special form `--apiurl=spawn`** tells the client to
> run a temporary oracle API service, which will in turn
> conform to the value of the `--rpcurl` options.

#### Locking funds

> This procedure is not documented yet!

#### Price attestation

> This procedure is not documented yet!

#### Retrieving funds

> This procedure is not documented yet!

### Web frontend


This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Babel](https://babeljs.io/) (or [oxc](https://oxc.rs) when used in [rolldown-vite](https://vite.dev/guide/rolldown)) for Fast Refresh
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/) for Fast Refresh

#### React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

#### Expanding the ESLint configuration

If you are developing a production application, we recommend updating the configuration to enable type-aware lint rules:

```js
export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...

      // Remove tseslint.configs.recommended and replace with this
      tseslint.configs.recommendedTypeChecked,
      // Alternatively, use this for stricter rules
      tseslint.configs.strictTypeChecked,
      // Optionally, add this for stylistic rules
      tseslint.configs.stylisticTypeChecked,

      // Other configs...
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```

You can also install [eslint-plugin-react-x](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-x) and [eslint-plugin-react-dom](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-dom) for React-specific lint rules:

```js
// eslint.config.js
import reactX from 'eslint-plugin-react-x'
import reactDom from 'eslint-plugin-react-dom'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...
      // Enable lint rules for React
      reactX.configs['recommended-typescript'],
      // Enable lint rules for React DOM
      reactDom.configs.recommended,
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```

### Desktop frontend

> The desktop app is not documented yet!

### SDK

This application aims to be simple enough that its constituent parts
can be exposed to full programmatic control as a matter of course:

```ts
import {
  Server, // Script the lifecycle of oracle servers
  Client, // Script calls to oracles
  Escrow, // Script the escrow program
  Vault   // Script the vault program
} from './path/to/index.ts';

// These examples are not written yet!
```

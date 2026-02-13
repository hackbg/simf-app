#!/usr/bin/env -S just -f

DENO_RUN := "deno run -P --unstable-kv --allow-run=$(which elementsd)"
CLIENT   := "./service/client.ts"
SERVER   := "./service/server.ts"

# Display available commands
[private]
usage:
  @just -l

# Build the WASM binary
wasm:
  cd fadroma/platform/SimplicityHL && just wasm

# Typecheck the source code
check:
  deno check --allow-import program/*.ts service/*.ts

# Run the application's test suite
test:
  deno test -P --no-check test.ts

# Run the platform integration test suite
test-simf:
  cd fadroma/platform/SimplicityHL && just test

# Run the framework test suite
test-fadroma:
  cd fadroma && just test

# Run the command-line client
client +ARGS='':
  #!/usr/bin/env bash
  set -ueo pipefail
  {{DENO_RUN}} {{CLIENT}} --chain=http://127.0.0.1:8941 --oracle=http://127.0.0.1:8940 {{ARGS}}

# Run the escrow service
server +ARGS='':
  #!/usr/bin/env bash
  set -ueo pipefail
  {{DENO_RUN}} {{SERVER}} --chain=spawn {{ARGS}}

#BIN_PROGRAM  := "./program/escrow.ts"
# Deposit funds as escrow program
#deploy price="1" amount="1":
#  {{BIN_PROGRAM}} deploy {{price}} {{amount}}
# Withdraw funds from program
#consume price="1" amount="1":
#  {{BIN_PROGRAM}} consume {{price}} {{amount}}

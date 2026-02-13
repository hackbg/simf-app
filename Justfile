#!/usr/bin/env -S just -f

ALLOW_IMPORT := "--allow-import=cdn.skypack.dev:443,deno.land:443,jsr.io:443"
ALLOW_ENV    := "--allow-env=FADROMA_SIMF_WASM,FADROMA_SIMF_WRAP,TERM_PROGRAM,TMPDIR,TMP,TEMP,NODE_V8_COVERAGE,COLUMNS"
ALLOW_FS     := "--allow-read=. --allow-write=/tmp/fadroma"
ALLOW_RUN    := "--allow-run=$(which elementsd)"
ALLOW_NET    := "--allow-net=127.0.0.1:8940,127.0.0.1:8941"
BIN_PROGRAM  := "./program/escrow.ts"
BIN_SERVER   := "./service/server.ts"
BIN_CLIENT   := "./service/client.ts"

# Display available commands
[private]
usage:
  @just -l

# Build the WASM binary
wasm:
  cd fadroma && just wasm-simf

# Deposit funds as escrow program
deploy price="1" amount="1":
  {{BIN_PROGRAM}} deploy {{price}} {{amount}}

# Withdraw funds from program
consume price="1" amount="1":
  {{BIN_PROGRAM}} consume {{price}} {{amount}}

# Run the escrow service
server +ARGS='':
  #!/usr/bin/env bash
  set -ueo pipefail
  deno run --unstable-kv {{ALLOW_FS}} {{ALLOW_IMPORT}} {{ALLOW_ENV}} {{ALLOW_RUN}} {{ALLOW_NET}} \
    {{BIN_SERVER}} --chain=spawn {{ARGS}}

# Run the command-line client
client +ARGS='':
  #!/usr/bin/env bash
  set -ueo pipefail
  deno run --unstable-kv {{ALLOW_FS}} {{ALLOW_IMPORT}} {{ALLOW_ENV}} {{ALLOW_RUN}} {{ALLOW_NET}} \
    {{BIN_CLIENT}} --chain=http://127.0.0.1:8941 --oracle=http://127.0.0.1:8940 {{ARGS}}

test-client:
  just client stat
  just client make
  just client stat
  just client take
  just client stat

# Run the application's test suite
test:
  deno test {{ALLOW_FS}} {{ALLOW_IMPORT}} {{ALLOW_ENV}} --no-check test.ts

# Run the platform integration test suite
test-simf:
  cd fadroma/platform/SimplicityHL && just test

# Run the framework test suite
test-fadroma:
  cd fadroma && just test

# Typecheck the project
check:
  deno check {{ALLOW_IMPORT}} program/*.ts service/*.ts

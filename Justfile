#!/usr/bin/env -S just -f

ALLOW_IMPORT := "--allow-import=cdn.skypack.dev:443,deno.land:443,jsr.io:443"

# Display available commands
[private]
usage:
  @just -l

# Typecheck the project
check:
  deno check {{ALLOW_IMPORT}} *.ts

# Run the test suite
test:
  deno test test.ts

# Run the framework's test suite
test-fadroma:
  cd fadroma && just test

# Build the WASM binary
wasm:
  cd fadroma && just wasm-simf

# Deposit funds as escrow program
deploy price="1" amount="1":
  ./escrow.ts deploy {{price}} {{amount}}

# Withdraw funds from program
consume price="1" amount="1":
  ./escrow.ts consume {{price}} {{amount}}

# Run the escrow service
server +ARGS='':
  #!/usr/bin/env bash
  set -ueo pipefail
  deno run \
    --allow-net=127.0.0.1:8940 \
    --allow-run=$(which elementsd) \
    --allow-read=.,../fadroma \
    {{ALLOW_IMPORT}} \
    --allow-env=FADROMA_SIMF_WASM,FADROMA_SIMF_WRAP,TERM_PROGRAM,TMPDIR,TMP,TEMP,NODE_V8_COVERAGE \
    --allow-write=/tmp/fadroma \
    server.ts --chain=spawn {{ARGS}}

# Run the command-line client
client +ARGS='':
  #!/usr/bin/env bash
  set -ueo pipefail
  deno run \
    --allow-net=127.0.0.1:8940,127.0.0.1:8941 \
    --allow-run=$(which elementsd) \
    --allow-read=.,../fadroma \
    {{ALLOW_IMPORT}} \
    --allow-env=FADROMA_SIMF_WASM,FADROMA_SIMF_WRAP,TERM_PROGRAM,TMPDIR,TMP,TEMP,NODE_V8_COVERAGE \
    --allow-write=/tmp/fadroma \
    client.ts --chain=spawn --oracle=spawn {{ARGS}}

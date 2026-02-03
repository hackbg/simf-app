#!/usr/bin/env -S just -f

ALLOW_IMPORT := "--allow-import=cdn.skypack.dev:443,deno.land:443,jsr.io:443"

[private]
usage:
  @just -l

check:
  deno check {{ALLOW_IMPORT}} *.ts

server +ARGS='':
  deno run \
    --allow-net=127.0.0.1:8940 \
    --allow-run=elementsd \
    --allow-read=.,../fadroma \
    {{ALLOW_IMPORT}} \
    --allow-env=FADROMA_SIMF_WASM,FADROMA_SIMF_WRAP,TERM_PROGRAM,TMPDIR,TMP,TEMP,NODE_V8_COVERAGE \
    --allow-write=/tmp/fadroma \
    server.ts --chain=spawn {{ARGS}}

client +ARGS='':
  deno run \
    --allow-net=127.0.0.1:8940,127.0.0.1:8941 \
    --allow-run=elementsd \
    --allow-read=.,../fadroma \
    {{ALLOW_IMPORT}} \
    --allow-env=FADROMA_SIMF_WASM,FADROMA_SIMF_WRAP,TERM_PROGRAM,TMPDIR,TMP,TEMP,NODE_V8_COVERAGE \
    --allow-write=/tmp/fadroma \
    client.ts --chain=spawn --oracle=spawn {{ARGS}}

deploy price="1" amount="1":
  ./escrow.ts deploy {{price}} {{amount}}

consume price="1" amount="1":
  ./escrow.ts consume {{price}} {{amount}}

test:
  deno test test.ts

test-fadroma:
  cd fadroma && just test

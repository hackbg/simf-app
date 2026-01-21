#!/usr/bin/env -S just -f

server +ARGS='':
  deno run \
    --allow-net=127.0.0.1:8940 \
    --allow-run=elementsd \
    --allow-read=.,../fadroma \
    --allow-import=cdn.skypack.dev:443,deno.land:443,jsr.io:443 \
    --allow-env=FADROMA_SIMF_WASM,FADROMA_SIMF_WRAP,TERM_PROGRAM,TMPDIR,TMP,TEMP,NODE_V8_COVERAGE \
    --allow-write=/tmp/fadroma \
    server.ts --chain=spawn {{ARGS}}

client +ARGS='':
  deno run \
    --allow-net=127.0.0.1:8940,127.0.0.1:8941 \
    --allow-run=elementsd \
    --allow-read=.,../fadroma \
    --allow-import=cdn.skypack.dev:443,deno.land:443,jsr.io:443 \
    --allow-env=FADROMA_SIMF_WASM,FADROMA_SIMF_WRAP,TERM_PROGRAM,TMPDIR,TMP,TEMP,NODE_V8_COVERAGE \
    --allow-write=/tmp/fadroma \
    client.ts --chain=spawn --oracle=spawn {{ARGS}}

deploy price="1" amount="1":
  ./escrow.ts deploy {{price}} {{amount}}

consume price="1" amount="1":
  ./escrow.ts consume {{price}} {{amount}}

test:
  deno test escrow.test.ts

[private]
[default]
usage:
  @just -l

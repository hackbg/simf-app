#!/usr/bin/env -S just -f
test:
  deno test escrow.test.ts

deploy price="1" amount="1":
  ./escrow deploy {{price}} {{amount}}

consume price="1" amount="1":
  ./escrow consume {{price}} {{amount}}

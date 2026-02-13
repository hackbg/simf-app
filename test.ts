#!/usr/bin/env -S deno run
// FIXME: Write the tests!
import { Test } from 'fadroma';
export default Test(import.meta, 'Escrow',
  Test('Program', 'Vault', 'Escrow'),
  Test('Service', 'Client', 'Server'));

#!/usr/bin/env -S deno run
import { Test } from 'fadroma';
export default Test(import.meta, 'Escrow',
  Test('Program', 'Vault', 'Escrow'),
  Test('Service', 'Client', 'Server'));

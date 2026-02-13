#!/usr/bin/env -S deno run
import { Test } from 'fadroma';
export default Test(import.meta, 'Escrow',
  Test('Create'),
  Test('Revoke'),
  Test('Confirm'));

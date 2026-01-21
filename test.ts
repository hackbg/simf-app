#!/usr/bin/env -S deno run
import { Test as _Test } from 'fadroma';
const Test = _Test.default;
export default Test(import.meta, 'Escrow',
  Test('Create'),
  Test('Revoke'),
  Test('Confirm'));

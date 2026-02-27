#!/usr/bin/env nix-shell
{ pkgs ? import <nixpkgs> {} }: let
  deps = [ pkgs.nodejs_24 pkgs.pnpm ];
  env  = {};
  sh   = name: nativeBuildInputs: opts: pkgs.mkShell ({ inherit name nativeBuildInputs; } // opts);
in sh "oracle-react" deps env

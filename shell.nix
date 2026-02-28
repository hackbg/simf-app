#!/usr/bin/env nix-shell
{ pkgs ? import <nixpkgs> {} }: let
  deps = [
    pkgs.cloc
    pkgs.deno
    pkgs.nodejs_24
    pkgs.pnpm
    pkgs.just
    pkgs.podman
    # As of commit https://github.com/NixOS/nixpkgs/commit/cc7966a335a0a1c64a79c4d8056e6e9d3bee9376
    pkgs.elements
  ];
  env  = { DOCKER = "podman"; };
  sh   = name: nativeBuildInputs: opts: pkgs.mkShell ({ inherit name nativeBuildInputs; } // opts);
in sh "oracle-react" deps env

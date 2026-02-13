#!/usr/bin/env nix-shell
{ pkgs ? import <nixpkgs> {} }: let

  sh = name: nativeBuildInputs: opts:
    pkgs.mkShell ({ inherit name nativeBuildInputs; } // opts);

in sh "oracle" [

  pkgs.deno
  pkgs.just
  pkgs.podman

  # As of commit https://github.com/NixOS/nixpkgs/commit/cc7966a335a0a1c64a79c4d8056e6e9d3bee9376
  pkgs.elements

] {

  # Used by Justfile
  DOCKER = "podman";

}

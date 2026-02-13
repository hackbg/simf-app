#!/usr/bin/env nix-shell
{ pkgs ? import <nixpkgs> {} }: let

  sh = name: nativeBuildInputs: opts:
    pkgs.mkShell ({ inherit name nativeBuildInputs; } // opts);

in sh "oracle" [

  pkgs.deno
  pkgs.just
  pkgs.podman
  #pkgs.podman-compose

] {}

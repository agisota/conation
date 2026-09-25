{ lib, bun, fetchurl, stdenvNoCC }:
let
  version = "1.3.5";
  packageManager = (builtins.fromJSON (builtins.readFile ../package.json)).packageManager;
  assets = {
    aarch64-darwin = {
      name = "bun-darwin-aarch64.zip";
      hash = "sha256-2xdYikrqiASFaCXUvq0/BeHzcnbKYG8342m09y810/s=";
    };
    aarch64-linux = {
      name = "bun-linux-aarch64.zip";
      hash = "sha256-7QEAD4W9l3hSKK0oRdySoYYLgFSFaCbXMXaQrI+O50s=";
    };
    x86_64-linux = {
      name = "bun-linux-x64.zip";
      hash = "sha256-cFHYapJK7+o+C5YhO1/Y95wHk/nK5lNCM+Yn5cPbRmk=";
    };
  };
  sources = lib.mapAttrs (_: asset: fetchurl {
    url = "https://github.com/oven-sh/bun/releases/download/bun-v${version}/${asset.name}";
    inherit (asset) hash;
  }) assets;
in
assert packageManager == "bun@${version}";
bun.overrideAttrs (_final: previous: {
  inherit version;
  src = sources.${stdenvNoCC.hostPlatform.system}
    or (throw "Bun ${version} is unsupported on ${stdenvNoCC.hostPlatform.system}");
  passthru = previous.passthru // { inherit sources; };
})

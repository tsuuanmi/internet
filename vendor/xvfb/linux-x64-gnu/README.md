# Bundled Xvfb runtime

This directory is the self-contained Xvfb runtime used by `@tsuuanmi/internet`
on 64-bit glibc Linux hosts. It is installed as package data; no consumer
`postinstall` script, root access, or system package-manager mutation is used.

The runtime is based on Ubuntu 22.04 (Jammy) Xvfb
`2:21.1.4-2ubuntu1.7~22.04.16`. `PROVENANCE.json` records source package
versions and SHA-256 hashes for every bundled file. Component license notices
are under `licenses/`.

Runtime support is intentionally limited to Linux x64 with glibc 2.35 or newer.
The plugin falls back to a system `Xvfb` executable on other Linux targets or
when the bundled candidate fails, then to an inherited `DISPLAY`.

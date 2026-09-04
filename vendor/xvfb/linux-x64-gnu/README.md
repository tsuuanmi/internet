# Bundled browser display runtime

This directory is the self-contained Xvfb and x11vnc runtime used by
`@tsuuanmi/internet` on 64-bit glibc Linux hosts. It is installed as package
data; no consumer `postinstall` script, root access, or system package-manager
mutation is used.

The runtime is based on Ubuntu 20.04 (Focal) Xvfb
`2:1.20.13-1ubuntu1~20.04.20` and x11vnc `0.9.16-3`. The bundled x11vnc
supports Linux x64 with glibc 2.31 or newer, including Ubuntu 20.04. Bundled
Xvfb remains enabled on glibc 2.35 or newer because older Xvfb builds require
the host XKB compiler path. `PROVENANCE.json` records component versions and
SHA-256 hashes for every bundled file. Component license notices are under
`licenses/`.

On unsupported operating systems, architectures, or C libraries, the plugin
falls back to a system Xvfb/x11vnc executable or an inherited display.

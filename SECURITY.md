# Security Policy

## Reporting a vulnerability

Please report suspected security vulnerabilities in this SDK, the EntryBit API, or any EntryBit service by email to **security@entrybit.net**.

Do **not** report security vulnerabilities through public GitHub issues, discussions, or pull requests.

Include as much of the following as you can:

- A description of the issue and its impact
- Steps to reproduce, or a proof of concept
- Affected package version(s) and environment
- Any suggested remediation

We will acknowledge your report within 3 business days, keep you informed of progress, and credit you in the release notes if you wish once a fix ships.

## Supported versions

Security fixes are applied to the latest published minor version of `@entrybit/sdk`. Older versions do not receive backports; upgrade to the latest release to stay covered.

## Scope notes

- API keys (`eb_sk_...`) are secrets. The SDK never logs them; treat any situation where a key appears in logs or error output as a vulnerability and report it.
- The SDK makes requests only to the configured `baseUrl` (default `https://api.entrybit.net`). Any observed request to another host would be a vulnerability.

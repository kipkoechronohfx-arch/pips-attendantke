# Security Policy

## Supported Versions

| Version | Supported |
|---------|-----------|
| Latest  | ✅ Yes     |

## Reporting a Vulnerability

If you discover a security vulnerability in **Pips Attendant**, please report it responsibly:

1. **Do NOT open a public GitHub issue** for security vulnerabilities.
2. Email us at: **security@pipsattendant.com**
3. Include as much detail as possible:
   - Description of the vulnerability
   - Steps to reproduce
   - Potential impact
   - Suggested fix (optional)

We will acknowledge your report within **48 hours** and aim to release a patch within **7 days** for critical issues.

## Security Measures

- All HTTPS traffic enforced via `helmet` middleware
- JWT-based authentication with token revocation support
- Rate limiting on all API endpoints via `express-rate-limit`
- Input validation and sanitization on all routes
- Dependencies audited on every push via GitHub Actions (`npm audit`)
- Docker images scanned with Trivy on every build
- Node.js pinned to patched LTS releases (see `.nvmrc`)
- System certificate store updated in Docker builds

## Recent Security Actions

| Date | Action |
|------|--------|
| 2026-10-28 | Pinned Node.js to 22.23.4 (eMudhra CA / TLS / Brotli RCE CVEs) |
| 2026-10-28 | Updated Docker cert store — eMudhra CA compromise |
| 2026-10-28 | Added automated GitHub Actions security scanning |

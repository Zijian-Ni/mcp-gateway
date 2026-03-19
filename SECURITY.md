# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 0.1.x   | ✅ Yes             |

## Reporting a Vulnerability

**Please do not report security vulnerabilities through public GitHub issues.**

If you discover a security vulnerability in mcp-gateway, please report it responsibly:

### How to Report

1. **Email:** Send details to the author at GitHub: [@Zijian-Ni](https://github.com/Zijian-Ni)
   - Open a **private security advisory** via [GitHub Security Advisories](https://github.com/Zijian-Ni/mcp-gateway/security/advisories/new)

2. **Include in your report:**
   - Description of the vulnerability
   - Steps to reproduce
   - Potential impact assessment
   - Suggested fix (if you have one)

### What to Expect

- **Acknowledgment** within 48 hours
- **Initial assessment** within 5 business days
- **Fix timeline** communicated as soon as possible
- **Credit** in release notes (unless you prefer anonymity)

### Scope

The following are in scope for security reports:

- Authentication bypass (API key validation)
- Authorization bypass (tool/server access controls)
- Rate limiting bypass
- SQL injection in the logger
- Remote code execution via config parsing
- Path traversal vulnerabilities
- Denial of service vulnerabilities

### Out of Scope

- Vulnerabilities in upstream MCP servers (report to their maintainers)
- Issues requiring physical access to the server
- Social engineering attacks

## Security Best Practices

When deploying mcp-gateway:

1. **Never expose the gateway publicly without auth** — set `requireAuth: true`
2. **Use strong API keys** — minimum 32 random characters
3. **Store secrets in environment variables**, not in config files
4. **Restrict tool/server access** per API key using `allowedTools` and `allowedServers`
5. **Run with least privilege** — the gateway process should not run as root
6. **Keep the SQLite database private** — it may contain sensitive tool parameters
7. **Use TLS** if exposing the gateway over a network (reverse proxy with nginx/caddy)

## Disclosure Policy

We follow [coordinated vulnerability disclosure](https://en.wikipedia.org/wiki/Coordinated_vulnerability_disclosure). We ask that you:

- Give us reasonable time to fix the issue before public disclosure
- Avoid exploiting the vulnerability beyond what is necessary to demonstrate it
- Avoid accessing, modifying, or deleting data that is not yours

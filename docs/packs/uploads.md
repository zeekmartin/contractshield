# File Upload Policy Pack

## Purpose
Protect upload endpoints from file abuse.

## Threats covered
- Oversized uploads
- Zip bombs
- Malicious file types
- Path traversal

## Core protections
- Size limits
- MIME allowlist
- Page/file count limits
- Filename normalization

## Example policy
```yaml
rules:
  - type: upload
    maxBytes: 10MB
    allowedTypes:
      - application/pdf
      - image/png
```

# ContractShield

[![PyPI version](https://badge.fury.io/py/contractshield.svg)](https://badge.fury.io/py/contractshield)
[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)
[![Python](https://img.shields.io/pypi/pyversions/contractshield.svg)](https://pypi.org/project/contractshield/)

**Contract-First API Security for Python**

Protect your business logic, not just your formats. ContractShield validates API requests at the application layer using JSON Schema and CEL expressions.

## 🛡️ What is ContractShield?

ContractShield is an open-source API security middleware that:

- **Validates contracts** - Enforce JSON Schema + CEL business rules
- **Blocks vulnerabilities** - Detect SQLi, XSS, path traversal before they hit your code
- **Complements your WAF** - Protects business logic that infrastructure can't see

```
Client → WAF (format) → ContractShield (contract + logic) → Your App
```

## 📦 Installation

```bash
# Core package
pip install contractshield

# With FastAPI support
pip install contractshield[fastapi]

# With Flask support
pip install contractshield[flask]

# With CEL expressions
pip install contractshield[cel]

# Everything
pip install contractshield[all]
```

## 🚀 Quick Start

### FastAPI

```python
from fastapi import FastAPI
from contractshield.fastapi import ContractShieldMiddleware

app = FastAPI()

app.add_middleware(
    ContractShieldMiddleware,
    openapi_path="./openapi.yaml",
    enable_vulnerability_scan=True
)

@app.post("/api/transfer")
async def transfer(data: dict):
    # ContractShield has already validated:
    # - JSON Schema from OpenAPI spec
    # - CEL business rules
    # - No SQL injection / XSS in fields
    return {"status": "success"}
```

### Flask

```python
from flask import Flask
from contractshield.flask import ContractShieldMiddleware

app = Flask(__name__)
app.wsgi_app = ContractShieldMiddleware(
    app.wsgi_app,
    openapi_path="./openapi.yaml"
)

@app.route("/api/transfer", methods=["POST"])
def transfer():
    return {"status": "success"}
```

## 📋 OpenAPI Example

```yaml
# openapi.yaml
openapi: 3.0.3
info:
  title: Banking API
  version: 1.0.0
paths:
  /api/transfer:
    post:
      requestBody:
        content:
          application/json:
            schema:
              type: object
              required: [amount, currency]
              properties:
                amount:
                  type: number
                  minimum: 0.01
                  maximum: 100000
                currency:
                  type: string
                  enum: [CHF, EUR, USD]
              x-cel-expression: "amount > 0 && amount <= user.dailyLimit"
```

## 🔒 Vulnerability Detection

ContractShield scans all incoming data for:

| Vulnerability | Example |
|--------------|---------|
| SQL Injection | `' OR 1=1 --` |
| XSS | `<script>alert(1)</script>` |
| Path Traversal | `../../etc/passwd` |
| Prototype Pollution | `__proto__`, `constructor` |

## ⚡ Pro Features

Upgrade to Pro for advanced capabilities:

- **Learning Mode** - Auto-generate rules from traffic
- **Hot-reload** - Update rules without restart
- **Sink-aware RASP** - Context-aware protection
- **Analytics Dashboard** - Visualize threats

```python
from contractshield import ContractShield

shield = ContractShield(
    license="CSH-XXXX-XXXX-XXXX",
    learning_mode=True  # Pro feature
)
```

Get your license at [contractshield.dev/pricing](https://contractshield.dev/pricing)

## 📚 Documentation

- [Full Documentation](https://docs.contractshield.dev)
- [API Reference](https://docs.contractshield.dev/api)
- [Examples](https://github.com/zeekmartin/contractshield/tree/main/examples)

## 🔗 Links

- [Website](https://contractshield.dev)
- [GitHub](https://github.com/zeekmartin/contractshield)
- [npm packages](https://www.npmjs.com/org/cshield) (Node.js)
- [PyPI](https://pypi.org/project/contractshield/) (Python)

## 📄 License

Apache 2.0 - See [LICENSE](https://github.com/zeekmartin/contractshield/blob/main/LICENSE)

---

🇨🇭 Made in Switzerland
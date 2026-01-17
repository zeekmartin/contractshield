# ContractShield Licensing

ContractShield uses an **open-core** licensing model.

## Open Source (Apache 2.0)

The following packages are free and open source under the Apache 2.0 license:

| Package | Description |
|---------|-------------|
| `@contractshield/pdp` | Policy Decision Point (core engine) |
| `@contractshield/pep-express` | Express.js adapter |
| `@contractshield/pep-fastify` | Fastify adapter |
| `@contractshield/sidecar` | Standalone HTTP sidecar |
| `@contractshield/license` | License verification library |

You can use these packages in any project, commercial or not, without restrictions.

### What You Can Do

- Use in production for free
- Modify and distribute
- Include in commercial products
- No attribution required (but appreciated)

## Pro / Enterprise (Commercial)

The following packages require a commercial license:

| Package | Feature | Pro | Enterprise |
|---------|---------|:---:|:----------:|
| `@contractshield/sink-rasp` | Sink-aware RASP | ✅ | ✅ |
| `@contractshield/policy-ui` | Visual policy editor | ✅ | ✅ |
| `@contractshield/compliance-pci` | PCI-DSS compliance pack | ❌ | ✅ |
| `@contractshield/compliance-hipaa` | HIPAA compliance pack | ❌ | ✅ |
| `@contractshield/compliance-soc2` | SOC 2 compliance pack | ❌ | ✅ |

### Plan Comparison

| Feature | Pro | Enterprise |
|---------|-----|------------|
| Sink-aware RASP | ✅ | ✅ |
| Policy UI | ✅ | ✅ |
| Compliance packs | ❌ | ✅ |
| Priority support | Email | Dedicated |
| Custom integrations | ❌ | ✅ |
| On-premise deployment | ✅ | ✅ |
| License seats | Unlimited | Unlimited |
| Price | $499/mo | Contact us |

## Obtaining a License

1. Visit [contractshield.dev/pricing](https://contractshield.dev/pricing)
2. Choose your plan (Pro or Enterprise)
3. Complete payment or request a demo
4. Receive your license key via email

## Using Your License

### Environment Variable (Recommended)

```bash
export CONTRACTSHIELD_LICENSE_KEY="eyJhbGciOiJSUzI1Ni..."
```

### In Code

```typescript
import { initSinkRasp } from '@contractshield/sink-rasp';

// Using environment variable
initSinkRasp({
  licenseKey: process.env.CONTRACTSHIELD_LICENSE_KEY!,
  sql: true,
  fs: true,
});

// Or direct configuration
initSinkRasp({
  licenseKey: "eyJhbGciOiJSUzI1Ni...",
  sql: true,
});
```

### Verifying Your License

```typescript
import { verifyLicense, hasFeature } from '@contractshield/license';

const license = verifyLicense(process.env.CONTRACTSHIELD_LICENSE_KEY);

if (license.valid) {
  console.log(`Licensed to: ${license.customer}`);
  console.log(`Plan: ${license.plan}`);
  console.log(`Expires: ${license.expiresAt}`);
  console.log(`Features: ${license.features?.join(', ')}`);
} else {
  console.error(`License error: ${license.error}`);
}

// Check specific feature
if (hasFeature(process.env.CONTRACTSHIELD_LICENSE_KEY, 'sink-rasp')) {
  // Enable sink-rasp feature
}
```

## License Verification

- **Offline verification**: Licenses are verified using RSA signatures. No network call required.
- **No phone home**: ContractShield never sends data to our servers.
- **Self-contained**: The public key is embedded in the package.

### How It Works

1. License keys are signed JWTs (JSON Web Tokens)
2. The public key is embedded in `@contractshield/license`
3. Verification happens locally using Node.js crypto
4. No external dependencies required

## License Terms

### Duration

- Annual subscription (auto-renewal optional)
- License key expires after 1 year
- Renewal required for continued use of Pro features

### Seats

- **Pro**: Unlimited developers
- **Enterprise**: Unlimited developers

### Transferability

- Licenses are non-transferable
- Tied to the purchasing organization

### Termination

Your license terminates automatically if you:
- Fail to renew after expiration
- Breach the license agreement
- Redistribute Pro packages without authorization

## FAQ

### Can I use open source packages in production?

Yes, absolutely. The open source packages are production-ready and used by many companies.

### What happens when my license expires?

Pro features stop working, but open source features continue. Your application won't crash—it will gracefully degrade.

### Can I get a trial license?

Yes, contact [sales@contractshield.dev](mailto:sales@contractshield.dev) for a 30-day trial.

### Do you offer discounts?

- **Startups**: 50% off for companies <$1M ARR
- **Open Source**: Free for qualifying open source projects
- **Non-profits**: 30% off

### Is there a free tier?

The open source packages are free forever. Pro features require a license.

## Contributing

By contributing to ContractShield, you agree to our [Contributor License Agreement (CLA)](../CLA.md).

### Why a CLA?

The CLA allows us to:
- Relicense contributions in both open source and commercial versions
- Protect contributors and users legally
- Maintain flexibility for the project's future

Your contributions remain yours—you're just granting us permission to include them.

## Contact

- **Sales**: [sales@contractshield.dev](mailto:sales@contractshield.dev)
- **License issues**: [license@contractshield.dev](mailto:license@contractshield.dev)
- **Support**: [support@contractshield.dev](mailto:support@contractshield.dev)
- **Website**: [contractshield.dev](https://contractshield.dev)

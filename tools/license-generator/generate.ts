/**
 * ContractShield License Generator
 *
 * INTERNAL TOOL - NOT PUBLISHED
 *
 * Usage:
 *   npx tsx generate.ts <customer> <email> <plan> <features>
 *
 * Example:
 *   npx tsx generate.ts "Acme Corp" dev@acme.com pro sink-rasp,policy-ui
 *
 * Environment:
 *   LICENSE_PRIVATE_KEY_PATH - Path to private key (default: ../../.secrets/private.pem)
 */

import * as crypto from "crypto";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load private key (NEVER COMMIT)
const PRIVATE_KEY_PATH =
  process.env.LICENSE_PRIVATE_KEY_PATH || path.join(__dirname, "../../.secrets/private.pem");

interface GenerateLicenseOptions {
  customer: string;
  email: string;
  plan: "pro" | "enterprise";
  features: string[];
  seats?: number;
  validityDays?: number; // default: 365
}

/**
 * Generate a signed license key (JWT format).
 */
export function generateLicense(options: GenerateLicenseOptions): string {
  if (!fs.existsSync(PRIVATE_KEY_PATH)) {
    throw new Error(`Private key not found at ${PRIVATE_KEY_PATH}. Run generate-keys.sh first.`);
  }

  const privateKey = fs.readFileSync(PRIVATE_KEY_PATH, "utf8");

  const now = Math.floor(Date.now() / 1000);
  const payload = {
    id: crypto.randomUUID(),
    customer: options.customer,
    email: options.email,
    plan: options.plan,
    features: options.features,
    seats: options.seats,
    iat: now,
    exp: now + (options.validityDays || 365) * 24 * 60 * 60,
  };

  // JWT Header
  const header = { alg: "RS256", typ: "JWT" };
  const headerB64 = Buffer.from(JSON.stringify(header)).toString("base64url");
  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString("base64url");

  // Sign
  const signer = crypto.createSign("RSA-SHA256");
  signer.update(`${headerB64}.${payloadB64}`);
  const signature = signer.sign(privateKey, "base64url");

  return `${headerB64}.${payloadB64}.${signature}`;
}

/**
 * Generate a test license for development/testing.
 */
export function generateTestLicense(options?: Partial<GenerateLicenseOptions>): string {
  return generateLicense({
    customer: options?.customer || "Test Customer",
    email: options?.email || "test@example.com",
    plan: options?.plan || "pro",
    features: options?.features || ["sink-rasp", "policy-ui"],
    seats: options?.seats,
    validityDays: options?.validityDays || 30,
  });
}

/**
 * Generate an expired test license.
 */
export function generateExpiredLicense(): string {
  if (!fs.existsSync(PRIVATE_KEY_PATH)) {
    throw new Error(`Private key not found at ${PRIVATE_KEY_PATH}.`);
  }

  const privateKey = fs.readFileSync(PRIVATE_KEY_PATH, "utf8");

  const now = Math.floor(Date.now() / 1000);
  const payload = {
    id: crypto.randomUUID(),
    customer: "Expired Test",
    email: "expired@example.com",
    plan: "pro",
    features: ["sink-rasp"],
    iat: now - 86400 * 365, // 1 year ago
    exp: now - 86400, // Expired yesterday
  };

  const header = { alg: "RS256", typ: "JWT" };
  const headerB64 = Buffer.from(JSON.stringify(header)).toString("base64url");
  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString("base64url");

  const signer = crypto.createSign("RSA-SHA256");
  signer.update(`${headerB64}.${payloadB64}`);
  const signature = signer.sign(privateKey, "base64url");

  return `${headerB64}.${payloadB64}.${signature}`;
}

// CLI
const isMain = process.argv[1]?.endsWith("generate.ts") || process.argv[1]?.endsWith("generate.js");

if (isMain) {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.log(`
ContractShield License Generator

Usage:
  npx tsx generate.ts <customer> <email> <plan> <features> [validityDays]

Arguments:
  customer     - Customer name (e.g., "Acme Corp")
  email        - Contact email (e.g., dev@acme.com)
  plan         - License plan: pro | enterprise
  features     - Comma-separated features (e.g., sink-rasp,policy-ui)
  validityDays - Optional validity in days (default: 365)

Example:
  npx tsx generate.ts "Acme Corp" dev@acme.com pro sink-rasp,policy-ui

Test Licenses:
  npx tsx generate.ts --test        Generate a 30-day test license
  npx tsx generate.ts --expired     Generate an expired license (for testing)
`);
    process.exit(0);
  }

  try {
    let license: string;

    if (args[0] === "--test") {
      license = generateTestLicense();
      console.log("\n=== TEST LICENSE (30 days) ===\n");
    } else if (args[0] === "--expired") {
      license = generateExpiredLicense();
      console.log("\n=== EXPIRED LICENSE (for testing) ===\n");
    } else {
      if (args.length < 4) {
        console.error("Error: Missing required arguments");
        console.log("Usage: npx tsx generate.ts <customer> <email> <plan> <features>");
        process.exit(1);
      }

      const [customer, email, plan, featuresStr, validityDays] = args;
      const features = featuresStr.split(",").map((f) => f.trim());

      if (plan !== "pro" && plan !== "enterprise") {
        console.error('Error: plan must be "pro" or "enterprise"');
        process.exit(1);
      }

      license = generateLicense({
        customer,
        email,
        plan: plan as "pro" | "enterprise",
        features,
        validityDays: validityDays ? parseInt(validityDays, 10) : undefined,
      });

      console.log(`\n=== LICENSE KEY for ${customer} ===\n`);
    }

    console.log(license);
    console.log("\n================================\n");

    // Also show decoded payload
    const payloadB64 = license.split(".")[1];
    const payload = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf8"));
    console.log("Decoded payload:");
    console.log(JSON.stringify(payload, null, 2));
  } catch (err) {
    console.error("Error:", (err as Error).message);
    process.exit(1);
  }
}

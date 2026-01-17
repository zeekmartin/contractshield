#!/usr/bin/env node

import { startSidecar, type SidecarConfig } from "./server.js";

/**
 * ContractShield Sidecar CLI
 *
 * Environment variables:
 *   PORT          - Server port (default: 3100)
 *   HOST          - Server host (default: 0.0.0.0)
 *   LOG_LEVEL     - Log level (default: info)
 *   REDIS_URL     - Redis URL for replay store (optional)
 *   SERVICE_NAME  - Service name for logging (default: contractshield-sidecar)
 */

const config: SidecarConfig = {
  port: parseInt(process.env.PORT || "3100", 10),
  host: process.env.HOST || "0.0.0.0",
  logLevel: (process.env.LOG_LEVEL as SidecarConfig["logLevel"]) || "info",
  redisUrl: process.env.REDIS_URL,
  serviceName: process.env.SERVICE_NAME || "contractshield-sidecar",
};

console.log(`
╔═══════════════════════════════════════════════════════════════╗
║                                                               ║
║   🛡️  ContractShield Sidecar v0.3.0                           ║
║                                                               ║
║   Port:       ${config.port.toString().padEnd(46)}║
║   Host:       ${config.host.padEnd(46)}║
║   Log Level:  ${config.logLevel.padEnd(46)}║
║   Redis:      ${(config.redisUrl ? "configured" : "not configured (using memory)").padEnd(46)}║
║                                                               ║
╚═══════════════════════════════════════════════════════════════╝
`);

startSidecar(config).catch((error) => {
  console.error("Failed to start sidecar:", error);
  process.exit(1);
});

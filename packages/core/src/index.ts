/**
 * @cshield/core
 * Contract-first API security for Node.js
 * @see https://docs.contractshield.dev
 */

// Core PDP
export * from '@cshield/pdp';

// Express adapter
export { contractshield, contractshield as expressMiddleware, rawBodyCapture } from '@cshield/pep-express';
export type { ContractShieldOptions } from '@cshield/pep-express';

// Fastify adapter
export { contractshield as fastifyPlugin, buildRequestContext as buildFastifyContext } from '@cshield/pep-fastify';
export type { ContractShieldOptions as FastifyContractShieldOptions } from '@cshield/pep-fastify';

// Client SDK
export { ContractShieldClient } from '@cshield/client';
export type { ClientOptions } from '@cshield/client';

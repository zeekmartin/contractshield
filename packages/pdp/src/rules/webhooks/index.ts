import type { PolicyRoute, RequestContext, RuleHit, PdpOptions } from "../../types.js";
import type { WebhookPlugin, WebhookRouteConfig, WebhookValidationOptions } from "./types.js";

// Import built-in plugins
import { stripePlugin } from "./stripe.js";
import { githubPlugin } from "./github.js";
import { slackPlugin } from "./slack.js";
import { twilioPlugin } from "./twilio.js";

// Re-export types
export type { WebhookPlugin, SignatureResult, WebhookValidationOptions, WebhookRouteConfig } from "./types.js";

// Export individual plugins for tree-shaking
export { stripePlugin } from "./stripe.js";
export { githubPlugin } from "./github.js";
export { slackPlugin } from "./slack.js";
export { twilioPlugin } from "./twilio.js";

/**
 * Plugin registry.
 * Maps provider names to plugin implementations.
 */
const pluginRegistry = new Map<string, WebhookPlugin>([
  ["stripe", stripePlugin],
  ["github", githubPlugin],
  ["slack", slackPlugin],
  ["twilio", twilioPlugin],
]);

/**
 * Register a custom webhook plugin.
 * @param plugin The plugin to register.
 */
export function registerWebhookPlugin(plugin: WebhookPlugin): void {
  pluginRegistry.set(plugin.name, plugin);
}

/**
 * Get a webhook plugin by name.
 * @param name Provider name.
 * @returns The plugin or undefined if not found.
 */
export function getWebhookPlugin(name: string): WebhookPlugin | undefined {
  return pluginRegistry.get(name);
}

/**
 * List all registered webhook plugins.
 * @returns Array of plugin names.
 */
export function listWebhookPlugins(): string[] {
  return Array.from(pluginRegistry.keys());
}

/**
 * Verify webhook signature for a request.
 *
 * @param route The policy route with webhook configuration.
 * @param ctx The request context.
 * @param opts PDP options (includes getSecret).
 * @returns Array of rule hits (empty if valid, contains hit if invalid).
 */
export async function verifyWebhookSignature(
  route: PolicyRoute,
  ctx: RequestContext,
  opts: PdpOptions
): Promise<RuleHit[]> {
  const hits: RuleHit[] = [];
  const webhookConfig = route.webhook as WebhookRouteConfig | undefined;

  if (!webhookConfig?.provider) {
    return hits; // No webhook config, nothing to verify
  }

  const plugin = pluginRegistry.get(webhookConfig.provider);
  if (!plugin) {
    hits.push({
      id: `webhook.${webhookConfig.provider}.unknown`,
      severity: "critical",
      message: `Unknown webhook provider: ${webhookConfig.provider}`,
    });
    return hits;
  }

  const ruleId = `webhook.${plugin.name}.signature`;

  // Get secret
  const secret = getWebhookSecret(webhookConfig, route.id, ctx, opts);
  if (!secret) {
    hits.push({
      id: ruleId,
      severity: "critical",
      message: `${plugin.name} webhook secret not configured`,
    });
    return hits;
  }

  // Validation options
  const validationOpts: WebhookValidationOptions = {
    timestampTolerance: webhookConfig.timestampTolerance,
    requireRawBody: webhookConfig.requireRawBody,
  };

  // Validate signature
  const result = plugin.validateSignature(ctx, secret, validationOpts);

  if (!result.valid) {
    hits.push({
      id: ruleId,
      severity: "critical",
      message: result.reason || "Webhook signature validation failed",
    });
  }

  return hits;
}

/**
 * Check for webhook replay attacks.
 *
 * @param route The policy route with webhook configuration.
 * @param ctx The request context.
 * @param opts PDP options (includes replayStore).
 * @returns Array of rule hits (empty if not replayed, contains hit if replayed).
 */
export async function checkWebhookReplay(
  route: PolicyRoute,
  ctx: RequestContext,
  opts: PdpOptions
): Promise<RuleHit[]> {
  const hits: RuleHit[] = [];
  const webhookConfig = route.webhook as WebhookRouteConfig | undefined;

  if (!webhookConfig?.provider) {
    return hits;
  }

  // Check if replay protection is enabled (default: true)
  if (webhookConfig.replayProtection === false) {
    return hits;
  }

  // Test mode: fixture override
  if (ctx.webhook?.replayed === true) {
    hits.push({
      id: `webhook.${webhookConfig.provider}.replay`,
      severity: "critical",
      message: "Replayed webhook event (fixture)",
    });
    return hits;
  }

  if (ctx.webhook?.replayed === false) {
    return hits;
  }

  // Get plugin
  const plugin = pluginRegistry.get(webhookConfig.provider);
  if (!plugin) {
    return hits; // Unknown provider, already handled by signature check
  }

  // Get replay store
  const store = opts.replayStore;
  if (!store) {
    // No replay store configured, skip check (log in production?)
    return hits;
  }

  // Extract event ID
  const eventId = plugin.extractEventId(ctx);
  if (!eventId) {
    // No event ID available, can't check for replay
    return hits;
  }

  // Check if event was already seen
  const ttlSeconds = 86400; // 24 hours default
  const seen = await store.checkAndStore({
    provider: webhookConfig.provider as "stripe", // Type narrowing for interface
    eventId,
    ttlSeconds,
  });

  if (seen) {
    hits.push({
      id: `webhook.${webhookConfig.provider}.replay`,
      severity: "critical",
      message: `Replayed ${webhookConfig.provider} webhook event: ${eventId}`,
    });
  }

  return hits;
}

/**
 * Get webhook secret from config or opts.
 */
function getWebhookSecret(
  config: WebhookRouteConfig,
  routeId: string,
  ctx: RequestContext,
  opts: PdpOptions
): string | undefined {
  // Direct secret (not recommended, but supported)
  if (config.secret) {
    return config.secret;
  }

  // Secret from environment variable
  if (config.secretRef) {
    const envValue = process.env[config.secretRef];
    if (envValue) return envValue;
  }

  // Secret from opts.getSecret callback
  if (opts.getSecret) {
    return opts.getSecret({
      provider: config.provider as "stripe",
      routeId,
      ctx,
    });
  }

  return undefined;
}

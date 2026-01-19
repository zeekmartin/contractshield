/**
 * @cshield/pro
 * ContractShield Pro - Advanced API security with RASP and Learning Mode
 * @see https://docs.contractshield.dev/pro
 */

// Re-export core (primary API)
export * from '@cshield/core';

// Sink-aware RASP
export {
  initSinkRasp,
  shutdownSinkRasp,
  expressContextMiddleware,
  fastifyContextPlugin,
  getRequestContext as getRaspRequestContext,
  runWithContext,
  setContextValue,
  analyzeCommand,
  isCommandAllowed,
  analyzePath,
  isPathAllowed,
  isPathBlocked,
  analyzeUrl,
  isHostAllowed,
  isHostBlocked,
  configureReporter,
  createCollectingReporter,
} from '@cshield/sink-rasp';

export type {
  SinkRaspOptions,
  SinkRaspInstance,
  BlockEvent,
  DetectEvent,
  AnalysisResult as RaspAnalysisResult,
} from '@cshield/sink-rasp';

// Learning Mode
export {
  enableLearning,
  disableLearning,
  getStatus as getLearningStatus,
  analyze,
  suggest,
  collectSample,
} from '@cshield/learning';

export type {
  LearningConfig,
  RequestSample,
  SuggestionsOutput,
  LearningStatus,
  AnalysisResult as LearningAnalysisResult,
} from '@cshield/learning';

// Online License Validation
export {
  validateLicense,
  deactivateLicense,
  checkFeature,
  gateFeature,
  clearCache,
  clearAllCaches,
  getCacheStats,
} from '@cshield/license-online';

export type {
  LicenseValidationOptions,
  ValidationResult,
  ProFeature,
  FeatureCheckResult,
  CachedLicense,
} from '@cshield/license-online';

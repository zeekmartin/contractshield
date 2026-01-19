#!/usr/bin/env node
/**
 * ContractShield Learning Mode CLI
 *
 * @license Commercial
 */

import { Command } from "commander";
import * as fs from "fs";
import * as path from "path";
import { FileStorage } from "../storage/file.js";
import { analyzeRoute } from "../analyzers/index.js";
import { Suggester, formatYaml, formatJson } from "../suggester/index.js";
import type { LearningConfig, AnalysisResult } from "../types.js";
import { DEFAULT_CONFIG } from "../types.js";

const program = new Command();

program
  .name("contractshield-learn")
  .description("ContractShield Learning Mode CLI")
  .version("1.0.0");

/**
 * Status command - show learning status
 */
program
  .command("status")
  .description("Show learning mode status and statistics")
  .option("-p, --path <path>", "Storage path", DEFAULT_CONFIG.storage.path)
  .action(async (options) => {
    try {
      const config = loadConfig(options);
      const storage = new FileStorage(config.storage);

      const stats = await storage.getStats();
      const routes = await storage.getRoutes();

      console.log("\n📊 ContractShield Learning Mode Status\n");
      console.log(`Storage path: ${path.resolve(config.storage.path)}`);
      console.log(`Total samples: ${stats.totalSamples}`);
      console.log(`Routes observed: ${routes.length}`);
      console.log(`Storage size: ${formatBytes(stats.storageSize)}`);

      if (stats.oldestSample) {
        console.log(`\nTime range:`);
        console.log(`  Oldest: ${stats.oldestSample}`);
        console.log(`  Newest: ${stats.newestSample}`);
      }

      if (routes.length > 0) {
        console.log(`\nSamples by route:`);
        for (const route of routes.slice(0, 10)) {
          console.log(`  ${route}: ${stats.byRoute[route] || 0}`);
        }
        if (routes.length > 10) {
          console.log(`  ... and ${routes.length - 10} more routes`);
        }
      }

      console.log("");
    } catch (err) {
      console.error("Error:", (err as Error).message);
      process.exit(1);
    }
  });

/**
 * Analyze command - run analyzers on collected data
 */
program
  .command("analyze")
  .description("Analyze collected request samples")
  .option("-p, --path <path>", "Storage path", DEFAULT_CONFIG.storage.path)
  .option("-r, --route <route>", "Specific route to analyze")
  .option("--no-schema", "Disable schema inference")
  .option("--no-invariants", "Disable invariant discovery")
  .option("--no-vulnerabilities", "Disable vulnerability scanning")
  .action(async (options) => {
    try {
      const config = loadConfig(options);
      config.analyzers.schemaInference = options.schema !== false;
      config.analyzers.invariantDiscovery = options.invariants !== false;
      config.analyzers.vulnerabilityScanning = options.vulnerabilities !== false;

      const storage = new FileStorage(config.storage);
      const routes = options.route ? [options.route] : await storage.getRoutes();

      if (routes.length === 0) {
        console.log("No samples found. Start learning mode first.");
        return;
      }

      console.log(`\n🔍 Analyzing ${routes.length} route(s)...\n`);

      const results: AnalysisResult[] = [];

      for (const route of routes) {
        const samples = await storage.getSamples(route);
        console.log(`  ${route}: ${samples.length} samples`);

        const result = analyzeRoute(route, samples, config);
        results.push(result);

        // Print findings
        if (result.vulnerabilities?.length) {
          console.log(`    ⚠️  ${result.vulnerabilities.length} vulnerability pattern(s)`);
        }
        if (result.invariants?.length) {
          console.log(`    📋 ${result.invariants.length} invariant(s) discovered`);
        }
        if (result.schema) {
          console.log(`    📐 Schema inferred (confidence: ${(result.schema.confidence * 100).toFixed(0)}%)`);
        }
      }

      // Summary
      const totalVulns = results.reduce(
        (sum, r) => sum + (r.vulnerabilities?.length || 0),
        0
      );
      const totalInvariants = results.reduce(
        (sum, r) => sum + (r.invariants?.length || 0),
        0
      );

      console.log(`\n📊 Summary:`);
      console.log(`  Vulnerabilities found: ${totalVulns}`);
      console.log(`  Invariants discovered: ${totalInvariants}`);
      console.log(`  Routes with schema: ${results.filter((r) => r.schema).length}`);
      console.log(`\nRun 'contractshield-learn suggest' to generate rules.\n`);
    } catch (err) {
      console.error("Error:", (err as Error).message);
      process.exit(1);
    }
  });

/**
 * Suggest command - generate rule suggestions
 */
program
  .command("suggest")
  .description("Generate security rule suggestions")
  .option("-p, --path <path>", "Storage path", DEFAULT_CONFIG.storage.path)
  .option("-o, --output <file>", "Output file", "./suggested-rules.yaml")
  .option("-f, --format <format>", "Output format (yaml|json)", "yaml")
  .option("-c, --min-confidence <value>", "Minimum confidence (0.0-1.0)", "0.8")
  .action(async (options) => {
    try {
      const config = loadConfig(options);
      config.minConfidence = parseFloat(options.minConfidence);
      config.output = options.output;

      const storage = new FileStorage(config.storage);
      const routes = await storage.getRoutes();

      if (routes.length === 0) {
        console.log("No samples found. Start learning mode first.");
        return;
      }

      console.log(`\n🎯 Generating suggestions...\n`);

      // Analyze all routes
      const results: AnalysisResult[] = [];
      for (const route of routes) {
        const samples = await storage.getSamples(route);
        const result = analyzeRoute(route, samples, config);
        results.push(result);
      }

      // Generate suggestions
      const suggester = new Suggester(config);
      const output = suggester.generate(results);

      // Format output
      const formatted =
        options.format === "json" ? formatJson(output) : formatYaml(output);

      // Write to file
      fs.writeFileSync(options.output, formatted, "utf8");

      console.log(`✅ Generated ${output.suggestions.length} suggestion(s)`);
      console.log(`\nSummary:`);
      console.log(`  🔴 Critical: ${output.summary.critical}`);
      console.log(`  🟠 High: ${output.summary.high}`);
      console.log(`  🟡 Medium: ${output.summary.medium}`);
      console.log(`  🟢 Low: ${output.summary.low}`);
      console.log(`\nOutput written to: ${path.resolve(options.output)}\n`);

      // Show top suggestions
      if (output.suggestions.length > 0) {
        console.log("Top suggestions:");
        for (const s of output.suggestions.slice(0, 5)) {
          const icon = s.severity === "critical" ? "🔴" : s.severity === "high" ? "🟠" : "🟡";
          console.log(`  ${icon} [${s.severity}] ${s.id}`);
          console.log(`     ${s.evidence.slice(0, 80)}${s.evidence.length > 80 ? "..." : ""}`);
        }
        if (output.suggestions.length > 5) {
          console.log(`  ... and ${output.suggestions.length - 5} more`);
        }
        console.log("");
      }
    } catch (err) {
      console.error("Error:", (err as Error).message);
      process.exit(1);
    }
  });

/**
 * Clear command - clear all collected data
 */
program
  .command("clear")
  .description("Clear all collected samples")
  .option("-p, --path <path>", "Storage path", DEFAULT_CONFIG.storage.path)
  .option("-y, --yes", "Skip confirmation")
  .action(async (options) => {
    try {
      const config = loadConfig(options);
      const storage = new FileStorage(config.storage);

      const stats = await storage.getStats();

      if (stats.totalSamples === 0) {
        console.log("No samples to clear.");
        return;
      }

      if (!options.yes) {
        console.log(`\n⚠️  This will delete ${stats.totalSamples} samples.`);
        console.log(`Storage size: ${formatBytes(stats.storageSize)}`);
        console.log(`\nUse --yes to confirm.\n`);
        return;
      }

      await storage.clear();
      console.log(`✅ Cleared ${stats.totalSamples} samples.\n`);
    } catch (err) {
      console.error("Error:", (err as Error).message);
      process.exit(1);
    }
  });

/**
 * Purge command - remove expired samples
 */
program
  .command("purge")
  .description("Remove expired samples based on TTL")
  .option("-p, --path <path>", "Storage path", DEFAULT_CONFIG.storage.path)
  .option("-t, --ttl <seconds>", "TTL in seconds", String(DEFAULT_CONFIG.storage.ttl))
  .action(async (options) => {
    try {
      const config = loadConfig(options);
      config.storage.ttl = parseInt(options.ttl, 10);

      const storage = new FileStorage(config.storage);
      const purged = await storage.purgeExpired();

      console.log(`✅ Purged ${purged} expired samples.\n`);
    } catch (err) {
      console.error("Error:", (err as Error).message);
      process.exit(1);
    }
  });

function loadConfig(options: { path?: string }): LearningConfig {
  const config = { ...DEFAULT_CONFIG };

  if (options.path) {
    config.storage.path = options.path;
  }

  return config;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

program.parse();

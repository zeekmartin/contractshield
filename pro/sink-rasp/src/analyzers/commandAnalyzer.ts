/**
 * Command Injection Analyzer
 * Detects dangerous patterns in shell commands
 */

import type { AnalysisResult } from "../types.js";

// Patterns indicating command injection
const DANGEROUS_PATTERNS: Array<{ pattern: RegExp; name: string }> = [
  { pattern: /;\s*\w+/, name: "semicolon_chain" },
  { pattern: /\|\s*\w+/, name: "pipe_chain" },
  { pattern: /`[^`]+`/, name: "backtick_substitution" },
  { pattern: /\$\([^)]+\)/, name: "command_substitution" },
  { pattern: /\$\{[^}]+\}/, name: "variable_expansion" },
  { pattern: /&&\s*\w+/, name: "and_chain" },
  { pattern: /\|\|\s*\w+/, name: "or_chain" },
  { pattern: />\s*\/\w+/, name: "redirect_to_file" },
  { pattern: /<\s*\/\w+/, name: "redirect_from_file" },
  { pattern: /[\n\r]/, name: "newline_injection" },
  { pattern: /\$IFS/, name: "ifs_injection" },
  { pattern: /\x00/, name: "null_byte" },
];

// Known dangerous commands
const DANGEROUS_COMMANDS = new Set([
  // Destructive commands
  "rm",
  "rmdir",
  "dd",
  "mkfs",
  "format",
  "fdisk",
  "shutdown",
  "reboot",
  "halt",
  "poweroff",
  "init",
  // Privilege modification
  "chmod",
  "chown",
  "chgrp",
  "passwd",
  "useradd",
  "userdel",
  "usermod",
  "groupadd",
  "groupdel",
  "sudo",
  "su",
  // Network tools (potential for exfiltration)
  "curl",
  "wget",
  "nc",
  "netcat",
  "ncat",
  "telnet",
  "ftp",
  "scp",
  "rsync",
  "ssh",
  // Interpreters (code execution)
  "python",
  "python3",
  "python2",
  "perl",
  "ruby",
  "php",
  "node",
  "nodejs",
  "lua",
  "awk",
  "gawk",
  // Shells
  "bash",
  "sh",
  "zsh",
  "csh",
  "tcsh",
  "ksh",
  "fish",
  "dash",
  // Package managers
  "apt",
  "apt-get",
  "yum",
  "dnf",
  "pacman",
  "brew",
  "npm",
  "pip",
  "gem",
  // Other dangerous
  "eval",
  "exec",
  "source",
  ".",
  "xargs",
  "find",
  "nohup",
  "screen",
  "tmux",
  "at",
  "crontab",
]);

/**
 * Analyze a command string for injection vulnerabilities
 */
export function analyzeCommand(command: string): AnalysisResult {
  const foundPatterns: string[] = [];

  // Check for dangerous injection patterns
  for (const { pattern, name } of DANGEROUS_PATTERNS) {
    if (pattern.test(command)) {
      foundPatterns.push(`pattern:${name}`);
    }
  }

  // Check for dangerous commands
  const tokens = command.toLowerCase().split(/\s+/);
  for (const token of tokens) {
    // Extract base command from full path (e.g., /usr/bin/rm -> rm)
    const baseCmd = token.split("/").pop() || token;
    if (DANGEROUS_COMMANDS.has(baseCmd)) {
      foundPatterns.push(`dangerous_command:${baseCmd}`);
    }
  }

  if (foundPatterns.length > 0) {
    return {
      dangerous: true,
      reason: `Command injection detected: ${foundPatterns.slice(0, 3).join(", ")}`,
      patterns: foundPatterns,
    };
  }

  return { dangerous: false, reason: "", patterns: [] };
}

/**
 * Check if a command's base name is in the allowlist
 */
export function isCommandAllowed(
  command: string,
  allowedCommands: string[]
): boolean {
  const baseCommand = command.trim().split(/\s+/)[0];
  const baseName = baseCommand.split("/").pop() || baseCommand;
  return allowedCommands.includes(baseName);
}

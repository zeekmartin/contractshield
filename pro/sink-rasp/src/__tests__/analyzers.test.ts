import { describe, it, expect } from "vitest";
import { analyzeCommand, isCommandAllowed } from "../analyzers/commandAnalyzer.js";
import { analyzePath, isPathAllowed, isPathBlocked } from "../analyzers/pathAnalyzer.js";
import { analyzeUrl, isHostAllowed, isHostBlocked } from "../analyzers/urlAnalyzer.js";

describe("Command Analyzer", () => {
  describe("analyzeCommand", () => {
    it("allows safe commands", () => {
      expect(analyzeCommand("echo hello").dangerous).toBe(false);
      expect(analyzeCommand("ls -la").dangerous).toBe(false);
      expect(analyzeCommand("cat file.txt").dangerous).toBe(false);
    });

    it("detects semicolon injection", () => {
      const result = analyzeCommand("echo hello; rm -rf /");
      expect(result.dangerous).toBe(true);
      expect(result.reason).toContain("Command injection");
    });

    it("detects pipe injection", () => {
      const result = analyzeCommand("echo hello | cat /etc/passwd");
      expect(result.dangerous).toBe(true);
      expect(result.reason).toContain("Command injection");
    });

    it("detects backtick injection", () => {
      const result = analyzeCommand("echo `whoami`");
      expect(result.dangerous).toBe(true);
      expect(result.patterns).toContain("pattern:backtick_substitution");
    });

    it("detects $() command substitution", () => {
      const result = analyzeCommand("echo $(cat /etc/passwd)");
      expect(result.dangerous).toBe(true);
      expect(result.patterns).toContain("pattern:command_substitution");
    });

    it("detects && chaining", () => {
      const result = analyzeCommand("true && rm -rf /");
      expect(result.dangerous).toBe(true);
    });

    it("detects || chaining", () => {
      const result = analyzeCommand("false || rm -rf /");
      expect(result.dangerous).toBe(true);
    });

    it("detects dangerous commands", () => {
      expect(analyzeCommand("rm file.txt").dangerous).toBe(true);
      expect(analyzeCommand("curl http://evil.com").dangerous).toBe(true);
      expect(analyzeCommand("wget http://evil.com").dangerous).toBe(true);
      expect(analyzeCommand("bash -c 'echo hi'").dangerous).toBe(true);
    });

    it("detects newline injection", () => {
      const result = analyzeCommand("echo hello\nrm -rf /");
      expect(result.dangerous).toBe(true);
    });
  });

  describe("isCommandAllowed", () => {
    it("allows commands in allowlist", () => {
      expect(isCommandAllowed("git status", ["git"])).toBe(true);
      expect(isCommandAllowed("node app.js", ["node", "npm"])).toBe(true);
    });

    it("rejects commands not in allowlist", () => {
      expect(isCommandAllowed("rm -rf /", ["git"])).toBe(false);
      expect(isCommandAllowed("curl http://evil.com", ["git"])).toBe(false);
    });

    it("handles full paths", () => {
      expect(isCommandAllowed("/usr/bin/git status", ["git"])).toBe(true);
    });
  });
});

describe("Path Analyzer", () => {
  describe("analyzePath", () => {
    it("allows safe paths", () => {
      expect(analyzePath("/tmp/file.txt").dangerous).toBe(false);
      expect(analyzePath("./config.json").dangerous).toBe(false);
      expect(analyzePath("/var/log/app.log").dangerous).toBe(false);
    });

    it("detects path traversal", () => {
      const result = analyzePath("../../etc/passwd");
      expect(result.dangerous).toBe(true);
      expect(result.reason).toContain("Path traversal");
    });

    it("detects URL-encoded traversal", () => {
      expect(analyzePath("%2e%2e%2fetc/passwd").dangerous).toBe(true);
      expect(analyzePath("..%2fetc/passwd").dangerous).toBe(true);
    });

    it("detects sensitive paths", () => {
      expect(analyzePath("/etc/passwd").dangerous).toBe(true);
      expect(analyzePath("/etc/shadow").dangerous).toBe(true);
      expect(analyzePath("/proc/self/environ").dangerous).toBe(true);
    });

    it("detects Windows sensitive paths", () => {
      expect(analyzePath("C:\\Windows\\System32\\config").dangerous).toBe(true);
    });

    it("detects secret file access", () => {
      expect(analyzePath("/home/user/.ssh/id_rsa").dangerous).toBe(true);
      expect(analyzePath("/home/user/.aws/credentials").dangerous).toBe(true);
    });

    it("detects null byte injection", () => {
      const result = analyzePath("/tmp/file.txt\x00.jpg");
      expect(result.dangerous).toBe(true);
    });
  });

  describe("isPathAllowed", () => {
    it("allows paths in allowlist", () => {
      expect(isPathAllowed("/tmp/file.txt", ["/tmp/"])).toBe(true);
      expect(isPathAllowed("/var/log/app.log", ["/var/log/"])).toBe(true);
    });

    it("rejects paths not in allowlist", () => {
      expect(isPathAllowed("/etc/passwd", ["/tmp/"])).toBe(false);
    });
  });

  describe("isPathBlocked", () => {
    it("blocks paths in blocklist", () => {
      expect(isPathBlocked("/etc/passwd", ["/etc/"])).toBe(true);
    });

    it("allows paths not in blocklist", () => {
      expect(isPathBlocked("/tmp/file.txt", ["/etc/"])).toBe(false);
    });
  });
});

describe("URL Analyzer", () => {
  describe("analyzeUrl", () => {
    it("allows safe URLs", () => {
      expect(analyzeUrl("https://api.stripe.com/v1/charges").dangerous).toBe(false);
      expect(analyzeUrl("https://example.com/api").dangerous).toBe(false);
    });

    it("detects private IP access", () => {
      expect(analyzeUrl("http://127.0.0.1/admin").dangerous).toBe(true);
      expect(analyzeUrl("http://192.168.1.1/").dangerous).toBe(true);
      expect(analyzeUrl("http://10.0.0.1/").dangerous).toBe(true);
      expect(analyzeUrl("http://172.16.0.1/").dangerous).toBe(true);
    });

    it("detects localhost access", () => {
      expect(analyzeUrl("http://localhost/admin").dangerous).toBe(true);
      expect(analyzeUrl("http://localhost:8080/").dangerous).toBe(true);
    });

    it("detects cloud metadata endpoints", () => {
      const result = analyzeUrl("http://169.254.169.254/latest/meta-data/");
      expect(result.dangerous).toBe(true);
      expect(result.reason).toContain("metadata");
    });

    it("detects dangerous protocols", () => {
      expect(analyzeUrl("file:///etc/passwd").dangerous).toBe(true);
      expect(analyzeUrl("gopher://evil.com/").dangerous).toBe(true);
      expect(analyzeUrl("dict://evil.com/").dangerous).toBe(true);
    });

    it("allows external URLs with blockPrivateIPs: false", () => {
      const result = analyzeUrl("http://127.0.0.1/", { blockPrivateIPs: false });
      expect(result.dangerous).toBe(false);
    });

    it("allows metadata endpoints with blockMetadataEndpoints: false", () => {
      const result = analyzeUrl("http://169.254.169.254/", {
        blockPrivateIPs: false,
        blockMetadataEndpoints: false,
      });
      expect(result.dangerous).toBe(false);
    });
  });

  describe("isHostAllowed", () => {
    it("allows exact matches", () => {
      expect(isHostAllowed("api.stripe.com", ["api.stripe.com"])).toBe(true);
    });

    it("allows wildcard matches", () => {
      expect(isHostAllowed("s3.amazonaws.com", ["*.amazonaws.com"])).toBe(true);
      expect(isHostAllowed("api.github.com", ["*.github.com"])).toBe(true);
    });

    it("rejects non-matching hosts", () => {
      expect(isHostAllowed("evil.com", ["api.stripe.com"])).toBe(false);
    });
  });

  describe("isHostBlocked", () => {
    it("blocks exact matches", () => {
      expect(isHostBlocked("evil.com", ["evil.com"])).toBe(true);
    });

    it("blocks wildcard matches", () => {
      expect(isHostBlocked("api.evil.com", ["*.evil.com"])).toBe(true);
    });

    it("allows non-blocked hosts", () => {
      expect(isHostBlocked("api.stripe.com", ["evil.com"])).toBe(false);
    });
  });
});

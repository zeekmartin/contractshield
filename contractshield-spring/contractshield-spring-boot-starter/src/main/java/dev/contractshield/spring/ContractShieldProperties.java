package dev.contractshield.spring;

import dev.contractshield.core.vulnerability.VulnerabilityScannerConfig;
import org.springframework.boot.context.properties.ConfigurationProperties;

import java.util.ArrayList;
import java.util.List;

/**
 * Configuration properties for ContractShield.
 */
@ConfigurationProperties(prefix = "contractshield")
public class ContractShieldProperties {

    /**
     * Enable/disable ContractShield protection.
     */
    private boolean enabled = true;

    /**
     * URL patterns to protect.
     */
    private List<String> urlPatterns = List.of("/api/**");

    /**
     * Paths to exclude from protection.
     */
    private List<String> excludePaths = List.of(
            "/actuator/**",
            "/swagger-ui/**",
            "/v3/api-docs/**"
    );

    /**
     * Sanitize error messages in responses.
     */
    private boolean sanitizeErrors = true;

    /**
     * OpenAPI configuration.
     */
    private OpenAPIProperties openapi = new OpenAPIProperties();

    /**
     * Vulnerability scanning configuration.
     */
    private VulnerabilityProperties vulnerability = new VulnerabilityProperties();

    // Getters and setters

    public boolean isEnabled() {
        return enabled;
    }

    public void setEnabled(boolean enabled) {
        this.enabled = enabled;
    }

    public List<String> getUrlPatterns() {
        return urlPatterns;
    }

    public void setUrlPatterns(List<String> urlPatterns) {
        this.urlPatterns = urlPatterns;
    }

    public List<String> getExcludePaths() {
        return excludePaths;
    }

    public void setExcludePaths(List<String> excludePaths) {
        this.excludePaths = excludePaths;
    }

    public boolean isSanitizeErrors() {
        return sanitizeErrors;
    }

    public void setSanitizeErrors(boolean sanitizeErrors) {
        this.sanitizeErrors = sanitizeErrors;
    }

    public OpenAPIProperties getOpenapi() {
        return openapi;
    }

    public void setOpenapi(OpenAPIProperties openapi) {
        this.openapi = openapi;
    }

    public VulnerabilityProperties getVulnerability() {
        return vulnerability;
    }

    public void setVulnerability(VulnerabilityProperties vulnerability) {
        this.vulnerability = vulnerability;
    }

    /**
     * OpenAPI configuration properties.
     */
    public static class OpenAPIProperties {

        /**
         * Path to OpenAPI specification (classpath or file).
         */
        private String path;

        /**
         * Auto-detect from Spring's OpenAPI endpoint.
         */
        private boolean autoDetect = true;

        public String getPath() {
            return path;
        }

        public void setPath(String path) {
            this.path = path;
        }

        public boolean isAutoDetect() {
            return autoDetect;
        }

        public void setAutoDetect(boolean autoDetect) {
            this.autoDetect = autoDetect;
        }
    }

    /**
     * Vulnerability scanning configuration properties.
     */
    public static class VulnerabilityProperties {

        private boolean enableSqli = true;
        private boolean enableXss = true;
        private boolean enablePathTraversal = true;
        private boolean enablePrototypePollution = true;
        private boolean enableCommandInjection = true;
        private int maxDepth = 20;

        public boolean isEnableSqli() {
            return enableSqli;
        }

        public void setEnableSqli(boolean enableSqli) {
            this.enableSqli = enableSqli;
        }

        public boolean isEnableXss() {
            return enableXss;
        }

        public void setEnableXss(boolean enableXss) {
            this.enableXss = enableXss;
        }

        public boolean isEnablePathTraversal() {
            return enablePathTraversal;
        }

        public void setEnablePathTraversal(boolean enablePathTraversal) {
            this.enablePathTraversal = enablePathTraversal;
        }

        public boolean isEnablePrototypePollution() {
            return enablePrototypePollution;
        }

        public void setEnablePrototypePollution(boolean enablePrototypePollution) {
            this.enablePrototypePollution = enablePrototypePollution;
        }

        public boolean isEnableCommandInjection() {
            return enableCommandInjection;
        }

        public void setEnableCommandInjection(boolean enableCommandInjection) {
            this.enableCommandInjection = enableCommandInjection;
        }

        public int getMaxDepth() {
            return maxDepth;
        }

        public void setMaxDepth(int maxDepth) {
            this.maxDepth = maxDepth;
        }

        /**
         * Convert to scanner config.
         */
        public VulnerabilityScannerConfig toConfig() {
            return new VulnerabilityScannerConfig()
                    .setEnableSqli(enableSqli)
                    .setEnableXss(enableXss)
                    .setEnablePathTraversal(enablePathTraversal)
                    .setEnablePrototypePollution(enablePrototypePollution)
                    .setEnableCommandInjection(enableCommandInjection)
                    .setMaxDepth(maxDepth);
        }
    }
}

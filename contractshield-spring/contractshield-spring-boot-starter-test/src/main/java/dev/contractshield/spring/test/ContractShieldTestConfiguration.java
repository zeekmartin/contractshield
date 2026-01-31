package dev.contractshield.spring.test;

import dev.contractshield.core.vulnerability.VulnerabilityScanner;
import dev.contractshield.core.vulnerability.VulnerabilityScannerConfig;
import dev.contractshield.spring.ContractShieldProperties;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Primary;

/**
 * Test configuration for ContractShield.
 * Provides test-friendly beans that can be used in integration tests.
 */
@TestConfiguration
public class ContractShieldTestConfiguration {

    /**
     * Creates test-friendly ContractShield properties.
     * Error sanitization is disabled to show full error details in tests.
     *
     * @return configured properties for testing
     */
    @Bean
    @Primary
    public ContractShieldProperties testContractShieldProperties() {
        ContractShieldProperties properties = new ContractShieldProperties();
        properties.setEnabled(true);
        properties.setSanitizeErrors(false);
        return properties;
    }

    /**
     * Creates a VulnerabilityScanner with default configuration for testing.
     *
     * @return configured vulnerability scanner
     */
    @Bean
    @Primary
    public VulnerabilityScanner testVulnerabilityScanner() {
        return new VulnerabilityScanner(VulnerabilityScannerConfig.defaults());
    }
}

package dev.contractshield.spring;

import com.fasterxml.jackson.databind.ObjectMapper;
import dev.contractshield.core.cel.CELEvaluator;
import dev.contractshield.core.vulnerability.VulnerabilityScanner;
import dev.contractshield.spring.advice.ContractShieldExceptionHandler;
import dev.contractshield.spring.aspect.ContractValidationAspect;
import dev.contractshield.spring.filter.ContractShieldFilter;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.AutoConfiguration;
import org.springframework.boot.autoconfigure.condition.ConditionalOnClass;
import org.springframework.boot.autoconfigure.condition.ConditionalOnMissingBean;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.boot.autoconfigure.condition.ConditionalOnWebApplication;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.boot.web.servlet.FilterRegistrationBean;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.EnableAspectJAutoProxy;
import org.springframework.core.Ordered;

/**
 * Auto-configuration for ContractShield.
 */
@AutoConfiguration
@EnableConfigurationProperties(ContractShieldProperties.class)
@EnableAspectJAutoProxy
@ConditionalOnWebApplication(type = ConditionalOnWebApplication.Type.SERVLET)
@ConditionalOnProperty(prefix = "contractshield", name = "enabled", havingValue = "true", matchIfMissing = true)
public class ContractShieldAutoConfiguration {

    private static final Logger logger = LoggerFactory.getLogger(ContractShieldAutoConfiguration.class);

    @Bean
    @ConditionalOnMissingBean
    public VulnerabilityScanner vulnerabilityScanner(ContractShieldProperties properties) {
        logger.info("Creating VulnerabilityScanner with config: sqli={}, xss={}, pathTraversal={}, prototypePollution={}",
                properties.getVulnerability().isEnableSqli(),
                properties.getVulnerability().isEnableXss(),
                properties.getVulnerability().isEnablePathTraversal(),
                properties.getVulnerability().isEnablePrototypePollution());
        return new VulnerabilityScanner(properties.getVulnerability().toConfig());
    }

    @Bean
    public FilterRegistrationBean<ContractShieldFilter> contractShieldFilter(
            ContractShieldProperties properties,
            VulnerabilityScanner scanner) {

        logger.info("Registering ContractShield filter for patterns: {}", properties.getUrlPatterns());

        FilterRegistrationBean<ContractShieldFilter> registration = new FilterRegistrationBean<>();
        registration.setFilter(new ContractShieldFilter(properties, scanner));
        registration.addUrlPatterns(properties.getUrlPatterns().toArray(new String[0]));
        registration.setOrder(Ordered.HIGHEST_PRECEDENCE + 10);
        registration.setName("contractShieldFilter");

        return registration;
    }

    @Bean
    @ConditionalOnMissingBean
    public ContractShieldExceptionHandler contractShieldExceptionHandler(
            ContractShieldProperties properties) {
        return new ContractShieldExceptionHandler(properties);
    }

    @Bean
    @ConditionalOnMissingBean
    public CELEvaluator celEvaluator() {
        logger.info("Creating CEL evaluator");
        return new CELEvaluator();
    }

    @Bean
    @ConditionalOnMissingBean
    @ConditionalOnClass(name = "org.aspectj.lang.annotation.Aspect")
    public ContractValidationAspect contractValidationAspect(
            ObjectMapper objectMapper,
            VulnerabilityScanner vulnerabilityScanner,
            CELEvaluator celEvaluator,
            ContractShieldProperties properties) {
        logger.info("Creating ContractValidation aspect for annotation-based validation");
        return new ContractValidationAspect(objectMapper, vulnerabilityScanner, celEvaluator, properties);
    }
}

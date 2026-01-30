package dev.contractshield.spring.test;

import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;

import java.lang.annotation.*;

/**
 * Annotation for tests that need ContractShield auto-configuration.
 * This annotation automatically imports the test configuration.
 * <p>
 * Example usage:
 * <pre>
 * &#64;ContractShieldTest
 * class MyControllerTest {
 *     // ContractShield is auto-configured for testing
 * }
 * </pre>
 */
@Target(ElementType.TYPE)
@Retention(RetentionPolicy.RUNTIME)
@Documented
@SpringBootTest
@Import(ContractShieldTestConfiguration.class)
public @interface ContractShieldTest {
}

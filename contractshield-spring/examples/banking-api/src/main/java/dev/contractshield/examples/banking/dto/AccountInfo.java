package dev.contractshield.examples.banking.dto;

import java.math.BigDecimal;

public record AccountInfo(
    String accountNumber,
    String accountType,
    BigDecimal balance,
    String currency,
    String ownerName
) {}

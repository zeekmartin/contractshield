package dev.contractshield.examples.banking.dto;

import java.math.BigDecimal;

public record TransferRequest(
    String fromAccount,
    String toAccount,
    BigDecimal amount,
    String currency,
    String description
) {}

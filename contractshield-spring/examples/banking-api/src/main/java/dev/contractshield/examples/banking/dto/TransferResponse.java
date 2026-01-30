package dev.contractshield.examples.banking.dto;

import java.math.BigDecimal;
import java.time.Instant;

public record TransferResponse(
    String transactionId,
    String fromAccount,
    String toAccount,
    BigDecimal amount,
    String currency,
    String status,
    Instant timestamp
) {}

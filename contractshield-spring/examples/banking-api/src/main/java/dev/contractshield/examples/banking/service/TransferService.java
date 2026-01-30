package dev.contractshield.examples.banking.service;

import dev.contractshield.examples.banking.dto.TransferRequest;
import dev.contractshield.examples.banking.dto.TransferResponse;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;

@Service
public class TransferService {

    private final Map<String, TransferResponse> transfers = new ConcurrentHashMap<>();

    public TransferResponse createTransfer(TransferRequest request) {
        String transactionId = UUID.randomUUID().toString();
        TransferResponse response = new TransferResponse(
                transactionId,
                request.fromAccount(),
                request.toAccount(),
                request.amount(),
                request.currency(),
                "COMPLETED",
                Instant.now()
        );
        transfers.put(transactionId, response);
        return response;
    }

    public Optional<TransferResponse> getTransfer(String transactionId) {
        return Optional.ofNullable(transfers.get(transactionId));
    }

    public List<TransferResponse> listTransfers(String accountNumber) {
        if (accountNumber == null) {
            return new ArrayList<>(transfers.values());
        }
        return transfers.values().stream()
                .filter(t -> t.fromAccount().equals(accountNumber) || t.toAccount().equals(accountNumber))
                .toList();
    }
}

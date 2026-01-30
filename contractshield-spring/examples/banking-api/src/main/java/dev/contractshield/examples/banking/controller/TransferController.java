package dev.contractshield.examples.banking.controller;

import dev.contractshield.examples.banking.dto.TransferRequest;
import dev.contractshield.examples.banking.dto.TransferResponse;
import dev.contractshield.examples.banking.service.TransferService;
import dev.contractshield.spring.annotation.CELExpression;
import dev.contractshield.spring.annotation.ValidateContract;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/transfers")
public class TransferController {

    private final TransferService transferService;

    public TransferController(TransferService transferService) {
        this.transferService = transferService;
    }

    @PostMapping
    @ValidateContract(schema = "schemas/transfer-request.json", scanVulnerabilities = true)
    @CELExpression(value = "data.amount > 0", message = "Amount must be positive", field = "amount")
    @CELExpression(value = "data.fromAccount != data.toAccount", message = "Cannot transfer to same account")
    public ResponseEntity<TransferResponse> createTransfer(@RequestBody TransferRequest request) {
        TransferResponse response = transferService.createTransfer(request);
        return ResponseEntity.ok(response);
    }

    @GetMapping("/{transactionId}")
    public ResponseEntity<TransferResponse> getTransfer(@PathVariable String transactionId) {
        return transferService.getTransfer(transactionId)
                .map(ResponseEntity::ok)
                .orElse(ResponseEntity.notFound().build());
    }

    @GetMapping
    public ResponseEntity<List<TransferResponse>> listTransfers(
            @RequestParam(required = false) String accountNumber) {
        List<TransferResponse> transfers = transferService.listTransfers(accountNumber);
        return ResponseEntity.ok(transfers);
    }
}

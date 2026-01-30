package dev.contractshield.examples.banking.controller;

import dev.contractshield.examples.banking.dto.AccountInfo;
import dev.contractshield.examples.banking.service.AccountService;
import dev.contractshield.spring.annotation.ValidateContract;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/accounts")
@ValidateContract(scanVulnerabilities = true)
public class AccountController {

    private final AccountService accountService;

    public AccountController(AccountService accountService) {
        this.accountService = accountService;
    }

    @GetMapping("/{accountNumber}")
    public ResponseEntity<AccountInfo> getAccount(@PathVariable String accountNumber) {
        return accountService.getAccount(accountNumber)
                .map(ResponseEntity::ok)
                .orElse(ResponseEntity.notFound().build());
    }

    @GetMapping
    public ResponseEntity<List<AccountInfo>> listAccounts() {
        List<AccountInfo> accounts = accountService.listAccounts();
        return ResponseEntity.ok(accounts);
    }
}

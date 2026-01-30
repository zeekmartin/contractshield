package dev.contractshield.examples.banking.service;

import dev.contractshield.examples.banking.dto.AccountInfo;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;

@Service
public class AccountService {

    private final Map<String, AccountInfo> accounts = new ConcurrentHashMap<>();

    public AccountService() {
        // Initialize with some sample accounts
        accounts.put("ACC-001", new AccountInfo("ACC-001", "CHECKING", new BigDecimal("5000.00"), "USD", "John Doe"));
        accounts.put("ACC-002", new AccountInfo("ACC-002", "SAVINGS", new BigDecimal("15000.00"), "USD", "John Doe"));
        accounts.put("ACC-003", new AccountInfo("ACC-003", "CHECKING", new BigDecimal("3500.00"), "EUR", "Jane Smith"));
    }

    public Optional<AccountInfo> getAccount(String accountNumber) {
        return Optional.ofNullable(accounts.get(accountNumber));
    }

    public List<AccountInfo> listAccounts() {
        return List.copyOf(accounts.values());
    }
}

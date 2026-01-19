/**
 * Redactor Tests
 */

import { describe, it, expect } from "vitest";
import { Redactor, createRedactor } from "../collector/redactor.js";

describe("Redactor", () => {
  it("should redact password fields", () => {
    const redactor = new Redactor();
    const input = { username: "john", password: "secret123" };

    const result = redactor.redact(input);

    expect(result.username).toBe("john");
    expect(result.password).toBe("[REDACTED]");
  });

  it("should redact token fields", () => {
    const redactor = new Redactor();
    const input = { token: "abc123", apiKey: "key456" };

    const result = redactor.redact(input);

    expect(result.token).toBe("[REDACTED]");
    expect(result.apiKey).toBe("[REDACTED]");
  });

  it("should redact nested sensitive fields", () => {
    const redactor = new Redactor();
    const input = {
      user: {
        name: "John",
        details: {
          password: "secret",
          apiKey: "key123",
        },
      },
    };

    const result = redactor.redact(input);

    expect(result.user.name).toBe("John");
    expect(result.user.details.password).toBe("[REDACTED]");
    expect(result.user.details.apiKey).toBe("[REDACTED]");
  });

  it("should redact entire object when key name is sensitive", () => {
    const redactor = new Redactor();
    const input = {
      user: {
        name: "John",
        credentials: {
          password: "secret",
          apiKey: "key123",
        },
      },
    };

    const result = redactor.redact(input);

    // credentials key itself is sensitive, so entire object is redacted
    expect(result.user.credentials).toBe("[REDACTED]");
  });

  it("should redact fields containing sensitive keywords", () => {
    const redactor = new Redactor();
    const input = {
      userPassword: "secret",
      apiKeyValue: "key123",
      authToken: "token456",
    };

    const result = redactor.redact(input);

    expect(result.userPassword).toBe("[REDACTED]");
    expect(result.apiKeyValue).toBe("[REDACTED]");
    expect(result.authToken).toBe("[REDACTED]");
  });

  it("should redact credit card fields", () => {
    const redactor = new Redactor();
    const input = {
      creditCard: "4111111111111111",
      cvv: "123",
      cardNumber: "4111111111111111",
    };

    const result = redactor.redact(input);

    expect(result.creditCard).toBe("[REDACTED]");
    expect(result.cvv).toBe("[REDACTED]");
    expect(result.cardNumber).toBe("[REDACTED]");
  });

  it("should redact arrays correctly", () => {
    const redactor = new Redactor();
    const input = {
      items: [{ name: "item1", secret: "s1" }, { name: "item2", secret: "s2" }],
    };

    const result = redactor.redact(input);

    expect(result.items[0].name).toBe("item1");
    expect(result.items[0].secret).toBe("[REDACTED]");
    expect(result.items[1].name).toBe("item2");
    expect(result.items[1].secret).toBe("[REDACTED]");
  });

  it("should handle null and undefined", () => {
    const redactor = new Redactor();

    expect(redactor.redact(null)).toBe(null);
    expect(redactor.redact(undefined)).toBe(undefined);
  });

  it("should handle primitives", () => {
    const redactor = new Redactor();

    expect(redactor.redact("string")).toBe("string");
    expect(redactor.redact(123)).toBe(123);
    expect(redactor.redact(true)).toBe(true);
  });

  it("should support custom patterns", () => {
    const redactor = new Redactor(["myfield", "custom"]);
    const input = {
      myfield: "value1",
      customData: "value2",
      normal: "value3",
    };

    const result = redactor.redact(input);

    expect(result.myfield).toBe("[REDACTED]");
    expect(result.customData).toBe("[REDACTED]");
    expect(result.normal).toBe("value3");
  });

  it("should redact headers and remove forbidden ones", () => {
    const redactor = new Redactor();
    const headers = {
      "content-type": "application/json",
      authorization: "Bearer token123",
      cookie: "session=abc",
      "x-custom": "value",
    };

    const result = redactor.redactHeaders(headers);

    expect(result["content-type"]).toBe("application/json");
    expect(result["authorization"]).toBeUndefined(); // Forbidden - removed
    expect(result["cookie"]).toBeUndefined(); // Forbidden - removed
    expect(result["x-custom"]).toBe("value");
  });
});

describe("createRedactor", () => {
  it("should create a redactor instance", () => {
    const redactor = createRedactor();
    expect(redactor).toBeInstanceOf(Redactor);
  });

  it("should accept custom patterns", () => {
    const redactor = createRedactor(["custom"]);
    const result = redactor.redact({ custom: "value" });
    expect(result.custom).toBe("[REDACTED]");
  });
});

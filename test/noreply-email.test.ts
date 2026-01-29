#!/usr/bin/env bun

import { describe, test, expect } from "bun:test";
import { getNoreplyEmailDomain } from "../src/utils/noreply-email";

describe("getNoreplyEmailDomain", () => {
  test("returns users.noreply.github.com for github.com", () => {
    expect(getNoreplyEmailDomain("https://github.com")).toBe(
      "users.noreply.github.com",
    );
  });

  test("returns users.noreply.github.com for github.com with trailing slash", () => {
    expect(getNoreplyEmailDomain("https://github.com/")).toBe(
      "users.noreply.github.com",
    );
  });

  test("returns GHES noreply domain for enterprise server", () => {
    expect(getNoreplyEmailDomain("https://ghes.example.com")).toBe(
      "users.noreply.ghes.example.com",
    );
  });

  test("returns GHES noreply domain for enterprise server with trailing slash", () => {
    expect(getNoreplyEmailDomain("https://ghes.example.com/")).toBe(
      "users.noreply.ghes.example.com",
    );
  });

  test("returns GHES noreply domain for enterprise server with port", () => {
    expect(getNoreplyEmailDomain("https://ghes.example.com:8443")).toBe(
      "users.noreply.ghes.example.com",
    );
  });

  test("returns GHES noreply domain for enterprise server with path", () => {
    expect(getNoreplyEmailDomain("https://ghes.example.com/api/v3")).toBe(
      "users.noreply.ghes.example.com",
    );
  });

  test("handles subdomain enterprise servers", () => {
    expect(getNoreplyEmailDomain("https://github.mycompany.com")).toBe(
      "users.noreply.github.mycompany.com",
    );
  });

  test("handles deep subdomain enterprise servers", () => {
    expect(getNoreplyEmailDomain("https://git.internal.corp.example.com")).toBe(
      "users.noreply.git.internal.corp.example.com",
    );
  });
});

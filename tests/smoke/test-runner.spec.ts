import { expect, test } from "@playwright/test";

test.describe("test runner", () => {
  test("is wired for CI", async () => {
    expect(true).toBeTruthy();
  });
});

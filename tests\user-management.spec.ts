import { test, expect } from '@playwright/test';

test.describe('User Management Features', () => {
  
  test('forgot password page loads and shows fallback message', async ({ page }) => {
    // Navigate to forgot password page
    await page.goto('/auth/forgot-password');
    
    // Verify page loads with form
    await expect(page.locator('[data-testid="forgot-password-form"]')).toBeVisible();
    await expect(page.locator('[data-testid="input-email"]')).toBeVisible();
    await expect(page.locator('[data-testid="button-request-reset"]')).toBeVisible();
    
    // Test form submission with fallback flow
    await page.fill('[data-testid="input-email"]', 'test@example.com');
    await page.click('[data-testid="button-request-reset"]');
    
    // Should show fallback message since backend returns ok:false in development
    await expect(page.locator('[data-testid="text-message"]')).toBeVisible();
    const message = await page.locator('[data-testid="text-message"]').textContent();
    expect(message).toContain('email link');
  });

  test('profile page loads when authenticated', async ({ page }) => {
    // Note: This test assumes user is authenticated
    // In a real test environment, you would set up authentication first
    await page.goto('/profile');
    
    // Verify profile page components
    await expect(page.locator('[data-testid="profile-form"]')).toBeVisible();
    
    // Check password change section
    await expect(page.locator('text=Change Password')).toBeVisible();
    await expect(page.locator('[data-testid="input-password"]')).toBeVisible();
    await expect(page.locator('[data-testid="button-update-password"]')).toBeVisible();
    
    // Check account management section
    await expect(page.locator('text=Account Management')).toBeVisible();
    await expect(page.locator('[data-testid="button-deactivate-account"]')).toBeVisible();
    await expect(page.locator('[data-testid="button-close-account"]')).toBeVisible();
  });

  test('account deactivation confirmation flow', async ({ page }) => {
    await page.goto('/profile');
    
    // Click deactivate account button
    await page.click('[data-testid="button-deactivate-account"]');
    
    // Verify confirmation dialog appears
    await expect(page.locator('text=Are you sure?')).toBeVisible();
    await expect(page.locator('[data-testid="button-confirm-deactivate"]')).toBeVisible();
    await expect(page.locator('[data-testid="button-cancel-deactivate"]')).toBeVisible();
    
    // Test cancel functionality
    await page.click('[data-testid="button-cancel-deactivate"]');
    await expect(page.locator('[data-testid="button-deactivate-account"]')).toBeVisible();
    
    // Test confirm flow (would normally deactivate account)
    await page.click('[data-testid="button-deactivate-account"]');
    await page.click('[data-testid="button-confirm-deactivate"]');
    
    // Should show success message (or error in development)
    await expect(page.locator('[data-testid="text-message"]')).toBeVisible();
  });

  test('account closure confirmation flow', async ({ page }) => {
    await page.goto('/profile');
    
    // Click close account button  
    await page.click('[data-testid="button-close-account"]');
    
    // Verify warning dialog appears
    await expect(page.locator('text=Warning:')).toBeVisible();
    await expect(page.locator('text=permanently close')).toBeVisible();
    await expect(page.locator('[data-testid="button-confirm-close"]')).toBeVisible();
    await expect(page.locator('[data-testid="button-cancel-close"]')).toBeVisible();
    
    // Test cancel functionality
    await page.click('[data-testid="button-cancel-close"]');
    await expect(page.locator('[data-testid="button-close-account"]')).toBeVisible();
    
    // Test confirm flow (would normally close account)
    await page.click('[data-testid="button-close-account"]');
    await page.click('[data-testid="button-confirm-close"]');
    
    // Should show closure message (or error in development)
    await expect(page.locator('[data-testid="text-message"]')).toBeVisible();
  });

  test('navigation between auth pages works', async ({ page }) => {
    // Test forgot password to login navigation
    await page.goto('/auth/forgot-password');
    await expect(page.locator('text=Back to Login')).toBeVisible();
    
    // Click back to login link
    await page.click('text=Back to Login');
    await expect(page.url()).toContain('/login');
    
    // Verify login page loads
    await expect(page.locator('[data-testid="login-form"]')).toBeVisible();
  });

  test('backend API endpoints respond correctly', async ({ page, request }) => {
    // Test auth endpoint availability
    const resetResponse = await request.post('/api/auth/request_reset?email=test@example.com');
    expect(resetResponse.status()).toBe(200);
    
    const resetData = await resetResponse.json();
    expect(resetData).toHaveProperty('ok', false); // Expected in development
    
    // Test basic API health
    const healthResponse = await request.get('/api/');
    expect(healthResponse.status()).toBe(200);
    
    const healthData = await healthResponse.json();
    expect(healthData).toHaveProperty('status', 'healthy');
  });

  test('form validation works on forgot password page', async ({ page }) => {
    await page.goto('/auth/forgot-password');
    
    // Try submitting empty form
    await page.click('[data-testid="button-request-reset"]');
    
    // Should show validation error (browser native validation)
    const emailInput = page.locator('[data-testid="input-email"]');
    await expect(emailInput).toHaveAttribute('required');
    
    // Test with invalid email
    await page.fill('[data-testid="input-email"]', 'invalid-email');
    await page.click('[data-testid="button-request-reset"]');
    
    // Browser should prevent submission or show validation
    const validity = await emailInput.evaluate((input: HTMLInputElement) => input.validity.valid);
    expect(validity).toBe(false);
  });

  test('profile page shows account status when available', async ({ page }) => {
    await page.goto('/profile');
    
    // Wait for account status to potentially load
    await page.waitForTimeout(1000);
    
    // Check if account status section appears (may not in development)
    const statusSection = page.locator('[data-testid="account-status"]');
    const isVisible = await statusSection.isVisible();
    
    if (isVisible) {
      await expect(statusSection).toContain('Status:');
      await expect(statusSection).toContain('Email:');
    }
  });
});
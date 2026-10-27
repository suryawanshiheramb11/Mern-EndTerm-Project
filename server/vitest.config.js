import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    testTimeout: 20000,
    hookTimeout: 30000,
    globalSetup: ['tests/globalSetup.js'],
    fileParallelism: false,
    include: ['tests/**/*.test.js'],
    env: {
      NODE_ENV: 'test',
      PORT: '5001',
      JWT_SECRET: 'test-jwt-secret',
      JWT_EXPIRES: '15m',
      CLIENT_URL: 'http://localhost:5173',
      COOKIE_SECRET: 'test-cookie-secret',
      RAZORPAY_KEY_ID: 'rzp_test_unit',
      RAZORPAY_KEY_SECRET: 'unit-test-secret',
      ATTACHMENT_ALLOWED_HOSTS: 'files.example.com,*.cdn.example.com',
    },
  },
});

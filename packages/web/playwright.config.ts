import { defineConfig } from '@playwright/test';

const token = 'a.eyJzdWIiOiJ0ZXN0In0.c';

export default defineConfig({
  testDir: './tests',
  use: {
    baseURL: 'http://localhost:5173',
    storageState: {
      origins: [
        {
          origin: 'http://localhost:5173',
          localStorage: [{ name: 'idToken', value: token }],
        },
      ],
    },
    headless: true,
  },
  webServer: {
    command: 'yarn dev --port=5173',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
    env: {
      VITE_REGION: 'us-east-1',
      VITE_USER_POOL_ID: 'pool',
      VITE_USER_POOL_CLIENT_ID: 'client',
      VITE_IDENTITY_POOL_ID: 'identity',
      VITE_HOSTED_UI_DOMAIN: 'auth.example.com',
      VITE_ENTRY_BUCKET: 'bucket',
      VITE_TEST_MODE: 'true',
    },
  },
});

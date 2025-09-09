export interface RuntimeConfig {
  region: string;
  userPoolId: string;
  userPoolClientId: string;
  identityPoolId: string;
  hostedUiDomain: string;
  entryBucket: string;
  testMode: boolean;
}

let config: RuntimeConfig | null = null;

export async function loadConfig(): Promise<RuntimeConfig> {
  if (config) return config;
  const res = await fetch('/app-config.json');
  if (!res.ok) throw new Error('Failed to load config');
  config = (await res.json()) as RuntimeConfig;
  return config;
}

export function getConfig(): RuntimeConfig {
  if (!config) {
    throw new Error('Config not loaded');
  }
  return config;
}

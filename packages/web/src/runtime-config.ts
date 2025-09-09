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
  try {
    const res = await fetch('/app-config.json');
    if (!res.ok) throw new Error('Failed to load config');
    config = (await res.json()) as RuntimeConfig;
  } catch (err) {
    console.warn('Could not load config, falling back to test mode', err);
    config = {
      region: '',
      userPoolId: '',
      userPoolClientId: '',
      identityPoolId: '',
      hostedUiDomain: '',
      entryBucket: '',
      testMode: true,
    };
  }
  return config;
}

export function getConfig(): RuntimeConfig {
  if (!config) {
    throw new Error('Config not loaded');
  }
  return config;
}

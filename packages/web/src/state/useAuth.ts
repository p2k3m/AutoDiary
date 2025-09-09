import { create } from 'zustand';
import { fromCognitoIdentityPool } from '@aws-sdk/credential-provider-cognito-identity';
import { getConfig } from '../runtime-config.ts';

interface AuthState {
  /** current authentication status */
  status: 'loading' | 'authenticated' | 'unauthenticated';
  /** AWS credential provider once authenticated */
  credentialProvider?: ReturnType<typeof fromCognitoIdentityPool>;
  /** per-user prefix derived from the id token */
  userPrefix?: string;
  /** redirect the browser to the Cognito Hosted UI */
  login: (identityProvider?: string) => void;
  /** clear stored tokens and re-authenticate */
  logout: (hardReload?: boolean) => void;
}

const {
  region,
  userPoolId,
  userPoolClientId: clientId,
  identityPoolId,
  hostedUiDomain,
  testMode,
} = getConfig();

function decodeJwt<T extends Record<string, unknown>>(token: string): T {
  const payload = token.split('.')[1];
  const json = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
  return JSON.parse(json) as T;
}

const redirectUri = typeof window !== 'undefined' ? window.location.origin : '';

export const useAuth = create<AuthState>((set) => {
  if (testMode) {
    const stubCredentialProvider: ReturnType<typeof fromCognitoIdentityPool> = async () => ({
      accessKeyId: 'test',
      secretAccessKey: 'test',
      sessionToken: 'test',
    });
    return {
      status: 'authenticated',
      credentialProvider: stubCredentialProvider,
      userPrefix: 'private/test-user',
      login: () => {},
      logout: () => set({ status: 'unauthenticated', credentialProvider: undefined, userPrefix: undefined }),
    };
  }

  return {
    status: 'loading',
    login: (identityProvider) => {
      const url =
        `https://${hostedUiDomain}/login?` +
        `client_id=${clientId}&response_type=token&scope=openid+profile&redirect_uri=${encodeURIComponent(redirectUri)}` +
        (identityProvider
          ? `&identity_provider=${encodeURIComponent(identityProvider)}`
          : '');
      window.location.assign(url);
    },
    logout: (hardReload) => {
      localStorage.removeItem('idToken');
      set({ status: 'unauthenticated', credentialProvider: undefined, userPrefix: undefined });
      (async () => {
        indexedDB.deleteDatabase('entry-cache');
        indexedDB.deleteDatabase('etag-cache');
        try {
          const keys = await caches.keys();
          await Promise.all(keys.map((k) => caches.delete(k)));
        } catch {
          // ignore cache cleanup failures
        }
        const url =
          `https://${hostedUiDomain}/logout?` +
          `client_id=${clientId}&logout_uri=${encodeURIComponent(redirectUri)}`;
        window.location.assign(url);
        if (hardReload) {
          window.location.reload();
        }
      })();
    },
  };
});

async function init() {
  const hash = new URLSearchParams(window.location.hash.substring(1));
  const idTokenFromHash = hash.get('id_token');
  if (idTokenFromHash) {
    localStorage.setItem('idToken', idTokenFromHash);
    window.location.hash = '';
  }
  const idToken = localStorage.getItem('idToken');
  if (!idToken) {
    useAuth.setState({ status: 'unauthenticated' });
    return;
  }

  const loginKey = `cognito-idp.${region}.amazonaws.com/${userPoolId}`;
  const credentialProvider = fromCognitoIdentityPool({
    identityPoolId,
    clientConfig: { region },
    logins: { [loginKey]: idToken },
  });

  const payload = decodeJwt<{ sub: string }>(idToken);
  const userPrefix = `private/${payload.sub}`;

  useAuth.setState({
    status: 'authenticated',
    credentialProvider,
    userPrefix,
  });
}

if (typeof window !== 'undefined' && !testMode) {
  // kick off initialization on first import
  init().catch(() => useAuth.setState({ status: 'unauthenticated' }));
}


import { create } from 'zustand';
import { fromCognitoIdentityPool } from '@aws-sdk/credential-provider-cognito-identity';

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
  logout: () => void;
}

const region = import.meta.env.VITE_REGION as string;
const userPoolId = import.meta.env.VITE_USER_POOL_ID as string;
const clientId = import.meta.env.VITE_USER_POOL_CLIENT_ID as string;
const identityPoolId = import.meta.env.VITE_IDENTITY_POOL_ID as string;
const hostedUiDomain = import.meta.env.VITE_HOSTED_UI_DOMAIN as string;

function decodeJwt<T extends Record<string, unknown>>(token: string): T {
  const payload = token.split('.')[1];
  const json = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
  return JSON.parse(json) as T;
}

const redirectUri = typeof window !== 'undefined' ? window.location.origin : '';

export const useAuth = create<AuthState>((set) => ({
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
  logout: () => {
    localStorage.removeItem('idToken');
    set({ status: 'unauthenticated', credentialProvider: undefined, userPrefix: undefined });
    const url =
      `https://${hostedUiDomain}/logout?` +
      `client_id=${clientId}&logout_uri=${encodeURIComponent(redirectUri)}`;
    window.location.assign(url);
  },
}));

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

if (typeof window !== 'undefined') {
  // kick off initialization on first import
  init().catch(() => useAuth.setState({ status: 'unauthenticated' }));
}


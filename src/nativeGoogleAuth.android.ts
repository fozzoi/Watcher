import {
  GoogleOneTapSignIn,
  isNoSavedCredentialFoundResponse,
  isSuccessResponse,
} from 'react-native-nitro-google-signin';

const WEB_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;

let configured = false;

export async function signInWithNativeGoogle(): Promise<string | null> {
  if (!configured) {
    if (!WEB_CLIENT_ID) {
      throw new Error('Set EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID to your Google Cloud Web application client ID.');
    }
    GoogleOneTapSignIn.configure({ webClientId: WEB_CLIENT_ID });
    configured = true;
  }

  await GoogleOneTapSignIn.checkPlayServices();
  let result = await GoogleOneTapSignIn.signIn();

  // First-time users may not have an eligible saved credential yet.
  if (isNoSavedCredentialFoundResponse(result)) {
    result = await GoogleOneTapSignIn.createAccount();
  }
  if (isNoSavedCredentialFoundResponse(result)) {
    result = await GoogleOneTapSignIn.presentExplicitSignIn();
  }

  if (!isSuccessResponse(result)) return null;
  if (!result.data.idToken) throw new Error('Google did not return an ID token.');
  return result.data.idToken;
}

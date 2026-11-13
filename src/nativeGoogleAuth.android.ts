import {
  GoogleOneTapSignIn,
  isCancelledResponse,
  isNoSavedCredentialFoundResponse,
  isSuccessResponse,
} from 'react-native-nitro-google-signin';

const DEFAULT_WEB_CLIENT_ID = '36298979840-vdgsir6fd1kkaj28m24r6mmdq7p1fdg7.apps.googleusercontent.com';
const WEB_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID || DEFAULT_WEB_CLIENT_ID;

let configured = false;

export async function signInWithNativeGoogle(): Promise<string | null> {
  if (!configured) {
    if (!WEB_CLIENT_ID) {
      console.warn('[NativeAuth] EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID is not configured');
      return null;
    }
    try {
      GoogleOneTapSignIn.configure({ webClientId: WEB_CLIENT_ID });
      configured = true;
    } catch (e: any) {
      console.warn('[NativeAuth] Failed to configure GoogleOneTapSignIn:', e?.message || e);
      return null;
    }
  }

  try {
    await GoogleOneTapSignIn.checkPlayServices();
    let result = await GoogleOneTapSignIn.signIn();

    // First-time users may not have an eligible saved credential yet.
    if (isNoSavedCredentialFoundResponse(result)) {
      result = await GoogleOneTapSignIn.createAccount();
    }
    if (isNoSavedCredentialFoundResponse(result)) {
      result = await GoogleOneTapSignIn.presentExplicitSignIn();
    }

    if (!isSuccessResponse(result)) {
      if (isCancelledResponse(result)) {
        console.log('[NativeAuth] Google One Tap cancelled or dismissed by user');
      } else {
        console.warn(`[NativeAuth] Google One Tap not successful (type: ${result?.type || 'unknown'})`);
      }
      return null;
    }

    if (!result.data?.idToken) {
      console.warn('[NativeAuth] Google One Tap returned no idToken');
      return null;
    }

    return result.data.idToken;
  } catch (error: any) {
    console.warn('[NativeAuth] Google One Tap encountered an error (likely dev keystore SHA-1 not registered):', error?.message || error);
    return null;
  }
}

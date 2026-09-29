/** Platform fallback: Android uses the native Google credential flow. */
export async function signInWithNativeGoogle(): Promise<string | null> {
  return null;
}

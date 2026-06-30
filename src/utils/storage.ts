// storage.ts - Mocking AsyncStorage using browser's localStorage for Next.js

export const AsyncStorage = {
  getItem: async (key: string): Promise<string | null> => {
    if (typeof window === "undefined") return null;
    return window.localStorage.getItem(key);
  },
  setItem: async (key: string, value: string): Promise<void> => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(key, value);
  },
  removeItem: async (key: string): Promise<void> => {
    if (typeof window === "undefined") return;
    window.localStorage.removeItem(key);
  },
  clear: async (): Promise<void> => {
    if (typeof window === "undefined") return;
    window.localStorage.clear();
  }
};

export default AsyncStorage;

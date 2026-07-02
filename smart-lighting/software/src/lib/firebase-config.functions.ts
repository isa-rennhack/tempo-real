import { createServerFn } from "@tanstack/react-start";

export const getFirebaseConfig = createServerFn({ method: "GET" }).handler(
  async () => {
    const apiKey = process.env.GOOGLE_API_KEY ?? "";
    return {
      apiKey,
      authDomain: "smart-lighting-d0e03.firebaseapp.com",
      projectId: "smart-lighting-d0e03",
      storageBucket: "smart-lighting-d0e03.appspot.com",
      appId: process.env.FIREBASE_APP_ID ?? "",
    };
  },
);
import { initializeApp, getApps, type FirebaseApp } from "firebase/app";
import { getFirestore, type Firestore } from "firebase/firestore";
import { getFirebaseConfig } from "./firebase-config.functions";

let _app: FirebaseApp | null = null;
let _db: Firestore | null = null;
let _pending: Promise<Firestore | null> | null = null;

export async function ensureDb(): Promise<Firestore | null> {
  if (_db) return _db;
  if (_pending) return _pending;
  _pending = (async () => {
    try {
      const cfg = await getFirebaseConfig();
      if (!cfg?.apiKey) {
        console.warn("[firebase] missing GOOGLE_API_KEY secret");
        return null;
      }
      _app = getApps()[0] ?? initializeApp(cfg);
      _db = getFirestore(_app);
      return _db;
    } catch (err) {
      console.error("[firebase] init failed:", err);
      return null;
    }
  })();
  return _pending;
}

/**
 * Firestore layout (project: smart-lighting-d0e03):
 *
 * collection "readings"
 *   docId (auto)
 *     roomId: string
 *     createdAt: Timestamp
 *     epoch: number
 *     secondsOn: number
 *     presenceCount: number
 *     presenceDetected: boolean
 *     energyKwh: number
 *     estimatedCostBrl: number
 *     mock: boolean
 *     userId: string
 */

/**
 * Expected Firestore layout (project: smart-lighting-d0e03):
 *
 * collection "readings"
 *   docId (auto)
 *     roomId: "sala" | "cozinha" | "quarto1" | "quarto2" | "banheiro"
 *     hour:   Timestamp  (bucket start, aligned to the hour)
 *     secondsOn: number  (LED on-time within the hour, 0..3600)
 *     presenceCount: number
 */
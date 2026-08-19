// Claude 아티팩트 안에서만 존재하는 `window.storage` API를,
// 이 프로젝트 바깥(GitHub Pages, Vercel 등)에서도 그대로 동작하도록
// 대체 구현을 붙여주는 파일입니다. App.jsx는 전혀 수정하지 않아도 됩니다.
//
// 백엔드는 자동으로 선택됩니다.
//  - .env 에 VITE_FIREBASE_* 값이 채워져 있으면 → Firebase Realtime Database
//    (여러 기기·여러 브라우저에서 실시간으로 동기화됩니다. 실제 세션 운영용)
//  - 값이 없으면 → localStorage + BroadcastChannel 폴백
//    (같은 브라우저의 다른 탭끼리만 동기화됩니다. 설정 없이 바로 테스트용)

function sanitizeKey(key) {
  // Firebase 키에 쓸 수 없는 문자(. # $ / [ ])를 안전하게 치환합니다.
  return key.replace(/[.#$/[\]]/g, "_");
}

function installLocalFallback() {
  console.warn(
    "[bgm-session-deck] Firebase가 설정되지 않아 로컬(localStorage) 저장소로 동작합니다. " +
      "다른 기기/브라우저와는 동기화되지 않습니다. .env 파일에 VITE_FIREBASE_* 값을 채워주세요."
  );

  const bc = "BroadcastChannel" in window ? new BroadcastChannel("bgm-session-deck") : null;
  const prefix = "bgm-kv:";

  window.__BGM_BACKEND__ = "local";

  window.storage = {
    async get(key) {
      const raw = localStorage.getItem(prefix + sanitizeKey(key));
      if (raw === null) throw new Error("not found: " + key);
      return { key, value: raw };
    },
    async set(key, value) {
      localStorage.setItem(prefix + sanitizeKey(key), value);
      bc && bc.postMessage({ type: "kv-changed", key });
      return { key, value };
    },
    async delete(key) {
      localStorage.removeItem(prefix + sanitizeKey(key));
      bc && bc.postMessage({ type: "kv-changed", key });
      return { key, deleted: true };
    },
    async list(prefixFilter = "") {
      const keys = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith(prefix)) {
          const original = k.slice(prefix.length);
          if (original.startsWith(prefixFilter)) keys.push(original);
        }
      }
      return { keys };
    },
  };
}

async function installFirebase(config) {
  const { initializeApp } = await import("firebase/app");
  const { getDatabase, ref, get, set, remove } = await import("firebase/database");

  const app = initializeApp(config);
  const db = getDatabase(app);

  window.__BGM_BACKEND__ = "firebase";

  window.storage = {
    async get(key) {
      const snap = await get(ref(db, "kv/" + sanitizeKey(key)));
      if (!snap.exists()) throw new Error("not found: " + key);
      return { key, value: snap.val() };
    },
    async set(key, value) {
      await set(ref(db, "kv/" + sanitizeKey(key)), value);
      return { key, value };
    },
    async delete(key) {
      await remove(ref(db, "kv/" + sanitizeKey(key)));
      return { key, deleted: true };
    },
    async list(prefixFilter = "") {
      const snap = await get(ref(db, "kv"));
      const keys = [];
      if (snap.exists()) {
        snap.forEach((child) => {
          if (child.key.startsWith(sanitizeKey(prefixFilter))) keys.push(child.key);
        });
      }
      return { keys };
    },
  };
}

export async function installStorage() {
  const config = {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  };

  if (config.apiKey && config.databaseURL) {
    try {
      await installFirebase(config);
      return;
    } catch (e) {
      console.error("[bgm-session-deck] Firebase 초기화에 실패해 로컬 저장소로 대체합니다.", e);
    }
  }
  installLocalFallback();
}

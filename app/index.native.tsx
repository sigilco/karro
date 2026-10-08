import { WebView } from "@expo/dom-webview";
import type { JSX } from "react";
import { StyleSheet, View } from "react-native";

// The native app is a WebView shell around the deployed web app — the worker
// serves the frontend on the same origin as the API, so one URL is the whole
// product (landing → /map → flows). Real native screens replace this later.
// NOTE: literal `import.meta.env.KEY` — the metro plugin only rewrites that.
const APP_URL =
  import.meta.env.ONE_PUBLIC_API_URL || "https://karro-api.josocjoq-dev.workers.dev";

// android.webkit defaults domStorageEnabled off and ExpoDomWebView (prebuilt
// aar) doesn't flip it, so window.localStorage/sessionStorage are null inside
// the WebView — the bundle dies at eval on getItem. Shim an in-memory
// Storage before the page's JS runs. Per-session only, which is fine: the
// API base is baked and theme falls back to prefers-color-scheme.
const STORAGE_SHIM = `
(function () {
  function storage() {
    var m = new Map();
    return {
      getItem: function (k) { return m.has(String(k)) ? m.get(String(k)) : null; },
      setItem: function (k, v) { m.set(String(k), String(v)); },
      removeItem: function (k) { m.delete(String(k)); },
      clear: function () { m.clear(); },
      key: function (i) { var ks = Array.from(m.keys()); return i < ks.length ? ks[i] : null; },
      get length() { return m.size; }
    };
  }
  try {
    if (window.localStorage == null) {
      Object.defineProperty(window, 'localStorage', { value: storage(), configurable: true });
    }
  } catch (e) {}
  try {
    if (window.sessionStorage == null) {
      Object.defineProperty(window, 'sessionStorage', { value: storage(), configurable: true });
    }
  } catch (e) {}
})();
true;`;

export default function NativeShell(): JSX.Element {
  return (
    <View style={styles.container}>
      <WebView
        source={{ uri: `${APP_URL}/` }}
        style={styles.webview}
        injectedJavaScriptBeforeContentLoaded={STORAGE_SHIM}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0b0f0c" },
  webview: { flex: 1, backgroundColor: "transparent" },
});

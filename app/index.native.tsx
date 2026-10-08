import { WebView } from "@expo/dom-webview";
import type { JSX } from "react";
import { StyleSheet, View } from "react-native";

// The native app is a WebView shell around the deployed web app — the worker
// serves the frontend on the same origin as the API, so one URL is the whole
// product (landing → /map → flows). Real native screens replace this later.
// NOTE: literal `import.meta.env.KEY` — the metro plugin only rewrites that.
const APP_URL =
  import.meta.env.ONE_PUBLIC_API_URL || "https://karro-api.josocjoq-dev.workers.dev";

export default function NativeShell(): JSX.Element {
  return (
    <View style={styles.container}>
      <WebView source={{ uri: `${APP_URL}/` }} style={styles.webview} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0b0f0c" },
  webview: { flex: 1, backgroundColor: "transparent" },
});

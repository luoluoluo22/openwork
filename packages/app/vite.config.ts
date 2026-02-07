import os from "node:os";
import { defineConfig } from "vite";
import tailwindcss from "@tailwindcss/vite";
import solid from "vite-plugin-solid";

const portValue = Number.parseInt(process.env.PORT ?? "", 10);
const devPort = Number.isFinite(portValue) && portValue > 0 ? portValue : 5173;
const allowedHosts = new Set<string>();
const envAllowedHosts = process.env.VITE_ALLOWED_HOSTS ?? "";

const addHost = (value?: string | null) => {
  const trimmed = value?.trim();
  if (!trimmed) return;
  allowedHosts.add(trimmed);
};

envAllowedHosts.split(",").forEach(addHost);
addHost(process.env.OPENWORK_PUBLIC_HOST ?? null);
const hostname = os.hostname();
addHost(hostname);
const shortHostname = hostname.split(".")[0];
if (shortHostname && shortHostname !== hostname) {
  addHost(shortHostname);
}

export default defineConfig({
  plugins: [tailwindcss(), solid()],
  server: {
    host: '127.0.0.1',
    port: devPort,
    strictPort: true,
    ...(allowedHosts.size > 0 ? { allowedHosts: Array.from(allowedHosts) } : {}),
    proxy: {
      '/w': {
        target: 'http://127.0.0.1:8787',
        changeOrigin: true,
      },
      '/m': {
        target: 'http://127.0.0.1:8787',
        changeOrigin: true,
      },
      '/opencode': {
        target: 'http://127.0.0.1:8787',
        changeOrigin: true,
      },
      '/health': {
        target: 'http://127.0.0.1:8787',
        changeOrigin: true,
      },
      '/status': {
        target: 'http://127.0.0.1:8787',
        changeOrigin: true,
      },
      '/workspaces': {
        target: 'http://127.0.0.1:8787',
        changeOrigin: true,
      },
      '/capabilities': {
        target: 'http://127.0.0.1:8787',
        changeOrigin: true,
      },
      '/workspace': {
        target: 'http://127.0.0.1:8787',
        changeOrigin: true,
      },
    },
  },
  build: {
    target: "esnext",
  },
});

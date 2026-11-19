import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    // -------------------------------------------------------------------------
    // DEAD CODE — this proxy is never used. Every API request is intercepted by
    // the `firestoreAdapter` request interceptor in src/lib/api.ts and answered
    // directly from Firestore, so no request ever reaches /proxy (and the Cloud
    // Run targets below are retired anyway). Kept commented for reference.
    // -------------------------------------------------------------------------
    // proxy: {
    //   "/proxy/products": {
    //     target: "https://product-service-demo4-1013471958286.asia-southeast1.run.app",
    //     changeOrigin: true,
    //     rewrite: (path: string) => path.replace(/^\/proxy/, "/api"),
    //     secure: false,
    //   },
    //   "/proxy/billing": {
    //     target: "https://billing-service-demo4-1013471958286.asia-southeast1.run.app",
    //     changeOrigin: true,
    //     rewrite: (path: string) => path.replace(/^\/proxy/, "/api"),
    //     secure: false,
    //   },
    //   "/proxy/vendors": {
    //     target: "https://vendor-service-demo4-1013471958286.asia-southeast1.run.app",
    //     changeOrigin: true,
    //     rewrite: (path: string) => path.replace(/^\/proxy/, "/api"),
    //     secure: false,
    //   },
    //   "/proxy/customers": {
    //     target: "https://vendor-service-demo4-1013471958286.asia-southeast1.run.app",
    //     changeOrigin: true,
    //     rewrite: (path: string) => path.replace(/^\/proxy/, "/api"),
    //     secure: false,
    //   },
    //   "/proxy/broker": {
    //     target: "https://vendor-service-demo4-1013471958286.asia-southeast1.run.app",
    //     changeOrigin: true,
    //     rewrite: (path: string) => path.replace(/^\/proxy/, "/api"),
    //     secure: false,
    //   },
    //   "/proxy/chit": {
    //     target: "https://vendor-service-demo4-1013471958286.asia-southeast1.run.app",
    //     changeOrigin: true,
    //     rewrite: (path: string) => path.replace(/^\/proxy/, "/api"),
    //     secure: false,
    //   },
    //   "/proxy/staff": {
    //     target: "https://staff-service-demo4-1013471958286.asia-southeast1.run.app",
    //     changeOrigin: true,
    //     rewrite: (path: string) => path.replace(/^\/proxy/, "/api"),
    //     secure: false,
    //   },
    // },
  },
  plugins: [react(), mode === "development" && componentTagger()].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));

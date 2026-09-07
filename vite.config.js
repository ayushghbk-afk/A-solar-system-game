// Vite config — assets use relative base so the build works on GitHub Pages
// under any repository sub-path (no hard-coded host or repository name).
export default {
  base: "./",
  build: {
    target: "es2020",
    chunkSizeWarningLimit: 1200,
    outDir: "dist",
  },
  server: {
    host: "0.0.0.0",
    // Arena preview proxies requests under a per-session host name
    allowedHosts: true,
  },
};

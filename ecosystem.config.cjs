const fs = require("fs");
const path = require("path");

function loadEnv(envPath) {
  const fullPath = path.resolve(__dirname, envPath);
  if (!fs.existsSync(fullPath)) return {};
  const content = fs.readFileSync(fullPath, "utf-8");
  const env = {};
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIndex = trimmed.indexOf("=");
    if (eqIndex > 0) {
      const key = trimmed.slice(0, eqIndex).trim();
      const value = trimmed.slice(eqIndex + 1).trim();
      env[key] = value;
    }
  }
  return env;
}

module.exports = {
  apps: [
    {
      name: "applyradar-server",
      script: "server/dist/index.js",
      cwd: "/opt/applyradar",
      env: {
        ...loadEnv("server/.env"),
        NODE_ENV: "production",
      },
    },
    {
      name: "applyradar-worker",
      script: "worker/dist/index.js",
      cwd: "/opt/applyradar",
      env: {
        ...loadEnv("worker/.env"),
        NODE_ENV: "production",
      },
    },
  ],
};

module.exports = {
  apps: [
    {
      name: "applyradar-server",
      script: "server/dist/index.js",
      cwd: "/opt/applyradar",
      env_file: "server/.env",
      env: {
        NODE_ENV: "production",
      },
    },
    {
      name: "applyradar-worker",
      script: "worker/dist/index.js",
      cwd: "/opt/applyradar",
      env_file: "worker/.env",
      env: {
        NODE_ENV: "production",
      },
    },
  ],
};

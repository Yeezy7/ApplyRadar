module.exports = {
  apps: [
    {
      name: "applyradar-server",
      script: "server/dist/index.js",
      cwd: "/opt/applyradar",
      env: {
        NODE_ENV: "production",
      },
    },
    {
      name: "applyradar-worker",
      script: "worker/dist/index.js",
      cwd: "/opt/applyradar",
      env: {
        NODE_ENV: "production",
      },
    },
  ],
};

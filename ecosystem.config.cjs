module.exports = {
  apps: [
    {
      name: 'become-fluent',
      cwd: './backend',
      script: 'dist/index.js',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'production',
      },
      // Ignore these directories to prevent restarts when audio files are created
      ignore_watch: ['audio-cache', 'temp-audio', 'node_modules'],
    },
  ],
}

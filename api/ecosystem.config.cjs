module.exports = {
  apps: [
    {
      name: 'contractshield-api',
      script: 'src/index.js',
      cwd: '/var/www/contractshield-api',

      // Environment
      node_args: '--experimental-specifier-resolution=node',
      env: {
        NODE_ENV: 'production',
        PORT: 3002,
      },

      // Process management
      instances: 1, // SQLite doesn't support multiple writers well
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '256M',

      // Restart behavior
      min_uptime: '10s',
      max_restarts: 10,
      restart_delay: 1000,
      exp_backoff_restart_delay: 100,

      // Logging
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      error_file: '/var/log/contractshield-api/error.log',
      out_file: '/var/log/contractshield-api/out.log',
      merge_logs: true,
      log_type: 'json',

      // Graceful shutdown
      kill_timeout: 30000,
      listen_timeout: 10000,
      shutdown_with_message: true,
    },
  ],
};

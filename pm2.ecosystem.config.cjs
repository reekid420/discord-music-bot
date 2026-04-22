module.exports = {
  apps: [{
    name: 'dj-miyabi',
    script: 'src/bot/index.js',
    watch: false,
    env: {
      NODE_ENV: 'production',
    },
    // Restart on crash, max 10 restarts in 60 seconds
    max_restarts: 10,
    min_uptime: '10s',
    restart_delay: 5000,
    // Log config
    error_file: './logs/error.log',
    out_file: './logs/out.log',
    merge_logs: true,
    log_date_format: 'YYYY-MM-DD HH:mm:ss',
  }],
};

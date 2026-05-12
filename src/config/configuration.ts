export default () => ({
  db: {
    host: process.env.DB_HOST || 'localhost',
    name: process.env.DB_NAME || 'autoparts',
    password: process.env.DB_PASSWORD || 'autoparts',
    port: parseInt(process.env.DB_PORT || '5433', 10),
    username: process.env.DB_USERNAME || 'autoparts',
  },
  jwt: {
    accessSecret: process.env.JWT_ACCESS_SECRET || 'access-secret',
    accessTtl: parseInt(process.env.JWT_ACCESS_TTL || '900', 10),
    refreshSecret: process.env.JWT_REFRESH_SECRET || 'refresh-secret',
    refreshTtl: parseInt(process.env.JWT_REFRESH_TTL || '604800', 10),
  },
  port: parseInt(process.env.PORT || '3001', 10),
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
  },
})

import 'reflect-metadata'
import { DataSource } from 'typeorm'

export default new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5433', 10),
  username: process.env.DB_USERNAME || 'autoparts',
  password: process.env.DB_PASSWORD || 'autoparts',
  database: process.env.DB_NAME || 'autoparts',
  entities: ['src/**/*.entity.ts'],
  migrations: ['src/migrations/*.ts'],
  synchronize: false,
})

import 'reflect-metadata'
import { DataSource } from 'typeorm'

export default new DataSource({
  database: process.env.DB_NAME || 'autoparts',
  entities: ['src/**/*.entity.ts'],
  host: process.env.DB_HOST || 'localhost',
  migrations: ['src/migrations/*.ts'],
  password: process.env.DB_PASSWORD || 'autoparts',
  port: parseInt(process.env.DB_PORT || '5433', 10),
  synchronize: false,
  type: 'postgres',
  username: process.env.DB_USERNAME || 'autoparts',
})

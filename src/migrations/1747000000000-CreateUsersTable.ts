import { MigrationInterface, QueryRunner, Table } from 'typeorm'

export class CreateUsersTable1747000000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`)

    await queryRunner.query(
      `CREATE TYPE "public"."users_role_enum" AS ENUM('customer', 'admin')`,
    )

    await queryRunner.createTable(
      new Table({
        columns: [
          {
            default: 'uuid_generate_v4()',
            isPrimary: true,
            name: 'id',
            type: 'uuid',
          },
          { isUnique: true, length: '255', name: 'email', type: 'varchar' },
          { length: '255', name: 'password_hash', type: 'varchar' },
          {
            default: `'customer'`,
            enum: ['customer', 'admin'],
            name: 'role',
            type: 'enum',
          },
          {
            default: 'now()',
            name: 'created_at',
            type: 'timestamp',
          },
          {
            default: 'now()',
            name: 'updated_at',
            type: 'timestamp',
          },
        ],
        name: 'users',
      }),
      true,
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('users')
    await queryRunner.query(`DROP TYPE "public"."users_role_enum"`)
  }
}

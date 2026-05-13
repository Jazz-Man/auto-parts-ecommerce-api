// src/migrations/1747400000000-CreateOrderTables.ts
import {
  MigrationInterface,
  QueryRunner,
  Table,
  TableForeignKey,
  TableIndex,
} from 'typeorm'

export class CreateOrderTables1747400000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        columns: [
          {
            default: 'uuid_generate_v4()',
            isPrimary: true,
            name: 'id',
            type: 'uuid',
          },
          {
            isNullable: false,
            name: 'user_id',
            type: 'uuid',
          },
          {
            default: "'pending'",
            isNullable: false,
            length: '20',
            name: 'status',
            type: 'varchar',
          },
          {
            isNullable: false,
            name: 'total',
            precision: 10,
            scale: 2,
            type: 'decimal',
          },
          {
            isNullable: false,
            name: 'shipping_address',
            type: 'jsonb',
          },
          {
            isNullable: true,
            isUnique: true,
            length: '64',
            name: 'idempotency_key',
            type: 'varchar',
          },
          {
            default: 'now()',
            isNullable: false,
            name: 'created_at',
            type: 'timestamp',
          },
          {
            default: 'now()',
            isNullable: false,
            name: 'updated_at',
            type: 'timestamp',
          },
        ],
        name: 'orders',
      }),
      true,
    )
    await queryRunner.createForeignKey(
      'orders',
      new TableForeignKey({
        columnNames: ['user_id'],
        onDelete: 'CASCADE',
        referencedColumnNames: ['id'],
        referencedTableName: 'users',
      }),
    )
    await queryRunner.createIndex(
      'orders',
      new TableIndex({ columnNames: ['user_id'] }),
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
          {
            isNullable: false,
            name: 'order_id',
            type: 'uuid',
          },
          {
            isNullable: false,
            name: 'product_id',
            type: 'uuid',
          },
          {
            isNullable: false,
            name: 'quantity',
            type: 'integer',
          },
          {
            isNullable: false,
            name: 'price_snapshot',
            precision: 10,
            scale: 2,
            type: 'decimal',
          },
          {
            default: 'now()',
            isNullable: false,
            name: 'created_at',
            type: 'timestamp',
          },
          {
            default: 'now()',
            isNullable: false,
            name: 'updated_at',
            type: 'timestamp',
          },
        ],
        name: 'order_items',
      }),
      true,
    )
    await queryRunner.createForeignKey(
      'order_items',
      new TableForeignKey({
        columnNames: ['order_id'],
        onDelete: 'CASCADE',
        referencedColumnNames: ['id'],
        referencedTableName: 'orders',
      }),
    )
    await queryRunner.createForeignKey(
      'order_items',
      new TableForeignKey({
        columnNames: ['product_id'],
        onDelete: 'RESTRICT',
        referencedColumnNames: ['id'],
        referencedTableName: 'products',
      }),
    )
    await queryRunner.createIndex(
      'order_items',
      new TableIndex({ columnNames: ['order_id'] }),
    )
    await queryRunner.createIndex(
      'order_items',
      new TableIndex({ columnNames: ['product_id'] }),
    )
    await queryRunner.query(
      `ALTER TABLE "order_items" ADD CONSTRAINT "UQ_order_items_order_product" UNIQUE ("order_id", "product_id")`,
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('order_items')
    await queryRunner.dropTable('orders')
  }
}

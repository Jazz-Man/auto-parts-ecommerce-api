import {
  MigrationInterface,
  QueryRunner,
  Table,
  TableForeignKey,
  TableIndex,
} from 'typeorm'

export class CreateCartTables1747300000000 implements MigrationInterface {
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
            isUnique: true,
            name: 'user_id',
            type: 'uuid',
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
        name: 'carts',
      }),
      true,
    )
    await queryRunner.createForeignKey(
      'carts',
      new TableForeignKey({
        columnNames: ['user_id'],
        onDelete: 'CASCADE',
        referencedColumnNames: ['id'],
        referencedTableName: 'users',
      }),
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
          { isNullable: false, name: 'cart_id', type: 'uuid' },
          { isNullable: false, name: 'product_id', type: 'uuid' },
          { isNullable: false, name: 'quantity', type: 'integer' },
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
        name: 'cart_items',
      }),
      true,
    )
    await queryRunner.createForeignKey(
      'cart_items',
      new TableForeignKey({
        columnNames: ['cart_id'],
        onDelete: 'CASCADE',
        referencedColumnNames: ['id'],
        referencedTableName: 'carts',
      }),
    )
    await queryRunner.createForeignKey(
      'cart_items',
      new TableForeignKey({
        columnNames: ['product_id'],
        onDelete: 'RESTRICT',
        referencedColumnNames: ['id'],
        referencedTableName: 'products',
      }),
    )
    await queryRunner.createIndex(
      'cart_items',
      new TableIndex({ columnNames: ['cart_id'] }),
    )
    await queryRunner.createIndex(
      'cart_items',
      new TableIndex({ columnNames: ['product_id'] }),
    )
    await queryRunner.query(
      `ALTER TABLE "cart_items" ADD CONSTRAINT "UQ_cart_items_cart_product" UNIQUE ("cart_id", "product_id")`,
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('cart_items')
    await queryRunner.dropTable('carts')
  }
}

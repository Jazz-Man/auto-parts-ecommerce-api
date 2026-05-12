import {
  MigrationInterface,
  QueryRunner,
  Table,
  TableForeignKey,
  TableIndex,
} from 'typeorm'

export class CreateCatalogTables1747100000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // brands
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
            length: '255',
            name: 'name',
            type: 'varchar',
          },
          {
            isNullable: false,
            isUnique: true,
            length: '255',
            name: 'slug',
            type: 'varchar',
          },
        ],
        name: 'brands',
      }),
      true,
    )

    // vehicles
    await queryRunner.createTable(
      new Table({
        columns: [
          {
            default: 'uuid_generate_v4()',
            isPrimary: true,
            name: 'id',
            type: 'uuid',
          },
          { isNullable: false, name: 'brand_id', type: 'uuid' },
          {
            isNullable: false,
            length: '255',
            name: 'model',
            type: 'varchar',
          },
          { isNullable: false, name: 'year_start', type: 'integer' },
          { isNullable: false, name: 'year_end', type: 'integer' },
        ],
        name: 'vehicles',
      }),
      true,
    )
    await queryRunner.createForeignKey(
      'vehicles',
      new TableForeignKey({
        columnNames: ['brand_id'],
        onDelete: 'RESTRICT',
        referencedColumnNames: ['id'],
        referencedTableName: 'brands',
      }),
    )
    await queryRunner.createIndex(
      'vehicles',
      new TableIndex({
        columnNames: ['brand_id'],
      }),
    )

    // categories
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
            length: '255',
            name: 'name',
            type: 'varchar',
          },
          {
            isNullable: false,
            isUnique: true,
            length: '255',
            name: 'slug',
            type: 'varchar',
          },
          { isNullable: true, name: 'parent_id', type: 'uuid' },
        ],
        name: 'categories',
      }),
      true,
    )
    await queryRunner.createForeignKey(
      'categories',
      new TableForeignKey({
        columnNames: ['parent_id'],
        onDelete: 'SET NULL',
        referencedColumnNames: ['id'],
        referencedTableName: 'categories',
      }),
    )

    // products
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
            length: '255',
            name: 'sku',
            type: 'varchar',
          },
          {
            isNullable: false,
            length: '500',
            name: 'title',
            type: 'varchar',
          },
          {
            isNullable: false,
            name: 'price',
            precision: 10,
            scale: 2,
            type: 'decimal',
          },
          {
            default: 0,
            isNullable: false,
            name: 'stock',
            type: 'integer',
          },
          { isNullable: false, name: 'category_id', type: 'uuid' },
          { isNullable: true, name: 'specs', type: 'jsonb' },
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
        name: 'products',
      }),
      true,
    )
    await queryRunner.createForeignKey(
      'products',
      new TableForeignKey({
        columnNames: ['category_id'],
        onDelete: 'RESTRICT',
        referencedColumnNames: ['id'],
        referencedTableName: 'categories',
      }),
    )
    await queryRunner.createIndex(
      'products',
      new TableIndex({ columnNames: ['category_id'] }),
    )
    await queryRunner.query(
      `CREATE INDEX "IDX_products_specs" ON "products" USING GIN ("specs")`,
    )
    await queryRunner.createIndex(
      'products',
      new TableIndex({ columnNames: ['price', 'stock'] }),
    )

    // product_vehicles
    await queryRunner.createTable(
      new Table({
        columns: [
          { isPrimary: true, name: 'product_id', type: 'uuid' },
          { isPrimary: true, name: 'vehicle_id', type: 'uuid' },
        ],
        name: 'product_vehicles',
      }),
      true,
    )
    await queryRunner.createForeignKey(
      'product_vehicles',
      new TableForeignKey({
        columnNames: ['product_id'],
        onDelete: 'CASCADE',
        referencedColumnNames: ['id'],
        referencedTableName: 'products',
      }),
    )
    await queryRunner.createForeignKey(
      'product_vehicles',
      new TableForeignKey({
        columnNames: ['vehicle_id'],
        onDelete: 'CASCADE',
        referencedColumnNames: ['id'],
        referencedTableName: 'vehicles',
      }),
    )
    await queryRunner.createIndex(
      'product_vehicles',
      new TableIndex({
        columnNames: ['vehicle_id', 'product_id'],
      }),
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('product_vehicles')
    await queryRunner.dropTable('products')
    await queryRunner.dropTable('categories')
    await queryRunner.dropTable('vehicles')
    await queryRunner.dropTable('brands')
  }
}

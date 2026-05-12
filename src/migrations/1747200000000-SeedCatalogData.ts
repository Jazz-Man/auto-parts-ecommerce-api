import { MigrationInterface, QueryRunner } from 'typeorm'

export class SeedCatalogData1747200000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Brands
    await queryRunner.query(`
      INSERT INTO brands (id, name, slug) VALUES
        ('a0000001-0000-0000-0000-000000000001', 'Toyota', 'toyota'),
        ('a0000001-0000-0000-0000-000000000002', 'BMW', 'bmw'),
        ('a0000001-0000-0000-0000-000000000003', 'Volkswagen', 'volkswagen')
    `)

    // Vehicles (2 per brand)
    await queryRunner.query(`
      INSERT INTO vehicles (id, brand_id, model, year_start, year_end) VALUES
        ('b0000001-0000-0000-0000-000000000001', 'a0000001-0000-0000-0000-000000000001', 'Corolla', 2015, 2023),
        ('b0000001-0000-0000-0000-000000000002', 'a0000001-0000-0000-0000-000000000001', 'Camry', 2018, 2024),
        ('b0000001-0000-0000-0000-000000000003', 'a0000001-0000-0000-0000-000000000002', '3 Series', 2019, 2024),
        ('b0000001-0000-0000-0000-000000000004', 'a0000001-0000-0000-0000-000000000002', 'X5', 2019, 2025),
        ('b0000001-0000-0000-0000-000000000005', 'a0000001-0000-0000-0000-000000000003', 'Golf', 2020, 2024),
        ('b0000001-0000-0000-0000-000000000006', 'a0000001-0000-0000-0000-000000000003', 'Tiguan', 2021, 2025)
    `)

    // Categories (Engine > Filters, Brakes > Pads, Suspension)
    await queryRunner.query(`
      INSERT INTO categories (id, name, slug, parent_id) VALUES
        ('c0000001-0000-0000-0000-000000000001', 'Engine', 'engine', NULL),
        ('c0000001-0000-0000-0000-000000000002', 'Filters', 'filters', 'c0000001-0000-0000-0000-000000000001'),
        ('c0000001-0000-0000-0000-000000000003', 'Brakes', 'brakes', NULL),
        ('c0000001-0000-0000-0000-000000000004', 'Pads', 'pads', 'c0000001-0000-0000-0000-000000000003'),
        ('c0000001-0000-0000-0000-000000000005', 'Suspension', 'suspension', NULL)
    `)

    // Products (10)
    await queryRunner.query(`
      INSERT INTO products (id, sku, title, price, stock, category_id, specs) VALUES
        ('d0000001-0000-0000-0000-000000000001', 'OIL-TOY-001', 'Oil Filter Toyota Corolla', 12.50, 45, 'c0000001-0000-0000-0000-000000000002', '{"material": "cellulose", "threadSize": "M20x1.5"}'),
        ('d0000001-0000-0000-0000-000000000002', 'AIR-TOY-001', 'Air Filter Toyota Camry', 18.00, 30, 'c0000001-0000-0000-0000-000000000002', '{"type": "panel"}'),
        ('d0000001-0000-0000-0000-000000000003', 'BRK-BMW-001', 'Front Brake Pads BMW 3 Series', 45.00, 20, 'c0000001-0000-0000-0000-000000000004', '{"material": "ceramic", "position": "front"}'),
        ('d0000001-0000-0000-0000-000000000004', 'BRK-BMW-002', 'Rear Brake Pads BMW X5', 42.00, 15, 'c0000001-0000-0000-0000-000000000004', '{"material": "semi-metallic", "position": "rear"}'),
        ('d0000001-0000-0000-0000-000000000005', 'OIL-VW-001', 'Oil Filter VW Golf', 10.00, 50, 'c0000001-0000-0000-0000-000000000002', '{"material": "synthetic"}'),
        ('d0000001-0000-0000-0000-000000000006', 'SUS-TOY-001', 'Front Shock Absorber Toyota Corolla', 85.00, 10, 'c0000001-0000-0000-0000-000000000005', '{"type": "gas", "position": "front"}'),
        ('d0000001-0000-0000-0000-000000000007', 'BRK-TOY-001', 'Brake Pads Toyota Camry', 35.00, 25, 'c0000001-0000-0000-0000-000000000004', '{"material": "ceramic"}'),
        ('d0000001-0000-0000-0000-000000000008', 'AIR-BMW-001', 'Air Filter BMW 3 Series', 22.00, 18, 'c0000001-0000-0000-0000-000000000002', '{"type": "cylinder"}'),
        ('d0000001-0000-0000-0000-000000000009', 'SUS-VW-001', 'Rear Shock Absorber VW Tiguan', 78.00, 8, 'c0000001-0000-0000-0000-000000000005', '{"type": "hydraulic", "position": "rear"}'),
        ('d0000001-0000-0000-0000-000000000010', 'OIL-BMW-001', 'Oil Filter BMW X5', 15.00, 35, 'c0000001-0000-0000-0000-000000000002', '{"material": "cellulose", "threadSize": "M25x2.0"}')
    `)

    // Product-Vehicle links
    await queryRunner.query(`
      INSERT INTO product_vehicles (product_id, vehicle_id) VALUES
        ('d0000001-0000-0000-0000-000000000001', 'b0000001-0000-0000-0000-000000000001'),
        ('d0000001-0000-0000-0000-000000000002', 'b0000001-0000-0000-0000-000000000002'),
        ('d0000001-0000-0000-0000-000000000003', 'b0000001-0000-0000-0000-000000000003'),
        ('d0000001-0000-0000-0000-000000000004', 'b0000001-0000-0000-0000-000000000004'),
        ('d0000001-0000-0000-0000-000000000005', 'b0000001-0000-0000-0000-000000000005'),
        ('d0000001-0000-0000-0000-000000000006', 'b0000001-0000-0000-0000-000000000001'),
        ('d0000001-0000-0000-0000-000000000007', 'b0000001-0000-0000-0000-000000000002'),
        ('d0000001-0000-0000-0000-000000000008', 'b0000001-0000-0000-0000-000000000003'),
        ('d0000001-0000-0000-0000-000000000009', 'b0000001-0000-0000-0000-000000000006'),
        ('d0000001-0000-0000-0000-000000000010', 'b0000001-0000-0000-0000-000000000004'),
        ('d0000001-0000-0000-0000-000000000001', 'b0000001-0000-0000-0000-000000000002'),
        ('d0000001-0000-0000-0000-000000000003', 'b0000001-0000-0000-0000-000000000004'),
        ('d0000001-0000-0000-0000-000000000005', 'b0000001-0000-0000-0000-000000000006'),
        ('d0000001-0000-0000-0000-000000000006', 'b0000001-0000-0000-0000-000000000002')
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DELETE FROM product_vehicles`)
    await queryRunner.query(`DELETE FROM products`)
    await queryRunner.query(`DELETE FROM categories`)
    await queryRunner.query(`DELETE FROM vehicles`)
    await queryRunner.query(`DELETE FROM brands`)
  }
}

import { Entity, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm'
import type { Product } from './product.entity'
import type { Vehicle } from './vehicle.entity'

@Entity('product_vehicles')
export class ProductVehicle {
  @PrimaryColumn({ name: 'product_id', type: 'uuid' })
  productId: string

  @PrimaryColumn({ name: 'vehicle_id', type: 'uuid' })
  vehicleId: string

  @ManyToOne(
    // biome-ignore lint/style/noCommonJs: circular import lazy load
    () => require('./product.entity').Product,
    (product: Product) => product.productVehicles,
  )
  @JoinColumn({ name: 'product_id' })
  product: Product

  // biome-ignore lint/style/noCommonJs: circular import lazy load
  @ManyToOne(() => require('./vehicle.entity').Vehicle)
  @JoinColumn({ name: 'vehicle_id' })
  vehicle: Vehicle
}

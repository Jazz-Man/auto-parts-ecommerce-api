import type { Product } from './product.entity'
import type { Vehicle } from './vehicle.entity'
import { Entity, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm'

@Entity('product_vehicles')
export class ProductVehicle {
  @PrimaryColumn({ name: 'product_id', type: 'uuid' })
  productId: string

  @PrimaryColumn({ name: 'vehicle_id', type: 'uuid' })
  vehicleId: string

  @ManyToOne(
    () => require('./product.entity').Product,
    (product: Product) => product.productVehicles,
  )
  @JoinColumn({ name: 'product_id' })
  product: Product

  @ManyToOne(() => require('./vehicle.entity').Vehicle)
  @JoinColumn({ name: 'vehicle_id' })
  vehicle: Vehicle
}

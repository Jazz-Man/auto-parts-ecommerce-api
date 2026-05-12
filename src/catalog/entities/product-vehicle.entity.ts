import { Entity, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm'
import { Product } from './product.entity'
import { Vehicle } from './vehicle.entity'

@Entity('product_vehicles')
export class ProductVehicle {
  @PrimaryColumn('uuid')
  productId: string

  @PrimaryColumn('uuid')
  vehicleId: string

  @ManyToOne(() => Product, (product) => product.productVehicles)
  @JoinColumn({ name: 'product_id' })
  product: Product

  @ManyToOne(() => Vehicle)
  @JoinColumn({ name: 'vehicle_id' })
  vehicle: Vehicle
}

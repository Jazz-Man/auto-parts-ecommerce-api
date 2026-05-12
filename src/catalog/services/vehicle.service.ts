import { Injectable, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { CreateVehicleDto } from '../dto/create-vehicle.dto'
import { UpdateVehicleDto } from '../dto/update-vehicle.dto'
import { Vehicle } from '../entities/vehicle.entity'

@Injectable()
export class VehicleService {
  constructor(
    @InjectRepository(Vehicle)
    private readonly vehicleRepo: Repository<Vehicle>,
  ) {}

  findAll(brandId?: string): Promise<Vehicle[]> {
    const where: Record<string, unknown> = {}
    if (brandId) where.brandId = brandId
    return this.vehicleRepo.find({ relations: ['brand'], where })
  }

  search(q: string): Promise<Vehicle[]> {
    return this.vehicleRepo
      .createQueryBuilder('vehicle')
      .leftJoinAndSelect('vehicle.brand', 'brand')
      .where('vehicle.model ILIKE :q', { q: `%${q}%` })
      .getMany()
  }

  async findOne(id: string): Promise<Vehicle> {
    const vehicle = await this.vehicleRepo.findOne({
      relations: ['brand'],
      where: { id },
    })
    if (!vehicle) throw new NotFoundException('Vehicle not found')
    return vehicle
  }

  create(dto: CreateVehicleDto): Promise<Vehicle> {
    const vehicle = this.vehicleRepo.create(dto)
    return this.vehicleRepo.save(vehicle)
  }

  async update(id: string, dto: UpdateVehicleDto): Promise<Vehicle> {
    const vehicle = await this.findOne(id)
    Object.assign(vehicle, dto)
    return this.vehicleRepo.save(vehicle)
  }

  async remove(id: string): Promise<{ deleted: true }> {
    const vehicle = await this.findOne(id)
    await this.vehicleRepo.remove(vehicle)
    return { deleted: true }
  }
}

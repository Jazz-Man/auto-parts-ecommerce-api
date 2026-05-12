import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common'
import { RolesGuard } from '../../common/guards/roles.guard'
import { Public } from '../../common/decorators/public.decorator'
import { Roles } from '../../common/decorators/roles.decorator'
import { UserRole } from '../../auth/entities/user-role.enum'
import { VehicleService } from '../services/vehicle.service'
import { CreateVehicleDto } from '../dto/create-vehicle.dto'
import { UpdateVehicleDto } from '../dto/update-vehicle.dto'

@Controller()
export class VehicleController {
  constructor(private readonly vehicleService: VehicleService) {}

  @Public()
  @Get('vehicles')
  findAll(@Query('brand_id') brandId?: string) {
    return this.vehicleService.findAll(brandId)
  }

  @Public()
  @Get('vehicles/search')
  search(@Query('q') q: string) {
    return this.vehicleService.search(q)
  }

  @Roles(UserRole.ADMIN)
  @UseGuards(RolesGuard)
  @Post('admin/vehicles')
  create(@Body() dto: CreateVehicleDto) {
    return this.vehicleService.create(dto)
  }

  @Roles(UserRole.ADMIN)
  @UseGuards(RolesGuard)
  @Patch('admin/vehicles/:id')
  update(@Param('id') id: string, @Body() dto: UpdateVehicleDto) {
    return this.vehicleService.update(id, dto)
  }

  @Roles(UserRole.ADMIN)
  @UseGuards(RolesGuard)
  @Delete('admin/vehicles/:id')
  remove(@Param('id') id: string) {
    return this.vehicleService.remove(id)
  }
}

import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common'
import { RolesGuard } from '../../common/guards/roles.guard'
import { Public } from '../../common/decorators/public.decorator'
import { Roles } from '../../common/decorators/roles.decorator'
import { UserRole } from '../../auth/entities/user-role.enum'
import { BrandService } from '../services/brand.service'
import { CreateBrandDto } from '../dto/create-brand.dto'
import { UpdateBrandDto } from '../dto/update-brand.dto'

@Controller()
export class BrandController {
  constructor(private readonly brandService: BrandService) {}

  @Public()
  @Get('brands')
  findAll() {
    return this.brandService.findAll()
  }

  @Roles(UserRole.ADMIN)
  @UseGuards(RolesGuard)
  @Post('admin/brands')
  create(@Body() dto: CreateBrandDto) {
    return this.brandService.create(dto)
  }

  @Roles(UserRole.ADMIN)
  @UseGuards(RolesGuard)
  @Patch('admin/brands/:id')
  update(@Param('id') id: string, @Body() dto: UpdateBrandDto) {
    return this.brandService.update(id, dto)
  }

  @Roles(UserRole.ADMIN)
  @UseGuards(RolesGuard)
  @Delete('admin/brands/:id')
  remove(@Param('id') id: string) {
    return this.brandService.remove(id)
  }
}

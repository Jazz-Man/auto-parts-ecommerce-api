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
import { CategoryService } from '../services/category.service'
import { CreateCategoryDto } from '../dto/create-category.dto'
import { UpdateCategoryDto } from '../dto/update-category.dto'

@Controller()
export class CategoryController {
  constructor(private readonly categoryService: CategoryService) {}

  @Public()
  @Get('categories')
  getTree() {
    return this.categoryService.getTree()
  }

  @Roles(UserRole.ADMIN)
  @UseGuards(RolesGuard)
  @Post('admin/categories')
  create(@Body() dto: CreateCategoryDto) {
    return this.categoryService.create(dto)
  }

  @Roles(UserRole.ADMIN)
  @UseGuards(RolesGuard)
  @Patch('admin/categories/:id')
  update(@Param('id') id: string, @Body() dto: UpdateCategoryDto) {
    return this.categoryService.update(id, dto)
  }

  @Roles(UserRole.ADMIN)
  @UseGuards(RolesGuard)
  @Delete('admin/categories/:id')
  remove(@Param('id') id: string) {
    return this.categoryService.remove(id)
  }
}

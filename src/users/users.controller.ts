import {
  Controller,
  Get,
  Body,
  Patch,
  Param,
  UseInterceptors,
  ClassSerializerInterceptor,
  Query,
  ParseUUIDPipe,
} from '@nestjs/common';
import { UsersService } from './users.service';

import { Auth, GetUser } from 'src/auth/decorators';
import { UserRole } from 'src/auth/enums/user-role.enum';
import { PaginationDto } from 'src/common/dto/pagination.dto';

@Controller('users')
@UseInterceptors(ClassSerializerInterceptor)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @Auth(UserRole.ADMIN)
  findAll(@Query() paginationDto: PaginationDto) {
    return this.usersService.findAll(paginationDto);
  }

  @Get(':id')
  @Auth(UserRole.ADMIN)
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.usersService.findOne(id);
  }

  @Patch(':id/roles')
  @Auth(UserRole.ADMIN)
  updateRoles(
    @Param('id', ParseUUIDPipe) id: string,
    @Body('roles') roles: UserRole[],
  ) {
    return this.usersService.updateRoles(id, roles);
  }

  @Patch(':id/toggle')
  @Auth(UserRole.ADMIN)
  toggleStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @GetUser('id') adminId: string,
  ) {
    return this.usersService.toggleStatus(id, adminId);
  }
}

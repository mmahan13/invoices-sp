import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  ParseUUIDPipe,
  ClassSerializerInterceptor,
  UseInterceptors,
  HttpCode,
  HttpStatus,
  Query,
} from '@nestjs/common';
import { ClientsService } from './clients.service';
import { CreateClientDto } from './dto/create-client.dto';
import { UpdateClientDto } from './dto/update-client.dto';
import { Auth, GetUser } from 'src/auth/decorators';
import { User } from 'src/auth/entities/user.entity';
import { Client } from './entities/client.entity';
import { PaginationDto } from 'src/common/dto/pagination.dto';
import { PaginatedResponse } from 'src/interfaces/paginate-response.model';

@Controller('clients')
@Auth()
@UseInterceptors(ClassSerializerInterceptor) //activa los excludes en product entity y client entity
export class ClientsController {
  constructor(private readonly clientsService: ClientsService) {}

  @Post()
  create(@Body() createClientDto: CreateClientDto, @GetUser() user: User) {
    return this.clientsService.create(createClientDto, user);
  }

  @Get()
  findAll(
    @Query() paginationDto: PaginationDto, // Recibimos page y limit
    @GetUser() user: User,
  ): Promise<PaginatedResponse<Client>> {
    // Cambiamos el tipo de retorno
    return this.clientsService.findAll(paginationDto, user);
  }

  @Get('selector')
  findForSelector(@GetUser() user: User): Promise<Partial<Client>[]> {
    return this.clientsService.findAllForSelector(user);
  }

  //@Auth(UserRole.ADMIN)
  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string, @GetUser() user: User) {
    return this.clientsService.findOne(id, user);
  }

  //@Auth(UserRole.ADMIN)
  @Get(':id/detail')
  findOneByClient(
    @Param('id', ParseUUIDPipe) id: string,
    @GetUser() user: User,
  ) {
    return this.clientsService.findOneByClientDetail(id, user);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateClientDto: UpdateClientDto,
    @GetUser() user: User,
  ) {
    return this.clientsService.update(id, updateClientDto, user);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT) // Esto forzará el 204
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @GetUser() user: User,
  ): Promise<void> {
    return this.clientsService.remove(id, user);
  }
}

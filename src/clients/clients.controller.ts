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
} from '@nestjs/common';
import { ClientsService } from './clients.service';
import { CreateClientDto } from './dto/create-client.dto';
import { UpdateClientDto } from './dto/update-client.dto';
import { Auth, GetUser } from 'src/auth/decorators';
import { User } from 'src/auth/entities/user.entity';
import { Client } from './entities/client.entity';

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
  findAll(@GetUser() user: User): Promise<Client[]> {
    return this.clientsService.findAll(user);
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

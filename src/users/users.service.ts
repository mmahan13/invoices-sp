import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { User } from 'src/auth/entities/user.entity';
import { Repository } from 'typeorm';
import { PaginationDto } from 'src/common/dto/pagination.dto';
import { PaginatedResponse } from 'src/interfaces/paginate-response.model';
import { UserRole } from 'src/auth/enums/user-role.enum';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  // 1. Ver a todo el mundo (Paginado)
  async findAll(
    paginationDto: PaginationDto,
  ): Promise<PaginatedResponse<User>> {
    const { page = 1, limit = 10 } = paginationDto;
    const skip = (page - 1) * limit;

    const [users, total] = await this.userRepository.findAndCount({
      skip,
      take: limit,
      order: { createdAt: 'DESC' },
    });

    return {
      data: users,
      meta: {
        totalItems: total,
        itemCount: users.length,
        itemsPerPage: limit,
        totalPages: Math.ceil(total / limit),
        currentPage: page,
      },
    };
  }

  // 2. Ver el detalle de un usuario (por si quieres ver sus productos/facturas)
  async findOne(id: string) {
    const user = await this.userRepository.findOne({
      where: { id },
      relations: ['company'], // Por si quieres ver los datos de su empresa
    });
    if (!user) throw new NotFoundException('Usuario no existe');
    return user;
  }

  // 3. Cambiar Roles (Ej: convertir a Manuel en Admin o Super Admin)
  async updateRoles(id: string, roles: UserRole[]) {
    const user = await this.findOne(id);
    user.roles = roles;
    return await this.userRepository.save(user);
  }

  // 4. El "Interruptor" (Activar/Desactivar)
  async toggleStatus(id: string, adminId: string) {
    if (id === adminId)
      throw new BadRequestException('No puedes suicidarte digitalmente');

    const user = await this.findOne(id);
    user.isActive = !user.isActive;
    return await this.userRepository.save(user);
  }
}

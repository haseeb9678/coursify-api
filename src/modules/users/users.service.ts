import { Injectable } from '@nestjs/common';

import type { CreateUserData } from './types/create-user.type.js';

import { PrismaService } from '../../database/prisma.service.js';

import { UserRole } from '../../generated/prisma/enums.js';

@Injectable()
export class UsersService {
    constructor(
        private readonly prisma: PrismaService,
    ) { }

    async createUser(data: CreateUserData) {
        return this.prisma.user.create({
            data: {
                name: data.name,
                email: data.email.toLowerCase().trim(),
                passwordHash: data.passwordHash,
                role: UserRole.STUDENT,
            },
            omit: {
                passwordHash: true,
            },
        });
    }

    async getAllUsers() {
        return this.prisma.user.findMany({
            omit: {
                passwordHash: true
            }
        })
    }

    async findUserByEmail(email: string) {
        return this.prisma.user.findUnique({
            where: {
                email: email.toLowerCase().trim(),
            },
            omit: {
                passwordHash: true,
            },
        });
    }

    async findUserByEmailForAuth(email: string) {
        return this.prisma.user.findUnique({
            where: {
                email: email.toLowerCase().trim(),
            }
        });
    }

    async findUserById(id: string) {
        return this.prisma.user.findUnique({
            where: {
                id
            },
            omit: {
                passwordHash: true
            }
        })
    }

    async updateLastLogin(id: string) {
        return this.prisma.user.update({
            where: {
                id,
            },
            data: {
                lastLoginAt: new Date(),
            },
            omit: {
                passwordHash: true,
            },
        });
    }
}
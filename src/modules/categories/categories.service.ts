import {
    BadRequestException,
    ConflictException,
    Injectable,
    Logger,
    NotFoundException,
} from '@nestjs/common';

import { Prisma } from '../../generated/prisma/client.js';
import {
    CategoryStatus,
    CourseStatus,
} from '../../generated/prisma/enums.js';
import { PaginationInput } from '../../common/pagination/pagination.input.js';
import {
    createPaginationMeta,
    getPaginationWindow,
} from '../../common/pagination/pagination.utils.js';
import { SortDirection } from '../../common/enums/sort-direction.enum.js';
import { mapPrismaError } from '../../common/utils/prisma-error.util.js';
import { PrismaService } from '../../database/prisma.service.js';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.type.js';
import {
    AdminCategoriesFilterInput,
    AdminCreateCategoryInput,
    AdminUpdateCategoryInput,
    AdminUpdateCategoryStatusInput,
    AdminCategorySortInput,
} from './dto/category.inputs.js';
import { AdminCategorySortField } from './enums/category-sort-field.enum.js';

function normalizeSlug(value: string): string {
    return value
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 120);
}

@Injectable()
export class CategoriesService {
    private readonly logger = new Logger(CategoriesService.name);

    constructor(private readonly prisma: PrismaService) {}

    async findAdminCategories(
        pagination: PaginationInput,
        filter?: AdminCategoriesFilterInput,
        sort?: AdminCategorySortInput,
    ) {
        const window = getPaginationWindow(pagination);
        const search = filter?.search?.trim();
        const where: Prisma.CategoryWhereInput = {};
        if (search) {
            where.OR = [
                { name: { contains: search, mode: 'insensitive' } },
                { slug: { contains: search, mode: 'insensitive' } },
            ];
        }
        if (filter?.status) {
            where.status = filter.status;
        }

        const direction =
            sort?.direction === SortDirection.ASC ? 'asc' : 'desc';
        let orderBy: Prisma.CategoryOrderByWithRelationInput;
        switch (sort?.field) {
            case AdminCategorySortField.NAME:
                orderBy = { name: direction };
                break;
            case AdminCategorySortField.UPDATED_AT:
                orderBy = { updatedAt: direction };
                break;
            case AdminCategorySortField.COURSE_COUNT:
                orderBy = { courses: { _count: direction } };
                break;
            case AdminCategorySortField.CREATED_AT:
            default:
                orderBy = { createdAt: direction };
        }

        const [categories, total] = await this.prisma.$transaction([
            this.prisma.category.findMany({
                where,
                orderBy: [orderBy, { id: 'asc' }],
                skip: window.skip,
                take: window.take,
                select: {
                    id: true,
                    name: true,
                    slug: true,
                    description: true,
                    iconName: true,
                    iconColor: true,
                    iconBackground: true,
                    imageUrl: true,
                    status: true,
                    createdAt: true,
                    updatedAt: true,
                    _count: { select: { courses: true } },
                },
            }),
            this.prisma.category.count({ where }),
        ]);

        return {
            items: categories.map((category) => ({
                ...category,
                courseCount: category._count.courses,
            })),
            meta: createPaginationMeta(window.page, window.limit, total),
        };
    }

    async findAdminCategory(id: string) {
        const category = await this.prisma.category.findUnique({
            where: { id },
            select: {
                id: true,
                name: true,
                slug: true,
                description: true,
                iconName: true,
                iconColor: true,
                iconBackground: true,
                imageUrl: true,
                status: true,
                createdAt: true,
                updatedAt: true,
                _count: {
                    select: {
                        courses: true,
                    },
                },
            },
        });
        if (!category) {
            throw new NotFoundException('Category not found');
        }
        return {
            ...category,
            courseCount: category._count.courses,
        };
    }

    async getAdminStats() {
        const [totalCategories, activeCategories, inactiveCategories, categorizedCourses] =
            await this.prisma.$transaction([
                this.prisma.category.count(),
                this.prisma.category.count({
                    where: { status: CategoryStatus.ACTIVE },
                }),
                this.prisma.category.count({
                    where: { status: CategoryStatus.INACTIVE },
                }),
                this.prisma.course.count(),
            ]);
        return {
            totalCategories,
            activeCategories,
            inactiveCategories,
            categorizedCourses,
        };
    }

    async createCategory(
        input: AdminCreateCategoryInput,
        actor: AuthenticatedUser,
    ) {
        const name = input.name.trim();
        if (!name) {
            throw new BadRequestException('Category name is required');
        }
        const slug = input.slug ? normalizeSlug(input.slug) : normalizeSlug(name);
        if (!slug) {
            throw new BadRequestException('A valid category slug is required');
        }

        try {
            const category = await this.prisma.category.create({
                data: {
                    name,
                    slug,
                    description: input.description.trim(),
                    iconName: input.iconName,
                    iconColor: input.iconColor,
                    iconBackground: input.iconBackground,
                    imageUrl: input.imageUrl?.trim() || null,
                    status: input.status ?? CategoryStatus.ACTIVE,
                },
                select: {
                    id: true,
                    name: true,
                    slug: true,
                    description: true,
                    iconName: true,
                    iconColor: true,
                    iconBackground: true,
                    imageUrl: true,
                    status: true,
                    createdAt: true,
                    updatedAt: true,
                },
            });
            this.logger.log(`Admin ${actor.userId} created category ${category.id}`);
            return { ...category, courseCount: 0 };
        } catch (error: unknown) {
            const mapped = mapPrismaError(error);
            if (mapped) throw mapped;
            throw error;
        }
    }

    async updateCategory(input: AdminUpdateCategoryInput) {
        if (
            input.name === undefined &&
            input.slug === undefined &&
            input.description === undefined &&
            input.iconName === undefined &&
            input.iconColor === undefined &&
            input.iconBackground === undefined &&
            input.imageUrl === undefined &&
            input.status === undefined
        ) {
            throw new BadRequestException('At least one category field must be provided');
        }

        try {
            const category = await this.prisma.category.update({
                where: { id: input.id },
                data: {
                    ...(input.name !== undefined ? { name: input.name.trim() } : {}),
                    ...(input.slug !== undefined ? { slug: normalizeSlug(input.slug) } : {}),
                    ...(input.description !== undefined
                        ? { description: input.description.trim() }
                        : {}),
                    ...(input.iconName !== undefined ? { iconName: input.iconName } : {}),
                    ...(input.iconColor !== undefined ? { iconColor: input.iconColor } : {}),
                    ...(input.iconBackground !== undefined
                        ? { iconBackground: input.iconBackground }
                        : {}),
                    ...(input.imageUrl !== undefined
                        ? { imageUrl: input.imageUrl?.trim() || null }
                        : {}),
                    ...(input.status !== undefined ? { status: input.status } : {}),
                },
                select: {
                    id: true,
                    name: true,
                    slug: true,
                    description: true,
                    iconName: true,
                    iconColor: true,
                    iconBackground: true,
                    imageUrl: true,
                    status: true,
                    createdAt: true,
                    updatedAt: true,
                    _count: { select: { courses: true } },
                },
            });
            return { ...category, courseCount: category._count.courses };
        } catch (error: unknown) {
            const mapped = mapPrismaError(error);
            if (mapped) throw mapped;
            throw error;
        }
    }

    async updateCategoryStatus(input: AdminUpdateCategoryStatusInput) {
        const category = await this.prisma.category.update({
            where: { id: input.id },
            data: { status: input.status },
            select: {
                id: true,
                name: true,
                slug: true,
                description: true,
                iconName: true,
                iconColor: true,
                iconBackground: true,
                imageUrl: true,
                status: true,
                createdAt: true,
                updatedAt: true,
                _count: { select: { courses: true } },
            },
        }).catch((error: unknown) => {
            const mapped = mapPrismaError(error);
            if (mapped) throw mapped;
            throw error;
        });
        return { ...category, courseCount: category._count.courses };
    }

    async deleteCategory(id: string) {
        const category = await this.prisma.category.findUnique({
            where: { id },
            select: { id: true, _count: { select: { courses: true } } },
        });
        if (!category) {
            throw new NotFoundException('Category not found');
        }
        if (category._count.courses > 0) {
            throw new ConflictException(
                'Category cannot be deleted while courses are assigned to it',
            );
        }
        await this.prisma.category.delete({ where: { id } });
        return { success: true, message: 'Category deleted successfully' };
    }

    async findPublicCategories(pagination: PaginationInput, search?: string) {
        const window = getPaginationWindow(pagination);
        const trimmed = search?.trim();
        const where: Prisma.CategoryWhereInput = {
            status: CategoryStatus.ACTIVE,
            ...(trimmed
                ? {
                      OR: [
                          { name: { contains: trimmed, mode: 'insensitive' } },
                          { slug: { contains: trimmed, mode: 'insensitive' } },
                      ],
                  }
                : {}),
        };
        const [categories, total] = await this.prisma.$transaction([
            this.prisma.category.findMany({
                where,
                orderBy: [{ name: 'asc' }, { id: 'asc' }],
                skip: window.skip,
                take: window.take,
                select: {
                    id: true,
                    name: true,
                    slug: true,
                    description: true,
                    iconName: true,
                    iconColor: true,
                    iconBackground: true,
                    imageUrl: true,
                    _count: {
                        select: {
                            courses: {
                                where: {
                                    status: CourseStatus.PUBLISHED,
                                    instructor: {
                                        status: 'ACTIVE',
                                        role: 'INSTRUCTOR',
                                    },
                                },
                            },
                        },
                    },
                },
            }),
            this.prisma.category.count({ where }),
        ]);
        return {
            items: categories.map((category) => ({
                ...category,
                courseCount: category._count.courses,
            })),
            meta: createPaginationMeta(window.page, window.limit, total),
        };
    }

    async findPublicCategory(slug: string) {
        const category = await this.prisma.category.findFirst({
            where: { slug, status: CategoryStatus.ACTIVE },
            select: {
                id: true,
                name: true,
                slug: true,
                description: true,
                iconName: true,
                iconColor: true,
                iconBackground: true,
                imageUrl: true,
                _count: {
                    select: {
                        courses: {
                            where: {
                                status: CourseStatus.PUBLISHED,
                                instructor: { status: 'ACTIVE', role: 'INSTRUCTOR' },
                            },
                        },
                    },
                },
            },
        });
        if (!category) {
            throw new NotFoundException('Category not found');
        }
        return { ...category, courseCount: category._count.courses };
    }
}

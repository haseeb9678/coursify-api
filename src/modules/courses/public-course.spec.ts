import { GraphQLSchemaBuilderModule, GraphQLSchemaFactory } from '@nestjs/graphql';
import { Test } from '@nestjs/testing';
import { createRequire } from 'node:module';

import type { PrismaService } from '../../database/prisma.service.js';
import { CoursesService } from './courses.service.js';
import { PublicCoursesResolver } from './public-courses.resolver.js';

// Nest's schema builder loads the CommonJS GraphQL runtime.
const { graphql, isObjectType }: typeof import('graphql') = createRequire(import.meta.url)('graphql');

describe('Public course details', () => {
    it('returns ordered curriculum metadata with the published course and excludes private lesson fields', async () => {
        const id = 'f14325b0-5fe2-4567-8109-a5ab2def217f';
        const slug = 'introduction-to-design';
        const lesson = { title: 'Introduction', durationSeconds: 90, isPreview: false };
        const findFirst = vi.fn().mockResolvedValue({
            id,
            slug,
            title: 'Introduction to Design',
            updatedAt: new Date('2026-11-22T00:00:00.000Z'),
            sections: [{ title: 'Getting started', lessons: [{ ...lesson, _count: { resources: 2 } }] }],
        });
        const findMany = vi.fn().mockResolvedValue([]);
        const findUnique = vi.fn().mockResolvedValue({ categoryId: "category-id" });
        const count = vi.fn().mockResolvedValue(0);
        const prisma = {
            course: { findFirst, findMany, findUnique, count },
            $transaction: (queries: Promise<unknown>[]) => Promise.all(queries),
        } as unknown as PrismaService;
        const resolver = new PublicCoursesResolver(new CoursesService(prisma));
        const module = await Test.createTestingModule({
            imports: [GraphQLSchemaBuilderModule],
        }).compile();

        try {
            await module.init();
            const schema = await module.get(GraphQLSchemaFactory).create([PublicCoursesResolver]);
            const result = await graphql({
                schema,
                source: `
                    query Course($identifier: String!) {
                        course(identifier: $identifier) {
                            id
                            slug
                            updatedAt
                            curriculum { title lessons { title durationSeconds isPreview resourceCount } }
                        }
                    }
                `,
                variableValues: { identifier: slug },
                rootValue: { course: ({ identifier }: { identifier: string }) => resolver.course(identifier) },
            });

            expect(result.errors).toBeUndefined();
            expect(result.data?.course).toEqual({
                id,
                slug,
                updatedAt: '2026-11-22T00:00:00.000Z',
                curriculum: [{ title: 'Getting started', lessons: [{ ...lesson, resourceCount: 2 }] }],
            });
            expect(findFirst).toHaveBeenCalledWith(expect.objectContaining({
                where: {
                    OR: [{ slug }],
                    status: 'PUBLISHED',
                    category: { status: 'ACTIVE' },
                    instructor: { role: 'INSTRUCTOR', status: 'ACTIVE' },
                },
                select: expect.objectContaining({
                    sections: {
                        orderBy: { position: 'asc' },
                        select: {
                            title: true,
                            lessons: {
                                orderBy: { position: 'asc' },
                                select: {
                                    title: true,
                                    durationSeconds: true,
                                    isPreview: true,
                                    _count: { select: { resources: true } },
                                },
                            },
                        },
                    },
                }),
            }));
            const publicSelect = expect.not.objectContaining({ _count: expect.anything() });
            expect(findFirst).toHaveBeenCalledWith(expect.objectContaining({ select: publicSelect }));
            await resolver.courses({ page: 1, limit: 10 });
            await resolver.featuredCourses(6);
            await resolver.relatedCourses(id, 6);
            expect(findMany).toHaveBeenCalledTimes(3);
            for (const [query] of findMany.mock.calls) expect(query.select).not.toHaveProperty('_count');

            const lessonType = schema.getType('PublicCourseLesson');
            expect(isObjectType(lessonType) && Object.keys(lessonType.getFields()).sort()).toEqual([
                'durationSeconds', 'isPreview', 'resourceCount', 'title',
            ]);

            findFirst.mockResolvedValueOnce(null);
            await expect(resolver.course(id)).rejects.toThrow('Published course not found');
            expect(findFirst).toHaveBeenLastCalledWith(expect.objectContaining({
                where: expect.objectContaining({ OR: [{ id }, { slug: id }] }),
            }));
        } finally {
            await module.close();
        }
    });
});

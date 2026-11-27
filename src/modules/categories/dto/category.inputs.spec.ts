import 'reflect-metadata';
import { validateSync } from 'class-validator';
import { describe, expect, it } from 'vitest';
import {
    AdminCreateCategoryInput,
    AdminUpdateCategoryInput,
    CATEGORY_ICON_NAMES,
} from './category.inputs.js';

const id = '5db05adb-e099-4697-b942-2017e1e1aad7';
const colors = { iconColor: '#111111', iconBackground: '#ddeeff' };

describe('category appearance inputs', () => {
    it('accepts every curated and legacy icon on create and update', () => {
        for (const iconName of CATEGORY_ICON_NAMES) {
            const appearance = { iconName, ...colors };
            const create = Object.assign(new AdminCreateCategoryInput(), {
                name: 'Category',
                description: 'An example category',
                ...appearance,
            });
            const update = Object.assign(new AdminUpdateCategoryInput(), {
                id,
                ...appearance,
            });
            expect(validateSync(create)).toEqual([]);
            expect(validateSync(update)).toEqual([]);
        }
    });

    it('allows unrelated or independent appearance updates', () => {
        const update = new AdminUpdateCategoryInput();
        update.id = id;
        update.description = 'A new description';
        expect(validateSync(update)).toEqual([]);

        update.iconColor = '#aabbcc';
        expect(validateSync(update)).toEqual([]);
    });

    it('rejects unknown icons and arbitrary color expressions', () => {
        const update = Object.assign(new AdminUpdateCategoryInput(), {
            id,
            iconName: 'UnknownIcon',
            iconColor: 'var(--primary)',
            iconBackground: '#abc',
        });
        expect(validateSync(update).map(({ property }) => property)).toEqual([
            'iconName',
            'iconColor',
            'iconBackground',
        ]);
    });
});

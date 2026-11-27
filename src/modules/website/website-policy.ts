import { BadRequestException } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client.js';
import type { HeroSlideInput, PopupInput } from './website.types.js';

export const PUBLIC_CONTENT_LIMIT = 30;
const SITE_ORIGIN = 'https://internal.invalid';

function hasUnsafeCharacters(value: string): boolean {
    return /[\\\s]/.test(value) || [...value].some((character) => {
        const code = character.charCodeAt(0);
        return code < 32 || code === 127;
    });
}

export function publicPath(value: string): string | null {
    if (!value.startsWith('/') || value.startsWith('//') || /[?#!]/.test(value) || hasUnsafeCharacters(value)) return null;
    const url = new URL(value, SITE_ORIGIN);
    const path = url.pathname.replace(/\/$/, '') || '/';
    return path === '/' || /^\/courses(?:\/[a-zA-Z0-9-]+)?$/.test(path) ? path : null;
}

export function safeReference(value?: string | null): string | null {
    const reference = value?.trim();
    if (!reference) return null;
    if (hasUnsafeCharacters(reference) || /%(?:0[0-9a-f]|1[0-9a-f]|2f|5c|7f)/i.test(reference)) {
        throw new BadRequestException('Enter a site-relative path or a valid HTTPS URL.');
    }
    try {
        if (reference.startsWith('/') && !reference.startsWith('//')) {
            const url = new URL(reference, SITE_ORIGIN);
            if (url.origin === SITE_ORIGIN) return reference;
        }
        if (/^https:\/\/[^/?#]/.test(reference)) {
            const url = new URL(reference);
            if (url.hostname && !url.username && !url.password) return url.href;
        }
    } catch {
        throw new BadRequestException('Enter a site-relative path or a valid HTTPS URL.');
    }
    throw new BadRequestException('Enter a site-relative path or a valid HTTPS URL.');
}

function publicImage(value?: string | null): string | null {
    const reference = safeReference(value);
    if (!reference) return null;

    const url = new URL(reference, SITE_ORIGIN);
    const hasCredentials = [...url.searchParams.keys()].some((key) =>
        /^(?:x-amz-|x-goog-)/i.test(key) ||
        /^(?:token|access_token|api_key|sig|signature|awsaccesskeyid|googleaccessid|key-pair-id|policy|credential)$/i.test(key),
    );
    if (hasCredentials) throw new BadRequestException('Use a public image URL without signed credentials.');
    return reference;
}

export function liveWindow(now: Date): Prisma.HeroSlideWhereInput & Prisma.PromotionalPopupWhereInput {
    return {
        status: 'ACTIVE',
        AND: [
            { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
            { OR: [{ endsAt: null }, { endsAt: { gt: now } }] },
        ],
    };
}

function content(input: HeroSlideInput | PopupInput) {
    const { startsAt, endsAt, status } = input;
    if (startsAt && endsAt && endsAt <= startsAt) throw new BadRequestException('The end must be later than the start.');
    const data = {
        internalName: input.internalName.trim(),
        title: input.title.trim(),
        description: input.description.trim(),
        imageUrl: publicImage(input.imageUrl),
        imageAlt: input.imageAlt.trim(),
        primaryCtaLabel: input.primaryCtaLabel.trim(),
        primaryCtaHref: safeReference(input.primaryCtaHref),
        secondaryCtaLabel: input.secondaryCtaLabel.trim(),
        secondaryCtaHref: safeReference(input.secondaryCtaHref),
        startsAt: startsAt ?? null,
        endsAt: endsAt ?? null,
        status,
    };
    if (!data.internalName) throw new BadRequestException('Enter an internal name.');
    if (status === 'ACTIVE') {
        if (!data.title || !data.description) throw new BadRequestException('An active item needs a title and description.');
        if (Boolean(data.primaryCtaLabel) !== Boolean(data.primaryCtaHref) ||
            Boolean(data.secondaryCtaLabel) !== Boolean(data.secondaryCtaHref)) {
            throw new BadRequestException('Each call to action needs both a label and a destination.');
        }
        if (data.imageUrl && !data.imageAlt) throw new BadRequestException('Enter alternative text for the image.');
    }
    return data;
}

export function heroData(input: HeroSlideInput) {
    const data = content(input);
    if (data.status === 'ACTIVE' && (!data.imageUrl || !data.primaryCtaHref)) {
        throw new BadRequestException('An active slide needs a desktop image and primary call to action.');
    }
    return { ...data, eyebrow: input.eyebrow.trim(), mobileImageUrl: publicImage(input.mobileImageUrl), imagePosition: input.imagePosition };
}

export function popupData(input: PopupInput) {
    const data = content(input);
    const targetPaths = input.pageTarget === 'SPECIFIC_PATHS'
        ? [...new Set(input.targetPaths.map((path) => {
            const normalized = publicPath(path.trim());
            if (!normalized) throw new BadRequestException('Choose a public homepage, catalog, or course path.');
            return normalized;
        }))]
        : [];
    if (input.status === 'ACTIVE' && input.pageTarget === 'SPECIFIC_PATHS' && !targetPaths.length) {
        throw new BadRequestException('Enter at least one public path.');
    }
    if (input.status === 'ACTIVE' && input.displayFrequency === 'CUSTOM_INTERVAL' && !input.repeatAfterHours) {
        throw new BadRequestException('Set a custom repeat interval.');
    }
    return {
        ...data,
        layout: input.layout,
        priority: input.priority,
        triggerType: input.triggerType,
        delaySeconds: input.triggerType === 'AFTER_DELAY' ? input.delaySeconds : 0,
        displayFrequency: input.displayFrequency,
        repeatAfterHours: input.displayFrequency === 'CUSTOM_INTERVAL' ? input.repeatAfterHours ?? null : null,
        audience: input.audience,
        pageTarget: input.pageTarget,
        targetPaths,
    };
}

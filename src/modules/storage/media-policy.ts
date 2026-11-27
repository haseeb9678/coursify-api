import { BadRequestException } from '@nestjs/common';
import type { StorageConfig } from '../../config/storage.config.js';
import type { MediaPurpose } from '../../generated/prisma/enums.js';

const images = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };
const video = { mp4: 'video/mp4' };
const document = { pdf: 'application/pdf' };
const resources = {
    ...document, txt: 'text/plain', csv: 'text/csv', zip: 'application/zip',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
};

export function mediaPolicy(purpose: MediaPurpose, config: StorageConfig) {
    const files: Record<string, string> = purpose === 'LESSON_RESOURCE' ? resources :
        purpose === 'LESSON_DOCUMENT' ? document :
        purpose === 'LESSON_VIDEO' || purpose === 'COURSE_PROMOTIONAL_VIDEO' ? video : images;
    const limit = purpose === 'LESSON_RESOURCE' ? config.resourceLimit :
        purpose === 'LESSON_DOCUMENT' ? config.documentLimit :
        purpose === 'LESSON_VIDEO' ? config.videoLimit :
        purpose === 'COURSE_PROMOTIONAL_VIDEO' ? config.promoLimit : config.imageLimit;
    return { files, limit, visibility: purpose.startsWith('LESSON_') ? 'PRIVATE' as const : 'PUBLIC' as const };
}

export function checkUpload(purpose: MediaPurpose, fileName: string, mimeType: string, size: number, config: StorageConfig) {
    const clean = fileName.normalize('NFC').split('').filter((char) => char.charCodeAt(0) >= 32 && char.charCodeAt(0) !== 127).join('');
    const name = clean.split(/[\\/]/).at(-1)?.trim() ?? '';
    const extension = /\.([a-z0-9]{1,5})$/i.exec(name)?.[1].toLowerCase();
    const policy = mediaPolicy(purpose, config);
    const expected = extension && policy.files[extension];
    const declared = mimeType.trim().toLowerCase();
    const csvMime = extension === 'csv' && ['application/vnd.ms-excel', 'text/plain'].includes(declared);
    const zipMime = extension === 'zip' && declared === 'application/x-zip-compressed';
    if (!name || name.length > 255 || !extension || !expected || (declared && declared !== expected && !csvMime && !zipMime)) {
        throw new BadRequestException('This file format is not accepted for the selected field.');
    }
    if (!Number.isInteger(size) || size < 1 || size > policy.limit) {
        throw new BadRequestException(`Choose a nonempty file up to ${policy.limit / (1024 * 1024)} MB.`);
    }
    return { name, extension, mimeType: expected, visibility: policy.visibility };
}

export function matchesFileSignature(extension: string, bytes: Uint8Array): boolean {
    const sample = Buffer.from(bytes);
    const text = sample.toString('utf8');
    switch (extension) {
        case 'jpg': case 'jpeg': return sample.subarray(0, 3).equals(Buffer.from([255, 216, 255]));
        case 'png': return sample.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
        case 'webp': return sample.toString('ascii', 0, 4) === 'RIFF' && sample.toString('ascii', 8, 12) === 'WEBP';
        case 'mp4': {
            const boxSize = sample.length >= 12 ? sample.readUInt32BE(0) : 0;
            return boxSize >= 16 && sample.toString('ascii', 4, 8) === 'ftyp' &&
                /^(?:iso[2-9m]|mp4[12]|avc1|dash|M4V |MSNV|cmfc)$/.test(sample.toString('ascii', 8, 12));
        }
        case 'pdf': return /^%PDF-[12]\.[0-9]/.test(text);
        case 'zip': case 'docx': case 'pptx': case 'xlsx':
            return sample.subarray(0, 4).equals(Buffer.from([80, 75, 3, 4]));
        case 'txt': case 'csv':
            return !sample.some((byte) => byte < 32 && ![9, 10, 13].includes(byte)) &&
                !/^\s*<(?:!doctype|html|script|svg)\b/i.test(text);
        default: return false;
    }
}

export function fileDisposition(name: string, inline = false) {
    const ascii = name.replace(/[^a-zA-Z0-9._ -]/g, '_') || 'download';
    const encoded = encodeURIComponent(Buffer.from(name).toString('utf8')).replace(/['()*]/g, (char) => '%' + char.charCodeAt(0).toString(16).toUpperCase());
    return `${inline ? 'inline' : 'attachment'}; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}

import { Module } from '@nestjs/common';
import { R2StorageProvider } from './r2-storage.provider.js';
import { StorageAccessService } from './storage-access.service.js';
import { AdminStorageResolver, StorageOriginGuard, StorageResolver } from './storage.resolver.js';
import { StorageService } from './storage.service.js';

@Module({
    providers: [R2StorageProvider, StorageAccessService, StorageService, StorageResolver, AdminStorageResolver, StorageOriginGuard],
    exports: [StorageService, StorageAccessService],
})
export class StorageModule {}

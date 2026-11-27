import { Field, ID, InputType } from '@nestjs/graphql';
import {
    IsEnum,
    IsIn,
    IsNotEmpty,
    IsOptional,
    IsString,
    IsUUID,
    Matches,
    MaxLength,
    MinLength,
    ValidateIf,
} from 'class-validator';
import { Transform } from 'class-transformer';

import { CategoryStatus } from '../../../generated/prisma/enums.js';
import { SortDirection } from '../../../common/enums/sort-direction.enum.js';
import { AdminCategorySortField } from '../enums/category-sort-field.enum.js';

export const CATEGORY_ICON_NAMES = [
    'Aperture',
    'Award',
    'BadgePercent',
    'Banknote',
    'Bike',
    'BookOpen',
    'Bot',
    'Braces',
    'Brain',
    'BrainCircuit',
    'Briefcase',
    'BriefcaseBusiness',
    'Bug',
    'Building2',
    'Calculator',
    'CalendarDays',
    'Camera',
    'ChartBar',
    'ChartLine',
    'ChartNoAxesColumn',
    'ChartPie',
    'ChartScatter',
    'CircuitBoard',
    'Clapperboard',
    'ClipboardList',
    'Clock3',
    'Cloud',
    'Code2',
    'CodeXml',
    'Coins',
    'Compass',
    'Cpu',
    'CreditCard',
    'Database',
    'Dumbbell',
    'FileCode',
    'Film',
    'Fingerprint',
    'FlaskConical',
    'Focus',
    'Footprints',
    'GitBranch',
    'Globe',
    'GraduationCap',
    'Handshake',
    'HardDrive',
    'Headphones',
    'HeartPulse',
    'Image',
    'KeyRound',
    'Languages',
    'Laptop',
    'Layers',
    'LayoutTemplate',
    'Leaf',
    'Library',
    'Lightbulb',
    'ListChecks',
    'Lock',
    'Mail',
    'Megaphone',
    'MessageCircle',
    'MessagesSquare',
    'Mic',
    'Monitor',
    'MousePointerClick',
    'Music',
    'Network',
    'NotebookPen',
    'Paintbrush',
    'Palette',
    'PenLine',
    'PenTool',
    'Pencil',
    'Phone',
    'PiggyBank',
    'Presentation',
    'Puzzle',
    'Receipt',
    'Rocket',
    'Router',
    'Ruler',
    'ScanLine',
    'School',
    'Search',
    'Server',
    'Settings',
    'Shapes',
    'Shield',
    'ShieldCheck',
    'ShoppingCart',
    'Smartphone',
    'Sparkles',
    'Star',
    'Stethoscope',
    'Store',
    'SwatchBook',
    'Tags',
    'Target',
    'Terminal',
    'Timer',
    'TrendingUp',
    'Trophy',
    'Users',
    'Video',
    'Wallet',
    'WandSparkles',
    'Webhook',
    'Wifi',
    'Workflow',
    'Wrench',
    'code',
] as const;

@InputType()
export class AdminCategoriesFilterInput {
    @Field(() => String, { nullable: true })
    @IsOptional()
    @IsString()
    @MaxLength(100)
    search?: string;

    @Field(() => CategoryStatus, { nullable: true })
    @IsOptional()
    @IsEnum(CategoryStatus)
    status?: CategoryStatus;
}

@InputType()
export class AdminCategorySortInput {
    @Field(() => AdminCategorySortField, {
        defaultValue: AdminCategorySortField.CREATED_AT,
    })
    @IsEnum(AdminCategorySortField)
    field: AdminCategorySortField = AdminCategorySortField.CREATED_AT;

    @Field(() => SortDirection, { defaultValue: SortDirection.DESC })
    @IsEnum(SortDirection)
    direction: SortDirection = SortDirection.DESC;
}

@InputType()
export class AdminCreateCategoryInput {
    @Field(() => String)
    @Transform(({ value }: { value: unknown }) =>
        typeof value === 'string' ? value.trim() : value,
    )
    @IsString()
    @MinLength(2)
    @MaxLength(100)
    name!: string;

    @Field(() => String, { nullable: true })
    @IsOptional()
    @IsString()
    @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, {
        message: 'Slug must contain lowercase letters, numbers, and hyphens',
    })
    @MaxLength(120)
    slug?: string;

    @Field(() => String)
    @IsString()
    @MaxLength(1000)
    description!: string;

    @Field(() => String)
    @IsIn(CATEGORY_ICON_NAMES)
    iconName!: string;

    @Field(() => String)
    @Matches(/^#[0-9A-Fa-f]{6}$/, {
        message: 'iconColor must be a valid hex color',
    })
    iconColor!: string;

    @Field(() => String)
    @Matches(/^#[0-9A-Fa-f]{6}$/, {
        message: 'iconBackground must be a valid hex color',
    })
    iconBackground!: string;

    @Field(() => String, { nullable: true })
    @IsOptional()
    @IsString()
    @MaxLength(2048)
    imageUrl?: string;

    @Field(() => CategoryStatus, { nullable: true })
    @IsOptional()
    @IsEnum(CategoryStatus)
    status?: CategoryStatus;
}

@InputType()
export class AdminUpdateCategoryInput {
    @Field(() => ID)
    @IsUUID()
    id!: string;

    @Field(() => String, { nullable: true })
    @ValidateIf((_input, value: unknown) => value !== undefined)
    @Transform(({ value }: { value: unknown }) =>
        typeof value === 'string' ? value.trim() : value,
    )
    @IsString()
    @MinLength(2)
    @MaxLength(100)
    name?: string;

    @Field(() => String, { nullable: true })
    @ValidateIf((_input, value: unknown) => value !== undefined)
    @IsString()
    @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
    @MaxLength(120)
    slug?: string;

    @Field(() => String, { nullable: true })
    @ValidateIf((_input, value: unknown) => value !== undefined)
    @IsString()
    @MaxLength(1000)
    description?: string;

    @Field(() => String, { nullable: true })
    @ValidateIf((_input, value: unknown) => value !== undefined)
    @IsIn(CATEGORY_ICON_NAMES)
    iconName?: string;

    @Field(() => String, { nullable: true })
    @ValidateIf((_input, value: unknown) => value !== undefined)
    @Matches(/^#[0-9A-Fa-f]{6}$/)
    iconColor?: string;

    @Field(() => String, { nullable: true })
    @ValidateIf((_input, value: unknown) => value !== undefined)
    @Matches(/^#[0-9A-Fa-f]{6}$/)
    iconBackground?: string;

    @Field(() => String, { nullable: true })
    @ValidateIf((_input, value: unknown) => value !== undefined)
    @IsString()
    @MaxLength(2048)
    imageUrl?: string | null;

    @Field(() => CategoryStatus, { nullable: true })
    @ValidateIf((_input, value: unknown) => value !== undefined)
    @IsEnum(CategoryStatus)
    status?: CategoryStatus;
}

@InputType()
export class AdminUpdateCategoryStatusInput {
    @Field(() => ID)
    @IsUUID()
    id!: string;

    @Field(() => CategoryStatus)
    @IsEnum(CategoryStatus)
    status!: CategoryStatus;
}

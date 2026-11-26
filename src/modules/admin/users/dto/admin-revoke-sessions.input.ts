import { Field, ID, InputType } from '@nestjs/graphql';
import {
    IsOptional,
    IsUUID,
} from 'class-validator';

@InputType()
export class AdminRevokeSessionsInput {
    @Field(() => ID)
    @IsUUID()
    userId!: string;

    @Field(() => ID, { nullable: true })
    @IsOptional()
    @IsUUID()
    sessionId?: string;
}

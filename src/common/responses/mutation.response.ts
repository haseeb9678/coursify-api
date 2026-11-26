import { Field, ObjectType } from '@nestjs/graphql';

@ObjectType()
export class MutationResponse {
    @Field(() => Boolean)
    success!: boolean;

    @Field(() => String)
    message!: string;
}

export function createMutationResponse(
    message: string = 'Operation completed successfully',
): MutationResponse {
    return {
        success: true,
        message,
    };
}
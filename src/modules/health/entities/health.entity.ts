import { Field, Float, ObjectType } from '@nestjs/graphql';

@ObjectType()
export class Health {
    @Field()
    status!: string;

    @Field()
    application!: string;

    @Field()
    timestamp!: string;

    @Field(() => Float)
    uptime!: number;
}
import {
    Catch,
    Injectable,
    type ArgumentsHost,
} from '@nestjs/common';

import {
    BaseExceptionFilter,
    HttpAdapterHost,
} from '@nestjs/core';

import type { GqlContextType } from '@nestjs/graphql';

import { GraphqlExceptionFilter } from './graphql-exception.filter.js';

@Catch()
@Injectable()
export class GlobalExceptionFilter
    extends BaseExceptionFilter {
    private readonly graphqlFilter =
        new GraphqlExceptionFilter();

    constructor(adapterHost: HttpAdapterHost) {
        super(adapterHost.httpAdapter);
    }

    catch(exception: unknown, host: ArgumentsHost) {
        if (host.getType<GqlContextType>() === 'graphql') {
            return this.graphqlFilter.catch(
                exception,
                host,
            );
        }

        return super.catch(exception, host);
    }
}
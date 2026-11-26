import { Injectable } from '@nestjs/common';

import { getWelcomeTemplate } from './common/templates/welcome.template.js';

@Injectable()
export class AppService {
  getWelcomePage(): string {
    return getWelcomeTemplate();
  }
}
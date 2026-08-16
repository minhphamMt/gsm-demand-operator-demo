import { Module } from '@nestjs/common';

import { SupabaseModule } from '../supabase/supabase.module';
import { AiController } from './ai.controller';
import { AiService } from './ai.service';

@Module({ imports: [SupabaseModule], controllers: [AiController], providers: [AiService], exports: [AiService] })
export class AiModule {}

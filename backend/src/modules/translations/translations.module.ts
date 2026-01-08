import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TranslationsController } from './translations.controller';
import { TranslationService } from './services/translation.service';
import { GeminiTranslationService } from './services/gemini-translation.service';
import { TranslationRepository } from './repositories/translation.repository';
import { DatabaseModule } from '../../database/database.module';

@Module({
  imports: [ConfigModule, DatabaseModule],
  controllers: [TranslationsController],
  providers: [TranslationService, GeminiTranslationService, TranslationRepository],
  exports: [TranslationService, GeminiTranslationService],
})
export class TranslationsModule {}


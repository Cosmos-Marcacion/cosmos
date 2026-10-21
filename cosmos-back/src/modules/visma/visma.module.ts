import { Module } from '@nestjs/common'
import { HttpModule } from '@nestjs/axios'
import { VismaService } from './visma.service'
import { VismaController } from './visma.controller'

@Module({
  imports: [
    HttpModule.register({
      timeout: Number(process.env.VISMA_HTTP_TIMEOUT_MS ?? 15000),
      maxRedirects: 5,
    }),
  ],
  controllers: [VismaController],
  providers: [VismaService],
  exports: [VismaService],
})
export class VismaModule {}

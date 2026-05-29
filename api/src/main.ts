import { NestFactory } from '@nestjs/core'
import { ValidationPipe } from '@nestjs/common'
import { json, raw } from 'express'
import helmet from 'helmet'
import { AppModule } from './app.module'

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { rawBody: false })

  // PayMongo webhook needs the raw body for signature verification.
  // Mount raw body parser ONLY on the webhook route, JSON everywhere else.
  app.use('/payments/webhook', raw({ type: 'application/json' }))
  app.use(json({ limit: '1mb' }))

  app.use(helmet({ contentSecurityPolicy: false }))
  app.enableCors({
    origin: process.env.PUBLIC_URL?.split(',') ?? '*',
    credentials: true,
  })
  app.setGlobalPrefix('api')
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }))

  const port = Number(process.env.PORT ?? 4000)
  await app.listen(port)

  console.log(`API listening on :${port}`)
}
bootstrap()

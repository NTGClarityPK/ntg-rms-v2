import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import helmet from 'helmet';
import * as compression from 'compression';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  
  try {
    const app = await NestFactory.create(AppModule, {
      logger: ['error', 'warn', 'log', 'debug', 'verbose'],
    });

    const configService = app.get(ConfigService);
    const appConfig = configService.get('app');
    const port = appConfig.port;
    const frontendUrl = appConfig.frontendUrl;

    // CORS - Enable before everything
    app.enableCors(appConfig.cors);

    // Global prefix - MUST be before Swagger
    app.setGlobalPrefix(appConfig.apiPrefix);

    // ⭐ Swagger documentation - BEFORE HELMET
    const swaggerConfig = new DocumentBuilder()
      .setTitle('RMS API')
      .setDescription('Restaurant Management System API Documentation')
      .setVersion('1.0')
      .addServer(appConfig.servers.development, 'Local Development')
      .addServer(appConfig.servers.production, 'Production Server')
      .addServer(appConfig.servers.staging, 'Staging Server')
      .addBearerAuth(
        {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          name: 'JWT',
          description: 'Enter JWT token',
          in: 'header',
        },
        'JWT-auth',
      )
      .addTag('auth', 'Authentication endpoints')
      .addTag('restaurant', 'Restaurant management')
      .addTag('menu', 'Menu management')
      .addTag('orders', 'Order management')
      .addTag('inventory', 'Inventory management')
      .addTag('employees', 'Employee management')
      .addTag('customers', 'Customer management')
      .addTag('delivery', 'Delivery management')
      .addTag('reports', 'Reports and analytics')
      .addTag('settings', 'Settings management')
      .addTag('sync', 'Offline sync endpoints')
      .build();

    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('api/docs', app, document, {
      swaggerOptions: {
        persistAuthorization: true,
      },
    });

    // ⭐ Security - AFTER SWAGGER
    app.use(
      helmet({
        contentSecurityPolicy: {
          directives: {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            scriptSrc: ["'self'"],
            imgSrc: ["'self'", 'data:', 'https:'],
          },
        },
        crossOriginEmbedderPolicy: false,
      }),
    );

    // Compression - Disable for SSE
    app.use(
      compression({
        filter: (req, res) => {
          const accept = req.headers['accept'] || '';
          if (typeof accept === 'string' && accept.includes('text/event-stream')) {
            return false;
          }
          return compression.filter(req, res);
        },
      }),
    );

    // Global exception filter
    app.useGlobalFilters(new HttpExceptionFilter());

    // Global validation pipe
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        transformOptions: {
          enableImplicitConversion: true,
        },
      }),
    );

    // Start server
    await app.listen(port, '0.0.0.0', () => {
      logger.log(`🚀 Application is running on: http://0.0.0.0:${port}`);
      logger.log(`📚 API Documentation: http://0.0.0.0:${port}/api/docs`);
    });
  } catch (error) {
    logger.error('❌ Error starting the application:', error);
    process.exit(1);
  }
}

bootstrap();
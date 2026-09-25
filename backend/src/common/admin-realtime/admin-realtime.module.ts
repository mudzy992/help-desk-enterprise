import { Global, Module } from '@nestjs/common';
import { AdminConfigChangeInterceptor } from './admin-config-change.interceptor';
import { AdminConfigRealtimeHub } from './admin-config-realtime.hub';

/** Package 1.7 (R1–R2): global so any config controller can opt in. */
@Global()
@Module({
  providers: [AdminConfigRealtimeHub, AdminConfigChangeInterceptor],
  exports: [AdminConfigRealtimeHub, AdminConfigChangeInterceptor],
})
export class AdminRealtimeModule {}

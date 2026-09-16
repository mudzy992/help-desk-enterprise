import {
  Body,
  Controller,
  Headers,
  Post,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { AuthenticationService } from './authentication.service';
import type {
  AuthenticationLoginResponse,
  AuthenticationSessionResponse,
} from './authentication.types';
import { ChangePasswordDto } from './dto/change-password.dto';
import { EntraLoginDto } from './dto/entra-login.dto';
import { LocalLoginDto } from './dto/local-login.dto';
import { readBearerAccessTokenFromHeader } from './read-bearer-access-token';

@Controller('auth')
@UsePipes(
  new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  }),
)
export class AuthenticationController {
  constructor(private readonly authenticationService: AuthenticationService) {}

  @Post('login')
  login(@Body() body: LocalLoginDto): Promise<AuthenticationLoginResponse> {
    return this.authenticationService.loginWithPassword({
      email: body.email,
      password: body.password,
    });
  }

  @Post('entra')
  loginWithEntra(
    @Body() body: EntraLoginDto,
  ): Promise<AuthenticationSessionResponse> {
    return this.authenticationService.loginWithEntraIdToken(body.idToken);
  }

  @Post('change-password')
  changePassword(
    @Headers('authorization') authorization: string | undefined,
    @Body() body: ChangePasswordDto,
  ): Promise<AuthenticationSessionResponse> {
    const passwordChangeToken =
      readBearerAccessTokenFromHeader(authorization) ?? '';
    return this.authenticationService.changePasswordWithToken({
      passwordChangeToken,
      newPassword: body.newPassword,
    });
  }
}

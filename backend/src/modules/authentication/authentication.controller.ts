import { Body, Controller, Post, UsePipes, ValidationPipe } from '@nestjs/common';
import { AuthenticationService } from './authentication.service';
import type { AuthenticationSessionResponse } from './authentication.types';
import { EntraLoginDto } from './dto/entra-login.dto';
import { LocalLoginDto } from './dto/local-login.dto';

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
  login(@Body() body: LocalLoginDto): Promise<AuthenticationSessionResponse> {
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
}

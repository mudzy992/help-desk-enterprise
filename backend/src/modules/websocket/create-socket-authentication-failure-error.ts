import { SOCKET_AUTHENTICATION_FAILED_MESSAGE } from './socket-authentication-failed-message';

export function createSocketAuthenticationFailureError(): Error {
  const error = new Error(SOCKET_AUTHENTICATION_FAILED_MESSAGE);
  error.name = 'SocketAuthenticationError';
  return error;
}

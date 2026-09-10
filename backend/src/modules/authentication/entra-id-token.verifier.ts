export type NormalizedEntraIdentity = {
  readonly externalSubject: string;
  readonly email: string;
  readonly displayName: string;
  readonly tenantId: string;
};

export type EntraIdTokenVerificationInput = {
  readonly idToken: string;
  readonly configuration: {
    readonly tenantId: string;
    readonly clientId: string;
    readonly issuer: string;
    readonly jwksUrl: string;
  };
};

export interface EntraIdTokenVerifier {
  verify(
    input: EntraIdTokenVerificationInput,
  ): Promise<NormalizedEntraIdentity>;
}

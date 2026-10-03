import { BadRequestException, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { PrincipalContext } from '../../common/principal-context/principal-context.types';
import { PRINCIPAL_CONTEXT_REQUEST_KEY } from '../authentication/authenticated-request';
import { DocsAccessService } from './docs-access.service';
import { DocsContentRepository } from './docs-content.repository';
import { DocsController } from './docs.controller';
import { DocsService } from './docs.service';
import type { DocsManifest, DocsPageRecord } from './docs.types';

const roots: string[] = [];

const page = (slug: string, part: string, order: number, roles: string[], title: string): DocsPageRecord => ({
  slug,
  title,
  module: '—',
  part,
  audience: [],
  roles,
  order,
  tags: [],
  updatedAt: null,
  headings: [],
  wordCount: 5,
  source: `docs/user-guide/${slug}.md`,
});

function buildController(): DocsController {
  const root = mkdtempSync(path.join(tmpdir(), 'docs-controller-'));
  roots.push(root);
  const pages: { record: DocsPageRecord; body: string }[] = [
    { record: page('pocetak-rad', 'pocetak', 5, [], 'Početak rada'), body: '# Početak rada\n\nuvod.\n' },
    { record: page('instalacija', 'pocetak', 10, ['ADMIN', 'SUPER_ADMIN'], 'Instalacija'), body: '# Instalacija\n\nadmin.\n' },
    { record: page('tiketi', 'korisnik', 10, [], 'Tiketi'), body: '# Tiketi\n\ntiket i zahtjev.\n' },
  ];
  const manifest: DocsManifest = {
    parts: [
      { key: 'pocetak', order: 1, pages: ['pocetak-rad', 'instalacija'] },
      { key: 'korisnik', order: 2, pages: ['tiketi'] },
    ],
    pages: pages.map((entry) => entry.record),
  };
  writeFileSync(path.join(root, 'manifest.json'), JSON.stringify(manifest), 'utf8');
  for (const entry of pages) {
    writeFileSync(path.join(root, `${entry.record.slug}.md`), entry.body, 'utf8');
  }
  const repository = new DocsContentRepository(root);
  repository.onModuleInit();
  return new DocsController(new DocsService(repository, new DocsAccessService()));
}

function principal(roleKeys: string[], assignmentRoles: string[] = []): PrincipalContext {
  return {
    subjectId: 'user-1',
    email: 'user@example.com',
    displayName: 'Korisnik',
    isActive: true,
    isLocalOnly: true,
    mustChangePassword: false,
    entraObjectId: null,
    roleKeys,
    groupIds: [],
    homeOrganizationalUnitId: null,
    assignments: assignmentRoles.map((roleKey) => ({
      roleKey,
      permissionKeys: [],
      organizationalUnitId: null,
      organizationalUnitPath: null,
      serviceId: null,
    })),
    authzVersion: 1,
  };
}

function requestWith(context: PrincipalContext | null) {
  return { headers: {}, [PRINCIPAL_CONTEXT_REQUEST_KEY]: context ?? undefined };
}

afterAll(() => {
  for (const root of roots) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe('DocsController (Faza 3, korak b)', () => {
  const controller = buildController();

  it('navigacija koristi role iz sesije, uključujući role iz dodjela', async () => {
    const asUser = await controller.navigation(requestWith(principal(['USER'])));
    expect(asUser.parts.flatMap((part) => part.pages.map((entry) => entry.slug))).toEqual([
      'pocetak-rad',
      'tiketi',
    ]);

    const asAdmin = await controller.navigation(
      requestWith(principal(['USER'], ['ADMIN'])),
    );
    expect(asAdmin.parts[0].pages.map((entry) => entry.slug)).toEqual([
      'pocetak-rad',
      'instalacija',
    ]);

    const anonymous = await controller.navigation(requestWith(null));
    expect(anonymous.parts.flatMap((part) => part.pages.map((entry) => entry.slug))).toEqual([
      'pocetak-rad',
      'tiketi',
    ]);
  });

  it('nepoznat i nedozvoljen slug mapiraju se u 404', async () => {
    await expect(controller.page('nepoznato', requestWith(principal(['ADMIN'])))).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await expect(controller.page('instalacija', requestWith(principal(['USER'])))).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('pretraga validira upit i prima limit iz query stringa', async () => {
    const found = await controller.search('tiket', '5', requestWith(principal(['USER'])));
    expect(found.results.map((entry) => entry.slug)).toEqual(['tiketi']);

    await expect(controller.search('a', undefined, requestWith(principal(['USER'])))).rejects.toBeInstanceOf(
      BadRequestException,
    );
    // Neispravan limit ne ruši zahtjev — koristi se podrazumijevani.
    const fallback = await controller.search('tiket', 'nije-broj', requestWith(principal(['USER'])));
    expect(fallback.results).toHaveLength(1);
  });

  it('bez sadržaja ruta vraća 503', async () => {
    const empty = new DocsController(
      new DocsService(
        new DocsContentRepository(path.join(tmpdir(), 'docs-controller-missing')),
        new DocsAccessService(),
      ),
    );
    await expect(empty.navigation(requestWith(principal(['ADMIN'])))).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });
});

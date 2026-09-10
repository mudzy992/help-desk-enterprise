# MATRIX — service-forms-versioning

## Cilj
Schema-driven forme na postojećem Service Catalog-u. Servis referencira formu kroz verzije; nema hardkodovanih polja po servisu. Tiket čuva tačan `formVersionRef` i nikad ne resolva “current/latest” formu za historiju.

## Model
| Entitet | Uloga |
|---|---|
| `FormVersion` | Verzionirani form model za `Service`. `id` je `formVersionRef`. |
| `FormVersion.version` | Monotoni integer po servisu (`@@unique(serviceId, version)`). |
| `FormVersion.schema` | Provider-neutral JSON schema (nije frontend/backend field map). |
| `FormVersion.status` | `DRAFT` → `ACTIVE` → `RETIRED`. |
| `Ticket.formVersionId` | Persistirani `formVersionRef`. FK na `FormVersion.id`. |

Create form = prva verzija (`version = 1`). Nova izmjena = nova verzija, ne mutacija korištene.

## Schema
```
{
  schemaVersion: 1,
  fields: [
    {
      id,          // ^[a-z][a-z0-9_]{0,63}$
      label,
      type,        // text|textarea|number|boolean|select|multiselect|date|datetime|email
      required,
      order,       // unique non-negative integer
      validation?, // type-specific
      config?      // placeholder, helpText
    }
  ]
}
```

Validacija: malformed schema, nepoznat `schemaVersion`, invalid/duplicate `id`, duplicate `order`, select/multiselect bez `options`, min>max, type-mismatched validation.

## Immutability
Verzija je immutable ako `status !== DRAFT` **ili** postoji tiket sa tim `formVersionRef`. Update schema je dozvoljen samo na neiskorištenom DRAFT-u. Aktivacija nove verzije (`allowMultipleActiveVersions=false`) RETIRE-uje ostale ACTIVE; stari tiketi ostaju na svom ref-u.

## Ticket `formVersionRef`
- Novi tiket bira najnoviji ACTIVE u trenutku bind-a, pa **upisuje taj id**.
- Prikaz/obrada historijskog tiketa ide isključivo `Ticket.formVersionId` → `FormVersion`. Nema fallback na latest.

## Settings
| Key | Default |
|---|---|
| `private.ticket.forms.enabled` | `true` |
| `private.ticket.forms.requireStructuredFields` | `true` |
| `private.ticket.forms.versioning.enabled` | `true` |
| `private.ticket.forms.versioning.allowMultipleActiveVersions` | `false` |
| `private.ticket.forms.versioning.requireVersionOnTicket` | `true` |

## Authorization
Postojeći `SessionAuthenticationGuard` + `RoleGuard` + `ADMIN`. Write: `service.forms.write` + `RequireServiceScope({ field: 'serviceId' })`. Nije drugi RBAC. Read-only modul: `service_forms` za `/services/:serviceId/form*`.

## API
| Method | Path |
|---|---|
| POST | `/services/:serviceId/form` |
| GET | `/services/:serviceId/form` |
| POST | `/services/:serviceId/form/versions` |
| GET | `/services/:serviceId/form/versions/:formVersionRef` |
| PATCH | `/services/:serviceId/form/versions/:formVersionRef` |
| POST | `/services/:serviceId/form/versions/:formVersionRef/activate` |

## Namjerno NIJE
Service onboarding wizard, routing, SLA, approvals, availability izmjene, full ticket CRUD/workspace, frontend form-builder/ticket UI, config versioning/change-log sistem.

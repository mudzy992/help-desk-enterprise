# MATRIX — ticket-saved-views

## Cilj
Per-user saved views (filteri, sort, kolone, opcionalni default). Ne utiču na OU/group guardove liste. Sharing je isključen u MVP-u.

## Settings
`private.addons.savedViews` + `private.ticket.savedViews.enabled` (default true). `maxPerUser` 20. `allowDefaultView` true. `allowSharing` uvijek false.

## API
`GET/POST /tickets/saved-views`, `PATCH/DELETE /tickets/saved-views/:savedViewId`. Role: AGENT/ADMIN/SUPER_ADMIN.

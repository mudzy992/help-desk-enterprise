# CHECKLIST — tickets-ui-alignment

## F1
- [x] Sloj 0 plan folder
- [x] Sloj 1 nazivi u odgovoru (BE + FE tipovi, `DOWN` + i18n)
- [x] Sloj 2 atomičan claim (matrica + CHANGELOG)
- [x] Sloj 3 lista (DTO, builder, predikat u `where`-u, envelope, sort, export na builder, FE `listTicketsPage`)
- [ ] Sloj 3b `int.spec.ts` nad Postgresom (paritet vidljivosti, istovremeni claim, EXPLAIN + broj upita)
- [ ] Migracija FE potrošača liste (po slojevima 4, F3, F6)
- [x] Sloj 4 counts (BE endpoint, inbox predikat, FE klijent, sidebar značke)
- [x] Sloj 5 inbox (paginacija, sort SLA, `groupId`) + `/groups/mine`
- [x] Sloj 5b `Group.autoAssignStrategy` (spojeno u 5) — migracija `20260921120000_group_auto_assign_strategy` uključena, primjenjuje se sa `prisma migrate deploy`
- [x] Sloj 6 routing preview, `approvalSteps`, realtime (payload provjeren, već ispravan)

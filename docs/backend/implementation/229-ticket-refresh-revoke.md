# Ticket realtime — parțial: opoziv la REST refresh

**Status:** implementare parțială, nu închide ticket revoke/join din [planul 228](228-websocket-follow-up-plan.md).

Testele noi au reprodus înainte de corecție că un refresh silent cu 403/404 lăsa biletul și mesajele afișate, iar o eroare 500 nu arăta eroare. `loadTicketDetail` șterge acum biletul, mesajele, participanții și panourile la 403/404 și expune eroarea; la erori tranzitorii păstrează datele și expune eroarea de acțiune. Schimbarea nu dovedește că un refresh se declanșează imediat la orice revoke: backend-ul continuă să fie responsabil de autorizare și eliminarea din camere.

Guard-ul de generație împiedică răspunsuri ale unui load mai vechi să rescrie rezultatul unui load mai nou, inclusiv după schimbarea ticket ID sau unmount. Un panel întârziat nu reapare după un 403/404 primit la citirea conversației. Testele acoperă 403/404, 500, răspuns mai vechi după revoke și panel întârziat. Testele sunt unitare, cu API mock; nu reprezintă browser/Redis acceptance. Pot exista alte acțiuni asincrone și componente stateful care necesită verificare separată.

**Încă neimplementat:** confirmarea socket join (ack + timeout/refuz), read-after-join, reconcilierea eventelor în timpul snapshotului și dovezile browser/cross-instance. Nu se afirmă replay sau eliminarea completă a tuturor curselor. Fără migrație, deploy sau rulare manuală full E2E.

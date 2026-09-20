# EP-HelpDesk Edge Extension — Professional UI

This package is scoped to `edge-extension/`.

## Included
- Enterprise/light-only popup UI
- Bosnian/English localization with automatic browser-language detection
- Human-readable notifications; UUIDs are never shown to users
- Toolbar badge for unread notifications
- Persistent notification/event state across MV3 service-worker restarts
- MV3-safe `chrome.alarms` polling fallback
- `connect_error` polling fallback
- Persistent event → ticket mapping
- Quick Assist remains an explicit user action and only opens Microsoft's `ms-quick-assist:` protocol
- Existing HelpDesk chat/ticket API contract retained

## Install
1. `cd edge-extension`
2. `npm install`
3. `npm run typecheck`
4. `npm run build`
5. Open `edge://extensions` or `edge://extensions/` in Microsoft Edge.
6. Enable **Developer mode**.
7. Select **Load unpacked** and choose `edge-extension/dist`.

## Notes
The extension does not generate or bypass Microsoft's Quick Assist security code. HelpDesk coordinates the request; Microsoft Quick Assist remains the remote-session security boundary.

## Verifying Changes & Debugging
- Write and run tests incrementally for business logic using `bun run test`.
- You can use the playwright MCP to debug and verify UI changes and general app behavior.
- Delegate to the user to run the app locally and authenticate.
- The app will likely run on `localhost:3000/app`
- When asked to navigate to "the app" with Playwright, go to `/app/component/unified-list` to avoid the signup flow.
- **Before navigating with Playwright**, authenticate through the local UI or generate an access token with `bun scripts/generate-access-token.ts`. Never navigate without authentication set up.
- You can use `console.trace` to debug state and changes in the ui and logic.
- When building out UI features, use playwright to verify UI behavior.
- Use the `bun run test` command to use the vitest test runner. For example, `bun run test -- src/lib/core/tests/date.test.ts -c src/lib/core`

### Playwright Authentication
The browser client uses cookie-based authentication (`credentials: 'include'`) by default. The local Playwright harness enables bearer-token auth; for ad-hoc debugging, intercept only the configured operator requests and add an Authorization header.

**Steps to authenticate in Playwright:**
1. Run `bun scripts/generate-access-token.ts` to get an access token. It requires `REFRESH_TOKEN` and uses the documented local FusionAuth service at `http://localhost:9011` by default. For a non-local operator, set `FUSIONAUTH_DOMAIN` to that operator's FusionAuth origin explicitly:
   ```sh
   FUSIONAUTH_DOMAIN=https://auth.conation.example bun scripts/generate-access-token.ts
   ```
   Only use an origin controlled by the Conation operator; the script rejects retired managed Macro hosts before sending a refresh token.
2. Use `browser_run_code` to set up request interception **before** navigating:
   ```javascript
   async (page) => {
     const token = "YOUR_ACCESS_TOKEN_HERE";
     // The documented local standalone stack exposes the API proxy here.
     // For another deployment, use its explicit VITE_CONATION_OPERATOR_ORIGIN.
     const operatorOrigin = 'http://localhost:8090';
     await page.route(`${operatorOrigin}/**`, async (route) => {
       const headers = {
         ...route.request().headers(),
         'Authorization': `Bearer ${token}`
       };
       await route.continue({ headers });
     });
   }
   ```
3. Navigate to `http://localhost:3000/app/component/unified-list` - you will likely be redirected to `/app/signup` initially
4. **Force navigate again** to `http://localhost:3000/app/component/unified-list` using `browser_run_code`:
   ```javascript
   async (page) => {
     await page.goto('http://localhost:3000/app/component/unified-list', { waitUntil: 'domcontentloaded' });
     return page.url();
   }
   ```
   This second navigation will work because the route interception is now active and auth requests succeed.

**Why this is needed:** Standalone Conation checks authentication through the operator origin selected by `VITE_CONATION_OPERATOR_ORIGIN` (the local stack uses `http://localhost:8090`). Without valid cookies or an auth header, `useIsAuthenticated()` returns false and the `Soup` component redirects to `/` → `/signup`. The initial redirect can occur before the authenticated request completes, so forcing a second navigation resolves this.

**Note:** WebSocket connections (for real-time features) won't be authenticated with this approach since Playwright's route interception only works for HTTP/HTTPS. This is fine for most UI testing scenarios.

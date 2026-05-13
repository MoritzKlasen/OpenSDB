## frontend/src/pages/AnalyticsPage.jsx
The immediately-invoked function expression (IIFE) that calculates 'Users This Month' runs on every render. Consider moving this calculation to a useMemo hook to avoid unnecessary recomputation when userGrowthData hasn't changed. -- Line 243

The ternary expression returns 0 when data is empty but Math.max(1, ...) otherwise, which means the minimum non-zero interval is 1. Consider using a consistent minimum value or extracting this logic into a named function for better readability. -- Line 316

## frontend/src/pages/SettingsPage.jsx
onKeyPress is deprecated in React. Use onKeyDown instead for keyboard event handling to follow current React best practices and ensure future compatibility. -- Line 703

onKeyPress is deprecated in React. Use onKeyDown instead for keyboard event handling to follow current React best practices and ensure future compatibility. -- Line 750

## src/admin-server.js
The CSRF protection only checks for the presence of x-requested-with header but doesn't validate its value. While the presence alone provides some protection, consider validating that the header value matches an expected value (e.g., 'XMLHttpRequest') for stronger CSRF defense. -- Line 93

The rate limiter is applied twice to the /api/metrics/users-per-day endpoint - once globally via app.use(createApiLimiter()) on line 82 and again specifically on line 314. This creates a double rate limit that may be stricter than intended and could unnecessarily block legitimate requests. -- Line 314

The code handles SUPPORTED_LANGUAGES as either an array or an iterable, but this runtime type checking suggests uncertainty about the data structure. Consider enforcing a consistent type for SUPPORTED_LANGUAGES at its source to avoid this defensive programming pattern. -- Line 795

Multiple similar conditional updates for API keys (lines 906, 921, 934) follow the same pattern. Consider extracting this into a helper function to reduce code duplication and make the update logic more maintainable. -- Line 906

## src/commands/antiscam.js
The .setDefaultMemberPermissions(PermissionFlagsBits.Administrator) line was removed from the command builder. This means any user can now execute /antiscam commands, which should be restricted to administrators only. This is a security issue that allows unauthorized users to modify critical anti-scam settings. -- Line 24

## src/database/connect.js
The exponential backoff calculation uses magic numbers. Consider extracting 2000 (base delay) and 10000 (max delay) as named constants at the module level to improve code readability and make these values easier to adjust. -- Line 13

## src/events/handleAntiScam.js
The 500-character limit for message content is duplicated in multiple places (here and in the comment validation on admin-server.js line 483). Consider defining this as a shared constant to ensure consistency across the codebase. -- Line 464

## src/utlis/websocket.js
Origin validation filters out wildcard '*' but doesn't validate that origins are well-formed URLs. Consider adding validation to ensure origins match the expected format (e.g., protocol + domain) to prevent potential bypass attacks with malformed origin headers. -- Line 21
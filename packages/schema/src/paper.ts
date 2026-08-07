/**
 * The paper stock a capture arrives on.
 *
 * The type lives here rather than with the geometry so that an app can declare
 * what it prints on without importing the platform's crop code — the sizes and
 * the crop maths stay in `@atrium/kiosk`, which is the only place that knows
 * about cameras.
 */
export type PaperId = 'letter' | 'halfLetter'

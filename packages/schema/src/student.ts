/**
 * nameZh is optional: the BHCS roster carries first/last name only today.
 * grade is null far more often than not — admins type it free-form and most
 * rows leave it blank — so it seeds a first worksheet's difficulty and nothing
 * may depend on its presence.
 */
export type Student = { id: string; name: string; nameZh?: string; grade?: number | null }
